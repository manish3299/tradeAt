import type { ReplayDecision, ReplayTradeOutcome } from '../domain/replay.js';

const STATISTICS_DEFINITION_VERSION = '1.0.0';

export type CalibrationBin = Readonly<{
  lowerBound: number;
  upperBound: number;
  count: number;
  predictedMean: number;
  observedFrequency: number;
  confidenceInterval95: Readonly<{ lower: number; upper: number }>;
}>;

export type StatisticsMetrics = Readonly<{
  eligible: boolean;
  sampleSize: number;
  expectancyR?: number;
  profitFactor?: number;
  maximumDrawdown: number;
  maximumDrawdownPercent: number;
  hitRate?: number;
  lossRate?: number;
  breakevenRate?: number;
  targetHitRate?: number;
  brierScore?: number;
  expectedCalibrationError?: number;
  calibrationBins?: readonly CalibrationBin[];
  averageMaeR?: number;
  averageMfeR?: number;
  totalCosts: number;
}>;

export type StatisticsSegment = Readonly<{
  dimension: 'instrument' | 'session' | 'regime' | 'setup';
  value: string;
  metrics: StatisticsMetrics;
}>;

export type ReplayStatisticsReport = Readonly<{
  origin: 'replay';
  definitionVersion: string;
  costsIncluded: true;
  executionVersion: string;
  startingEquity: number;
  analysisStart?: Date;
  analysisEnd?: Date;
  decisionCount: number;
  abstentionCount: number;
  coverage: number;
  overall: StatisticsMetrics;
  segments: readonly StatisticsSegment[];
}>;

export class StatisticsService {
  summarize(
    decisions: readonly ReplayDecision[],
    outcomes: readonly ReplayTradeOutcome[],
    options: Readonly<{
      minimumSamples: number;
      startingEquity: number;
      executionVersion?: string;
    }>,
  ): ReplayStatisticsReport {
    if (options.minimumSamples < 1) throw new Error('Minimum samples must be positive.');
    if (!Number.isFinite(options.startingEquity) || options.startingEquity <= 0) {
      throw new Error('Starting equity must be positive.');
    }
    const nonAbstain = decisions.filter(({ decision }) => decision.direction !== 'abstain').length;
    return {
      origin: 'replay',
      definitionVersion: STATISTICS_DEFINITION_VERSION,
      costsIncluded: true,
      executionVersion:
        options.executionVersion ?? outcomes[0]?.executionVersion ?? 'not-applicable',
      startingEquity: options.startingEquity,
      ...(outcomes.length > 0
        ? {
            analysisStart: new Date(
              Math.min(...outcomes.map((outcome) => outcome.openedAt.getTime())),
            ),
            analysisEnd: new Date(
              Math.max(...outcomes.map((outcome) => outcome.closedAt.getTime())),
            ),
          }
        : {}),
      decisionCount: decisions.length,
      abstentionCount: decisions.length - nonAbstain,
      coverage: decisions.length === 0 ? 0 : nonAbstain / decisions.length,
      overall: metricsFor(outcomes, options.minimumSamples, options.startingEquity),
      segments: segmentOutcomes(outcomes, options.minimumSamples, options.startingEquity),
    };
  }
}

function metricsFor(
  outcomes: readonly ReplayTradeOutcome[],
  minimumSamples: number,
  startingEquity: number,
): StatisticsMetrics {
  const validOutcomes = outcomes.filter(
    (outcome) =>
      outcome.initialRisk > 0 &&
      Number.isFinite(outcome.returnR) &&
      Number.isFinite(outcome.netPnl),
  );
  const eligible = validOutcomes.length >= minimumSamples;
  const grossProfit = sum(
    validOutcomes.filter((outcome) => outcome.netPnl > 0).map((outcome) => outcome.netPnl),
  );
  const grossLoss = Math.abs(
    sum(validOutcomes.filter((outcome) => outcome.netPnl < 0).map((outcome) => outcome.netPnl)),
  );
  const equity: number[] = [];
  let cumulative = startingEquity;
  for (const outcome of validOutcomes) {
    cumulative += outcome.netPnl;
    equity.push(cumulative);
  }
  const wins = validOutcomes.filter((outcome) => outcome.netPnl > 0).length;
  const losses = validOutcomes.filter((outcome) => outcome.netPnl < 0).length;
  const breakevens = validOutcomes.length - wins - losses;
  const calibration = calibrationMetrics(validOutcomes);
  return {
    eligible,
    sampleSize: validOutcomes.length,
    ...(eligible
      ? {
          expectancyR: mean(validOutcomes.map((outcome) => outcome.returnR)),
          ...(grossLoss > 0 ? { profitFactor: grossProfit / grossLoss } : {}),
          hitRate: validOutcomes.length === 0 ? 0 : wins / validOutcomes.length,
          lossRate: validOutcomes.length === 0 ? 0 : losses / validOutcomes.length,
          breakevenRate: validOutcomes.length === 0 ? 0 : breakevens / validOutcomes.length,
          targetHitRate:
            validOutcomes.length === 0
              ? 0
              : validOutcomes.filter((outcome) => outcome.targetHit).length / validOutcomes.length,
          brierScore: calibration.brierScore,
          expectedCalibrationError: calibration.expectedCalibrationError,
          calibrationBins: calibration.bins,
          averageMaeR: mean(validOutcomes.map((outcome) => outcome.maeR)),
          averageMfeR: mean(validOutcomes.map((outcome) => outcome.mfeR)),
        }
      : {}),
    maximumDrawdown: maximumDrawdown(equity, startingEquity).amount,
    maximumDrawdownPercent: maximumDrawdown(equity, startingEquity).percent,
    totalCosts: sum(outcomes.map((outcome) => outcome.costs)),
  };
}

function segmentOutcomes(
  outcomes: readonly ReplayTradeOutcome[],
  minimumSamples: number,
  startingEquity: number,
): readonly StatisticsSegment[] {
  const dimensions: ReadonlyArray<
    readonly [StatisticsSegment['dimension'], (outcome: ReplayTradeOutcome) => string]
  > = [
    ['instrument', (outcome) => outcome.instrumentId],
    ['session', (outcome) => outcome.session],
    ['regime', (outcome) => outcome.regime],
    ['setup', (outcome) => outcome.setupId],
  ];
  return dimensions.flatMap(([dimension, select]) => {
    const groups = new Map<string, ReplayTradeOutcome[]>();
    for (const outcome of outcomes) {
      const value = select(outcome);
      groups.set(value, [...(groups.get(value) ?? []), outcome]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, group]) => ({
        dimension,
        value,
        metrics: metricsFor(group, minimumSamples, startingEquity),
      }));
  });
}

function calibrationMetrics(outcomes: readonly ReplayTradeOutcome[]): Readonly<{
  brierScore: number;
  expectedCalibrationError: number;
  bins: readonly CalibrationBin[];
}> {
  if (outcomes.length === 0) {
    return { brierScore: 0, expectedCalibrationError: 0, bins: [] };
  }
  const scored = outcomes.map((outcome) => ({
    confidence: Math.min(1, Math.max(0, outcome.confidence)),
    observed: outcome.netPnl > 0 ? 1 : 0,
  }));
  const brierScore = mean(scored.map(({ confidence, observed }) => (confidence - observed) ** 2));
  let weightedError = 0;
  const bins: CalibrationBin[] = [];
  for (let lower = 0; lower < 1; lower += 0.1) {
    const upper = lower + 0.1;
    const bin = scored.filter(({ confidence }) =>
      upper >= 1
        ? confidence >= lower && confidence <= upper
        : confidence >= lower && confidence < upper,
    );
    if (bin.length === 0) continue;
    const predictedMean = mean(bin.map((item) => item.confidence));
    const observedFrequency = mean(bin.map((item) => item.observed));
    weightedError += (bin.length / scored.length) * Math.abs(predictedMean - observedFrequency);
    bins.push({
      lowerBound: lower,
      upperBound: upper,
      count: bin.length,
      predictedMean,
      observedFrequency,
      confidenceInterval95: wilsonInterval(
        bin.filter((item) => item.observed === 1).length,
        bin.length,
      ),
    });
  }
  return { brierScore, expectedCalibrationError: weightedError, bins };
}

function wilsonInterval(
  successes: number,
  sampleSize: number,
): Readonly<{
  lower: number;
  upper: number;
}> {
  if (sampleSize === 0) return { lower: 0, upper: 0 };
  const z = 1.96;
  const proportion = successes / sampleSize;
  const denominator = 1 + (z * z) / sampleSize;
  const center = (proportion + (z * z) / (2 * sampleSize)) / denominator;
  const margin =
    (z *
      Math.sqrt(
        (proportion * (1 - proportion)) / sampleSize + (z * z) / (4 * sampleSize * sampleSize),
      )) /
    denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function maximumDrawdown(
  equity: readonly number[],
  startingEquity: number,
): Readonly<{ amount: number; percent: number }> {
  let peak = startingEquity;
  let maximum = 0;
  let maximumPercent = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    maximum = Math.max(maximum, peak - value);
    maximumPercent = Math.max(maximumPercent, peak === 0 ? 0 : (peak - value) / peak);
  }
  return { amount: maximum, percent: maximumPercent };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
