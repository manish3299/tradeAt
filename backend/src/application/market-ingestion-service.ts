import type {
  Bar,
  Clock,
  LiveMarketEvent,
  LiveMarketProvider,
  LiveProviderState,
  MarketDataStore,
} from '../domain/market.js';

export type IngestionDecision = 'accepted' | 'deduplicated' | 'rejected';

export type IngestionEventResult = Readonly<{
  decision: IngestionDecision;
  eventId: string;
  persistedBars: number;
  correctionsApplied: number;
  gapsDetected: number;
  reason?: 'duplicate_event' | 'out_of_order_event' | 'unknown_replacement' | 'unsupported_payload';
}>;

export type IngestionFreshness = Readonly<{
  instrumentId: string;
  status: 'empty' | 'fresh' | 'stale';
  checkedAt: Date;
  staleAfterSeconds: number;
  latestObservedAt?: Date;
  latestReceivedAt?: Date;
  gapCount: number;
}>;

export type IngestionRunSummary = Readonly<{
  attempts: number;
  accepted: number;
  deduplicated: number;
  rejected: number;
  gapsDetected: number;
  correctionsApplied: number;
  states: readonly LiveProviderState[];
}>;

export class MarketIngestionService {
  private readonly seenEventIds = new Set<string>();
  private readonly latestObservedByInstrument = new Map<string, Date>();
  private readonly latestReceivedByInstrument = new Map<string, Date>();
  private readonly latestBarCloseByKey = new Map<string, Date>();
  private readonly gapsByInstrument = new Map<string, number>();
  private accepted = 0;
  private deduplicated = 0;
  private rejected = 0;
  private gapsDetected = 0;
  private correctionsApplied = 0;

  constructor(
    private readonly market: MarketDataStore,
    private readonly clock: Clock,
    private readonly options: Readonly<{
      staleAfterSeconds?: number;
      reconnectBackoffMs?: number;
    }> = {},
  ) {}

  async ingestEvent(event: LiveMarketEvent): Promise<IngestionEventResult> {
    if (this.seenEventIds.has(event.eventId)) {
      this.deduplicated += 1;
      return result('deduplicated', event, 0, 0, 0, 'duplicate_event');
    }

    const latestObserved = this.latestObservedByInstrument.get(event.instrumentId);
    if (latestObserved && event.observedAt < latestObserved && event.type !== 'correction') {
      this.seenEventIds.add(event.eventId);
      this.rejected += 1;
      return result('rejected', event, 0, 0, 0, 'out_of_order_event');
    }

    if (
      event.type === 'correction' &&
      (!event.replacesEventId || !this.seenEventIds.has(event.replacesEventId))
    ) {
      this.seenEventIds.add(event.eventId);
      this.rejected += 1;
      return result('rejected', event, 0, 0, 0, 'unknown_replacement');
    }

    if (!isBar(event.payload)) {
      this.seenEventIds.add(event.eventId);
      this.rejected += 1;
      return result('rejected', event, 0, 0, 0, 'unsupported_payload');
    }

    const gapsDetected = this.countBarGap(event.payload);
    const importResult = await this.market.upsertBars([event.payload]);
    const persistedBars = importResult.inserted + importResult.updated;
    const correctionsApplied = event.type === 'correction' ? 1 : 0;

    this.seenEventIds.add(event.eventId);
    this.latestObservedByInstrument.set(event.instrumentId, event.observedAt);
    this.latestReceivedByInstrument.set(event.instrumentId, event.receivedAt);
    this.accepted += 1;
    this.gapsDetected += gapsDetected;
    this.correctionsApplied += correctionsApplied;

    return result('accepted', event, persistedBars, correctionsApplied, gapsDetected);
  }

  getFreshness(instrumentId: string, now: Date = this.clock.now()): IngestionFreshness {
    const latestObservedAt = this.latestObservedByInstrument.get(instrumentId);
    const latestReceivedAt = this.latestReceivedByInstrument.get(instrumentId);
    const staleAfterSeconds = this.options.staleAfterSeconds ?? 15 * 60;
    if (!latestReceivedAt || !latestObservedAt) {
      return {
        instrumentId,
        status: 'empty',
        checkedAt: now,
        staleAfterSeconds,
        gapCount: this.gapsByInstrument.get(instrumentId) ?? 0,
      };
    }

    const ageSeconds = Math.max(0, (now.getTime() - latestReceivedAt.getTime()) / 1000);
    return {
      instrumentId,
      status: ageSeconds <= staleAfterSeconds ? 'fresh' : 'stale',
      checkedAt: now,
      staleAfterSeconds,
      latestObservedAt,
      latestReceivedAt,
      gapCount: this.gapsByInstrument.get(instrumentId) ?? 0,
    };
  }

  async runLive(
    provider: LiveMarketProvider,
    instrumentIds: readonly string[],
    signal: AbortSignal,
    options: Readonly<{ maxAttempts?: number }> = {},
  ): Promise<IngestionRunSummary> {
    const states: LiveProviderState[] = [];
    const maxAttempts = options.maxAttempts ?? 3;
    let attempts = 0;

    while (!signal.aborted && attempts < maxAttempts) {
      attempts += 1;
      try {
        await provider.connect(
          {
            instrumentIds,
            onEvent: async (event) => {
              await this.ingestEvent(event);
            },
            onState: (state) => {
              states.push(state);
            },
          },
          signal,
        );
        break;
      } catch (error) {
        if (signal.aborted || attempts >= maxAttempts) throw error;
        const retryAt = new Date(
          this.clock.now().getTime() + (this.options.reconnectBackoffMs ?? 0),
        );
        states.push({
          status: 'reconnecting',
          changedAt: this.clock.now(),
          attempt: attempts + 1,
          retryAt,
          reason: error instanceof Error ? error.message : 'provider_error',
        });
        await delayUntilRetry(retryAt, signal);
      }
    }

    return {
      attempts,
      accepted: this.accepted,
      deduplicated: this.deduplicated,
      rejected: this.rejected,
      gapsDetected: this.gapsDetected,
      correctionsApplied: this.correctionsApplied,
      states,
    };
  }

  private countBarGap(bar: Bar): number {
    const key = [bar.instrumentId, bar.timeframe, bar.source].join('|');
    const previousClose = this.latestBarCloseByKey.get(key);
    this.latestBarCloseByKey.set(key, bar.closeTime);
    if (!previousClose || bar.openTime.getTime() <= previousClose.getTime()) return 0;

    const gapCount = (this.gapsByInstrument.get(bar.instrumentId) ?? 0) + 1;
    this.gapsByInstrument.set(bar.instrumentId, gapCount);
    return 1;
  }
}

function result(
  decision: IngestionDecision,
  event: LiveMarketEvent,
  persistedBars: number,
  correctionsApplied: number,
  gapsDetected: number,
  reason?: IngestionEventResult['reason'],
): IngestionEventResult {
  return {
    decision,
    eventId: event.eventId,
    persistedBars,
    correctionsApplied,
    gapsDetected,
    ...(reason ? { reason } : {}),
  };
}

function isBar(payload: LiveMarketEvent['payload']): payload is Bar {
  return 'timeframe' in payload && 'openTime' in payload && 'closeTime' in payload;
}

function delayUntilRetry(retryAt: Date, signal: AbortSignal): Promise<void> {
  const delayMs = retryAt.getTime() - Date.now();
  if (delayMs <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
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
