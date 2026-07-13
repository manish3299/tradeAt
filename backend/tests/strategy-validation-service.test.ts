import { describe, expect, it } from 'vitest';
import { StrategyValidationService } from '../src/application/strategy-validation-service.js';

describe('StrategyValidationService', () => {
  it('pins immutable registry identities and requires approval after all gates pass', () => {
    const service = new StrategyValidationService();
    const config = service.register('w', {
      kind: 'configuration',
      name: 'decision',
      version: '2',
      payload: { threshold: 0.6 },
    });
    const data = service.register('w', {
      kind: 'dataset',
      name: 'walk-forward',
      version: '1',
      payload: { hash: 'abc' },
    });
    expect(() =>
      service.register('w', {
        kind: 'configuration',
        name: 'decision',
        version: '2',
        payload: { threshold: 0.7 },
      }),
    ).toThrow(/immutable/);
    const metrics = (expectancyR: number, brierScore: number, drawdown: number) => ({
      sampleSize: 100,
      expectancyR,
      brierScore,
      maximumDrawdownPercent: drawdown,
      regimeExpectancy: { trend: 0.2, range: 0.1 },
    });
    const report = service.compare('w', {
      baseline: { configurationId: config.id, datasetId: data.id, metrics: metrics(0.1, 0.2, 0.1) },
      candidate: {
        configurationId: config.id,
        datasetId: data.id,
        metrics: metrics(0.3, 0.15, 0.11),
      },
      minimumSamples: 50,
      minimumExpectancyLift: 0.1,
      maximumBrier: 0.2,
      maximumDrawdownIncrease: 0.02,
      minimumRegimeExpectancy: 0,
    });
    expect(report).toMatchObject({ eligibleForApproval: true, status: 'approval_required' });
  });
  it('flags degradation without deploying', () => {
    const service = new StrategyValidationService();
    const base = {
      sampleSize: 100,
      expectancyR: 0.3,
      brierScore: 0.15,
      maximumDrawdownPercent: 0.1,
      regimeExpectancy: { trend: 0.2 },
    };
    expect(service.monitor('w', base, { ...base, expectancyR: 0.05 })).toMatchObject({
      degraded: true,
      action: 'review_required',
      automaticDeployment: false,
    });
  });
});
