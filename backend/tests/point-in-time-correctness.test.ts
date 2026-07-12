import { describe, expect, it } from 'vitest';
import { IndicatorService } from '../src/application/indicator-service.js';
import { RegimeService } from '../src/application/regime-service.js';
import type { Bar } from '../src/domain/market.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

describe('point-in-time correctness', () => {
  it('returns only revisions received by as_of and collapses duplicate bar revisions', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('2026-07-12T04:00:00.000Z', 100, 1, '2026-07-12T04:06:00.000Z'),
      bar('2026-07-12T04:05:00.000Z', 110, 1, '2026-07-12T04:11:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 120, 1, '2026-07-12T04:16:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 150, 2, '2026-07-12T05:00:00.000Z'),
    ]);

    const beforeCorrection = await market.listBars({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T04:30:00.000Z'),
      limit: 10,
    });
    const afterCorrection = await market.listBars({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T05:01:00.000Z'),
      limit: 10,
    });

    expect(beforeCorrection.map((candidate) => candidate.close)).toEqual([100, 110, 120]);
    expect(afterCorrection.map((candidate) => candidate.close)).toEqual([100, 110, 150]);
  });

  it('keeps indicators pinned to values known at as_of', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('2026-07-12T04:00:00.000Z', 100, 1, '2026-07-12T04:06:00.000Z'),
      bar('2026-07-12T04:05:00.000Z', 110, 1, '2026-07-12T04:11:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 120, 1, '2026-07-12T04:16:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 150, 2, '2026-07-12T05:00:00.000Z'),
    ]);
    const indicators = new IndicatorService(market);

    const beforeCorrection = await indicators.calculate({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T04:30:00.000Z'),
      periods: { ema: 3, rsi: 100, atr: 100 },
    });
    const afterCorrection = await indicators.calculate({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T05:01:00.000Z'),
      periods: { ema: 3, rsi: 100, atr: 100 },
    });

    expect(beforeCorrection.find((value) => value.kind === 'ema')?.value).toBe(110);
    expect(afterCorrection.find((value) => value.kind === 'ema')?.value).toBe(120);
  });

  it('keeps regime classification observed_at pinned to known closed bars', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('2026-07-12T04:00:00.000Z', 100, 1, '2026-07-12T04:06:00.000Z'),
      bar('2026-07-12T04:05:00.000Z', 110, 1, '2026-07-12T04:11:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 120, 1, '2026-07-12T04:16:00.000Z'),
      bar('2026-07-12T04:15:00.000Z', 130, 1, '2026-07-12T05:30:00.000Z'),
    ]);
    const regimes = new RegimeService(market);

    const regime = await regimes.classify({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T04:30:00.000Z'),
    });

    expect(regime.observedAt.toISOString()).toBe('2026-07-12T04:15:00.000Z');
    expect(regime.close).toBe(120);
  });
});

function bar(openTimeIso: string, close: number, revision: number, receivedAtIso: string): Bar {
  const openTime = new Date(openTimeIso);
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open: close - 1,
    high: close + 2,
    low: close - 3,
    close,
    volume: 1000,
    source: 'pit-fixture',
    revision,
    receivedAt: new Date(receivedAtIso),
  };
}
