/**
 * Canonical type definitions for the Fano Classifier API.
 *
 * These types describe the **post-OT-#103 canonical schema** per the
 * Layer 1a/1b operator-authoritative reframe banked at PR ζ.0 (mc08).
 *
 * Cross-references (private LodgeiT Labs Brain canon):
 * - PR #446 mc01 — Sprint design + two-layer responsibility model
 * - PR #453 mc08 — Topology-disagreement reframe + rich warning-payload schema
 * - docs/architecture.md §4 + §5 in this kit
 *
 * **IMPORTANT**: production deployment of OT #103 (the schema change at
 * api/main.py:594-606) has not yet shipped. Current production responses
 * are cascade-authoritative (response.predicted_code = cascade's verdict,
 * not operator's submission). Use `LegacyResponseAdapter` from
 * `@lodgeit-labs/fano-classifier-client/adapter` to transform current
 * production responses into the canonical shape until OT #103 ships.
 */

// ============================================================================
// Enums
// ============================================================================

/** 5-class L1 domain (cascade router output). */
export type L1Domain = 'assets' | 'liabilities' | 'equity' | 'revenue' | 'expenses';

/** 7-class canonical topology (operator-submitted or cascade-derived). */
export type Topology =
  | 'current_assets'
  | 'non_current_assets'
  | 'current_liabilities'
  | 'non_current_liabilities'
  | 'equity'
  | 'revenue'
  | 'expenses';

/** Entity structure (operator-submitted per /ingest/trial_balance payload). */
export type EntityStructure =
  | 'company'
  | 'trust'
  | 'partnership'
  | 'sole_trader'
  | 'super_fund';

/** Fano firewall verdict per line item. */
export type FanoStatus = 'accepted_fact' | 'draft_fact' | 'quarantine';

/** Canonical warning kinds (5 per docs/architecture.md §3). */
export type WarningKind =
  | 'topology_disagreement'
  | 'code_disagreement'
  | 'code_consolidation'
  | 'entity_conditional_drift'
  | 'subfloor_abstention';

/** Severity classification per warning. */
export type WarningSeverity = 'info' | 'warn' | 'halt';

/** Suggested-fix classification. */
export type RepairClass =
  | 'reclassify_topology'
  | 'reclassify_code'
  | 'verify_coa_config'
  | 'no_action_needed';

// ============================================================================
// Request schema
// ============================================================================

/** SBRM code pattern: `sbrm_NNNN`. */
export type SbrmCode = `sbrm_${number}`;

/** A single line item in a trial-balance ingestion request. */
export interface LineItem {
  /** Operator-submitted description (account name as recorded). */
  description: string;
  /** Operator-submitted SBRM code (must match `^sbrm_\d+$`). */
  predicted_code: SbrmCode;
  /** Operator-submitted topology (from source CoA; structural wire-truth). */
  source_topology: Topology;
  /** Operator confidence in this classification (0.0 – 1.0). */
  confidence: number;
  /** Line item amount; positive or negative depending on Dr/Cr convention. */
  amount: number;
}

/** Trial-balance ingestion request payload. */
export interface TrialBalancePayload {
  entity_structure: EntityStructure;
  lines: LineItem[];
}

// ============================================================================
// Warning payload schema (per docs/architecture.md §4)
// ============================================================================

/** Cascade's alternate hypothesis for a line in disagreement. */
export interface CascadeAlternateHypothesis {
  predicted_code: SbrmCode;
  topology: Topology;
  /** Aggregate confidence = min(L1 confidence, L2 confidence). */
  aggregate_confidence: number;
  /** Signed delta: cascade aggregate confidence minus operator confidence. */
  confidence_delta: number;
}

/** Structured reasoning behind a disagreement warning. */
export interface DisagreementReason {
  /** Human-readable structured-prose summary. */
  summary: string;
  /** Prolog predicate name driving the disagreement (e.g. `evaluate_drift/3`). */
  sbrm_rule_id: string;
  /** L1 router signal. */
  l1_signal: {
    predicted_domain: L1Domain;
    confidence: number;
  };
  /** L2 specialist signal. */
  l2_signal: {
    predicted_code: SbrmCode;
    confidence: number;
  };
}

/** Proposed double-entry to repair a disagreement. */
export interface SuggestedRepairJournal {
  /** Human-readable explanation. */
  narrative: string;
  /** The proposed double-entry; debit.amount must equal credit.amount. */
  proposed_entry: {
    debit: { account: string; amount: number };
    credit: { account: string; amount: number };
  };
  /** Whether operator intervention is required before write. */
  operator_action_required: boolean;
  /** Class of repair action. */
  repair_class: RepairClass;
}

/** A single structured warning attached to a line item. */
export interface Warning {
  kind: WarningKind;
  severity: WarningSeverity;
  /** Human-readable one-line summary. */
  message: string;
  cascade_alternate_hypothesis: CascadeAlternateHypothesis;
  disagreement_reason: DisagreementReason;
  suggested_repair_journal: SuggestedRepairJournal;
}

// ============================================================================
// Response schema (canonical post-OT-#103 shape)
// ============================================================================

/** Cascade's independent reading (always populated; advisory). */
export interface CascadeReading {
  predicted_code: SbrmCode;
  topology: Topology;
  l1_confidence: number;
  l2_confidence: number;
  /** Aggregate confidence = min(l1_confidence, l2_confidence). */
  aggregate_confidence: number;
}

/**
 * Per-line response (canonical post-OT-#103 shape).
 *
 * **Layer 1a invariant**: `predicted_code`, `source_topology`, `confidence`
 * always reflect the operator's submission byte-for-byte.
 *
 * **Layer 1b invariant**: `cascade.*` is always populated with the cascade's
 * independent reading, regardless of agreement.
 *
 * **Warnings invariant**: `warnings` is empty if and only if the cascade
 * agrees with the operator on both code and topology AND the L3 firewall
 * accepted AND confidence is above the SR #4 sub-floor.
 */
export interface LineResponse {
  /** Echo of the operator-submitted description. */
  description: string;
  /** Operator-submitted code (Layer 1a wire-truth pass-through). */
  predicted_code: SbrmCode;
  /** Operator-submitted topology (Layer 1a wire-truth pass-through). */
  source_topology: Topology;
  /** Operator-submitted confidence (Layer 1a wire-truth pass-through). */
  confidence: number;
  /** Cascade's independent reading (Layer 1b advisory). */
  cascade: CascadeReading;
  /** Fano firewall verdict. */
  fano_status: FanoStatus;
  /** Quarantine reason (non-null when fano_status != 'accepted_fact'). */
  quarantine_reason: string | null;
  /** Structured warnings; empty when cascade fully agrees with operator. */
  warnings: Warning[];
}

/** Top-level response from POST /ingest/trial_balance. */
export interface TrialBalanceResponse {
  status: 'success';
  equilibrium_valid: boolean;
  results: LineResponse[];
}

// ============================================================================
// Legacy response schema (current production at api/main.py:594-606)
// ============================================================================

/**
 * Current-production response shape (pre-OT-#103).
 *
 * `predicted_code` is the CASCADE's verdict (not the operator's submission).
 * Operator hints are preserved separately as `operator_hint_*` fields.
 *
 * Use `LegacyResponseAdapter` to transform into canonical `LineResponse`.
 */
export interface LegacyLineResponse {
  description: string;
  /** CASCADE's predicted code (NOT operator's submission). */
  predicted_code: SbrmCode;
  /** Cascade aggregate confidence. */
  confidence: number;
  /** 5-class L1 router output. */
  l1_domain: L1Domain;
  /** 7-class canonical topology resolved from cascade code. */
  cascade_topology: Topology;
  cascade_l1_confidence: number;
  cascade_l2_confidence: number;
  /** Operator's original predicted_code (preserved for audit). */
  operator_hint_predicted_code: SbrmCode;
  /** Operator's original source_topology (preserved for audit). */
  operator_hint_source_topology: Topology;
  /** Operator's original confidence (preserved for audit). */
  operator_hint_confidence: number;
  fano_status: FanoStatus;
  quarantine_reason: string | null;
}

/** Legacy top-level response shape. */
export interface LegacyTrialBalanceResponse {
  status: 'success';
  equilibrium_valid: boolean;
  results: LegacyLineResponse[];
}
