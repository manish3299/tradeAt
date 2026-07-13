import type { DecisionEvaluationRequest, DecisionOrchestrator } from './decision-orchestrator.js';
import type { DecisionGatePolicy } from '../domain/decisions.js';
import type {
  BacktestStrategy,
  BacktestStrategyContext,
  ReplayDecision,
} from '../domain/replay.js';

export type DecisionReplayCandidate = Readonly<{
  setup: DecisionEvaluationRequest['setup'];
  riskTarget: DecisionEvaluationRequest['riskTarget'];
  confidence: DecisionEvaluationRequest['confidence'];
  policy?: DecisionGatePolicy;
  session: string;
  regime: string;
}>;

export type DecisionReplayCandidateFactory = (
  context: BacktestStrategyContext,
) => Promise<DecisionReplayCandidate> | DecisionReplayCandidate;

export class DecisionReplayStrategy implements BacktestStrategy {
  constructor(
    private readonly evaluator: Pick<DecisionOrchestrator, 'evaluate'>,
    private readonly instrumentId: string,
    private readonly timeframe: DecisionEvaluationRequest['timeframe'],
    private readonly candidates: DecisionReplayCandidateFactory,
  ) {}

  async evaluate(context: BacktestStrategyContext): Promise<ReplayDecision> {
    const candidate = await this.candidates(context);
    const decision = await this.evaluator.evaluate({
      instrumentId: this.instrumentId,
      timeframe: this.timeframe,
      asOf: context.asOf,
      setup: candidate.setup,
      riskTarget: candidate.riskTarget,
      confidence: candidate.confidence,
      ...(candidate.policy ? { policy: candidate.policy } : {}),
    });
    return {
      decision,
      setupId: candidate.setup.id,
      session: candidate.session,
      regime: candidate.regime,
    };
  }
}
