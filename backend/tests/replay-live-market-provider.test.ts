import { describe, expect, it } from 'vitest';
import type { LiveMarketEvent } from '../src/domain/market.js';
import { ReplayLiveMarketProvider } from '../src/infrastructure/market/replay-live-market-provider.js';

const receivedAt = new Date('2026-07-12T04:00:01.000Z');

describe('ReplayLiveMarketProvider', () => {
  it('replays subscribed events in observed-time order', async () => {
    const provider = new ReplayLiveMarketProvider('fixture-replay', [
      event('late', 'nse-nifty50', '2026-07-12T04:05:00.000Z'),
      event('other-instrument', 'nse-banknifty', '2026-07-12T04:00:00.000Z'),
      event('early', 'nse-nifty50', '2026-07-12T04:00:00.000Z'),
    ]);
    const controller = new AbortController();
    const eventIds: string[] = [];
    const states: string[] = [];

    await provider.connect(
      {
        instrumentIds: ['nse-nifty50'],
        onEvent: (candidate) => {
          eventIds.push(candidate.eventId);
        },
        onState: (state) => {
          states.push(state.status);
        },
      },
      controller.signal,
    );

    expect(eventIds).toEqual(['early', 'late']);
    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
  });

  it('stops replay when the subscription aborts', async () => {
    const provider = new ReplayLiveMarketProvider('fixture-replay', [
      event('first', 'nse-nifty50', '2026-07-12T04:00:00.000Z'),
      event('second', 'nse-nifty50', '2026-07-12T04:05:00.000Z'),
    ]);
    const controller = new AbortController();
    const eventIds: string[] = [];

    await provider.connect(
      {
        instrumentIds: ['nse-nifty50'],
        onEvent: (candidate) => {
          eventIds.push(candidate.eventId);
          controller.abort('done');
        },
        onState: () => undefined,
      },
      controller.signal,
    );

    expect(eventIds).toEqual(['first']);
  });
});

function event(eventId: string, instrumentId: string, observedAtIso: string): LiveMarketEvent {
  const observedAt = new Date(observedAtIso);
  return {
    eventId,
    type: 'tick',
    instrumentId,
    observedAt,
    receivedAt,
    source: 'fixture-replay',
    payload: {
      instrumentId,
      kind: 'trade',
      observedAt,
      receivedAt,
      source: 'fixture-replay',
      sequence: eventId,
      price: 24600,
      size: 1,
    },
  };
}
