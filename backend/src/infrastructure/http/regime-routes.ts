import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RegimeService } from '../../application/regime-service.js';
import type { RegimeClassification } from '../../domain/regimes.js';
import type { MarketDataStore } from '../../domain/market.js';

const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '1d']);

const regimeQuerySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: timeframeSchema.default('5m'),
  higher_timeframe: timeframeSchema.optional(),
  as_of: z.string().datetime(),
});

export function registerRegimeRoutes(app: FastifyInstance, market: MarketDataStore): void {
  const regimes = new RegimeService(market);

  app.get('/api/v1/regimes', async (request, reply) => {
    const query = regimeQuerySchema.parse(request.query);
    const instrument = await market.findInstrumentById(query.instrument_id);
    if (!instrument) return reply.code(404).send({ error: 'instrument_not_found' });

    const regime = await regimes.classify({
      instrumentId: query.instrument_id,
      timeframe: query.timeframe,
      ...(query.higher_timeframe ? { higherTimeframe: query.higher_timeframe } : {}),
      asOf: new Date(query.as_of),
    });
    return { regime: serializeRegime(regime) };
  });
}

function serializeRegime(regime: RegimeClassification) {
  return {
    instrument_id: regime.instrumentId,
    timeframe: regime.timeframe,
    definition_id: regime.definitionId,
    definition_version: regime.definitionVersion,
    configuration_hash: regime.configurationHash,
    observed_at: regime.observedAt.toISOString(),
    quality: regime.quality,
    trend: regime.trend,
    volatility: regime.volatility,
    higher_timeframe: regime.higherTimeframe,
    higher_timeframe_trend: regime.higherTimeframeTrend,
    price_structure: regime.priceStructure,
    atr_percent: regime.atrPercent,
    fast_ema: regime.fastEma,
    slow_ema: regime.slowEma,
    close: regime.close,
    input_bars: regime.inputBars,
    missing_bars: regime.missingBars,
    input_range: {
      first_observed_at: regime.inputRange.firstObservedAt?.toISOString(),
      last_observed_at: regime.inputRange.lastObservedAt?.toISOString(),
    },
    reasons: regime.reasons,
  };
}
