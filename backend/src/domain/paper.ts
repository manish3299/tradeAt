import type { Bar } from './market.js';

export type PaperOrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type PaperOrderSide = 'buy' | 'sell';
export type PaperOrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';

export type PaperExecutionModel = Readonly<{
  version: string;
  feeBps: number;
  spreadBps: number;
  slippageBps: number;
  latencyMs: number;
  maximumBarParticipation: number;
  intrabarPolicy: 'stop_first';
}>;

export type PaperAccount = Readonly<{
  id: string;
  workspaceId: string;
  name: string;
  currency: string;
  startingBalance: number;
  cashBalance: number;
  equity: number;
  status: 'active' | 'reset';
  version: number;
  executionModel: PaperExecutionModel;
  createdAt: Date;
  resetAt?: Date;
}>;

export type PaperOrder = Readonly<{
  id: string;
  workspaceId: string;
  accountId: string;
  idempotencyKey: string;
  instrumentId: string;
  side: PaperOrderSide;
  type: PaperOrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  status: PaperOrderStatus;
  submittedAt: Date;
  eligibleAt: Date;
  filledQuantity: number;
  averageFillPrice?: number;
  rejectionReason?: string;
}>;

export type PaperFill = Readonly<{
  id: string;
  orderId: string;
  accountId: string;
  instrumentId: string;
  side: PaperOrderSide;
  quantity: number;
  price: number;
  fee: number;
  slippage: number;
  occurredAt: Date;
  executionVersion: string;
  origin: 'paper';
}>;

export type PaperPosition = Readonly<{
  accountId: string;
  instrumentId: string;
  quantity: number;
  averagePrice: number;
  realizedPnl: number;
  updatedAt: Date;
}>;

export type LedgerPosting = Readonly<{ account: string; amount: number }>;
export type LedgerTransaction = Readonly<{
  id: string;
  accountId: string;
  fillId?: string;
  kind: 'deposit' | 'fill' | 'reset';
  postings: readonly LedgerPosting[];
  occurredAt: Date;
}>;

export type JournalTrade = Readonly<{
  id: string;
  workspaceId: string;
  accountId: string;
  instrumentId: string;
  origin: 'paper';
  status: 'open' | 'closed';
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  initialRiskPerUnit?: number;
  fees: number;
  slippage: number;
  openedAt: Date;
  closedAt?: Date;
  durationMs?: number;
  returnR?: number;
  maeR?: number;
  mfeR?: number;
  notes: string;
  tags: readonly string[];
}>;

export type PaperAuditEvent = Readonly<{
  id: string;
  workspaceId: string;
  accountId: string;
  action: string;
  occurredAt: Date;
  metadata: Readonly<Record<string, string | number | boolean>>;
}>;

export type PaperWorkspaceState = Readonly<{
  accounts: readonly PaperAccount[];
  orders: readonly PaperOrder[];
  fills: readonly PaperFill[];
  positions: readonly PaperPosition[];
  ledger: readonly LedgerTransaction[];
  journal: readonly JournalTrade[];
  audit: readonly PaperAuditEvent[];
}>;

export interface PaperStateStore {
  load(workspaceId: string): Promise<PaperWorkspaceState | undefined>;
  save(workspaceId: string, state: PaperWorkspaceState): Promise<void>;
  close?(): Promise<void>;
}

export type PaperBar = Pick<
  Bar,
  'instrumentId' | 'openTime' | 'closeTime' | 'open' | 'high' | 'low' | 'close' | 'volume'
>;
