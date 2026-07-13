import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReplayRunError } from '../../application/replay-run-service.js';
import type { ReplayRunService } from '../../application/replay-run-service.js';
import type { StatisticsMetrics } from '../../application/statistics-service.js';
import type { AuthService } from '../../application/auth-service.js';
import type { ReplayRunView } from '../../application/replay-run-service.js';

const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '1d']);
const createReplaySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: timeframeSchema.default('5m'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  training_bars: z.number().int().min(2).max(1_000).default(2),
  evaluation_bars: z.number().int().min(1).max(1_000).default(20),
  minimum_samples: z.number().int().min(1).max(10_000).default(30),
  starting_equity: z.number().positive().max(1_000_000_000).default(100_000),
});
const replayIdSchema = z.object({ id: z.string().uuid() });
const statisticsQuerySchema = z.object({ replay_id: z.string().uuid() });
const controlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('step') }),
  z.object({ action: z.literal('seek'), seek_to: z.string().datetime() }),
  z.object({ action: z.literal('set_speed'), speed: z.number().positive().max(1_000) }),
]);

export function registerReplayRoutes(
  app: FastifyInstance,
  auth: AuthService,
  replays: ReplayRunService,
): void {
  app.post('/api/v1/replays', async (request, reply) => {
    const workspaceId = await authenticateWorkspace(auth, request, reply);
    if (!workspaceId) return;
    const body = createReplaySchema.parse(request.body);
    try {
      const run = await replays.create(workspaceId, {
        instrumentId: body.instrument_id,
        timeframe: body.timeframe,
        ...(body.from ? { from: new Date(body.from) } : {}),
        ...(body.to ? { to: new Date(body.to) } : {}),
        trainingBars: body.training_bars,
        evaluationBars: body.evaluation_bars,
        minimumSamples: body.minimum_samples,
        startingEquity: body.starting_equity,
      });
      return reply.code(201).send({ replay: serializeReplay(run) });
    } catch (error) {
      return sendReplayError(error, reply);
    }
  });

  app.post('/api/v1/replays/:id/control', async (request, reply) => {
    const workspaceId = await authenticateWorkspace(auth, request, reply);
    if (!workspaceId) return;
    const { id } = replayIdSchema.parse(request.params);
    const body = controlSchema.parse(request.body);
    try {
      const run = await replays.control(workspaceId, id, {
        action: body.action,
        ...(body.action === 'seek' ? { seekTo: new Date(body.seek_to) } : {}),
        ...(body.action === 'set_speed' ? { speed: body.speed } : {}),
      });
      return reply.code(200).send({ replay: serializeReplay(run) });
    } catch (error) {
      return sendReplayError(error, reply);
    }
  });

  app.get('/api/v1/replays/:id', async (request, reply) => {
    const workspaceId = await authenticateWorkspace(auth, request, reply);
    if (!workspaceId) return;
    const { id } = replayIdSchema.parse(request.params);
    try {
      return reply.code(200).send({ replay: serializeReplay(replays.get(workspaceId, id)) });
    } catch (error) {
      return sendReplayError(error, reply);
    }
  });

  app.get('/api/v1/statistics', async (request, reply) => {
    const workspaceId = await authenticateWorkspace(auth, request, reply);
    if (!workspaceId) return;
    const { replay_id: replayId } = statisticsQuerySchema.parse(request.query);
    try {
      const report = replays.statistics(workspaceId, replayId);
      return reply.code(200).send({ statistics: serializeStatistics(report) });
    } catch (error) {
      return sendReplayError(error, reply);
    }
  });
}

async function authenticateWorkspace(
  auth: AuthService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | undefined> {
  const header = request.headers.authorization;
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    void reply.code(401).send({ error: 'missing_bearer_token' });
    return undefined;
  }
  const principal = await auth.authenticate(token);
  if (!principal) {
    void reply.code(401).send({ error: 'invalid_token' });
    return undefined;
  }
  return principal.workspace.id;
}

function serializeReplay(run: ReplayRunView) {
  return {
    id: run.id,
    instrument_id: run.instrumentId,
    timeframe: run.timeframe,
    created_at: run.createdAt.toISOString(),
    identity_hash: run.identityHash,
    status: run.state.status,
    cursor: run.state.cursor,
    event_count: run.state.eventCount,
    replay_time: run.state.replayTime.toISOString(),
    speed: run.state.speed,
    ...(run.result
      ? {
          result: {
            decision_count: run.result.decisions.length,
            outcome_count: run.result.outcomes.length,
            baselines: run.result.baselines,
            execution_version: run.result.execution.version,
          },
        }
      : {}),
  };
}

function serializeStatistics(report: ReturnType<ReplayRunService['statistics']>) {
  return {
    origin: report.origin,
    definition_version: report.definitionVersion,
    execution_version: report.executionVersion,
    costs_included: report.costsIncluded,
    starting_equity: report.startingEquity,
    analysis_start: report.analysisStart?.toISOString(),
    analysis_end: report.analysisEnd?.toISOString(),
    decision_count: report.decisionCount,
    abstention_count: report.abstentionCount,
    coverage: report.coverage,
    overall: serializeMetrics(report.overall),
    segments: report.segments.map((segment) => ({
      dimension: segment.dimension,
      value: segment.value,
      metrics: serializeMetrics(segment.metrics),
    })),
  };
}

function serializeMetrics(metrics: StatisticsMetrics) {
  return {
    eligible: metrics.eligible,
    sample_size: metrics.sampleSize,
    expectancy_r: metrics.expectancyR,
    profit_factor: metrics.profitFactor,
    maximum_drawdown: metrics.maximumDrawdown,
    maximum_drawdown_percent: metrics.maximumDrawdownPercent,
    hit_rate: metrics.hitRate,
    loss_rate: metrics.lossRate,
    breakeven_rate: metrics.breakevenRate,
    target_hit_rate: metrics.targetHitRate,
    brier_score: metrics.brierScore,
    expected_calibration_error: metrics.expectedCalibrationError,
    average_mae_r: metrics.averageMaeR,
    average_mfe_r: metrics.averageMfeR,
    total_costs: metrics.totalCosts,
    calibration_bins: metrics.calibrationBins,
  };
}

function sendReplayError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof ReplayRunError) {
    return reply.code(error.statusCode).send({ error: error.code });
  }
  throw error;
}
