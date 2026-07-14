import { describe, expect, it } from 'vitest';
import { ledgerIsBalanced, PaperTradingService } from '../src/application/paper-trading-service.js';
import type { PaperTradingError } from '../src/application/paper-trading-service.js';
import type { PublishedDecision } from '../src/domain/decisions.js';
import { InMemoryPaperStateStore } from '../src/infrastructure/paper/in-memory-paper-state-store.js';

describe('PaperTradingService', () => {
  it('creates idempotent orders, deterministic fills, positions, balanced ledger, and journal entries', async () => {
    const service = serviceAt(new Date('2026-07-13T09:00:00.000Z'));
    const account = await service.createAccount('workspace-a', {
      name: 'Forward proof',
      startingBalance: 100_000,
      idempotencyKey: 'account-1',
    });
    const input = {
      idempotencyKey: 'order-1',
      instrumentId: 'nse-nifty50',
      side: 'buy' as const,
      type: 'limit' as const,
      quantity: 2,
      limitPrice: 100,
      referencePrice: 100,
      confirmed: true,
    };
    const first = await service.placeOrder('workspace-a', account.id, input);
    const duplicate = await service.placeOrder('workspace-a', account.id, input);
    expect(duplicate.id).toBe(first.id);

    const fills = await service.processBar('workspace-a', account.id, bar());
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({
      origin: 'paper',
      quantity: 2,
      executionVersion: 'paper-execution-v1',
    });
    const snapshot = await service.snapshot('workspace-a', account.id);
    expect(snapshot.orders[0]?.status).toBe('filled');
    expect(snapshot.positions[0]?.quantity).toBe(2);
    expect(snapshot.journal[0]).toMatchObject({
      origin: 'paper',
      status: 'open',
      direction: 'long',
    });
    expect(snapshot.ledger.every((transaction) => ledgerIsBalanced(transaction.postings))).toBe(
      true,
    );
  });

  it('requires confirmation, applies risk limits, and isolates workspaces', async () => {
    const service = serviceAt(new Date('2026-07-13T09:00:00.000Z'));
    const account = await service.createAccount('workspace-a', {
      name: 'Paper',
      startingBalance: 1_000,
      idempotencyKey: 'account-1',
    });
    await expect(
      service.placeOrder('workspace-a', account.id, {
        idempotencyKey: 'unconfirmed',
        instrumentId: 'fixture',
        side: 'buy',
        type: 'market',
        quantity: 1,
        referencePrice: 100,
        confirmed: false,
      }),
    ).rejects.toMatchObject({ code: 'explicit_confirmation_required' });
    const rejected = await service.placeOrder('workspace-a', account.id, {
      idempotencyKey: 'too-large',
      instrumentId: 'fixture',
      side: 'buy',
      type: 'market',
      quantity: 3,
      referencePrice: 100,
      confirmed: true,
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      rejectionReason: 'maximum_notional_exceeded',
    });

    const exposureRejected = await service.placeOrder('workspace-a', account.id, {
      idempotencyKey: 'too-much-exposure',
      instrumentId: 'fixture-2',
      side: 'buy',
      type: 'market',
      quantity: 2,
      referencePrice: 400,
      confirmed: true,
    });
    expect(exposureRejected).toMatchObject({
      status: 'rejected',
      rejectionReason: 'maximum_notional_exceeded',
    });
    await expect(service.snapshot('workspace-b', account.id)).rejects.toEqual(
      expect.objectContaining<Partial<PaperTradingError>>({ code: 'paper_account_not_found' }),
    );
  });

  it('rejects excessive concentration in a single instrument', async () => {
    const service = serviceAt(new Date('2026-07-13T09:00:00.000Z'));
    const account = await service.createAccount('workspace-a', {
      name: 'Paper',
      startingBalance: 10_000,
      idempotencyKey: 'account-1',
    });

    const first = await service.placeOrder('workspace-a', account.id, {
      idempotencyKey: 'instrument-1',
      instrumentId: 'nse-nifty50',
      side: 'buy',
      type: 'market',
      quantity: 1,
      referencePrice: 1_000,
      confirmed: true,
    });
    expect(first.status).toBe('pending');

    const second = await service.placeOrder('workspace-a', account.id, {
      idempotencyKey: 'instrument-2',
      instrumentId: 'nse-nifty50',
      side: 'buy',
      type: 'market',
      quantity: 1,
      referencePrice: 1_000,
      confirmed: true,
    });
    expect(second).toMatchObject({
      status: 'rejected',
      rejectionReason: 'maximum_instrument_exposure_exceeded',
    });
  });

  it('places a paper order from a decision using its risk plan', async () => {
    const service = serviceAt(new Date('2026-07-13T09:00:00.000Z'));
    const account = await service.createAccount('workspace-a', {
      name: 'Paper',
      startingBalance: 10_000,
      idempotencyKey: 'account-1',
    });
    const decision: PublishedDecision = {
      id: 'decision-1',
      version: '1.0.0',
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      evaluatedAt: new Date('2026-07-13T09:00:00.000Z'),
      direction: 'long',
      score: 0.8,
      confidence: 0.7,
      entryZone: { low: 99.8, high: 100.2 },
      stop: 98,
      targets: [{ label: 'target_1', price: 104, rewardToRisk: 2 }],
      riskR: 1,
      rewardToRisk: 2,
      positionSizing: { riskPercent: 0.01, maxRiskPercent: 0.02, suggestedSize: 0.1 },
      tradeManagement: {
        partialTakeProfit: { enabled: true, atR: 1, percent: 0.5 },
        breakEven: { enabled: true, atR: 1.5 },
        trailingStop: { enabled: false, trailR: 1 },
      },
      vetoes: [],
      reasons: [],
      gates: [],
      policyVersion: '1.0.0',
      policyHash: 'hash',
    };

    const order = await service.placeDecisionOrder('workspace-a', account.id, {
      idempotencyKey: 'decision-order-1',
      decision,
      confirmed: true,
    });

    expect(order.side).toBe('buy');
    expect(order.quantity).toBeGreaterThan(0);
    expect(order.limitPrice).toBeCloseTo(100);
  });

  it('has no broker dependency and records account reset history', async () => {
    const service = serviceAt(new Date('2026-07-13T09:00:00.000Z'));
    const account = await service.createAccount('workspace-a', {
      name: 'Paper',
      startingBalance: 10_000,
      idempotencyKey: 'account-1',
    });
    await service.resetAccount('workspace-a', account.id);
    const snapshot = await service.snapshot('workspace-a', account.id);
    expect(snapshot.accounts[0]?.status).toBe('reset');
    expect(snapshot.audit.map((event) => event.action)).toContain('paper.account.reset');
    expect(snapshot.ledger.at(-1)?.kind).toBe('reset');
  });
});

function serviceAt(now: Date): PaperTradingService {
  return new PaperTradingService(new InMemoryPaperStateStore(), () => now);
}
function bar() {
  return {
    instrumentId: 'nse-nifty50',
    openTime: new Date('2026-07-13T09:00:00.000Z'),
    closeTime: new Date('2026-07-13T09:05:00.000Z'),
    open: 101,
    high: 102,
    low: 99,
    close: 100,
    volume: 100,
  };
}
