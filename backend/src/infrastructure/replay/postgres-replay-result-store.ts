import pg from 'pg';
import type { BacktestResult, ReplayResultStore } from '../../domain/replay.js';

type ReplayOutputRow = Readonly<{ result: unknown }>;

export class PostgresReplayResultStore implements ReplayResultStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 2 });
  }

  async save(result: BacktestResult): Promise<void> {
    const inserted = await this.pool.query<ReplayOutputRow>(
      `insert into replay_outputs (identity_hash, result)
       values ($1, $2::jsonb)
       on conflict (identity_hash) do update
         set result = replay_outputs.result
         where replay_outputs.result = excluded.result
       returning result`,
      [result.identityHash, JSON.stringify(result)],
    );
    if (inserted.rowCount !== 1) {
      throw new Error('Replay output is immutable for a pinned identity.');
    }
  }

  async findByIdentityHash(identityHash: string): Promise<BacktestResult | undefined> {
    const result = await this.pool.query<ReplayOutputRow>(
      'select result from replay_outputs where identity_hash = $1',
      [identityHash],
    );
    return result.rows[0] ? reviveResult(result.rows[0].result) : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function reviveResult(value: unknown): BacktestResult {
  return JSON.parse(JSON.stringify(value), (_key: string, candidate: unknown) => {
    if (
      typeof candidate === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(candidate)
    ) {
      return new Date(candidate);
    }
    return candidate;
  }) as BacktestResult;
}
