import { describe, expect, it } from 'vitest';
import {
  BacktestService,
  createWalkForwardWindows,
  simulateOutcome,
} from '../src/application/backtest-service.js';
import type { PublishedDecision } from '../src/domain/decisions.js';
import type { Bar } from '../src/domain/market.js';
import type {
  BacktestRequest,
  ExecutionAssumptions,
  ReplayDecision,
  ReplayIdentity,
} from '../src/domain/replay.js';

describe('BacktestService', () => {
  it('is deterministic and gives strategies only chronological point-in-time bars', async () => {
    const seen: string[][] = [];
    const request = backtestRequest((context) => {
      seen.push(context.bars.map((bar) => bar.closeTime.toISOString()));
      expect(context.bars.every((bar) => bar.closeTime <= context.asOf)).toBe(true);
      return replayDecision(context.asOf, 'abstain');
    });
    const service = new BacktestService();

    const first = await service.run(request);
    const second = await service.run(request);

    expect(first).toEqual(second);
    expect(first.decisions).toHaveLength(4);
    expect(first.baselines.map((baseline) => baseline.name)).toEqual([
      'buy_and_hold',
      'always_abstain',
    ]);
    expect(seen).toHaveLength(8);
  });

  it('creates expanding chronological walk-forward evaluation windows', () => {
    const windows = createWalkForwardWindows(bars(), 2, 2);
    expect(windows).toHaveLength(2);
    expect(windows[0]?.trainingBars).toHaveLength(2);
    expect(windows[0]?.evaluationBars).toHaveLength(2);
    expect(windows[1]?.trainingBars).toHaveLength(2);
    expect(windows[1]?.evaluationBars).toHaveLength(2);
    expect(windows[0]!.trainingBars.at(-1)!.closeTime.getTime()).toBeLessThan(
      windows[0]!.evaluationBars[0]!.closeTime.getTime(),
    );
  });

  it('does not expose a late revision before its received time', async () => {
    const source = bars();
    const corrected: Bar = {
      ...source[1]!,
      high: 999,
      close: 999,
      revision: 2,
      receivedAt: at(5),
    };
    const observations: Array<{ asOf: Date; revisions: number[] }> = [];
    const request = {
      ...backtestRequest((context) => {
        observations.push({
          asOf: context.asOf,
          revisions: context.bars.map((candidate) => candidate.revision),
        });
        return replayDecision(context.asOf, 'abstain');
      }),
      bars: [...source, corrected],
    };

    await new BacktestService().run(request);

    expect(
      observations
        .filter(({ asOf }) => asOf < corrected.receivedAt)
        .every(({ revisions }) => !revisions.includes(2)),
    ).toBe(true);
    expect(
      observations.some(
        ({ asOf, revisions }) => asOf >= corrected.receivedAt && revisions.includes(2),
      ),
    ).toBe(true);
  });
});

describe('conservative execution modeling', () => {
  it('chooses the stop when stop and target occur inside the same bar', () => {
    const decision = replayDecision(at(0), 'long');
    const ambiguous = bar(1, 100, 106, 97, 103);
    const outcome = simulateOutcome(decision, [ambiguous], execution());

    expect(outcome?.exitReason).toBe('stop');
    expect(outcome?.targetHit).toBe(false);
    expect(outcome?.costs).toBeGreaterThan(0);
    expect(outcome?.returnR).toBeLessThan(-1);
  });

  it('models target fills, costs, MAE, and MFE for a long trade', () => {
    const decision = replayDecision(at(0), 'long');
    const outcome = simulateOutcome(
      decision,
      [bar(1, 100, 103, 99.5, 102), bar(2, 102, 105, 101, 104)],
      execution(),
    );

    expect(outcome?.exitReason).toBe('target');
    expect(outcome?.targetHit).toBe(true);
    expect(outcome?.mfeR).toBeGreaterThan(1);
    expect(outcome?.maeR).toBeGreaterThan(0);
    expect(outcome?.netPnl).toBeLessThan(outcome!.grossPnl);
  });

  it('does not invent a trade when price never reaches the entry zone', () => {
    const decision = replayDecision(at(0), 'long');
    expect(simulateOutcome(decision, [bar(1, 110, 112, 109, 111)], execution())).toBeUndefined();
  });
});

function backtestRequest(evaluate: BacktestRequest['strategy']['evaluate']): BacktestRequest {
  return {
    identity: identity(),
    bars: bars(),
    strategy: { evaluate },
    execution: execution(),
    warmupBars: 2,
    walkForward: { trainingBars: 2, evaluationBars: 2 },
    minimumSamples: 2,
  };
}

function identity(): ReplayIdentity {
  return {
    datasetHash: 'bars-v1',
    start: at(0),
    end: at(10),
    eventOrderPolicy: 'observed_received_id',
    configurationVersions: { decision: '1.0.0' },
    pluginVersions: { regime: '1.0.0' },
    codeRevision: 'abc123',
    randomSeed: 7,
  };
}

function execution(): ExecutionAssumptions {
  return {
    version: 'execution-1',
    feeBpsPerSide: 1,
    spreadBps: 2,
    slippageBpsPerSide: 1,
    intrabarFillPolicy: 'stop_first',
  };
}

function replayDecision(time: Date, direction: PublishedDecision['direction']): ReplayDecision {
  return {
    decision: {
      id: `decision-${time.toISOString()}-${direction}`,
      version: '1.0.0',
      instrumentId: 'fixture',
      timeframe: '5m',
      evaluatedAt: time,
      direction,
      score: direction === 'abstain' ? 0 : 0.7,
      confidence: 0.7,
      targets:
        direction === 'abstain'
          ? []
          : [{ label: 'target_1' as const, price: 104, rewardToRisk: 2 }],
      ...(direction === 'abstain'
        ? {}
        : {
            entryZone: { low: 99.9, high: 100.1 },
            stop: 98,
            riskR: 1,
            rewardToRisk: 2,
          }),
      vetoes: [],
      reasons: [],
      gates: [],
      policyVersion: '1.0.0',
      policyHash: 'policy',
    },
    setupId: 'breakout',
    session: 'regular',
    regime: 'uptrend',
  };
}

function bars(): readonly Bar[] {
  return [
    bar(0, 100, 101, 99, 100),
    bar(1, 100, 102, 99, 101),
    bar(2, 101, 103, 100, 102),
    bar(3, 102, 104, 101, 103),
    bar(4, 103, 105, 102, 104),
    bar(5, 104, 106, 103, 105),
  ];
}

function bar(index: number, open: number, high: number, low: number, close: number): Bar {
  const openTime = at(index);
  return {
    instrumentId: 'fixture',
    timeframe: '5m',
    openTime,
    closeTime: at(index + 1),
    open,
    high,
    low,
    close,
    volume: 100,
    source: 'fixture',
    revision: 1,
    receivedAt: at(index + 1),
  };
}

function at(index: number): Date {
  return new Date(Date.UTC(2026, 6, 1, 0, index * 5));
}
