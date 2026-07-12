import type { IndicatorQuery, IndicatorValue } from '../domain/indicators.js';
import type { Bar, MarketDataStore } from '../domain/market.js';

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
    if (bars.length === 0) return [];

    const values: IndicatorValue[] = [];
    const ema = calculateEma(bars, query.periods.ema);
    if (ema !== undefined) {
      values.push(toValue('ema', query, query.periods.ema, bars, ema, query.periods.ema));
    }

    const rsi = calculateRsi(bars, query.periods.rsi);
    if (rsi !== undefined) {
      values.push(toValue('rsi', query, query.periods.rsi, bars, rsi, query.periods.rsi + 1));
    }

    const atr = calculateAtr(bars, query.periods.atr);
    if (atr !== undefined) {
      values.push(toValue('atr', query, query.periods.atr, bars, atr, query.periods.atr + 1));
    }

    return values;
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
  value: number,
  warmupBars: number,
): IndicatorValue {
  return {
    kind,
    instrumentId: query.instrumentId,
    timeframe: query.timeframe,
    period,
    observedAt: bars.at(-1)!.closeTime,
    value,
    warmupBars,
    inputBars: bars.length,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
