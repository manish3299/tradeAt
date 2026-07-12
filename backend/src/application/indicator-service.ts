import { createHash } from 'node:crypto';
import type { IndicatorQuery, IndicatorValue } from '../domain/indicators.js';
import type { Bar, MarketDataStore } from '../domain/market.js';

const INDICATOR_DEFINITION_VERSION = '1.0.0';

export class IndicatorService {
  constructor(private readonly market: MarketDataStore) {}

  async calculate(query: IndicatorQuery): Promise<readonly IndicatorValue[]> {
    const maxPeriod = Math.max(query.periods.ema, query.periods.rsi + 1, query.periods.atr + 1);
    const bars = await this.market.listBars({
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      asOf: query.asOf,
      limit: Math.max(maxPeriod * 4, 50),
    });
    const ema = calculateEma(bars, query.periods.ema);
    const rsi = calculateRsi(bars, query.periods.rsi);
    const atr = calculateAtr(bars, query.periods.atr);
    return [
      toValue('ema', query, query.periods.ema, bars, ema, query.periods.ema),
      toValue('rsi', query, query.periods.rsi, bars, rsi, query.periods.rsi + 1),
      toValue('atr', query, query.periods.atr, bars, atr, query.periods.atr + 1),
    ];
  }
}

function calculateEma(bars: readonly Bar[], period: number): number | undefined {
  if (bars.length < period) return undefined;
  const multiplier = 2 / (period + 1);
  const seed = average(bars.slice(0, period).map((bar) => bar.close));
  return round(bars.slice(period).reduce((ema, bar) => (bar.close - ema) * multiplier + ema, seed));
}

function calculateRsi(bars: readonly Bar[], period: number): number | undefined {
  if (bars.length < period + 1) return undefined;
  const changes = bars.slice(1).map((bar, index) => bar.close - bars[index]!.close);
  const recent = changes.slice(-period);
  const gains = recent.map((change) => Math.max(change, 0));
  const losses = recent.map((change) => Math.max(-change, 0));
  const averageGain = average(gains);
  const averageLoss = average(losses);
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return round(100 - 100 / (1 + relativeStrength));
}

function calculateAtr(bars: readonly Bar[], period: number): number | undefined {
  if (bars.length < period + 1) return undefined;
  const trueRanges = bars.slice(1).map((bar, index) => {
    const previousClose = bars[index]!.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
  return round(average(trueRanges.slice(-period)));
}

function toValue(
  kind: IndicatorValue['kind'],
  query: IndicatorQuery,
  period: number,
  bars: readonly Bar[],
  value: number | undefined,
  warmupBars: number,
): IndicatorValue {
  const missingBars = Math.max(0, warmupBars - bars.length);
  const firstObservedAt = bars[0]?.closeTime;
  const lastObservedAt = bars.at(-1)?.closeTime;
  return {
    kind,
    definitionId: `tradeat.${kind}`,
    definitionVersion: INDICATOR_DEFINITION_VERSION,
    configurationHash: hashConfiguration({ kind, period }),
    instrumentId: query.instrumentId,
    timeframe: query.timeframe,
    period,
    observedAt: lastObservedAt ?? query.asOf,
    ...(value !== undefined ? { value } : {}),
    quality: value === undefined ? 'insufficient_data' : 'ok',
    warmupBars,
    inputBars: bars.length,
    missingBars,
    inputRange: {
      ...(firstObservedAt ? { firstObservedAt } : {}),
      ...(lastObservedAt ? { lastObservedAt } : {}),
    },
    warnings:
      value === undefined
        ? [`Need ${warmupBars} closed bars for ${kind}, received ${bars.length}.`]
        : [],
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function hashConfiguration(configuration: Readonly<Record<string, string | number>>): string {
  return createHash('sha256').update(JSON.stringify(configuration)).digest('hex');
}
