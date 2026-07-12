import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { WorkspaceRole } from '../src/domain/identity.js';

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

type AuthResponse = Readonly<{
  principal: {
    user: { id: string; email: string; createdAt: string };
    workspace: { id: string; name: string; createdAt: string };
    membership: {
      userId: string;
      workspaceId: string;
      role: WorkspaceRole;
      createdAt: string;
    };
    sessionId: string;
  };
  tokens: {
    accessToken: string;
    accessExpiresAt: string;
    refreshToken: string;
    refreshExpiresAt: string;
  };
}>;

type MeResponse = Readonly<{ principal: AuthResponse['principal'] }>;

describe('auth routes', () => {
  it('registers a user and returns an authenticated principal', async () => {
    const app = await buildApp({ config, probes: [] });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'Trader@Example.com',
        password: 'strong-passphrase',
        workspaceName: 'Momentum Desk',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<AuthResponse>();
    expect(body.principal.user).toMatchObject({ email: 'trader@example.com' });
    expect('passwordHash' in body.principal.user).toBe(false);
    expect(body.principal.workspace).toMatchObject({ name: 'Momentum Desk' });
    expect(body.tokens.accessToken).toEqual(expect.any(String));
    expect(body.tokens.refreshToken).toEqual(expect.any(String));
    await app.close();
  });

  it('logs in, authenticates /me, and rejects duplicate registration', async () => {
    const app = await buildApp({ config, probes: [] });
    await register(app);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'trader@example.com', password: 'another-passphrase' },
    });
    expect(duplicate.statusCode).toBe(409);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'TRADER@example.com', password: 'strong-passphrase' },
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json<AuthResponse>().tokens.accessToken;

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<MeResponse>().principal.user.email).toBe('trader@example.com');
    await app.close();
  });

  it('rotates refresh tokens and revokes the previous access token', async () => {
    const app = await buildApp({ config, probes: [] });
    const registered = await register(app);
    const oldAccessToken = registered.tokens.accessToken;
    const oldRefreshToken = registered.tokens.refreshToken;

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    const newAccessToken = refresh.json<AuthResponse>().tokens.accessToken;

    const oldAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${oldAccessToken}` },
    });
    expect(oldAccess.statusCode).toBe(401);

    const newAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${newAccessToken}` },
    });
    expect(newAccess.statusCode).toBe(200);
    await app.close();
  });

  it('rejects refresh token reuse after rotation', async () => {
    const app = await buildApp({ config, probes: [] });
    const registered = await register(app);
    const oldRefreshToken = registered.tokens.refreshToken;

    const firstRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });
    expect(firstRefresh.statusCode).toBe(200);

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldRefreshToken },
    });
    expect(reused.statusCode).toBe(401);
    expect(reused.json()).toEqual({ error: 'token_reused' });
    await app.close();
  });

  it('rate limits repeated auth attempts', async () => {
    const app = await buildApp({ config, probes: [] });

    let lastStatus = 0;
    for (let index = 0; index < 21; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: 'invalid-refresh-token' },
      });
      lastStatus = response.statusCode;
    }

    expect(lastStatus).toBe(429);
    await app.close();
  });

  it('logs out refresh tokens', async () => {
    const app = await buildApp({ config, probes: [] });
    const registered = await register(app);
    const refreshToken = registered.tokens.refreshToken;

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ revoked: true });

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    await app.close();
  });
});

async function register(app: Awaited<ReturnType<typeof buildApp>>): Promise<AuthResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: 'trader@example.com', password: 'strong-passphrase' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<AuthResponse>();
}
