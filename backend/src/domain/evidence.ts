export type EvidenceGroup =
  | 'structure'
  | 'trend'
  | 'momentum'
  | 'volatility_risk'
  | 'volume_liquidity'
  | 'higher_timeframe'
  | 'forecast';

export type EvidenceContribution = Readonly<{
  id: string;
  group: EvidenceGroup;
  strength: number;
  weight: number;
  source: string;
  observedAt: Date;
  correlatedWith?: readonly string[];
}>;

export type CollapsedEvidenceGroup = Readonly<{
  group: EvidenceGroup;
  representativeId: string;
  strength: number;
  weight: number;
  contributors: readonly string[];
  suppressedCorrelatedIds: readonly string[];
}>;

export type EvidenceCollapseResult = Readonly<{
  groups: readonly CollapsedEvidenceGroup[];
  score: number;
  warnings: readonly string[];
}>;
