import { createHash } from 'node:crypto';
import type {
  HistoricalMemoryStore,
  HistoricalSnapshot,
  MemoryFeatures,
} from '../domain/historical-memory.js';

export type SimilarMemory = Readonly<{
  snapshot: HistoricalSnapshot;
  distance: number;
  contributions: MemoryFeatures;
}>;

export class HistoricalMemoryService {
  constructor(private readonly store: HistoricalMemoryStore) {}

  async capture(input: Omit<HistoricalSnapshot, 'id'>): Promise<HistoricalSnapshot> {
    if (input.availableAt < input.observedAt)
      throw new Error('availableAt cannot precede observedAt.');
    const snapshot: HistoricalSnapshot = { ...input, id: identity(input) };
    await this.store.save(snapshot);
    return snapshot;
  }

  async similar(
    workspaceId: string,
    input: Readonly<{
      asOf: Date;
      observedAt: Date;
      features: MemoryFeatures;
      limit: number;
      instrumentId?: string;
      session?: string;
      regime?: string;
      versions: HistoricalSnapshot['versions'];
    }>,
  ): Promise<
    Readonly<{
      matches: readonly SimilarMemory[];
      cohort: {
        sampleSize: number;
        outcomes: number;
        meanReturnR?: number;
        confidence95?: readonly [number, number];
      };
      definitionVersion: string;
    }>
  > {
    const available = await this.store.listAvailable(workspaceId, input.asOf);
    const matches = available
      .filter((item) => item.observedAt < input.observedAt)
      .filter((item) => !input.instrumentId || item.instrumentId === input.instrumentId)
      .filter((item) => !input.session || item.session === input.session)
      .filter((item) => !input.regime || item.regime === input.regime)
      .filter((item) => sameVersions(item.versions, input.versions))
      .map((snapshot) => compare(snapshot, input.features))
      .sort(
        (left, right) =>
          left.distance - right.distance || left.snapshot.id.localeCompare(right.snapshot.id),
      )
      .slice(0, Math.max(1, Math.min(50, input.limit)));
    const returns = matches.flatMap((match) =>
      match.snapshot.outcome ? [match.snapshot.outcome.returnR] : [],
    );
    const mean = returns.length
      ? returns.reduce((sum, value) => sum + value, 0) / returns.length
      : undefined;
    const standardError =
      returns.length > 1 && mean !== undefined
        ? Math.sqrt(
            returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1),
          ) / Math.sqrt(returns.length)
        : undefined;
    return {
      matches,
      cohort: {
        sampleSize: matches.length,
        outcomes: returns.length,
        ...(mean !== undefined ? { meanReturnR: mean } : {}),
        ...(standardError !== undefined && mean !== undefined
          ? { confidence95: [mean - 1.96 * standardError, mean + 1.96 * standardError] as const }
          : {}),
      },
      definitionVersion: 'historical-memory-v1',
    };
  }
}

function compare(snapshot: HistoricalSnapshot, target: MemoryFeatures): SimilarMemory {
  const contributions: MemoryFeatures = {
    momentumPct: Math.abs(snapshot.features.momentumPct - target.momentumPct),
    rangePct: Math.abs(snapshot.features.rangePct - target.rangePct),
    volumeRatio: Math.abs(snapshot.features.volumeRatio - target.volumeRatio),
    decisionScore: Math.abs(snapshot.features.decisionScore - target.decisionScore),
  };
  const distance = Math.sqrt(
    contributions.momentumPct ** 2 +
      contributions.rangePct ** 2 +
      contributions.volumeRatio ** 2 +
      contributions.decisionScore ** 2,
  );
  return { snapshot, distance: Number(distance.toFixed(8)), contributions };
}
function sameVersions(
  left: HistoricalSnapshot['versions'],
  right: HistoricalSnapshot['versions'],
): boolean {
  return (
    left.feature === right.feature &&
    left.regime === right.regime &&
    left.decision === right.decision &&
    left.policy === right.policy
  );
}
function identity(input: Omit<HistoricalSnapshot, 'id'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
