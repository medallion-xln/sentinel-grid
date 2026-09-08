# Stage 2L.20 — Oracle vocabulary alignment and head contract repair

Status: **PASS** · Outcome: **E_DEEPER_HEAD_SEMANTICS_DEFECT** · Authority: R0 (advisory only)

## What Stage 2L.19 got wrong

Stage 2L.19 recorded both heads as `INVALID_BENCHMARK_SEMANTICS` and filed both
under one remediation class. Tracing each to its owner shows they are not the
same defect, and one of them was misattributed to the wrong party.

| | Stage 2L.19 said | What the audit found | Owner |
| --- | --- | --- | --- |
| `persistence` | producer emits the wrong label | correct — `NON_PERSISTENT` vs canonical `NOT_PERSISTENT` | producer (Stage 2I.3) |
| `timeToThreshold` | head never emits `CROSSING_1_TO_3` | **wrong** — the head emits it correctly; no benchmark case ever presents the state | benchmark corpus |

`NOT_PERSISTENT` is canonical on authoritative ownership, not on the benchmark
being the benchmark: the original Stage 2I.2 head emits it, that head's own
corpus expects it, and the Stage 2L.1, 2L.2 and 2L.4 label schemas all declare
it. `NON_PERSISTENT` appears in exactly one place — the Stage 2I.3 remediation
that introduced the drift.

## The timeToThreshold finding, and Stage 2L.19's own part in it

Every benchmark case claiming `CROSSING_1_TO_3` generates a series whose **last
observed value is already past the threshold**, so `ALREADY_CROSSED` is the
correct answer and the head was right every time:

| corpus | cases claiming the label | already past threshold |
| --- | --- | --- |
| STAGE2I4_ORACLE_V2_HOLDOUT | 100 | **100** (1) |
| STAGE2L19_ORACLE_STRESS_CORPUS | 45 | **45** (1) |

The second row is Stage 2L.19's own corpus. Its well-posedness rule required
the crossing to occur **inside** the observed window, which for a monotone ramp
guarantees the series ends above the threshold — it enforced the negation of the
label it was guarding. Defect class: `B_BENCHMARK_LABEL_INVALID`.

## The repair

- **persistence** — canonical label `NOT_PERSISTENT`, legacy `NON_PERSISTENT` accepted and canonicalised before evaluation. No threshold, branch or abstention rule touched.
- **timeToThreshold** — the producer is not changed at all. The corpus family is
  regenerated so the last observed value sits below the threshold with the
  crossing genuinely ahead, and a `CROSSING_4_TO_8` family is added because the
  producer emits that label and no benchmark had ever exercised it.

Nothing frozen was edited. The canonical view wraps the frozen assembly and
preserves each head's own `outputDigest`, so Stage 2L.10 and Stage 2L.19 still
reproduce byte-identically.

## Measured effect

| head | accuracy before | accuracy after | trivial baseline | abstention |
| --- | --- | --- | --- | --- |
| `persistence` | 0.34322 | 0.34322 | 0.508475 | 0.605932 |
| `timeToThreshold` | 0.842105 | **1** | 0.230769 | 0.076923 |

Unrelated heads changed: **false**. All six were re-scored and every
semantic output and output digest is identical.

## The part that is not vocabulary

`persistence` accuracy moved by exactly
0 on the stress corpus and
0 on the inherited one. The rename was real and is fixed, but it was
never what capped the head. On the inherited corpus the head does not emit the
misnamed label either — it **abstains**, at a rate of
0.333333.

Stage 2I.3 changed two things at once. It renamed the label, and it added an
indeterminate-direction abstention the original head did not have
(`dominantSign === 0 || |slope| < .003 || support < .28`). The original Stage 2I.2
head answers `NOT_PERSISTENT` on a flat or alternating series — its own `STABLE`
family is labelled exactly that — where the remediated head abstains. The
inherited `ALTERNATING_INTERRUPTION` family is a pure square wave, so it abstains
on every case.

That is `ABSTENTION_SEMANTICS_DIVERGENCE`, owned by
`src/lab/stage2i3-oracle-head-remediation.js::evaluatePersistenceV2 (INDETERMINATE_DIRECTION gate)`. Fixing it means changing an abstention gate inside a frozen
head, which is an Oracle algorithm redesign and out of scope here. It is
identified, owned, and stopped at — which is why the outcome is
`E_DEEPER_HEAD_SEMANTICS_DEFECT` rather than "both contracts repaired", even though both contracts were.

## Reachability and boundaries

- `persistence`: 3/3 canonical labels reachable
- `timeToThreshold`: 5/5 canonical labels reachable

Boundary probes: 26/27 agree, with
1 exact-edge float-sensitive case(s) and
0 inside-bucket disagreement(s).
At a whole-number crossing horizon, ceil((threshold - last) / recentSlope) evaluates a hair above the integer in IEEE-754 and the case lands in the next bucket up. The mapping stays single-valued and deterministic; only the edge placement moves. Repairing it would mean editing a frozen head, which this stage may not do.
The mapping stays single-valued and deterministic; only the edge placement
moves. The repaired corpus therefore targets bucket interiors, not edges — a
corpus that generates edge cases and then scores the head wrong for them is the
defect this stage exists to repair.

## Boundaries held

Action paths before: `direction` · after: `direction` · unchanged: **true**.
Nexus behaviour changed: false. Reliability floor: 0.99 (unchanged).
Live dispatches 0 · world mutations 0 · authority escalations 0.

Portability: DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.10 through 2L.19 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.20 does not change that.

Certification hash: `e468dc3433e3a9a5f66378f8a6b9c3be0e9f1cfa5b66750614884c0c33a0dbfe`
Evidence digest: `60eb09acae3a44d67084334dbb910fc4a69519a7d901b17fdf3bcd3e18b3c425`

