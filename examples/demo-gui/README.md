# Fano Classifier — Trial Balance Playground (demo GUI)

A **zero-build static HTML/JS playground** for hitting Fano's
`POST /ingest/trial_balance` at the live production URL and inspecting the
response shape interactively. Designed for **Daniyal** (LodgeiT TypeScript)
and **SamSaam** (LodgeiT Depreciation_Transforms FastAPI/Azure) to see the
response wire-truth before they build their own consumer surface.

## What it does

- Builds a trial-balance payload interactively (entity structure + N lines)
- Live `net_balance` indicator (warns when unbalanced; Fano returns HTTP 400
  via `api/main.py:489` equilibrium check)
- Three canonical preset payloads from today's mini-Gauntlet
  (KC1 Bank Accounts / KC2 Drawings firewall polarity / KC6 Loans-to-Beneficiaries sub-floor)
- Renders each result line as a card colour-coded by `fano_status`
  (green `accepted_fact` / orange `draft_fact` / red `quarantine`)
- Shows raw request + raw response JSON in collapsible `<details>` panels
- API key + base URL persisted in `localStorage` (BYO key; nothing logged)

## CORS (read this)

Fano-engine at the production URL does **NOT currently emit CORS headers**.
A browser hitting it from a different origin will fail at OPTIONS preflight
(HTTP 405). Three workarounds for the demo:

1. **Local CORS-permissive proxy** (recommended) — see `PROXY.md` for a 30-line
   Node script. Point Base URL at `http://localhost:8787` in the demo; the
   proxy forwards to Fano and echoes CORS headers.
2. **Disable browser CORS** (local-only, single-purpose profile) — launch Chrome
   with `--disable-web-security --user-data-dir=/tmp/chrome-cors`. Never use that
   profile for general browsing.
3. **Wait for the Fano CORS sprint** — the natural next-sprint surface (mirror
   of the calc-api CORS fix at `clawdog-calculator-api#22` 2026-06-24). Once
   `CORSMiddleware` lands at `api/main.py` and Fano redeploys via the
   canary + atomic-flip ladder, this demo runs against production with no proxy.

## Running it (local)

```bash
# From the repo root:
python3 -m http.server 8000 --directory examples/demo-gui
# or:
npx http-server examples/demo-gui -p 8000

# Open http://localhost:8000 in your browser
# Configure the API key + (optionally) a local CORS proxy URL + click Fire
```

Or open `index.html` directly via `file://…` — but most browsers' fetch
will fail the API-key header on `file://` origins, so the local server
path is preferred.

## What you'll see at production (today's wire-truth)

The three preset buttons load fixtures that match exactly what production
returned at `2026-06-25T10:59:03Z` mini-Gauntlet:

| Preset | Sample result |
|---|---|
| KC1 · Bank Accounts × company | `sbrm_1137 / conf 0.50+ / current_assets / accepted_fact` |
| KC2 · Drawings × company | `sbrm_3140 / 0.696 / equity / draft_fact` (firewall quarantine — L#64 PROMOTED) |
| KC2 · Drawings × trust | `sbrm_2240 / 0.797 / current_liabilities / accepted_fact` |
| KC2 · Drawings × sole_trader | `sbrm_3140 / 0.641 / equity / accepted_fact` |
| KC6 · Loans to Beneficiaries × company | `sbrm_1285 / 0.326 / current_assets / draft_fact` (sub-floor; SR #4 0.50 floor) |

The Drawings preset is particularly informative — flip the `entity_structure`
across all 5 values and watch how the `fano_status` flips between `accepted_fact`
and `draft_fact` per the deployed Prolog firewall's `allowed_organisation` table.
This is the load-bearing **operator-review surfacing** behaviour your consumer
needs to render.

## File layout

```
demo-gui/
├── index.html       # entry point
├── demo.css         # styles (no framework)
├── demo.js          # ES module (no build)
├── PROXY.md         # 30-line local CORS proxy template
└── README.md        # this file
```

Total: ~10 KB; no dependencies.

## Next stages

When the Fano CORS sprint lands and `--allow-unauthenticated` stays gated by
`X-API-Key`, this same `index.html` runs against production from any origin
(including GitHub Pages at `https://lodgeit-labs.github.io/fano-classifier-integration-kit/demo-gui/`
once Pages is enabled on the repo).

Until then: use the local proxy or local server pattern above.
