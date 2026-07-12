import type { Timeframe } from './market.js';

export type TrendRegime = 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'unknown';

export type RegimeClassification = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  observedAt: Date;
  trend: TrendRegime;
  volatility: VolatilityRegime;
  atrPercent?: number;
  fastEma?: number;
  slowEma?: number;
  close?: number;
  reasons: readonly string[];
}>;

export type RegimeQuery = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  asOf: Date;
}>;
