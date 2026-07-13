import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../../application/auth-service.js';
import { DecisionOrchestrator } from '../../application/decision-orchestrator.js';
import type { PublishedDecision } from '../../domain/decisions.js';
import type { MarketDataStore } from '../../domain/market.js';

const querySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']).default('5m'),
  as_of: z.string().datetime(),
});

export function registerDecisionRoutes(
  app: FastifyInstance,
  auth: AuthService,
  market: MarketDataStore,
): void {
  const decisions = new DecisionOrchestrator(market);
  app.get('/api/v1/decisions/latest', async (request, reply) => {
    const workspaceId = await authenticate(auth, request, reply);
    if (!workspaceId) return;
    const query = querySchema.parse(request.query);
    const instrument = await market.findInstrumentById(query.instrument_id);
    if (!instrument) return reply.code(404).send({ error: 'instrument_not_found' });
    const asOf = new Date(query.as_of);
    const bars = await market.listBars({
      instrumentId: query.instrument_id,
      timeframe: query.timeframe,
      asOf,
      limit: 200,
    });
    if (bars.length === 0) return reply.code(404).send({ error: 'market_data_not_found' });
    const latest = bars.at(-1)!;
    const previous = bars.at(-2) ?? latest;
    const direction = latest.close >= previous.close ? 'long' : 'short';
    const range = Math.max(latest.high - latest.low, latest.close * 0.001);
    const entry = latest.close;
    const decision = await decisions.evaluate({
      instrumentId: query.instrument_id,
      timeframe: query.timeframe,
      asOf,
      setup: {
        id: `dashboard-momentum-${query.timeframe}`,
        direction,
        valid: bars.length >= 3 && latest.close !== previous.close,
        structure: 'breakout',
        reasons: [
          bars.length >= 3
            ? `Latest close ${latest.close} is compared only with prior closed bars.`
            : `Only ${bars.length} bars are available; three are required for this setup.`,
        ],
      },
      riskTarget: {
        entry,
        entryZoneLow: entry - range * 0.1,
        entryZoneHigh: entry + range * 0.1,
        stop: direction === 'long' ? entry - range : entry + range,
        targets: [
          {
            label: 'target_1',
            price: direction === 'long' ? entry + range * 2 : entry - range * 2,
            rewardToRisk: 2,
          },
        ],
        rewardToRisk: 2,
        riskR: 1,
      },
      confidence: {
        value: 0.6,
        sampleSize: bars.length,
        calibrationError: 0.05,
      },
    });
    return reply.send({
      workspace_id: workspaceId,
      decision: serializeDecision(decision),
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

function serializeDecision(decision: PublishedDecision) {
  return {
    id: decision.id,
    version: decision.version,
    instrument_id: decision.instrumentId,
    timeframe: decision.timeframe,
    evaluated_at: decision.evaluatedAt.toISOString(),
    direction: decision.direction,
    score: decision.score,
    confidence: decision.confidence,
    entry_zone: decision.entryZone,
    stop: decision.stop,
    targets: decision.targets,
    risk_r: decision.riskR,
    reward_to_risk: decision.rewardToRisk,
    vetoes: decision.vetoes,
    reasons: decision.reasons,
    gates: decision.gates,
    policy_version: decision.policyVersion,
    policy_hash: decision.policyHash,
  };
}
