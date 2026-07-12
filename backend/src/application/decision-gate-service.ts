import type {
  ConfidenceEstimate,
  DecisionGateEvaluation,
  DecisionGateInput,
  DecisionGatePolicy,
  DecisionGateResult,
  DecisionVeto,
  RiskTargetCandidate,
  SetupCandidate,
} from '../domain/decisions.js';
import type { MarketStatus } from '../domain/market.js';
import type { RegimeClassification } from '../domain/regimes.js';
import type { EvidenceCollapseResult } from '../domain/evidence.js';

export const defaultDecisionGatePolicy: DecisionGatePolicy = {
  version: '1.0.0',
  minEvidenceScore: 0.35,
  minConfidence: 0.55,
  minSamples: 30,
  maxCalibrationError: 0.08,
  evidenceWeights: {
    structure: 0.3,
    trend: 0.2,
    momentum: 0.15,
    volatility_risk: 0.15,
    volume_liquidity: 0.1,
    higher_timeframe: 0.1,
    forecast: 0.1,
  },
  riskLimits: {
    maxRiskR: 1,
    minRewardToRisk: 1.5,
    conservativeTarget: 'target_1',
  },
};

export class DecisionGateService {
  evaluate(input: DecisionGateInput): DecisionGateEvaluation {
    const gates: DecisionGateResult[] = [
      dataGate(input.marketStatus),
      regimeGate(input.regime),
      setupGate(input.setup),
      evidenceGate(input.evidence, input.policy),
      riskTargetGate(input.riskTarget, input.policy),
      confidenceGate(input.confidence, input.policy),
    ];
    const vetoes = gates.flatMap((gate) => gate.vetoes);

    return {
      instrumentId: input.instrumentId,
      timeframe: input.timeframe,
      evaluatedAt: input.evaluatedAt,
      policyVersion: input.policy.version,
      status: vetoes.length > 0 ? 'veto' : 'pass',
      gates,
      vetoes,
    };
  }
}

function dataGate(status: MarketStatus): DecisionGateResult {
  const vetoes: DecisionVeto[] = [];
  if (status.status !== 'fresh') {
    vetoes.push({ code: 'stale_data', message: `Market data is ${status.status}.` });
  }
  if (status.gapCount > 0) {
    vetoes.push({ code: 'gapped_data', message: `Market data has ${status.gapCount} gaps.` });
  }
  return gate('data', vetoes, ['Market data must be fresh and gap-free.']);
}

function regimeGate(regime: RegimeClassification): DecisionGateResult {
  const vetoes: DecisionVeto[] = [];
  if (regime.quality !== 'ok') {
    vetoes.push({
      code: 'insufficient_regime_data',
      message: 'Regime classification has insufficient input data.',
    });
  }
  if (regime.trend === 'unknown' || regime.volatility === 'unknown') {
    vetoes.push({ code: 'unknown_regime', message: 'Trend or volatility regime is unknown.' });
  }
  return gate('regime', vetoes, ['Regime must be known and computed from sufficient data.']);
}

function setupGate(setup: SetupCandidate): DecisionGateResult {
  const vetoes = setup.valid
    ? []
    : [{ code: 'no_valid_setup' as const, message: 'No valid setup is present.' }];
  return gate('setup', vetoes, setup.reasons);
}

function evidenceGate(
  evidence: EvidenceCollapseResult,
  policy: DecisionGatePolicy,
): DecisionGateResult {
  const weightedScore = scoreEvidence(evidence, policy);
  const score = Math.abs(weightedScore);
  const vetoes =
    score >= policy.minEvidenceScore
      ? []
      : [
          {
            code: 'insufficient_evidence' as const,
            message: `Evidence score ${score} is below ${policy.minEvidenceScore}.`,
          },
        ];
  return gate('evidence', vetoes, [
    `Policy-weighted independent evidence score is ${weightedScore}.`,
    ...evidence.warnings,
  ]);
}

function riskTargetGate(
  riskTarget: RiskTargetCandidate,
  policy: DecisionGatePolicy,
): DecisionGateResult {
  const vetoes: DecisionVeto[] = [];
  const selectedTarget = selectPolicyTarget(riskTarget, policy);
  if (
    riskTarget.riskR <= 0 ||
    riskTarget.entry <= 0 ||
    riskTarget.stop <= 0 ||
    riskTarget.targets.length === 0 ||
    riskTarget.targets.some((target) => target.price <= 0)
  ) {
    vetoes.push({
      code: 'invalid_risk',
      message: 'Risk, entry, stop, and target must be positive.',
    });
  }
  if (riskTarget.riskR > policy.riskLimits.maxRiskR) {
    vetoes.push({
      code: 'risk_limit_exceeded',
      message: `Risk ${riskTarget.riskR}R exceeds max ${policy.riskLimits.maxRiskR}R.`,
    });
  }
  if (!selectedTarget) {
    vetoes.push({
      code: 'missing_target',
      message: `No ${policy.riskLimits.conservativeTarget} target is available.`,
    });
  }
  if (
    (selectedTarget?.rewardToRisk ?? riskTarget.rewardToRisk) < policy.riskLimits.minRewardToRisk
  ) {
    vetoes.push({
      code: 'insufficient_reward_to_risk',
      message: `Reward-to-risk ${selectedTarget?.rewardToRisk ?? riskTarget.rewardToRisk} is below ${policy.riskLimits.minRewardToRisk}.`,
    });
  }
  return gate('risk_target', vetoes, ['Risk and first target must meet configured limits.']);
}

function confidenceGate(
  confidence: ConfidenceEstimate,
  policy: DecisionGatePolicy,
): DecisionGateResult {
  const vetoes: DecisionVeto[] = [];
  if (confidence.value < policy.minConfidence) {
    vetoes.push({
      code: 'insufficient_confidence',
      message: `Confidence ${confidence.value} is below ${policy.minConfidence}.`,
    });
  }
  if (confidence.sampleSize < policy.minSamples) {
    vetoes.push({
      code: 'insufficient_samples',
      message: `Sample size ${confidence.sampleSize} is below ${policy.minSamples}.`,
    });
  }
  if (confidence.calibrationError > policy.maxCalibrationError) {
    vetoes.push({
      code: 'poor_calibration',
      message: `Calibration error ${confidence.calibrationError} exceeds ${policy.maxCalibrationError}.`,
    });
  }
  return gate('confidence', vetoes, ['Confidence must be calibrated and statistically supported.']);
}

function gate(
  gateName: DecisionGateResult['gate'],
  vetoes: readonly DecisionVeto[],
  reasons: readonly string[],
): DecisionGateResult {
  return {
    gate: gateName,
    status: vetoes.length > 0 ? 'veto' : 'pass',
    vetoes,
    reasons,
  };
}

export function scoreEvidence(
  evidence: EvidenceCollapseResult,
  policy: DecisionGatePolicy,
): number {
  if (evidence.groups.length === 0) return evidence.score;
  return Number(
    evidence.groups
      .reduce(
        (sum, group) =>
          sum + group.strength * (policy.evidenceWeights[group.group] ?? group.weight),
        0,
      )
      .toFixed(4),
  );
}

export function selectPolicyTarget(
  riskTarget: RiskTargetCandidate,
  policy: DecisionGatePolicy,
): RiskTargetCandidate['targets'][number] | undefined {
  if (policy.riskLimits.conservativeTarget === 'target_1') {
    return riskTarget.targets.find((target) => target.label === 'target_1');
  }
  return [...riskTarget.targets].sort((left, right) => right.rewardToRisk - left.rewardToRisk)[0];
}
