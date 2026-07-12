import type { Timeframe } from './market.js';

export type TrendRegime = 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'unknown';
export type RegimeQuality = 'ok' | 'insufficient_data';
export type PriceStructure =
  | 'higher_highs_higher_lows'
  | 'lower_highs_lower_lows'
  | 'range_bound'
  | 'breakout'
  | 'breakdown'
  | 'unknown';

export type RegimeClassification = Readonly<{
  definitionId: string;
  definitionVersion: string;
  configurationHash: string;
  instrumentId: string;
  timeframe: Timeframe;
  observedAt: Date;
  quality: RegimeQuality;
  trend: TrendRegime;
  volatility: VolatilityRegime;
  higherTimeframe?: Timeframe;
  higherTimeframeTrend?: TrendRegime;
  priceStructure: PriceStructure;
  atrPercent?: number;
  fastEma?: number;
  slowEma?: number;
  close?: number;
  inputBars: number;
  missingBars: number;
  inputRange: Readonly<{
    firstObservedAt?: Date;
    lastObservedAt?: Date;
  }>;
  reasons: readonly string[];
}>;

export type RegimeQuery = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  higherTimeframe?: Timeframe;
  asOf: Date;
}>;
