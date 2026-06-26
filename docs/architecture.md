# Fano Classifier — Architecture Reference

> Canonical architectural reference for adopting teams. This document is **the contract** between Fano and any consumer (LodgeiT-monolith / Coracle / third-party agents / human developers).

## §-1 Production architecture note (iter11.B Rev 27; 2026-06-25 onwards)

> **This document still describes the architectural model behind the operator-authoritative response semantic (L1 router → L2 specialist → L3 firewall as the conceptual cascade).** That model is unchanged at the response-contract layer — your consumer code reads `fano_status`, `predicted_code`, `cascade_topology`, `quarantine_reason` exactly as documented below.
>
> **What changed at the wire on 2026-06-25:** the L1+L2 cascade is now collapsed into a single entity-prefixed neural classifier with Platt-calibrated confidence. The L3 Prolog firewall is unchanged. The response shape your SDK consumes is unchanged. The behaviour you observe is unchanged.
>
> Specifically: `predicted_code` still comes from the cascade's reading; `cascade_topology` is now resolved by `resolve_canonical_topology(predicted_code)` from the single classifier output (instead of being routed by an L1 macro-family router); `confidence` is the iter11.B Platt-scaled output; the L3 firewall's `evaluate_drift` query still fires per-row over `(predicted_code, expected_topology, entity_structure)`.
>
> The `LegacyResponseAdapter` in `src/adapter.ts` continues to apply correctly.
>
> If you want the wire-truth verification: `examples/canonical-fixtures/` contains three real fixtures from the 2026-06-25 production mini-Gauntlet. Run them through your client and you should get the documented response shape.
>
> Cross-references (private LodgeiT Labs Brain canon): `memory/fano-iterations.md` §10 iter11.B Phase 4c GREEN closure; `memory/2026-06-25.md` mc12; Lesson #64 PROMOTED.

## §0 Two-layer responsibility model

Fano operates inside a two-layer responsibility model:

- **Layer 1 — Ingest & Firewall (Fano's universe).** Verifies that the foundational `(predicted_code, source_topology, entity_structure)` tuple submitted at `/ingest/trial_balance` is structurally legal under SBRM. Stateless. Sign-blind by design (amount is not an argument to the firewall predicate).
- **Layer 2 — Report Run Time (consumer's universe).** When the consumer's report engine compiles formal financials, it dynamically maps negative-balance asset rows into presentation-side liability sectors for IFRS / FRS-105 / GAAP-display purposes. Fano never sees this transformation.

Fano is a row-level firewall over a static `(code, topology, entity)` tuple; presentation logic lives in the consumer.

## §1 Layer 1 sub-structure

Layer 1 itself refines into two architecturally-distinct sub-layers:

### Layer 1a — Operator wire-truth (AUTHORITATIVE)

The tuple submitted at `/ingest/trial_balance` represents the **source chart-of-accounts' structural declaration** about this line item. This is wire-truth from QBO / Xero / MYOB / etc. — what the bookkeeper recorded against the operator's structurally-constrained CoA.

**Fano accepts Layer 1a as authoritative.** The response's `predicted_code`, `source_topology`, `confidence` fields echo what the operator submitted, byte-for-byte.

### Layer 1b — Cascade independent reading (ADVISORY)

Fano's L1 router + L2 specialist + L3 firewall produce an **independent reading** of what the cascade thinks the same line item should be classified as. This is advisory — Fano is **never allowed to silently mutate Layer 1a fields in the response**.

The cascade's reading ships in `response.cascade.*` audit fields (always populated; downstream consumers can inspect them) and in `response.warnings[].cascade_alternate_hypothesis` (populated only when 1a ≠ 1b).

## §2 The disagreement axis

When 1a == 1b (the dominant case): response confirms the operator's classification; `warnings: []` empty list.

When 1a ≠ 1b (the disagreement case): Fano emits **structured warnings** carrying:

- The cascade's alternate hypothesis (code + topology + confidence + confidence_delta against operator)
- The disagreement reason (structured prose summary + SBRM rule ID + L1 / L2 signal breakdown)
- A suggested repair-journal (narrative + proposed double-entry + operator_action_required flag + repair_class enum)

The consumer (or downstream operator-review UI) decides whether to honour the warning or confirm the original classification.

## §3 Five canonical warning kinds

| kind | severity | when emitted |
|---|---|---|
| `topology_disagreement` | warn | Operator submitted topology X; cascade's L1 router predicts topology Y where X ≠ Y |
| `code_disagreement` | info | Operator submitted code A; cascade's L2 specialist predicts code B where A ≠ B but topology matches |
| `code_consolidation` | info | Cascade's L2 collapses operator's distinct code to a more general SBRM leaf |
| `entity_conditional_drift` | halt | L3 firewall rejects on entity-conditional rule (e.g. `sbrm_1122 Beneficiaries` under `entity_structure=company`) |
| `subfloor_abstention` | warn | Cascade aggregate confidence below the SR #4 0.50 floor; operator hint stands but cascade can't validate |

`severity` semantics:

- **`info`** — informational; cascade thinks differently but the operator's classification is structurally legal under SBRM (no action required from operator)
- **`warn`** — meaningful disagreement; operator should review
- **`halt`** — structural drift; the operator's submission cannot be written to GL without resolution

## §4 Warning payload schema

```yaml
Warning:
  kind: "topology_disagreement" | "code_disagreement" | "code_consolidation" | "entity_conditional_drift" | "subfloor_abstention"
  severity: "info" | "warn" | "halt"
  message: <human-readable one-line summary>
  cascade_alternate_hypothesis:
    predicted_code: <sbrm_NNNN>
    topology: <7-class topology>
    aggregate_confidence: <0.0-1.0>
    confidence_delta: <signed float; cascade conf minus operator conf>
  disagreement_reason:
    summary: <string; structured prose explanation>
    sbrm_rule_id: <Prolog predicate name; e.g. "evaluate_drift/3">
    l1_signal:
      predicted_domain: <5-class L1 output>
      confidence: <0.0-1.0>
    l2_signal:
      predicted_code: <sbrm_NNNN>
      confidence: <0.0-1.0>
  suggested_repair_journal:
    narrative: <string; human-readable explanation of the proposed repair>
    proposed_entry:
      debit:
        account: <string; account name or sbrm_NNNN>
        amount: <decimal>
      credit:
        account: <string>
        amount: <decimal>
    operator_action_required: <bool>
    repair_class: "reclassify_topology" | "reclassify_code" | "verify_coa_config" | "no_action_needed"
```

## §5 Top-level response shape (preview; finalised at η.1)

```yaml
response_per_line:
  description: <string>
  # Authoritative wire-truth (operator-submitted) — UNCHANGED PASS-THROUGH:
  predicted_code: <sbrm_NNNN; OPERATOR's submission>
  source_topology: <7-class topology; OPERATOR's submission>
  confidence: <operator confidence; OPERATOR's submission>
  # Cascade reading (advisory; preserved for audit + warning derivation):
  cascade:
    predicted_code: <sbrm_NNNN; cascade L2 verdict>
    topology: <7-class topology; cascade L1+L2 verdict>
    l1_confidence: <0.0-1.0>
    l2_confidence: <0.0-1.0>
    aggregate_confidence: <min(l1, l2)>
  # Fano firewall verdict:
  fano_status: "accepted_fact" | "draft_fact" | "quarantine"
  quarantine_reason: <string | null>
  # NEW (per OT #103 rich warning-payload scope):
  warnings: List[Warning]
```

## §6 Layer interaction guarantees

1. **`response.predicted_code` is ALWAYS the operator's submission**, regardless of what the cascade thinks. Downstream consumers reading this field get wire-truth pass-through.
2. **`response.cascade.predicted_code` is ALWAYS populated** with the cascade's independent reading, regardless of whether it agrees with the operator. This is the audit surface.
3. **`response.warnings` is empty if and only if** the cascade agrees with the operator on both code and topology AND the L3 firewall accepted AND confidence is above the SR #4 sub-floor.
4. **Backwards-incompatible note for downstream developers:** if you're upgrading from a pre-η.0 Fano integration, the semantics of `response.predicted_code` have changed. Previously it returned the cascade's verdict; now it returns the operator's submission. The cascade's verdict moved to `response.cascade.predicted_code`. See [`docs/getting-started.md`](getting-started.md) for the migration path.

## §7 Equilibrium constraint

The `/ingest/trial_balance` endpoint enforces:

```
abs(sum(line.amount for line in payload.lines)) <= 0.01
```

For single-line probes (testing a single classification), this means you MUST include a balancing sentinel line. Recommended pattern:

```yaml
lines:
  - description: "<row under test>"
    predicted_code: <code>
    source_topology: <topology>
    confidence: <conf>
    amount: <amount>
  - description: "Probe Sentinel Balancing Line (NOT SCORED)"
    predicted_code: <contra code>
    source_topology: <contra topology>
    confidence: 0.99
    amount: <-amount>
```

The TypeScript SDK (η.1) wraps this pattern automatically.

## §8 Production substrate (for the curious)

- Cloud Run service: `fano-engine` in `clawdog-ml-engine` (Australia-Southeast1)
- Bare production URL: `https://fano-engine-afmurhqkaq-ts.a.run.app`
- L1 router: ONNX (sklearn LogReg-on-TFIDF + entity OHE + Pair_Context side-aware feature)
- L2 specialist: ONNX per L1 domain (5 specialists)
- L3 firewall: SWI-Prolog `evaluate_drift/3` predicate on SBRM physics
- Authentication: `X-API-Key` header

Production access is subject to API-key issuance by LodgeiT Labs. Contact [@futureWA](https://github.com/futureWA) for adopter onboarding.

---

*Cross-references in canonical Brain canon (private; for LodgeiT internal teams): PR α §0 mc01 + PR ε mc06 + PR ζ.0 mc08 + PR ζ.1 mc09.*
