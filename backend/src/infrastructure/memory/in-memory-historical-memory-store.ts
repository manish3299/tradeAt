import type { HistoricalMemoryStore, HistoricalSnapshot } from '../../domain/historical-memory.js';

export class InMemoryHistoricalMemoryStore implements HistoricalMemoryStore {
  private readonly snapshots = new Map<string, HistoricalSnapshot>();
  save(snapshot: HistoricalSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
    return Promise.resolve();
  }
  listAvailable(workspaceId: string, asOf: Date): Promise<readonly HistoricalSnapshot[]> {
    return Promise.resolve(
      [...this.snapshots.values()]
        .filter((item) => item.workspaceId === workspaceId && item.availableAt <= asOf)
        .map((item) => structuredClone(item)),
    );
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}
