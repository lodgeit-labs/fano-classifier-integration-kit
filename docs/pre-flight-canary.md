# Pre-Flight Canary

> **What this doc solves:** Fano-engine has no `/health` or `/livez` endpoint. Every path
> except `POST /ingest/trial_balance` and `GET /openapi.json` returns HTTP 404. This means
> when your first `curl` fails, you cannot easily tell whether you hit (a) a dead service,
> (b) the wrong service, (c) an auth problem, (d) a schema problem, or (e) a valid
> Fano-side rejection. All five currently look identical from the client's point of view.
>
> This document gives you a **three-step canary** to disambiguate all five failure modes with
> zero deploys and one API key. Run it before your first real trial submission.

## Step 1 — Confirm you are talking to Fano-engine (no key required)

Send a deliberately malformed body to `POST /ingest/trial_balance`. This lets you observe the
service's response shape WITHOUT needing an API key, because Fano-engine parses the body
before enforcing auth on the malformed path (via FastAPI's Pydantic validator ordering).

```bash
curl -sS -X POST \
  'https://fano-engine-79859053141.australia-southeast1.run.app/ingest/trial_balance' \
  -H 'Content-Type: application/json' \
  -d 'not json' \
  -w '\nHTTP=%{http_code}\n'
```

**Expected response (WIRE-VERIFIED 2026-08-24):**

```
{"detail":[{"type":"json_invalid","loc":["body",0],"msg":"JSON decode error","input":{},"ctx":{"error":"Expecting value"}}]}
HTTP=422
```

**What each observation tells you:**

| You see | Diagnosis |
|---|---|
| HTTP 422 + `{"detail":[{"type":"json_invalid",...}]}` | ✅ You hit Fano-engine. Move to Step 2. |
| HTTP 422 + `{"detail":[{"type":"missing","loc":["body","entries"],...}]}` | ⚠️ You hit the STALE service `fano-classifier-...` — not fano-engine. Your URL is wrong. Fix the URL to `fano-engine-79859053141.australia-southeast1.run.app` and re-run Step 1. |
| HTTP 403 + `{"detail":"Not authenticated"}` | ⚠️ You hit fano-engine but auth intercepted before body parse (rare — depends on auth ordering). Move to Step 2. |
| Connection error (DNS / TLS / TCP refused) | 🔴 The service is unreachable from your network. Check your DNS resolution, corporate proxy, and whether the URL is typed exactly. Do NOT proceed until Step 1 resolves. |
| HTTP 5xx | 🔴 Service is up but failing. Contact `@futureWA` before proceeding. |
| HTTP 200 with body content | 🔴 Very unexpected — either the URL points somewhere non-Fano OR service behaviour has changed. Contact `@futureWA`. |

Do not skip this step. It's a 2-second call and it tells you whether the wire is alive
before you spend an hour debugging an auth issue that was actually a URL typo.

## Step 2 — Confirm your API key is issued and correctly headered

Send the same malformed body but WITH your API key. This exercises the auth path.

```bash
curl -sS -X POST \
  'https://fano-engine-79859053141.australia-southeast1.run.app/ingest/trial_balance' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: '"$FANO_API_KEY"'' \
  -d 'not json' \
  -w '\nHTTP=%{http_code}\n'
```

**Expected response with a valid key:**

Same as Step 1 (HTTP 422 with `json_invalid`) — a valid key passes auth and the body-parse
error surfaces normally.

**Expected response with an INVALID key (WIRE-VERIFIED 2026-08-24):**

```
{"detail":"Forbidden: Invalid IAM/Edge Token"}
HTTP=403
```

**What each observation tells you:**

| You see | Diagnosis |
|---|---|
| HTTP 422 + `{"detail":[{"type":"json_invalid",...}]}` | ✅ Your key is valid. Move to Step 3. |
| HTTP 403 + `{"detail":"Forbidden: Invalid IAM/Edge Token"}` | 🔴 Your key is invalid (typo, expired, or revoked). Verify `$FANO_API_KEY` locally. If confirmed correct, contact `@futureWA` — the key may need reissuance. |
| HTTP 403 + `{"detail":"Not authenticated"}` | 🔴 Header not being sent. Check that `X-API-Key` is exactly capitalised and your shell is expanding the variable. Note: Fano-engine's auth is routed through Google IAM/Edge — the error string mentions IAM/Edge Token, but the wire header the kit uses IS `X-API-Key`. |

Note the auth error message is `"Forbidden: Invalid IAM/Edge Token"` — Fano-engine's auth
layer is not a plain FastAPI `Depends(...)` check; it routes through Google's IAM/Edge
authorization. This is why the message references IAM/Edge tokens. The header your SDK sends
IS `X-API-Key` (the mapping happens server-side).

## Step 3 — The canonical canary — connectivity + auth + schema together

The kit ships three canonical wire-truth fixtures at `examples/canonical-fixtures/`. Fixture
**01 (Bank Accounts)** is designated as the pre-flight canary because:

- Its expected response is stable across all five entity structures (`sbrm_1137` dominant
  regardless of entity — VERIFIED against `docs/architecture.md §-1` iter11.B production note
  + fixture-embedded `$comment` from 2026-06-25 mini-Gauntlet).
- Its shape is minimal (single probe line + balancing sentinel).
- It exercises the full end-to-end path: request parse + auth + cascade classifier + L3
  Prolog firewall + response emission.

**Extract the canary payload:**

```bash
# Extract just the request_template from the fixture and set entity_structure=company:
python3 -c "
import json
d = json.load(open('examples/canonical-fixtures/01-bank-accounts-all-entities.json'))
req = d['request_template']
req['entity_structure'] = 'company'
print(json.dumps(req))
" > /tmp/canary.json
```

**Fire the canary:**

```bash
curl -sS -X POST \
  'https://fano-engine-79859053141.australia-southeast1.run.app/ingest/trial_balance' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: '"$FANO_API_KEY"'' \
  -d @/tmp/canary.json \
  -w '\nHTTP=%{http_code}\n'
```

**Expected response shape** (VERIFIED against fixture 01 `expected_response_shape`):

```json
{
  "status": "success",
  "equilibrium_valid": true,
  "results": [
    {
      "description": "Bank Accounts",
      "predicted_code": "sbrm_1137",
      "confidence": <number between 0.50 and 0.97 inclusive>,
      "cascade_topology": "current_assets",
      "model_architecture": "iter11.B_R3_entity_prefixed_single_classifier_with_platt_scaling",
      "operator_hint_predicted_code": "sbrm_0000",
      "operator_hint_source_topology": "current_assets",
      "operator_hint_confidence": 0.5,
      "fano_status": "accepted_fact",
      "quarantine_reason": null
    },
    {
      "description": "Sales Income",
      "predicted_code": "<sbrm_4110 or a silver-tier alternative>",
      "fano_status": "accepted_fact"
    }
  ]
}
```

**What passes canary:**

- HTTP 200.
- `status == "success"`.
- `equilibrium_valid == true`.
- `results[0].predicted_code == "sbrm_1137"` — this is the load-bearing check. Bank Accounts
  is expected to resolve to sbrm_1137 with high confidence regardless of the entity.
- `results[0].fano_status == "accepted_fact"`.
- `results[0].model_architecture` starts with `"iter11.B"`.

If all five pass, your integration is green end-to-end. Move to real datasets.

**What partial failures tell you:**

| Observation | Diagnosis |
|---|---|
| `results[0].predicted_code != "sbrm_1137"` | The classifier is returning something different than the fixture documented. Either (a) the fixture is stale (kit's checked-in fixtures were captured 2026-06-25 against `fano-engine-00032-qan` and may have drifted since retraining), or (b) something has changed in production. Open a `kit-defect` issue with the actual response attached. |
| `results[0].fano_status == "draft_fact"` | Bank Accounts is triggering a non-accepted path (sub-floor OR L3 firewall rejection) that didn't fire on 2026-06-25. Read `quarantine_reason` for which path fired; open an issue with the full response attached. |
| `results[0].fano_status == "quarantine"` | Bank Accounts triggered a Prolog subprocess timeout — substrate-health issue, NOT structural rejection. Retry may succeed; if persistent, treat as `service-defect`. |
| Response contains a field not documented in `docs/response-schema.md` | Undocumented wire behaviour. Open a `kit-defect` — the kit's contract needs to catch up to the wire. |
| Response is missing a field the fixture documents | Same. |
| HTTP 4xx / 5xx after Steps 1 and 2 passed | Route back through Step 1 to confirm the service is still up. If Step 1 still passes, the payload triggers something unexpected in the cascade — contact `@futureWA`. |

## Canary-passed → move to your real datasets

If the three steps pass, your integration is verified against the canary. From here:

1. Read `docs/what-to-measure.md`. Compute A / B / C / operator-agreement per dataset.
2. Log the `results[0].model_architecture` value from your canary response — that pins your
   benchmark to a specific model revision. Include it in any issue you open with trial
   results.
3. Fire your datasets. One issue per dataset with the `trial-2026-08-24-daniyal` label.

## Canary-failed → do not fire real datasets

If any of the three steps fails and Step 1 confirmed the service is up, the failure is either
kit-side or service-side. Open an issue before running real data through — a broken canary
plus a real dataset produces uninterpretable results.

## Why fixture 01 and not fixtures 02 or 03

- Fixture **02 (Drawings firewall polarity)** exercises the L3-firewall-rejection `draft_fact`
  path — good for validating your client's handling of the `"Entity/Topological Drift: ..."`
  `quarantine_reason` shape, less good as a canary because rejection details are more variable
  across retrains.
- Fixture **03 (Loans-to-Beneficiaries sub-floor)** exercises the abstention path — good for
  validating your operator-review queue integration, less good as a canary because the
  sub-floor confidence bar depends on Platt-scaled semantics (`docs/architecture.md §-1`
  notes this).
- Fixture **01 (Bank Accounts)** is the accepted_fact path with high per-entity stability —
  the natural canary. It is also the smallest end-to-end verification of the wire.

Once fixture 01 passes, fixtures 02 and 03 are useful **integration tests** for your client's
warning-handling and sub-floor-abstention code paths — but they are not pre-flight canaries.

## Provenance

- Wire probes: 2026-08-24 09:15–09:30 UTC against
  `https://fano-engine-79859053141.australia-southeast1.run.app`.
- Empirical error signatures for Step 1 and Step 2 tables: WIRE-VERIFIED at probe time.
- Canary expected response: derived from `examples/canonical-fixtures/01-bank-accounts-all-entities.json`
  (`expected_response_shape` field) — captured 2026-06-25 mini-Gauntlet.
- Cross-reference (Brain-side; private): `memory/2026-08-24-mc16-fano-consumer-trial-readiness.md` §ITEM 2.

## Logging discipline (framework-caveat)

Before firing real data through Fano, be aware of the following empirical findings about
request-body logging behaviour (Brain-side wire-forensic 2026-08-24 mc16):

- ✅ **Application-layer logging: CLEAN.** `api/main.py` contains no `logger.*(payload|lines|request|body)`
  calls and no `print()` statements touching request contents. Verified by direct grep of
  the substrate at sha256 `8d07ab84...`.
- ⚠ **Framework-level exception handlers: NOT independently verified.** FastAPI's default
  exception handler (Starlette's `ExceptionMiddleware`) can surface request-body fragments in
  a stack trace on unhandled 500 errors. The wire-truth grep covered `api/main.py` but did
  not cover Starlette middleware or FastAPI's built-in exception handling.
- ⚠ **Pydantic 422 validation errors DO echo request-body content** in the response body
  (default FastAPI behaviour). Each validation-error detail contains an `input` field with
  the offending value. If sensitive strings live in `line.description` and you submit a
  malformed payload, that content lands in the 422 response AND in the Cloud Run
  request-response log.

**Practical guidance for consumers:**

- Cloud Run request-response logging captures method + path + status + latency + IP +
  timestamp by default (not body content in the accepted-request path).
- Malformed input — including exploratory probes — should be assumed to leave request-body
  content in logs unless the consumer defends client-side.
- Retention on `clawdog-ml-engine` (the Fano-engine's GCP project) is Cloud Logging default
  (30 days). IAM-gated read access; contact `@futureWA` for the current access-list disposition.
- If your dataset is sanitised, verify what "sanitised" means concretely at your source. The
  classification input is free-text `line.description` — which is exactly where identifying
  content survives a sanitisation that only strips account codes or account IDs. A string
  like `"Payment to Acme Pty Ltd for consulting services"` is both the sensitive field AND
  the field being classified.

Before firing real data through Fano, confirm with whoever prepared the dataset:

- Are the `description` strings raw as-recorded, or has PII been replaced with placeholders?
- If replaced, what pattern (e.g. `<CLIENT_A>`, hashing, deterministic tokens)?
- Does the same sanitisation apply consistently across all rows and all datasets in the batch?

This is not a Fano-side blocker — it's a data-preparation question that determines what your
trial artefacts (logs, reports, retrospective analyses) will contain.
