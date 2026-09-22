# Stage 3F.6-P.1D — `FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1`

Certification `afd0d6e6057f497e9e1d3666cf553518e134b0c4d09f783601b393c081ae7073`
Corpus plan `840c866a65420574b136b9968984ca4e85c3cc325b9c69722aedc15c1cc41a69` (hashed before any record existed)
Corpus content `4de383eb0c6e9836706e87c6626de53ccb54853fb527f368cfaf599617e6c75e` (20,000 records, gitignored)

A **new lineage**, not a corrected version of anything. The Forge V1 corpus keeps its own identity, its own
generator and its own certificates, and still reproduces.

## Benchmark binding

Generation refuses to start unless every identity and contract hash matches the Stage 3F.6-P.1C certification
(`81586cbe…702d`):

| Role | Identity |
| --- | --- |
| Benchmark | `FORGE_SYMMETRIC_V2` |
| Generator | `FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1` |
| Action surface | `FORGE_ACTION_SURFACE_SYMMETRIC_V1` |
| Oracle | `FORGE_COUNTERFACTUAL_SYMMETRIC_V1` |
| Orientation | `FORGE_ORIENTATION_SYMMETRIC_V1` |
| Label | `FORGE_GREEDY_SAFE_SYMMETRIC_V1` |
| Features | `SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1`, profile `DEPLOYABLE_CORE`, 30 features |

## Splits and seeds

| Partition | N | Levels | Seeds declared | Seeds used |
| --- | --- | --- | --- | --- |
| DEV | 4000 | 0–5 | 2001–2003 | 2001 |
| CAL | 4000 | 0–5 | 2011–2013 | 2011 |
| HOLDOUT | 6000 (sealed) | 0–5 | 2021–2023 | 2021 |
| OOD | 6000 (sealed) | **6–7** | 2031–2033 | 2031 |

**Total 20,000** from 26,000 attempts; 2,476 candidates rejected at admission for a topology hash already
claimed elsewhere in the lineage. One seed per partition sufficed, because each seed enumerates 21,600
combinations; the spare declared seeds were not needed.

**Seed disjointness is proven, not assumed.** Prior consumed seeds (1, 2, 3, 11, 201–211, 401–411, 601–611,
801–811, 1001–1011) are enumerated in the plan and checked against every seed actually present in the corpus.
`SEED_OVERLAP = 0`, and all six partition pairs share no seed.

**OOD was defined before generation** by environment parameters only: curriculum levels 6 and 7 (28–32
topology nodes, grid 20–22, energy 20→16, hazard density 6–7, base ticks 28–31) on their own seed space. No
policy or model behaviour was consulted.

## Split hygiene

| Pair | record | state | topology |
| --- | --- | --- | --- |
| DEV/CAL, DEV/HOLDOUT, DEV/OOD, CAL/HOLDOUT, CAL/OOD, HOLDOUT/OOD | **0** | **0** | **0** |

No duplicate record, world or topology hash anywhere in the lineage, and no derived-variant leakage (no
combination appears in two partitions).

## Symmetry balance

| Partition | orientation max deviation from 1/8 | material E / N / S / W | P(optimal \| legal) E / N / S / W | max deviation |
| --- | --- | --- | --- | --- |
| DEV | 0.009 | .253 / .249 / .259 / .234 | .273 / .250 / .259 / .253 | 0.014 |
| CAL | 0.009 | .249 / .247 / .247 / .255 | .261 / .258 / .251 / .264 | 0.008 |
| HOLDOUT | 0.009 | .255 / .250 / .246 / .246 | .255 / .257 / .258 / .263 | 0.004 |
| OOD | 0.007 | .247 / .243 / .252 / .259 | .251 / .253 / .258 / .263 | 0.007 |

All eight D4 orientations appear in every partition. Historical Forge V1 had material EAST at 0.78 and
P(optimal | legal) EAST at 0.70 against NORTH 0.06.

## Equivariance gate (sampled)

820 sampled rows, 4,100 transform checks across the four partitions:

| | DEV | CAL | HOLDOUT | OOD |
| --- | --- | --- | --- | --- |
| sampled rows | 164 | 168 | 246 | 242 |
| legal surface | 1.000 | 1.000 | 1.000 | 1.000 |
| optimal set | 1.000 | 1.000 | 1.000 | 1.000 |
| regret | 1.000 | 1.000 | 1.000 | 1.000 |
| label | 1.000 | 1.000 | 1.000 | 1.000 |
| CORE feature invariance | 1.000 | 1.000 | 1.000 | 1.000 |

## Directional shortcut

| Partition | FIXED_EAST | FIXED_NORTH | FIXED_SOUTH | FIXED_WEST | LOWEST_ID | RANDOM | spread |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEV | 0.323 | 0.298 | 0.308 | 0.301 | 0.330 | 0.320 | 0.025 |
| CAL | 0.307 | 0.303 | 0.296 | 0.311 | 0.309 | 0.315 | 0.015 |
| HOLDOUT | 0.296 | 0.298 | 0.299 | 0.305 | 0.305 | 0.310 | 0.009 |
| OOD | 0.265 | 0.268 | 0.272 | 0.278 | 0.269 | 0.276 | 0.013 |

The lowest-identity MOVE is within ±0.01 of random everywhere. On Forge V1 it scored 0.72.

**Cost shortcut, separately:** a zero-declared-cost action is optimal in 84.8% (DEV), 85.7% (CAL), 86.9%
(HOLDOUT) and 94.8% (OOD) of records, yet RESOURCE is correct in only 0.27–0.32 of those, and never when no
zero-cost action is optimal. Cheap is still usually right; *which* cheap action is now a real decision.

## Labels

| Partition | positive | negative | positive rate | horizon-dependent | mean optimal-set size |
| --- | --- | --- | --- | --- | --- |
| DEV | 856 | 3144 | 0.214 | 0.786 | 1.37 |
| CAL | 759 | 3241 | 0.190 | 0.810 | 1.35 |
| HOLDOUT | 1278 | 4722 | 0.213 | 0.787 | 1.39 |
| OOD | 981 | 5019 | 0.164 | 0.837 | 1.30 |

Descriptive comparison only: Forge V1 prevalence was 0.267 / 0.266 / 0.255 / 0.258. Membership was never
adjusted to equalise labels.

## Features and orientation leakage

Every record carries all 30 CORE features with no imputation and no zero-fill; a row with any unavailable
CORE feature was rejected at generation. `UNKNOWN_RATE = 0`, `UNAVAILABLE_RATE = 0` among admitted rows.

Orientation leakage is ruled out three ways: no CORE feature id or stored value carries an orientation token;
the CORE vector of a world is **identical** to that of all five transformed twins on every sampled row; and
the worst per-orientation standardised feature drift across DEV and CAL is 0.085 against a 0.25 bar.

## Determinism and storage

A deterministic 1,000-record slice (the first 250 admitted rows of each partition, spanning all 8 shards) was
rebuilt single-worker: **1000 / 1000 byte-identical**. The payload is a build product and is gitignored; the
plan, generator, manifest, content hash, tests and this document are committed.

## Sealing

DEV is development, CAL is calibration, HOLDOUT and OOD are sealed. Descriptive policy performance is reported
for DEV and CAL only. HOLDOUT and OOD received only the integrity diagnostics the plan froze in advance
(direction balance, shortcut table, label counts, equivariance).

### Descriptive policy baselines (DEV / CAL only — not a policy claim)

| Policy | DEV acc | DEV regret | CAL acc | CAL regret | coverage (DEV) |
| --- | --- | --- | --- | --- | --- |
| RESOURCE_PRESERVING_V1 | 0.273 | 44.9 | 0.261 | 44.6 | 1.00 |
| NEXUS_SELECTOR_V2_CANDIDATE | 0.314 | 40.4 | 0.304 | 39.8 | 0.86 |
| NEXUS_SELECTOR_V1 | 0.161 | 42.1 | 0.151 | 42.0 | 0.86 |
| GREEDY (reference) | 0.214 | 39.4 | 0.190 | 39.8 | 1.00 |
| RANDOM_LEGAL_V1 (control) | 0.211 | 45.3 | 0.208 | 44.1 | 1.00 |
| OBJECTIVE_TARGETING_V1 | 0.306 | 45.7 | 0.323 | 46.2 | 0.10 |
| THREAT_COVERING_V1 | 0.458 | 26.0 | 0.347 | 27.6 | 0.03 |

## Inherited benchmark property

26 records (0.13%) contain the same BYPASS action offered twice, because the frozen Stage 3B generator can add
a `dependsOn` edge that duplicates a topology edge and the frozen kernel then emits two identical actions with
the same key. It is inherited from Forge V1 and was not "fixed", because the symmetric benchmark's semantics
are frozen by the Stage 3F.6-P.1C certification. All identity comparisons use distinct action keys, so nothing
is double-counted.

## Requalification

Stages Stage 3F.6-P.1C classified `REQUIRES_RERUN`, ordered so a stage runs only after what it consumes:

```text
3F.6-P → 3F.6-P.1 → 3F.6-T → 3F.6-P.1A → 3F.6-W → 3F.6-D
```

Unaffected: 3F.6-A (contract claim). Minor numerical confound only: 3F.6-C.

## Authority

R0, non-dispatching, no online learning, nothing promoted. 14/14 stage tests pass.

## Reproduce

```bash
npm run stage3f6p1d:generate
npm run stage3f6p1d:certify
npm run stage3f6p1d:check
npm run test:stage3f6p1d
```
