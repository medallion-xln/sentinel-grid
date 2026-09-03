# Stage 2L.21 — Oracle persistence abstention semantics

Status: **PASS** · Outcome: **C_ABSTENTION_NARROWED** · Authority: R0 (advisory only)

## The archaeology changes the question

Stage 2L.20 pointed at the Stage 2I.3 `INDETERMINATE_DIRECTION` gate. The gate is
real, but Stage 2I.3 did not introduce it in isolation — it changed the head and
its own benchmark in the same step, and the two agree with each other:

| stage | flat / alternating series expected | head behaviour |
| --- | --- | --- |
| 2I.2 | `NOT_PERSISTENT` (STABLE family) | answers |
| 2I.3 | `INSUFFICIENT_EVIDENCE` (STABLE_NO_TREND, ALTERNATING_DIRECTION) | abstains |
| 2I.4 | `NOT_PERSISTENT` (ALTERNATING_INTERRUPTION) | **wires the 2I.3 head** |

Neither contract is internally broken. Stage 2I.4 composed Stage 2I.3's head with
Stage 2I.2's label expectation, and every stage since has scored that
inconsistency as head error. The gate was `TEST_DRIVEN_AND_INTERNALLY_CONSISTENT_AT_STAGE2I3`;
the defect origin is `STAGE2I4_INTEGRATION_SPLICE`.

So "is the gate wrong?" is not answerable on its own — it is right against one
contract and wrong against the other. What had to be decided is which contract
the architecture intends, and that is an architecture question, not an accuracy one.

## What abstention means, derived from the system

`STAGE2L21_PERSISTENCE_SEMANTICS_V1`. Four independent pieces of the system say abstention is about DATA
SUFFICIENCY, and none of them is a benchmark:

1. STAGE2I2 head: abstains on values.length < 6 and on nothing else; a zero-signed slope answers NOT_PERSISTENT.
1. STAGE2I3 head: its own abstentionReason vocabulary separates SHORT_OR_MISSING_HISTORY from INDETERMINATE_DIRECTION and CONFLICTING_EVIDENCE, marking only the first as a sufficiency failure.
1. src/experts/oracle.js contract: "when history is too short the expert says so through ORACLE_INSUFFICIENT_HISTORY" — abstention is defined as a history-length concept.
1. STAGE2I4 assembly: carries a dedicated `abstention` head whose declared role is to be the sufficiency mechanism, which a second in-head sufficiency gate duplicates.
1. STAGE2L1/2L2/2L4 label schemas: declare a two-label persistence vocabulary with no INSUFFICIENT_EVIDENCE member.

**DIRECTION_CERTAINTY and DATA_SUFFICIENCY are different axes. "No stable direction" measured over an adequate window is a POSITIVE FINDING of NOT_PERSISTENT, not an admission that the question could not be answered.**

A 28-frame alternating square wave is not short of evidence. There is abundant
evidence and it says plainly that nothing is sustained. Calling that "insufficient
evidence" confuses DIRECTION_CERTAINTY with DATA_SUFFICIENCY.

## 2I.2 versus 2I.3 on 18 declared semantic cases

Expectations were written from the definition above and fixed before either head
was run.

| | 2I.2 | 2I.3 | repaired |
| --- | --- | --- | --- |
| semantic accuracy | **1** | 0.5 | **1** |

Agreement 9/18, disagreement 9. Every disagreement is the same shape:
2I.3 abstains where the semantics gives an answer, and 2I.2 is correct in **all 9**.

**False assertions prevented by the gate: 0.** The gate does not guard against anything
on this table; it converts valid answers into abstentions. Classification:
`OVER_ABSTENTION`.

## The repair

INDETERMINATE_DIRECTION abstention is converted to NOT_PERSISTENT past the head's own sufficiency gate. SHORT_OR_MISSING_HISTORY still abstains; CONFLICTING_EVIDENCE is measured and left unchanged. No threshold, tolerance or PERSISTENT branch is touched, and the frozen module is not edited.

## Measured effect

| corpus | accuracy before | after | abstention before | after | trivial baseline |
| --- | --- | --- | --- | --- | --- |
| Stage 2L.20 frozen corpus | 0.34322 | **0.851695** | 0.605932 | 0 | 0.508475 |
| Stage 2L.21 corpus (+ abstention cases) | 0.476351 | **0.881757** | 0.685811 | 0.202703 | 0.405405 |
| inherited Stage 2I.4 holdout | 0.666667 | **1** | 0.333333 | 0 | 0.666667 |

By category, on the Stage 2L.21 corpus:

| category | before | after |
| --- | --- | --- |
| STRONG_TREND | 0.698276 | 0.698276 |
| OSCILLATING | 0 | 1 |
| INSUFFICIENT_BY_CONSTRUCTION | 1 | 1 |

## The abstention tradeoff, and why the corpus had to be extended

The Stage 2L.19/2L.20 persistence corpus contains **zero** cases expecting
`INSUFFICIENT_EVIDENCE`. On it, "correct abstentions removed = 0" is true by
construction and proves nothing. A `SHORT_HISTORY` family below the head's own
minimum sample count was added — the one place abstention is the only correct
answer — so the claim can actually be tested:

- abstentions removed: **143**
- of those, correct abstentions removed: **0**; incorrect: 143
- false PERSISTENT introduced: **0**
- false NOT_PERSISTENT introduced: 23 (all on cases that were already wrong as abstentions)
- cases expecting abstention: 60; correctly retained: **60** (rate 1)
- errors introduced by the narrowing: **0**

## What is still wrong, and why it was not touched

35 persistence cases remain wrong, all of one shape:
`SUSTAINED_RUN|expected=PERSISTENT|got=NOT_PERSISTENT|wasAbstaining=true`.

The Stage 2L.19 SUSTAINED_RUN family applies jitter on top of a slope as small as 0.004, so on some variants the step signs balance even though the generator intended a sustained ramp. Whether those cases are truly PERSISTENT is a corpus well-posedness question, not a head defect, and this stage does not relabel them: relabelling a case because the head disagrees is exactly the tuning the brief forbids.

CONFLICTING_EVIDENCE remains an abstention reason on a sufficient window. It is measured and reported but was not narrowed, because the brief asks for the smallest bounded change.

## Boundaries held

Cross-head isolation: 16114 head comparisons, **0** violations. `timeToThreshold` remains 1.
Action paths before `direction` · after `direction` · unchanged **true**.
Nexus behaviour changed: false. Reliability floor: 0.99 (unchanged). No frozen module edited.
Live dispatches 0 · world mutations 0 · authority escalations 0.

Portability: DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.10 through 2L.20 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.21 does not change that.

Certification hash: `61b70821c4019a9ea6c3a47c9da7ceb06c8f7feb72ff218614db44e1173d5104`
Evidence digest: `dd96558fbcac03a8b0ae3aa9cb30cbcfe103e3dd68eda8da951cf0105387c138`

