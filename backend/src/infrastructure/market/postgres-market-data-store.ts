import pg from 'pg';
import type {
  AssetClass,
  Bar,
  BarQuery,
  ImportBarsResult,
  Instrument,
  MarketDataStore,
  MarketStatus,
  Timeframe,
} from '../../domain/market.js';

type DatabaseClient = Pick<pg.Pool | pg.PoolClient, 'query'>;

type InstrumentRow = Readonly<{
  id: string;
  symbol: string;
  name: string;
  venue: string;
  provider_symbol: string;
  asset_class: string;
  currency: string;
  timezone: string;
  created_at: Date;
}>;

type BarRow = Readonly<{
  instrument_id: string;
  timeframe: string;
  open_time: Date;
  close_time: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  source: string;
  revision: string;
  received_at: Date;
}>;

export class PostgresMarketDataStore implements MarketDataStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 4 });
  }

  async listInstruments(): Promise<readonly Instrument[]> {
    const result = await this.pool.query<InstrumentRow>(
      `select id, symbol, name, venue, provider_symbol, asset_class, currency, timezone, created_at
       from instruments
       order by venue asc, symbol asc`,
    );
    return result.rows.map(toInstrument);
  }

  async findInstrumentById(id: string): Promise<Instrument | undefined> {
    const result = await this.pool.query<InstrumentRow>(
      `select id, symbol, name, venue, provider_symbol, asset_class, currency, timezone, created_at
       from instruments
       where id = $1`,
      [id],
    );
    return result.rows[0] ? toInstrument(result.rows[0]) : undefined;
  }

  async listBars(query: BarQuery): Promise<readonly Bar[]> {
    const conditions = ['instrument_id = $1', 'timeframe = $2'];
    const values: unknown[] = [query.instrumentId, query.timeframe];
    if (query.from) {
      values.push(query.from);
      conditions.push(`open_time >= $${values.length}`);
    }
    if (query.to) {
      values.push(query.to);
      conditions.push(`open_time <= $${values.length}`);
    }
    if (query.asOf) {
      values.push(query.asOf);
      conditions.push(`close_time <= $${values.length}`);
      values.push(query.asOf);
      conditions.push(`received_at <= $${values.length}`);
    }
    values.push(query.limit);

    const result = await this.pool.query<BarRow>(
      `select instrument_id, timeframe, open_time, close_time, open, high, low, close, volume,
              source, revision, received_at
       from (
         select distinct on (instrument_id, timeframe, open_time, source)
                instrument_id, timeframe, open_time, close_time, open, high, low, close, volume,
                source, revision, received_at
         from bars
         where ${conditions.join(' and ')}
         order by instrument_id, timeframe, open_time, source, revision::integer desc, received_at desc
       ) latest_bars
       order by open_time desc
       limit $${values.length}`,
      values,
    );
    return result.rows.map(toBar).reverse();
  }

  async upsertBars(bars: readonly Bar[]): Promise<ImportBarsResult> {
    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
      await client.query('begin');
      for (const bar of bars) {
        const exists = await instrumentExists(client, bar.instrumentId);
        if (!exists) {
          errors.push(`Unknown instrument: ${bar.instrumentId}`);
          continue;
        }

        const alreadyPresent = await barExists(client, bar);
        await client.query(
          `insert into bars (
             instrument_id, timeframe, open_time, close_time, open, high, low, close, volume,
             source, revision, received_at
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           on conflict (instrument_id, timeframe, open_time, source, revision)
           do update set
             close_time = excluded.close_time,
             open = excluded.open,
             high = excluded.high,
             low = excluded.low,
             close = excluded.close,
             volume = excluded.volume,
             received_at = excluded.received_at`,
          [
            bar.instrumentId,
            bar.timeframe,
            bar.openTime,
            bar.closeTime,
            String(bar.open),
            String(bar.high),
            String(bar.low),
            String(bar.close),
            String(bar.volume),
            bar.source,
            String(bar.revision),
            bar.receivedAt,
          ],
        );
        if (alreadyPresent) updated += 1;
        else inserted += 1;
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return { inserted, updated, rejected: errors.length, errors };
  }

  async getStatus(instrumentId: string, timeframe: Timeframe, now: Date): Promise<MarketStatus> {
    const latest = (await this.listBars({ instrumentId, timeframe, limit: 1 })).at(-1);
    const staleAfterSeconds = timeframe === '1d' ? 36 * 60 * 60 : 15 * 60;
    if (!latest) {
      return {
        instrumentId,
        timeframe,
        status: 'empty',
        checkedAt: now,
        staleAfterSeconds,
        gapCount: 0,
        source: 'postgres',
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}

async function instrumentExists(client: DatabaseClient, instrumentId: string): Promise<boolean> {
  const result = await client.query('select 1 from instruments where id = $1', [instrumentId]);
  return result.rowCount === 1;
}

async function barExists(client: DatabaseClient, bar: Bar): Promise<boolean> {
  const result = await client.query(
    `select 1
     from bars
     where instrument_id = $1 and timeframe = $2 and open_time = $3 and source = $4 and revision = $5`,
    [bar.instrumentId, bar.timeframe, bar.openTime, bar.source, String(bar.revision)],
  );
  return result.rowCount === 1;
}

function toInstrument(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    venue: row.venue,
    providerSymbol: row.provider_symbol,
    assetClass: row.asset_class as AssetClass,
    currency: row.currency,
    timezone: row.timezone,
    createdAt: row.created_at,
  };
}

function toBar(row: BarRow): Bar {
  return {
    instrumentId: row.instrument_id,
    timeframe: row.timeframe as Timeframe,
    openTime: row.open_time,
    closeTime: row.close_time,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    source: row.source,
    revision: Number(row.revision),
    receivedAt: row.received_at,
  };
}
