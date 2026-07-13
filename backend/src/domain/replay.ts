import type { PublishedDecision } from './decisions.js';
import type { Bar, Timeframe } from './market.js';

export type ReplayEventOrderPolicy = 'observed_received_id';
export type ReplayRunStatus = 'ready' | 'running' | 'paused' | 'completed';
export type IntrabarFillPolicy = 'stop_first';
export type ReplayExitReason = 'stop' | 'target' | 'end_of_data';

export type ReplayIdentity = Readonly<{
  datasetHash: string;
  start: Date;
  end: Date;
  eventOrderPolicy: ReplayEventOrderPolicy;
  configurationVersions: Readonly<Record<string, string>>;
  pluginVersions: Readonly<Record<string, string>>;
  codeRevision: string;
  randomSeed: number;
}>;

export type ReplayEvent<T = unknown> = Readonly<{
  id: string;
  observedAt: Date;
  receivedAt: Date;
  payload: T;
}>;

export type ReplayCheckpoint = Readonly<{
  identityHash: string;
  cursor: number;
  replayTime: Date;
}>;

export type ReplayState = Readonly<{
  status: ReplayRunStatus;
  cursor: number;
  eventCount: number;
  replayTime: Date;
  speed: number;
}>;

export type ExecutionAssumptions = Readonly<{
  version: string;
  feeBpsPerSide: number;
  spreadBps: number;
  slippageBpsPerSide: number;
  intrabarFillPolicy: IntrabarFillPolicy;
}>;

export type ReplayDecision = Readonly<{
  decision: PublishedDecision;
  setupId: string;
  session: string;
  regime: string;
}>;

export type ReplayTradeOutcome = Readonly<{
  decisionId: string;
  instrumentId: string;
  timeframe: Timeframe;
  direction: 'long' | 'short';
  setupId: string;
  session: string;
  regime: string;
  confidence: number;
  openedAt: Date;
  closedAt: Date;
  entryPrice: number;
  exitPrice: number;
  initialRisk: number;
  grossPnl: number;
  costs: number;
  netPnl: number;
  returnR: number;
  maeR: number;
  mfeR: number;
  targetHit: boolean;
  exitReason: ReplayExitReason;
  barsHeld: number;
  executionVersion: string;
}>;

export type WalkForwardWindow = Readonly<{
  index: number;
  trainingBars: readonly Bar[];
  evaluationBars: readonly Bar[];
}>;

export type BacktestStrategyContext = Readonly<{
  asOf: Date;
  bars: readonly Bar[];
  windowIndex: number;
}>;

export interface BacktestStrategy {
  evaluate(context: BacktestStrategyContext): Promise<ReplayDecision> | ReplayDecision;
}

export type BacktestRequest = Readonly<{
  identity: ReplayIdentity;
  bars: readonly Bar[];
  strategy: BacktestStrategy;
  execution: ExecutionAssumptions;
  warmupBars: number;
  walkForward: Readonly<{
    trainingBars: number;
    evaluationBars: number;
  }>;
  minimumSamples: number;
}>;

export type BacktestBaseline = Readonly<{
  name: 'buy_and_hold' | 'always_abstain';
  netReturn: number;
  coverage: number;
}>;

export type BacktestResult = Readonly<{
  identityHash: string;
  decisions: readonly ReplayDecision[];
  outcomes: readonly ReplayTradeOutcome[];
  windows: readonly WalkForwardWindow[];
  baselines: readonly BacktestBaseline[];
  execution: ExecutionAssumptions;
}>;

export interface ReplayResultStore {
  save(result: BacktestResult): Promise<void>;
  findByIdentityHash(identityHash: string): Promise<BacktestResult | undefined>;
}
