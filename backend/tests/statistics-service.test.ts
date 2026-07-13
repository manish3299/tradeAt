import { describe, expect, it } from 'vitest';
import { StatisticsService } from '../src/application/statistics-service.js';
import type { ReplayDecision, ReplayTradeOutcome } from '../src/domain/replay.js';

describe('StatisticsService', () => {
  it('reports replay metrics, calibration, costs, coverage, and required cohorts', () => {
    const service = new StatisticsService();
    const report = service.summarize(
      [decision('one', 'long'), decision('two', 'long'), decision('three', 'abstain')],
      [outcome('one', 2, 0.7, true, 'uptrend'), outcome('two', -1, 0.6, false, 'range')],
      { minimumSamples: 2, startingEquity: 100 },
    );

    expect(report.origin).toBe('replay');
    expect(report.definitionVersion).toBe('1.0.0');
    expect(report.costsIncluded).toBe(true);
    expect(report.coverage).toBeCloseTo(2 / 3);
    expect(report.overall).toMatchObject({
      eligible: true,
      sampleSize: 2,
      expectancyR: 0.5,
      hitRate: 0.5,
      targetHitRate: 0.5,
      maximumDrawdown: 1,
      maximumDrawdownPercent: 1 / 102,
      totalCosts: 0.4,
    });
    expect(report.overall.profitFactor).toBe(2);
    expect(report.overall.brierScore).toBeCloseTo(0.225);
    expect(report.overall.calibrationBins).toHaveLength(2);
    expect(report.overall.calibrationBins?.every((bin) => bin.count === 1)).toBe(true);
    expect(new Set(report.segments.map((segment) => segment.dimension))).toEqual(
      new Set(['instrument', 'session', 'regime', 'setup']),
    );
  });

  it('withholds unstable metrics below the minimum sample threshold', () => {
    const report = new StatisticsService().summarize(
      [decision('one', 'long')],
      [outcome('one', 1, 0.8, true, 'uptrend')],
      { minimumSamples: 5, startingEquity: 100 },
    );

    expect(report.overall.eligible).toBe(false);
    expect(report.overall.sampleSize).toBe(1);
    expect(report.overall.expectancyR).toBeUndefined();
    expect(report.overall.profitFactor).toBeUndefined();
  });

  it('keeps zero-denominator ratios undefined for all-win and empty cohorts', () => {
    const service = new StatisticsService();
    const allWins = service.summarize(
      [decision('one', 'long')],
      [outcome('one', 1, 0.8, true, 'uptrend')],
      { minimumSamples: 1, startingEquity: 100 },
    );
    const empty = service.summarize([], [], { minimumSamples: 1, startingEquity: 100 });

    expect(allWins.overall.profitFactor).toBeUndefined();
    expect(allWins.overall.lossRate).toBe(0);
    expect(empty.overall.eligible).toBe(false);
    expect(empty.overall.sampleSize).toBe(0);
    expect(empty.overall.maximumDrawdown).toBe(0);
  });

  it('handles losses, breakevens, invalid risk, and multiple equity peaks', () => {
    const outcomes = [
      outcome('win-one', 2, 0.7, true, 'uptrend'),
      outcome('loss-one', -1, 0.6, false, 'uptrend'),
      outcome('win-two', 3, 0.8, true, 'uptrend'),
      outcome('loss-two', -4, 0.6, false, 'uptrend'),
      outcome('breakeven', 0, 0.5, false, 'uptrend'),
      { ...outcome('invalid-risk', 10, 0.9, true, 'uptrend'), initialRisk: 0 },
    ];
    const report = new StatisticsService().summarize([], outcomes, {
      minimumSamples: 1,
      startingEquity: 100,
    });

    expect(report.overall.sampleSize).toBe(5);
    expect(report.overall.hitRate).toBe(0.4);
    expect(report.overall.lossRate).toBe(0.4);
    expect(report.overall.breakevenRate).toBe(0.2);
    expect(report.overall.profitFactor).toBe(1);
    expect(report.overall.maximumDrawdown).toBe(4);
    expect(report.overall.maximumDrawdownPercent).toBeCloseTo(4 / 104);
  });
});

function decision(id: string, direction: 'long' | 'abstain'): ReplayDecision {
  return {
    decision: {
      id,
      version: '1',
      instrumentId: 'nifty',
      timeframe: '5m',
      evaluatedAt: new Date('2026-07-01T09:00:00.000Z'),
      direction,
      score: direction === 'long' ? 0.7 : 0,
      confidence: 0.7,
      targets: [],
      vetoes: [],
      reasons: [],
      gates: [],
      policyVersion: '1',
      policyHash: 'hash',
    },
    setupId: 'breakout',
    session: 'regular',
    regime: 'uptrend',
  };
}

function outcome(
  id: string,
  returnR: number,
  confidence: number,
  targetHit: boolean,
  regime: string,
): ReplayTradeOutcome {
  return {
    decisionId: id,
    instrumentId: 'nifty',
    timeframe: '5m',
    direction: 'long',
    setupId: 'breakout',
    session: 'regular',
    regime,
    confidence,
    openedAt: new Date('2026-07-01T09:00:00.000Z'),
    closedAt: new Date('2026-07-01T09:30:00.000Z'),
    entryPrice: 100,
    exitPrice: 100 + returnR,
    initialRisk: 1,
    grossPnl: returnR + 0.2,
    costs: 0.2,
    netPnl: returnR,
    returnR,
    maeR: returnR > 0 ? 0.5 : 1,
    mfeR: returnR > 0 ? 2.2 : 0.4,
    targetHit,
    exitReason: targetHit ? 'target' : 'stop',
    barsHeld: 3,
    executionVersion: 'execution-1',
  };
}
