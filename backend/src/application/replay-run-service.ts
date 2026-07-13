import { createHash, randomUUID } from 'node:crypto';
import { BacktestService } from './backtest-service.js';
import { DecisionOrchestrator } from './decision-orchestrator.js';
import { DecisionReplayStrategy } from './decision-replay-strategy.js';
import { RegimeService } from './regime-service.js';
import { ReplayController } from './replay-controller.js';
import type { HistoricalMemoryService } from './historical-memory-service.js';
import { StatisticsService, type ReplayStatisticsReport } from './statistics-service.js';
import type { Bar, MarketDataStore, Timeframe } from '../domain/market.js';
import type {
  BacktestResult,
  ExecutionAssumptions,
  ReplayEvent,
  ReplayIdentity,
  ReplayResultStore,
  ReplayState,
} from '../domain/replay.js';

const MAX_REPLAY_BARS = 5_000;

export type CreateReplayRunInput = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  from?: Date;
  to?: Date;
  trainingBars: number;
  evaluationBars: number;
  minimumSamples: number;
  startingEquity: number;
}>;

export type ReplayRunView = Readonly<{
  id: string;
  workspaceId: string;
  instrumentId: string;
  timeframe: Timeframe;
  createdAt: Date;
  identityHash: string;
  state: ReplayState;
  result?: BacktestResult;
}>;

type ReplayRun = {
  id: string;
  workspaceId: string;
  instrumentId: string;
  timeframe: Timeframe;
  createdAt: Date;
  controller: ReplayController<Bar>;
  bars: readonly Bar[];
  identity: ReplayIdentity;
  input: CreateReplayRunInput;
  result?: BacktestResult;
  statistics?: ReplayStatisticsReport;
};

export class ReplayRunError extends Error {
  constructor(
    readonly code:
      | 'instrument_not_found'
      | 'insufficient_replay_data'
      | 'replay_not_found'
      | 'replay_not_complete',
    readonly statusCode: 404 | 409,
  ) {
    super(code);
  }
}

export class ReplayRunService {
  private readonly runs = new Map<string, ReplayRun>();
  private readonly orchestrator: DecisionOrchestrator;
  private readonly regimes: RegimeService;

  constructor(
    private readonly market: MarketDataStore,
    private readonly resultStore?: ReplayResultStore,
    private readonly memory?: HistoricalMemoryService,
  ) {
    this.orchestrator = new DecisionOrchestrator(market);
    this.regimes = new RegimeService(market);
  }

  async create(workspaceId: string, input: CreateReplayRunInput): Promise<ReplayRunView> {
    const instrument = await this.market.findInstrumentById(input.instrumentId);
    if (!instrument) throw new ReplayRunError('instrument_not_found', 404);
    const bars = await this.market.listBars({
      instrumentId: input.instrumentId,
      timeframe: input.timeframe,
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
      limit: MAX_REPLAY_BARS,
    });
    if (bars.length < input.trainingBars + 1) {
      throw new ReplayRunError('insufficient_replay_data', 409);
    }
    const start = new Date(Math.min(...bars.map((bar) => bar.closeTime.getTime())));
    const end = new Date(
      Math.max(...bars.flatMap((bar) => [bar.closeTime.getTime(), bar.receivedAt.getTime()])),
    );
    const identity: ReplayIdentity = {
      datasetHash: datasetHash(bars),
      start,
      end,
      eventOrderPolicy: 'observed_received_id',
      configurationVersions: {
        decision: '1.0.0',
        execution: defaultExecution.version,
        statistics: '1.0.0',
      },
      pluginVersions: { regime: '1.0.0' },
      codeRevision: process.env['GIT_REVISION'] ?? 'development',
      randomSeed: 0,
    };
    const controller = new ReplayController(identity, bars.map(toEvent));
    const run: ReplayRun = {
      id: randomUUID(),
      workspaceId,
      instrumentId: input.instrumentId,
      timeframe: input.timeframe,
      createdAt: new Date(),
      controller,
      bars,
      identity,
      input,
    };
    this.runs.set(run.id, run);
    return toView(run);
  }

  get(workspaceId: string, runId: string): ReplayRunView {
    return toView(this.findOwned(workspaceId, runId));
  }

  async control(
    workspaceId: string,
    runId: string,
    control: Readonly<{
      action: 'start' | 'pause' | 'step' | 'seek' | 'set_speed';
      seekTo?: Date;
      speed?: number;
    }>,
  ): Promise<ReplayRunView> {
    const run = this.findOwned(workspaceId, runId);
    if (control.action === 'pause') run.controller.pause();
    if (control.action === 'set_speed') run.controller.setSpeed(control.speed ?? 1);
    if (control.action === 'seek') {
      if (!control.seekTo) throw new Error('seekTo is required for replay seek.');
      run.controller.seek(control.seekTo);
    }
    if (control.action === 'step') run.controller.step();
    if (control.action === 'start') {
      run.controller.start();
      while (run.controller.step()) {
        // Deliberately drains the deterministic event source in lite mode.
      }
    }
    if (run.controller.state().status === 'completed' && !run.result) {
      await this.complete(run);
    }
    return toView(run);
  }

  statistics(workspaceId: string, runId: string): ReplayStatisticsReport {
    const run = this.findOwned(workspaceId, runId);
    if (!run.statistics) throw new ReplayRunError('replay_not_complete', 409);
    return structuredClone(run.statistics);
  }

  private async complete(run: ReplayRun): Promise<void> {
    const strategy = new DecisionReplayStrategy(
      this.orchestrator,
      run.instrumentId,
      run.timeframe,
      async (context) => {
        const latest = context.bars.at(-1)!;
        const previous = context.bars.at(-2) ?? latest;
        const direction = latest.close >= previous.close ? 'long' : 'short';
        const riskDistance = latest.close * 0.005;
        const regime = await this.regimes.classify({
          instrumentId: run.instrumentId,
          timeframe: run.timeframe,
          asOf: context.asOf,
        });
        return {
          setup: {
            id: `${direction}-continuation`,
            direction,
            valid: context.bars.length >= 6,
            structure: 'breakout',
            reasons: [
              `Latest close is ${direction === 'long' ? 'above' : 'below'} the prior close.`,
            ],
          },
          riskTarget: {
            entry: latest.close,
            entryZoneLow: latest.close * 0.9995,
            entryZoneHigh: latest.close * 1.0005,
            stop: direction === 'long' ? latest.close - riskDistance : latest.close + riskDistance,
            targets: [
              {
                label: 'target_1',
                price:
                  direction === 'long'
                    ? latest.close + riskDistance * 2
                    : latest.close - riskDistance * 2,
                rewardToRisk: 2,
              },
            ],
            rewardToRisk: 2,
            riskR: 1,
          },
          confidence: { value: 0.65, sampleSize: 100, calibrationError: 0.04 },
          session: 'regular',
          regime: `${regime.trend}/${regime.volatility}`,
        };
      },
    );
    const result = await new BacktestService(this.resultStore).run({
      identity: run.identity,
      bars: run.bars,
      strategy,
      execution: defaultExecution,
      warmupBars: Math.max(2, run.input.trainingBars),
      walkForward: {
        trainingBars: run.input.trainingBars,
        evaluationBars: run.input.evaluationBars,
      },
      minimumSamples: run.input.minimumSamples,
    });
    run.result = result;
    run.statistics = new StatisticsService().summarize(result.decisions, result.outcomes, {
      minimumSamples: run.input.minimumSamples,
      startingEquity: run.input.startingEquity,
      executionVersion: result.execution.version,
    });
    if (this.memory) {
      for (const item of result.decisions) {
        const decision = item.decision;
        const context = run.bars.filter(
          (bar) => bar.closeTime <= decision.evaluatedAt && bar.receivedAt <= decision.evaluatedAt,
        );
        const latest = context.at(-1);
        if (!latest) continue;
        const previous = context.at(-2) ?? latest;
        const averageVolume =
          context.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) /
          Math.max(1, context.slice(-20).length);
        const outcome = result.outcomes.find((candidate) => candidate.decisionId === decision.id);
        await this.memory.capture({
          workspaceId: run.workspaceId,
          instrumentId: run.instrumentId,
          timeframe: run.timeframe,
          observedAt: decision.evaluatedAt,
          availableAt: outcome?.closedAt ?? decision.evaluatedAt,
          session: item.session,
          regime: item.regime,
          setupId: item.setupId,
          decisionId: decision.id,
          direction: decision.direction,
          features: {
            momentumPct: previous.close ? latest.close / previous.close - 1 : 0,
            rangePct: latest.close ? (latest.high - latest.low) / latest.close : 0,
            volumeRatio: averageVolume ? latest.volume / averageVolume : 1,
            decisionScore: decision.score,
          },
          ...(outcome
            ? {
                outcome: {
                  returnR: outcome.returnR,
                  targetHit: outcome.targetHit,
                  closedAt: outcome.closedAt,
                },
              }
            : {}),
          versions: {
            feature: 'memory-features-v1',
            regime: run.identity.pluginVersions['regime'] ?? 'unknown',
            decision: decision.version,
            policy: decision.policyVersion,
          },
          provenance: {
            datasetHash: run.identity.datasetHash,
            source: 'replay',
            inputStart: context[0]!.closeTime,
            inputEnd: latest.closeTime,
          },
        });
      }
    }
  }

  private findOwned(workspaceId: string, runId: string): ReplayRun {
    const run = this.runs.get(runId);
    if (!run || run.workspaceId !== workspaceId) {
      throw new ReplayRunError('replay_not_found', 404);
    }
    return run;
  }
}

const defaultExecution: ExecutionAssumptions = {
  version: '1.0.0',
  feeBpsPerSide: 1,
  spreadBps: 2,
  slippageBpsPerSide: 1,
  intrabarFillPolicy: 'stop_first',
};

function toView(run: ReplayRun): ReplayRunView {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    instrumentId: run.instrumentId,
    timeframe: run.timeframe,
    createdAt: new Date(run.createdAt),
    identityHash: run.controller.identityHash(),
    state: run.controller.state(),
    ...(run.result ? { result: structuredClone(run.result) } : {}),
  };
}

function toEvent(bar: Bar): ReplayEvent<Bar> {
  return {
    id: [bar.instrumentId, bar.timeframe, bar.openTime.toISOString(), bar.revision].join(':'),
    observedAt: bar.closeTime,
    receivedAt: bar.receivedAt,
    payload: bar,
  };
}

function datasetHash(bars: readonly Bar[]): string {
  return createHash('sha256').update(JSON.stringify(bars)).digest('hex');
}
