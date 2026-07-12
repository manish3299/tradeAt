import { describe, expect, it } from 'vitest';
import { RegimeService } from '../src/application/regime-service.js';
import type { Bar } from '../src/domain/market.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

describe('RegimeService structure classification', () => {
  it('classifies breakout structure and higher-timeframe trend point-in-time', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('5m', '2026-07-12T04:00:00.000Z', 100, 103, 98, 101),
      bar('5m', '2026-07-12T04:05:00.000Z', 101, 104, 99, 102),
      bar('5m', '2026-07-12T04:10:00.000Z', 102, 105, 100, 103),
      bar('5m', '2026-07-12T04:15:00.000Z', 103, 106, 101, 104),
      bar('5m', '2026-07-12T04:20:00.000Z', 104, 107, 102, 105),
      bar('5m', '2026-07-12T04:25:00.000Z', 105, 112, 104, 111),
      bar('15m', '2026-07-12T03:00:00.000Z', 90, 93, 88, 91),
      bar('15m', '2026-07-12T03:15:00.000Z', 91, 95, 90, 94),
      bar('15m', '2026-07-12T03:30:00.000Z', 94, 98, 93, 97),
      bar('15m', '2026-07-12T03:45:00.000Z', 97, 101, 96, 100),
      bar('15m', '2026-07-12T04:00:00.000Z', 100, 105, 99, 104),
      bar('15m', '2026-07-12T04:15:00.000Z', 104, 110, 103, 109),
    ]);
    const regimes = new RegimeService(market);

    const result = await regimes.classify({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      higherTimeframe: '15m',
      asOf: new Date('2026-07-12T04:31:00.000Z'),
    });

    expect(result).toMatchObject({
      definitionVersion: '1.0.0',
      quality: 'ok',
      priceStructure: 'breakout',
      higherTimeframe: '15m',
      higherTimeframeTrend: 'uptrend',
      observedAt: new Date('2026-07-12T04:30:00.000Z'),
      missingBars: 0,
    });
    expect(result.configurationHash).toHaveLength(64);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'Recent highs/lows classified price structure as breakout.',
        'Higher-timeframe trend classified as uptrend.',
      ]),
    );
  });

  it('does not use higher-timeframe bars received after as_of', async () => {
    const market = new InMemoryMarketDataStore();
    await market.upsertBars([
      bar('5m', '2026-07-12T04:00:00.000Z', 100, 103, 98, 101),
      bar('5m', '2026-07-12T04:05:00.000Z', 101, 104, 99, 102),
      bar('5m', '2026-07-12T04:10:00.000Z', 102, 105, 100, 103),
      bar('5m', '2026-07-12T04:15:00.000Z', 103, 106, 101, 104),
      bar('15m', '2026-07-12T03:00:00.000Z', 90, 93, 88, 91, '2026-07-12T04:40:00.000Z'),
      bar('15m', '2026-07-12T03:15:00.000Z', 91, 95, 90, 94, '2026-07-12T04:40:00.000Z'),
      bar('15m', '2026-07-12T03:30:00.000Z', 94, 98, 93, 97, '2026-07-12T04:40:00.000Z'),
      bar('15m', '2026-07-12T03:45:00.000Z', 97, 101, 96, 100, '2026-07-12T04:40:00.000Z'),
      bar('15m', '2026-07-12T04:00:00.000Z', 100, 105, 99, 104, '2026-07-12T04:40:00.000Z'),
      bar('15m', '2026-07-12T04:15:00.000Z', 104, 110, 103, 109, '2026-07-12T04:40:00.000Z'),
    ]);
    const regimes = new RegimeService(market);

    const result = await regimes.classify({
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      higherTimeframe: '15m',
      asOf: new Date('2026-07-12T04:31:00.000Z'),
    });

    expect(result.higherTimeframeTrend).toBe('unknown');
  });
});

function bar(
  timeframe: Bar['timeframe'],
  openTimeIso: string,
  open: number,
  high: number,
  low: number,
  close: number,
  receivedAtIso?: string,
): Bar {
  const openTime = new Date(openTimeIso);
  const durationMs = timeframe === '15m' ? 15 * 60 * 1000 : 5 * 60 * 1000;
  return {
    instrumentId: 'nse-nifty50',
    timeframe,
    openTime,
    closeTime: new Date(openTime.getTime() + durationMs),
    open,
    high,
    low,
    close,
    volume: 1000,
    source: 'regime-fixture',
    revision: 1,
    receivedAt: new Date(receivedAtIso ?? openTime.getTime() + durationMs + 1000),
  };
}
