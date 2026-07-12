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

describe('market data routes', () => {
  it('lists normalized instruments', async () => {
    const app = await buildApp({ config, probes: [] });

    const response = await app.inject({ method: 'GET', url: '/api/v1/instruments' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      instruments: Array<{
        id: string;
        symbol: string;
        venue: string;
        provider_symbol: string;
        asset_class: string;
      }>;
    }>();
    expect(body.instruments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'nse-nifty50',
          symbol: 'NIFTY 50',
          venue: 'NSE',
          provider_symbol: 'NIFTY',
          asset_class: 'index',
        }),
      ]),
    );
    await app.close();
  });

  it('returns bounded historical bars for an instrument', async () => {
    const app = await buildApp({ config, probes: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market/bars?instrument_id=nse-nifty50&timeframe=5m&limit=2',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      bars: Array<{ instrument_id: string; open_time: string; close: number; source: string }>;
    }>();
    expect(body.bars).toHaveLength(2);
    expect(body.bars[0]).toMatchObject({
      instrument_id: 'nse-nifty50',
      source: 'sample-lite',
    });
    expect(body.bars[1]?.open_time).toBe('2026-07-12T03:55:00.000Z');
    await app.close();
  });

  it('reports market data freshness status', async () => {
    const app = await buildApp({ config, probes: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market/status?instrument_id=nse-nifty50&timeframe=5m',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: {
        instrument_id: 'nse-nifty50',
        timeframe: '5m',
        source: 'sample-lite',
        gap_count: 0,
      },
    });
    await app.close();
  });

  it('rejects unknown instruments', async () => {
    const app = await buildApp({ config, probes: [] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market/bars?instrument_id=unknown&timeframe=5m',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'instrument_not_found' });
    await app.close();
  });

  it('imports historical bars from CSV and returns them through the bounded query', async () => {
    const app = await buildApp({ config, probes: [] });
    const csv = [
      'instrument_id,timeframe,open_time,open,high,low,close,volume,source,revision',
      'nse-nifty50,5m,2026-07-12T04:00:00.000Z,24659.8,24682.1,24650.0,24674.4,210000,csv-import,1',
    ].join('\n');

    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/market/bars/import',
      payload: { csv },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toEqual({ inserted: 1, updated: 0, rejected: 0, errors: [] });

    const bars = await app.inject({
      method: 'GET',
      url: '/api/v1/market/bars?instrument_id=nse-nifty50&timeframe=5m&limit=1',
    });
    expect(bars.statusCode).toBe(200);
    expect(
      bars.json<{ bars: Array<{ open_time: string; close: number; source: string }> }>().bars[0],
    ).toMatchObject({
      open_time: '2026-07-12T04:00:00.000Z',
      close: 24674.4,
      source: 'csv-import',
    });
    await app.close();
  });

  it('updates duplicate imported bars instead of duplicating them', async () => {
    const app = await buildApp({ config, probes: [] });
    const firstCsv = [
      'instrument_id,timeframe,open_time,open,high,low,close,volume,source,revision',
      'nse-nifty50,5m,2026-07-12T04:05:00.000Z,24674.4,24690.0,24660.0,24680.0,150000,csv-import,1',
    ].join('\n');
    const secondCsv = [
      'instrument_id,timeframe,open_time,open,high,low,close,volume,source,revision',
      'nse-nifty50,5m,2026-07-12T04:05:00.000Z,24674.4,24695.0,24660.0,24692.5,151000,csv-import,1',
    ].join('\n');

    await app.inject({
      method: 'POST',
      url: '/api/v1/market/bars/import',
      payload: { csv: firstCsv },
    });
    const updated = await app.inject({
      method: 'POST',
      url: '/api/v1/market/bars/import',
      payload: { csv: secondCsv },
    });

    expect(updated.statusCode).toBe(201);
    expect(updated.json()).toEqual({ inserted: 0, updated: 1, rejected: 0, errors: [] });
    await app.close();
  });

  it('reports rejected CSV rows', async () => {
    const app = await buildApp({ config, probes: [] });
    const csv = [
      'instrument_id,timeframe,open_time,open,high,low,close,volume',
      'nse-nifty50,5m,not-a-date,24659.8,24682.1,24650.0,24674.4,210000',
      'unknown,5m,2026-07-12T04:10:00.000Z,24674.4,24690.0,24660.0,24680.0,150000',
    ].join('\n');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/market/bars/import',
      payload: { csv },
    });

    expect(response.statusCode).toBe(207);
    expect(response.json()).toMatchObject({ inserted: 0, updated: 0, rejected: 2 });
    await app.close();
  });

  it('imports a fixture and enforces point-in-time as_of queries', async () => {
    const app = await buildApp({ config, probes: [] });
    const csv = await readFile(new URL('./fixtures/nifty50-5m.csv', import.meta.url), 'utf8');

    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/market/bars/import',
      payload: { csv },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ inserted: 3, updated: 0, rejected: 0 });

    const asOf = await app.inject({
      method: 'GET',
      url: '/api/v1/market/bars?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T04:10:00.000Z&limit=10',
    });

    expect(asOf.statusCode).toBe(200);
    const body = asOf.json<{
      bars: Array<{ open_time: string; close_time: string; source: string }>;
    }>();
    expect(body.bars.map((bar) => bar.open_time)).toContain('2026-07-12T04:05:00.000Z');
    expect(body.bars.map((bar) => bar.open_time)).not.toContain('2026-07-12T04:10:00.000Z');
    expect(body.bars.every((bar) => bar.close_time <= '2026-07-12T04:10:00.000Z')).toBe(true);
    await app.close();
  });
});
