import type { Bar, Clock, MarketDataStore, Timeframe } from './market.js';

export type PluginType =
  | 'indicator'
  | 'strategy'
  | 'data_adapter'
  | 'regime_classifier'
  | 'statistic';
export type PluginDeterminism = 'deterministic' | 'bounded_nondeterministic';
export type PluginQualityState = 'ok' | 'degraded' | 'insufficient_data' | 'error';
export type PluginPermission = 'market_data:read' | 'network' | 'filesystem';

export type PluginManifest = Readonly<{
  id: string;
  version: string;
  apiVersion: string;
  type: PluginType;
  entryPoint: string;
  description: string;
  configurationSchema: JsonSchema;
  requiredInputs: readonly PluginInputRequirement[];
  emittedOutputs: readonly PluginOutputDeclaration[];
  permissions: readonly PluginPermission[];
  warmupBars: number;
  determinism: PluginDeterminism;
  resourceLimits: PluginResourceLimits;
}>;

export type PluginInputRequirement = Readonly<{
  name: string;
  type: 'bars' | 'ticks' | 'regime' | 'decision' | 'trades';
  required: boolean;
}>;

export type PluginOutputDeclaration = Readonly<{
  name: string;
  schema: JsonSchema;
}>;

export type PluginResourceLimits = Readonly<{
  timeoutMs: number;
  maxInputBars: number;
  maxOutputBytes: number;
}>;

export type JsonSchema = Readonly<{
  type: 'object';
  required?: readonly string[];
  properties: Readonly<Record<string, JsonSchemaProperty>>;
  additionalProperties?: boolean;
}>;

export type JsonSchemaProperty = Readonly<{
  type: 'string' | 'number' | 'integer' | 'boolean';
  minimum?: number;
  maximum?: number;
  enum?: readonly string[];
}>;

export type PluginConfiguration = Readonly<Record<string, string | number | boolean>>;

export type PluginRunInput = Readonly<{
  instrumentId: string;
  timeframe: Timeframe;
  asOf: Date;
  configuration: PluginConfiguration;
}>;

export type PluginExecutionContext = Readonly<{
  clock: Clock;
  market: MarketDataStore;
  signal: AbortSignal;
  loadBars(limit: number): Promise<readonly Bar[]>;
}>;

export type PluginOutput = Readonly<{
  name: string;
  value: string | number | boolean | Record<string, string | number | boolean>;
}>;

export type PluginRunResult = Readonly<{
  quality: PluginQualityState;
  outputs: readonly PluginOutput[];
  warnings: readonly string[];
}>;

export type PluginRunReceipt = Readonly<{
  pluginId: string;
  pluginVersion: string;
  configurationHash: string;
  inputRange: Readonly<{
    instrumentId: string;
    timeframe: Timeframe;
    asOf: Date;
    firstObservedAt?: Date;
    lastObservedAt?: Date;
    inputBars: number;
  }>;
  durationMs: number;
  quality: PluginQualityState;
  outputs: readonly PluginOutput[];
  warnings: readonly string[];
}>;

export interface PluginModule {
  readonly manifest: PluginManifest;
  run(input: PluginRunInput, context: PluginExecutionContext): Promise<PluginRunResult>;
}
