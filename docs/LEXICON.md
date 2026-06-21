# Resolving SBRM Codes to Human Names

The classifier returns `predicted_code: "sbrm_1137"`, **not** `"Bank Accounts"`. This document explains why, and how to look up the human name from the code.

> **Bottom line:** the code is the **stable identifier**; the human name is one possible **interpretation** of it (which can vary by jurisdiction or by how specific you want to be). The kit ships a static lookup table at [`../openapi/sbrm-lexicon-au.json`](../openapi/sbrm-lexicon-au.json) covering all 1,651 codes in the LodgeiT-AU SBRM taxonomy.

---

## Why the response is a code, not a name

The Fano-Constraint Classifier is built around an explicit separation:

- **The deterministic atom** (`sbrm_1137`) is what the firewall reasons on. It is stable across taxonomy revisions and across jurisdictions — a code is an identifier, never a description.
- **The English name** (`Bank Accounts`) is what a human reads. It is *derived* from the atom by walking the LodgeiT taxonomy's `node_code/2` lexicon bridge. Names can change without the underlying identity changing (e.g. the same code might one day be relabelled "Cash at Bank — Current"), and different jurisdictions will use entirely different name sets for entirely different code namespaces.

This is the **`node_code/2` Lexicon Bridge** referenced in [`ARCHITECTURE.md`](ARCHITECTURE.md) §3. The classifier API deliberately surfaces only the code, leaving the human-name lookup as a separate concern — because:

1. It lets the same classifier serve multiple jurisdictions later (UK / NZ / etc.) without baking jurisdiction-specific labels into the response shape.
2. It guarantees the field returned is the *firewall-validated* atom, not a label that could drift out of sync.
3. Downstream compliance pipelines (BAS / CT600 / iXBRL renderers) join on the code, never on the label.

---

## The shipped lexicon: `sbrm-lexicon-au.json`

[`../openapi/sbrm-lexicon-au.json`](../openapi/sbrm-lexicon-au.json) is a pinned, kit-version-stable export of the AU SBRM lexicon. Schema (top level):

```jsonc
{
  "$schema":         "https://lodgeit-labs.org/sbrm-lexicon/v1",
  "taxonomy_id":     "lodgeit_au_sbrm",
  "lexicon_version": "2026-05-13",          // refreshed when LodgeiT taxonomy moves
  "source":          "ClawDog_Share/full_sbrm_physics.pl (node_code/2 + parent/2 facts)",
  "code_count":      1651,
  "codes": {
    "sbrm_1137": {
      "leaf_atom":         "bank_accounts",
      "leaf_english":      "Bank Accounts",
      "ancestry_atoms":    ["bank_accounts", "cash_cash_equivalents", "current_assets"],
      "ancestry_english":  ["Bank Accounts", "Cash & Cash Equivalents", "Current Assets"],
      "macro_family":      "assets",
      "all_atoms":         ["bank_accounts", "cash_cash_equivalents", "current_assets"]
    },
    ...
  }
}
```

### Per-code fields

| Field | Description |
|---|---|
| `leaf_atom` | The most-specific (leaf-most) slug in the LodgeiT taxonomy for this code. Lower-snake-cased. |
| `leaf_english` | Human-readable label derived from `leaf_atom`. **This is the field to display to users.** |
| `ancestry_atoms` | Inheritance chain from leaf → more general parents. Useful for hierarchical UI / faceted browse. |
| `ancestry_english` | Same chain, rendered for humans. |
| `macro_family` | Coarse-grained classification: `assets`, `liabilities`, `equity`, `revenue`, or `expenses`. Mirrors `l1_domain` in the API response in *most* cases but is computed independently from the topology — treat as advisory. |
| `all_atoms` | The complete set of slugs the LodgeiT taxonomy associates with this code (includes the leaf, its ancestry, and any flat-graph siblings). Useful if you need the full slug membership for cross-referencing. |

### Display rule of thumb

For Anton-grade clarity:

- **Single-line label:** `leaf_english`
- **Single-line with provenance:** `f"{leaf_english} ({code})"` — e.g. `"Bank Accounts (sbrm_1137)"`
- **Hierarchical / breadcrumb:** `" → ".join(ancestry_english[::-1])` — e.g. `"Current Assets → Cash & Cash Equivalents → Bank Accounts"`

---

## Worked example

```jsonc
// API returns:
{ "predicted_code": "sbrm_1137", "confidence": 0.9027, "fano_status": "accepted_fact", ... }

// Caller joins on the lexicon:
{ "leaf_english": "Bank Accounts", "macro_family": "assets",
  "ancestry_english": ["Bank Accounts", "Cash & Cash Equivalents", "Current Assets"] }

// What the human sees:
//   "NAB Business Cheque Account"  →  Bank Accounts (sbrm_1137, assets)
```

Both quickstarts in [`examples/`](../examples/) demonstrate the join.

---

## Caveats worth knowing

1. **Lexicon ≠ API truth.** The lexicon shipped here is a *pinned snapshot*. The API's firewall reasons on its own (server-side) copy of the same source. Between lexicon refreshes the kit's lexicon may briefly lag a server-side taxonomy update. For pilot integration this is fine; if you spot a code in the API response that isn't in the lexicon, that's the signal — open a *Service issue*.
2. **One code, many names.** A code's `leaf_english` is the *most-specific* human label, but a code legitimately participates in many ancestor concepts. Don't be surprised if `sbrm_3136` ancestry chains through both *Historical Earnings/Losses* (leaf) and *Retained Earnings/Accumulated Losses* (parent) — both are valid descriptions, the leaf is the canonical display label.
3. **Auto-generated English.** Names in `leaf_english` / `ancestry_english` are derived programmatically from the underscore-separated atoms in the LodgeiT taxonomy. A handful of joined-word atoms have been hand-curated for readability (e.g. `earningslosses` → `Earnings/Losses`); the rest are title-cased mechanically. If a particular code's English label reads awkwardly, the `leaf_atom` is the truth and the English is a convenience.
4. **AU only.** This is `taxonomy_id: lodgeit_au_sbrm`. UK FRS / FRC taxonomy mapping is a separate concern (see Open Thread #29 in the Brain).

---

## v0.2.0 forward-look: API-side lexicon resolution

Static lexicon files are the right answer for pilot integration, but the long-term shape is an API-side lookup so the kit doesn't have to ship and refresh a lookup table.

Planned v0.2.0 of the service:

- `GET /lexicon/{code}` → single-code resolution.
- `GET /lexicon?codes=sbrm_1137,sbrm_3136` → batched resolution.
- The classifier response itself may grow a `predicted_name` field once the API-side lexicon is stable.

When this lands, the lexicon JSON in this kit will be deprecated (not removed — still useful for offline/airgapped use), and the OpenAPI spec will declare the new endpoints. The cross-stack codegen path automatically picks up the new shape.
