import type { Timeframe } from './market.js';

export type IndicatorKind = 'ema' | 'rsi' | 'atr';
export type IndicatorQuality = 'ok' | 'insufficient_data';

export type IndicatorValue = Readonly<{
  kind: IndicatorKind;
  definitionId: string;
  definitionVersion: string;
  configurationHash: string;
  instrumentId: string;
  timeframe: Timeframe;
  period: number;
  observedAt: Date;
  value?: number;
  quality: IndicatorQuality;
  warmupBars: number;
  inputBars: number;
  missingBars: number;
  inputRange: Readonly<{
    firstObservedAt?: Date;
    lastObservedAt?: Date;
  }>;
  warnings: readonly string[];
}>;

export type IndicatorQuery = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  asOf: Date;
  periods: Readonly<{
    ema: number;
    rsi: number;
    atr: number;
  }>;
}>;
