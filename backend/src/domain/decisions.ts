import type { EvidenceCollapseResult, EvidenceGroup } from './evidence.js';
import type { MarketStatus, Timeframe } from './market.js';
import type { RegimeClassification } from './regimes.js';

export type DecisionDirection = 'long' | 'short' | 'abstain';
export type DecisionGateName =
  | 'data'
  | 'regime'
  | 'setup'
  | 'evidence'
  | 'risk_target'
  | 'confidence';
export type DecisionGateStatus = 'pass' | 'veto';

export type DecisionVetoCode =
  | 'stale_data'
  | 'gapped_data'
  | 'insufficient_regime_data'
  | 'unknown_regime'
  | 'no_valid_setup'
  | 'insufficient_evidence'
  | 'invalid_risk'
  | 'risk_limit_exceeded'
  | 'missing_target'
  | 'insufficient_reward_to_risk'
  | 'insufficient_confidence'
  | 'insufficient_samples'
  | 'poor_calibration';

export type DecisionGateResult = Readonly<{
  gate: DecisionGateName;
  status: DecisionGateStatus;
  vetoes: readonly DecisionVeto[];
  reasons: readonly string[];
}>;

export type DecisionVeto = Readonly<{
  code: DecisionVetoCode;
  message: string;
}>;

export type SetupCandidate = Readonly<{
  id: string;
  direction: Exclude<DecisionDirection, 'abstain'>;
  valid: boolean;
  structure: 'breakout' | 'pullback' | 'reversal' | 'range_rejection';
  reasons: readonly string[];
}>;

export type RiskTargetCandidate = Readonly<{
  entry: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stop: number;
  targets: readonly DecisionTarget[];
  rewardToRisk: number;
  riskR: number;
}>;

export type DecisionTarget = Readonly<{
  label: 'target_1' | 'target_2';
  price: number;
  rewardToRisk: number;
}>;

export type ConfidenceEstimate = Readonly<{
  value: number;
  sampleSize: number;
  calibrationError: number;
}>;

export type EvidenceWeights = Readonly<Record<EvidenceGroup, number>>;

export type DecisionRiskLimits = Readonly<{
  maxRiskR: number;
  minRewardToRisk: number;
  conservativeTarget: 'target_1' | 'best_available';
}>;

export type DecisionGatePolicy = Readonly<{
  version: string;
  minEvidenceScore: number;
  minConfidence: number;
  minSamples: number;
  maxCalibrationError: number;
  evidenceWeights: EvidenceWeights;
  riskLimits: DecisionRiskLimits;
}>;

export type DecisionGateInput = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  evaluatedAt: Date;
  marketStatus: MarketStatus;
  regime: RegimeClassification;
  setup: SetupCandidate;
  evidence: EvidenceCollapseResult;
  riskTarget: RiskTargetCandidate;
  confidence: ConfidenceEstimate;
  policy: DecisionGatePolicy;
}>;

export type DecisionGateEvaluation = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  evaluatedAt: Date;
  policyVersion: string;
  status: DecisionGateStatus;
  gates: readonly DecisionGateResult[];
  vetoes: readonly DecisionVeto[];
}>;

export type PublishedDecision = Readonly<{
  id: string;
  version: string;
  instrumentId: string;
  timeframe: Timeframe;
  evaluatedAt: Date;
  direction: DecisionDirection;
  score: number;
  confidence: number;
  entryZone?: Readonly<{
    low: number;
    high: number;
  }>;
  stop?: number;
  targets: readonly DecisionTarget[];
  riskR?: number;
  rewardToRisk?: number;
  vetoes: readonly DecisionVeto[];
  reasons: readonly string[];
  gates: readonly DecisionGateResult[];
  policyVersion: string;
  policyHash: string;
}>;
