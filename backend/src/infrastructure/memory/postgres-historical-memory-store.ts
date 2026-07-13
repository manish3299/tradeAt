import pg from 'pg';
import type { HistoricalMemoryStore, HistoricalSnapshot } from '../../domain/historical-memory.js';
const { Pool } = pg;
export class PostgresHistoricalMemoryStore implements HistoricalMemoryStore {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }
  async save(snapshot: HistoricalSnapshot): Promise<void> {
    await this.pool.query(
      'insert into historical_snapshots (id, workspace_id, available_at, snapshot) values ($1,$2,$3,$4) on conflict (id) do nothing',
      [snapshot.id, snapshot.workspaceId, snapshot.availableAt, snapshot],
    );
  }
  async listAvailable(workspaceId: string, asOf: Date): Promise<readonly HistoricalSnapshot[]> {
    const result = await this.pool.query<{ snapshot: Record<string, unknown> }>(
      'select snapshot from historical_snapshots where workspace_id=$1 and available_at <= $2 order by available_at asc, id asc',
      [workspaceId, asOf],
    );
    return result.rows.map((row) => hydrate(row.snapshot));
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
function hydrate(value: Record<string, unknown>): HistoricalSnapshot {
  const outcome = value['outcome'] as Record<string, unknown> | undefined;
  const provenance = value['provenance'] as Record<string, unknown>;
  return {
    ...value,
    observedAt: new Date(String(value['observedAt'])),
    availableAt: new Date(String(value['availableAt'])),
    ...(outcome
      ? { outcome: { ...outcome, closedAt: new Date(String(outcome['closedAt'])) } }
      : {}),
    provenance: {
      ...provenance,
      inputStart: new Date(String(provenance['inputStart'])),
      inputEnd: new Date(String(provenance['inputEnd'])),
    },
  } as HistoricalSnapshot;
}
