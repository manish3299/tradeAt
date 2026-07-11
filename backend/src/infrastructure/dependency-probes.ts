import { Redis } from 'ioredis';
import pg from 'pg';
import type { DependencyName, DependencyProbe, DependencyStatus } from '../domain/health.js';

export class LocalProbe implements DependencyProbe {
  public constructor(public readonly name: DependencyName) {}
  public check(): Promise<DependencyStatus> {
    return Promise.resolve({ name: this.name, status: 'up', latencyMs: 0 });
  }
  public close(): Promise<void> {
    return Promise.resolve();
  }
}

abstract class TimedProbe implements DependencyProbe {
  public abstract readonly name: DependencyName;
  protected abstract ping(): Promise<void>;
  public async check(signal: AbortSignal): Promise<DependencyStatus> {
    const started = performance.now();
    await Promise.race([
      this.ping(),
      new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('probe_timeout')), { once: true }),
      ),
    ]);
    return { name: this.name, status: 'up', latencyMs: Math.round(performance.now() - started) };
  }
  public abstract close(): Promise<void>;
}

export class PostgresProbe extends TimedProbe {
  public readonly name = 'postgres';
  private readonly pool: pg.Pool;
  public constructor(url: string) {
    super();
    this.pool = new pg.Pool({ connectionString: url, max: 2 });
  }
  protected async ping(): Promise<void> {
    await this.pool.query('select 1');
  }
  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export class RedisProbe extends TimedProbe {
  public readonly name = 'redis';
  private readonly client: Redis;
  public constructor(url: string) {
    super();
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
  }
  protected async ping(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.ping();
  }
  public close(): Promise<void> {
    if (this.client.status !== 'end') this.client.disconnect();
    return Promise.resolve();
  }
}
