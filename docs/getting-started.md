# Getting Started

> Quick orientation for adopting teams. This is the high-level walkthrough; the formal architectural contract is at [`architecture.md`](architecture.md).

## What you're building against

The Fano Classifier is exposed as a single HTTP endpoint:

```
POST https://fano-engine-afmurhqkaq-ts.a.run.app/ingest/trial_balance
Authentication: X-API-Key header
Content-Type: application/json
```

You submit a trial balance (entity structure + list of line items each carrying a foundational classification). Fano returns your operator-submitted values echoed back for audit, plus the cascade's independent reading + a firewall verdict (`fano_status`) with a string reason (`quarantine_reason`) on non-accepted rows.

## The mental model in three sentences

1. **You submit what you know.** Your bookkeeper or upstream classifier already assigned `(predicted_code, source_topology, entity_structure)` based on the source CoA. Submit that as-is.
2. **Fano gives you a second opinion.** The cascade independently reads the line and returns its own `predicted_code` + `confidence` + `cascade_topology`. Your original submission is preserved at `operator_hint_*` fields for audit.
3. **The firewall verdict comes back as `fano_status` + `quarantine_reason`.** Three enum values distinguish the branches: `accepted_fact` (write straight through), `draft_fact` (route to operator review), or `quarantine` (Prolog subprocess timeout — substrate-health issue, not a rule violation). See §"When Fano flags or rejects a row" below for the four wire branches.

## Minimal example

```http
POST /ingest/trial_balance HTTP/1.1
Host: fano-engine-afmurhqkaq-ts.a.run.app
X-API-Key: <your-key>
Content-Type: application/json

{
  "entity_structure": "company",
  "lines": [
    {
      "description": "Trading Revenue",
      "predicted_code": "sbrm_4100",
      "source_topology": "revenue",
      "confidence": 0.95,
      "amount": 1000.00
    },
    {
      "description": "Probe Sentinel Balancing Line (NOT SCORED)",
      "predicted_code": "sbrm_1137",
      "source_topology": "current_assets",
      "confidence": 0.99,
      "amount": -1000.00
    }
  ]
}
```

Expected response shape (full schema at [`response-schema.md`](response-schema.md)):

```json
{
  "status": "success",
  "equilibrium_valid": true,
  "results": [
    {
      "description": "Trading Revenue",
      "predicted_code": "sbrm_4100",
      "confidence": 0.95,
      "cascade_topology": "revenue",
      "model_architecture": "iter11.B_R3_entity_prefixed_single_classifier_with_platt_scaling",
      "operator_hint_predicted_code": "sbrm_4100",
      "operator_hint_source_topology": "revenue",
      "operator_hint_confidence": 0.95,
      "fano_status": "accepted_fact",
      "quarantine_reason": null
    },
    { ... sentinel row ... }
  ]
}
```

Note: `predicted_code` in the response is the **cascade's** reading (may or may not match what you submitted). Your submitted value is echoed at `operator_hint_predicted_code`. On this example both agree; that's the common case.

Note the equilibrium constraint: `abs(sum(line.amount)) <= 0.01`. Single-line probes need a balancing sentinel; the η.1 TypeScript SDK wraps this automatically.

## When Fano flags or rejects a row

Fano's per-row response falls into one of four wire branches, distinguished by `fano_status` + `quarantine_reason` string content. See `docs/architecture.md` §2 for the full construction-site details with wire line numbers; the operational summary is:

**`fano_status: "accepted_fact"` + `quarantine_reason: null`** — cascade classified AND L3 firewall passed. Row can write straight through to GL. No operator review needed.

**`fano_status: "draft_fact"` + `quarantine_reason: "Sub-floor model confidence (0.XX)"`** — the cascade's confidence fell below the sub-floor threshold. Fires *before* the L3 firewall runs. Cascade couldn't validate the row with sufficient confidence; route to operator for hand-classification.

**`fano_status: "draft_fact"` + `quarantine_reason: "Entity/Topological Drift: Anchor=<topo>, Guess=<code>, Entity=<entity>"`** — the cascade classified but the L3 Prolog firewall rejected the row as structurally illegal under SBRM. This is where structural violations surface (topology mismatch / entity-conditional drift / etc.). Route to operator; investigate the drift between the operator submission and the cascade's alternate reading.

**`fano_status: "quarantine"` + `quarantine_reason: "Firewall Timeout Execution Lock"`** — ⚠ **naming trap.** This value fires ONLY when the Prolog subprocess doesn't return within 2 seconds. It is a substrate-health signal, NOT an SBRM-rule violation. A consumer coding `if row.fano_status == "quarantine"` expecting "L3 firewall rejected as structurally illegal" is reading it wrong — that verdict is `draft_fact` per the previous branch. Retry may succeed; persistent timeout on the same row is a defect worth reporting.

**Defensive predicate for routing:** `if row.fano_status != "accepted_fact"` is the honest way to say "this row needs operator review or triage." Sub-route by inspecting `quarantine_reason` string content.

### On historical warning kinds

Earlier kit versions (v0.1.0 through v0.1.4) documented five canonical warning kinds (`topology_disagreement`, `code_disagreement`, `code_consolidation`, `entity_conditional_drift`, `subfloor_abstention`) plus a rich structured `warnings[]` array. **None of that ships on the wire.** The design was made against a pre-Rev-27 cascade that produced per-layer disagreement signals; Rev 27 collapsed the cascade into a single ONNX inference; the warning payload was decommissioned as an unnoted side effect. See `docs/architecture.md` §6 for the historical note and `docs/response-schema.md` for the ratified schema.

Consumers coding against the historical warning kinds will find zero of them fire in production. The equivalent operator-review-queue signal is now expressed via `fano_status != "accepted_fact"` + `quarantine_reason` string content per the four branches above.

## The operator-review pattern

Adopting teams typically wrap Fano in a three-stage pipeline:

```
TB import → POST /ingest/trial_balance → Operator-review queue → GL write
                                              ↑                       ↑
                                  rows where                 approval signature
                                  fano_status != accepted_fact + provenance chain
```

Rows that come back as `fano_status: "accepted_fact"` can write through directly. Rows with `fano_status != "accepted_fact"` enter the queue. A human operator reviews, decides whether to accept the cascade's `predicted_code` or override with the operator-submitted `operator_hint_predicted_code`, and the approved row writes to GL with full provenance.

## Getting an API key

API keys are issued by LodgeiT Labs to onboarded adopting teams. Open an issue on this repo or contact [@futureWA](https://github.com/futureWA) to start the onboarding conversation.

## What ships next

| Release | Scope |
|---|---|
| **η.0** (this commit) | Repo + scaffolding + architecture reference |
| **η.1** | TypeScript SDK (`@lodgeit-labs/fano-classifier-client`) + type defs |
| **η.2** | Examples — real fixture inputs + canonical response samples + warning-handling patterns |
| **η.3** | Implementation methodology docs — operator-review-queue pattern, warning-handling, repair-journal |
| **η.4** | Daniyal-team briefing — one-page top-down spec for first-adopter team |

## Source canon

The Fano canonical architecture is maintained in [`futureWA/clawdog-brain`](https://github.com/futureWA/clawdog-brain) (private LodgeiT Labs internal canon). The decisions referenced in this kit trace back to:

- **PR #446** — Sprint design + two-layer responsibility model (PR α §0)
- **PR #451** — Verdict deep-dive (95.66% lenient conditional accuracy on operator-committed slice; per-L1 100% accuracy on canonical-segment domains)
- **PR #453** — Topology-disagreement reframe + rich warning-payload schema (PR ζ.0 mc08)
- **PR #454** — QA-corpus-bearing fixture re-mint (PR ζ.1 mc09; PII-filtered safe vocabulary)
