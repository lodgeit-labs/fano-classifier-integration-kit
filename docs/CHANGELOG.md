# Changelog

All notable changes to `@lodgeit-labs/fano-classifier-client` (the integration kit) are documented here.

## v0.1.5 — 2026-08-25 (response schema ratified against wire truth)

**Load-bearing:** the response documentation now matches what the running Fano-engine emits. Prior versions (v0.1.0–v0.1.4) documented an aspirational structured warning-payload architecture (five canonical warning kinds + rich `warnings[]` array with `cascade_alternate_hypothesis` / `disagreement_reason` / `suggested_repair_journal`) that Rev 27 Phase 4a Path α does not implement on the wire. That design was decommissioned as an unnoted side effect of the June 2026 L1+L2 cascade collapse. This release brings the kit's response documentation to wire truth. Historical context lives in the private Brain canon (`memory/rev27-warning-loss-decision-record.md`) with a review trigger for if per-layer disagreement signals ever return.

**Ratified against** `~/fano_engine/api/main.py` sha256 `8d07ab84302e4c3f98dc7bfbd9c4ecaf32158741e2cbe7a50a19ee31fda6edc6` (648 lines) via two Streamace forensic turns:
- turn-01 2026-08-24 12:36 UTC — field-by-field grep of the 12 proposed schema fields.
- turn-02 2026-08-25 02:39 UTC — full response-construction block dump (lines 540–648) with branch-coverage grep.

Both outboxes wire-authoritative on `streamace-comms@main:outbox/2026-08-2{4,5}-fano-response-schema-*/turn-0{1,2}.out.md`. Substrate sha256 verified identical between the two forensic turns (no drift during the two-day window).

**Removed:**

- `docs/response-schema-proposal.md` — the aspirational schema is deleted. Git history preserves it.
- `docs/architecture.md` §2–§4 five-warning-kinds table + rich warning-payload YAML schema — replaced with a wire-truth §2 "Response construction — four branches" section describing the four actual response branches (Sub-floor / L3 PASS / L3 FAIL / L3 TIMEOUT) at exact `api/main.py` line numbers.
- `docs/getting-started.md` §"When you see a warning" — replaced with §"When Fano flags or rejects a row" describing the four wire branches.

**Added:**

- `docs/response-schema.md` — the ratified response contract (11.9 KB). Full `TrialBalanceResponse` + `LineResult` schemas with wire line-number citations. Documents the four `quarantine_reason` string shapes. Documents the `"quarantine"` naming trap explicitly (it fires only on Prolog subprocess timeout, NOT on SBRM structural rejection). Documents the OpenAPI codification gap (`schema: {}` on live `/openapi.json` because no `response_model=` kwarg on the endpoint decorator). Provenance header pins substrate sha256 + ratification-date chain.
- `docs/pre-flight-canary.md` §"Logging discipline (framework-caveat)" — corrects the SR #2 disposition from blanket CLEAN to scoped CLEAN: application-layer logging verified clean by grep, framework-level exception handlers (Starlette middleware) NOT independently verified, Pydantic 422 validation errors DO echo request-body content in the response by default FastAPI behaviour. Names the free-text-description pattern for consumers using sanitised data and enumerates three questions to confirm with dataset preparers.
- `docs/architecture.md` §6 — historical note explaining the pre-Rev-27 warning-payload design + pointer to the review trigger in `memory/rev27-warning-loss-decision-record.md`.

**Changed:**

- `docs/architecture.md` — near-complete rewrite. New §0 "What Fano is" opens with wire truth. New §2 "Response construction — four branches" documents each branch with wire line numbers + `quarantine_reason` string shape. New §5 "Logging discipline" carries the framework-caveat SR #2 disposition. §1 (two-layer responsibility model) preserved. Old §0 (production architecture note) folded into ratification provenance header.
- `docs/getting-started.md` — mental model third sentence rewritten (removed warnings framing; added `fano_status` + `quarantine_reason` framing). Minimal-example expected response updated to match wire (flat `predicted_code` / `confidence` / `cascade_topology` fields instead of the `cascade` sub-object; `operator_hint_*` fields for echoed operator submission; no `warnings` field). New §"When Fano flags or rejects a row" describes the four wire branches with operational routing guidance + names the `"quarantine"` naming trap defensively. Operator-review-pattern diagram updated to route on `fano_status != accepted_fact` rather than `warnings != []`.
- `docs/what-to-measure.md` — B rate renamed from "Warning-triage rate" to "Non-accepted-verdict rate"; description updated to describe the two sub-paths that feed B (sub-floor abstention + L3 firewall rejection) with `quarantine_reason` string content as the sub-routing key. C rate renamed to "Quarantine (Prolog timeout) rate"; expected range narrowed 1–10% → 0–2% because the value fires only on substrate-health timeout, not on structural rejection. Case 2 in "What a bad run looks like" rewritten to name the Prolog-timeout semantic. Historical warning-payload context noted; the A/B/C+operator-agreement rate discipline is unchanged operationally.
- `docs/pre-flight-canary.md` — fixture-02 description updated to describe the L3-firewall-rejection `draft_fact` path with `"Entity/Topological Drift"` string, not the retired warning-array shape. Partial-failure table row `draft_fact with warnings` replaced with `draft_fact` (routing by `quarantine_reason` content). Missing-field row reference updated from `docs/response-schema-proposal.md` to `docs/response-schema.md`.
- `package.json` — version 0.1.4 → 0.1.5.

**Not changed:**

- `quarantine_reason` field name is NOT renamed on the wire. The kit documents its true semantic under its true name ("despite the name, populated on any non-accepted status"). A server-side rename would create a new consumer-facing double the kit's disambiguation block was built to prevent. Rename banked as candidate future breaking change; not now.
- No fano-engine PR is opened as part of this ratification. Reintroducing the structured warning payload server-side is out of scope for the trial-readiness horizon.
- `openapi/fano-classifier.openapi.json` untouched. The live service still declares `schema: {}` on the 200 response; consumer codegen tools still produce untyped responses. Adopting `response_model=TrialBalanceResponse` upstream is a fano-engine-side change (documented in `docs/response-schema.md` §"OpenAPI codification status") that would then let the kit refresh the pinned OpenAPI.
- Disambiguation block in `README.md` — the four Fano-has-doubles pairs from v0.1.4 are preserved.
- TypeScript SDK (`src/*.ts`) — unchanged. `LegacyResponseAdapter` continues to apply correctly (it targets the flat response shape).
- Canonical fixtures under `examples/canonical-fixtures/` — unchanged. `expected_response_shape` in each fixture already describes the wire-truth shape; the fixtures were captured 2026-06-25 mini-Gauntlet against production directly.

**Why now:**

The mc16 consumer-trial-readiness ratification arc (2026-08-24 → 2026-08-25) surfaced that the kit had been documenting the wire incorrectly for eight weeks. Daniyal's team was about to code against the aspirational structured-warnings surface and find zero warning-kinds firing in their trial. Ratifying against wire truth before the trial fires prevents the specific class of confusion this month has been spent eliminating. Andrew ratified Option A (kit describes wire truth) via Fable ∮-RULING 2026-08-25 01:52 UTC. Order of operations locked: Q2 grep → delta report amendment → v0.1.5 PR (this release) → NO merge → NO deploy.

**Cross-references (Brain-side; private):**

- `memory/2026-08-24-mc16-fano-response-schema-delta-report.md` — turn-01 delta report.
- `memory/2026-08-25-mc17-fano-response-schema-delta-amendment-turn-02.md` — turn-02 branch coverage amendment.
- `memory/rev27-warning-loss-decision-record.md` — dated decision record with review trigger.

## v0.1.4 — 2026-08-24 (trial-readiness framing pass)

**Added:**

- **`docs/what-to-measure.md`** — the benchmark-of-record artefact for iter11.B R3 in production. Defines the four rates (A acceptance / B warning-triage / C quarantine / integrity check A+B+C=100%) computable from Fano's JSON output plus the load-bearing fifth number (20-row operator-agreement rate requiring senior-accountant review). Names anti-patterns (A>95%, C>20%, operator-agreement<10/20) that indicate real problems. Explains why the first consumer trial is the reference-point-of-record: iter11.B R3 entered production 2026-06-25 without a published performance comparison against the cascade it replaced.
- **`docs/pre-flight-canary.md`** — three-step canary using wire-truth error signatures to disambiguate the five common failure modes (dead service / wrong service / bad key / bad schema / valid Fano rejection). Step 1 (no key required) exploits the malformed-JSON-body path to verify service liveness. Step 2 exercises auth via same path with key. Step 3 fires canonical fixture 01 (KC1 Bank Accounts) as the end-to-end canary. All error signatures WIRE-VERIFIED 2026-08-24 against production.
- **`docs/response-schema-proposal.md`** — proposed JSON Schema for the `POST /ingest/trial_balance` response body, reconstructed from `docs/architecture.md` prose + `examples/canonical-fixtures/*.json` observed shapes + live wire probes. Consumer OpenAPI codegen currently produces untyped responses (`schema: {}` in live openapi.json); this proposal is the input for Fano-engine-side codification once ratified against `api/main.py`. Status: PROPOSAL, not adopted.
- **README.md** top-fold: framing subtitle reframing Fano as an SBRM classification firewall (admission gate over upstream classifiers) rather than a classifier. Four-item "Do not confuse these" disambiguation block covering (1) two live Cloud Run services (fano-engine vs stale fano-classifier), (2) two repos (public integration-kit vs private predecessor), (3) two model architectures (iter11.B R3 current vs L1→L2→L3 retired), (4) two threshold semantics (Platt-scaled vs raw softmax). Each pair carries the discriminator that distinguishes them on the wire.

**Changed:**

- **README.md** §"What is Fano?" — first sentence flipped from "stateless cascade classifier and firewall" to "stateless SBRM classification firewall (admission gate over upstream classification, not a classifier itself)." This corrects the framing at the load-bearing first-read surface. The "cascade" architecture description is generalised ("single entity-prefixed classifier (post-iter11.B; pre-iter11.B this was L1 → L2)") so the paragraph is truth-current against iter11.B without invalidating pre-iter11.B references.
- **README.md** §"Reference architecture" — pointer added to `docs/response-schema-proposal.md` for the response-side of the API contract; note that `docs/architecture.md §-1` describes the iter11.B current architecture while the rest of that document describes the unchanged response-contract layer.
- **README.md** status banner — v0.1.4 shipped date + trial-readiness additions inventory.
- **`package.json`** version 0.1.3 → 0.1.4.

**Why now:**

Daniyal's team is imminent as the first-adopter consumer trial. Assessment prep (mc16, 2026-08-24) identified three load-bearing gaps:

1. The framing surface guided a fresh consumer toward interpreting Fano as a classifier and evaluating it by "does Fano's code match my code" — measuring the upstream classifier, not Fano. The framing paragraph + `docs/what-to-measure.md` intervene at the earliest possible read.
2. The kit's checked-in performance claims (97.3% / 75% / 21% from Spike-3 era) do not apply to iter11.B R3. iter11.B R3 in fact has NO published performance benchmark yet. Daniyal's run becomes the benchmark of record. `docs/what-to-measure.md` §"Why this is the benchmark of record" states this explicitly.
3. The disambiguation surface prevents four common failure modes (stale-service misroute, wrong-repo, architecture-conflation, threshold-semantic-conflation) that would otherwise land as "docs are wrong" issues.

No Fano-engine mutations. No deploy. No threshold changes. All additions are kit-side framing.

**Cross-references (Brain-side; private):**

- `memory/2026-08-24-mc16-fano-consumer-trial-readiness.md` — the full readiness assessment.
- `memory/2026-08-24.md` §mc16 — standalone gap banking: no published performance figures for iter11.B R3.

## v0.1.3 — 2026-06-26 (CORS LIVE doc-truth update)

**Changed:**

- **`examples/demo-gui/README.md`** — CORS section flipped from "NOT currently emit CORS headers" + three workarounds → "Fano-engine production emits CORS headers as of 2026-06-26 11:39 UTC" + single path (point demo Base URL at production directly; no proxy required). Fano CORS Phase 5 sprint shipped Rev 28 with `CORSMiddleware` at `api/main.py` (`allow_origins=["*"]`, `allow_methods=["GET", "POST", "OPTIONS"]`, `allow_headers` includes `X-API-Key`, `max_age=3600`). Closure path: hermetic PyTest 3/3 (Phase 5.B) → canary URL browser-origin 4 probes GREEN (Phase 5.C) → production URL browser-origin + 15-probe mini-Gauntlet 14/14 PASS (Phase 5.D) at `fano-engine-00036-zok`.
- **`docs/CHANGELOG.md`** — v0.1.2 "Known gap" section flipped to "Resolved gap (2026-06-26)".
- **`examples/demo-gui/PROXY.md`** — preamble adds the production-CORS-LIVE note; PROXY.md retained as optional offline/canary convenience.
- **`package.json`** — version 0.1.2 → 0.1.3.

**Why the v0.1.2 docs were already factually stale at merge time:** v0.1.2 was authored 2026-06-25 ~12:30 UTC when Fano-engine production was at Rev 27 iter11.B without CORSMiddleware. The Fano CORS Phase 5 sprint shipped to production 2026-06-26 11:39 UTC (~23 hours later). This v0.1.3 update brings the kit's adoption-facing docs to truth-current state so Daniyal and SamSaam (and any external adopter) hit the right wire on first attempt.

## v0.1.2 — 2026-06-25 (η.2)

**Added:**

- `examples/canonical-fixtures/` — three production-wire-truth request/response pairs captured from the 2026-06-25 mini-Gauntlet (KC1 Bank Accounts, KC2 Drawings firewall polarity, KC6 Loans-to-Beneficiaries sub-floor). Each fixture documents both the request template and the empirical per-entity verdict so adopters can dogfood their client integration against known wire-truth.
- `examples/demo-gui/` — a zero-build static HTML/JS playground for hitting `POST /ingest/trial_balance` interactively. Bring-your-own API key (stored in `localStorage`; never logged or transmitted off-device). Renders results as colour-coded `fano_status` cards. Includes `PROXY.md` template for the 30-line Node CORS proxy you'll need until Fano-engine ships its own `CORSMiddleware`.
- `examples/README.md` — Daniyal (LodgeiT TypeScript) + SamSaam (Depreciation_Transforms FastAPI/Azure) quick-starts; both stacks shown end-to-end.
- `docs/architecture.md` §-1 — production architecture note for **iter11.B Rev 27** (the model architecture flip that shipped 2026-06-25 10:55 UTC): L1+L2 cascade collapsed into a single entity-prefixed Platt-scaled classifier; L3 Prolog firewall unchanged; response shape unchanged; `LegacyResponseAdapter` continues to apply correctly.

**Known gap at authoring time (RESOLVED 2026-06-26 — see v0.1.3 entry above):**

- ~~**No CORSMiddleware at Fano-engine.** Browser-origin demos currently fail at OPTIONS preflight (HTTP 405). Workarounds documented in `examples/demo-gui/PROXY.md`. Next-sprint surface in Brain canon (mirror of the calc-api CORS fix at `clawdog-calculator-api#22` 2026-06-24 — Lesson #66 CANDIDATE).~~
- **Resolved 2026-06-26 11:39 UTC:** Fano CORS Phase 5 sprint shipped to production. Lesson #66 PROMOTED at sprint kickoff; empirically closed Fano-side at production URL via the 3-leg ladder. v0.1.3 above flips the demo GUI docs to truth-current.

## v0.1.1 — 2026-06-21

**Added:**
- `openapi/fano-classifier.openapi.json` — OpenAPI 3.1 wire contract, fetched live from production (Rev 26 mc08). Suitable for client-generation tooling (NSwag / Kiota / openapi-python-client / openapi-typescript). sha256 `8197edfe59a828b602709cde73cf9e6da2e750618b138b879fd714a862ca8626`.
- `openapi/sbrm-lexicon-au.json` — pinned snapshot of the LodgeiT-AU SBRM lexicon (1,651 codes, ~1.1 MB). Lets adopters resolve `predicted_code: "sbrm_NNNN"` to human-readable taxonomy names client-side. sha256 `582da4f946e89237aa7cf753a5c5688f911428a65f7f479eb7ae875c1052977f` — byte-identical to the v0.1.1 entry in the (private) `lodgeit-labs/fano-classifier-integration` predecessor kit.
- `docs/LEXICON.md` — explains the code-vs-name resolution model (codes are the stable identifier; names are one possible interpretation; the kit ships the lexicon as a fallback for airgapped use, with a future service-side `GET /lexicon/{code}` endpoint planned). sha256 `63b568ed8432d092659d7a1e153a3a98edc6358c4f4dc6ebef355497674fba92` — byte-identical to predecessor kit.

**Note on predecessor kit:**
The (private) `lodgeit-labs/fano-classifier-integration` repo at v0.1.1 (`c044fbb`, 2026-05-13) shipped these same artefacts to org-internal Python + .NET teams. This release ports them into the public `fano-classifier-integration-kit` so external adopters (including third-party AI agents and integrators) have the same code-resolution + wire-contract surface.

**Wire-shape correction vs predecessor:**
The predecessor kit's `openapi/fano-classifier.openapi.json` was pinned to v0.1.0 of the API (request body had `entries: [TrialBalanceLine{line_id, account_name, amount, source_topology}]`). Production has since moved to Rev 26 mc08 (request body has `lines: [LineItem{description, predicted_code, source_topology, confidence, amount}]`). This release ships the production-current shape directly from `https://fano-engine-afmurhqkaq-ts.a.run.app/openapi.json` rather than the stale predecessor copy.

## v0.1.0 — 2026-06-18

**Added (η.0 + η.1):**
- Repo scaffolding + LICENSE (Apache 2.0).
- TypeScript SDK (`@lodgeit-labs/fano-classifier-client`) with type definitions, client wrapper, and `LegacyResponseAdapter` for reconstructing canonical warning payloads from the current (pre-OT-#103-deploy) production response shape.
- `docs/architecture.md` — Layer 1a/1b operator-authoritative + cascade-advisory model.
- `docs/getting-started.md` — quick orientation for adopters.
- CI on Node 18 + 20.
