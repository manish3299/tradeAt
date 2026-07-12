import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';

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
    const app = await buildApp({ config, probes: [] });
    const csv = await readFile(new URL('./fixtures/nifty50-5m.csv', import.meta.url), 'utf8');
    await app.inject({ method: 'POST', url: '/api/v1/market/bars/import', payload: { csv } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/indicators?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T04:15:00.000Z&ema_period=3&rsi_period=3&atr_period=3',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      values: Array<{ kind: string; observed_at: string; value: number; input_bars: number }>;
    }>();
    expect(body.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ema', observed_at: '2026-07-12T04:15:00.000Z' }),
        expect.objectContaining({ kind: 'rsi', observed_at: '2026-07-12T04:15:00.000Z' }),
        expect.objectContaining({ kind: 'atr', observed_at: '2026-07-12T04:15:00.000Z' }),
      ]),
    );
    expect(body.values.every((value) => Number.isFinite(value.value))).toBe(true);
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
    expect(response.json()).toMatchObject({ values: [] });
    await app.close();
  });
});
