export type DependencyName = 'postgres' | 'redis' | 'local-runtime' | 'local-storage';
export type DependencyStatus = Readonly<{
  name: DependencyName;
  status: 'up' | 'down';
  latencyMs: number;
}>;
export interface DependencyProbe {
  readonly name: DependencyName;
  check(signal: AbortSignal): Promise<DependencyStatus>;
  close(): Promise<void>;
}

export type Readiness = Readonly<{
  status: 'ready' | 'degraded';
  checkedAt: string;
  dependencies: readonly DependencyStatus[];
}>;
