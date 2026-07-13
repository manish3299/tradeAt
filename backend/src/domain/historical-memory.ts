import type { Timeframe } from './market.js';

export type MemoryFeatures = Readonly<{
  momentumPct: number;
  rangePct: number;
  volumeRatio: number;
  decisionScore: number;
}>;

export type HistoricalSnapshot = Readonly<{
  id: string;
  workspaceId: string;
  instrumentId: string;
  timeframe: Timeframe;
  observedAt: Date;
  availableAt: Date;
  session: string;
  regime: string;
  setupId: string;
  decisionId: string;
  direction: 'long' | 'short' | 'abstain';
  features: MemoryFeatures;
  outcome?: Readonly<{ returnR: number; targetHit: boolean; closedAt: Date }>;
  versions: Readonly<{ feature: string; regime: string; decision: string; policy: string }>;
  provenance: Readonly<{
    datasetHash: string;
    source: 'replay' | 'paper' | 'manual';
    inputStart: Date;
    inputEnd: Date;
  }>;
}>;

export interface HistoricalMemoryStore {
  save(snapshot: HistoricalSnapshot): Promise<void>;
  listAvailable(workspaceId: string, asOf: Date): Promise<readonly HistoricalSnapshot[]>;
  close?(): Promise<void>;
}
