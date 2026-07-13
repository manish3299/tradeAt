import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { DependencyName, DependencyProbe } from '../src/domain/health.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  logLevel: 'silent',
  dependencyMode: 'external',
  databaseUrl: 'postgresql://localhost/test',
  redisUrl: 'redis://localhost',
  dependencyCheckTimeoutMs: 50,
};
const probe = (name: DependencyName, status: 'up' | 'down'): DependencyProbe => ({
  name,
  check() {
    return status === 'down'
      ? Promise.reject(new Error('unavailable'))
      : Promise.resolve({ name, status, latencyMs: 1 });
  },
  close: vi.fn(() => Promise.resolve()),
});

describe('health routes', () => {
  it('reports liveness without checking dependencies', async () => {
    const app = await buildApp({ config, probes: [] });
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'alive' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    await app.close();
  });
  it('reports degraded readiness when a dependency is down', async () => {
    const app = await buildApp({
      config,
      probes: [probe('postgres', 'up'), probe('redis', 'down')],
    });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'degraded',
      dependencies: [
        { name: 'postgres', status: 'up' },
        { name: 'redis', status: 'down' },
      ],
    });
    await app.close();
  });
});
