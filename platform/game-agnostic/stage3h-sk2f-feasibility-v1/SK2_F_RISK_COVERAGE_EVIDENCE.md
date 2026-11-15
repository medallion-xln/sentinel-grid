# STAGE 3H-SK2-F — Risk-coverage evidence

AUTHORITY: R0 · BASE HEAD `16ae5c21` · **every figure in this document is POST_HOC_EXPLORATORY_ONLY**

Machine records: `evidence/SK2F_EXPLORATION_MATRIX.json` (1,000 exploration rows),
`evidence/SK2F_FEASIBILITY.json` section `riskCoverage`.

No point on any curve here is a qualified or proposed operating point. The only acceptance rule ever applied by the
policy is the frozen one: recommend when the top-ranked action's risk bound is at most 0.2. Nothing was trained.

## 1. The four readings and how far to trust each

| reading | built from | bias | per-class data |
|---|---|---|---|
| **Out of fold** | the trainer's own record, written before validation was opened: five family-grouped folds, each scored by a model fit on the other four | honest for the method; fold models saw 80% of the data | aggregate only, at eleven thresholds |
| **In sample** | the frozen model applied to the 1,000 classes it was fit on | optimistic (resubstitution) | yes |
| **Out of bag** | for each class, only the bags whose family bootstrap never drew that class's origin family | pessimistic about the frozen rule: 3.5 bags per class on average instead of 10, each fit on about 63% of families; and it accepts more classes, because a spread over few bags is smaller | yes, for 875 classes |
| **Historical validation** | the spent one-pass result | none, but spent | yes |

How the out-of-bag reading was obtained without training: each bag's family bootstrap was re-derived from the seeded
generator the trainer used, and verified against that bag's stored base value. All 20 bags (10 risk, 10 regret) match
exactly. No tree was refitted. 125 classes have fewer than two out-of-bag risk bags and are excluded from that reading.

The truth about the frozen rule on unseen families lies between the in-sample and the out-of-bag readings. The
out-of-fold record and the historical validation agree with each other inside that range.

## 2. At the frozen rule

| | out of fold | in sample | out of bag | historical validation |
|---|---|---|---|---|
| eligible classes | 1,000 | 1,000 | 875 | 600 |
| accepted | 434 | 489 | 450 | 304 |
| coverage | 43.4% | 48.9% | 51.4% | 50.7% |
| forced-choice failing classes, all | 73 | 57 | 55 | 39 |
| forced-choice failure rate at full coverage | 7.3% | 5.7% | 6.3% | 6.5% |
| failing classes withheld by abstention | 70 | 54 | 47 | 37 |
| failure capture | 95.9% | 94.7% | 85.5% | 94.9% |
| failing classes accepted | 3 | 3 | 8 | 2 |
| withheld although no introduction was observed | n/r | 457 | 378 | 259 |
| selective failure rate | 0.69% | 0.61% | 1.78% | 0.66% |

"Withheld although no introduction was observed" is not "safe but withheld": the observation covers sampled member
worlds only, and an abstention is not a safe outcome either.

## 3. Coverage against empirical introduction rate

Classes ordered by the top action's bound. Columns: classes accepted, union failing classes, rate, exact upper 95%.

**Exploration, out of fold (the trainer's threshold grid):**

| bound at most | accepted | coverage | union failing | rate | exact upper 95% |
|---|---|---|---|---|---|
| 0.10 | 78 | 7.8% | 0 | 0 | 3.77% |
| 0.15 | 243 | 24.3% | 1 | 0.41% | 1.94% |
| **0.20 (frozen)** | **434** | **43.4%** | **3** | **0.69%** | **1.78%** |
| 0.25 | 563 | 56.3% | 10 | 1.78% | 2.99% |
| 0.30 | 701 | 70.1% | 25 | 3.57% | 4.95% |
| 0.40 | 855 | 85.5% | 49 | 5.73% | 7.22% |
| 0.50 | 970 | 97.0% | 66 | 6.80% | 8.29% |
| 1.00 | 1,000 | 100% | 73 | 7.30% | 8.80% |

**Per-class readings, by coverage decile:**

| coverage | in sample: failing / rate | out of bag: failing / rate | historical validation: failing / rate |
|---|---|---|---|
| 10% | 0 / 0 | 0 / 0 | 0 / 0 |
| 20% | 1 / 0.50% | 0 / 0 | 0 / 0 |
| 30% | 1 / 0.33% | 2 / 0.76% | 1 / 0.56% |
| 40% | 1 / 0.25% | 3 / 0.86% | 2 / 0.83% |
| 50% | 3 / 0.60% | 8 / 1.83% | 2 / 0.67% |
| 60% | 7 / 1.17% | 13 / 2.48% | 4 / 1.11% |
| 70% | 12 / 1.71% | 19 / 3.10% | 8 / 1.90% |
| 80% | 23 / 2.88% | 32 / 4.57% | 14 / 2.92% |
| 90% | 35 / 3.89% | 43 / 5.46% | 26 / 4.81% |
| 100% | 57 / 5.70% | 55 / 6.29% | 39 / 6.50% |

What the curves support:

1. **The shape is stable.** In every reading the rate is near zero for the most confident fifth, stays below 1% to
   roughly 40–50% coverage, then climbs steeply. The bound orders risk on exploration as it did on validation.
2. **Greater coverage is not available at this risk level.** Moving from about 43% to 56% coverage out of fold takes
   the rate from 0.69% to 1.78%. There is no reserve of low-risk classes beyond the frozen point.
3. **Less coverage does not buy the bound either.** No prefix of any curve has an exact upper 95% bound at or below
   1%: the samples are too small. The longest failure-free prefixes are 120 classes in sample, 235 out of bag and 170
   on validation, with upper bounds of 2.5%, 1.3% and 1.7%.
4. **Largest coverage at which the point rate stays at or below 1%:** 58.6% in sample, 40.8% out of bag, 58.2% on
   validation. These are descriptions, not operating points, and the first and last are optimistic or spent.

## 4. Score distributions (out of bag, exploration)

| top-ranked action | accepted (450) | abstained (425) | forced-choice failing (55) | accepted failing (8) |
|---|---|---|---|---|
| estimate, median | 0.113 | 0.249 | 0.259 | 0.149 |
| estimate, 10th–90th percentile | 0.064–0.156 | 0.182–0.400 | 0.157–0.434 | 0.096–0.179 |
| bound, median | 0.135 | 0.302 | 0.302 | 0.176 |
| bound, 10th–90th percentile | 0.080–0.186 | 0.218–0.464 | 0.181–0.494 | 0.138–0.188 |

Margin to the criterion among accepted decisions: median 0.065, tenth percentile 0.014. The eight accepted failures sit
in the upper part of the accepted range (bounds 0.138–0.188) but are not separated from the 442 accepted non-failures.

## 5. Variation

**Action family** (top action, out of bag):

| type | classes | accepted | forced-choice failing | accepted failing |
|---|---|---|---|---|
| MOVE | 650 | 338 | 43 | 6 |
| RETREAT | 74 | 42 | 7 | 2 |
| RESTORE | 70 | 20 | 3 | 0 |
| BYPASS | 23 | 20 | 0 | 0 |
| PROTECT | 22 | 10 | 2 | 0 |
| REPAIR | 21 | 10 | 0 | 0 |
| REINFORCE | 15 | 10 | 0 | 0 |

Failures are concentrated in MOVE and RETREAT, as on validation (33 and 5 of 39).

**Origin family:**

| | in sample | out of bag | historical validation |
|---|---|---|---|
| families | 57 | 51 | 46 |
| with any forced-choice failure | 29 | 26 | 26 |
| with an accepted failure | 3 | 6 | 2 |
| with no accepted class | 3 | 2 | 2 |
| acceptance rate across families, 10th–90th percentile | 17%–82% | 22%–82% | 17%–76% |
| forced-choice failure rate across families, maximum | 27% | 25% | 33% |

Roughly half of all families contain at least one forced-choice failure; accepted failures are spread across
different families rather than piled in one.

**Horizon (H0 / H2): NOT_ESTIMABLE.** Every exploration and validation class is H2 by construction of the SK1
schedule. No H0 evidence exists for this policy.

## 6. Distribution-shift indicators, exploration against validation

| indicator | exploration | validation |
|---|---|---|
| origin families | 57 | 46, none shared |
| menu size, median (range) | 9 (5–14) | 9 (5–14) |
| top-action bound, quartiles | 0.137 / 0.204 / 0.301 in sample; 0.135 / 0.196 / 0.296 out of bag | 0.137 / 0.198 / 0.289 |
| Kolmogorov–Smirnov distance of the bound | — | 0.044 from in sample; 0.047 from out of bag |
| acceptance rate | 43.4% out of fold; 48.9% in sample; 51.4% out of bag | 50.7% |
| forced-choice failure rate | 7.3% out of fold; 5.7% in sample; 6.3% out of bag | 6.5% |
| classes with the top action outside the numeric envelope | 0 by construction | 9 |
| categorical values never seen in development | 18 columns flagged at training | — |

Score-level shift between the two family-disjoint populations is small. No per-feature shift test was run, so this is
an indicator, not a guarantee of stability under larger shifts.

## 7. Limits

- The out-of-fold row is an aggregate; its comparator split and family structure are not available.
- The out-of-bag reading is a diagnostic estimator, not the frozen rule, and omits 125 classes.
- In-sample figures are optimistic and are shown only to bound the picture.
- Historical validation is spent and drives nothing here.
- Both populations were screened to stress the comparators; rates do not transfer to an unscreened distribution.
