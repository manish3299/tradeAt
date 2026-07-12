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

describe('regime routes', () => {
  it('classifies trend and volatility from point-in-time bars', async () => {
    const marketStore = new InMemoryMarketDataStore();
    await marketStore.upsertBars([
      bar('2026-07-12T03:45:00.000Z', 24636.9, '2026-07-12T03:51:00.000Z'),
      bar('2026-07-12T03:50:00.000Z', 24648.3, '2026-07-12T03:56:00.000Z'),
      bar('2026-07-12T03:55:00.000Z', 24659.8, '2026-07-12T04:01:00.000Z'),
      bar('2026-07-12T04:00:00.000Z', 24674.4, '2026-07-12T04:06:00.000Z'),
      bar('2026-07-12T04:05:00.000Z', 24692.5, '2026-07-12T04:11:00.000Z'),
      bar('2026-07-12T04:10:00.000Z', 24701.2, '2026-07-12T04:15:00.000Z'),
    ]);
    const app = await buildApp({ config, probes: [], marketStore });

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
        definition_version: string;
        configuration_hash: string;
        quality: string;
        trend: string;
        volatility: string;
        price_structure: string;
        input_bars: number;
        missing_bars: number;
        reasons: string[];
      };
    }>();
    expect(body).toMatchObject({
      regime: {
        instrument_id: 'nse-nifty50',
        timeframe: '5m',
        definition_version: '1.0.0',
        observed_at: '2026-07-12T04:15:00.000Z',
      },
    });
    expect(body.regime.configuration_hash).toHaveLength(64);
    expect(body.regime.input_bars).toBeGreaterThan(0);
    expect(body.regime.trend).toMatch(/uptrend|downtrend|sideways|unknown/);
    expect(body.regime.volatility).toMatch(/low|normal|high|unknown/);
    expect(body.regime.price_structure).toMatch(
      /higher_highs_higher_lows|lower_highs_lower_lows|range_bound|breakout|breakdown|unknown/,
    );
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

function bar(openTimeIso: string, close: number, receivedAtIso: string): Bar {
  const openTime = new Date(openTimeIso);
  return {
    instrumentId: 'nse-nifty50',
    timeframe: '5m',
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open: close - 8,
    high: close + 10,
    low: close - 12,
    close,
    volume: 1000,
    source: 'regime-route-fixture',
    revision: 1,
    receivedAt: new Date(receivedAtIso),
  };
}
