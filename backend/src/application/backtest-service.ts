import { replayIdentityHash } from './replay-controller.js';
import type { Bar } from '../domain/market.js';
import type {
  BacktestBaseline,
  BacktestRequest,
  BacktestResult,
  ExecutionAssumptions,
  ReplayDecision,
  ReplayResultStore,
  ReplayTradeOutcome,
  WalkForwardWindow,
} from '../domain/replay.js';

export class BacktestService {
  constructor(private readonly results?: ReplayResultStore) {}

  async run(request: BacktestRequest): Promise<BacktestResult> {
    validateRequest(request);
    const bars = chronologicalBars(request.bars).filter(
      (bar) =>
        availableAt(bar) >= request.identity.start && availableAt(bar) <= request.identity.end,
    );
    const windows = createWalkForwardWindows(
      bars,
      request.walkForward.trainingBars,
      request.walkForward.evaluationBars,
    );
    const decisions: ReplayDecision[] = [];
    const outcomes: ReplayTradeOutcome[] = [];

    for (const window of windows) {
      for (const current of window.evaluationBars) {
        const currentIndex = bars.indexOf(current);
        const asOf = availableAt(current);
        const knownBars = latestKnownBars(
          bars
            .slice(0, currentIndex + 1)
            .filter((bar) => bar.closeTime <= asOf && bar.receivedAt <= asOf),
        );
        if (knownBars.length < request.warmupBars) continue;
        const replayDecision = await request.strategy.evaluate({
          asOf,
          bars: Object.freeze([...knownBars]),
          windowIndex: window.index,
        });
        assertPointInTime(replayDecision, asOf);
        decisions.push(replayDecision);
        const futureBars = bars.slice(currentIndex + 1);
        const outcome = simulateOutcome(replayDecision, futureBars, request.execution);
        if (outcome) outcomes.push(outcome);
      }
    }

    const result: BacktestResult = {
      identityHash: replayIdentityHash(request.identity),
      decisions,
      outcomes,
      windows,
      baselines: baselinesFor(bars),
      execution: request.execution,
    };
    await this.results?.save(result);
    return result;
  }
}

export function createWalkForwardWindows(
  bars: readonly Bar[],
  trainingSize: number,
  evaluationSize: number,
): readonly WalkForwardWindow[] {
  if (trainingSize < 1 || evaluationSize < 1) {
    throw new Error('Walk-forward training and evaluation sizes must be positive.');
  }
  const windows: WalkForwardWindow[] = [];
  for (let start = trainingSize; start < bars.length; start += evaluationSize) {
    const evaluationBars = bars.slice(start, Math.min(start + evaluationSize, bars.length));
    if (evaluationBars.length === 0) break;
    windows.push({
      index: windows.length,
      trainingBars: bars.slice(Math.max(0, start - trainingSize), start),
      evaluationBars,
    });
  }
  return windows;
}

export function simulateOutcome(
  replayDecision: ReplayDecision,
  futureBars: readonly Bar[],
  execution: ExecutionAssumptions,
): ReplayTradeOutcome | undefined {
  const { decision } = replayDecision;
  if (
    decision.direction === 'abstain' ||
    !decision.entryZone ||
    decision.stop === undefined ||
    !decision.targets[0] ||
    futureBars.length === 0
  ) {
    return undefined;
  }
  const direction = decision.direction;
  const target = decision.targets[0].price;
  const entryBar = futureBars.find(
    (bar) => bar.low <= decision.entryZone!.high && bar.high >= decision.entryZone!.low,
  );
  if (!entryBar) return undefined;
  const entryIndex = futureBars.indexOf(entryBar);
  const tradableBars = futureBars.slice(entryIndex);
  const conservativeEntry = direction === 'long' ? decision.entryZone.high : decision.entryZone.low;
  const quotedFill =
    entryBar.open >= decision.entryZone.low && entryBar.open <= decision.entryZone.high
      ? entryBar.open
      : conservativeEntry;
  const filledEntryPrice = adversePrice(quotedFill, direction, 'entry', execution);
  const filledInitialRisk = Math.abs(filledEntryPrice - decision.stop);
  if (filledInitialRisk <= 0) return undefined;
  let exitBar = tradableBars.at(-1)!;
  let quotedExit = exitBar.close;
  let exitReason: ReplayTradeOutcome['exitReason'] = 'end_of_data';
  let targetHit = false;
  let worstExcursion = 0;
  let bestExcursion = 0;
  let barsHeld = 0;

  for (const bar of tradableBars) {
    barsHeld += 1;
    const adverse = direction === 'long' ? filledEntryPrice - bar.low : bar.high - filledEntryPrice;
    const favorable =
      direction === 'long' ? bar.high - filledEntryPrice : filledEntryPrice - bar.low;
    worstExcursion = Math.max(worstExcursion, adverse);
    bestExcursion = Math.max(bestExcursion, favorable);
    const stopHit = direction === 'long' ? bar.low <= decision.stop : bar.high >= decision.stop;
    const targetReached = direction === 'long' ? bar.high >= target : bar.low <= target;
    if (stopHit || targetReached) {
      exitBar = bar;
      if (stopHit) {
        quotedExit = stopFillPrice(bar, decision.stop, direction);
        exitReason = 'stop';
      } else {
        quotedExit = target;
        exitReason = 'target';
        targetHit = true;
      }
      break;
    }
  }

  const exitPrice = adversePrice(quotedExit, direction, 'exit', execution);
  const grossPnl =
    direction === 'long' ? exitPrice - filledEntryPrice : filledEntryPrice - exitPrice;
  const costs = (filledEntryPrice + exitPrice) * (execution.feeBpsPerSide / 10_000);
  const netPnl = grossPnl - costs;
  return {
    decisionId: decision.id,
    instrumentId: decision.instrumentId,
    timeframe: decision.timeframe,
    direction,
    setupId: replayDecision.setupId,
    session: replayDecision.session,
    regime: replayDecision.regime,
    confidence: decision.confidence,
    openedAt: entryBar.openTime,
    closedAt: exitBar.closeTime,
    entryPrice: filledEntryPrice,
    exitPrice,
    initialRisk: filledInitialRisk,
    grossPnl,
    costs,
    netPnl,
    returnR: netPnl / filledInitialRisk,
    maeR: worstExcursion / filledInitialRisk,
    mfeR: bestExcursion / filledInitialRisk,
    targetHit,
    exitReason,
    barsHeld,
    executionVersion: execution.version,
  };
}

function adversePrice(
  price: number,
  direction: 'long' | 'short',
  side: 'entry' | 'exit',
  execution: ExecutionAssumptions,
): number {
  const totalBps = execution.spreadBps / 2 + execution.slippageBpsPerSide;
  const adverseSign =
    (direction === 'long' && side === 'entry') || (direction === 'short' && side === 'exit')
      ? 1
      : -1;
  return price * (1 + (adverseSign * totalBps) / 10_000);
}

function baselinesFor(bars: readonly Bar[]): readonly BacktestBaseline[] {
  const first = bars[0];
  const last = bars.at(-1);
  const buyAndHold = first && last ? (last.close - first.open) / first.open : 0;
  return [
    { name: 'buy_and_hold', netReturn: buyAndHold, coverage: bars.length > 0 ? 1 : 0 },
    { name: 'always_abstain', netReturn: 0, coverage: 0 },
  ];
}

function chronologicalBars(bars: readonly Bar[]): readonly Bar[] {
  return [...bars].sort((left, right) => {
    const time = availableAt(left).getTime() - availableAt(right).getTime();
    if (time !== 0) return time;
    const observed = left.closeTime.getTime() - right.closeTime.getTime();
    if (observed !== 0) return observed;
    const instrument = left.instrumentId.localeCompare(right.instrumentId);
    return instrument !== 0 ? instrument : left.revision - right.revision;
  });
}

function latestKnownBars(bars: readonly Bar[]): readonly Bar[] {
  const latest = new Map<string, Bar>();
  for (const bar of bars) {
    const key = [bar.instrumentId, bar.timeframe, bar.openTime.toISOString(), bar.source].join('|');
    const current = latest.get(key);
    if (!current || bar.revision > current.revision) latest.set(key, bar);
  }
  return [...latest.values()].sort(
    (left, right) => left.closeTime.getTime() - right.closeTime.getTime(),
  );
}

function availableAt(bar: Bar): Date {
  return bar.receivedAt > bar.closeTime ? bar.receivedAt : bar.closeTime;
}

function stopFillPrice(bar: Bar, stop: number, direction: 'long' | 'short'): number {
  if (direction === 'long' && bar.open < stop) return bar.open;
  if (direction === 'short' && bar.open > stop) return bar.open;
  return stop;
}

function assertPointInTime(replayDecision: ReplayDecision, asOf: Date): void {
  if (replayDecision.decision.evaluatedAt.getTime() !== asOf.getTime()) {
    throw new Error('Backtest strategy returned a decision outside the current replay time.');
  }
}

function validateRequest(request: BacktestRequest): void {
  if (request.minimumSamples < 1 || request.warmupBars < 1) {
    throw new Error('Backtest warm-up and minimum samples must be positive.');
  }
  const execution = request.execution;
  if (execution.feeBpsPerSide < 0 || execution.spreadBps < 0 || execution.slippageBpsPerSide < 0) {
    throw new Error('Execution costs cannot be negative.');
  }
  if (execution.intrabarFillPolicy !== 'stop_first') {
    throw new Error('Only the conservative stop-first intrabar policy is supported.');
  }
}
