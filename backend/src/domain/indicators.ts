import type { Timeframe } from './market.js';

export type IndicatorKind = 'ema' | 'rsi' | 'atr';

export type IndicatorValue = Readonly<{
  kind: IndicatorKind;
  instrumentId: string;
  timeframe: Timeframe;
  period: number;
  observedAt: Date;
  value: number;
  warmupBars: number;
  inputBars: number;
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
