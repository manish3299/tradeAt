import type { DependencyProbe, DependencyStatus, Readiness } from '../domain/health.js';

export class CheckReadiness {
  public constructor(
    private readonly probes: readonly DependencyProbe[],
    private readonly timeoutMs: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async execute(): Promise<Readiness> {
    const dependencies = await Promise.all(this.probes.map((probe) => this.check(probe)));
    return {
      status: dependencies.every(({ status }) => status === 'up') ? 'ready' : 'degraded',
      checkedAt: this.now().toISOString(),
      dependencies,
    };
  }

  private async check(probe: DependencyProbe): Promise<DependencyStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await probe.check(controller.signal);
    } catch {
      return {
        name: probe.name,
        status: 'down',
        latencyMs: this.timeoutMs,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
