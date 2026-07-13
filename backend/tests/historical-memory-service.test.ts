import { describe, expect, it } from 'vitest';
import { HistoricalMemoryService } from '../src/application/historical-memory-service.js';
import type { HistoricalSnapshot } from '../src/domain/historical-memory.js';
import { InMemoryHistoricalMemoryStore } from '../src/infrastructure/memory/in-memory-historical-memory-store.js';

describe('HistoricalMemoryService', () => {
  it('enforces availability time, workspace isolation, version isolation, and stable distance ordering', async () => {
    const memory = new HistoricalMemoryService(new InMemoryHistoricalMemoryStore());
    await memory.capture(snapshot('a', 'workspace-a', at(1), at(2), 0.1, '1.0.0'));
    await memory.capture(snapshot('b', 'workspace-a', at(2), at(5), 0.2, '1.0.0'));
    await memory.capture(snapshot('c', 'workspace-a', at(1), at(2), 0.05, '2.0.0'));
    await memory.capture(snapshot('d', 'workspace-b', at(1), at(2), 0.01, '1.0.0'));

    const beforeLateOutcome = await query(memory, 'workspace-a', at(4));
    expect(beforeLateOutcome.matches).toHaveLength(1);
    expect(beforeLateOutcome.matches[0]?.snapshot.decisionId).toBe('a');

    const after = await query(memory, 'workspace-a', at(6));
    expect(after.matches.map((match) => match.snapshot.decisionId)).toEqual(['a', 'b']);
    expect(after.matches[0]!.distance).toBeLessThan(after.matches[1]!.distance);
    expect(after.cohort).toMatchObject({ sampleSize: 2, outcomes: 2 });
  });

  it('rejects snapshots whose outcome was supposedly available before observation', async () => {
    const memory = new HistoricalMemoryService(new InMemoryHistoricalMemoryStore());
    await expect(
      memory.capture(snapshot('bad', 'workspace-a', at(2), at(1), 0, '1.0.0')),
    ).rejects.toThrow(/availableAt/);
  });
});

function query(memory: HistoricalMemoryService, workspaceId: string, asOf: Date) {
  return memory.similar(workspaceId, {
    asOf,
    observedAt: at(10),
    instrumentId: 'fixture',
    limit: 10,
    features: { momentumPct: 0, rangePct: 0.01, volumeRatio: 1, decisionScore: 0 },
    versions: versions('1.0.0'),
  });
}
function snapshot(
  decisionId: string,
  workspaceId: string,
  observedAt: Date,
  availableAt: Date,
  momentumPct: number,
  decisionVersion: string,
): Omit<HistoricalSnapshot, 'id'> {
  return {
    workspaceId,
    instrumentId: 'fixture',
    timeframe: '5m',
    observedAt,
    availableAt,
    session: 'regular',
    regime: 'uptrend/normal',
    setupId: 'continuation',
    decisionId,
    direction: 'long',
    features: { momentumPct, rangePct: 0.01, volumeRatio: 1, decisionScore: 0 },
    outcome: {
      returnR: momentumPct > 0.15 ? -1 : 2,
      targetHit: momentumPct <= 0.15,
      closedAt: availableAt,
    },
    versions: versions(decisionVersion),
    provenance: {
      datasetHash: 'dataset',
      source: 'replay',
      inputStart: at(0),
      inputEnd: observedAt,
    },
  };
}
function versions(decision: string) {
  return { feature: 'memory-features-v1', regime: '1.0.0', decision, policy: '1.0.0' };
}
function at(hour: number): Date {
  return new Date(Date.UTC(2026, 6, 1, hour));
}
