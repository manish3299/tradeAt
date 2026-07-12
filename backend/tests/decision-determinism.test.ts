import { describe, expect, it } from 'vitest';
import { DecisionService } from '../src/application/decision-service.js';
import { DecisionOrchestrator } from '../src/application/decision-orchestrator.js';
import { defaultDecisionGatePolicy } from '../src/application/decision-gate-service.js';
import type { Bar } from '../src/domain/market.js';
import type {
  DecisionGateInput,
  RiskTargetCandidate,
  SetupCandidate,
} from '../src/domain/decisions.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

describe('decision determinism', () => {
  it('publishes the same immutable decision for the same input', () => {
    const service = new DecisionService();
    const input = validInput();

    expect(service.decide(input)).toEqual(service.decide(input));
  });

  it('changes immutable identity when policy changes', () => {
    const service = new DecisionService();
    const first = service.decide(validInput());
    const second = service.decide({
      ...validInput(),
      policy: {
        ...defaultDecisionGatePolicy,
        version: '1.0.1',
        minEvidenceScore: 0.2,
      },
    });

    expect(second.id).not.toBe(first.id);
    expect(second.policyHash).not.toBe(first.policyHash);
  });
});

describe('decision point-in-time correctness', () => {
  it('does not change an as_of decision when a later bar revision is received after as_of', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('2026-07-12T04:00:00.000Z', 100, 104, 99, 102, 1, '2026-07-12T04:06:00.000Z'),
      bar('2026-07-12T04:05:00.000Z', 102, 106, 101, 105, 1, '2026-07-12T04:11:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 105, 109, 104, 108, 1, '2026-07-12T04:16:00.000Z'),
      bar('2026-07-12T04:15:00.000Z', 108, 112, 107, 111, 1, '2026-07-12T04:21:00.000Z'),
      bar('2026-07-12T04:20:00.000Z', 111, 115, 110, 114, 1, '2026-07-12T04:26:00.000Z'),
      bar('2026-07-12T04:25:00.000Z', 114, 118, 113, 117, 1, '2026-07-12T04:31:00.000Z'),
    ]);
    const orchestrator = new DecisionOrchestrator(market);
    const request = decisionRequest(new Date('2026-07-12T04:31:00.000Z'));

    const beforeLateRevision = await orchestrator.evaluate(request);
    await market.upsertBars([
      bar('2026-07-12T04:25:00.000Z', 114, 200, 113, 198, 2, '2026-07-12T05:00:00.000Z'),
    ]);
    const afterLateRevision = await orchestrator.evaluate(request);

    expect(afterLateRevision).toEqual(beforeLateRevision);
  });
});

function decisionRequest(asOf: Date) {
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m' as const,
    asOf,
    setup: setup(),
    riskTarget: riskTarget(),
    confidence: { value: 0.7, sampleSize: 100, calibrationError: 0.03 },
  };
}

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
    setup: setup(),
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
    riskTarget: riskTarget(),
    confidence: {
      value: 0.62,
      sampleSize: 50,
      calibrationError: 0.04,
    },
    policy: defaultDecisionGatePolicy,
  };
}

function setup(): SetupCandidate {
  return {
    id: 'breakout-continuation',
    direction: 'long',
    valid: true,
    structure: 'breakout',
    reasons: ['Breakout setup is valid.'],
  };
}

function riskTarget(): RiskTargetCandidate {
  return {
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
  };
}

function bar(
  openTimeIso: string,
  open: number,
  high: number,
  low: number,
  close: number,
  revision: number,
  receivedAtIso: string,
): Bar {
  const openTime = new Date(openTimeIso);
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open,
    high,
    low,
    close,
    volume: 1000,
    source: 'decision-fixture',
    revision,
    receivedAt: new Date(receivedAtIso),
  };
}
