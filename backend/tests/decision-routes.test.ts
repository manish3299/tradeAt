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

describe('decision routes', () => {
  it('returns an authenticated explainable point-in-time decision', async () => {
    const app = await buildApp({ config, probes: [] });
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/api/v1/decisions/latest?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T10:00:00.000Z',
    });
    expect(unauthorized.statusCode).toBe(401);
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'decision-ui@example.com', password: 'strong-passphrase' },
    });
    const token = registration.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/decisions/latest?instrument_id=nse-nifty50&timeframe=5m&as_of=2026-07-12T10:00:00.000Z',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      decision: {
        instrument_id: string;
        timeframe: string;
        direction: string;
        policy_version: string;
        gates: unknown[];
        vetoes: { code: string }[];
      };
    }>();
    expect(body.decision).toMatchObject({
      instrument_id: 'nse-nifty50',
      timeframe: '5m',
      direction: 'abstain',
      policy_version: '1.0.0',
    });
    expect(body.decision.gates.length).toBeGreaterThan(0);
    expect(body.decision.vetoes.map((veto) => veto.code)).toContain('insufficient_samples');
    await app.close();
  });
});
