import { IndicatorService } from './indicator-service.js';
import type {
  RegimeClassification,
  RegimeQuery,
  TrendRegime,
  VolatilityRegime,
} from '../domain/regimes.js';
import type { MarketDataStore } from '../domain/market.js';

const FAST_EMA_PERIOD = 3;
const SLOW_EMA_PERIOD = 6;
const ATR_PERIOD = 3;

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
        instrumentId: query.instrumentId,
        timeframe: query.timeframe,
        observedAt: query.asOf,
        trend: 'unknown',
        volatility: 'unknown',
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
    const atr = values.find((value) => value.kind === 'atr')?.value;
    const close = latest.close;
    const trend = classifyTrend(fastEma?.value, slowEma?.value);
    const atrPercent = atr === undefined ? undefined : round((atr / close) * 100);
    const volatility = classifyVolatility(atrPercent);

    return {
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      observedAt: latest.closeTime,
      trend,
      volatility,
      ...(atrPercent !== undefined ? { atrPercent } : {}),
      ...(fastEma?.value !== undefined ? { fastEma: fastEma.value } : {}),
      ...(slowEma?.value !== undefined ? { slowEma: slowEma.value } : {}),
      close,
      reasons: buildReasons(trend, volatility, fastEma?.value, slowEma?.value, atrPercent),
    };
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

function buildReasons(
  trend: TrendRegime,
  volatility: VolatilityRegime,
  fastEma: number | undefined,
  slowEma: number | undefined,
  atrPercent: number | undefined,
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
  return reasons;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
