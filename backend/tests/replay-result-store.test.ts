import { describe, expect, it } from 'vitest';
import type { BacktestResult } from '../src/domain/replay.js';
import { InMemoryReplayResultStore } from '../src/infrastructure/replay/in-memory-replay-result-store.js';

describe('InMemoryReplayResultStore', () => {
  it('persists idempotent output and protects pinned identities from mutation', async () => {
    const store = new InMemoryReplayResultStore();
    const result = fixtureResult();

    await store.save(result);
    await store.save(result);
    expect(await store.findByIdentityHash('identity')).toEqual(result);

    await expect(
      store.save({
        ...result,
        baselines: [{ name: 'always_abstain', netReturn: 1, coverage: 0 }],
      }),
    ).rejects.toThrow(/immutable/);
  });
});

function fixtureResult(): BacktestResult {
  return {
    identityHash: 'identity',
    decisions: [],
    outcomes: [],
    windows: [],
    baselines: [
      { name: 'buy_and_hold', netReturn: 0, coverage: 1 },
      { name: 'always_abstain', netReturn: 0, coverage: 0 },
    ],
    execution: {
      version: 'execution-1',
      feeBpsPerSide: 1,
      spreadBps: 2,
      slippageBpsPerSide: 1,
      intrabarFillPolicy: 'stop_first',
    },
  };
}
