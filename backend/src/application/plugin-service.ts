import { createHash } from 'node:crypto';
import type {
  JsonSchema,
  PluginConfiguration,
  PluginManifest,
  PluginModule,
  PluginRunInput,
  PluginRunReceipt,
} from '../domain/plugins.js';
import type { Clock, MarketDataStore } from '../domain/market.js';

export class PluginValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginValidationError';
  }
}

export class PluginExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginExecutionError';
  }
}

export class PluginRegistry {
  private readonly modules = new Map<string, PluginModule>();

  register(module: PluginModule): void {
    validateManifest(module.manifest);
    if (this.modules.has(module.manifest.id)) {
      throw new PluginValidationError(`Plugin already registered: ${module.manifest.id}`);
    }
    this.modules.set(module.manifest.id, module);
  }

  list(): readonly PluginManifest[] {
    return [...this.modules.values()].map((module) => module.manifest);
  }

  get(pluginId: string): PluginModule | undefined {
    return this.modules.get(pluginId);
  }
}

export class PluginService {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly market: MarketDataStore,
    private readonly clock: Clock,
  ) {}

  async run(pluginId: string, input: PluginRunInput): Promise<PluginRunReceipt> {
    const module = this.registry.get(pluginId);
    if (!module) throw new PluginValidationError(`Unknown plugin: ${pluginId}`);
    validateConfiguration(module.manifest.configurationSchema, input.configuration);

    const startedAt = this.clock.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort('plugin_timeout'),
      module.manifest.resourceLimits.timeoutMs,
    );
    const loadedBars: Awaited<ReturnType<MarketDataStore['listBars']>>[] = [];

    try {
      const runResult = await module.run(input, {
        clock: this.clock,
        market: this.market,
        signal: controller.signal,
        loadBars: async (limit) => {
          const boundedLimit = Math.min(limit, module.manifest.resourceLimits.maxInputBars);
          const bars = await this.market.listBars({
            instrumentId: input.instrumentId,
            timeframe: input.timeframe,
            asOf: input.asOf,
            limit: boundedLimit,
          });
          loadedBars.push(bars);
          return bars;
        },
      });
      if (controller.signal.aborted) throw new PluginExecutionError('Plugin timed out.');

      const outputBytes = Buffer.byteLength(JSON.stringify(runResult.outputs), 'utf8');
      if (outputBytes > module.manifest.resourceLimits.maxOutputBytes) {
        throw new PluginExecutionError('Plugin output exceeded maxOutputBytes.');
      }

      const bars = loadedBars.flat();
      return {
        pluginId: module.manifest.id,
        pluginVersion: module.manifest.version,
        configurationHash: hashConfiguration(input.configuration),
        inputRange: {
          instrumentId: input.instrumentId,
          timeframe: input.timeframe,
          asOf: input.asOf,
          ...(bars[0] ? { firstObservedAt: bars[0].closeTime } : {}),
          ...(bars.at(-1) ? { lastObservedAt: bars.at(-1)!.closeTime } : {}),
          inputBars: bars.length,
        },
        durationMs: Math.max(0, this.clock.now().getTime() - startedAt.getTime()),
        quality: runResult.quality,
        outputs: runResult.outputs,
        warnings: runResult.warnings,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function validateManifest(manifest: PluginManifest): void {
  if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/.test(manifest.id)) {
    throw new PluginValidationError('Plugin id must be stable dot-separated kebab identifiers.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    throw new PluginValidationError('Plugin version must be semantic x.y.z.');
  }
  if (!manifest.entryPoint.trim())
    throw new PluginValidationError('Plugin entryPoint is required.');
  if (manifest.warmupBars < 0)
    throw new PluginValidationError('Plugin warmupBars cannot be negative.');
  if (manifest.resourceLimits.timeoutMs < 1) {
    throw new PluginValidationError('Plugin timeoutMs must be positive.');
  }
  if (manifest.resourceLimits.maxInputBars < manifest.warmupBars) {
    throw new PluginValidationError('Plugin maxInputBars must cover warmupBars.');
  }
  if (manifest.resourceLimits.maxOutputBytes < 1) {
    throw new PluginValidationError('Plugin maxOutputBytes must be positive.');
  }
}

export function validateConfiguration(
  schema: JsonSchema,
  configuration: PluginConfiguration,
): void {
  const required = schema.required ?? [];
  for (const key of required) {
    if (!(key in configuration)) throw new PluginValidationError(`Missing plugin config: ${key}`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(configuration)) {
      if (!(key in schema.properties))
        throw new PluginValidationError(`Unknown plugin config: ${key}`);
    }
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (!(key in configuration)) continue;
    const value = configuration[key];
    if (property.type === 'integer') {
      if (!Number.isInteger(value))
        throw new PluginValidationError(`Plugin config ${key} must be integer.`);
    } else if (typeof value !== property.type) {
      throw new PluginValidationError(`Plugin config ${key} must be ${property.type}.`);
    }
    if (typeof value === 'number') {
      if (property.minimum !== undefined && value < property.minimum) {
        throw new PluginValidationError(`Plugin config ${key} is below minimum.`);
      }
      if (property.maximum !== undefined && value > property.maximum) {
        throw new PluginValidationError(`Plugin config ${key} is above maximum.`);
      }
    }
    if (property.enum && !property.enum.includes(String(value))) {
      throw new PluginValidationError(`Plugin config ${key} is not an allowed value.`);
    }
  }
}

export function hashConfiguration(configuration: PluginConfiguration): string {
  const stable = Object.fromEntries(
    Object.entries(configuration).sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
