import { describe, expect, it } from 'vitest';
import {
  ReplayClock,
  ReplayController,
  replayIdentityHash,
} from '../src/application/replay-controller.js';
import type { ReplayEvent, ReplayIdentity } from '../src/domain/replay.js';

describe('ReplayController', () => {
  it('orders events deterministically and never exposes a future event', () => {
    const clock = new ReplayClock(at('00:00'));
    const controller = new ReplayController(identity(), events(), clock);

    expect(controller.peek()).toBeUndefined();
    expect(controller.step()?.id).toBe('a');
    expect(clock.now()).toEqual(at('00:01'));
    expect(controller.step()?.id).toBe('b');
    expect(controller.step()?.id).toBe('c');
    expect(controller.state().status).toBe('completed');
  });

  it('restores compatible checkpoints and rejects identity drift', () => {
    const first = new ReplayController(identity(), events());
    first.step();
    const checkpoint = first.checkpoint();
    first.step();
    first.restore(checkpoint);
    expect(first.state().cursor).toBe(1);
    expect(first.step()?.id).toBe('b');

    const changedIdentity = { ...identity(), datasetHash: 'other-dataset' };
    const second = new ReplayController(changedIdentity, events());
    expect(() => second.restore(checkpoint)).toThrow(/incompatible/);
  });

  it('seeks by replaying only through the requested time', () => {
    const controller = new ReplayController(identity(), events());
    expect(controller.seek(at('00:01')).map((event) => event.id)).toEqual(['a', 'b', 'c']);
    expect(controller.state().replayTime).toEqual(at('00:01'));
    expect(controller.state().cursor).toBe(3);
  });

  it('hashes version maps independently of insertion order', () => {
    const left = identity();
    const right = {
      ...identity(),
      configurationVersions: { risk: '2', decision: '1' },
    };
    expect(replayIdentityHash(left)).toBe(replayIdentityHash(right));
  });
});

function identity(): ReplayIdentity {
  return {
    datasetHash: 'fixture-dataset',
    start: at('00:00'),
    end: at('00:10'),
    eventOrderPolicy: 'observed_received_id',
    configurationVersions: { decision: '1', risk: '2' },
    pluginVersions: { regimes: '1' },
    codeRevision: 'abc123',
    randomSeed: 42,
  };
}

function events(): readonly ReplayEvent<string>[] {
  return [
    { id: 'c', observedAt: at('00:01'), receivedAt: at('00:01'), payload: 'third' },
    { id: 'a', observedAt: at('00:01'), receivedAt: at('00:00'), payload: 'first' },
    { id: 'b', observedAt: at('00:01'), receivedAt: at('00:01'), payload: 'second' },
  ];
}

function at(time: string): Date {
  return new Date(`2026-07-01T${time}:00.000Z`);
}
