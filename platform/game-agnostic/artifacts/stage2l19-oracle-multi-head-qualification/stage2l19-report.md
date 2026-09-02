# Stage 2L.19 — Oracle multi-head correctness, identifiability and selective-delegation qualification

Status: **PASS** · Outcome: **B_ONE_SAFE_SPECIALIST_OTHERS_USEFUL_NOT_SAFE** · Authority: R0 (advisory only)

## What this stage set out to answer

Stage 2L.18 ended the Nexus line on principle. Oracle was the next unexamined
expert surface: Stage 2L.10 certified selective delegation for its DIRECTION head
and the other seven heads had never been given head-specific correctness,
identifiability, utility or calibration evidence. This stage measured all eight.

## The two things that had to be established before any head could be scored

**Oracle heads are classifiers, not action recommenders.** `assembleOracleV2`
declares `actionMapping: false` and forbids `recommendedAction` and its
relatives outright. Prime emits an action; seven of the eight heads emit a label
about history. "Does this head beat Prime" is therefore not a question those
seven can answer, and inventing a label-to-action mapping would have been this
stage fabricating the very semantics it was auditing. The honest baseline for a
classifier is the best trivial classifier, and that is what is reported; the
Prime comparison appears only for the head that actually has an action path.

**The inherited corpus is degenerate.** The Stage 2I.4 holdout carries 2,400
cases, which looks ample and is not: three generator families per head, 100
variants each, and the variant function perturbs by a scale of 0.94–1.00 with an
offset under 0.002. Predictions are constant within every family for seven of
the eight heads, so the effective sample size per head is
**3**, not 300. Reporting "accuracy 1.0000, n=300" off that would
have been reporting n=3 as n=300 — the exact degeneracy that undid Stage 2L.11.
An independent stress corpus with genuine parametric variation was built, and
both corpora are reported side by side.

The stress corpus accepted 2007 cases and rejected
153 (rate 0.070833) as ill-posed. That filter
exists because of a real defect found during this stage: the first reversal
generator ran its second segment off the top of the range, the series clamped,
the recent window flattened, and the head's NO_REVERSAL answer was *correct*.
That would have been reported as a head defect. A case is now usable only if its
label is true of the series actually produced, saturation included.

## Head-by-head result

| Head | Stress accuracy | Trivial baseline | Lift | Identifiability | Classification |
| --- | --- | --- | --- | --- | --- |
| `direction` (DIRECTION_HEAD) | 1 | 0.342857 | 0.657143 | NOT_MEASURABLE_NO_ERROR_VARIANCE | **SAFE_SPECIALIST** |
| `persistence` (PERSISTENCE_HEAD) | 0.34322 | 0.508475 | -0.165255 | MEASURED_IDENTIFIABLE | **INVALID_BENCHMARK_SEMANTICS** |
| `reversal` (REVERSAL_HEAD) | 0.6625 | 0.5 | 0.1625 | MEASURED_NON_IDENTIFIABLE | **NON_IDENTIFIABLE** |
| `regimeChange` (REGIME_CHANGE_HEAD) | 0.916667 | 0.5 | 0.416667 | MEASURED_NON_IDENTIFIABLE | **NON_IDENTIFIABLE** |
| `volatility` (VOLATILITY_HEAD) | 1 | 0.571429 | 0.428571 | NOT_MEASURABLE_NO_ERROR_VARIANCE | **USEFUL_NOT_SAFE** |
| `cycle` (CYCLE_HEAD) | 0.521186 | 0.508475 | 0.012711 | MEASURED_IDENTIFIABLE | **IDENTIFIABLE_BUT_WEAK** |
| `timeToThreshold` (TIME_TO_THRESHOLD_HEAD) | 0.842105 | 0.421053 | 0.421052 | MEASURED_IDENTIFIABLE | **INVALID_BENCHMARK_SEMANTICS** |
| `abstention` (ABSTENTION_HEAD) | 0.995238 | 0.571429 | 0.423809 | NOT_MEASURABLE_NO_ERROR_VARIANCE | **USEFUL_NOT_SAFE** |

## Identifiability: what "non-identifiable" is allowed to mean here

Discrimination over correctness is an AUROC between a head's wrong cases and its
right ones. A head that is wrong on nothing has no wrong class, so that AUROC is
undefined — and reporting an undefined AUROC as 0.5 would read as "chance" and
classify the head as non-identifiable for the sole reason that it never erred.
That artifact would have misreported the Stage 2L.10-certified direction head. 3 heads
are therefore recorded as NOT_MEASURABLE_NO_ERROR_VARIANCE, which is a different
result from the 2 recorded as MEASURED_NON_IDENTIFIABLE.

Where discrimination *was* measurable, the null searches the identical
hypothesis space as the observed search, the family-wise threshold is Bonferroni
corrected across all 8 heads searched, and a signal must clear that
threshold by a predeclared margin of 0.02 and retain at least
0.5 of its lift into FINAL_HOLDOUT. Two heads landed close to the
corrected threshold and did not clear it materially; Stage 2L.18 ended on exactly
that pattern and the same discipline is applied here.

## Safe delegation

Reliability floor: 0.99 (unchanged). Harm ceilings: 0.01 / 0.01.

Seven heads have no delegation to be safe or unsafe about: the Stage 2L.10
Arbiter binding pins `head: 'direction'` and its Oracle signal schema is
direction-shaped down to the field names, so any other head is rejected by
identity with `ORACLE_SIGNAL_HEAD_UNKNOWN`. They are recorded as
NO_ACTION_DELEGATION_PATH, never as an inherited pass — the Stage 2L.10
certification covers the direction head and nothing else.

The direction head was revalidated rather than presumed, against two independent
bodies of evidence, both of which had to clear the floor:

- this stage's stress corpus: 350/350 correct where supported, Wilson lower bound **0.992329**;
- the pinned Stage 2L.10 evidence: 1332 delegations, precision 1, harmful changes 0, correct-Prime breaks 0, lower bound **0.997973**.

## Portfolio

Total heads 8 · semantically valid 6 · useful 6 · identifiable 3 · safe specialists 1.

Combined unique Prime-error coverage is reported as
`NOT_MEASURABLE_WITHOUT_ACTION_PATH`. Seven of the eight heads emit temporal labels, not actions, so there is no action-level error they can be said to cover. Only the direction head has a certified action-delegation path, and its coverage is the Stage 2L.10 certified figure.

## What was measured, and what is not being fixed here

Measured limitation: **ORACLE_IS_ONE_CERTIFIED_ACTION_HEAD_PLUS_LABEL_ONLY_DIAGNOSTICS**

- Only 1 of 8 heads (direction) has an action-delegation path; the assembly sets actionMapping=false and forbids action fields, so the other 7 emit temporal labels and have no delegation to be safe or unsafe about.
- 2 head(s) cannot be scored at all against the current benchmark because they emit labels it does not expect: persistence (unreachable: NOT_PERSISTENT); timeToThreshold (unreachable: CROSSING_1_TO_3).
- 2 head(s) were measured against a search-space-matched, Bonferroni-corrected null and did not separate materially; 3 produced no wrong case on a measurable split, so their self-correctness AUROC is undefined rather than at chance and is reported as not measurable, not as non-identifiable.

Remediation required: true · class `BENCHMARK_LABEL_VOCABULARY_ALIGNMENT` · owner `BENCHMARK_AND_HEAD_CONTRACT_NOT_HEAD_REASONING`.

The two vocabulary defects are contract defects between head and benchmark, not
weak reasoning: `persistence` emits `NON_PERSISTENT` where the benchmark expects
`NOT_PERSISTENT`, and `timeToThreshold` never emits `CROSSING_1_TO_3` on any
well-posed scored case. Each caps achievable accuracy at the reachable share of
the label space regardless of how well the head reasons. They are identified and
stopped at; this stage does not remediate them.

## Freeze and boundaries

Nexus behaviour changed: false. Oracle behaviour changed: false. Arbiter changed: false. Prime changed: false.
Live dispatches 0 · world mutations 0 · authority escalations 0.

Portability: DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.10 through 2L.18 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.19 does not change that.

Certification hash: `145ce640b0b7a9bcceaa9688d248f2ba4cf8dd89ff30cd8301f69f2eadc9f3fe`
Evidence digest: `67ba3c2fc67be10c3c1ebeae175306c326380dae08d1ef2c171d2fd49a1ff532`

