import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../../application/auth-service.js';
import type { HistoricalMemoryService } from '../../application/historical-memory-service.js';
import type { MarketDataStore } from '../../domain/market.js';

const querySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']).default('5m'),
  as_of: z.string().datetime(),
  decision_score: z.coerce.number().min(-1).max(1).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  session: z.string().optional(),
  regime: z.string().optional(),
});
export function registerHistoricalMemoryRoutes(
  app: FastifyInstance,
  auth: AuthService,
  market: MarketDataStore,
  memory: HistoricalMemoryService,
): void {
  app.get('/api/v1/historical-memory/similar', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const query = querySchema.parse(request.query);
    const asOf = new Date(query.as_of);
    const bars = await market.listBars({
      instrumentId: query.instrument_id,
      timeframe: query.timeframe,
      asOf,
      limit: 200,
    });
    if (!bars.length) return reply.code(404).send({ error: 'market_data_not_found' });
    const latest = bars.at(-1)!;
    const previous = bars.at(-2) ?? latest;
    const averageVolume =
      bars.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) /
      Math.max(1, bars.slice(-20).length);
    const result = await memory.similar(workspaceId, {
      asOf,
      observedAt: asOf,
      instrumentId: query.instrument_id,
      ...(query.session ? { session: query.session } : {}),
      ...(query.regime ? { regime: query.regime } : {}),
      limit: query.limit,
      features: {
        momentumPct: previous.close ? latest.close / previous.close - 1 : 0,
        rangePct: latest.close ? (latest.high - latest.low) / latest.close : 0,
        volumeRatio: averageVolume ? latest.volume / averageVolume : 1,
        decisionScore: query.decision_score,
      },
      versions: {
        feature: 'memory-features-v1',
        regime: '1.0.0',
        decision: '1.0.0',
        policy: '1.0.0',
      },
    });
    return reply.send({
      definition_version: result.definitionVersion,
      cohort: result.cohort,
      matches: result.matches.map((match) => ({
        distance: match.distance,
        contributions: match.contributions,
        snapshot: {
          id: match.snapshot.id,
          observed_at: match.snapshot.observedAt.toISOString(),
          available_at: match.snapshot.availableAt.toISOString(),
          instrument_id: match.snapshot.instrumentId,
          setup_id: match.snapshot.setupId,
          session: match.snapshot.session,
          regime: match.snapshot.regime,
          direction: match.snapshot.direction,
          outcome: match.snapshot.outcome,
          versions: match.snapshot.versions,
          provenance: match.snapshot.provenance,
        },
      })),
    });
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
