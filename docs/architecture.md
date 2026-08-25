# Fano Classifier — Architecture Reference

> Canonical architectural reference for adopting teams. This document is **the contract** between Fano and any consumer (LodgeiT-monolith / Coracle / third-party agents / human developers).
>
> **Ratified against `~/fano_engine/api/main.py`** sha256 `8d07ab84302e4c3f98dc7bfbd9c4ecaf32158741e2cbe7a50a19ee31fda6edc6` (648 lines; **Rev 27 iter11.B Phase 4a Path α**) on 2026-08-24 mc16 + 2026-08-25 mc17.

## §0 What Fano is

Fano is a **stateless SBRM classification firewall** — an admission gate over an upstream classification, not a classifier itself. Concretely:

1. **Your upstream classification is authoritative for audit.** The `(predicted_code, source_topology, confidence)` tuple you submit is echoed back byte-for-byte in the response's `operator_hint_*` fields. Fano never mutates your input.
2. **Fano produces an independent cascade reading.** A single entity-prefixed neural classifier with Platt-calibrated confidence produces a `(predicted_code, confidence)` tuple; the cascade's canonical 7-class topology is resolved from that code via the SBRM ancestor graph.
3. **An L3 Prolog firewall decides whether the row is structurally legal.** The firewall queries `evaluate_drift(predicted_code, cascade_topology, entity_structure)` against `sbrm_physics.pl` + `sbrm_sentinels.pl` and returns pass/fail.
4. **The verdict comes back as `fano_status` + `quarantine_reason`.** Three enum values on `fano_status` distinguish the branches; a string reason accompanies non-accepted rows.

The **five canonical warning kinds** documented in kit versions v0.1.0 through v0.1.4 (`topology_disagreement` / `code_disagreement` / `code_consolidation` / `entity_conditional_drift` / `subfloor_abstention`) **do not fire on the wire.** They were designed against a pre-Rev-27 L1+L2 cascade architecture that produced per-layer disagreement signals; Rev 27 collapsed the cascade into a single ONNX inference and the signal sources ceased to exist. This is documented in the private Brain canon under `memory/rev27-warning-loss-decision-record.md` with a review trigger for if per-layer signals ever return. Until then, the response contract is the four-branch structure documented in §2 below.

## §1 Two-layer responsibility model

Fano operates inside a two-layer responsibility model that is unchanged from pre-Rev-27:

- **Layer 1 — Ingest & Firewall (Fano's universe).** Verifies that the foundational `(predicted_code, source_topology, entity_structure)` tuple submitted at `/ingest/trial_balance` is structurally legal under SBRM. Stateless. Sign-blind by design (amount is not an argument to the firewall predicate).
- **Layer 2 — Report Run Time (consumer's universe).** When the consumer's report engine compiles formal financials, it dynamically maps negative-balance asset rows into presentation-side liability sectors for IFRS / FRS-105 / GAAP-display purposes. Fano never sees this transformation.

Fano is a row-level firewall over a static `(code, topology, entity)` tuple; presentation logic lives in the consumer.

## §2 Response construction — four branches

Every submitted `line` produces exactly one `LineResult` entry in `results[]`. That entry is constructed by one of four branches in `api/main.py`, differentiated by `fano_status` + `quarantine_reason`:

### Branch 1 — Sub-floor abstention (`fano_status: "draft_fact"`)

**Fires when** cascade confidence falls below the SR #4 threshold (nominal 0.50 Platt-scaled).

**Wire construction:** `api/main.py` lines 585–590.

**Fires BEFORE the L3 Prolog firewall query runs.** The `continue` statement at line 590 skips the firewall entirely for sub-floor rows.

**`quarantine_reason` shape:** `"Sub-floor model confidence (0.XX)"` where `0.XX` is the actual confidence.

**Consumer signal:** cascade lacked confidence. Route to operator; classify by hand.

### Branch 2 — L3 firewall PASS (`fano_status: "accepted_fact"`)

**Fires when** cascade confidence is above the SR #4 sub-floor AND `swipl evaluate_drift(...)` returns exit code 0 (structural rule satisfied).

**Wire construction:** `api/main.py` lines 622–626.

**`quarantine_reason` shape:** `null`.

**Consumer signal:** row cleared. Write straight through to GL with no operator review.

### Branch 3 — L3 firewall FAIL (`fano_status: "draft_fact"`)

**Fires when** cascade confidence is above sub-floor BUT `swipl evaluate_drift(...)` returns non-zero exit code (structural rule violated under SBRM).

**Wire construction:** `api/main.py` lines 628–635.

**`quarantine_reason` shape:** `"Entity/Topological Drift: Anchor=<cascade_topology>, Guess=<predicted_code>, Entity=<entity_structure>"`.

**Consumer signal:** L3 firewall rejected as structurally illegal. Route to operator; investigate the drift between the operator-submitted classification and the cascade's alternate reading. This is where the historical `topology_disagreement` / `entity_conditional_drift` conceptual categories collapse into a single string-reasoned branch. If a future iteration reintroduces per-layer signals the branch may sub-split into structured kinds again.

### Branch 4 — L3 firewall TIMEOUT (`fano_status: "quarantine"`)

**Fires when** the Prolog subprocess doesn't return within 2 seconds (`subprocess.TimeoutExpired`).

**Wire construction:** `api/main.py` lines 638–643.

**`quarantine_reason` shape:** `"Firewall Timeout Execution Lock"`.

**Consumer signal:** substrate-health issue — the Prolog engine hung or query complexity exceeded the timeout budget. NOT an SBRM-rule violation. Retry may succeed; persistent timeout on the same row is a defect worth reporting.

**⚠ Naming trap:** the value `"quarantine"` fires ONLY on this timeout branch. Consumers coding `if row.fano_status == "quarantine"` expecting "L3 firewall rejected as structurally illegal" are reading it wrong — that verdict is `draft_fact` per Branch 3 above. A future breaking-change server revision may rename to `firewall_timeout` or similar; until then, code defensively: `if row.fano_status != "accepted_fact"` is the honest predicate for "this row needs operator review or triage."

## §3 Non-response error paths

Two structured HTTP 502 error paths fire at classification time, **before** response construction. These short-circuit the whole request and do NOT appear as `results[]` entries:

- **`RuntimeError` on classification** (line 553): iter11.B ONNX bundle isn't loadable. HTTP 502 `{"detail": "iter11.B model bundle missing: ..."}`.
- **`ValueError` / `FileNotFoundError` on topology resolution** (line 559): classified code can't be resolved to a canonical topology, OR the ONNX file is missing. HTTP 502 `{"detail": "Cascade substrate inconsistency: ..."}`.

Both are substrate-health signals. Persistent 502 on repeated identical input is a defect to report to LodgeiT Labs.

Additionally, **Pydantic validation errors return HTTP 422** with the FastAPI-default error envelope. See §5 "Logging discipline" for the framing-vs-implementation caveat.

## §4 Response schema

See `docs/response-schema.md` for the complete field-by-field ratified schema with wire line-number citations.

Summary of `LineResult` fields (10 always present):

| Field | Type | Source |
|---|---|---|
| `description` | string | echo of `line.description` |
| `predicted_code` | `^sbrm_\d+$` | **cascade output** (not the operator's submission) |
| `confidence` | number 0.0–1.0 | cascade Platt-scaled |
| `cascade_topology` | 7-class enum | resolved from `predicted_code` |
| `model_architecture` | string literal | `"iter11.B_R3_entity_prefixed_single_classifier_with_platt_scaling"` |
| `operator_hint_predicted_code` | string | echo of your submitted `predicted_code` |
| `operator_hint_source_topology` | string | echo of your submitted `source_topology` |
| `operator_hint_confidence` | number | echo of your submitted `confidence` |
| `fano_status` | enum | `accepted_fact` / `draft_fact` / `quarantine` — see §2 for branch semantics |
| `quarantine_reason` | string or `null` | four known string shapes per §2 |

**Note on `predicted_code` semantics:** it is the CASCADE's reading, not your operator submission. Your original code is preserved at `operator_hint_predicted_code`. This is the same shape as prior kit versions documented; the field naming is unchanged from v0.1.4.

## §5 Logging discipline (framework-caveat)

The kit's SR #2 disposition (from mc16 wire-forensic 2026-08-24) is:

- ✅ **Application-layer logging: CLEAN.** No `logger.*(payload|lines|request|body)` calls; no `print()` statements touching request contents. Verified by grep of `api/main.py` at wire truth.
- ⚠ **Framework-level exception handlers: NOT independently verified.** FastAPI's default exception handler (Starlette's `ExceptionMiddleware`) can surface request-body fragments in a 500 stack trace on unhandled exceptions. The wire-truth grep covered `api/main.py` but did not cover Starlette middleware or FastAPI's built-in exception handling.
- ⚠ **Pydantic 422 validation errors DO echo request-body content** in the response body (default FastAPI behaviour). The `input` field of each validation-error detail contains the offending value. If sensitive strings can end up in `line.description` and you submit malformed payloads, that content lands in the 422 response AND in the Cloud Run request-response log.

**Practical guidance:** Cloud Run request logging captures request path + method + status + latency + IP + timestamp by default (not body content). Pydantic 422 error responses may contain body fragments. Malformed input from a consumer client — including exploratory probes — should be assumed to leave request-body content in logs unless the consumer defends against it client-side.

## §6 Warning payload — historical note + review trigger

Earlier kit versions (v0.1.0 through v0.1.4) documented five canonical warning kinds plus a rich structured `warnings[]` array with `cascade_alternate_hypothesis` / `disagreement_reason` / `suggested_repair_journal`. **None of that ships on the wire.**

The design was made against a pre-Rev-27 cascade (L1 ONNX router → L2 ONNX specialist → L3 Prolog firewall) that produced per-layer disagreement signals. Rev 27 Phase 4a Path α (2026-06-25) collapsed L1+L2 into a single entity-prefixed ONNX inference; the per-layer signal sources ceased to exist; the warning payload was decommissioned as an unnoted side effect of the substrate simplification.

**Historical context is preserved in the private Brain canon** at `memory/rev27-warning-loss-decision-record.md` — a dated decision record with a review trigger that fires if per-layer disagreement signals ever return to the wire (via a future multi-tier iteration, per-layer softmax capture, or explicit re-embedding). At that point structured warnings become architecturally possible again and this document will be revised.

**Consumers coding against the historical warning kinds will find zero of them fire.** The equivalent operator-review-queue signal is now expressed via `fano_status != "accepted_fact"` + `quarantine_reason` string content per §2.

## §7 Equilibrium constraint

The `/ingest/trial_balance` endpoint enforces:

```
abs(sum(line.amount for line in payload.lines)) <= 0.01
```

For single-line probes (testing a single classification), you MUST include a balancing sentinel line. Recommended pattern:

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

- Cloud Run service: `fano-engine` in `clawdog-ml-engine` project (Australia-Southeast1)
- Production URL: `https://fano-engine-afmurhqkaq-ts.a.run.app`
- Classifier: single entity-prefixed neural classifier (iter11.B R3; ONNX; `CalibratedClassifierCV` Platt-scaled)
- L3 firewall: SWI-Prolog `evaluate_drift/3` predicate on SBRM physics (`sbrm_physics.pl` + `sbrm_sentinels.pl` per Q-mc02.A2 mc02-2026-06-25 sentinel-override discipline)
- Authentication: `X-API-Key` header (Google IAM/Edge layer; see `docs/pre-flight-canary.md` §2 for error signatures)

Production access is subject to API-key issuance by LodgeiT Labs. Contact [@futureWA](https://github.com/futureWA) for adopter onboarding.

---

*Cross-references in canonical Brain canon (private; for LodgeiT internal teams): `memory/rev27-warning-loss-decision-record.md` (the Rev 27 warning-payload decommissioning decision record); `memory/2026-08-24-mc16-fano-response-schema-delta-report.md` (turn-01 ratification); `memory/2026-08-25-mc17-fano-response-schema-delta-amendment-turn-02.md` (turn-02 branch-coverage amendment).*
