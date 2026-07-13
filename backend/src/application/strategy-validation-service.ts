import { createHash, randomUUID } from 'node:crypto';
import type {
  RegistryEntry,
  StrategyComparison,
  StrategyMetrics,
} from '../domain/strategy-validation.js';

export class StrategyValidationService {
  private readonly entries: RegistryEntry[] = [];
  private readonly comparisons: StrategyComparison[] = [];

  register(
    workspaceId: string,
    input: Readonly<{
      kind: RegistryEntry['kind'];
      name: string;
      version: string;
      payload: Readonly<Record<string, unknown>>;
    }>,
  ): RegistryEntry {
    const canonical = stable(input.payload);
    const hash = createHash('sha256').update(canonical).digest('hex');
    const duplicate = this.entries.find(
      (item) =>
        item.workspaceId === workspaceId &&
        item.kind === input.kind &&
        item.name === input.name &&
        item.version === input.version,
    );
    if (duplicate) {
      if (duplicate.hash !== hash) throw new Error('Registry versions are immutable.');
      return duplicate;
    }
    const entry = {
      id: randomUUID(),
      workspaceId,
      ...input,
      hash,
      createdAt: new Date(),
    } satisfies RegistryEntry;
    this.entries.push(entry);
    return entry;
  }
  list(workspaceId: string): readonly RegistryEntry[] {
    return this.entries.filter((item) => item.workspaceId === workspaceId);
  }
  compare(
    workspaceId: string,
    input: Readonly<{
      baseline: { configurationId: string; datasetId: string; metrics: StrategyMetrics };
      candidate: { configurationId: string; datasetId: string; metrics: StrategyMetrics };
      minimumSamples: number;
      minimumExpectancyLift: number;
      maximumBrier: number;
      maximumDrawdownIncrease: number;
      minimumRegimeExpectancy: number;
    }>,
  ): StrategyComparison {
    for (const id of [
      input.baseline.configurationId,
      input.baseline.datasetId,
      input.candidate.configurationId,
      input.candidate.datasetId,
    ])
      if (!this.entries.some((item) => item.id === id && item.workspaceId === workspaceId))
        throw new Error('Registry entry not found.');
    const regimes = Object.values(input.candidate.metrics.regimeExpectancy);
    const gates = {
      sampleSize: input.candidate.metrics.sampleSize >= input.minimumSamples,
      expectancy:
        input.candidate.metrics.expectancyR - input.baseline.metrics.expectancyR >=
        input.minimumExpectancyLift,
      calibration:
        input.candidate.metrics.brierScore <= input.maximumBrier &&
        input.candidate.metrics.brierScore <= input.baseline.metrics.brierScore,
      drawdown:
        input.candidate.metrics.maximumDrawdownPercent -
          input.baseline.metrics.maximumDrawdownPercent <=
        input.maximumDrawdownIncrease,
      stability:
        regimes.length > 0 && regimes.every((value) => value >= input.minimumRegimeExpectancy),
    };
    const report = {
      id: randomUUID(),
      workspaceId,
      baseline: input.baseline,
      candidate: input.candidate,
      gates,
      eligibleForApproval: Object.values(gates).every(Boolean),
      status: 'approval_required',
      createdAt: new Date(),
    } satisfies StrategyComparison;
    this.comparisons.push(report);
    return report;
  }
  monitor(workspaceId: string, reference: StrategyMetrics, recent: StrategyMetrics) {
    const expectancyShift = recent.expectancyR - reference.expectancyR;
    const calibrationShift = recent.brierScore - reference.brierScore;
    const degraded = expectancyShift < -0.15 || calibrationShift > 0.05;
    return {
      workspaceId,
      expectancyShift,
      calibrationShift,
      degraded,
      action: degraded ? 'review_required' : 'none',
      automaticDeployment: false,
    };
  }
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
