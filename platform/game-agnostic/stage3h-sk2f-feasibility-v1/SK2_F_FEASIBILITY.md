# STAGE 3H-SK2-F — Selective safety feasibility

AUTHORITY: R0 · BASE HEAD `16ae5c21` · labels: READ_ONLY_DIAGNOSTIC, EXISTING_EVIDENCE_ONLY, NO_TRAINING, NOT_A_QUALIFICATION

Machine record: `evidence/SK2F_FEASIBILITY.json` (from `diagnostics/feasibility.mjs`, tracked evidence only).

## Result

**CLASSIFICATION: B — `SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED`.**
**NEXT SCIENTIFIC PRIORITY: `WITHIN_MENU_ACTION_RISK_DISCRIMINATION`.**

Scope of the verdict: the frozen SK1 policy, unchanged, against the research targets (selective risk at most 1%,
95% confidence, coverage at least 40%), at practical DEV sample sizes.

In one paragraph: the frozen rule's *point* failure rate is below 1% at more than 40% coverage, so the target is not
absurd. But no existing reading supports a 1% *upper bound*, and at the rate the evidence indicates (about 0.7%) a
prospective test would need about 6,400 accepted decisions — roughly 16,500 eligible validation classes, 27 times
SK1's validation population — to pass four times in five. The target is reachable only by a policy whose true rate is
near 0.2%, and SK1 is not that policy. What separates the two is not the abstention rule; it is which action the
kernel ranks first inside a menu.

Nothing was trained, re-thresholded, re-validated or generated. SK1 stays classification B, not qualified. The targets
were not weakened. No threshold is proposed.

## 1. Baseline preserved (Gate 0)

| quantity | value |
|---|---|
| validation classes / accepted / abstained | 600 / 304 / 296 |
| unique accepted introduction classes | 2 |
| comparator-relative accepted introductions | 3 (one class fails against both) |
| forced-choice failing classes / of them abstained | 39 / 37 |
| SK1 model hash | `b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b` |

Frozen identities verified before any analysis: validation results `239c16bc…`, experiment freeze `d22be2c4…`, model
file `683ce6e0…`, training record `0a20b72b…`, kernel source `55887443…`. SK1 check mode and the SK1.1 check modes pass.

## 2. The question, defined (Gate 1)

Three endpoints, kept separate:

| endpoint | definition |
|---|---|
| A — INTRODUCTION_VS_S0 | an accepted recommendation introduces a catastrophe relative to frozen S0 |
| B — INTRODUCTION_VS_NEXUS | the same relative to frozen effective Nexus-else-S0 |
| **C — UNION_INTRODUCTION (primary)** | an accepted class triggers A or B or both, counted once |

Three quantities that answer different questions:

| quantity | definition | answers |
|---|---|---|
| SELECTIVE_COVERAGE | accepted / eligible | how often does the advisory speak? |
| SELECTIVE_FAILURE_RATE | unique accepted introduction classes / accepted | when it speaks, how often is following it worse than a comparator? |
| FULL_POPULATION_INTRODUCTION_RATE | unique accepted introduction classes / eligible | how often does a kernel recommendation cause an introduction per decision faced? |

These endpoints are **not** the risk model's label. The model estimates "catastrophic in at least one member world";
an introduction additionally needs the comparator *not* to be catastrophic in that member. The model's calibration on
catastrophe (ECE 0.026) is therefore not evidence of calibration on introductions.

An abstention is the absence of a recommendation. It is never a safe native-world outcome; the full-population rate
above says nothing about what happens on abstained classes.

## 3. Evidence at the frozen rule (Gate 2)

Four readings. Only the first two are honest exploration evidence about the frozen rule; the third bounds it from the
pessimistic side; the fourth is history.

| reading | what it is | eligible | accepted | coverage | A | B | **C** | selective failure rate | full-population rate | exact upper 95% |
|---|---|---|---|---|---|---|---|---|---|---|
| Exploration, out of fold | trainer's record before validation; models never saw the scored fold | 1,000 | 434 | 43.4% | n/r | n/r | **3** | **0.69%** | 0.30% | **1.78%** |
| Exploration, in sample | frozen model on the classes it was fit on; optimistic | 1,000 | 489 | 48.9% | 0 | 3 | 3 | 0.61% | 0.30% | 1.58% |
| Exploration, out of bag | diagnostic: only bags that never drew the class's family; not the frozen rule; pessimistic | 875 | 450 | 51.4% | 2 | 8 | 8 | 1.78% | 0.91% | 3.18% |
| **Historical validation** | the spent one-pass result | 600 | 304 | 50.7% | 1 | 2 | **2** | **0.66%** | 0.33% | **2.06%** |

n/r: not recorded at that threshold. Per-class out-of-fold decisions were never persisted and cannot be recomputed
without training, so that row is an aggregate.

**Does any reading support a 1% upper bound? No.** Not one of the four, and not the descriptive pool of out-of-fold
plus validation (5 of 738, upper 95% 1.42%).

Historical reference, as mandated: 2 unique failures / 304 accepted, one-sided exact 95% upper bound **0.02056** under
independent Bernoulli assumptions. It does not satisfy the 1% requirement and is not a qualification pass.

### Coverage

Coverage clears the 40% target in every reading, including at the lower confidence limit: out of fold 43.4%
[40.3%, 46.5%]; validation 50.7% [46.6%, 54.7%] exact, [44.9%, 55.9%] family-clustered.

### Comparator endpoints and simultaneous claims

One claim on the union at 95% bounds both comparator endpoints, since each is a subset of the union. If the two were
claimed separately they would each need 97.5%. On historical validation that gives 1.82% against S0 and 2.36% against
Nexus; on exposure-adjusted denominators (sets that differ from the comparator's) 2.44% and 2.37%.

### Origin-family dependence

| reading | families among accepted | families with an accepted failure | family-cluster bootstrap upper 95% | estimated design effect |
|---|---|---|---|---|
| Exploration, in sample | 54 | 3 | 1.18% | 1.00 |
| Exploration, out of bag | 49 | 6 | 2.89% | 1.00 |
| Historical validation | 44 | 2 | 1.43% | 1.00 |

Disclosures:

- The exact bounds above assume independent decisions. That is optimistic if failures cluster by family.
- The design effect estimates to 1.00 here because there are too few events (2 to 8) to estimate any clustering; that
  is absence of evidence. On all 600 validation classes, with 39 events, it estimates to about 1.11.
- The cluster bootstrap is narrower than the exact bound with so few events and should not be preferred to it.
- Sensitivity of the validation bound: 2.06% at design effect 1, 2.29% at 1.11, 3.08% at 1.5, 4.08% at 2.
- Origin-family effective sample size is therefore between 304 and about 150 accepted decisions on validation.

### Finite-sample selection bias

- **Resubstitution.** On the same 1,000 exploration classes the frozen threshold accepts 489 in sample but 434 out of
  fold. An acceptance rule must be judged on classes its model never saw.
- **Threshold selection.** The frozen threshold was chosen from a grid by its out-of-fold rate, so 0.69% is a minimum
  over seven eligible grid points and mildly optimistic. Validation (0.66%) did not contradict it.
- **Outcome-chosen cutoffs.** A cutoff placed just before the first observed failure has no valid zero-event bound.
  A failure-free run of 170 classes, as seen on validation, would occur 30% of the time at a constant true rate of
  0.7%. POST_HOC_EXPLORATORY_ONLY.

## 4. Three-way verdict (Gate 3)

| question | answer | basis |
|---|---|---|
| POINT_ESTIMATE_FEASIBLE | **yes** | out of fold 0.69% at 43.4%; validation 0.66% at 50.7%. The pessimistic out-of-bag diagnostic (1.78%) does not agree |
| STATISTICAL_BOUND_FEASIBLE | **no** | no reading supports the bound; at a true rate of 0.7% the pass probability is 13% with 700 accepted decisions and 24% with 1,400 |
| PROSPECTIVE_QUALIFICATION_NOT_ESTABLISHED | **true** | nothing prospective was run, and nothing here could establish it |

The rule used for the second row, fixed in the script: feasible only if an existing reading already supports the bound
at the coverage target, or the eligible validation classes needed for 80% power at the planning rate do not exceed
3,000 (five times SK1's validation, more than SK1 admitted in total). The need is 16,456. The conclusion is the same
for any ceiling below that.

Sample sizes are in `SK2_F_SAMPLE_SIZE_PLAN.md`; curves in `SK2_F_RISK_COVERAGE_EVIDENCE.md`.

## 5. Abstention or ranking: which is the larger remaining problem?

**Ranking inside the menu.** Evidence in `SK2_F_ACTION_DISCRIMINATION.md`:

- Every forced-choice failure is an action-selection error, and about 87% are within-menu risk-ordering errors on both
  populations (34 of 39 on validation; 48 of 55 out of bag on exploration).
- **Every accepted failure is an ordering error**: 2 of 2 on validation, 8 of 8 out of bag, 3 of 3 in sample.
  None is a ranking-contract error.
- A safe action exists in every one of the 1,600 classes. If the first-ranked action were safe, there would be nothing
  for abstention to catch.
- Abstention already captures about 95% of failing classes at the frozen rule (96% out of fold in development, 95%
  on validation). Its residual is small in count and large in cost: on validation 2 false accepts against 259
  withheld choices with no observed introduction.

Abstention is doing its job as a mitigation. It cannot push the accepted failure rate from 0.7% to 0.2%, because the
residual failures are confident ordering errors that the acceptance score does not flag.

## 6. Infrastructure readiness, separately

See `SK2_F_REPRODUCIBILITY_STATUS.md`. Infrastructure is not the primary reason for classification B: the science
answer is negative on existing evidence regardless. It is a precondition for any later campaign.

## 7. What this does not say

- It does not say selective assurance is impossible. It says the frozen SK1 policy does not support the 1% / 95% / 40%
  target at practical sample sizes.
- It does not weaken the target, propose another threshold, or re-read the validation result as a pass.
- It does not show that a better within-menu ranker exists. That is the open question.
- Contract B is neither adopted nor certified. No new campaign is authorized.

## 8. Reproduce

```
cd platform/game-agnostic/stage3h-sk2f-feasibility-v1
node --test diagnostics/*.test.mjs
node diagnostics/feasibility.mjs check             # tracked evidence only
node diagnostics/extract-exploration.mjs check     # needs the SK1 class records in ../stage3h-sk1-safety-kernel-v1/work/
```
