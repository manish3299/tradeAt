import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../../application/auth-service.js';
import {
  PaperTradingError,
  type PaperTradingService,
} from '../../application/paper-trading-service.js';

const id = z.string().uuid();
const accountParams = z.object({ accountId: id });
const orderParams = z.object({ accountId: id, orderId: id });
const tradeParams = z.object({ accountId: id, tradeId: id });
const createAccount = z.object({
  name: z.string().min(1).max(100).default('Paper account'),
  starting_balance: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).default('USD'),
  idempotency_key: z.string().min(1).max(100),
});
const createOrder = z.object({
  idempotency_key: z.string().min(1).max(100),
  instrument_id: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit', 'stop', 'stop_limit']),
  quantity: z.number().positive(),
  limit_price: z.number().positive().optional(),
  stop_price: z.number().positive().optional(),
  reference_price: z.number().positive(),
  initial_risk_per_unit: z.number().positive().optional(),
  confirmed: z.literal(true),
});
const processBar = z.object({
  instrument_id: z.string().min(1),
  open_time: z.string().datetime(),
  close_time: z.string().datetime(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
});
const updateJournal = z.object({
  notes: z.string().max(5000).default(''),
  tags: z.array(z.string().max(50)).max(20).default([]),
  mae_r: z.number().nonnegative().optional(),
  mfe_r: z.number().nonnegative().optional(),
});

export function registerPaperRoutes(
  app: FastifyInstance,
  auth: AuthService,
  paper: PaperTradingService,
): void {
  app.post('/api/v1/paper/accounts', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const body = createAccount.parse(request.body);
    return handle(reply, async () =>
      reply.code(201).send({
        account: await paper.createAccount(workspaceId, {
          name: body.name,
          startingBalance: body.starting_balance,
          currency: body.currency,
          idempotencyKey: body.idempotency_key,
        }),
      }),
    );
  });
  app.get('/api/v1/paper/accounts', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    return reply.send({ origin: 'paper', accounts: await paper.listAccounts(workspaceId) });
  });
  app.post('/api/v1/paper/accounts/:accountId/orders', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId } = accountParams.parse(request.params);
    const body = createOrder.parse(request.body);
    return handle(reply, async () =>
      reply.code(201).send({
        order: await paper.placeOrder(workspaceId, accountId, {
          idempotencyKey: body.idempotency_key,
          instrumentId: body.instrument_id,
          side: body.side,
          type: body.type,
          quantity: body.quantity,
          referencePrice: body.reference_price,
          confirmed: body.confirmed,
          ...(body.limit_price !== undefined ? { limitPrice: body.limit_price } : {}),
          ...(body.stop_price !== undefined ? { stopPrice: body.stop_price } : {}),
          ...(body.initial_risk_per_unit !== undefined
            ? { initialRiskPerUnit: body.initial_risk_per_unit }
            : {}),
        }),
      }),
    );
  });
  app.post('/api/v1/paper/accounts/:accountId/orders/:orderId/cancel', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId, orderId } = orderParams.parse(request.params);
    return handle(reply, async () =>
      reply.send({ order: await paper.cancelOrder(workspaceId, accountId, orderId) }),
    );
  });
  app.post('/api/v1/paper/accounts/:accountId/process-bar', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId } = accountParams.parse(request.params);
    const body = processBar.parse(request.body);
    return handle(reply, async () =>
      reply.send({
        origin: 'paper',
        fills: await paper.processBar(workspaceId, accountId, {
          instrumentId: body.instrument_id,
          openTime: new Date(body.open_time),
          closeTime: new Date(body.close_time),
          open: body.open,
          high: body.high,
          low: body.low,
          close: body.close,
          volume: body.volume,
        }),
      }),
    );
  });
  app.get('/api/v1/paper/accounts/:accountId', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId } = accountParams.parse(request.params);
    return handle(reply, async () =>
      reply.send({ origin: 'paper', snapshot: await paper.snapshot(workspaceId, accountId) }),
    );
  });
  app.get('/api/v1/paper/accounts/:accountId/statistics', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId } = accountParams.parse(request.params);
    return handle(reply, async () =>
      reply.send({ statistics: await paper.statistics(workspaceId, accountId) }),
    );
  });
  app.patch('/api/v1/paper/accounts/:accountId/journal/:tradeId', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId, tradeId } = tradeParams.parse(request.params);
    const body = updateJournal.parse(request.body);
    return handle(reply, async () =>
      reply.send({
        trade: await paper.updateJournal(workspaceId, accountId, tradeId, {
          notes: body.notes,
          tags: body.tags,
          ...(body.mae_r !== undefined ? { maeR: body.mae_r } : {}),
          ...(body.mfe_r !== undefined ? { mfeR: body.mfe_r } : {}),
        }),
      }),
    );
  });
  app.post('/api/v1/paper/accounts/:accountId/reset', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const { accountId } = accountParams.parse(request.params);
    return handle(reply, async () =>
      reply.send({ account: await paper.resetAccount(workspaceId, accountId) }),
    );
  });
}

async function authenticate(
  auth: AuthService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | undefined> {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    void reply.code(401).send({ error: 'missing_bearer_token' });
    return;
  }
  const principal = await auth.authenticate(token);
  if (!principal) {
    void reply.code(401).send({ error: 'invalid_token' });
    return;
  }
  return principal.workspace.id;
}
async function handle(reply: FastifyReply, operation: () => Promise<unknown>): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PaperTradingError)
      return reply.code(error.statusCode).send({ error: error.code });
    throw error;
  }
}
