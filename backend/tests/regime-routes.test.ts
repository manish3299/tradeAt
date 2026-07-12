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

describe('regime routes', () => {
  it('classifies trend and volatility from point-in-time bars', async () => {
    const app = await buildApp({ config, probes: [] });
    const csv = await readFile(new URL('./fixtures/nifty50-5m.csv', import.meta.url), 'utf8');
    await app.inject({ method: 'POST', url: '/api/v1/market/bars/import', payload: { csv } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/regimes?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T04:15:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      regime: {
        instrument_id: string;
        timeframe: string;
        observed_at: string;
        trend: string;
        volatility: string;
        reasons: string[];
      };
    }>();
    expect(body).toMatchObject({
      regime: {
        instrument_id: 'nse-nifty50',
        timeframe: '5m',
        observed_at: '2026-07-12T04:15:00.000Z',
      },
    });
    expect(body.regime.trend).toMatch(/uptrend|downtrend|sideways|unknown/);
    expect(body.regime.volatility).toMatch(/low|normal|high|unknown/);
    expect(body.regime.reasons.length).toBeGreaterThan(0);
    await app.close();
  });

  it('rejects unknown instruments', async () => {
    const app = await buildApp({ config, probes: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/regimes?instrument_id=unknown&timeframe=5m&as_of=2026-07-12T04:15:00.000Z',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'instrument_not_found' });
    await app.close();
  });
});
