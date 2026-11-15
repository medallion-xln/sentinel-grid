# SK2 research proposal — next scientific hypothesis after SK1

AUTHORITY: R0 · BASE HEAD `179922dd` · status: **PROPOSAL ONLY. Nothing here is authorized, generated, trained or run.**

## 1. Recommendation

**Primary next hypothesis: D — `SELECTIVE_ASSURANCE_RESEARCH`.**

> **H-SK2.** A public-only selective recommendation policy, whose acceptance rule is derived on development data to
> target the *gated event* (a catastrophe introduction against a comparator), satisfies Contract B on fresh,
> family-disjoint DEV validation: at least 40% decision coverage, with a one-sided 95% upper bound of at most 1% on the
> introduction rate among exposed accepted decisions, separately against S0 and against Nexus-else-S0.

The numbers are the values proposed in `SK1_SAFETY_CONTRACTS.md`; the owner sets the final ones before any freeze.
H-SK2 is falsified if any Contract B gate fails on the single validation pass. It says nothing about Contract A, which
stays unmet and unchanged.

## 2. Why D: the evidence

All from the spent SK1 validation population (`SK1_RISK_COVERAGE_ANALYSIS.md`, `SK1_FAILURE_ATTRIBUTION.md`).

| finding | value |
|---|---|
| forced-choice failure rate, accepted vs abstained | 0.66% (2/304) vs 12.5% (37/296) |
| failing classes withheld by abstention | 37 of 39 |
| bound separates failures over all classes | AUROC 0.83; failures rise monotonically with the bound |
| gain over C10 on the *same* accepted classes | 2 vs 10 failing; paired difference −0.026 [−0.042, −0.012] |
| risk estimate calibration | ECE 0.026; conservative for selected actions (32.3 expected vs 7 observed) |
| the two accepted failures | accepted at stated bounds of 14.7% and 17.4%; stable under bag removal |
| development predicted validation | out of fold at the frozen threshold: 3 failing of 434 accepted (0.69%); validation: 2 of 304 (0.66%) |

The reading: the kernel has a working, conservative confidence signal. It failed Contract A for a structural reason —
its acceptance rule tolerated up to 20% estimated catastrophe risk while the gate demanded zero introductions — and
because zero introductions at full coverage was not in reach in development either. What the evidence supports
investigating is whether that signal can deliver a *stated, verified* risk level at a *stated* coverage. That is a
selective-assurance question. The selective failure rate was also predictable in advance: development and validation
agree at about 0.7%.

## 3. Rejected alternatives

| option | verdict | why |
|---|---|---|
| A — risk-estimation research | not primary | Its premise is systematic miscalibration, and none is observed: estimates are calibrated and err on the pessimistic side. The real estimator weakness is within-menu *ordering* (in 34 of 39 failing classes the bound ranks the unsafe choice below every safe alternative), which is discrimination, not calibration. No evidence shows a better public estimator exists: every variant tried on the SK1 development fixture left 53–71 introductions of 517. Worth keeping as a secondary track, not as the next campaign. |
| B — ranking research | rejected | The ranking contract selected poorly given the estimates in 5 of 39 failing classes, none of them accepted. In both accepted failures the ranking followed the risk bound faithfully; no ranking change would have removed them. |
| C — public-information limitation | rejected as stated | Not demonstrated. A safe action exists in all 600 classes, and members of a class share one public state, so a public-state-measurable choice with no introduction exists for every sampled class. What is unresolved is whether such choices can be *learned* and generalised from features — an estimation question, not an information bound. Hidden-state dependence is demonstrated only for the outcome of a given action (33 of 39). |
| E — blocked by provenance | not blocking, but a precondition | See section 6. |

If the feasibility step in section 5 fails, the primary hypothesis should be reconsidered in favour of estimator
discrimination research (the A-adjacent track above), not pursued by loosening thresholds.

## 4. What SK2 would be

Design sketch only. Every item needs its own pre-registration and authorization.

- **Identity.** A new source and model identity, for example `SENTINEL_SELECTIVE_ASSURANCE_POLICY_SK2_V1`. Not SK1, not
  the `V1_1_CANDIDATE` kernel name reserved in `SK1_ENGINEERING_ASSURANCE.md` (which could be its base).
- **Target the gated event.** SK1 estimated "catastrophic in some member" and was gated on "introduces against a
  comparator". SK2's acceptance score must estimate the gated event, per comparator.
- **Derive the acceptance threshold by a risk-controlling procedure** on a calibration population disjoint from both
  fitting and validation data, with the tolerance r as its input. The threshold is an output of that procedure, never
  a hand-set constant and never read from spent validation outcomes. In particular the descriptive "first failure at
  bound 0.1475" on SK1 validation must not be used.
- **Abstention semantics, exposure-based denominators, matched-cohort reporting, failure disclosure** exactly as
  Contract B specifies.
- **Engineering base.** The hardened envelope and the findings F1–F9 from Phase 6; fixes F3–F5 change behaviour and
  belong in the new identity.

Populations, all fresh, pairwise origin-family-disjoint, allocated through `successor/exclusions-v2.mjs`:

| population | purpose | indicative size | why |
|---|---|---|---|
| EXPLORATION | fit estimators | about 1,000 classes | as SK1 |
| CALIBRATION | derive the threshold | about 800–1,000 | the threshold procedure itself needs a few hundred accepted decisions to control r = 1% |
| VALIDATION | one pass | about 1,400 | 473 exposed decisions (at most one introduction) × design effect 1.11 ÷ coverage 0.40 ≈ 1,315 |
| HOLDOUT | none | 0 | not authorized |

That is roughly 1.5 times SK1's generation effort (SK1 admitted 2,298 classes from 26 blocks). Two feasibility limits
must be checked before a freeze: fresh block supply, and **origin-family supply** — SK1 saw about 103 families in
total, and a three-way family-disjoint split with at least 30 families among accepted validation decisions is tight.

## 5. A feasibility step before any fresh campaign (SK2-F)

A fresh campaign should not be authorized on the strength of a spent validation curve. One step can be done first
without generating a world or touching SK1 validation:

- **Data:** the existing SK1 EXPLORATION population (1,000 classes, development data, lawful for development use).
  SK1 VALIDATION stays untouched.
- **Method:** out-of-fold by origin family, fit a gated-event score and a risk-controlled threshold inside each
  training fold, and measure selective introduction rate and coverage on the held-out fold.
- **Go / no-go, fixed here in advance:** proceed to a pre-registration only if the out-of-fold estimate shows at most
  one introduction among at least 400 accepted decisions (coverage ≥ 0.40), against each comparator. This follows from
  the power table in `SK1_SAFETY_CONTRACTS.md`: at 500–700 exposed decisions a policy with a true rate near 0.2% passes
  r = 1% about three times in four, and one near 0.7% about one time in eight.
- **Known adverse prior, disclosed:** the SK1 score does not meet that bar. Its tracked training record shows 3
  failing of 434 accepted out of fold at the frozen threshold (0.69%, coverage 43%), and validation then showed 2 of
  304 (0.66%). Development predicted validation closely, which is good news for the *method* and bad news for the
  *level*: SK1's selective failure rate is about 0.7%, roughly three times too high for r = 1% at feasible sample
  sizes. H-SK2 therefore depends on the gated-event score being materially better than SK1's catastrophe score. SK2-F
  tests exactly that before any fresh block is spent. If it fails, the hypothesis is not supported at r = 1%.
- **Limit:** anything developed on SK1 EXPLORATION is development evidence only and must still be validated on fresh
  classes.

SK2-F is itself unauthorized until the owner says so.

## 6. Provenance: precondition, not the primary hypothesis

See `SK1_REPRODUCIBILITY_GAP.md` for the full record. In summary:

| fact | consequence |
|---|---|
| Kernel inference, its tests, the demonstration and the SK1.1 analysis reproduce from committed source | the R0 prototype and this lane's analysis are portable |
| Evaluation needs 29 custody-protected files that are in no commit | no second machine can re-check a result |
| The committed SK1 result binds an **uncommitted** edit of `stage3h-hw1-dev-v1/public-projection.mjs` | the only copy of content the result depends on is one working-tree file |
| The exclusion loaders do not link from committed source alone | exclusions are enforced in this working tree, not in a clean checkout |
| No independent backup exists | one disk failure makes every Stage 3H evaluation unreproducible |

Why this is a precondition and not option E: custody is intact, not broken. All 31 protected identities match, the
guards are in place, the SK1 freeze still describes the disk, and check mode reproduces every committed result section
locally. What is missing is redundancy and one commit. Recommended ordering:

1. Create and restore-test an independent backup (owner action; needs approved external storage).
2. Decide whether to commit the import cut as its own separately scoped change. It would change no SK1 hash, because
   the freeze already binds that content.
3. Only then consider authorizing SK2-F.
4. A fresh SK2 campaign should record an evaluation-source manifest at freeze time, as SK1 did, and should not be
   frozen against any uncommitted file.

## 7. What is not proposed

- No new policy was trained, no population generated, no validation or holdout run in SK1.1.
- No change to Contract A, to SK1's frozen parameters, model or results, or to any predecessor verdict.
- No authority change. SK2, if ever run and satisfied, would still be R0 shadow-mode advice.
- No relaxation of thresholds in response to a negative feasibility result.

## 8. Exact owner decisions required

1. Accept or reject D as the primary next hypothesis.
2. Decide whether to adopt Contract B as a contract, and fix r, γ, c_min and the abstention disposition.
3. Provide approved backup storage so an independent, restore-tested copy can be made.
4. Decide whether the uncommitted import cut is committed as a separately scoped change.
5. Authorize, or decline, the no-new-worlds feasibility step SK2-F.

Nothing follows automatically from any of these.
