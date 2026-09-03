# Stage 2L.23 — temporal corpus well-posedness

Status: **PASS** · Outcome: **B_MULTIPLE_GENERATOR_DEFECTS_REPAIRED** · Authority: R0 (advisory only)

## The pattern this stage exists to end

Three generator defects of one shape have been found inside this project's own
evaluation data — a clamped reversal (2L.19), a crossing family that had already
crossed (2L.20), and jitter overwhelming slope (2L.22). Each was caught late, by
a diagnostic stage puzzling over an expert that looked wrong. Each is the same
mistake: the generator was validated at its nominal settings and never at its
parameter extremes, and a family NAME was treated as ground truth.

`family = "SUSTAINED_RUN"` is a statement of intent, not evidence that the
series is persistent. So this stage builds a validator per family that reads the
produced series and answers one question — is the intended label actually true? —
**without ever calling the head under test**. The certify script scans the
validator body and refuses to certify if it does.

## What the sweep found

21 families, all boundary-audited. Three were proven defective **on the certification corpus**:

| family | corpus cases | mislabelled before | after |
| --- | --- | --- | --- |
| `reversal/LATE_REVERSAL` | 120 | **1** | 0 |
| `reversal/CONTINUING` | 120 | **1** | 0 |
| `persistence/SUSTAINED_RUN` | 116 | **18** | 0 |

A further six are well posed on the corpus but fail somewhere in their declared
parameter range: `direction/RAMP_UP`, `direction/RAMP_DOWN`, `cycle/MONOTONE`, `timeToThreshold/APPROACHING`, `timeToThreshold/APPROACHING_4_TO_8`, `abstention/SHORT_HISTORY`. The corpus never visits those points, so nothing
certified rests on them — the ranges are recorded rather than silently narrowed.

## Two of my own validators were wrong first

The first run reported 9 defects in `reversal/LATE_REVERSAL` and 17 in
`abstention/SUFFICIENT_HISTORY`. Both were validator errors:

- The reversal test looked only at the **midpoint** split. Searching every split
  shows 8 of those 9 turn away from the middle and are perfectly well posed.
  Only 1 was real.
- Saturation was applied as a **universal** disqualifier. But clamping cannot
  make a 24-frame window shorter, so it does not falsify a length-only label.
  All 17 were fine; the saturation is recorded as a hygiene finding instead.

A validator that is too strict manufactures corpus defects exactly as a generator
that is too loose manufactures expert defects. Both were corrected before any
repair was made.

## The repair, and the law behind it

All three real defects share one root cause: a **shape** parameter and a **noise**
parameter sampled independently, so their extremes combine into a series that
does not depict the intended shape. The repair makes noise a *fraction of* the
shape parameter, which bounds the worst jitter swing below one step and puts
every case strictly inside the semantic region by construction rather than by
luck.

| family | min realised margin | required margin |
| --- | --- | --- |
| `persistence/SUSTAINED_RUN` | 0.28 | 0.2 |
| `reversal/LATE_REVERSAL` | 0.004 | 0.002 |
| `reversal/CONTINUING` | 0.004 | 0 |

Margins are per family in that family's own units — a consistency share for
persistence, a segment slope for reversal — because a single global number would
compare unlike quantities.

## Lineage

Parent `STAGE2L21_CORPUS` (`7d1aa026db5d…`) → `5af69d76bf95…`.
Carried 1946 · removed 356 · regenerated 355 · rejected at the admission gate 5.
Carried cases byte-identical: **true**.

## Oracle re-evaluation — corpus movement, not expert improvement

The heads are byte-identical: 2800 digest comparisons, 0 drift.
Every score change below is the corpus becoming honest, and nothing else.

| head | before | after | baseline | corpus changed |
| --- | --- | --- | --- | --- |
| `direction` | 1 | 1 | 0.342857 | false |
| `persistence` | 0.881757 | 0.939189 | 0.405405 | true |
| `reversal` | 0.6625 | 0.715481 | 0.502092 | true |
| `regimeChange` | 0.916667 | 0.916667 | 0.5 | false |
| `volatility` | 1 | 1 | 0.571429 | false |
| `cycle` | 0.521186 | 0.521186 | 0.508475 | false |
| `timeToThreshold` | 1 | 1 | 0.230769 | false |
| `abstention` | 0.995238 | 0.995238 | 0.571429 | false |

`persistence` moves 0.881757 → **0.939189**, converging on the 0.942568 that Stage 2L.22
measured by adjudicating the series instead of trusting the labels. That
convergence is the check that the repair was the right one.

## Identifiability, recertified

- `reversal`: MEASURED_IDENTIFIABLE → **MEASURED_NON_IDENTIFIABLE** (observed 0.707407, null p99 0.688889)
- `persistence`: MEASURED_IDENTIFIABLE → **MEASURED_IDENTIFIABLE** (observed 0.688832, null p99 0.638534)

Recertified with the Stage 2L.20 method reused verbatim — same splits, same
search-space-matched null, same Bonferroni correction, same materiality margin.

## Boundaries held

Oracle heads unchanged: **true**. Action paths before `direction` · after `direction`.
Nexus behaviour changed: false. Floor: 0.99. Effective variation 1067 of 2301 raw cases.
Live dispatches 0 · world mutations 0 · authority escalations 0.

Portability: DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.10 through 2L.22 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.23 does not change that.

Certification hash: `1d9981817d31381eaa481e4141ce2065ee758267bc08b83f8179b60379eac428`

