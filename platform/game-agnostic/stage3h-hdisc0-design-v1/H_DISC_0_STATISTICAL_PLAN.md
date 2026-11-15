# STAGE 3H H-DISC-0 — Statistical plan

AUTHORITY: R0 · BASE HEAD `eb75dff8` · **planning arithmetic for a campaign that is not authorized**

Machine record: `evidence/HDISC0_DESIGN_EVIDENCE.json`, sections `planningInputs` and `power`
(`analysis/design-evidence.mjs`: `pairedPower`, `discordance`, `smallestN`, tested against closed forms).

Planning values are taken from spent or development data. They are assumptions. They must be re-estimated on fresh
exploration data before any freeze.

## 1. The primary test

| item | value |
|---|---|
| primary endpoint | **top-choice unsafe rate**: the share of validation classes whose first-ranked decision set introduces a catastrophe against S0 or Nexus-else-S0 in at least one member world, at full coverage, no abstention |
| comparison | paired, on the same fresh classes: proposed H-DISC policy against the frozen SK1 forced choice |
| hypothesis | H0: the H-DISC rate is not lower than SK1's. H1: it is lower |
| test | one-sided exact sign (McNemar) test on discordant classes, α = 0.05 |
| reported interval | origin-family cluster bootstrap of the paired difference, same generator as the frozen evaluator |
| unit | a class; effective classes = classes ÷ design effect |

Why this endpoint: it is the union introduction event that Contract A counts, measured on every class, and it is the
quantity the failure mechanism acts on.

## 2. Planning inputs

| input | measured value | planning value |
|---|---|---|
| SK1 top-choice unsafe rate | 6.5% validation; 6.3% out of bag; 7.3% out of fold | 6.5% |
| association of two public policies' failures on the same classes (C10 and SK1, validation) | 22 both, 62 only C10, 17 only SK1; φ = 0.32 | independence (conservative); φ = 0.32 shown |
| design effect of one policy's failure indicator | 1.15 validation; 1.31 out of bag | — |
| design effect of a **paired** failure difference (C10 − SK1) | 1.46 | **1.5** |
| origin families | 57 exploration + 46 validation = 103 | supply to be re-checked |

Two corrections to earlier planning figures, stated plainly:

- The design effect of 1.11 quoted in SK1.1 and SK2-F came from a formula that ignores unequal family sizes. With that
  accounted for, and measured on a paired difference, it is about 1.5.
- SK2-F's "about 600 classes for a halving" was a normal approximation at design effect 1.11. The exact calculation
  below does not support it under conservative assumptions.

## 3. The 600-class assumption, examined

Exact power to detect a **halving** of the top-choice unsafe rate (6.5% → 3.25%) with 600 validation classes:

| design effect | independent failures | failures associated as observed (φ = 0.32) | candidate fails only where SK1 fails |
|---|---|---|---|
| 1.0 | 0.81 | 0.92 | 1.00 |
| 1.11 | 0.77 | 0.90 | 1.00 |
| **1.5 (planning)** | **0.64** | **0.79** | 1.00 |
| 2.0 | 0.52 | 0.66 | 0.97 |

**Verdict: not supported under conservative assumptions.** Six hundred classes reach 80% only if clustering is small
*and* the two policies' failures are positively associated. At the planning design effect the smallest reduction
detectable with 80% power is 59% under independence and 51% under the observed association.

Sensitivity to the baseline, at design effect 1.11 and independence: 0.69 if SK1's rate is 5.5%, 0.77 at 6.5%, 0.81 at
7.3%.

## 4. Power by effect size at 600 classes

| relative reduction | 30% | 40% | 50% | 60% | 70% |
|---|---|---|---|---|---|
| independent, design effect 1.5 | 0.28 | 0.45 | 0.64 | 0.82 | 0.93 |
| associated, design effect 1.5 | 0.36 | 0.58 | 0.79 | 0.93 | 0.99 |
| independent, design effect 1.11 | 0.36 | 0.56 | 0.77 | 0.91 | 0.98 |
| associated, design effect 1.11 | 0.47 | 0.71 | 0.90 | 0.98 | 1.00 |

## 5. Validation classes needed for 80% power

| relative reduction | independent, design effect 1.5 | associated, design effect 1.5 | independent, design effect 1.11 |
|---|---|---|---|
| 30% | 2,679 | 1,869 | 1,983 |
| 40% | 1,452 | 1,008 | 1,075 |
| **50%** | **881** | 620 | 652 |
| 60% | 575 | 411 | 426 |
| 70% | 396 | 294 | 294 |

## 6. Recommended scale

| | proposed in the mandate | recommended here |
|---|---|---|
| exploration classes | 1,000 | 1,000 |
| validation classes | 600 | **900** |
| holdout classes | 0 | 0 |
| total | 1,600 | 1,900 |

Rule used: the smallest validation size, rounded up to 50, with at least 80% exact power for a halving under
independent failures at the planning design effect.

| power for a relative reduction of | 40% | 50% | 60% |
|---|---|---|---|
| 900 classes, independent | 0.61 | **0.81** | 0.94 |
| 900 classes, associated | 0.76 | 0.92 | — |
| 600 classes, independent | 0.45 | 0.64 | 0.82 |
| 600 classes, associated | 0.58 | 0.79 | 0.93 |

Both scales are planning values, not permission to allocate or generate. If the owner holds validation at 600, the
pre-registered effect should be a **60% reduction**, not a halving, and that should be said in advance.

Feasibility: SK1 admitted 2,298 classes from 26 screened blocks and used 1,600, so 1,900 is within one generation
effort of the same size. Two supply checks are required before a freeze:

- **Origin families.** 103 were seen in SK1. A family-disjoint split giving 900 validation classes needs roughly half
  of them on the validation side, with at least 30 families and no family above 5% of validation.
- **Fresh blocks.** All of 801–837 and 901–914 are spent or retired.

## 7. Relative improvement is not qualification

Contract A requires zero introductions on every class. A statistically supported halving does not approach that.

| true top-choice unsafe rate | probability of observing zero introductions in 600 classes |
|---|---|
| 6.5% (SK1) | 0 |
| 3.25% (a halving) | 0 |
| 1% | 0.002 |
| 0.5% | 0.05 |
| 0.2% | 0.30 |
| 0.1% | 0.55 |
| 0.05% | 0.74 |

Even odds of observing zero in 600 classes need a true rate of about 0.12%; an 80% chance needs about 0.04%. A policy
that halves SK1's rate would be a **supported relative improvement that is NOT_QUALIFIED**. The pre-registration must
say so before the result exists.

## 8. Absolute gates, preserved unchanged

Evaluated and reported for the H-DISC policy exactly as for SK1; none is relaxed.

| gate | requirement |
|---|---|
| introductions against S0 | 0 |
| introductions against Nexus-else-S0 | 0 |
| illegal actions | 0 |
| normalised-regret improvement against each comparator | at least 0.02, one-sided 95% family-clustered upper bound below 0 |
| complete decision coverage | every admissible class receives a legal action |
| identity and geometric invariance | 0 violations |
| deterministic replay | required |
| compute | median at most 100 ms, maximum at most 1,000 ms per decision |

The selective contract remains a separate draft, neither adopted nor certified, and plays no part in this plan.

## 9. Secondary and mechanism endpoints

One primary test. Everything else is secondary, Holm-adjusted within its family, and labelled as such.

| family | endpoints | note on precision |
|---|---|---|
| comparator-specific safety | introductions against S0; against Nexus | fewer events than the union; lower power |
| severity | top-choice catastrophe rate; classes failing against both comparators | — |
| regret | mean normalised regret against S0, Nexus, C10 and SK1; non-inferiority to SK1 within 0.02 | large margins against the comparators (SK1: 0.22 against 0.56 and 0.62) |
| pairwise | share of safe–unsafe pairs correctly ordered, overall, same type, different type | about 8,000 pairs in 600 menus, but precision is governed by roughly 500 menus in about 46 families, not by the pair count |
| top-of-list | menus where the first-ranked action is unsafe although a safe action exists; worst-case ordering failures | — |
| consistency | share of pairs withheld as inconsistent; share of menus with a cycle; share with a cycle at the top | descriptive |
| rescue and harm | among classes where frozen SK1's choice fails: share H-DISC gets right; among the rest: share H-DISC breaks | about 39 SK1-failure classes expected in 600, 59 in 900; a rescue rate is known only to about ±13 points |
| generalisation | every endpoint by origin family; all validation families are unseen by construction | descriptive |
| twin sensitivity | whether the decision set and the ranking are identical across public-equivalent hidden twins (they must be: the input is identical); share of failures on twin worlds only | identity audit on every class |

**Mechanism attribution** (the ablation ladder in the pre-registration draft) compares adjacent arms with the same
paired test. At 900 classes those contrasts are powered only for large effects, so three outcomes are declared in
advance: SUPPORTED, NOT_SUPPORTED, and **UNRESOLVED** when the interval includes both zero and half the total effect.
An unresolved attribution is not a negative finding.

## 10. Rules that protect the inference

- One validation pass. No interim look, no candidate replacement, no threshold change afterwards.
- Model, features, hyper-parameters and every tunable rule are chosen on exploration data by rules fixed in the
  pre-registration.
- Design effect and baseline are re-estimated on fresh exploration data; the validation size is fixed before
  validation classes are generated.
- The 83 H-W4 failures and the 39 SK1 failures informed the design and are not validation material.
- Exploration and validation are origin-family-disjoint.

```
STATISTICAL_POWER_PLAN=paired exact sign test on the top-choice unsafe rate vs frozen SK1; 600 validation classes give 0.64 (independent) to 0.79 (associated) power for a halving at design effect 1.5; 900 recommended (0.81 / 0.92); relative improvement is not qualification
```
