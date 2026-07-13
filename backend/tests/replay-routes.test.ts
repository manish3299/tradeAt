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

describe('replay routes', () => {
  it('runs a workspace-scoped replay and returns its statistics', async () => {
    const app = await buildApp({ config, probes: [] });
    const first = await register(app, 'first@example.com');
    const second = await register(app, 'second@example.com');

    const unauthorized = await app.inject({ method: 'POST', url: '/api/v1/replays' });
    expect(unauthorized.statusCode).toBe(401);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/replays',
      headers: bearer(first.accessToken),
      payload: {
        instrument_id: 'nse-nifty50',
        timeframe: '5m',
        training_bars: 2,
        evaluation_bars: 2,
        minimum_samples: 1,
        starting_equity: 100000,
      },
    });
    expect(created.statusCode).toBe(201);
    const replayId = created.json<{ replay: { id: string } }>().replay.id;

    const hiddenFromSecondWorkspace = await app.inject({
      method: 'GET',
      url: `/api/v1/replays/${replayId}`,
      headers: bearer(second.accessToken),
    });
    expect(hiddenFromSecondWorkspace.statusCode).toBe(404);

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/replays/${replayId}/control`,
      headers: bearer(first.accessToken),
      payload: { action: 'start' },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      replay: {
        id: replayId,
        status: 'completed',
        result: { decision_count: 1, outcome_count: 0, execution_version: '1.0.0' },
      },
    });

    const statistics = await app.inject({
      method: 'GET',
      url: `/api/v1/statistics?replay_id=${replayId}`,
      headers: bearer(first.accessToken),
    });
    expect(statistics.statusCode).toBe(200);
    expect(statistics.json()).toMatchObject({
      statistics: {
        origin: 'replay',
        definition_version: '1.0.0',
        execution_version: '1.0.0',
        costs_included: true,
        decision_count: 1,
        overall: { eligible: false, sample_size: 0 },
      },
    });
    const memory = await app.inject({
      method: 'GET',
      url: '/api/v1/historical-memory/similar?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T10:00:00.000Z&limit=5',
      headers: bearer(first.accessToken),
    });
    expect(memory.statusCode).toBe(200);
    const memoryBody = memory.json<{
      definition_version: string;
      cohort: { sampleSize: number };
      matches: unknown[];
    }>();
    expect(memoryBody.definition_version).toBe('historical-memory-v1');
    expect(memoryBody.cohort.sampleSize).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(memoryBody.matches)).toBe(true);
    const isolatedMemory = await app.inject({
      method: 'GET',
      url: '/api/v1/historical-memory/similar?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T10:00:00.000Z&limit=5',
      headers: bearer(second.accessToken),
    });
    expect(isolatedMemory.json()).toMatchObject({ cohort: { sampleSize: 0 }, matches: [] });
    await app.close();
  });
});

async function register(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
): Promise<{ accessToken: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'strong-passphrase' },
  });
  expect(response.statusCode).toBe(201);
  return { accessToken: response.json<{ tokens: { accessToken: string } }>().tokens.accessToken };
}

function bearer(accessToken: string): { authorization: string } {
  return { authorization: `Bearer ${accessToken}` };
}
