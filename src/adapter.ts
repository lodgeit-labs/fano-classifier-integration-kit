/**
 * Legacy response adapter.
 *
 * Transforms current-production response shape (cascade-authoritative;
 * `predicted_code = cascade verdict`) into the canonical post-OT-#103
 * shape (operator-authoritative; `predicted_code = operator's submission`).
 *
 * This adapter is **transitional**. Once OT #103 deploys at
 * api/main.py:594-606, current-production responses will arrive in
 * canonical shape natively and this adapter becomes a no-op forward path.
 * Recommended migration sequence for adopters:
 *
 * 1. Today: instantiate `FanoClient` with default `schemaVersion: 'legacy'`
 *    — adapter applied transparently; consumer reads canonical types
 * 2. Post-OT-#103 deploy: switch to `schemaVersion: 'canonical'` to skip
 *    the adapter overhead
 *
 * **Warning derivation**: the adapter reconstructs structured warnings
 * from legacy fields by comparing `predicted_code` (cascade) vs
 * `operator_hint_predicted_code` (operator) and `cascade_topology` vs
 * `operator_hint_source_topology`. Note that legacy responses lack the
 * rich warning payload's `disagreement_reason.l1_signal` / `l2_signal`
 * breakdown and full `suggested_repair_journal` semantics — adapter
 * synthesises sensible defaults but the full surface lands only with
 * native OT #103 deployment.
 */

import type {
  LegacyLineResponse,
  LegacyTrialBalanceResponse,
  LineResponse,
  TrialBalanceResponse,
  Warning,
  WarningKind,
  WarningSeverity,
  RepairClass,
} from './types.js';

/** Threshold below which the cascade is considered to have abstained (per SR #4). */
export const SUBFLOOR_CONFIDENCE = 0.5;

/**
 * Adapt a single legacy line response into the canonical shape.
 *
 * @param legacy The legacy response per-line as returned by production today
 */
export function adaptLegacyLineResponse(legacy: LegacyLineResponse): LineResponse {
  const cascadeAggregate = Math.min(
    legacy.cascade_l1_confidence,
    legacy.cascade_l2_confidence,
  );

  const warnings = deriveWarnings(legacy, cascadeAggregate);

  return {
    description: legacy.description,
    // Layer 1a pass-through: operator's submission becomes top-level
    predicted_code: legacy.operator_hint_predicted_code,
    source_topology: legacy.operator_hint_source_topology,
    confidence: legacy.operator_hint_confidence,
    // Layer 1b advisory: cascade's reading
    cascade: {
      predicted_code: legacy.predicted_code,
      topology: legacy.cascade_topology,
      l1_confidence: legacy.cascade_l1_confidence,
      l2_confidence: legacy.cascade_l2_confidence,
      aggregate_confidence: cascadeAggregate,
    },
    fano_status: legacy.fano_status,
    quarantine_reason: legacy.quarantine_reason,
    warnings,
  };
}

/**
 * Adapt a full legacy response into the canonical shape.
 */
export function adaptLegacyResponse(
  legacy: LegacyTrialBalanceResponse,
): TrialBalanceResponse {
  return {
    status: legacy.status,
    equilibrium_valid: legacy.equilibrium_valid,
    results: legacy.results.map(adaptLegacyLineResponse),
  };
}

// ============================================================================
// Warning derivation from legacy fields
// ============================================================================

function deriveWarnings(
  legacy: LegacyLineResponse,
  cascadeAggregate: number,
): Warning[] {
  const warnings: Warning[] = [];

  // Sub-floor abstention warning
  if (cascadeAggregate < SUBFLOOR_CONFIDENCE) {
    warnings.push(buildSubfloorWarning(legacy, cascadeAggregate));
  }

  // Entity-conditional drift (L3 firewall reject)
  if (
    legacy.fano_status === 'draft_fact' &&
    legacy.quarantine_reason !== null &&
    legacy.quarantine_reason.includes('Entity/Topological Drift')
  ) {
    warnings.push(buildEntityDriftWarning(legacy, cascadeAggregate));
  }

  // Topology disagreement
  const topologyDisagrees =
    legacy.cascade_topology !== legacy.operator_hint_source_topology;
  if (topologyDisagrees) {
    warnings.push(buildTopologyDisagreementWarning(legacy, cascadeAggregate));
  }

  // Code disagreement (same topology, different code)
  const codeDisagrees =
    legacy.predicted_code !== legacy.operator_hint_predicted_code;
  if (codeDisagrees && !topologyDisagrees) {
    warnings.push(buildCodeDisagreementWarning(legacy, cascadeAggregate));
  }

  return warnings;
}

function buildSubfloorWarning(
  legacy: LegacyLineResponse,
  cascadeAggregate: number,
): Warning {
  return {
    kind: 'subfloor_abstention',
    severity: 'warn',
    message: `Cascade confidence ${cascadeAggregate.toFixed(2)} is below the SR #4 sub-floor of ${SUBFLOOR_CONFIDENCE.toFixed(2)}; operator hint stands but cascade cannot validate.`,
    cascade_alternate_hypothesis: {
      predicted_code: legacy.predicted_code,
      topology: legacy.cascade_topology,
      aggregate_confidence: cascadeAggregate,
      confidence_delta: cascadeAggregate - legacy.operator_hint_confidence,
    },
    disagreement_reason: {
      summary: 'Cascade aggregate confidence is below the SR #4 sub-floor (0.50). The operator hint stands by default; this row enters the operator-review queue for manual classification.',
      sbrm_rule_id: 'confidence_floor/1',
      l1_signal: {
        predicted_domain: l1DomainFromTopology(legacy.cascade_topology),
        confidence: legacy.cascade_l1_confidence,
      },
      l2_signal: {
        predicted_code: legacy.predicted_code,
        confidence: legacy.cascade_l2_confidence,
      },
    },
    suggested_repair_journal: noActionNeededJournal(legacy),
  };
}

function buildTopologyDisagreementWarning(
  legacy: LegacyLineResponse,
  cascadeAggregate: number,
): Warning {
  return {
    kind: 'topology_disagreement',
    severity: 'warn',
    message: `Cascade routes this line to ${legacy.cascade_topology} (${legacy.predicted_code}); operator submitted under ${legacy.operator_hint_source_topology} (${legacy.operator_hint_predicted_code}).`,
    cascade_alternate_hypothesis: {
      predicted_code: legacy.predicted_code,
      topology: legacy.cascade_topology,
      aggregate_confidence: cascadeAggregate,
      confidence_delta: cascadeAggregate - legacy.operator_hint_confidence,
    },
    disagreement_reason: {
      summary: `L2 specialist routes this code to ${legacy.cascade_topology}; operator's submission under ${legacy.operator_hint_source_topology} is structurally legal at L3 firewall but contradicts L1 routing.`,
      sbrm_rule_id: 'evaluate_drift/3',
      l1_signal: {
        predicted_domain: legacy.l1_domain,
        confidence: legacy.cascade_l1_confidence,
      },
      l2_signal: {
        predicted_code: legacy.predicted_code,
        confidence: legacy.cascade_l2_confidence,
      },
    },
    suggested_repair_journal: {
      narrative: `If operator confirms cascade is right, reclassify by reversing the original placement under ${legacy.operator_hint_source_topology} and re-booking under ${legacy.cascade_topology}.`,
      proposed_entry: {
        // Synthesised default: legacy doesn't carry per-line amount;
        // adapter consumers should override amount from the request payload
        // when surfacing to operator review.
        debit: { account: legacy.operator_hint_predicted_code, amount: 0 },
        credit: { account: legacy.predicted_code, amount: 0 },
      },
      operator_action_required: true,
      repair_class: 'reclassify_topology',
    },
  };
}

function buildCodeDisagreementWarning(
  legacy: LegacyLineResponse,
  cascadeAggregate: number,
): Warning {
  return {
    kind: 'code_disagreement',
    severity: 'info',
    message: `Cascade prefers code ${legacy.predicted_code}; operator submitted ${legacy.operator_hint_predicted_code} (same topology ${legacy.cascade_topology}).`,
    cascade_alternate_hypothesis: {
      predicted_code: legacy.predicted_code,
      topology: legacy.cascade_topology,
      aggregate_confidence: cascadeAggregate,
      confidence_delta: cascadeAggregate - legacy.operator_hint_confidence,
    },
    disagreement_reason: {
      summary: `L2 specialist picks a different SBRM leaf within the same ${legacy.cascade_topology} domain. Both codes are structurally legal; fine-grained classification difference.`,
      sbrm_rule_id: 'evaluate_drift/3',
      l1_signal: {
        predicted_domain: legacy.l1_domain,
        confidence: legacy.cascade_l1_confidence,
      },
      l2_signal: {
        predicted_code: legacy.predicted_code,
        confidence: legacy.cascade_l2_confidence,
      },
    },
    suggested_repair_journal: {
      narrative: `Optional re-code from ${legacy.operator_hint_predicted_code} to ${legacy.predicted_code} within ${legacy.cascade_topology}. No topology change required.`,
      proposed_entry: {
        debit: { account: legacy.operator_hint_predicted_code, amount: 0 },
        credit: { account: legacy.predicted_code, amount: 0 },
      },
      operator_action_required: false,
      repair_class: 'reclassify_code' as RepairClass,
    },
  };
}

function buildEntityDriftWarning(
  legacy: LegacyLineResponse,
  cascadeAggregate: number,
): Warning {
  return {
    kind: 'entity_conditional_drift',
    severity: 'halt',
    message: `L3 firewall rejected: ${legacy.quarantine_reason ?? '(no detail)'}`,
    cascade_alternate_hypothesis: {
      predicted_code: legacy.predicted_code,
      topology: legacy.cascade_topology,
      aggregate_confidence: cascadeAggregate,
      confidence_delta: cascadeAggregate - legacy.operator_hint_confidence,
    },
    disagreement_reason: {
      summary: 'L3 Prolog firewall rejected the (code, topology, entity_structure) tuple on an entity-conditional rule. The code is restricted to specific entity types.',
      sbrm_rule_id: 'evaluate_drift/3',
      l1_signal: {
        predicted_domain: legacy.l1_domain,
        confidence: legacy.cascade_l1_confidence,
      },
      l2_signal: {
        predicted_code: legacy.predicted_code,
        confidence: legacy.cascade_l2_confidence,
      },
    },
    suggested_repair_journal: {
      narrative: 'Either reassign the entity_structure to one compatible with this code, OR recode to an entity-agnostic alternative within the same topology. Senior accountant review required.',
      proposed_entry: {
        debit: { account: legacy.operator_hint_predicted_code, amount: 0 },
        credit: { account: legacy.predicted_code, amount: 0 },
      },
      operator_action_required: true,
      repair_class: 'verify_coa_config' as RepairClass,
    },
  };
}

function noActionNeededJournal(legacy: LegacyLineResponse) {
  return {
    narrative: 'Cascade abstained but operator hint stands. No journal-entry repair required; row enters operator-review queue for manual classification.',
    proposed_entry: {
      debit: { account: legacy.operator_hint_predicted_code, amount: 0 },
      credit: { account: legacy.operator_hint_predicted_code, amount: 0 },
    },
    operator_action_required: true,
    repair_class: 'no_action_needed' as RepairClass,
  };
}

/** Best-effort mapping from 7-class topology back to 5-class L1 domain. */
function l1DomainFromTopology(
  topology: LegacyLineResponse['cascade_topology'],
): Warning['disagreement_reason']['l1_signal']['predicted_domain'] {
  switch (topology) {
    case 'current_assets':
    case 'non_current_assets':
      return 'assets';
    case 'current_liabilities':
    case 'non_current_liabilities':
      return 'liabilities';
    case 'equity':
      return 'equity';
    case 'revenue':
      return 'revenue';
    case 'expenses':
      return 'expenses';
  }
}

// Suppress unused-import warning for WarningKind / WarningSeverity (they're
// re-exported types used externally; kept here to anchor the import surface).
export type { WarningKind, WarningSeverity };
