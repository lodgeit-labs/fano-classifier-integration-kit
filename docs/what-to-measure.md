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

## The five numbers to compute per dataset

For each dataset you submit through `POST /ingest/trial_balance`, compute these five numbers
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

### B1. Sub-floor abstention rate

```
B1 = count(rows where fano_status == "draft_fact"
           AND quarantine_reason starts with "Sub-floor model confidence") / N
```

Share of rows where **the model was not confident enough to classify.** Fires before the L3
firewall query runs; the cascade's confidence fell below the sub-floor threshold and the row
never reaches structural evaluation.

**This is a model-quality signal.** High B1 means the cascade is uncertain; those rows want
hand-classification by an operator. It does not tell you whether Fano's structural firewall is
working — it tells you whether Fano's classifier had a confident opinion.

**Expected range on well-formed real data: 5–20% (ATTRIBUTED-BELIEF).** Under a well-calibrated
iter11.B R3 model the sub-floor should fire on a modest tail of ambiguous descriptions;
systematic B1 > 30% suggests either the calibration is off or your dataset has an unusually
high fraction of low-signal descriptions.

### B2. Structural-rejection rate

```
B2 = count(rows where fano_status == "draft_fact"
           AND quarantine_reason starts with "Entity/Topological Drift") / N
```

Share of rows where **the model WAS confident and the L3 Prolog firewall overruled it.** The
cascade classified with sufficient confidence to pass the sub-floor; the firewall queried
`evaluate_drift(predicted_code, cascade_topology, entity_structure)` against SBRM physics and
rejected the row as structurally illegal.

**B2 is the metric that measures what Fano is FOR.** A + B1 + C tell you about the classifier
and the substrate; B2 tells you about the firewall doing its job. If B2 is zero across all
datasets, Fano's structural discipline is not engaging on your data at all — either the data
is pristine (unlikely on real accounting corpora) or the firewall is silently short-circuiting.
If B2 is well above the expected range and operators agree with the rejections, Fano is
catching real structural drift that would otherwise land in the GL uncaught.

**Expected range on well-formed real data: 3–15% (ATTRIBUTED-BELIEF).** No prior benchmark on
iter11.B R3 exists; this range brackets a plausible signal-vs-noise floor given the L3
firewall's role as a structural discipline layer. Your run establishes the empirical baseline
(see §"Why this is the benchmark of record" below).

**Consumer routing:** both B1 and B2 rows carry `fano_status: "draft_fact"` and both belong in
the operator-review queue. The `quarantine_reason` string content is the sub-route key:

- **B1 rows** (`"Sub-floor model confidence (0.XX)"`) want hand-classification. The cascade
  couldn't produce a confident code; an operator supplies one directly.
- **B2 rows** (`"Entity/Topological Drift: Anchor=<topo>, Guess=<code>, Entity=<entity>"`) want
  investigation of the disagreement between operator-submitted classification
  (`operator_hint_predicted_code`) and cascade's alternate reading (`predicted_code`). The
  firewall says one of them is structurally illegal; the operator decides which.

**Historical note:** earlier kit versions (v0.1.0–0.1.4) described these two paths together as
a single "Warning-triage rate" and expected a structured `warnings[]` array with five canonical
kinds. That structured payload is not implemented on the wire; see `docs/architecture.md` §6
for the historical context. The rate discipline works the same way now — you're just reading
`fano_status` + `quarantine_reason` string content instead of a `warnings[]` array. Splitting
B1 vs B2 recovers the sub-floor-vs-structural-rejection distinction that the retired
`subfloor_abstention` vs `topology_disagreement`/`entity_conditional_drift` warning kinds would
have carried.

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
A + B1 + B2 + C = 100%
```

**If this does not sum to 100%**, there is a schema-parse issue in your client, or Fano is
returning something the kit does not document. **Report it as a `kit-defect` issue on the
public repo.** The four rates should partition the population of returned rows exactly.

If you observe `draft_fact` rows whose `quarantine_reason` matches neither the `"Sub-floor
model confidence"` prefix nor the `"Entity/Topological Drift"` prefix, that is an
undocumented shape; report it. In that case A + B1 + B2 + C will be less than 100% because
your B1 and B2 counters miss the unclassified rows; account for the shortfall as an anomaly
line in your run report.

## The load-bearing fifth number: operator-agreement rate

The four numbers above are all computable from Fano's JSON output alone. They tell you what
Fano *thought* about your data. They do not tell you whether Fano *was right*.

For that, you need a senior accountant.

### How to compute it

1. **Sample 20 rows** from the union of B1 (sub-floor abstention) + B2 (structural rejection) + C
   (quarantine). Stratify the sample: if all three sub-populations are non-empty, draw roughly
   proportional to their size but ensure at least 3 rows from B2 (the rows where Fano's core
   function fires). If the total is < 20 rows, sample all of them.
2. **A senior accountant reviews each row without seeing Fano's verdict first.** They
   independently decide what they would do with the row: accept, review, or reject.
3. **Compare the accountant's independent verdict to Fano's verdict.** Count agreements.
4. **Operator-agreement rate = agreements / 20** (or the smaller sample size if B + C < 20).

**Expected: ≥14/20 (≥70%).**

This is the number that validates Fano's usefulness. Fano can have a great A / B1 / B2 / C
split and still be recommending the wrong things. Only the operator-agreement rate catches
that.

**Why the sample is drawn from B1 + B2 + C, not A:** A is "Fano and operator agree" by
construction. Sampling accepted rows to verify agreement is redundant. B1, B2, and C are
where Fano is making non-trivial calls; those are where agreement matters. B2 is the
load-bearing sub-population because it is where the firewall performs its structural function
— if operator-agreement on B2 is weak, Fano's structural rules are miscalibrated in a way no
other metric surfaces.

## What a good run looks like

| Metric | Range |
|---|---|
| A (acceptance) | 60–85% |
| B1 (sub-floor abstention) | 5–20% |
| B2 (structural rejection) | 3–15% |
| C (Prolog-timeout quarantine) | 0–2% |
| Operator-agreement | ≥14/20 on B1+B2+C sample |
| A + B1 + B2 + C | Exactly 100% |

All expected ranges are **ATTRIBUTED-BELIEF** — no prior benchmark on iter11.B R3 exists
(2026-06-25 architecture flip; see §"Why this is the benchmark of record" below). Your run
establishes the empirical baseline. If your rates land outside these ranges consistently
across datasets, the ranges themselves are the thing to revise, not necessarily your run.

If your run lands in all six ranges, Fano is working as designed against your data.

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
retry, report as `service-defect` with the row's `predicted_code` + `entity_structure`.

**Case 2b: B2 = 0 across all datasets.**
Fano's L3 firewall is not rejecting any rows structurally. Either your data is unusually
pristine (uncommon on real accounting corpora), or the firewall is short-circuiting silently.
Compare with prior sessions or peer teams; if B2 is zero everywhere the firewall is not
engaging on your workload and Fano's core function is not being measured. Report as a
`service-defect` if you cannot explain it from data shape alone.

**Case 2c: B1 > 30% systematically.**
Cascade uncertainty across a broad fraction of your data. Either your dataset has an unusually
high fraction of low-signal descriptions (e.g. free-text lacking classifier training-distribution
vocabulary), or iter11.B R3's calibration is drifting off on your workload. Note the pattern in
your retrospective and share with LodgeiT Labs; not urgent unless it blocks the operator-review
queue capacity.

**Case 3: A + B1 + B2 + C ≠ 100%.**
Schema-parse issue in your client OR Fano is emitting an undocumented `quarantine_reason`
shape. Report as a `kit-defect`.

**Case 4: Operator-agreement < 10/20 (<50%).**
Fano's verdicts do not track accountant judgement. This is the load-bearing failure mode —
one that no automated metric catches. Report as a `service-defect` with the 20-row sample
attached; this is the input the training substrate needs to improve.

**Case 4b: Operator-agreement on B2 rows specifically is < 50%.**
Even if the aggregate operator-agreement passes, weak agreement on B2 rows in particular
means the L3 firewall is over-rejecting (or under-rejecting the wrong rows). B2 is where
Fano's structural discipline lives; if operators disagree with the firewall's rejections at
a rate incompatible with a discipline layer working correctly, escalate. Attach the B2 sub-sample
separately in your `service-defect` report.

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

**The B2 counter is the load-bearing metric for what Fano is FOR.** Fano exists to apply the
L3 Prolog firewall as a structural discipline layer over upstream classifications. B2 is the
rate at which that firewall fires. Without a B2 counter your trial cannot measure the thing
Fano exists to measure — A tells you the firewall didn't need to intervene, B1 tells you the
classifier didn't have a confident opinion, C tells you the substrate timed out, but only B2
tells you the firewall performed its structural function. Ship B2 in your run report; the
number matters even if the range in this document proves too wide or too narrow after
empirical measurement.

**Concretely:** if you cannot get a senior accountant's 20 minutes for the operator-agreement
sample, do not run the trial yet. Publish A / B1 / B2 / C without operator-agreement and the
run will be dismissed as "some numbers Fano produced about itself." Publish A / B1 / B2 / C
plus operator-agreement and the run is the reference point for the architecture.

## Where to report your results

Open one issue per dataset on the public kit repo
(`lodgeit-labs/fano-classifier-integration-kit/issues`) with the `trial-2026-08-24-daniyal`
label. Include:

- Dataset descriptor (synthetic / sanitised / real; row count; entity_structure mix).
- The six numbers (A / B1 / B2 / C / operator-agreement / integrity-check).
- The 20-row sample with per-row Fano verdict + operator verdict + one-sentence rationale
  where they disagreed. Flag which rows came from B1 vs B2 vs C in the sample.
- Any anomalies (undocumented `quarantine_reason` string shapes, unexpected HTTP codes, malformed JSON in
  responses).
- The `model_architecture` string returned in `results[0].model_architecture` — this pins
  the benchmark to a specific service revision so future comparisons are meaningful.

Kit-side follow-ups (SDK bugs, doc corrections) are opened as separate issues with the
`kit-defect` label. Service-side follow-ups (verdicts that don't track accountant judgement,
undocumented behaviour) as `service-defect` — those will be triaged into the Fano-engine
repository by LodgeiT Labs.
