import pg from 'pg';
import type { PaperStateStore, PaperWorkspaceState } from '../../domain/paper.js';

const { Pool } = pg;
export class PostgresPaperStateStore implements PaperStateStore {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }
  async load(workspaceId: string): Promise<PaperWorkspaceState | undefined> {
    const result = await this.pool.query<{ state: SerializedState }>(
      'select state from paper_workspace_states where workspace_id = $1',
      [workspaceId],
    );
    return result.rows[0] ? hydrate(result.rows[0].state) : undefined;
  }
  async save(workspaceId: string, state: PaperWorkspaceState): Promise<void> {
    await this.pool.query(
      'insert into paper_workspace_states (workspace_id, state, updated_at) values ($1, $2, now()) on conflict (workspace_id) do update set state = excluded.state, updated_at = excluded.updated_at',
      [workspaceId, state],
    );
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
type SerializedState = Record<string, Array<Record<string, unknown>>>;
function hydrate(value: SerializedState): PaperWorkspaceState {
  const dateKeys = new Set([
    'createdAt',
    'resetAt',
    'submittedAt',
    'eligibleAt',
    'occurredAt',
    'updatedAt',
    'openedAt',
    'closedAt',
  ]);
  const revive = (item: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(item).map(([key, field]) => [
        key,
        dateKeys.has(key) && typeof field === 'string' ? new Date(field) : field,
      ]),
    );
  return {
    accounts: (value.accounts ?? []).map(revive) as unknown as PaperWorkspaceState['accounts'],
    orders: (value.orders ?? []).map(revive) as unknown as PaperWorkspaceState['orders'],
    fills: (value.fills ?? []).map(revive) as unknown as PaperWorkspaceState['fills'],
    positions: (value.positions ?? []).map(revive) as unknown as PaperWorkspaceState['positions'],
    ledger: (value.ledger ?? []).map(revive) as unknown as PaperWorkspaceState['ledger'],
    journal: (value.journal ?? []).map(revive) as unknown as PaperWorkspaceState['journal'],
    audit: (value.audit ?? []).map(revive) as unknown as PaperWorkspaceState['audit'],
  };
}
