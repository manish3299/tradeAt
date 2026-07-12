import type {
  Bar,
  BarQuery,
  ImportBarsResult,
  Instrument,
  MarketDataStore,
  MarketStatus,
  Timeframe,
} from '../../domain/market.js';

const createdAt = new Date('2026-07-12T00:00:00.000Z');
const receivedAt = new Date('2026-07-12T09:20:00.000Z');

const instruments: readonly Instrument[] = [
  {
    id: 'nse-nifty50',
    symbol: 'NIFTY 50',
    name: 'NIFTY 50 Index',
    venue: 'NSE',
    providerSymbol: 'NIFTY',
    assetClass: 'index',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt,
  },
  {
    id: 'nse-banknifty',
    symbol: 'BANKNIFTY',
    name: 'NIFTY Bank Index',
    venue: 'NSE',
    providerSymbol: 'BANKNIFTY',
    assetClass: 'index',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    createdAt,
  },
];

const seedBars: readonly Bar[] = [
  bar('nse-nifty50', '5m', '2026-07-12T03:45:00.000Z', 24620.5, 24642.2, 24602.8, 24636.9, 182000),
  bar('nse-nifty50', '5m', '2026-07-12T03:50:00.000Z', 24636.9, 24655.4, 24631.1, 24648.3, 171500),
  bar('nse-nifty50', '5m', '2026-07-12T03:55:00.000Z', 24648.3, 24668.6, 24643.7, 24659.8, 194200),
  bar('nse-banknifty', '5m', '2026-07-12T03:45:00.000Z', 52610.2, 52688.9, 52584.4, 52670.5, 96000),
  bar('nse-banknifty', '5m', '2026-07-12T03:50:00.000Z', 52670.5, 52722.1, 52644.8, 52690.3, 88000),
  bar(
    'nse-banknifty',
    '5m',
    '2026-07-12T03:55:00.000Z',
    52690.3,
    52746.7,
    52662.2,
    52731.4,
    101000,
  ),
];

export class InMemoryMarketDataStore implements MarketDataStore {
  private readonly barsByKey = new Map<string, Bar>(
    seedBars.map((candidate) => [barKey(candidate), candidate]),
  );

  listInstruments(): Promise<readonly Instrument[]> {
    return Promise.resolve(instruments);
  }

  findInstrumentById(id: string): Promise<Instrument | undefined> {
    return Promise.resolve(instruments.find((instrument) => instrument.id === id));
  }

  listBars(query: BarQuery): Promise<readonly Bar[]> {
    const filtered = [...this.barsByKey.values()]
      .filter((candidate) => candidate.instrumentId === query.instrumentId)
      .filter((candidate) => candidate.timeframe === query.timeframe)
      .filter((candidate) => !query.from || candidate.openTime >= query.from)
      .filter((candidate) => !query.to || candidate.openTime <= query.to)
      .filter((candidate) => !query.asOf || candidate.closeTime <= query.asOf)
      .sort((left, right) => left.openTime.getTime() - right.openTime.getTime());
    return Promise.resolve(filtered.slice(-query.limit));
  }

  upsertBars(bars: readonly Bar[]): Promise<ImportBarsResult> {
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const candidate of bars) {
      if (!instruments.some((instrument) => instrument.id === candidate.instrumentId)) {
        errors.push(`Unknown instrument: ${candidate.instrumentId}`);
        continue;
      }

      const key = barKey(candidate);
      if (this.barsByKey.has(key)) {
        updated += 1;
      } else {
        inserted += 1;
      }
      this.barsByKey.set(key, candidate);
    }

    return Promise.resolve({ inserted, updated, rejected: errors.length, errors });
  }

  async getStatus(instrumentId: string, timeframe: Timeframe, now: Date): Promise<MarketStatus> {
    const instrumentBars = await this.listBars({ instrumentId, timeframe, limit: 1 });
    const latest = instrumentBars.at(-1);
    const staleAfterSeconds = timeframe === '1d' ? 36 * 60 * 60 : 15 * 60;
    if (!latest) {
      return {
        instrumentId,
        timeframe,
        status: 'empty',
        checkedAt: now,
        staleAfterSeconds,
        gapCount: 0,
        source: 'sample-lite',
      };
    }

    const ageSeconds = Math.max(0, (now.getTime() - latest.closeTime.getTime()) / 1000);
    return {
      instrumentId,
      timeframe,
      status: ageSeconds <= staleAfterSeconds ? 'fresh' : 'stale',
      latestBarAt: latest.closeTime,
      checkedAt: now,
      staleAfterSeconds,
      gapCount: 0,
      source: latest.source,
    };
  }
}

function barKey(bar: Bar): string {
  return [
    bar.instrumentId,
    bar.timeframe,
    bar.openTime.toISOString(),
    bar.source,
    String(bar.revision),
  ].join('|');
}

function bar(
  instrumentId: string,
  timeframe: Timeframe,
  openTimeIso: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): Bar {
  const openTime = new Date(openTimeIso);
  return {
    instrumentId,
    timeframe,
    openTime,
    closeTime: new Date(openTime.getTime() + 5 * 60 * 1000),
    open,
    high,
    low,
    close,
    volume,
    source: 'sample-lite',
    revision: 1,
    receivedAt,
  };
}
