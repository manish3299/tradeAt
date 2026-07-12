import { describe, expect, it } from 'vitest';
import {
  DecisionGateService,
  defaultDecisionGatePolicy,
} from '../src/application/decision-gate-service.js';
import type { DecisionGateInput } from '../src/domain/decisions.js';

describe('DecisionGateService', () => {
  it('passes all gates for fresh data, valid setup, sufficient evidence, risk, and confidence', () => {
    const service = new DecisionGateService();

    const result = service.evaluate(validInput());

    expect(result.status).toBe('pass');
    expect(result.vetoes).toEqual([]);
    expect(result.gates.map((gate) => gate.gate)).toEqual([
      'data',
      'regime',
      'setup',
      'evidence',
      'risk_target',
      'confidence',
    ]);
    expect(result.gates.every((gate) => gate.status === 'pass')).toBe(true);
  });

  it('vetoes stale data, unknown regimes, missing setup, weak evidence, bad risk, and weak confidence', () => {
    const service = new DecisionGateService();

    const result = service.evaluate({
      ...validInput(),
      marketStatus: { ...validInput().marketStatus, status: 'stale', gapCount: 2 },
      regime: {
        ...validInput().regime,
        quality: 'insufficient_data',
        trend: 'unknown',
      },
      setup: { ...validInput().setup, valid: false },
      evidence: { groups: [], score: 0.1, warnings: [] },
      riskTarget: {
        ...validInput().riskTarget,
        targets: [{ label: 'target_1', price: 104, rewardToRisk: 0.8 }],
        rewardToRisk: 0.8,
        riskR: 0,
      },
      confidence: { value: 0.4, sampleSize: 10, calibrationError: 0.2 },
    });

    expect(result.status).toBe('veto');
    expect(result.vetoes.map((veto) => veto.code)).toEqual([
      'stale_data',
      'gapped_data',
      'insufficient_regime_data',
      'unknown_regime',
      'no_valid_setup',
      'insufficient_evidence',
      'invalid_risk',
      'insufficient_reward_to_risk',
      'insufficient_confidence',
      'insufficient_samples',
      'poor_calibration',
    ]);
  });

  it('vetoes when configured risk limits are exceeded', () => {
    const service = new DecisionGateService();

    const result = service.evaluate({
      ...validInput(),
      riskTarget: { ...validInput().riskTarget, riskR: 1.2 },
    });

    expect(result.status).toBe('veto');
    expect(result.vetoes).toEqual([
      expect.objectContaining({
        code: 'risk_limit_exceeded',
        message: 'Risk 1.2R exceeds max 1R.',
      }),
    ]);
  });

  it('keeps gate failures isolated so one pass cannot override an earlier veto', () => {
    const service = new DecisionGateService();

    const result = service.evaluate({
      ...validInput(),
      marketStatus: { ...validInput().marketStatus, status: 'empty' },
      evidence: { groups: [], score: 0.95, warnings: [] },
      confidence: { value: 0.9, sampleSize: 200, calibrationError: 0.01 },
    });

    expect(result.status).toBe('veto');
    expect(result.vetoes.map((veto) => veto.code)).toContain('stale_data');
    expect(result.gates.find((gate) => gate.gate === 'evidence')?.status).toBe('pass');
    expect(result.gates.find((gate) => gate.gate === 'confidence')?.status).toBe('pass');
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
      targets: [{ label: 'target_1', price: 104, rewardToRisk: 2 }],
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
