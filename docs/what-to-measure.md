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
A = count(rows where fano_status == "accepted_fact") / N
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

### B. Non-accepted-verdict rate

```
B = count(rows where fano_status == "draft_fact") / N
```

Share of rows Fano flagged as needing operator review. Two sub-paths feed this rate: sub-floor
abstention (cascade lacked confidence, `quarantine_reason` starts with `"Sub-floor model
confidence"`) and L3 firewall rejection (structural rule violation, `quarantine_reason` starts
with `"Entity/Topological Drift"`). **This is not a failure — it is the operator-review queue
Fano is designed to feed.**

**Expected range: 10–30%.**

High B is not a Fano defect. High B means Fano is doing what it was built to do: surfacing
rows where a senior accountant should have a look. To sub-route B, inspect the
`quarantine_reason` string content: sub-floor rows want hand-classification; drift rows want
investigation of the operator-vs-cascade classification disagreement (which is now surfaced
via the difference between `predicted_code` and `operator_hint_predicted_code`, not via
structured warning fields).

**Historical note:** earlier kit versions (v0.1.0–0.1.4) described this as "Warning-triage
rate" and expected a structured `warnings[]` array with five canonical kinds. That structured
payload is not implemented on the wire; see `docs/architecture.md` §6 for the historical
context. The A/B/C rate discipline still works exactly the same way — you're just reading
`fano_status` + `quarantine_reason` string instead of a `warnings[]` array.

### C. Quarantine (Prolog timeout) rate

```
C = count(rows where fano_status == "quarantine") / N
```

⚠ **Naming trap.** Despite the enum value name, `fano_status == "quarantine"` fires ONLY on
Prolog subprocess timeout (`subprocess.TimeoutExpired`; 2-second timeout budget). This is a
**substrate-health signal**, NOT an "L3 firewall rejected as structurally illegal" signal.
Structural rejections come back as `draft_fact` under B (with `quarantine_reason` starting
with `"Entity/Topological Drift"`).

See `docs/architecture.md` §2 branch 4 and `docs/response-schema.md` `fano_status` enum for
full semantic detail.

**Expected range: 0–2% on well-formed data.** A well-provisioned Fano deployment on typical
inputs should virtually never time out. Persistent C > 5% is a substrate-health signal, not a
data-quality signal:

- If C spikes on a specific row and retry succeeds, that's noise (transient Prolog scheduling).
- If C is persistent on the same row across retries, the Prolog query for that row is
  pathologically slow — report as a `service-defect` with the row's `predicted_code` +
  `entity_structure` (the two arguments to the firewall query) so LodgeiT Labs can trace it.
- If C is broadly elevated across many rows, Fano's Prolog engine is under-provisioned or
  the SBRM physics have grown to exceed the 2s timeout budget — escalate to LodgeiT Labs.

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

1. **Sample 20 rows** from the union of B (non-accepted draft_fact) and C (quarantine). If B + C < 20 rows,
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
| B (non-accepted-verdict) | 10–30% |
| C (Prolog-timeout quarantine) | 0–2% |
| Operator-agreement | ≥14/20 on B+C sample |
| A + B + C | Exactly 100% |

If your run lands in all five ranges, Fano is working as designed against your data.

## What a bad run looks like — and what it means

**Case 1: A > 95%.**
Fano is not doing meaningful firewall work — everything is passing through unchallenged.
Either your upstream data is exceptionally clean (possible on a fresh, curated fixture set;
unlikely on real accounting data at scale), or the L3 firewall is not engaging. Report as a
`service-defect`.

**Case 2: C > 5% (persistent).**
Fano's Prolog subprocess is timing out at more than a substrate-noise rate. This is a
substrate-health signal, not a data-quality signal (see §C above). If C is broadly elevated
across many rows, escalate to LodgeiT Labs. If C spikes on specific rows that persist under
retry, report as `service-defect` with the row's `predicted_code` + `entity_structure`. If B
(non-accepted-verdict) is high but C is normal, that's a structural-rule signal on your
data — look at three `draft_fact` rows from B with `"Entity/Topological Drift"` strings and
have a senior accountant judge whether the rejections are correct.

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
- Any anomalies (undocumented `quarantine_reason` string shapes, unexpected HTTP codes, malformed JSON in
  responses).
- The `model_architecture` string returned in `results[0].model_architecture` — this pins
  the benchmark to a specific service revision so future comparisons are meaningful.

Kit-side follow-ups (SDK bugs, doc corrections) are opened as separate issues with the
`kit-defect` label. Service-side follow-ups (verdicts that don't track accountant judgement,
undocumented behaviour) as `service-defect` — those will be triaged into the Fano-engine
repository by LodgeiT Labs.
