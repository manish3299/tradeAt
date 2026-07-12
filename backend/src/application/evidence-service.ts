import type {
  CollapsedEvidenceGroup,
  EvidenceCollapseResult,
  EvidenceContribution,
  EvidenceGroup,
} from '../domain/evidence.js';

export class EvidenceService {
  collapse(contributions: readonly EvidenceContribution[]): EvidenceCollapseResult {
    const groups = new Map<EvidenceGroup, EvidenceContribution[]>();
    for (const contribution of contributions) {
      const current = groups.get(contribution.group) ?? [];
      current.push(contribution);
      groups.set(contribution.group, current);
    }

    const collapsed: CollapsedEvidenceGroup[] = [];
    const warnings: string[] = [];
    for (const [group, groupContributions] of groups.entries()) {
      const representative = selectRepresentative(groupContributions);
      const suppressed = groupContributions
        .filter((candidate) => candidate.id !== representative.id)
        .map((candidate) => candidate.id);
      if (suppressed.length > 0) {
        warnings.push(
          `Collapsed correlated ${group} evidence: kept ${representative.id}, suppressed ${suppressed.join(', ')}.`,
        );
      }
      collapsed.push({
        group,
        representativeId: representative.id,
        strength: clamp(representative.strength),
        weight: representative.weight,
        contributors: groupContributions.map((candidate) => candidate.id),
        suppressedCorrelatedIds: suppressed,
      });
    }

    return {
      groups: collapsed.sort((left, right) => left.group.localeCompare(right.group)),
      score: round(collapsed.reduce((sum, group) => sum + group.strength * group.weight, 0)),
      warnings,
    };
  }
}

function selectRepresentative(
  contributions: readonly EvidenceContribution[],
): EvidenceContribution {
  return [...contributions].sort((left, right) => {
    const strengthDelta = Math.abs(right.strength) - Math.abs(left.strength);
    if (strengthDelta !== 0) return strengthDelta;
    return left.id.localeCompare(right.id);
  })[0]!;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
