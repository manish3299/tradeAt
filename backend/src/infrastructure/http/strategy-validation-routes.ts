import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../../application/auth-service.js';
import type { StrategyValidationService } from '../../application/strategy-validation-service.js';
const metrics = z.object({
  sampleSize: z.number().int().nonnegative(),
  expectancyR: z.number(),
  brierScore: z.number().min(0).max(1),
  maximumDrawdownPercent: z.number().nonnegative(),
  regimeExpectancy: z.record(z.string(), z.number()),
});
const registry = z.object({
  kind: z.enum(['configuration', 'dataset']),
  name: z.string().min(1),
  version: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
const arm = z.object({ configurationId: z.string().uuid(), datasetId: z.string().uuid(), metrics });
const compare = z.object({
  baseline: arm,
  candidate: arm,
  minimumSamples: z.number().int().positive(),
  minimumExpectancyLift: z.number(),
  maximumBrier: z.number().min(0).max(1),
  maximumDrawdownIncrease: z.number().nonnegative(),
  minimumRegimeExpectancy: z.number(),
});
export function registerStrategyValidationRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: StrategyValidationService,
): void {
  app.get('/api/v1/strategy/registry', async (request, reply) => {
    const id = await workspace(auth, request, reply);
    if (!id) return;
    return { entries: service.list(id) };
  });
  app.post('/api/v1/strategy/registry', async (request, reply) => {
    const id = await workspace(auth, request, reply);
    if (!id) return;
    try {
      return reply.code(201).send({ entry: service.register(id, registry.parse(request.body)) });
    } catch (error) {
      return reply
        .code(409)
        .send({ error: error instanceof Error ? error.message : 'registry_failed' });
    }
  });
  app.post('/api/v1/strategy/comparisons', async (request, reply) => {
    const id = await workspace(auth, request, reply);
    if (!id) return;
    try {
      return reply.code(201).send({ comparison: service.compare(id, compare.parse(request.body)) });
    } catch (error) {
      return reply
        .code(409)
        .send({ error: error instanceof Error ? error.message : 'comparison_failed' });
    }
  });
  app.post('/api/v1/strategy/drift', async (request, reply) => {
    const id = await workspace(auth, request, reply);
    if (!id) return;
    const body = z.object({ reference: metrics, recent: metrics }).parse(request.body);
    return { monitor: service.monitor(id, body.reference, body.recent) };
  });
}
async function workspace(
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
