# Stage 3F.6-P.1A-SYM — Free-Action Decision Sufficiency Audit

Certification `84770670baeb1502142e12d24a12d03763c0a97c22e80acc53013ecb98871fbb`
Analysis plan `407bb1c9b1648c15520f283d0fff7af930280aeccc634c34731a4c704a6021c5` · Freeze commit `c1708d7`
Candidate representation `ebf51671814598490b56623d3d4b9afa251a48a5766eb3e4f1e32beb141106ee` · State features `34b5d5c36ded31aee71f379fd17c7b3ebcea836d5cef79d036b211b7aa55d9e4`
Fresh confirmatory partitions (P.1D seeds 2023 / 2033) `8fde1f1245849e88b941044788d3a7cebe6b930837dce2e7b074a1c461c63840`, 12,000 records, generated at `c1708d7`

## The question

On FORGE_SYMMETRIC_V2, most decisions (87% of HOLDOUT states, 95% of OOD states) have an optimal zero-cost action.
Can Sentinel's current decision-time representation tell that action apart from the other zero-cost candidates?
The stage separates two hypotheses:

- **H1, policy limitation.** The information is already in the deployable state, and RESOURCE and the other
  policies fail to use it.
- **H2, representation limitation.** The deployable state does not carry the information.

This is a measurement stage. No policy, expert, Nexus version or router was changed, and Stage 3G was not begun.

## Answer

**PASS. The evidence supports H2, with one policy-logic exception.**

- The deployable state-only representation is `REPRESENTATION_INSUFFICIENT`.
- The deployable state+candidate representation is also `REPRESENTATION_INSUFFICIENT`, with `OOD_UNSTABLE`.
  - Its best simple, equivariant scorer beats RESOURCE by a material margin in distribution: 0.376 vs 0.303,
    +0.073 [0.054, 0.091].
  - On OOD the gain is +0.033 [0.016, 0.049], below the 0.05 bar.
  - It reaches only 0.38 top-1 in distribution and 0.29 on OOD.
- The same scorer, given the privileged positions of task entities, reaches **0.806** on HOLDOUT and **0.915** on OOD.
- A one-step successor prediction adds only +0.013.
- 98–99% of the remaining errors are separated by where the objective entity (58–64%) or the material and resources
  (36–38%) are.

**Summary: the free-action decision is limited by partial observability of task-entity positions, not by policy
logic and not by transition prediction.**

RESOURCE's apparent competence is confirmed to be a shortcut. RESOURCE is exactly the lowest-identity zero-cost
action on every eligible state. On HOLDOUT it scores 0.303, against 0.252 when identities are reversed. Its accuracy
is 0.39 higher in the two hidden orientations that keep EAST as EAST.

## Protocol

1. **Baseline.** HEAD `7ac6ae4`, `main`, clean, 18 commits ahead of `origin/main`. P.1C (`81586cbe`), P.1D
   (`afd0d6e6`), P.1E (`11dcf65b`), historical 3F.6-T (`5d6910dd`) and 3F.6-T-SYM (`edd46e40`) all reproduce
   byte-for-byte. `STAGE3F6-ERRATUM-001` is present.
2. **Open phase (DEV fit, CAL selection).** This fixed the headline STATE+CANDIDATE model, `SC_GEOMETRY_MAIN`: the
   highest CAL top-1 of the four predeclared variants. The fit is deterministic (replay hash `db686ef8…`).
3. **Dry run before the freeze.** The confirmatory code was exercised on CAL rows standing in for sealed data; no
   fresh row existed. This revised three rules before the freeze, and all three are disclosed in the plan:
   - `SHORTCUT_ONLY_GAIN` counts only shortcuts available at decision time.
   - The error taxonomy no longer treats "the deployable fields differ" as an error class.
   - An empty comparison is never material.
4. **Freeze (`c1708d7`).** Plan, open report and every evaluation file were frozen. The generator refused to run
   until they were committed. The certifier verifies that the fresh manifest was generated at `c1708d7` and that the
   evaluation files are byte-identical since then.
5. **Fresh partitions.** They use the last declared, unused P.1D seeds: HOLDOUT 2023 (levels 0–2 reached in
   canonical order) and OOD 2033 (levels 6–7). There is zero record, world or topology overlap with the 20,000-row
   lineage and the 12,000 T-SYM fresh rows. All 2,435 D4-twin symmetry checks equal 1.
   - Secondary replication used the T-SYM fresh partitions. Policy outcomes had been evaluated there before, but
     candidate models never had.
6. **Sealed evaluation.** It ran once, with no tuning.

## Eligible population

A state is eligible when a legal zero-cost action exists and the oracle-optimal set contains one. The candidates are
the legal zero-cost actions: MOVE (up to four directions), WAIT and RETREAT. RETREAT duplicates the MOVE that steps
away from the nearest hostile.

| | FRESH_HOLDOUT | FRESH_OOD | TSYM_HOLDOUT | TSYM_OOD |
| --- | --- | --- | --- | --- |
| eligible / rows | 5211 / 6000 | 5704 / 6000 | 5214 / 6000 | 5744 / 6000 |
| unique optimal zero-cost | 4120 | 4875 | 4093 | 4872 |
| multiple optimal zero-cost | 1091 | 829 | 1121 | 872 |
| mixed set (a costly action is also optimal) | 565 | 710 | 584 | 746 |
| mean zero-cost candidates | 5.11 | 5.25 | 5.11 | 5.26 |
| optimal type: MOVE only / MOVE+RETREAT | 4283 / 846 | 4888 / 753 | 4260 / 875 | 4906 / 769 |

WAIT is almost never optimal (24 HOLDOUT states).

## Feature audit

| Class | Features |
| --- | --- |
| DEPLOYABLE (12 candidate + 30 state) | action type (WAIT, RETREAT, COLLECT); MOVE vs legal RETREAT step (aligns, opposes, hostile geometry known); reverse MOVE legal; perpendicular MOVEs legal; destination Δ centre distance, on border, Δ border distance (observed actor cell + declared `gridSize = 8 + 2·level`); the 30 certified DEPLOYABLE_CORE state features |
| NON_EQUIVARIANT | absolute MOVE direction; action-identity rank |
| LEAKED | canonical-frame direction (the frame minimises a digest of the full kernel geometry) |
| ORACLE_ONLY | hidden base-frame direction; regret; optimal-set membership |
| UNAVAILABLE | kernel positions of the objective, material, resources, hostiles, threatened, critical and hub entities; stored `materialDirection` |
| FUTURE_STATE_REQUIRED | one-step successor immediate scalar |
| ROLLOUT_REQUIRED | horizon total (it determines regret exactly, so it is also leaked; never a column) |

Every deployable column passed the empirical audit:

- D4-twin equivariance is 1.0 on every partition (5,575 HOLDOUT pairs; 5,965 OOD pairs).
- Invariance under identity replacement and list reversal is 1.0.
- No single column separates optimal candidates at AUROC ≥ 0.99.
- Every value is finite.

## Results (top-1 = the chosen candidate is optimal; ties are uniform)

| Strategy | class | FRESH_HOLDOUT top-1 | norm. regret | FRESH_OOD top-1 | norm. regret |
| --- | --- | --- | --- | --- | --- |
| UNIFORM_AMONG_ZERO_COST | control | 0.246 | 0.601 | 0.223 | 0.656 |
| LOWEST_ACTION_ID | control (identity) | 0.303 | 0.565 | 0.262 | 0.647 |
| FIXED_DIRECTION_EAST / NORTH / SOUTH / WEST | control (absolute) | 0.303 / 0.290 / 0.305 / 0.297 | ≈0.56 | 0.268 / 0.277 / 0.265 / 0.276 | ≈0.63 |
| HIDDEN_BASE_EAST | control (oracle-only orientation) | 0.657 | 0.207 | 0.850 | 0.114 |
| RESOURCE_PRESERVING_V1 | policy | 0.303 | 0.565 | 0.262 | 0.647 |
| RESOURCE_ID_REVERSED | policy | 0.252 | 0.600 | 0.255 | 0.639 |
| NEXUS_SELECTOR_V1 (coverage 0.89 / 0.85) | policy | 0.106 | 0.621 | 0.119 | 0.659 |
| GREEDY (all actions) | simulator reference | 0.109 | 0.612 | 0.124 | 0.650 |
| ONE_STEP_ZERO_COST | successor reference | 0.363 | 0.478 | 0.277 | 0.605 |
| TOWARD_CENTRE | deployable heuristic | 0.356 | 0.497 | 0.277 | 0.619 |
| **STATE_ONLY** | deployable model | **0.310** | 0.552 | **0.277** | 0.630 |
| **SC_GEOMETRY_MAIN (headline state+candidate)** | deployable model | **0.376** | 0.480 | **0.294** | 0.603 |
| D_ABSOLUTE_DIRECTION | diagnostic, non-equivariant | 0.377 | 0.480 | 0.298 | 0.601 |
| D_CANONICAL_FRAME | diagnostic, leaked | 0.383 | 0.476 | 0.298 | 0.602 |
| D_ONE_STEP | diagnostic, future state | 0.388 | 0.459 | 0.311 | 0.583 |
| D_HIDDEN_ORIENTATION | diagnostic, oracle-only | 0.716 | 0.155 | 0.894 | 0.076 |
| **D_PRIVILEGED_RELATIONS** | diagnostic, unavailable | **0.806** | 0.081 | **0.915** | 0.059 |
| D_PRIVILEGED_ONE_STEP | diagnostic | 0.808 | 0.081 | 0.917 | 0.058 |

Catastrophic-error rate (regret ≥ 100), HOLDOUT / OOD: UNIFORM 0.130 / 0.399; RESOURCE 0.134 / 0.419; STATE_ONLY
0.124 / 0.400; SC_GEOMETRY_MAIN 0.103 / 0.356; D_PRIVILEGED_RELATIONS 0.020 / 0.032.

Calibration of the headline model, HOLDOUT / OOD:

- P(optimal set): 0.322 / 0.283
- Cross-entropy: 1.21 / 1.33
- Brier: 0.227 / 0.203
- ECE: 0.011 / 0.055

The two interaction variants (`SC_*_INTERACT`) overfit: their OOD ECE is 0.15 and 0.56, and CAL did not select them.
No scorer abstains.

Paired differences, with 95% bootstrap CIs:

| | FRESH_HOLDOUT Δtop-1 | material | FRESH_OOD Δtop-1 | material |
| --- | --- | --- | --- | --- |
| STATE_ONLY − UNIFORM | +0.064 [0.062, 0.066] | yes | +0.054 [0.053, 0.056] | yes |
| STATE_ONLY − RESOURCE | +0.007 [−0.006, 0.018] | no | +0.015 [0.004, 0.027] | no |
| SC_GEOMETRY_MAIN − UNIFORM | +0.130 [0.117, 0.143] | yes | +0.072 [0.060, 0.084] | yes |
| SC_GEOMETRY_MAIN − RESOURCE | +0.073 [0.054, 0.091] | yes | **+0.033 [0.016, 0.049]** | **no** |
| D_PRIVILEGED_RELATIONS − headline | +0.430 [0.413, 0.446] | yes | +0.621 [0.608, 0.634] | yes |
| D_ONE_STEP − headline | +0.013 [0.001, 0.024] | no | +0.016 [0.005, 0.029] | no |
| D_ABSOLUTE_DIRECTION − headline | +0.001 [−0.005, 0.007] | no | +0.004 [−0.003, 0.010] | no |
| RESOURCE − RESOURCE_ID_REVERSED | +0.051 [0.032, 0.069] | — | +0.007 [−0.010, 0.025] | — |

The T-SYM secondary partitions replicate every row:

- Headline − RESOURCE: +0.063 on HOLDOUT (material) and +0.027 on OOD (not material).
- Privileged relations: 0.802 / 0.910.

### Equivariance

Prediction equivariance on D4 twins is 1.0 for STATE_ONLY and the headline model on every partition. It is 0.85,
0.76, 0.86 and 0.79 for the absolute-direction diagnostic, which shows the test can detect a non-equivariant scorer.
The headline model's gain over uniform is positive in every hidden orientation (HOLDOUT 0.105–0.178; OOD
0.054–0.094), so it passes the stability rule.

By contrast, RESOURCE scores 0.585–0.598 in R0 and MY (EAST stays EAST) and 0.138–0.287 in the other six
orientations. The gap is +0.388 [0.358, 0.416] on HOLDOUT and +0.637 on OOD.

### Populations behave differently

| FRESH_HOLDOUT | n | UNIFORM | RESOURCE | STATE_ONLY | headline | privileged |
| --- | --- | --- | --- | --- | --- | --- |
| unique optimal zero-cost | 4120 | 0.203 | 0.235 | 0.290 | **0.407** | 0.823 |
| multiple optimal zero-cost | 1091 | 0.406 | 0.559 | 0.385 | **0.257** | 0.742 |
| optimal set MOVE only | 4283 | 0.212 | 0.249 | 0.304 | 0.425 | 0.818 |
| optimal set MOVE+RETREAT (step away from hostile) | 846 | 0.396 | 0.574 | 0.340 | **0.124** | 0.770 |
| mixed set (a costly action also optimal) | 565 | 0.283 | 0.308 | 0.326 | 0.532 | 0.876 |
| level 0 / 1 / 2 | 1778 / 2540 / 893 | 0.25 / 0.24 / 0.24 | 0.30 / 0.30 / 0.33 | 0.32 / 0.31 / 0.30 | 0.40 / 0.36 / 0.36 | 0.79 / 0.79 / 0.88 |
| 3 / 4 / 5 / 6 candidates | 124 / 940 / 2382 / 1765 | 0.37 / 0.29 / 0.24 / 0.22 | 0.52 / 0.36 / 0.29 / 0.28 | 0.54 / 0.38 / 0.30 / 0.27 | 0.55 / 0.47 / 0.38 / 0.30 | 0.96 / 0.88 / 0.81 / 0.75 |

On OOD the pattern is sharper. On the multiple-optimal states the headline model scores 0.117, against 0.376 for
uniform.

**The retreat exception.** When stepping away from the nearest hostile is optimal, the deployable representation
does identify the right actions: the RETREAT and the MOVE aligned with it. The DEV-fitted linear scorer ranks them
the wrong way. This is the one place the data shows a policy-logic failure and not missing information. It covers
16% of HOLDOUT states. It was observed after the sealed run, so it is reported here and nothing was tuned on it.

Across the 10 topology families the headline model scores 0.33–0.42 on HOLDOUT. No family reaches the 0.5 bar.

### Error attribution (headline model, residual errors weighted by 1 − expected hit)

Each residual error was classified by the first signal that strictly separates the optimal candidates from the
wrongly chosen ones:

| class | FRESH_HOLDOUT | FRESH_OOD | TSYM_HOLDOUT | TSYM_OOD |
| --- | --- | --- | --- | --- |
| OBJECTIVE (distance to the objective entity) | 0.578 | 0.635 | 0.580 | 0.614 |
| RESOURCE (distance to material / resources) | 0.384 | 0.357 | 0.380 | 0.377 |
| THREAT | 0.016 | 0.002 | 0.017 | 0.003 |
| RELATIONAL | 0.004 | 0.000 | 0.004 | 0.000 |
| **PARTIAL_OBSERVABILITY (sum)** | **0.982** | **0.994** | **0.982** | **0.995** |
| MECHANISTIC (one-step effect only) | 0.005 | 0.000 | 0.007 | 0.000 |
| TEMPORAL | 0.012 | 0.002 | 0.010 | 0.002 |
| ACTION_ID_AMBIGUITY | 0.000 | 0.000 | 0.000 | 0.000 |
| UNKNOWN | 0.002 | 0.003 | 0.001 | 0.002 |

Multi-label incidence on HOLDOUT:

- A resource relation separates 90% of errors, relational 65%, the one-step effect 64%, and threat 48%.
- The deployable vectors differ at all in 95% of errors. The representation carries *some* difference between the
  chosen and the optimal candidate, just not the one that matters.

For STATE_ONLY, the RESOURCE relation dominates (0.66 on HOLDOUT, 0.88 on OOD).

## Roadmap decisions

| Field | Value | Rule |
| --- | --- | --- |
| FREE_ACTION_DECISION_MEASURED | true | stage PASS |
| CURRENT_POLICY_SHORTCUT_CONFIRMED | true | RESOURCE − ID-reversed CI > 0; orientation gap 0.39 ≥ 0.15 with CI > 0 |
| DEPLOYABLE_STATE_SUFFICIENT | false | STATE_ONLY is not material vs RESOURCE |
| DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT | false | not material vs RESOURCE on OOD; top-1 0.376 < 0.5 |
| POLICY_REPAIR_JUSTIFIED | false | the headline category is not SUFFICIENT or PARTIALLY_SUFFICIENT |
| ACTION_SEMANTICS_REQUIRED | true | privileged relations − headline = +0.430, CI > 0 |
| TRANSITION_PREDICTION_REQUIRED | false | one-step − headline = +0.013, below 0.05 |
| PREDICTIVE_REPRESENTATION_REQUIRED | true | by the predeclared rule, through ACTION_SEMANTICS_REQUIRED |
| ROUTER_2_0_JUSTIFIED | false | Stage 3F.6-T-SYM, not re-opened |
| READY_FOR_3F_FREEZE | false | 3F.6-P.1, W and D requalifications remain |
| READY_FOR_STAGE3G | false | by construction |

`PREDICTIVE_REPRESENTATION_REQUIRED=true` must be read with its reason. What is missing is *observed* spatial
information: where the task entities are relative to each candidate action. Predicting successor states is not what
is missing (the one-step diagnostic adds 0.013), and neither is multi-step temporal reasoning (TEMPORAL is at most
1.2% of residual errors).

## Disclosures

- The fresh HOLDOUT follows the canonical admission order, so it covers curriculum levels 0–2. DEV and CAL cover
  levels 0–1.
- The hidden-orientation diagnostic reaches 0.72 on HOLDOUT and 0.89 on OOD. The generator's base frame puts the
  optimal free action on base-frame EAST most of the time. The symmetric benchmark hides this bias from every
  deployable input, but it is the reason a fixed-EAST tie-break paid off in R0/MY worlds.
- The privileged-relation diagnostic uses kernel positions that neither live interface exposes (the
  `SENTINEL_NEXUS_RELATIONAL_SPATIAL_CONTEXT_V1` boundary). It is an upper reference, never a deployable result.
- The three pre-freeze rule revisions and their rationale are recorded verbatim in the plan
  (`conclusions.preFreezeRevisions`).

Authority: R0, non-dispatching, no online learning, nothing promoted.

## Reproduce

```bash
node scripts/generate-stage3f6tsym-confirmatory.mjs --verify      # T-SYM fresh payload (gitignored)
node scripts/generate-stage3f6p1asym-confirmatory.mjs --verify    # this stage's fresh payload (gitignored)
node scripts/certify-stage3f6p1asym-free-action.mjs --check
node --test tests/stage3f6p1asym-free-action.test.js
```
