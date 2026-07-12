import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  Bar,
  Clock,
  HistoricalBarProvider,
  Instrument,
  MarketDataStore,
  MarketStatus,
} from '../../domain/market.js';
import { CsvHistoricalBarProvider } from '../market/csv-historical-bar-provider.js';

const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '1d']);

const barsQuerySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: timeframeSchema.default('5m'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  as_of: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const statusQuerySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: timeframeSchema.default('5m'),
});

const importBarsSchema = z.object({
  csv: z.string().min(1).max(250_000),
});

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export function registerMarketRoutes(
  app: FastifyInstance,
  market: MarketDataStore,
  options: Readonly<{
    clock?: Clock;
    historicalBarProvider?: HistoricalBarProvider;
  }> = {},
): void {
  const clock = options.clock ?? new SystemClock();
  const historicalBarProvider = options.historicalBarProvider ?? new CsvHistoricalBarProvider();

  app.get('/api/v1/instruments', async () => {
    const instruments = await market.listInstruments();
    return { instruments: instruments.map(serializeInstrument) };
  });

  app.get('/api/v1/market/bars', async (request, reply) => {
    const query = barsQuerySchema.parse(request.query);
    const instrument = await market.findInstrumentById(query.instrument_id);
    if (!instrument) return reply.code(404).send({ error: 'instrument_not_found' });

    const bars = await market.listBars({
      instrumentId: query.instrument_id,
      timeframe: query.timeframe,
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.as_of ? { asOf: new Date(query.as_of) } : {}),
      limit: query.limit,
    });

    return {
      instrument: serializeInstrument(instrument),
      timeframe: query.timeframe,
      bars: bars.map(serializeBar),
    };
  });

  app.get('/api/v1/market/status', async (request, reply) => {
    const query = statusQuerySchema.parse(request.query);
    const instrument = await market.findInstrumentById(query.instrument_id);
    if (!instrument) return reply.code(404).send({ error: 'instrument_not_found' });

    const status = await market.getStatus(query.instrument_id, query.timeframe, clock.now());
    return { instrument: serializeInstrument(instrument), status: serializeStatus(status) };
  });

  app.post('/api/v1/market/bars/import', async (request, reply) => {
    const input = importBarsSchema.parse(request.body);
    const parsed = historicalBarProvider.parseBars(input.csv, { receivedAt: clock.now() });
    const result = await market.upsertBars(parsed.bars);
    const rejected = parsed.rejected + result.rejected;

    return reply.code(rejected > 0 ? 207 : 201).send({
      inserted: result.inserted,
      updated: result.updated,
      rejected,
      errors: [...parsed.errors, ...result.errors],
    });
  });
}

function serializeInstrument(instrument: Instrument) {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    venue: instrument.venue,
    provider_symbol: instrument.providerSymbol,
    asset_class: instrument.assetClass,
    currency: instrument.currency,
    timezone: instrument.timezone,
    created_at: instrument.createdAt.toISOString(),
  };
}

function serializeBar(bar: Bar) {
  return {
    instrument_id: bar.instrumentId,
    timeframe: bar.timeframe,
    open_time: bar.openTime.toISOString(),
    close_time: bar.closeTime.toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    source: bar.source,
    revision: bar.revision,
    received_at: bar.receivedAt.toISOString(),
  };
}

function serializeStatus(status: MarketStatus) {
  return {
    instrument_id: status.instrumentId,
    timeframe: status.timeframe,
    status: status.status,
    latest_bar_at: status.latestBarAt?.toISOString(),
    checked_at: status.checkedAt.toISOString(),
    stale_after_seconds: status.staleAfterSeconds,
    gap_count: status.gapCount,
    source: status.source,
  };
}
