import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IndicatorService } from '../../application/indicator-service.js';
import type { IndicatorValue } from '../../domain/indicators.js';
import type { MarketDataStore } from '../../domain/market.js';

const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '1d']);

const indicatorsQuerySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: timeframeSchema.default('5m'),
  as_of: z.string().datetime(),
  ema_period: z.coerce.number().int().min(2).max(200).default(3),
  rsi_period: z.coerce.number().int().min(2).max(200).default(3),
  atr_period: z.coerce.number().int().min(2).max(200).default(3),
});

export function registerIndicatorRoutes(app: FastifyInstance, market: MarketDataStore): void {
  const indicators = new IndicatorService(market);

  app.get('/api/v1/indicators', async (request, reply) => {
    const query = indicatorsQuerySchema.parse(request.query);
    const instrument = await market.findInstrumentById(query.instrument_id);
    if (!instrument) return reply.code(404).send({ error: 'instrument_not_found' });

    const values = await indicators.calculate({
      instrumentId: query.instrument_id,
      timeframe: query.timeframe,
      asOf: new Date(query.as_of),
      periods: {
        ema: query.ema_period,
        rsi: query.rsi_period,
        atr: query.atr_period,
      },
    });

    return {
      instrument_id: query.instrument_id,
      timeframe: query.timeframe,
      as_of: query.as_of,
      values: values.map(serializeIndicator),
    };
  });
}

function serializeIndicator(value: IndicatorValue) {
  return {
    kind: value.kind,
    instrument_id: value.instrumentId,
    timeframe: value.timeframe,
    period: value.period,
    definition_id: value.definitionId,
    definition_version: value.definitionVersion,
    configuration_hash: value.configurationHash,
    observed_at: value.observedAt.toISOString(),
    value: value.value,
    quality: value.quality,
    warmup_bars: value.warmupBars,
    input_bars: value.inputBars,
    missing_bars: value.missingBars,
    input_range: {
      first_observed_at: value.inputRange.firstObservedAt?.toISOString(),
      last_observed_at: value.inputRange.lastObservedAt?.toISOString(),
    },
    warnings: value.warnings,
  };
}
