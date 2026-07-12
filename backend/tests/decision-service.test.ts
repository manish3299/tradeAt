import { describe, expect, it } from 'vitest';
import { DecisionService } from '../src/application/decision-service.js';
import { defaultDecisionGatePolicy } from '../src/application/decision-gate-service.js';
import type { DecisionGateInput } from '../src/domain/decisions.js';

describe('DecisionService', () => {
  it('publishes a long decision with entry zone, stop, targets, R, score, confidence, and reasons', () => {
    const service = new DecisionService();

    const decision = service.decide(validInput());

    expect(decision).toMatchObject({
      version: '1.0.0',
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      direction: 'long',
      score: 0.36,
      confidence: 0.62,
      entryZone: { low: 99.8, high: 100.2 },
      stop: 98,
      riskR: 1,
      rewardToRisk: 2,
      vetoes: [],
      policyVersion: '1.0.0',
    });
    expect(decision.policyHash).toHaveLength(64);
    expect(decision.id).toHaveLength(24);
    expect(decision.targets).toEqual([{ label: 'target_1', price: 104, rewardToRisk: 2 }]);
    expect(decision.reasons).toContain('Breakout setup is valid.');
  });

  it('publishes a short decision when the valid setup is short', () => {
    const service = new DecisionService();

    const decision = service.decide({
      ...validInput(),
      setup: { ...validInput().setup, direction: 'short' },
      evidence: {
        groups: [
          {
            group: 'structure',
            representativeId: 'breakdown',
            strength: -0.8,
            weight: 0.3,
            contributors: ['breakdown'],
            suppressedCorrelatedIds: [],
          },
          {
            group: 'trend',
            representativeId: 'ema',
            strength: -0.6,
            weight: 0.2,
            contributors: ['ema'],
            suppressedCorrelatedIds: [],
          },
        ],
        score: -0.36,
        warnings: [],
      },
      riskTarget: {
        entry: 100,
        entryZoneLow: 99.8,
        entryZoneHigh: 100.2,
        stop: 102,
        targets: [{ label: 'target_1', price: 96, rewardToRisk: 2 }],
        rewardToRisk: 2,
        riskR: 1,
      },
    });

    expect(decision.direction).toBe('short');
    expect(decision.score).toBe(-0.36);
    expect(decision.stop).toBe(102);
    expect(decision.targets[0]?.price).toBe(96);
  });

  it('uses configurable evidence weights and target policy immutably', () => {
    const service = new DecisionService();

    const decision = service.decide({
      ...validInput(),
      policy: {
        ...defaultDecisionGatePolicy,
        version: 'custom-1',
        evidenceWeights: {
          ...defaultDecisionGatePolicy.evidenceWeights,
          structure: 0.1,
          trend: 0.5,
        },
        riskLimits: {
          ...defaultDecisionGatePolicy.riskLimits,
          conservativeTarget: 'best_available',
        },
      },
    });

    expect(decision.policyVersion).toBe('custom-1');
    expect(decision.score).toBe(0.38);
    expect(decision.targets).toEqual([{ label: 'target_2', price: 106, rewardToRisk: 3 }]);
  });

  it('publishes abstain with vetoes and no trade plan when any gate vetoes', () => {
    const service = new DecisionService();

    const decision = service.decide({
      ...validInput(),
      evidence: { groups: [], score: 0.05, warnings: [] },
    });

    expect(decision.direction).toBe('abstain');
    expect(decision.entryZone).toBeUndefined();
    expect(decision.stop).toBeUndefined();
    expect(decision.targets).toEqual([]);
    expect(decision.vetoes).toEqual([expect.objectContaining({ code: 'insufficient_evidence' })]);
    expect(decision.reasons).toContain('Evidence score 0.05 is below 0.35.');
  });
});

function validInput(): DecisionGateInput {
  const evaluatedAt = new Date('2026-07-12T04:30:00.000Z');
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    evaluatedAt,
    marketStatus: {
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      status: 'fresh',
      latestBarAt: evaluatedAt,
      checkedAt: evaluatedAt,
      staleAfterSeconds: 900,
      gapCount: 0,
      source: 'test',
    },
    regime: {
      definitionId: 'tradeat.regime',
      definitionVersion: '1.0.0',
      configurationHash: 'hash',
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      observedAt: evaluatedAt,
      quality: 'ok',
      trend: 'uptrend',
      volatility: 'normal',
      priceStructure: 'breakout',
      close: 100,
      inputBars: 80,
      missingBars: 0,
      inputRange: {
        firstObservedAt: new Date('2026-07-12T03:30:00.000Z'),
        lastObservedAt: evaluatedAt,
      },
      reasons: ['fixture'],
    },
    setup: {
      id: 'breakout-continuation',
      direction: 'long',
      valid: true,
      structure: 'breakout',
      reasons: ['Breakout setup is valid.'],
    },
    evidence: {
      groups: [
        {
          group: 'structure',
          representativeId: 'breakout',
          strength: 0.8,
          weight: 0.3,
          contributors: ['breakout'],
          suppressedCorrelatedIds: [],
        },
        {
          group: 'trend',
          representativeId: 'ema',
          strength: 0.6,
          weight: 0.2,
          contributors: ['ema'],
          suppressedCorrelatedIds: [],
        },
      ],
      score: 0.36,
      warnings: [],
    },
    riskTarget: {
      entry: 100,
      entryZoneLow: 99.8,
      entryZoneHigh: 100.2,
      stop: 98,
      targets: [
        { label: 'target_1', price: 104, rewardToRisk: 2 },
        { label: 'target_2', price: 106, rewardToRisk: 3 },
      ],
      rewardToRisk: 2,
      riskR: 1,
    },
    confidence: {
      value: 0.62,
      sampleSize: 50,
      calibrationError: 0.04,
    },
    policy: defaultDecisionGatePolicy,
  };
}
