import { randomUUID } from 'node:crypto';
import type {
  JournalTrade,
  LedgerPosting,
  PaperAccount,
  PaperAuditEvent,
  PaperBar,
  PaperExecutionModel,
  PaperFill,
  PaperOrder,
  PaperOrderSide,
  PaperOrderType,
  PaperPosition,
  PaperStateStore,
  PaperWorkspaceState,
} from '../domain/paper.js';

const DEFAULT_MODEL: PaperExecutionModel = {
  version: 'paper-execution-v1',
  feeBps: 1,
  spreadBps: 2,
  slippageBps: 1,
  latencyMs: 250,
  maximumBarParticipation: 0.1,
  intrabarPolicy: 'stop_first',
};

const emptyState = (): PaperWorkspaceState => ({
  accounts: [],
  orders: [],
  fills: [],
  positions: [],
  ledger: [],
  journal: [],
  audit: [],
});

export class PaperTradingError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: 400 | 403 | 404 | 409 = 400,
  ) {
    super(code);
  }
}

export class PaperTradingService {
  constructor(
    private readonly store: PaperStateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createAccount(
    workspaceId: string,
    input: Readonly<{
      name: string;
      startingBalance: number;
      currency?: string;
      idempotencyKey: string;
    }>,
  ): Promise<PaperAccount> {
    const state = await this.state(workspaceId);
    const duplicate = state.audit.find(
      (event) =>
        event.action === 'paper.account.created' &&
        event.metadata.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) return this.requireAccount(state, String(duplicate.metadata.accountId));
    if (input.startingBalance <= 0) throw new PaperTradingError('invalid_starting_balance');
    const createdAt = this.now();
    const account: PaperAccount = {
      id: randomUUID(),
      workspaceId,
      name: input.name.trim() || 'Paper account',
      currency: input.currency ?? 'USD',
      startingBalance: input.startingBalance,
      cashBalance: input.startingBalance,
      equity: input.startingBalance,
      status: 'active',
      version: 1,
      executionModel: DEFAULT_MODEL,
      createdAt,
    };
    const next = {
      ...state,
      accounts: [...state.accounts, account],
      ledger: [
        ...state.ledger,
        {
          id: randomUUID(),
          accountId: account.id,
          kind: 'deposit' as const,
          occurredAt: createdAt,
          postings: [
            { account: 'cash', amount: input.startingBalance },
            { account: 'paper_capital', amount: -input.startingBalance },
          ],
        },
      ],
      audit: [
        ...state.audit,
        audit(workspaceId, account.id, 'paper.account.created', createdAt, {
          accountId: account.id,
          idempotencyKey: input.idempotencyKey,
        }),
      ],
    };
    await this.store.save(workspaceId, next);
    return account;
  }

  async listAccounts(workspaceId: string): Promise<readonly PaperAccount[]> {
    return (await this.state(workspaceId)).accounts;
  }

  async placeOrder(
    workspaceId: string,
    accountId: string,
    input: Readonly<{
      idempotencyKey: string;
      instrumentId: string;
      side: PaperOrderSide;
      type: PaperOrderType;
      quantity: number;
      limitPrice?: number;
      stopPrice?: number;
      referencePrice: number;
      confirmed: boolean;
      initialRiskPerUnit?: number;
    }>,
  ): Promise<PaperOrder> {
    const state = await this.state(workspaceId);
    const account = this.requireAccount(state, accountId);
    const duplicate = state.orders.find(
      (order) => order.accountId === accountId && order.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) return duplicate;
    if (!input.confirmed) throw new PaperTradingError('explicit_confirmation_required');
    if (account.status !== 'active') throw new PaperTradingError('account_not_active', 409);
    validateOrder(input);
    const notional = input.quantity * input.referencePrice;
    const maxNotional = account.equity * 0.25;
    const submittedAt = this.now();
    const rejected = notional > maxNotional;
    const order: PaperOrder = {
      id: randomUUID(),
      workspaceId,
      accountId,
      idempotencyKey: input.idempotencyKey,
      instrumentId: input.instrumentId,
      side: input.side,
      type: input.type,
      quantity: input.quantity,
      ...(input.limitPrice !== undefined ? { limitPrice: input.limitPrice } : {}),
      ...(input.stopPrice !== undefined ? { stopPrice: input.stopPrice } : {}),
      status: rejected ? 'rejected' : 'pending',
      submittedAt,
      eligibleAt: new Date(submittedAt.getTime() + account.executionModel.latencyMs),
      filledQuantity: 0,
      ...(rejected ? { rejectionReason: 'maximum_notional_exceeded' } : {}),
    };
    const next = {
      ...state,
      orders: [...state.orders, order],
      audit: [
        ...state.audit,
        audit(
          workspaceId,
          accountId,
          rejected ? 'paper.order.rejected' : 'paper.order.submitted',
          submittedAt,
          {
            orderId: order.id,
            idempotencyKey: input.idempotencyKey,
            initialRiskPerUnit: input.initialRiskPerUnit ?? 0,
          },
        ),
      ],
    };
    await this.store.save(workspaceId, next);
    return order;
  }

  async cancelOrder(workspaceId: string, accountId: string, orderId: string): Promise<PaperOrder> {
    const state = await this.state(workspaceId);
    this.requireAccount(state, accountId);
    const order = this.requireOrder(state, accountId, orderId);
    if (order.status !== 'pending') throw new PaperTradingError('order_not_cancellable', 409);
    const cancelled = { ...order, status: 'cancelled' as const };
    const occurredAt = this.now();
    await this.store.save(workspaceId, {
      ...state,
      orders: state.orders.map((item) => (item.id === orderId ? cancelled : item)),
      audit: [
        ...state.audit,
        audit(workspaceId, accountId, 'paper.order.cancelled', occurredAt, { orderId }),
      ],
    });
    return cancelled;
  }

  async processBar(
    workspaceId: string,
    accountId: string,
    bar: PaperBar,
  ): Promise<readonly PaperFill[]> {
    let state = await this.state(workspaceId);
    const account = this.requireAccount(state, accountId);
    const fills: PaperFill[] = [];
    for (const order of state.orders.filter(
      (item) =>
        item.accountId === accountId &&
        item.instrumentId === bar.instrumentId &&
        item.status === 'pending',
    )) {
      if (order.eligibleAt > bar.closeTime) continue;
      const quote = fillQuote(order, bar);
      if (quote === undefined) continue;
      const available = Math.max(
        0,
        Math.floor(bar.volume * account.executionModel.maximumBarParticipation),
      );
      const quantity = Math.min(order.quantity - order.filledQuantity, available);
      if (quantity <= 0) continue;
      const adverseBps = account.executionModel.spreadBps / 2 + account.executionModel.slippageBps;
      const price =
        quote * (order.side === 'buy' ? 1 + adverseBps / 10_000 : 1 - adverseBps / 10_000);
      const fee = (price * quantity * account.executionModel.feeBps) / 10_000;
      const fill: PaperFill = {
        id: randomUUID(),
        orderId: order.id,
        accountId,
        instrumentId: order.instrumentId,
        side: order.side,
        quantity,
        price,
        fee,
        slippage: Math.abs(price - quote) * quantity,
        occurredAt: bar.closeTime,
        executionVersion: account.executionModel.version,
        origin: 'paper',
      };
      state = applyFill(state, account, order, fill);
      fills.push(fill);
    }
    const marked = markAccountToMarket(state, accountId, bar.instrumentId, bar.close);
    if (fills.length || marked !== state) {
      state = marked;
      await this.store.save(workspaceId, state);
    }
    return fills;
  }

  async snapshot(workspaceId: string, accountId: string): Promise<PaperWorkspaceState> {
    const state = await this.state(workspaceId);
    this.requireAccount(state, accountId);
    return {
      accounts: state.accounts.filter((x) => x.id === accountId),
      orders: state.orders.filter((x) => x.accountId === accountId),
      fills: state.fills.filter((x) => x.accountId === accountId),
      positions: state.positions.filter((x) => x.accountId === accountId),
      ledger: state.ledger.filter((x) => x.accountId === accountId),
      journal: state.journal.filter((x) => x.accountId === accountId),
      audit: state.audit.filter((x) => x.accountId === accountId),
    };
  }

  async statistics(
    workspaceId: string,
    accountId: string,
  ): Promise<
    Readonly<{
      origin: 'paper';
      definitionVersion: string;
      sampleSize: number;
      expectancyR?: number;
      realizedPnl: number;
      totalFees: number;
      totalSlippage: number;
    }>
  > {
    const snapshot = await this.snapshot(workspaceId, accountId);
    const closed = snapshot.journal.filter((trade) => trade.status === 'closed');
    const measured = closed.flatMap((trade) =>
      trade.returnR === undefined ? [] : [trade.returnR],
    );
    return {
      origin: 'paper',
      definitionVersion: 'paper-statistics-v1',
      sampleSize: closed.length,
      ...(measured.length
        ? { expectancyR: measured.reduce((sum, value) => sum + value, 0) / measured.length }
        : {}),
      realizedPnl: snapshot.positions.reduce((sum, position) => sum + position.realizedPnl, 0),
      totalFees: snapshot.fills.reduce((sum, fill) => sum + fill.fee, 0),
      totalSlippage: snapshot.fills.reduce((sum, fill) => sum + fill.slippage, 0),
    };
  }

  async updateJournal(
    workspaceId: string,
    accountId: string,
    tradeId: string,
    input: Readonly<{ notes: string; tags: readonly string[]; maeR?: number; mfeR?: number }>,
  ): Promise<JournalTrade> {
    const state = await this.state(workspaceId);
    this.requireAccount(state, accountId);
    const trade = state.journal.find((item) => item.id === tradeId && item.accountId === accountId);
    if (!trade) throw new PaperTradingError('journal_trade_not_found', 404);
    const updated: JournalTrade = {
      ...trade,
      notes: input.notes.trim(),
      tags: [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
      ...(input.maeR !== undefined ? { maeR: input.maeR } : {}),
      ...(input.mfeR !== undefined ? { mfeR: input.mfeR } : {}),
    };
    const occurredAt = this.now();
    await this.store.save(workspaceId, {
      ...state,
      journal: state.journal.map((item) => (item.id === tradeId ? updated : item)),
      audit: [
        ...state.audit,
        audit(workspaceId, accountId, 'paper.journal.updated', occurredAt, { tradeId }),
      ],
    });
    return updated;
  }

  async resetAccount(workspaceId: string, accountId: string): Promise<PaperAccount> {
    const state = await this.state(workspaceId);
    const account = this.requireAccount(state, accountId);
    const now = this.now();
    const reset = { ...account, status: 'reset' as const, resetAt: now };
    await this.store.save(workspaceId, {
      ...state,
      accounts: state.accounts.map((x) => (x.id === accountId ? reset : x)),
      ledger: [
        ...state.ledger,
        {
          id: randomUUID(),
          accountId,
          kind: 'reset' as const,
          occurredAt: now,
          postings: [
            { account: 'paper_capital', amount: account.cashBalance },
            { account: 'cash', amount: -account.cashBalance },
          ],
        },
      ],
      audit: [
        ...state.audit,
        audit(workspaceId, accountId, 'paper.account.reset', now, { accountId }),
      ],
    });
    return reset;
  }

  private async state(workspaceId: string): Promise<PaperWorkspaceState> {
    return (await this.store.load(workspaceId)) ?? emptyState();
  }
  private requireAccount(state: PaperWorkspaceState, accountId: string): PaperAccount {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) throw new PaperTradingError('paper_account_not_found', 404);
    return account;
  }
  private requireOrder(state: PaperWorkspaceState, accountId: string, orderId: string): PaperOrder {
    const order = state.orders.find((item) => item.id === orderId && item.accountId === accountId);
    if (!order) throw new PaperTradingError('paper_order_not_found', 404);
    return order;
  }
}

function validateOrder(input: {
  quantity: number;
  type: PaperOrderType;
  limitPrice?: number;
  stopPrice?: number;
  referencePrice: number;
}): void {
  if (input.quantity <= 0 || input.referencePrice <= 0)
    throw new PaperTradingError('invalid_order');
  if ((input.type === 'limit' || input.type === 'stop_limit') && !input.limitPrice)
    throw new PaperTradingError('limit_price_required');
  if ((input.type === 'stop' || input.type === 'stop_limit') && !input.stopPrice)
    throw new PaperTradingError('stop_price_required');
}

function fillQuote(order: PaperOrder, bar: PaperBar): number | undefined {
  if (order.type === 'market') return bar.open;
  if (order.type === 'limit')
    return order.side === 'buy' && bar.low <= order.limitPrice!
      ? Math.min(bar.open, order.limitPrice!)
      : order.side === 'sell' && bar.high >= order.limitPrice!
        ? Math.max(bar.open, order.limitPrice!)
        : undefined;
  if (order.type === 'stop')
    return order.side === 'buy' && bar.high >= order.stopPrice!
      ? Math.max(bar.open, order.stopPrice!)
      : order.side === 'sell' && bar.low <= order.stopPrice!
        ? Math.min(bar.open, order.stopPrice!)
        : undefined;
  const triggered =
    order.side === 'buy' ? bar.high >= order.stopPrice! : bar.low <= order.stopPrice!;
  if (!triggered) return undefined;
  return order.side === 'buy' && bar.low <= order.limitPrice!
    ? order.limitPrice
    : order.side === 'sell' && bar.high >= order.limitPrice!
      ? order.limitPrice
      : undefined;
}

function applyFill(
  state: PaperWorkspaceState,
  account: PaperAccount,
  order: PaperOrder,
  fill: PaperFill,
): PaperWorkspaceState {
  const signedQuantity = fill.side === 'buy' ? fill.quantity : -fill.quantity;
  const existing = state.positions.find(
    (item) => item.accountId === account.id && item.instrumentId === fill.instrumentId,
  );
  const oldQuantity = existing?.quantity ?? 0;
  const newQuantity = oldQuantity + signedQuantity;
  const closing = oldQuantity !== 0 && Math.sign(oldQuantity) !== Math.sign(signedQuantity);
  const closedQuantity = closing ? Math.min(Math.abs(oldQuantity), fill.quantity) : 0;
  const realized = closing
    ? closedQuantity *
      (fill.price - (existing?.averagePrice ?? fill.price)) *
      Math.sign(oldQuantity)
    : 0;
  const averagePrice =
    newQuantity === 0
      ? 0
      : closing
        ? Math.sign(newQuantity) === Math.sign(oldQuantity)
          ? existing!.averagePrice
          : fill.price
        : (Math.abs(oldQuantity) * (existing?.averagePrice ?? 0) + fill.quantity * fill.price) /
          Math.abs(newQuantity);
  const position: PaperPosition = {
    accountId: account.id,
    instrumentId: fill.instrumentId,
    quantity: newQuantity,
    averagePrice,
    realizedPnl: (existing?.realizedPnl ?? 0) + realized - fill.fee,
    updatedAt: fill.occurredAt,
  };
  const cashDelta =
    fill.side === 'buy'
      ? -(fill.price * fill.quantity + fill.fee)
      : fill.price * fill.quantity - fill.fee;
  const updatedAccount = {
    ...account,
    cashBalance: account.cashBalance + cashDelta,
    equity: account.equity + realized - fill.fee,
  };
  const postings: LedgerPosting[] =
    fill.side === 'buy'
      ? [
          { account: `position:${fill.instrumentId}`, amount: fill.price * fill.quantity },
          { account: 'fees', amount: fill.fee },
          { account: 'cash', amount: -(fill.price * fill.quantity + fill.fee) },
        ]
      : [
          { account: 'cash', amount: fill.price * fill.quantity - fill.fee },
          { account: 'fees', amount: fill.fee },
          { account: `position:${fill.instrumentId}`, amount: -fill.price * fill.quantity },
        ];
  const updatedOrder = {
    ...order,
    filledQuantity: order.filledQuantity + fill.quantity,
    averageFillPrice: fill.price,
    status:
      order.filledQuantity + fill.quantity >= order.quantity
        ? ('filled' as const)
        : ('pending' as const),
  };
  const journal = updateJournalForFill(state.journal, state.audit, order, fill, existing, realized);
  return {
    ...state,
    accounts: state.accounts.map((x) => (x.id === account.id ? updatedAccount : x)),
    orders: state.orders.map((x) => (x.id === order.id ? updatedOrder : x)),
    fills: [...state.fills, fill],
    positions: [
      ...state.positions.filter(
        (x) => !(x.accountId === account.id && x.instrumentId === fill.instrumentId),
      ),
      position,
    ],
    ledger: [
      ...state.ledger,
      {
        id: randomUUID(),
        accountId: account.id,
        fillId: fill.id,
        kind: 'fill',
        postings,
        occurredAt: fill.occurredAt,
      },
    ],
    journal,
    audit: [
      ...state.audit,
      audit(account.workspaceId, account.id, 'paper.order.filled', fill.occurredAt, {
        orderId: order.id,
        fillId: fill.id,
        executionVersion: fill.executionVersion,
      }),
    ],
  };
}

function updateJournalForFill(
  journal: readonly JournalTrade[],
  auditEvents: readonly PaperAuditEvent[],
  order: PaperOrder,
  fill: PaperFill,
  position: PaperPosition | undefined,
  realized: number,
): readonly JournalTrade[] {
  const open = journal.find(
    (trade) =>
      trade.accountId === order.accountId &&
      trade.instrumentId === order.instrumentId &&
      trade.status === 'open',
  );
  const submittedRisk = Number(
    auditEvents.find(
      (event) => event.action === 'paper.order.submitted' && event.metadata.orderId === order.id,
    )?.metadata.initialRiskPerUnit ?? 0,
  );
  if (
    !open ||
    !position ||
    position.quantity === 0 ||
    Math.sign(position.quantity) === (fill.side === 'buy' ? 1 : -1)
  ) {
    return [
      ...journal,
      {
        id: randomUUID(),
        workspaceId: order.workspaceId,
        accountId: order.accountId,
        instrumentId: order.instrumentId,
        origin: 'paper',
        status: 'open',
        direction: fill.side === 'buy' ? 'long' : 'short',
        quantity: fill.quantity,
        entryPrice: fill.price,
        ...(submittedRisk > 0 ? { initialRiskPerUnit: submittedRisk } : {}),
        fees: fill.fee,
        slippage: fill.slippage,
        openedAt: fill.occurredAt,
        notes: '',
        tags: [],
      },
    ];
  }
  const initialRisk = open.initialRiskPerUnit ?? 0;
  const netPnl = realized - open.fees - fill.fee;
  const closed: JournalTrade = {
    ...open,
    status: 'closed',
    exitPrice: fill.price,
    fees: open.fees + fill.fee,
    slippage: open.slippage + fill.slippage,
    closedAt: fill.occurredAt,
    durationMs: fill.occurredAt.getTime() - open.openedAt.getTime(),
    ...(initialRisk > 0
      ? {
          initialRiskPerUnit: initialRisk,
          returnR: netPnl / (initialRisk * Math.min(open.quantity, fill.quantity)),
        }
      : {}),
  };
  return journal.map((trade) => (trade.id === open.id ? closed : trade));
}

function audit(
  workspaceId: string,
  accountId: string,
  action: string,
  occurredAt: Date,
  metadata: Record<string, string | number | boolean>,
): PaperAuditEvent {
  return { id: randomUUID(), workspaceId, accountId, action, occurredAt, metadata };
}

export function ledgerIsBalanced(postings: readonly LedgerPosting[]): boolean {
  return Math.abs(postings.reduce((sum, posting) => sum + posting.amount, 0)) < 1e-8;
}

function markAccountToMarket(
  state: PaperWorkspaceState,
  accountId: string,
  instrumentId: string,
  close: number,
): PaperWorkspaceState {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return state;
  const marketValue = state.positions
    .filter((position) => position.accountId === accountId)
    .reduce(
      (sum, position) =>
        sum +
        position.quantity *
          (position.instrumentId === instrumentId ? close : position.averagePrice),
      0,
    );
  const equity = account.cashBalance + marketValue;
  if (equity === account.equity) return state;
  return {
    ...state,
    accounts: state.accounts.map((item) => (item.id === accountId ? { ...item, equity } : item)),
  };
}
