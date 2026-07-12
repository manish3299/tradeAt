import type {
  LiveMarketEvent,
  LiveMarketProvider,
  LiveProviderState,
  LiveSubscription,
} from '../../domain/market.js';

type ReplayClock = () => Date;

export class ReplayLiveMarketProvider implements LiveMarketProvider {
  constructor(
    public readonly source: string,
    private readonly events: readonly LiveMarketEvent[],
    private readonly options: Readonly<{ delayMs?: number; now?: ReplayClock }> = {},
  ) {}

  async connect(subscription: LiveSubscription, signal: AbortSignal): Promise<void> {
    const now = this.options.now ?? (() => new Date());
    await subscription.onState(state('connecting', now, 1));
    if (signal.aborted) {
      await subscription.onState(state('disconnected', now, 1, signal.reason));
      return;
    }

    await subscription.onState(state('connected', now, 1));
    const instrumentIds = new Set(subscription.instrumentIds);
    const replay = this.events
      .filter((event) => instrumentIds.has(event.instrumentId))
      .sort((left, right) => {
        const observedDelta = left.observedAt.getTime() - right.observedAt.getTime();
        return observedDelta === 0 ? left.eventId.localeCompare(right.eventId) : observedDelta;
      });

    for (const event of replay) {
      if (signal.aborted) break;
      await maybeDelay(this.options.delayMs ?? 0, signal);
      if (signal.aborted) break;
      await subscription.onEvent(event);
    }

    await subscription.onState(state('disconnected', now, 1, signal.reason));
  }
}

function state(
  status: LiveProviderState['status'],
  now: ReplayClock,
  attempt: number,
  reason?: unknown,
): LiveProviderState {
  const reasonText =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : undefined;
  return {
    status,
    changedAt: now(),
    attempt,
    ...(reasonText ? { reason: reasonText } : {}),
  };
}

function maybeDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
