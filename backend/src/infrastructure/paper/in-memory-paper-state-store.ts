import type { PaperStateStore, PaperWorkspaceState } from '../../domain/paper.js';

export class InMemoryPaperStateStore implements PaperStateStore {
  private readonly states = new Map<string, PaperWorkspaceState>();
  load(workspaceId: string): Promise<PaperWorkspaceState | undefined> {
    return Promise.resolve(this.states.get(workspaceId));
  }
  save(workspaceId: string, state: PaperWorkspaceState): Promise<void> {
    this.states.set(workspaceId, state);
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}
