import { describe, expect, it, vi } from 'vitest';
import { DecisionReplayStrategy } from '../src/application/decision-replay-strategy.js';
import type { PublishedDecision } from '../src/domain/decisions.js';

describe('DecisionReplayStrategy', () => {
  it('uses the live decision evaluator with the replay as-of time', async () => {
    const evaluatedAt = new Date('2026-07-01T09:15:00.000Z');
    const evaluate = vi.fn(() => Promise.resolve(decision(evaluatedAt)));
    const strategy = new DecisionReplayStrategy({ evaluate }, 'nifty', '5m', () => ({
      setup: {
        id: 'breakout',
        direction: 'long',
        valid: true,
        structure: 'breakout',
        reasons: ['fixture'],
      },
      riskTarget: {
        entry: 100,
        entryZoneLow: 99.9,
        entryZoneHigh: 100.1,
        stop: 98,
        targets: [{ label: 'target_1', price: 104, rewardToRisk: 2 }],
        rewardToRisk: 2,
        riskR: 1,
      },
      confidence: { value: 0.7, sampleSize: 100, calibrationError: 0.03 },
      session: 'regular',
      regime: 'uptrend',
    }));

    const result = await strategy.evaluate({ asOf: evaluatedAt, bars: [], windowIndex: 0 });

    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ asOf: evaluatedAt }));
    expect(result.decision).toEqual(decision(evaluatedAt));
    expect(result).toMatchObject({ setupId: 'breakout', session: 'regular', regime: 'uptrend' });
  });
});

function decision(evaluatedAt: Date): PublishedDecision {
  return {
    id: 'decision',
    version: '1',
    instrumentId: 'nifty',
    timeframe: '5m',
    evaluatedAt,
    direction: 'long',
    score: 0.7,
    confidence: 0.7,
    entryZone: { low: 99.9, high: 100.1 },
    stop: 98,
    targets: [{ label: 'target_1', price: 104, rewardToRisk: 2 }],
    riskR: 1,
    rewardToRisk: 2,
    vetoes: [],
    reasons: [],
    gates: [],
    policyVersion: '1',
    policyHash: 'hash',
  };
}
