import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { Bar } from '../src/domain/market.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
  dependencyMode: 'lite',
  databaseUrl: undefined,
  redisUrl: undefined,
  dependencyCheckTimeoutMs: 50,
};

describe('indicator routes', () => {
  it('calculates EMA, RSI, and ATR from point-in-time bars', async () => {
    const marketStore = new InMemoryMarketDataStore();
    await marketStore.upsertBars([
      bar('2026-07-12T03:55:00.000Z', 24659.8, '2026-07-12T04:01:00.000Z'),
      bar('2026-07-12T04:00:00.000Z', 24674.4, '2026-07-12T04:06:00.000Z'),
      bar('2026-07-12T04:05:00.000Z', 24692.5, '2026-07-12T04:11:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 24701.2, '2026-07-12T04:15:00.000Z'),
    ]);
    const app = await buildApp({ config, probes: [], marketStore });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/indicators?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T04:15:00.000Z&ema_period=3&rsi_period=3&atr_period=3',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      values: Array<{
        kind: string;
        definition_id: string;
        definition_version: string;
        configuration_hash: string;
        observed_at: string;
        value?: number;
        quality: string;
        input_bars: number;
        missing_bars: number;
        warnings: string[];
      }>;
    }>();
    expect(body.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ema', observed_at: '2026-07-12T04:15:00.000Z' }),
        expect.objectContaining({ kind: 'rsi', observed_at: '2026-07-12T04:15:00.000Z' }),
        expect.objectContaining({ kind: 'atr', observed_at: '2026-07-12T04:15:00.000Z' }),
      ]),
    );
    expect(
      body.values.every(
        (value) =>
          value.definition_version === '1.0.0' &&
          value.configuration_hash.length === 64 &&
          value.quality === 'ok' &&
          value.missing_bars === 0 &&
          Number.isFinite(value.value),
      ),
    ).toBe(true);
    await app.close();
  });

  it('does not calculate values before enough bars have closed', async () => {
    const app = await buildApp({ config, probes: [] });
    const csv = await readFile(new URL('./fixtures/nifty50-5m.csv', import.meta.url), 'utf8');
    await app.inject({ method: 'POST', url: '/api/v1/market/bars/import', payload: { csv } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/indicators?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T04:05:00.000Z&ema_period=10&rsi_period=10&atr_period=10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      values: [
        {
          kind: 'ema',
          quality: 'insufficient_data',
          missing_bars: 10,
          warnings: ['Need 10 closed bars for ema, received 0.'],
        },
        {
          kind: 'rsi',
          quality: 'insufficient_data',
          missing_bars: 11,
          warnings: ['Need 11 closed bars for rsi, received 0.'],
        },
        {
          kind: 'atr',
          quality: 'insufficient_data',
          missing_bars: 11,
          warnings: ['Need 11 closed bars for atr, received 0.'],
        },
      ],
    });
    await app.close();
  });
});

function bar(openTimeIso: string, close: number, receivedAtIso: string): Bar {
  const openTime = new Date(openTimeIso);
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open: close - 10,
    high: close + 15,
    low: close - 20,
    close,
    volume: 1000,
    source: 'indicator-fixture',
    revision: 1,
    receivedAt: new Date(receivedAtIso),
  };
}
