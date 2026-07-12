import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RegimeService } from '../../application/regime-service.js';
import type { RegimeClassification } from '../../domain/regimes.js';
import type { MarketDataStore } from '../../domain/market.js';

const timeframeSchema = z.enum(['1m', '5m', '15m', '1h', '1d']);

const regimeQuerySchema = z.object({
  instrument_id: z.string().min(1),
  timeframe: timeframeSchema.default('5m'),
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
      asOf: new Date(query.as_of),
    });
    return { regime: serializeRegime(regime) };
  });
}

function serializeRegime(regime: RegimeClassification) {
  return {
    instrument_id: regime.instrumentId,
    timeframe: regime.timeframe,
    observed_at: regime.observedAt.toISOString(),
    trend: regime.trend,
    volatility: regime.volatility,
    atr_percent: regime.atrPercent,
    fast_ema: regime.fastEma,
    slow_ema: regime.slowEma,
    close: regime.close,
    reasons: regime.reasons,
  };
}
