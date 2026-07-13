import { createHash } from 'node:crypto';
import type {
  ReplayCheckpoint,
  ReplayEvent,
  ReplayIdentity,
  ReplayState,
} from '../domain/replay.js';

export class ReplayClock {
  private value: Date;

  constructor(initialTime: Date) {
    this.value = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.value);
  }

  advanceTo(nextTime: Date): void {
    if (nextTime < this.value) throw new Error('Replay clock cannot move backwards.');
    this.value = new Date(nextTime);
  }

  restore(time: Date): void {
    this.value = new Date(time);
  }
}

export class ReplayController<T> {
  private readonly orderedEvents: readonly ReplayEvent<T>[];
  private readonly identityHashValue: string;
  private cursor = 0;
  private status: ReplayState['status'] = 'ready';
  private speed = 1;

  constructor(
    private readonly identity: ReplayIdentity,
    events: readonly ReplayEvent<T>[],
    private readonly clock = new ReplayClock(identity.start),
  ) {
    validateIdentity(identity);
    this.identityHashValue = replayIdentityHash(identity);
    this.orderedEvents = [...events]
      .filter((event) => event.observedAt >= identity.start && event.observedAt <= identity.end)
      .sort(compareEvents);
  }

  identityHash(): string {
    return this.identityHashValue;
  }

  state(): ReplayState {
    return {
      status: this.status,
      cursor: this.cursor,
      eventCount: this.orderedEvents.length,
      replayTime: this.clock.now(),
      speed: this.speed,
    };
  }

  start(): void {
    if (this.status !== 'completed') this.status = 'running';
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('Replay speed must be positive.');
    this.speed = speed;
  }

  step(): ReplayEvent<T> | undefined {
    const event = this.orderedEvents[this.cursor];
    if (!event) {
      this.status = 'completed';
      return undefined;
    }
    this.clock.advanceTo(event.observedAt);
    this.cursor += 1;
    if (this.cursor === this.orderedEvents.length) this.status = 'completed';
    else if (this.status === 'ready') this.status = 'paused';
    return event;
  }

  peek(): ReplayEvent<T> | undefined {
    const event = this.orderedEvents[this.cursor];
    if (!event || event.observedAt > this.clock.now()) return undefined;
    return event;
  }

  checkpoint(): ReplayCheckpoint {
    return {
      identityHash: this.identityHashValue,
      cursor: this.cursor,
      replayTime: this.clock.now(),
    };
  }

  restore(checkpoint: ReplayCheckpoint): void {
    if (checkpoint.identityHash !== this.identityHashValue) {
      throw new Error('Replay checkpoint is incompatible with the pinned identity.');
    }
    if (checkpoint.cursor < 0 || checkpoint.cursor > this.orderedEvents.length) {
      throw new Error('Replay checkpoint cursor is invalid.');
    }
    this.cursor = checkpoint.cursor;
    this.clock.restore(checkpoint.replayTime);
    this.status = this.cursor === this.orderedEvents.length ? 'completed' : 'paused';
  }

  seek(target: Date): readonly ReplayEvent<T>[] {
    if (target < this.identity.start || target > this.identity.end) {
      throw new Error('Replay seek target is outside the pinned range.');
    }
    this.cursor = 0;
    this.clock.restore(this.identity.start);
    const replayed: ReplayEvent<T>[] = [];
    while (this.cursor < this.orderedEvents.length) {
      const next = this.orderedEvents[this.cursor];
      if (!next || next.observedAt > target) break;
      const event = this.step();
      if (event) replayed.push(event);
    }
    this.clock.advanceTo(target);
    this.status = this.cursor === this.orderedEvents.length ? 'completed' : 'paused';
    return replayed;
  }
}

export function replayIdentityHash(identity: ReplayIdentity): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        ...identity,
        start: identity.start.toISOString(),
        end: identity.end.toISOString(),
        configurationVersions: orderedRecord(identity.configurationVersions),
        pluginVersions: orderedRecord(identity.pluginVersions),
      }),
    )
    .digest('hex');
}

function compareEvents<T>(left: ReplayEvent<T>, right: ReplayEvent<T>): number {
  const observed = left.observedAt.getTime() - right.observedAt.getTime();
  if (observed !== 0) return observed;
  const received = left.receivedAt.getTime() - right.receivedAt.getTime();
  return received !== 0 ? received : left.id.localeCompare(right.id);
}

function orderedRecord(record: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function validateIdentity(identity: ReplayIdentity): void {
  if (identity.end < identity.start) throw new Error('Replay end must not precede start.');
  if (!identity.datasetHash || !identity.codeRevision) {
    throw new Error('Replay dataset and code revision must be pinned.');
  }
}
