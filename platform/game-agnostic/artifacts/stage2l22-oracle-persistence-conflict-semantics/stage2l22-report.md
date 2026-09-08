# Stage 2L.22 — persistence conflict semantics and SUSTAINED_RUN well-posedness

Status: **PASS** · Outcome: **E_HEAD_CORRECT_CORPUS_DEFECTIVE** · Authority: R0 (advisory only)

Two independent questions. Neither verdict was allowed to stand in for the other:
the semantic verdict comes from a declared table, and the corpus verdict from
descriptive statistics computed without running Oracle at all.

## Question A — is CONFLICTING_EVIDENCE an abstention or a label?

The control flow settles what the reason code can possibly mean. It is gate
**4** of five:

```
1. values.length < 6 || historyCoverage < .8   -> SHORT_OR_MISSING_HISTORY
2. dominantSign === 0 || |slope| < .003 || ... -> INDETERMINATE_DIRECTION
3. support / tolerance / opposing-run satisfied -> PERSISTENT
4. directionalConsistency < .62                -> CONFLICTING_EVIDENCE
5. otherwise                                   -> NOT_PERSISTENT
```

It is unreachable until sufficiency has passed, and the only outcome below it is
`NOT_PERSISTENT`. In position, it says: *this answer would be NOT_PERSISTENT, but
consistency is low, so abstain instead.* That is a behaviour-classification gate
wearing an epistemic label — measured as `BEHAVIOR_CLASSIFICATION_GATE`, with
`CONFLICTING_EVIDENCE_REQUIRES_SUFFICIENT_HISTORY=true`.

On the ten declared taxonomy cases the gate fires 2 times, and
2 of those are abstentions the semantics says should have been answers.
Classification: `OVER_ABSTENTION`.

### And yet the head is not being changed

A sweep of **3520** deterministic cases — slope, jitter amplitude, window
length and variant, swept independently — reaches the gate
**0** times. So does the Stage 2L.21 corpus:
**0** of its persistence cases. The reason is structural:

> directionalConsistency is max(dominant, other)/nonzero and so is never below 0.5. The gate needs it under 0.62, i.e. near-balanced step signs — and a near-balanced series almost always has |slope| < .003, which the INDETERMINATE_DIRECTION gate above it catches first. Gate two shadows gate four across nearly the whole input space.

So the structural argument stands and there is nothing to repair with it. A head
change justified by two hand-built cases, altering nothing on any real corpus,
is not a repair — and certifying a defect "reduced" on it would be false. This
arc has declined to act on thin populations three times before (2L.15 on 0.0006
of precision, 2L.18 on six cases, 2L.19 on a bucket with no error variance); the
same discipline applies here.

Decision: `E_NO_CHANGE_INCONCLUSIVE` — reason `STRUCTURALLY_OVER_ABSTENTION_BUT_EMPIRICALLY_UNREACHABLE`,
population 2 against a required 8.
Recorded as a documentation-level defect in the frozen head: owned, not patched.

## Question B — do the SUSTAINED_RUN cases depict a sustained run?

Adjudicated from the produced series against `STAGE2L21_PERSISTENCE_SEMANTICS_V1`,
with Oracle never consulted (`DESCRIPTIVE_STATISTICS_ONLY_ORACLE_NOT_CONSULTED`).

| | count |
| --- | --- |
| cases labelled PERSISTENT | 120 |
| semantically persistent | 102 |
| **semantically NOT persistent** | **18** |
| within 0.06 of the consistency threshold | 13 |

Status: **PARTIALLY_MISLABELLED** (mislabelled share 0.15).

The cause is signal-to-noise. The generator sweeps slope 0.004–0.028 against
jitter 0–0.024, and a jitter swing can move a step by twice its amplitude:

| median SNR | min | max | noise-free cases |
| --- | --- | --- | --- |
| **0.5** | 0.083333 | 2.333333 | 24 |

A median of 0.5 means the typical case has jitter swings twice the intended
per-step advance. The phase map confirms the operating box straddles the
boundary: 26 cells hold PERSISTENT, 9 do not, and the lowest
signal-to-noise ratio that still holds is 0.25.

**The corpus is not regenerated here.** The brief asks for the defect to be
diagnosed and owned rather than silently rewritten in the same run, and it does
not block the semantic analysis, which never consults a label.

## Two scorecards, not one

| | accuracy | abstention |
| --- | --- | --- |
| as-labelled | 0.881757 | 0.202703 |
| semantically adjudicated | **0.942568** | 0.202703 |

The gap is the corpus defect: 18 cases where the label disagrees with the series it
labels. Collapsing these into one number would hide exactly the thing this stage
was sent to find.

## Boundaries held

Cross-head isolation: 16114 comparisons, **0** violations. `timeToThreshold` remains 1.
Action paths before `direction` · after `direction` · unchanged **true**.
Nexus behaviour changed: false. Semantics version unchanged: true. Floor: 0.99.
Live dispatches 0 · world mutations 0 · authority escalations 0.

Portability: DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.10 through 2L.21 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.22 does not change that.

Certification hash: `035e61a4cade46156ba69ed2af613297b6651d432993389d43babcd0fc69ce2b`
Evidence digest: `a65ae84b0c54a0c3e8a5c0c6f81877816fe3a70e88d2804d3cf28bf50acfa5ff`

