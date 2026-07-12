import { createHash } from 'node:crypto';
import { IndicatorService } from './indicator-service.js';
import type {
  PriceStructure,
  RegimeClassification,
  RegimeQuery,
  TrendRegime,
  VolatilityRegime,
} from '../domain/regimes.js';
import type { Bar, MarketDataStore } from '../domain/market.js';

const FAST_EMA_PERIOD = 3;
const SLOW_EMA_PERIOD = 6;
const ATR_PERIOD = 3;
const REGIME_DEFINITION_VERSION = '1.0.0';

export class RegimeService {
  private readonly indicators: IndicatorService;

  constructor(private readonly market: MarketDataStore) {
    this.indicators = new IndicatorService(market);
  }

  async classify(query: RegimeQuery): Promise<RegimeClassification> {
    const bars = await this.market.listBars({
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      asOf: query.asOf,
      limit: 80,
    });
    const latest = bars.at(-1);
    if (!latest) {
      return {
        definitionId: 'tradeat.regime',
        definitionVersion: REGIME_DEFINITION_VERSION,
        configurationHash: hashConfiguration(query),
        instrumentId: query.instrumentId,
        timeframe: query.timeframe,
        observedAt: query.asOf,
        quality: 'insufficient_data',
        trend: 'unknown',
        volatility: 'unknown',
        priceStructure: 'unknown',
        inputBars: 0,
        missingBars: SLOW_EMA_PERIOD,
        inputRange: {},
        reasons: ['No closed bars are available at as_of.'],
      };
    }

    const [fastEma] = await this.indicators.calculate({
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      asOf: query.asOf,
      periods: { ema: FAST_EMA_PERIOD, rsi: 100, atr: 100 },
    });
    const [slowEma] = await this.indicators.calculate({
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      asOf: query.asOf,
      periods: { ema: SLOW_EMA_PERIOD, rsi: 100, atr: 100 },
    });
    const values = await this.indicators.calculate({
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      asOf: query.asOf,
      periods: { ema: FAST_EMA_PERIOD, rsi: 100, atr: ATR_PERIOD },
    });
    const atr = values.find((value) => value.kind === 'atr' && value.quality === 'ok')?.value;
    const close = latest.close;
    const trend = classifyTrend(fastEma?.value, slowEma?.value);
    const atrPercent = atr === undefined ? undefined : round((atr / close) * 100);
    const volatility = classifyVolatility(atrPercent);
    const priceStructure = classifyPriceStructure(bars);
    const higherTimeframeTrend =
      query.higherTimeframe === undefined
        ? undefined
        : await this.classifyHigherTimeframeTrend(query, query.higherTimeframe);

    return {
      definitionId: 'tradeat.regime',
      definitionVersion: REGIME_DEFINITION_VERSION,
      configurationHash: hashConfiguration(query),
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      observedAt: latest.closeTime,
      quality: trend === 'unknown' || volatility === 'unknown' ? 'insufficient_data' : 'ok',
      trend,
      volatility,
      priceStructure,
      ...(query.higherTimeframe ? { higherTimeframe: query.higherTimeframe } : {}),
      ...(higherTimeframeTrend ? { higherTimeframeTrend } : {}),
      ...(atrPercent !== undefined ? { atrPercent } : {}),
      ...(fastEma?.value !== undefined ? { fastEma: fastEma.value } : {}),
      ...(slowEma?.value !== undefined ? { slowEma: slowEma.value } : {}),
      close,
      inputBars: bars.length,
      missingBars: Math.max(0, Math.max(SLOW_EMA_PERIOD, ATR_PERIOD + 1) - bars.length),
      inputRange: {
        ...(bars[0] ? { firstObservedAt: bars[0].closeTime } : {}),
        ...(latest ? { lastObservedAt: latest.closeTime } : {}),
      },
      reasons: buildReasons(
        trend,
        volatility,
        priceStructure,
        fastEma?.value,
        slowEma?.value,
        atrPercent,
        higherTimeframeTrend,
      ),
    };
  }

  private async classifyHigherTimeframeTrend(
    query: RegimeQuery,
    higherTimeframe: RegimeQuery['timeframe'],
  ): Promise<TrendRegime> {
    const values = await this.indicators.calculate({
      instrumentId: query.instrumentId,
      timeframe: higherTimeframe,
      asOf: query.asOf,
      periods: { ema: FAST_EMA_PERIOD, rsi: 100, atr: 100 },
    });
    const [fastEma] = values;
    const slowValues = await this.indicators.calculate({
      instrumentId: query.instrumentId,
      timeframe: higherTimeframe,
      asOf: query.asOf,
      periods: { ema: SLOW_EMA_PERIOD, rsi: 100, atr: 100 },
    });
    const [slowEma] = slowValues;
    return classifyTrend(fastEma?.value, slowEma?.value);
  }
}

function classifyTrend(fastEma: number | undefined, slowEma: number | undefined): TrendRegime {
  if (fastEma === undefined || slowEma === undefined) return 'unknown';
  const spreadPercent = ((fastEma - slowEma) / slowEma) * 100;
  if (spreadPercent > 0.03) return 'uptrend';
  if (spreadPercent < -0.03) return 'downtrend';
  return 'sideways';
}

function classifyVolatility(atrPercent: number | undefined): VolatilityRegime {
  if (atrPercent === undefined) return 'unknown';
  if (atrPercent < 0.08) return 'low';
  if (atrPercent > 0.2) return 'high';
  return 'normal';
}

function classifyPriceStructure(bars: readonly Bar[]): PriceStructure {
  const recent = bars.slice(-6);
  if (recent.length < 4) return 'unknown';
  const previous = recent.slice(0, -1);
  const latest = recent.at(-1)!;
  const previousHigh = Math.max(...previous.map((bar) => bar.high));
  const previousLow = Math.min(...previous.map((bar) => bar.low));
  if (latest.close > previousHigh) return 'breakout';
  if (latest.close < previousLow) return 'breakdown';

  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const firstHigh = Math.max(...firstHalf.map((bar) => bar.high));
  const secondHigh = Math.max(...secondHalf.map((bar) => bar.high));
  const firstLow = Math.min(...firstHalf.map((bar) => bar.low));
  const secondLow = Math.min(...secondHalf.map((bar) => bar.low));
  const highDelta = ((secondHigh - firstHigh) / firstHigh) * 100;
  const lowDelta = ((secondLow - firstLow) / firstLow) * 100;
  if (highDelta > 0.03 && lowDelta > 0.03) return 'higher_highs_higher_lows';
  if (highDelta < -0.03 && lowDelta < -0.03) return 'lower_highs_lower_lows';
  return 'range_bound';
}

function buildReasons(
  trend: TrendRegime,
  volatility: VolatilityRegime,
  priceStructure: PriceStructure,
  fastEma: number | undefined,
  slowEma: number | undefined,
  atrPercent: number | undefined,
  higherTimeframeTrend: TrendRegime | undefined,
): readonly string[] {
  const reasons: string[] = [];
  if (fastEma !== undefined && slowEma !== undefined) {
    reasons.push(`Fast EMA ${fastEma} vs slow EMA ${slowEma} classified trend as ${trend}.`);
  } else {
    reasons.push('Not enough closed bars for trend classification.');
  }
  if (atrPercent !== undefined) {
    reasons.push(`ATR is ${atrPercent}% of price, classified volatility as ${volatility}.`);
  } else {
    reasons.push('Not enough closed bars for volatility classification.');
  }
  reasons.push(`Recent highs/lows classified price structure as ${priceStructure}.`);
  if (higherTimeframeTrend !== undefined) {
    reasons.push(`Higher-timeframe trend classified as ${higherTimeframeTrend}.`);
  }
  return reasons;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function hashConfiguration(query: RegimeQuery): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        timeframe: query.timeframe,
        higherTimeframe: query.higherTimeframe ?? null,
        fastEmaPeriod: FAST_EMA_PERIOD,
        slowEmaPeriod: SLOW_EMA_PERIOD,
        atrPeriod: ATR_PERIOD,
      }),
    )
    .digest('hex');
}
