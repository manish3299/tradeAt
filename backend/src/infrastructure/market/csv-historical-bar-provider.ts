import type {
  Bar,
  HistoricalBarProvider,
  ImportBarsResult,
  Timeframe,
} from '../../domain/market.js';

const requiredHeaders = [
  'instrument_id',
  'timeframe',
  'open_time',
  'open',
  'high',
  'low',
  'close',
  'volume',
] as const;

const timeframeDurationsMs: Record<Timeframe, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export class CsvHistoricalBarProvider implements HistoricalBarProvider {
  parseBars(
    input: string,
    options: Readonly<{ receivedAt: Date }>,
  ): ImportBarsResult & {
    bars: readonly Bar[];
  } {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return { bars: [], inserted: 0, updated: 0, rejected: 1, errors: ['CSV is empty'] };
    }

    const headers = parseCsvLine(lines[0] ?? '');
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length > 0) {
      return {
        bars: [],
        inserted: 0,
        updated: 0,
        rejected: 1,
        errors: [`Missing required headers: ${missingHeaders.join(', ')}`],
      };
    }

    const bars: Bar[] = [];
    const errors: string[] = [];
    for (const [index, line] of lines.slice(1).entries()) {
      const rowNumber = index + 2;
      const values = parseCsvLine(line);
      const row = Object.fromEntries(
        headers.map((header, valueIndex) => [header, values[valueIndex] ?? '']),
      );
      const parsed = parseBarRow(row, rowNumber, options.receivedAt);
      if (typeof parsed === 'string') {
        errors.push(parsed);
      } else {
        bars.push(parsed);
      }
    }

    return {
      bars,
      inserted: 0,
      updated: 0,
      rejected: errors.length,
      errors,
    };
  }
}

function parseBarRow(
  row: Record<string, string>,
  rowNumber: number,
  receivedAt: Date,
): Bar | string {
  const timeframe = row['timeframe'];
  if (!isTimeframe(timeframe)) return `Row ${rowNumber}: unsupported timeframe`;

  const openTime = parseDate(row['open_time']);
  if (!openTime) return `Row ${rowNumber}: invalid open_time`;

  const open = parsePositiveNumber(row['open']);
  const high = parsePositiveNumber(row['high']);
  const low = parsePositiveNumber(row['low']);
  const close = parsePositiveNumber(row['close']);
  const volume = parsePositiveNumber(row['volume']);
  if (
    open === undefined ||
    high === undefined ||
    low === undefined ||
    close === undefined ||
    volume === undefined
  ) {
    return `Row ${rowNumber}: invalid numeric value`;
  }
  if (high < Math.max(open, close) || low > Math.min(open, close)) {
    return `Row ${rowNumber}: high/low do not contain open and close`;
  }

  const instrumentId = row['instrument_id']?.trim();
  if (!instrumentId) return `Row ${rowNumber}: missing instrument_id`;

  return {
    instrumentId,
    timeframe,
    openTime,
    closeTime: new Date(openTime.getTime() + timeframeDurationsMs[timeframe]),
    open,
    high,
    low,
    close,
    volume,
    source: row['source']?.trim() || 'csv-import',
    revision: Number(row['revision'] || '1'),
    receivedAt,
  };
}

function parseCsvLine(line: string): string[] {
  return line.split(',').map((value) => value.trim());
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isTimeframe(value: string | undefined): value is Timeframe {
  return value === '1m' || value === '5m' || value === '15m' || value === '1h' || value === '1d';
}
