# Getting Started

> Quick orientation for adopting teams. This is the high-level walkthrough; the formal architectural contract is at [`architecture.md`](architecture.md).

## What you're building against

The Fano Classifier is exposed as a single HTTP endpoint:

```
POST https://fano-engine-afmurhqkaq-ts.a.run.app/ingest/trial_balance
Authentication: X-API-Key header
Content-Type: application/json
```

You submit a trial balance (entity structure + list of line items each carrying a foundational classification). Fano returns the operator's submission unchanged, the cascade's independent reading, a firewall verdict, and zero-or-more structured warnings.

## The mental model in three sentences

1. **You submit what you know.** Your bookkeeper or upstream classifier already assigned `(predicted_code, source_topology, entity_structure)` based on the source CoA. Submit that as-is.
2. **Fano gives you a second opinion.** The cascade independently reads the line and returns its alternate hypothesis in `response.cascade.*`. Equality is the common case.
3. **Warnings highlight the disagreements.** When the cascade reads the line differently, you get a structured warning explaining why and suggesting a repair journal. The operator (typically a senior accountant) decides whether to honour the warning.

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

Expected response shape (full schema at [`architecture.md`](architecture.md) §5):

```json
{
  "status": "success",
  "equilibrium_valid": true,
  "results": [
    {
      "description": "Trading Revenue",
      "predicted_code": "sbrm_4100",
      "source_topology": "revenue",
      "confidence": 0.95,
      "cascade": { ... },
      "fano_status": "accepted_fact",
      "quarantine_reason": null,
      "warnings": []
    },
    { ... sentinel row ... }
  ]
}
```

Note the equilibrium constraint: `abs(sum(line.amount)) <= 0.01`. Single-line probes need a balancing sentinel; the η.1 TypeScript SDK wraps this automatically.

## When you see a warning

The most common warning kinds and what they mean operationally:

- **`topology_disagreement` (warn)** — the operator submitted a code from one sector (e.g. revenue) under a different topology (e.g. liabilities). Surface to the operator with the suggested repair journal; let them confirm whether the source CoA is genuinely misconfigured.
- **`code_disagreement` (info)** — the operator submitted code A; cascade prefers code B; both are in the same topology. Usually a fine-grained difference; can be auto-accepted or surfaced for review depending on your queue policy.
- **`code_consolidation` (info)** — cascade picked a more general SBRM leaf than the operator. Often appropriate for high-volume rows where you don't need leaf-precision.
- **`entity_conditional_drift` (halt)** — the cascade caught a structural drift (e.g. a Trust-only code submitted under a Company entity). Don't write to GL; surface for resolution.
- **`subfloor_abstention` (warn)** — the cascade lacks confidence on this row. The operator hint stands by default; the row enters the operator-review queue.

## The operator-review pattern

Adopting teams typically wrap Fano in a three-stage pipeline:

```
TB import → POST /ingest/trial_balance → Operator-review queue → GL write
                                              ↑                       ↑
                                  rows with warnings           approval signature
                                  or sub-floor confidence      + provenance chain
```

Rows that come back as `accepted_fact` with `warnings: []` can write through directly. Rows with `warnings` or `fano_status != "accepted_fact"` enter the queue. A human operator reviews, approves or rejects the cascade's alternate hypothesis (and optionally applies the suggested repair journal), and the approved row writes to GL with full provenance.

Detailed implementation patterns ship at η.3.

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
