import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  PluginService,
  PluginValidationError,
} from '../src/application/plugin-service.js';
import type { Clock, MarketDataStore } from '../src/domain/market.js';
import type { PluginModule } from '../src/domain/plugins.js';
import { InMemoryMarketDataStore } from '../src/infrastructure/market/in-memory-market-data-store.js';

const clock: Clock = {
  now: () => new Date('2026-07-12T04:30:00.000Z'),
};

describe('PluginService', () => {
  it('registers manifests and returns versioned run receipts with input provenance', async () => {
    const registry = new PluginRegistry();
    registry.register(closeAveragePlugin());
    const service = new PluginService(registry, new InMemoryMarketDataStore(), clock);

    const receipt = await service.run('tradeat.close-average', {
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T09:30:00.000Z'),
      configuration: { period: 3 },
    });

    expect(receipt).toMatchObject({
      pluginId: 'tradeat.close-average',
      pluginVersion: '1.0.0',
      quality: 'ok',
      inputRange: {
        instrumentId: 'nse-nifty50',
        timeframe: '5m',
        inputBars: 3,
      },
      outputs: [{ name: 'average_close', value: 24648.3333 }],
      warnings: [],
    });
    expect(receipt.configurationHash).toHaveLength(64);
  });

  it('validates manifest identity, semantic versions, limits, and duplicate ids', () => {
    const registry = new PluginRegistry();
    registry.register(closeAveragePlugin());

    expect(() => registry.register(closeAveragePlugin())).toThrow(PluginValidationError);
    expect(() =>
      registry.register({
        ...closeAveragePlugin(),
        manifest: { ...closeAveragePlugin().manifest, id: 'Bad Id' },
      }),
    ).toThrow('Plugin id must be stable');
    expect(() =>
      registry.register({
        ...closeAveragePlugin(),
        manifest: { ...closeAveragePlugin().manifest, version: '1' },
      }),
    ).toThrow('semantic');
  });

  it('validates configuration before plugin execution', async () => {
    const registry = new PluginRegistry();
    registry.register(closeAveragePlugin());
    const service = new PluginService(registry, new InMemoryMarketDataStore(), clock);

    await expect(
      service.run('tradeat.close-average', {
        instrumentId: 'nse-nifty50',
        timeframe: '5m',
        asOf: new Date('2026-07-12T04:30:00.000Z'),
        configuration: { period: 0 },
      }),
    ).rejects.toThrow('below minimum');
    await expect(
      service.run('tradeat.close-average', {
        instrumentId: 'nse-nifty50',
        timeframe: '5m',
        asOf: new Date('2026-07-12T04:30:00.000Z'),
        configuration: { period: 3, extra: true },
      }),
    ).rejects.toThrow('Unknown plugin config');
  });

  it('reports insufficient data without hiding plugin provenance', async () => {
    const registry = new PluginRegistry();
    registry.register(closeAveragePlugin());
    const emptyMarket: MarketDataStore = {
      listInstruments: () => Promise.resolve([]),
      findInstrumentById: () => Promise.resolve(undefined),
      listBars: () => Promise.resolve([]),
      upsertBars: () => Promise.resolve({ inserted: 0, updated: 0, rejected: 0, errors: [] }),
      getStatus: (instrumentId, timeframe, now) =>
        Promise.resolve({
          instrumentId,
          timeframe,
          status: 'empty',
          checkedAt: now,
          staleAfterSeconds: 900,
          gapCount: 0,
          source: 'test',
        }),
    };
    const service = new PluginService(registry, emptyMarket, clock);

    const receipt = await service.run('tradeat.close-average', {
      instrumentId: 'nse-nifty50',
      timeframe: '5m',
      asOf: new Date('2026-07-12T04:30:00.000Z'),
      configuration: { period: 3 },
    });

    expect(receipt).toMatchObject({
      quality: 'insufficient_data',
      inputRange: { inputBars: 0 },
      warnings: ['Need 3 bars, received 0.'],
    });
  });
});

function closeAveragePlugin(): PluginModule {
  return {
    manifest: {
      id: 'tradeat.close-average',
      version: '1.0.0',
      apiVersion: '1.0.0',
      type: 'indicator',
      entryPoint: 'closeAverage',
      description: 'Reference close average indicator plugin.',
      configurationSchema: {
        type: 'object',
        required: ['period'],
        additionalProperties: false,
        properties: {
          period: { type: 'integer', minimum: 2, maximum: 20 },
        },
      },
      requiredInputs: [{ name: 'bars', type: 'bars', required: true }],
      emittedOutputs: [
        {
          name: 'average_close',
          schema: {
            type: 'object',
            properties: { value: { type: 'number' } },
          },
        },
      ],
      permissions: ['market_data:read'],
      warmupBars: 3,
      determinism: 'deterministic',
      resourceLimits: { timeoutMs: 1000, maxInputBars: 50, maxOutputBytes: 2000 },
    },
    async run(input, context) {
      const period = Number(input.configuration['period']);
      const bars = await context.loadBars(period);
      if (bars.length < period) {
        return {
          quality: 'insufficient_data',
          outputs: [],
          warnings: [`Need ${period} bars, received ${bars.length}.`],
        };
      }
      const average =
        bars.slice(-period).reduce((sum, bar) => sum + bar.close, 0) / Math.max(period, 1);
      return {
        quality: 'ok',
        outputs: [{ name: 'average_close', value: Number(average.toFixed(4)) }],
        warnings: [],
      };
    },
  };
}
