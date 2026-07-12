import { describe, expect, it } from 'vitest';
import { EvidenceService } from '../src/application/evidence-service.js';

describe('EvidenceService', () => {
  it('collapses correlated evidence groups so indicators cannot double-count', () => {
    const service = new EvidenceService();

    const result = service.collapse([
      contribution('ema-trend', 'trend', 0.4, 0.2),
      contribution('macd-trend', 'trend', 0.7, 0.2),
      contribution('rsi-momentum', 'momentum', 0.5, 0.15),
    ]);

    expect(result.groups).toEqual([
      {
        group: 'momentum',
        representativeId: 'rsi-momentum',
        strength: 0.5,
        weight: 0.15,
        contributors: ['rsi-momentum'],
        suppressedCorrelatedIds: [],
      },
      {
        group: 'trend',
        representativeId: 'macd-trend',
        strength: 0.7,
        weight: 0.2,
        contributors: ['ema-trend', 'macd-trend'],
        suppressedCorrelatedIds: ['ema-trend'],
      },
    ]);
    expect(result.score).toBe(0.215);
    expect(result.warnings).toEqual([
      'Collapsed correlated trend evidence: kept macd-trend, suppressed ema-trend.',
    ]);
  });

  it('clamps contribution strength before scoring', () => {
    const service = new EvidenceService();

    const result = service.collapse([contribution('extreme', 'structure', 2, 0.3)]);

    expect(result.groups[0]).toMatchObject({ strength: 1 });
    expect(result.score).toBe(0.3);
  });
});

function contribution(
  id: string,
  group: 'trend' | 'momentum' | 'structure',
  strength: number,
  weight: number,
) {
  return {
    id,
    group,
    strength,
    weight,
    source: 'test',
    observedAt: new Date('2026-07-12T04:00:00.000Z'),
  };
}
