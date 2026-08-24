# What to Measure

> **Read this before you run Fano against any dataset.** How you measure Fano determines
> whether your run produces a useful signal or a wrong verdict about a working system.

## The one thing not to do

**Do not compute** _"how often did Fano's `predicted_code` match my original `predicted_code`?"_

That measures your **upstream classifier's** accuracy — the thing that produced the codes in
your source chart-of-accounts before Fano ever saw them. It does not measure Fano.

Fano is not a classifier. Fano is a **firewall over classifications you already have** —
it accepts, warns on, or quarantines what you submit, based on SBRM structural rules + a
cascade's independent reading. Measuring Fano by "did Fano's code match my code" is like
measuring a smoke alarm by "did the alarm's opinion of the room match my opinion of the
room." You will confidently conclude the alarm is 21% correct and be measuring the wrong
thing.

## The four numbers to compute per dataset

For each dataset you submit through `POST /ingest/trial_balance`, compute these four numbers
over the N rows you submitted:

### A. Acceptance rate

```
A = count(rows where fano_status == "accepted_fact" AND (warnings == [] OR warnings absent)) / N
```

Share of rows Fano cleared as **structurally legal AND cascade-agreeing**. These are the rows
that could write straight through to GL with no operator review.

**Expected range on well-formed real data: 60–85%.**

Anchors for this range (ATTRIBUTED-BELIEF):
- iter11.B production mini-Gauntlet (2026-06-25) hit 14/14 PASS on the canonical fixtures →
  effectively 100% on curated wire-truth probes.
- Spike-3 live-traffic sampling (2026-06-07; different architecture) hit ~75% acceptance on
  the 100-row PROD sample.
- The 60–85% expected range brackets the "typical real-world" prior between these anchors.

### B. Warning-triage rate

```
B = count(rows where fano_status == "draft_fact" AND warnings != []) / N
```

Share of rows Fano cleared as structurally legal but where the cascade has an alternate
hypothesis. **This is not a failure — it is the operator-review queue Fano is designed to
feed.**

**Expected range: 10–30%.**

High B is not a Fano defect. High B means Fano is doing what it was built to do: surfacing
rows where a senior accountant should have a look. The value Fano delivers is the
`warnings[].cascade_alternate_hypothesis` + `disagreement_reason` + `suggested_repair_journal`
on these rows — not the acceptance rate.

### C. Quarantine rate

```
C = count(rows where fano_status == "quarantine") / N
```

Share of rows Fano rejected as **structurally illegal under SBRM**. The L3 Prolog firewall
identified an SBRM rule violation and refused to accept the row.

**Expected range: 1–10% on well-formed data.**

If C is high (>15%), the interpretation depends on the dataset:
- If your data is a fresh mid-migration extract from an accounting system that was itself
  inconsistent, high C is Fano correctly flagging pre-existing garbage. That is Fano working.
- If your data is from a clean, mature ledger and C is still >15%, either the ledger is
  hiding structural inconsistencies your firm did not know about, or Fano is over-quarantining
  (rare — the L3 firewall is conservative by design).

### The integrity check

```
A + B + C = 100%
```

**If this does not sum to 100%**, there is a schema-parse issue in your client, or Fano is
returning something the kit does not document. **Report it as a `kit-defect` issue on the
public repo.** The three rates should partition the population of returned rows exactly.

## The load-bearing fifth number: operator-agreement rate

The four numbers above are all computable from Fano's JSON output alone. They tell you what
Fano *thought* about your data. They do not tell you whether Fano *was right*.

For that, you need a senior accountant.

### How to compute it

1. **Sample 20 rows** from the union of B (warnings) and C (quarantine). If B + C < 20 rows,
   sample all of them.
2. **A senior accountant reviews each row without seeing Fano's verdict first.** They
   independently decide what they would do with the row: accept, review, or reject.
3. **Compare the accountant's independent verdict to Fano's verdict.** Count agreements.
4. **Operator-agreement rate = agreements / 20** (or the smaller sample size if B + C < 20).

**Expected: ≥14/20 (≥70%).**

This is the number that validates Fano's usefulness. Fano can have a great A/B/C split and
still be recommending the wrong things. Only the operator-agreement rate catches that.

**Why the sample is drawn from B + C, not A:** A is "Fano and operator agree" by construction
(both said accept). Sampling accepted rows to verify agreement is redundant. B and C are
where Fano is making non-trivial calls; those are where agreement matters.

## What a good run looks like

| Metric | Range |
|---|---|
| A (acceptance) | 60–85% |
| B (warning-triage) | 10–30% |
| C (quarantine) | 1–10% |
| Operator-agreement | ≥14/20 on B+C sample |
| A + B + C | Exactly 100% |

If your run lands in all five ranges, Fano is working as designed against your data.

## What a bad run looks like — and what it means

**Case 1: A > 95%.**
Fano is not doing meaningful firewall work — everything is passing through unchallenged.
Either your upstream data is exceptionally clean (possible on a fresh, curated fixture set;
unlikely on real accounting data at scale), or the L3 firewall is not engaging. Report as a
`service-defect`.

**Case 2: C > 20%.**
Fano is over-quarantining OR your data is structurally poor. Look at three rows from C. If a
senior accountant agrees the rows are structurally illegal, this is a data quality signal, not
a Fano defect. If the accountant disagrees, report as a `service-defect` — the L3 firewall
may have a rule firing incorrectly.

**Case 3: A + B + C ≠ 100%.**
Schema-parse issue in your client OR Fano is emitting an undocumented shape. Report as a
`kit-defect`.

**Case 4: Operator-agreement < 10/20 (<50%).**
Fano's verdicts do not track accountant judgement. This is the load-bearing failure mode —
one that no automated metric catches. Report as a `service-defect` with the 20-row sample
attached; this is the input the training substrate needs to improve.

**Case 5: HTTP 403 or connection errors.**
Not a Fano-verdict issue. See the pre-flight canary in `docs/pre-flight-canary.md` to
disambiguate.

## Why this is the benchmark of record

**iter11.B R3 (the current production architecture) entered production 2026-06-25 without a
published benchmark comparing it to the cascade it replaced.** The pre-iter11.B performance
figures (Spike-3, 97.3% structural-harness pass, 21% end-to-end classification, 75%
live-traffic acceptance) measured a different architecture and do not apply.

Your run is the first performance evidence for iter11.B R3 in production. **The 20-row
operator-agreement sample per dataset is the ground truth against which every future
calibration will be referenced.** If Fano is retrained, the benchmark you produce here is
what the retrained model must beat. If Fano is compared to a hypothetical replacement, this
is the number the replacement must exceed. Please treat it as such — hurried scoring produces
a hurried benchmark that we live with for months.

**Concretely:** if you cannot get a senior accountant's 20 minutes for the operator-agreement
sample, do not run the trial yet. Publish A / B / C without operator-agreement and the run
will be dismissed as "some numbers Fano produced about itself." Publish A / B / C plus
operator-agreement and the run is the reference point for the architecture.

## Where to report your results

Open one issue per dataset on the public kit repo
(`lodgeit-labs/fano-classifier-integration-kit/issues`) with the `trial-2026-08-24-daniyal`
label. Include:

- Dataset descriptor (synthetic / sanitised / real; row count; entity_structure mix).
- The five numbers.
- The 20-row sample with per-row Fano verdict + operator verdict + one-sentence rationale
  where they disagreed.
- Any anomalies (undocumented warning kinds, unexpected HTTP codes, malformed JSON in
  responses).
- The `model_architecture` string returned in `results[0].model_architecture` — this pins
  the benchmark to a specific service revision so future comparisons are meaningful.

Kit-side follow-ups (SDK bugs, doc corrections) are opened as separate issues with the
`kit-defect` label. Service-side follow-ups (verdicts that don't track accountant judgement,
undocumented behaviour) as `service-defect` — those will be triaged into the Fano-engine
repository by LodgeiT Labs.
