import { DecisionService } from './decision-service.js';
import { EvidenceService } from './evidence-service.js';
import { RegimeService } from './regime-service.js';
import { defaultDecisionGatePolicy, scoreEvidence } from './decision-gate-service.js';
import type {
  ConfidenceEstimate,
  DecisionGatePolicy,
  PublishedDecision,
  RiskTargetCandidate,
  SetupCandidate,
} from '../domain/decisions.js';
import type { EvidenceContribution } from '../domain/evidence.js';
import type { MarketDataStore, Timeframe } from '../domain/market.js';

export type DecisionEvaluationRequest = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  asOf: Date;
  setup: SetupCandidate;
  riskTarget: RiskTargetCandidate;
  confidence: ConfidenceEstimate;
  policy?: DecisionGatePolicy;
}>;

export class DecisionOrchestrator {
  private readonly decisions = new DecisionService();
  private readonly evidence = new EvidenceService();
  private readonly regimes: RegimeService;

  constructor(private readonly market: MarketDataStore) {
    this.regimes = new RegimeService(market);
  }

  async evaluate(request: DecisionEvaluationRequest): Promise<PublishedDecision> {
    const policy = request.policy ?? defaultDecisionGatePolicy;
    const [marketStatus, regime] = await Promise.all([
      this.market.getStatus(request.instrumentId, request.timeframe, request.asOf),
      this.regimes.classify({
        instrumentId: request.instrumentId,
        timeframe: request.timeframe,
        asOf: request.asOf,
      }),
    ]);
    const evidence = this.evidence.collapse(
      toEvidence(regime, request.setup, request.asOf, policy),
    );
    return this.decisions.decide({
      instrumentId: request.instrumentId,
      timeframe: request.timeframe,
      evaluatedAt: request.asOf,
      marketStatus,
      regime,
      setup: request.setup,
      evidence: { ...evidence, score: scoreEvidence(evidence, policy) },
      riskTarget: request.riskTarget,
      confidence: request.confidence,
      policy,
    });
  }
}

function toEvidence(
  regime: Awaited<ReturnType<RegimeService['classify']>>,
  setup: SetupCandidate,
  asOf: Date,
  policy: DecisionGatePolicy,
): readonly EvidenceContribution[] {
  const setupStrength = setup.valid ? (setup.direction === 'long' ? 0.8 : -0.8) : 0;
  const trendStrength = trendStrengthFor(regime.trend, setup.direction);
  const higherTimeframeStrength =
    regime.higherTimeframeTrend === undefined
      ? 0
      : trendStrengthFor(regime.higherTimeframeTrend, setup.direction);
  return [
    {
      id: `setup:${setup.id}`,
      group: 'structure',
      strength: setupStrength,
      weight: policy.evidenceWeights.structure,
      source: 'decision-orchestrator',
      observedAt: asOf,
    },
    {
      id: `trend:${regime.trend}`,
      group: 'trend',
      strength: trendStrength,
      weight: policy.evidenceWeights.trend,
      source: 'decision-orchestrator',
      observedAt: asOf,
    },
    {
      id: `higher-timeframe:${regime.higherTimeframeTrend ?? 'none'}`,
      group: 'higher_timeframe',
      strength: higherTimeframeStrength,
      weight: policy.evidenceWeights.higher_timeframe,
      source: 'decision-orchestrator',
      observedAt: asOf,
    },
  ];
}

function trendStrengthFor(
  trend: 'uptrend' | 'downtrend' | 'sideways' | 'unknown',
  direction: SetupCandidate['direction'],
): number {
  if (trend === 'unknown') return 0;
  if (trend === 'sideways') return 0.1;
  if (trend === 'uptrend') return direction === 'long' ? 0.7 : -0.7;
  return direction === 'short' ? 0.7 : -0.7;
}
