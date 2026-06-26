# Changelog

All notable changes to `@lodgeit-labs/fano-classifier-client` (the integration kit) are documented here.

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
