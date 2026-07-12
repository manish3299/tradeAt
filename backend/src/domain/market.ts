export type AssetClass = 'equity' | 'crypto' | 'forex' | 'index' | 'futures';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d';
export type MarketDataStatus = 'fresh' | 'stale' | 'empty';

export interface Clock {
  now(): Date;
}

export type Instrument = Readonly<{
  id: string;
  symbol: string;
  name: string;
  venue: string;
  providerSymbol: string;
  assetClass: AssetClass;
  currency: string;
  timezone: string;
  createdAt: Date;
}>;

export type Bar = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  revision: number;
  receivedAt: Date;
}>;

export type MarketStatus = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  status: MarketDataStatus;
  latestBarAt?: Date;
  checkedAt: Date;
  staleAfterSeconds: number;
  gapCount: number;
  source: string;
}>;

export type BarQuery = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  from?: Date;
  to?: Date;
  asOf?: Date;
  limit: number;
}>;

export type ImportBarsResult = Readonly<{
  inserted: number;
  updated: number;
  rejected: number;
  errors: readonly string[];
}>;

export interface MarketDataStore {
  listInstruments(): Promise<readonly Instrument[]>;
  findInstrumentById(id: string): Promise<Instrument | undefined>;
  listBars(query: BarQuery): Promise<readonly Bar[]>;
  upsertBars(bars: readonly Bar[]): Promise<ImportBarsResult>;
  getStatus(instrumentId: string, timeframe: Timeframe, now: Date): Promise<MarketStatus>;
}

export interface HistoricalBarProvider {
  parseBars(
    input: string,
    options: Readonly<{ receivedAt: Date }>,
  ): ImportBarsResult & {
    bars: readonly Bar[];
  };
}
