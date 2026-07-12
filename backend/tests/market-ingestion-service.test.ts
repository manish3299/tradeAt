import { describe, expect, it } from 'vitest';
import { MarketIngestionService } from '../src/application/market-ingestion-service.js';
import type {
  Bar,
  Clock,
  LiveMarketEvent,
  LiveMarketProvider,
  LiveSubscription,
} from '../src/domain/market.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

const clock: Clock = {
  now: () => new Date('2026-07-12T04:30:00.000Z'),
};

describe('MarketIngestionService', () => {
  it('persists a live bar once and deduplicates repeated event ids', async () => {
    const market = new InMemoryMarketDataStore();
    const ingestion = new MarketIngestionService(market, clock);
    const liveEvent = barEvent('evt-1', '2026-07-12T04:00:00.000Z');

    await expect(ingestion.ingestEvent(liveEvent)).resolves.toMatchObject({
      decision: 'accepted',
      persistedBars: 1,
    });
    await expect(ingestion.ingestEvent(liveEvent)).resolves.toMatchObject({
      decision: 'deduplicated',
      reason: 'duplicate_event',
    });

    const bars = await market.listBars({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      limit: 1,
    });
    expect(bars.at(-1)?.openTime.toISOString()).toBe('2026-07-12T04:00:00.000Z');
  });

  it('rejects out-of-order non-correction events', async () => {
    const ingestion = new MarketIngestionService(new InMemoryMarketDataStore(), clock);
    await ingestion.ingestEvent(barEvent('evt-2', '2026-07-12T04:05:00.000Z'));

    await expect(
      ingestion.ingestEvent(barEvent('evt-3', '2026-07-12T04:00:00.000Z')),
    ).resolves.toMatchObject({
      decision: 'rejected',
      reason: 'out_of_order_event',
    });
  });

  it('accepts corrections only for known replaced events', async () => {
    const market = new InMemoryMarketDataStore();
    const ingestion = new MarketIngestionService(market, clock);
    const original = barEvent('evt-4', '2026-07-12T04:10:00.000Z', { close: 24700 });
    const unknownCorrection = barEvent('correction-missing', '2026-07-12T04:15:00.000Z', {
      type: 'correction',
      replacesEventId: 'missing',
      close: 24720,
    });
    const correction = barEvent('correction-known', '2026-07-12T04:15:00.000Z', {
      type: 'correction',
      replacesEventId: 'evt-4',
      close: 24725,
    });

    await expect(ingestion.ingestEvent(unknownCorrection)).resolves.toMatchObject({
      decision: 'rejected',
      reason: 'unknown_replacement',
    });
    await ingestion.ingestEvent(original);
    await expect(ingestion.ingestEvent(correction)).resolves.toMatchObject({
      decision: 'accepted',
      correctionsApplied: 1,
    });

    const bars = await market.listBars({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      limit: 1,
    });
    expect(bars.at(-1)?.close).toBe(24725);
  });

  it('tracks bar gaps and freshness by instrument', async () => {
    const ingestion = new MarketIngestionService(new InMemoryMarketDataStore(), clock, {
      staleAfterSeconds: 60,
    });

    await ingestion.ingestEvent(barEvent('evt-5', '2026-07-12T04:00:00.000Z'));
    const gap = await ingestion.ingestEvent(barEvent('evt-6', '2026-07-12T04:15:00.000Z'));

    expect(gap).toMatchObject({ decision: 'accepted', gapsDetected: 1 });
    expect(
      ingestion.getFreshness('nse-nifty50', new Date('2026-07-12T04:15:30.000Z')),
    ).toMatchObject({
      status: 'fresh',
      gapCount: 1,
    });
    expect(
      ingestion.getFreshness('nse-nifty50', new Date('2026-07-12T04:17:00.000Z')),
    ).toMatchObject({
      status: 'stale',
      gapCount: 1,
    });
  });

  it('reconnects after a transient provider failure', async () => {
    const ingestion = new MarketIngestionService(new InMemoryMarketDataStore(), clock);
    const provider = new FlakyProvider([barEvent('evt-7', '2026-07-12T04:20:00.000Z')]);

    const summary = await ingestion.runLive(
      provider,
      ['nse-nifty50'],
      new AbortController().signal,
    );

    expect(summary).toMatchObject({
      attempts: 2,
      accepted: 1,
      deduplicated: 0,
      rejected: 0,
    });
    expect(summary.states.map((state) => state.status)).toContain('reconnecting');
  });
});

class FlakyProvider implements LiveMarketProvider {
  readonly source = 'flaky-fixture';
  private attempts = 0;

  constructor(private readonly events: readonly LiveMarketEvent[]) {}

  async connect(subscription: LiveSubscription, signal: AbortSignal): Promise<void> {
    this.attempts += 1;
    if (this.attempts === 1) throw new Error('temporary disconnect');
    for (const event of this.events) {
      if (signal.aborted) return;
      await subscription.onEvent(event);
    }
  }
}

function barEvent(
  eventId: string,
  openTimeIso: string,
  overrides: Readonly<{
    type?: LiveMarketEvent['type'];
    replacesEventId?: string;
    close?: number;
  }> = {},
): LiveMarketEvent {
  const openTime = new Date(openTimeIso);
  const bar: Bar = {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open: 24600,
    high: Math.max(24610, overrides.close ?? 24605),
    low: 24590,
    close: overrides.close ?? 24605,
    volume: 1000,
    source: 'fixture-live',
    revision: 1,
    receivedAt: new Date(openTime.getTime() + 1000),
  };
  return {
    eventId,
    type: overrides.type ?? 'bar',
    instrumentId: bar.instrumentId,
    observedAt: bar.openTime,
    receivedAt: bar.receivedAt,
    source: bar.source,
    payload: bar,
    ...(overrides.replacesEventId ? { replacesEventId: overrides.replacesEventId } : {}),
  };
}
