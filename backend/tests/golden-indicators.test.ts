import { describe, expect, it } from 'vitest';
import { IndicatorService } from '../src/application/indicator-service.js';
import type { Bar } from '../src/domain/market.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

describe('indicator golden vectors', () => {
  it('matches the known EMA, RSI, and ATR vector', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('2026-07-12T04:00:00.000Z', 100, 104, 99, 102),
      bar('2026-07-12T04:05:00.000Z', 102, 106, 101, 105),
      bar('2026-07-12T04:10:00.000Z', 105, 107, 103, 104),
      bar('2026-07-12T04:15:00.000Z', 104, 110, 103, 109),
    ]);
    const service = new IndicatorService(market);

    const values = await service.calculate({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T04:21:00.000Z'),
      periods: { ema: 3, rsi: 3, atr: 3 },
    });

    expect(values.map(({ kind, value, quality }) => ({ kind, value, quality }))).toEqual([
      { kind: 'ema', value: 106.3333, quality: 'ok' },
      { kind: 'rsi', value: 88.8889, quality: 'ok' },
      { kind: 'atr', value: 5.3333, quality: 'ok' },
    ]);
  });
});

describe('indicator property invariants', () => {
  it('keeps RSI bounded and ATR non-negative across monotonic generated series', async () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const market = new InMemoryMarketDataStore();
      await market.upsertBars(generatedBars(seed));
      const service = new IndicatorService(market);

      const values = await service.calculate({
        instrumentId: 'nse-nifty50',
        timeframe: '5m',
        asOf: new Date('2026-07-12T06:00:00.000Z'),
        periods: { ema: 5, rsi: 5, atr: 5 },
      });

      const rsi = values.find((value) => value.kind === 'rsi')?.value;
      const atr = values.find((value) => value.kind === 'atr')?.value;
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
      expect(atr).toBeGreaterThanOrEqual(0);
    }
  });
});

function generatedBars(seed: number): readonly Bar[] {
  return Array.from({ length: 12 }, (_, index) => {
    const close = 100 + seed + index * (seed % 3 === 0 ? -0.5 : 1.25);
    return bar(
      new Date(Date.UTC(2026, 6, 12, 4, index * 5)).toISOString(),
      close - 1,
      close + 2,
      close - 3,
      close,
    );
  });
}

function bar(openTimeIso: string, open: number, high: number, low: number, close: number): Bar {
  const openTime = new Date(openTimeIso);
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open,
    high,
    low,
    close,
    volume: 1000,
    source: 'golden-fixture',
    revision: 1,
    receivedAt: new Date(openTime.getTime() + 5 * 60 * 1000 + 1000),
  };
}
