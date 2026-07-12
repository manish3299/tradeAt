import { createHash } from 'node:crypto';
import { DecisionGateService, scoreEvidence, selectPolicyTarget } from './decision-gate-service.js';
import type { DecisionGateInput, PublishedDecision } from '../domain/decisions.js';

const DECISION_VERSION = '1.0.0';

export class DecisionService {
  constructor(private readonly gates = new DecisionGateService()) {}

  decide(input: DecisionGateInput): PublishedDecision {
    const gateEvaluation = this.gates.evaluate(input);
    const direction = gateEvaluation.status === 'pass' ? input.setup.direction : 'abstain';
    const policyTarget = selectPolicyTarget(input.riskTarget, input.policy);
    const reasons = [
      ...gateEvaluation.gates.flatMap((gate) => gate.reasons),
      ...gateEvaluation.vetoes.map((veto) => veto.message),
    ];

    return {
      id: decisionId(input),
      version: DECISION_VERSION,
      instrumentId: input.instrumentId,
      timeframe: input.timeframe,
      evaluatedAt: input.evaluatedAt,
      direction,
      score: scoreEvidence(input.evidence, input.policy),
      confidence: input.confidence.value,
      ...(direction !== 'abstain'
        ? {
            entryZone: {
              low: input.riskTarget.entryZoneLow,
              high: input.riskTarget.entryZoneHigh,
            },
            stop: input.riskTarget.stop,
            targets: policyTarget ? [policyTarget] : [],
            riskR: input.riskTarget.riskR,
            rewardToRisk: policyTarget?.rewardToRisk ?? input.riskTarget.rewardToRisk,
          }
        : { targets: [] }),
      vetoes: gateEvaluation.vetoes,
      reasons,
      gates: gateEvaluation.gates,
      policyVersion: input.policy.version,
      policyHash: policyHash(input.policy),
    };
  }
}

function decisionId(input: DecisionGateInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        instrumentId: input.instrumentId,
        timeframe: input.timeframe,
        evaluatedAt: input.evaluatedAt.toISOString(),
        policyVersion: input.policy.version,
        policyHash: policyHash(input.policy),
        setupId: input.setup.id,
        score: scoreEvidence(input.evidence, input.policy),
      }),
    )
    .digest('hex')
    .slice(0, 24);
}

function policyHash(policy: DecisionGateInput['policy']): string {
  return createHash('sha256').update(JSON.stringify(policy)).digest('hex');
}
