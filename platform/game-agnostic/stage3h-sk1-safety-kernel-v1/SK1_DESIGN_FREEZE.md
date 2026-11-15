# STAGE 3H-SK1 — Design and experiment freeze

AUTHORITY: R0 (observation and recommendation only) · BASE HEAD: `966f6eb3` · written and committed **before any fresh
SK1 world is generated**. Nothing below may be changed after the namespace allocation is frozen. One policy, one
validation pass, no candidate replacement. A negative result does not authorize another campaign.

## 1. What is being tested

One policy: `SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1` with the model `SK1_FORGE_PRIMARY_V1`, produced by
`infra/train.mjs` from the fresh EXPLORATION population by the rules in section 4. A second model,
`SK1_FORGE_NO_EVIDENCE_V1`, is an ablation used for one diagnostic comparison only.

Question: on fresh, exclusion-clean DEV classes from origin families never used in development, does a public-only
kernel that ranks the complete lawful menu under an explicit risk criterion select materially safer actions than the
frozen comparators and the frozen H-W4 policy C10 — and can it meet the absolute qualification contract?

## 2. Information the runtime policy receives

- **Observation contract** `STAGE3H_PUBLIC_DECISION_INFORMATION_V1` / `HW1_PUBLIC_PROJECTION_V1`: the identity-free public
  projection (lane-local derivation `adapters/forge/projection.mjs`, byte-equivalent to the frozen H-W1 projector).
- **Legal menu**: every lawful native action with its declared public preconditions, effects, cost and destination.
- **Advisory evidence** `SK1_ADVISORY_EVIDENCE_V1`, as permitted by the H-W1 comparator-input rule: S0's public score per
  action and its top set; Nexus's recommendation projected to its **action type**, with rationale codes and reason.
  The specific action Nexus names is not used (its tie-break is identity-dependent).
- **Never**: evaluator truth, regret, catastrophe labels, world hashes, seeds, hidden health or value, privileged
  rollouts, entity ids, action handles, menu position. A request carrying such a field is rejected.

## 3. Fixed design (not tuned)

| element | value |
|---|---|
| Component A | only hard constraints that are publicly established and deterministic exclude an action; everything else is an annotation |
| estimator | `SK1_BAGGED_BOOSTED_TREES_V1`: 10 bags × 100 trees, depth 3, learning rate 0.1, minimum leaf 20, λ 1, ≤ 32 bins; each bag is a bootstrap of origin families |
| risk target | the action is catastrophic (regret ≥ 100) in **at least one** member world of the public-equivalence class |
| regret target | member-mean normalised regret |
| uncertainty | upper bound = mean + 1 × standard deviation across bags + 0.05 per numeric feature outside the development envelope, clamped to [0, 1] |
| unsupported estimates | missing public feature; categorical value never seen in development; evidence absent or invalid — no estimate is produced |
| ranking contract | `SK1_TIERED_RISK_THEN_REGRET_V1`: public constraints → support → risk tier = floor(upper bound / tierWidth) → expected regret → upper bound |
| ties | actions exactly equal on every criterion are returned together as one decision set and are evaluated as a set (worst case for catastrophe) |
| abstention | if the best selectable action is unsupported or its upper bound exceeds τ, nothing is recommended |
| folds | 5, grouped by origin family |

## 4. Tuned from EXPLORATION only, by fixed rules

- **T1 — tierWidth ∈ {0.1, 0.2, 0.3, 1.0}.** Choose the value with the fewest out-of-fold forced-choice introductions
  (against S0 plus against Nexus-else-S0). Ties: lower mean nreg, then larger tierWidth.
- **T2 — τ ∈ {0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0}.** Choose the largest τ at which the
  out-of-fold **decided** classes show zero introductions with coverage ≥ 0.10. If none exists, choose the τ with the
  lowest introduction rate among decided classes with coverage ≥ 0.25 (ties: larger τ).
- Nexus rationale-code and reason vocabularies, the feature envelope, the calibration table and the set of seen
  categories are taken from EXPLORATION.

The trainer refuses to run unless the VALIDATION outcome files are locked and no result exists.

## 5. Populations

- Reserve: blocks 801–812 and 814–837 (36 blocks), screened strictly in order (prefix rule) until both targets are met
  or the reserve ends. Block 813 was rejected by the fail-closed preflight (repository text hit) and is not used. The
  decision to stop screening uses pool counts only. A block is spent when its worlds are generated.
- Exclusions: `infra/exclusion-registry.json`, loaded fail-closed by every stage — 77 forbidden blocks (including
  901–910 spent and 911–914 retired), 7 sealed registries, the strict structured index. Admission is decided before
  any truth is computed. The frozen H-W1 screening rule and class builder are used unchanged.
- **Origin-family separation.** `SK1_FAMILY_SPLIT_V1` assigns every family to exactly one population by a hash rule.
  No family appears on both sides. Coarse public classes are de-duplicated across both populations.
- Targets: EXPLORATION 1,000 (minimum 600), VALIDATION 600 (minimum 300), HOLDOUT 0. Family cap 5% of target.
  Selection is the admission order; unfavourable classes are never replaced.
- If a population is below its minimum after the whole reserve, Gate 4 is blocked. Between minimum and target the
  experiment proceeds and the shortfall is reported.
- Tracked records use opaque aliases (`SK1E-nnnn`, `SK1V-nnnn`). Seeds and world hashes stay in gitignored files.

## 6. Policies compared (identical observations, menus, evaluator, populations)

A. frozen S0 · B. frozen Nexus-else-S0 · C. frozen H-W4 C10 (`41ce761c…5858e`, V1 arm) · D. Safety Kernel V1.
Evaluator definitions are the frozen H-W1 ones, unchanged. Uncertainty: origin-family cluster bootstrap, 10,000
resamples, seed `HW1_CLUSTER_BOOTSTRAP_V1`.

## 7. Primary gates — evaluated on the policy **as specified**

Zero introductions against S0; zero against Nexus-else-S0; zero illegal actions; mean nreg improvement ≥ 0.02 against
each comparator with one-sided 95% family-clustered upper bound < 0; identity and geometric invariance (zero violations
over relabel, menu-order, lawful D4 and public-equivalent hidden twins, with expert evidence re-computed on every view);
deterministic replay; compute budget (median ≤ 100 ms, maximum ≤ 1,000 ms per kernel decision); **complete decision
coverage**. An abstention is never a success: any abstention fails the coverage gate.

The same gates are also computed for the **forced choice** (the kernel's top-ranked set on every class). That reading
is diagnostic; it cannot produce classification A.

## 8. Reported without replacing the primary gates

Paired introduction and catastrophe differences against C10; risk calibration (bins, Brier, AUROC); worst-case regret;
action-family and base/twin distribution of failures; uncertainty quality (does the bound identify failing classes;
selective introduction counts by coverage; failures among abstained versus decided); abstention frequency and reasons;
behaviour on out-of-envelope observations; the evidence ablation.

## 9. Classification rule (fixed)

- **D** — a required execution gate fails (allowlisted reads, poisoned-view identity, audit legality, D4 feature
  invariance, every test exercised, negative controls detected, audit covers every class, class count ≥ 300, freeze
  intact, population clean).
- **A** — execution valid and every primary gate passes as specified.
- **B** — not A, and on the forced choice all of: the regret gate passes against both comparators; the paired
  introduction-rate difference against C10 has a two-sided 95% family-clustered interval entirely below zero for at
  least one comparator and not entirely above zero for the other; zero illegal actions; identity holds.
- **C** — otherwise.

A policy with fewer catastrophes but any introduction is NOT_QUALIFIED. No finite DEV result proves universal safety.

## 10. Development disclosure

- **Design fixture.** The estimator, features and tuning code were developed on the 517 spent H-W4 EXPLORATION
  (training) classes that fall in exploration-side families, with evidence regenerated from their public views. H-W4
  VALIDATION was never used for development.
- **What was tried there.** Risk targets (any-member catastrophe, member rate, comparator-relative introduction,
  worst-member regret) and several selection rules. Out of fold, every variant gave 53–71 total introductions of 517
  with about ±5 seed-to-seed variation; none was separable. The any-member catastrophe target was kept on principle.
  The same data showed the uncertainty bound carries signal (2 failing classes in the most confident quarter, 41 overall).
- **Gate 1.** The failure attribution of the 83 spent H-W4 introduction classes is diagnostic. It did not set any
  feature, hyper-parameter or threshold. It is consistent with three design elements that were already present:
  comparator evidence (42 of 65 Nexus failures were S0's own action), a robust any-member risk target (hidden state
  decides the outcome in 65 of 83), and risk ahead of expected regret in the ranking.
- **Expectation, stated in advance.** The development evidence does not suggest that zero introductions with complete
  coverage is within reach. The experiment is run to measure what public information supports, not on the expectation
  of qualification.

## 11. Limits

DEV only; Forge World under one observation contract; a population screened to stress the comparators; validation on
origin families unseen in development. Population generation and evaluation need the custody-protected comparator
sources and are not reproducible from a clean checkout; the kernel inference graph is. No independent backup exists.
