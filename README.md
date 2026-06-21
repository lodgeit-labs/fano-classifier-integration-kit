# fano-classifier-integration-kit

**Integration kit for the Fano Classifier** — a new methodology for clearing trial balances via a cascade firewall + rich warning payload. Designed for AI agents and human developers building against the Fano `/ingest/trial_balance` API.

> **Status:** TypeScript SDK + OpenAPI contract + SBRM lexicon shipped (v0.1.1). Canonical examples + methodology docs staged in subsequent releases (η.2, η.3).

---

## What is Fano?

Fano is a **stateless cascade classifier and firewall** for trial-balance line-item ingestion. It's not a black-box classifier — it's a structured pipeline that:

1. **Respects operator wire-truth.** The `(predicted_code, source_topology, entity_structure)` tuple submitted at `/ingest/trial_balance` is treated as authoritative — Fano never silently overrides what the operator submitted.
2. **Produces an independent cascade reading.** L1 (ONNX router) → L2 (ONNX specialist per L1 domain) → L3 (Prolog firewall on SBRM physics).
3. **Emits structured warnings on disagreement.** When the cascade's reading differs from the operator's submission, Fano emits a rich warning payload carrying the cascade's alternate hypothesis, the disagreement reason (SBRM rule + L1/L2 signal breakdown), and a suggested repair-journal entry the operator can review.

This is the **operator-authoritative architecture**: the source chart-of-accounts (QBO / Xero / MYOB / etc.) remains the structural source-of-truth; Fano provides commentary, not corrections.

## Why a methodology, not just a classifier?

Adopting teams (LodgeiT-monolith, Coracle, third-party developer agents) consume Fano in three layers:

- **Layer 1 — Ingest & Firewall.** The cascade verifies structural legality and produces a firewall verdict (`accepted_fact` / `draft_fact` / `quarantine`) plus zero-or-more structured warnings.
- **Layer 2 — Operator-review queue.** Rows with warnings or sub-floor confidence enter a review surface where a human operator (typically a senior accountant) reviews disagreements and approves or rejects the cascade's alternate hypotheses.
- **Layer 3 — GL write with provenance.** Approved rows write to the general ledger carrying cryptographic provenance back to Fano's cascade decision plus the operator's approval signature.

This kit gives adopting teams the API contract, type definitions, examples, and implementation patterns to build their own UX against Fano without re-deriving the architecture.

## Audience

- **First adopter:** Daniyal's team at LodgeiT Labs (TypeScript stack)
- **Subsequent adopters:** LodgeiT-monolith (Anton's workflow module), Coracle (control plane), third-party AI agents and human developers

## Roadmap

- **η.0** ✅ — repo creation + initial scaffolding (v0.1.0)
- **η.1** ✅ — TypeScript SDK + type definitions (the Daniyal-team-consumable layer; v0.1.0)
- **η.1.5** ✅ — OpenAPI contract + SBRM lexicon snapshot + LEXICON.md (v0.1.1; this release)
- **η.2** — Examples (real fixture inputs + canonical response samples + warning-handling patterns)
- **η.3** — Implementation methodology docs (operator-review-queue pattern + warning-handling + repair-journal)
- **η.4** — Daniyal-team briefing (one-page top-down spec)

## Structure

```
fano-classifier-integration-kit/
├── README.md              # this file
├── LICENSE                # Apache 2.0
├── .gitignore             # standard Node/TypeScript
├── package.json           # @lodgeit-labs/fano-classifier-client@0.1.1
├── docs/                  # architecture + getting-started + lexicon resolution
│   ├── architecture.md    # Layer 1a/1b operator-authoritative + cascade-advisory
│   ├── getting-started.md # quick orientation for adopters
│   └── LEXICON.md         # how to resolve sbrm_NNNN → human name
├── openapi/               # versioned wire contract + SBRM lexicon snapshot
│   ├── fano-classifier.openapi.json   # OpenAPI 3.1 spec fetched from production (Rev 26 mc08)
│   └── sbrm-lexicon-au.json           # 1,651-code LodgeiT-AU lexicon (pinned v0.1.1 snapshot)
├── src/                   # TypeScript SDK (η.1 — populated)
├── examples/              # canonical request/response examples (η.2 — staged)
└── .github/               # CI hygiene
```

## Reference architecture

The canonical architecture document is at [`docs/architecture.md`](docs/architecture.md). It establishes:

- **Layer 1a — Operator wire-truth (AUTHORITATIVE).** What you submit is what comes back.
- **Layer 1b — Cascade independent reading (ADVISORY).** What Fano thinks ships alongside.
- **Five warning kinds** — `topology_disagreement`, `code_disagreement`, `code_consolidation`, `entity_conditional_drift`, `subfloor_abstention`.
- **Rich warning payload schema** — each warning carries `cascade_alternate_hypothesis`, `disagreement_reason`, `suggested_repair_journal`.

## API surface

Production endpoint: `https://fano-engine-afmurhqkaq-ts.a.run.app/ingest/trial_balance`

The versioned OpenAPI 3.1 contract is at [`openapi/fano-classifier.openapi.json`](openapi/fano-classifier.openapi.json) — fetched from production at v0.1.1 release (Rev 26 mc08). Suitable for generating strongly-typed clients (NSwag / Kiota / openapi-python-client / openapi-typescript).

Request shape (Pydantic-validated; see OpenAPI for canonical schema):

```yaml
{
  "entity_structure": "company" | "trust" | "partnership" | "sole_trader" | "super_fund",
  "lines": [
    {
      "description": "<account name as submitted>",
      "predicted_code": "sbrm_NNNN",
      "source_topology": "current_assets" | "non_current_assets" | "current_liabilities" | "non_current_liabilities" | "equity" | "revenue" | "expenses",
      "confidence": 0.0-1.0,
      "amount": <decimal>
    },
    ...
  ]
}
```

Equilibrium constraint: `abs(sum(line.amount for line in lines)) <= 0.01`. Single-line probing requires a sentinel balancing line.

The response returns `predicted_code: "sbrm_NNNN"` — to resolve those codes to human-readable names, see [`docs/LEXICON.md`](docs/LEXICON.md) and the pinned [`openapi/sbrm-lexicon-au.json`](openapi/sbrm-lexicon-au.json) lookup table (1,651 codes covering the LodgeiT-AU taxonomy).

TypeScript SDK consumes this contract directly; see [`src/types.ts`](src/types.ts) and [`src/client.ts`](src/client.ts).

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Source

Fano canonical canon lives at [`futureWA/clawdog-brain`](https://github.com/futureWA/clawdog-brain) (private). Architecture decisions referenced here trace back to merged PRs in that repo:

- **PR #446** — sprint design + two-layer responsibility model (PR α §0)
- **PR #451** — verdict deep-dive (95.66% lenient conditional accuracy on the operator-committed slice)
- **PR #453** — topology-disagreement reframe + rich warning-payload schema (PR ζ.0)
- **PR #454** — QA-corpus-bearing fixture re-mint (PR ζ.1; PII-filtered safe vocabulary)

---

*This kit is the open-development surface for the Fano Classifier methodology. Built by LodgeiT Labs.*
