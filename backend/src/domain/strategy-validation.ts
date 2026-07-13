export type StrategyMetrics = Readonly<{
  sampleSize: number;
  expectancyR: number;
  brierScore: number;
  maximumDrawdownPercent: number;
  regimeExpectancy: Readonly<Record<string, number>>;
}>;
export type RegistryEntry = Readonly<{
  id: string;
  workspaceId: string;
  kind: 'configuration' | 'dataset';
  name: string;
  version: string;
  hash: string;
  payload: Readonly<Record<string, unknown>>;
  createdAt: Date;
}>;
export type StrategyComparison = Readonly<{
  id: string;
  workspaceId: string;
  baseline: Readonly<{ configurationId: string; datasetId: string; metrics: StrategyMetrics }>;
  candidate: Readonly<{ configurationId: string; datasetId: string; metrics: StrategyMetrics }>;
  gates: Readonly<{
    sampleSize: boolean;
    expectancy: boolean;
    calibration: boolean;
    drawdown: boolean;
    stability: boolean;
  }>;
  eligibleForApproval: boolean;
  status: 'approval_required';
  createdAt: Date;
}>;
