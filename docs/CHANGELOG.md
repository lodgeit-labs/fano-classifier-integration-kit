# Changelog

All notable changes to `@lodgeit-labs/fano-classifier-client` (the integration kit) are documented here.

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
