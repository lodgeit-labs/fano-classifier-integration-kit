# Response Schema Proposal — for OpenAPI codification

> **Status: PROPOSAL.** This document proposes a JSON Schema description of the
> `POST /ingest/trial_balance` response body, reconstructed from `docs/architecture.md` prose +
> `examples/canonical-fixtures/*.json` observed shapes. **It has not been ratified against the
> Fano-engine source of truth (`api/main.py`). It is presented for review, not adoption.**
>
> **Why this exists:** the live service's `/openapi.json` declares the request schema
> (`TrialBalancePayload` + `LineItem`) but declares the response as `schema: {}` — untyped. This
> means codegen tools (`openapi-python-client`, `openapi-typescript`, `NSwag`, `Kiota`) produce
> a client that submits typed requests but returns `dict[str, Any]` / `unknown` for responses.
> This is the largest single gap in the consumer contract and it materially degrades what
> adopting teams get from OpenAPI codegen.
>
> **What to do with this proposal:**
> 1. Andrew reviews the schema against `api/main.py` in the Fano-engine source repo.
> 2. Corrections applied where the proposal drifts from truth.
> 3. Ratified schema is merged into Fano-engine's OpenAPI generator (`app.include_router` or
>    per-endpoint `response_model=...`), so a future `curl /openapi.json` returns the typed
>    response.
> 4. Kit pulls a fresh OpenAPI snapshot; codegen improves for all consumers.
>
> **Non-goal:** this document is not the API contract. The prose in `docs/architecture.md` §5
> ("Response schema") and the observed fixtures in `examples/canonical-fixtures/` remain the
> authoritative surface until the ratified schema lands upstream.

## Sources reconstructed from

- `docs/architecture.md` §§ 0–5 (Layer 1a/1b operator-authoritative + cascade-advisory model;
  five warning kinds; rich warning payload schema).
- `examples/canonical-fixtures/01-bank-accounts-all-entities.json` — expected response shape
  for the accepted-fact path.
- `examples/canonical-fixtures/02-drawings-firewall-polarity.json` — expected shape when
  cascade disagrees with operator submission.
- `examples/canonical-fixtures/03-loans-to-beneficiaries-subfloor.json` — expected shape when
  subfloor abstention triggers.
- Live wire probes 2026-08-24 09:15 UTC against `fano-engine-79859053141.australia-southeast1.run.app`:
  - `POST /ingest/trial_balance` without `X-API-Key` → HTTP 403 `{"detail":"Not authenticated"}`.
  - `POST /ingest/trial_balance` with invalid `X-API-Key` → HTTP 403 `{"detail":"Forbidden: Invalid IAM/Edge Token"}`.
  - `POST /ingest/trial_balance` with malformed JSON (no auth header, does not require key
    to probe body-parse) → HTTP 422 with `{"detail":[{"type":"json_invalid",...}]}`.
- `src/types.ts` — the TypeScript types the kit's SDK already declares as its internal model.
- `src/adapter.ts` — the `LegacyResponseAdapter` — which reveals which fields the SDK
  reconstructs from server output vs which come through directly.

## Field-by-field proposal

### Top-level `TrialBalanceResponse`

```json
{
  "type": "object",
  "required": ["status", "equilibrium_valid", "results"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success"],
      "description": "Response envelope indicator. Currently only 'success' observed on 200 responses; error paths return non-200 with a different envelope."
    },
    "equilibrium_valid": {
      "type": "boolean",
      "description": "True iff sum(line.amount) <= 0.01 absolute — the equilibrium check documented in getting-started.md. Always true on a 200 response; a violation returns HTTP 400 before this field is populated."
    },
    "results": {
      "type": "array",
      "description": "Per-line-item cascade + firewall verdict, in submission order.",
      "items": { "$ref": "#/components/schemas/LineResult" }
    }
  }
}
```

### `LineResult`

Reconstructed from canonical fixture 01 (accepted_fact path) + 02 (warning path) + prose in
`docs/architecture.md` §5.

```json
{
  "type": "object",
  "required": [
    "description",
    "predicted_code",
    "confidence",
    "cascade_topology",
    "model_architecture",
    "operator_hint_predicted_code",
    "operator_hint_source_topology",
    "operator_hint_confidence",
    "fano_status",
    "quarantine_reason"
  ],
  "properties": {
    "description": {
      "type": "string",
      "description": "Echo of the submitted line item description."
    },
    "predicted_code": {
      "type": "string",
      "pattern": "^sbrm_\\d+$",
      "description": "The CASCADE'S reading of the line item (Layer 1b — advisory). NOT the operator's submitted code. On accepted_fact rows, this typically equals the operator's submission; on warning rows, this is the cascade's alternate hypothesis."
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Cascade's Platt-scaled confidence in `predicted_code`. Post-iter11.B this is calibrated via CalibratedClassifierCV with method='sigmoid'."
    },
    "cascade_topology": {
      "type": "string",
      "enum": ["current_assets", "non_current_assets", "current_liabilities", "non_current_liabilities", "equity", "revenue", "expenses"],
      "description": "The topology (macro-family) implied by `predicted_code`, resolved via `resolve_canonical_topology(predicted_code)` from the SBRM ontology."
    },
    "model_architecture": {
      "type": "string",
      "description": "Model architecture identifier. Currently 'iter11.B_R3_entity_prefixed_single_classifier_with_platt_scaling' (Rev 27 onwards). Consumer-visible so a run's evidence can be tied back to a specific architecture — critical for benchmark provenance."
    },
    "operator_hint_predicted_code": {
      "type": "string",
      "pattern": "^sbrm_\\d+$",
      "description": "Echo of the submitted `predicted_code` (Layer 1a — authoritative). This is byte-identical to what the consumer submitted."
    },
    "operator_hint_source_topology": {
      "type": "string",
      "enum": ["current_assets", "non_current_assets", "current_liabilities", "non_current_liabilities", "equity", "revenue", "expenses"],
      "description": "Echo of the submitted `source_topology` (Layer 1a — authoritative)."
    },
    "operator_hint_confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Echo of the submitted `confidence` (Layer 1a — authoritative)."
    },
    "fano_status": {
      "type": "string",
      "enum": ["accepted_fact", "draft_fact", "quarantine"],
      "description": "Firewall verdict. `accepted_fact` = cascade agrees with operator AND L3 Prolog firewall passes. `draft_fact` = at least one warning fired; row is legal but has a cascade-alternate-hypothesis and enters the operator-review queue. `quarantine` = L3 firewall rejected the row as structurally illegal under SBRM."
    },
    "quarantine_reason": {
      "type": ["string", "null"],
      "description": "Human-readable + SBRM rule ID describing the quarantine cause. NULL on non-quarantine rows. Populated only when `fano_status == 'quarantine'`."
    },
    "warnings": {
      "type": "array",
      "description": "Structured warning payloads. Empty array on accepted_fact rows. See `Warning` schema below.",
      "items": { "$ref": "#/components/schemas/Warning" }
    }
  }
}
```

### `Warning`

Reconstructed from `docs/architecture.md` §§ 2–4 (five canonical warning kinds + rich payload
schema) + fixture 02 (topology_disagreement path).

```json
{
  "type": "object",
  "required": ["kind", "severity", "cascade_alternate_hypothesis", "disagreement_reason", "suggested_repair_journal"],
  "properties": {
    "kind": {
      "type": "string",
      "enum": ["topology_disagreement", "code_disagreement", "code_consolidation", "entity_conditional_drift", "subfloor_abstention"],
      "description": "One of five canonical warning classes. Consumer switches on this to route to the operator-review UI."
    },
    "severity": {
      "type": "string",
      "enum": ["info", "warn", "halt"],
      "description": "'info' = advisory; 'warn' = surface to operator; 'halt' = do not write to GL until operator resolves."
    },
    "cascade_alternate_hypothesis": {
      "type": "object",
      "required": ["predicted_code", "cascade_topology", "confidence", "confidence_delta_vs_operator"],
      "properties": {
        "predicted_code": { "type": "string", "pattern": "^sbrm_\\d+$" },
        "cascade_topology": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
        "confidence_delta_vs_operator": {
          "type": "number",
          "description": "cascade.confidence - operator.confidence. Positive means cascade is MORE confident than operator; negative means less."
        }
      },
      "description": "The cascade's proposed alternate reading of the row."
    },
    "disagreement_reason": {
      "type": "object",
      "required": ["summary", "sbrm_rule_id"],
      "properties": {
        "summary": {
          "type": "string",
          "description": "Human-readable prose summary of why the cascade disagrees with the operator."
        },
        "sbrm_rule_id": {
          "type": "string",
          "description": "SBRM rule identifier if the disagreement is firewall-rooted (e.g. 'polarity_check_current_assets_L3'). Null if the disagreement is purely classifier-side."
        },
        "l1_signal": {
          "type": "object",
          "description": "Optional L1-router feature-attribution snapshot (post-iter11.B this reflects the entity-prefixed classifier's TF-IDF feature signal). Populated when disagreement is code/topology-shape; absent on purely-firewall-driven disagreements."
        },
        "l2_signal": {
          "type": "object",
          "description": "Optional L2-specialist feature-attribution snapshot. Present in legacy responses (pre-iter11.B). May be absent or vestigial on iter11.B responses — the L2 specialist tier was collapsed into the single classifier."
        }
      }
    },
    "suggested_repair_journal": {
      "type": "object",
      "required": ["narrative", "proposed_double_entry", "operator_action_required", "repair_class"],
      "properties": {
        "narrative": {
          "type": "string",
          "description": "Human-readable prose describing what the repair would accomplish."
        },
        "proposed_double_entry": {
          "type": "array",
          "description": "The debit/credit legs the operator could post to reclassify the row from the operator's original code to the cascade's alternate.",
          "items": {
            "type": "object",
            "properties": {
              "side": { "type": "string", "enum": ["debit", "credit"] },
              "code": { "type": "string", "pattern": "^sbrm_\\d+$" },
              "amount": { "type": "number" }
            }
          }
        },
        "operator_action_required": {
          "type": "boolean",
          "description": "True iff the row cannot proceed to GL write without operator resolution."
        },
        "repair_class": {
          "type": "string",
          "enum": ["reclassification", "topology_correction", "entity_conditional_fix", "subfloor_review"],
          "description": "Category of repair; drives UI routing on the operator side."
        }
      }
    }
  }
}
```

## Known uncertainties in the proposal

The following are areas where the reconstruction from prose + fixtures is under-determined and
needs the source-of-truth Fano-engine code to resolve:

1. **`model_architecture` field naming.** Fixture 01 uses `iter11.B_R3_entity_prefix` in one
   location and `iter11.B_R3_entity_prefixed_single_classifier_with_platt_scaling` in another.
   The proposal takes the longer form as canonical; the shorter may be an abbreviation used in
   different response paths. **Please confirm the exact wire value.**
2. **`warnings` field emission on accepted_fact rows.** Prose says "empty array on accepted_fact";
   fixture 01 omits the field entirely on the accepted_fact result. Proposal treats `warnings`
   as always-present (either `[]` or populated) to give consumers a stable field to switch on.
   **Please confirm whether the field is `[]` or omitted on the wire.**
3. **`l1_signal` / `l2_signal` post-iter11.B.** The prose in `docs/architecture.md` (pre-iter11.B)
   describes an L1 router + L2 specialist breakdown. Post-iter11.B the L1+L2 tiers collapsed
   into a single classifier. Whether the response still carries `l1_signal` / `l2_signal`
   sub-objects for backward compatibility, or emits a single `classifier_signal` object, or
   omits these fields entirely, is not visible in the checked-in fixtures. **Please confirm
   which shape the wire emits.**
4. **`quarantine_reason` structure.** Prose implies human-readable string + SBRM rule ID;
   proposal treats it as string with rule ID embedded. It may actually be a structured object.
   **Please confirm.**
5. **Error envelopes.** Non-200 responses (403 auth, 405 method, 422 validation) are FastAPI
   defaults returning `{"detail": ...}` where `detail` is either a string (403/405) or an
   array of validation-error objects (422). These are not proposed as part of the response
   schema — they are enforced by FastAPI's built-in error handlers and codegen tools handle
   them via the standard `HTTPValidationError` component the current OpenAPI already declares.

## Recommended next step

Andrew reads `api/main.py` alongside this document. For each field flagged above, either:
- Ratify the proposal as-is, or
- Provide the corrected shape, or
- Note that the field is emergent from Prolog output and needs a schema derivation script.

Once ratified, the ratified schema is added to Fano-engine's FastAPI endpoint declaration as a
`response_model=TrialBalanceResponse` argument, and the next Fano-engine deploy regenerates
`/openapi.json` with the typed response.

Kit-side follow-up (not in this PR): re-pull `openapi/fano-classifier.openapi.json` from the
freshly-deployed service. Consumer codegen automatically picks up the typed response. No further
kit-side action required.

## Provenance

- Authored: 2026-08-24 mc16 (ClawDog).
- Sources: `docs/architecture.md` (in this kit), `examples/canonical-fixtures/*.json` (in this
  kit), live wire probes 2026-08-24 09:15–09:20 UTC against production fano-engine.
- Status: PROPOSAL — not adopted. Ratification requires Andrew review against Fano-engine
  source.
- Cross-reference (Brain-side; private): `memory/2026-08-24-mc16-fano-consumer-trial-readiness.md` §ITEM 3.
