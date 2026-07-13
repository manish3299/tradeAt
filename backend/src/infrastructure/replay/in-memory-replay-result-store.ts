import { createHash } from 'node:crypto';
import type { BacktestResult, ReplayResultStore } from '../../domain/replay.js';

export class InMemoryReplayResultStore implements ReplayResultStore {
  private readonly results = new Map<string, Readonly<{ hash: string; result: BacktestResult }>>();

  save(result: BacktestResult): Promise<void> {
    const hash = resultHash(result);
    const existing = this.results.get(result.identityHash);
    if (existing && existing.hash !== hash) {
      return Promise.reject(new Error('Replay output is immutable for a pinned identity.'));
    }
    this.results.set(result.identityHash, { hash, result: structuredClone(result) });
    return Promise.resolve();
  }

  findByIdentityHash(identityHash: string): Promise<BacktestResult | undefined> {
    const result = this.results.get(identityHash)?.result;
    return Promise.resolve(result ? structuredClone(result) : undefined);
  }
}

function resultHash(result: BacktestResult): string {
  return createHash('sha256').update(JSON.stringify(result)).digest('hex');
}
