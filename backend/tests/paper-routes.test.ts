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

describe('paper routes', () => {
  it('provides an authenticated PAPER-only order-to-journal workflow', async () => {
    const app = await buildApp({ config, probes: [] });
    const first = await register(app, 'paper-first@example.com');
    const second = await register(app, 'paper-second@example.com');
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/paper/accounts' });
    expect(unauthenticated.statusCode).toBe(401);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/paper/accounts',
      headers: bearer(first),
      payload: {
        name: 'Forward proof',
        starting_balance: 100_000,
        currency: 'USD',
        idempotency_key: 'account-1',
      },
    });
    expect(created.statusCode).toBe(201);
    const accountId = created.json<{ account: { id: string } }>().account.id;
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/paper/accounts/${accountId}`,
      headers: bearer(second),
    });
    expect(hidden.statusCode).toBe(404);
    const order = await app.inject({
      method: 'POST',
      url: `/api/v1/paper/accounts/${accountId}/orders`,
      headers: bearer(first),
      payload: {
        idempotency_key: 'order-1',
        instrument_id: 'nse-nifty50',
        side: 'buy',
        type: 'market',
        quantity: 1,
        reference_price: 100,
        confirmed: true,
      },
    });
    expect(order.statusCode).toBe(201);
    const fill = await app.inject({
      method: 'POST',
      url: `/api/v1/paper/accounts/${accountId}/process-bar`,
      headers: bearer(first),
      payload: {
        instrument_id: 'nse-nifty50',
        open_time: '2030-07-13T09:00:00.000Z',
        close_time: '2030-07-13T09:05:00.000Z',
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 100,
      },
    });
    expect(fill.statusCode).toBe(200);
    expect(fill.json()).toMatchObject({ origin: 'paper', fills: [{ origin: 'paper' }] });
    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/v1/paper/accounts/${accountId}`,
      headers: bearer(first),
    });
    expect(snapshot.json()).toMatchObject({
      origin: 'paper',
      snapshot: { journal: [{ origin: 'paper' }], positions: [{ quantity: 1 }] },
    });
    await app.close();
  });
});

async function register(app: Awaited<ReturnType<typeof buildApp>>, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'strong-passphrase' },
  });
  return response.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
}
function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
