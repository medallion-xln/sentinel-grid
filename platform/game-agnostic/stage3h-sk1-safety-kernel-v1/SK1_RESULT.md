# STAGE 3H-SK1 — Sentinel Safety Kernel: result

AUTHORITY: R0 (observation and recommendation only) · BASE HEAD `966f6eb3` · experiment frozen at `ed6cbc8c`

**CLASSIFICATION: B — `SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED`.**

Engineering and scientific qualification are separate. The engineering is complete: an isolated, tested safety
kernel, an enforced exclusion registry, a one-pass run infrastructure and an R0 recommendation API. The policy is
**not qualified**: on 600 fresh classes it introduced catastrophes against both comparators and abstained on about
half of them. It is, with statistical support, safer and lower-regret than the frozen H-W4 policy C10 on the same
classes. No finite DEV result proves universal safety, and nothing here is deployed, promoted or pushed.

## 1. Gates

| gate | outcome |
|---|---|
| 0 — integrity and custody | **PASS**, with disclosed limits (section 2) |
| 1 — failure attribution | **COMPLETE**, diagnosis only (section 3) |
| 2 — safety kernel | **BUILT** — four separable components, 12-file inference closure |
| 3 — reasoning and generalisation tests | **PASS** — 36/36 tests, all eleven required areas; identity audit on every validation class |
| 4 — prospective DEV experiment | **EXECUTED ONCE, VALID** — classification B |
| 5 — R0 recommendation API | **DELIVERED** as a `NOT_QUALIFIED` shadow-mode prototype |

## 2. Gate 0 — what is enforced and what is not reproducible

- **Exclusions are enforced, not just recorded.** `infra/exclusion-registry.json` lists 77 forbidden blocks (901–910
  spent observational evidence, 911–914 retired), 7 sealed registries and the strict index. `loadSk1Exclusions()` is
  the only source of an exclusion context and fails closed. The allocator refused every forbidden block in tests, and
  in practice: it rejected block 813 for a repository text hit before any allocation was written.
- **SK1's own consumption is recorded and enforceable for the next stage.** `successor/exclusions-v2.mjs` adds the 26
  screened blocks, the retired reserve 828–837, block 813, and three SK1 registries (1,000 exploration, 600 validation,
  698 screened-but-unused identities, all under opaque aliases). A test confirms blocks 801–837 are rejected.
- **Evaluator-free inference graph.** The kernel closure is 12 lane-local files importing only `node:crypto`
  (`node:fs/path/url` in the host only). Verified on a `git archive` export of commit `8e409536`, where the kernel and
  second-game tests also pass.
- **Not repaired:** the static-import status of the frozen H-W1 / H-W4 policies at committed HEAD remains FAIL. The
  uncommitted import cut in `stage3h-hw1-dev-v1/public-projection.mjs` was verified to be identity-preserving and was
  neither committed nor reverted. The kernel uses its own derived projection, byte-identical whether derived from the
  committed or the cut revision, and equal to the frozen projection on all 1,600 SK1 classes.
- **Runner integrity.** Negative controls reject intentional leakage, contaminated populations, identity shortcuts
  and malformed action outputs. The earlier V2 identity-audit defect does not exist in the new runner (there is no
  band; evidence is recomputed on every transformed view). Validation outcomes were locked until the run; a start
  marker and an exclusive result file make a second run impossible (verified: refused). Check mode reproduced all 12
  result sections, wrote nothing, and left every hash and lock unchanged.
- **Limits.** Population generation and evaluation need 29 custody-protected overlay files that are untracked by
  design (all present, all matching their recorded hashes), so they are **not reproducible from a clean checkout**.
  **No independent backup exists**: no external volume, no Time Machine destination. Independent recoverability is
  not claimed.

## 3. Gate 1 — why the earlier policy failed (83 spent H-W4 introduction classes, C10)

| mechanism | status | finding |
|---|---|---|
| illegal or precondition-violating action | OBSERVED_FACT | not a cause: preconditions publicly established in 83/83 |
| hidden-state-sensitive outcome | CAUSAL_EVIDENCE | in 65/83 the same action under the same public state is catastrophic in some member worlds only; in 18 it is catastrophic in all |
| a safe alternative existed | OBSERVED_FACT | 83/83 (and all 600 classes) contain an action that introduces against neither comparator in any member |
| the failure is a comparator's own action | OBSERVED_FACT | 42/65 Nexus failures were exactly S0's action; 4/32 S0 failures were Nexus's |
| risk-estimation error | OBSERVED_FACT | the risk head ranked the unsafe action safer than every safe alternative in 73/83 |
| regret-ranking error | OBSERVED_FACT | 10/83 |
| threshold saturation, action family | UNRESOLVED | no supported association with failure |
| horizon | UNRESOLVED | every class is H2 |
| whether public information can identify the safe alternative | UNRESOLVED by diagnosis | the question the experiment addresses |

Potentially addressable from existing public information: the comparator-inherited failures (by giving the policy
comparator evidence) and risk estimation. No hyper-parameter, feature or threshold was fitted to these classes, and
the kernel was never run on them.

## 4. Gate 4 — the prospective experiment

**Design.** Frozen in `SK1_DESIGN_FREEZE.md` (commit `307e3453`) before any world was generated. 26 fresh blocks
screened (165,984 worlds, 2,298 admitted). EXPLORATION 1,000 classes / 57 families; VALIDATION 600 classes / 46
families / 40,036 member worlds; **no family, world, member world or public class shared**. Model trained on
exploration only: out of fold, tier width 0.1 gave the fewest introductions (102 of 1,000 against 149 for regret-only
ranking); no threshold reached zero introductions at 10% coverage, so the frozen fallback set τ = 0.2.

**Execution validity.** All eight execution gates pass. Identity audit on all 600 classes: 13,200 transformed views,
**0** decision-set violations and **0** recommend/abstain flips under relabelling, menu order, D4 and hidden twins,
with expert evidence recomputed each time; all three shortcut controls detected (3,222/3,600, 3,260/3,600,
1,668/1,800); 0 unallowed reads; 0 illegal actions in 13,800 decisions.

**Results on the same 600 validation classes.**

| policy | classes decided | intro vs S0 | intro vs Nexus | catastrophic classes | mean nreg | Δnreg vs S0 [upper 95%] | Δnreg vs Nexus [upper 95%] |
|---|---|---|---|---|---|---|---|
| S0 (frozen) | 600 | 0 | 97 | 195 | 0.561 | — | −0.063 [−0.037] |
| Nexus-else-S0 (frozen) | 600 | 193 | 0 | 294 | 0.624 | +0.063 | — |
| C10 (frozen H-W4) | 600 | 49 | 58 | 144 | 0.383 | −0.178 [−0.146] | −0.241 [−0.212] |
| **Safety Kernel, as specified** | **304** | **1** | **2** | 7 | 0.182 | −0.375 [−0.332] | −0.503 [−0.468] |
| Safety Kernel, forced choice | 600 | 28 | 37 | 52 | 0.220 | −0.341 [−0.313] | −0.404 [−0.377] |
| ablation without expert evidence, forced choice | 600 | 32 | 53 | 79 | 0.287 | −0.275 [−0.247] | −0.338 [−0.310] |

"As specified" is the policy that was frozen: it recommends only when the risk criterion is met. "Forced choice" is
its top-ranked action on every class and is a diagnostic reading.

**Primary gates (policy as specified).**

| gate | result |
|---|---|
| zero introductions vs S0 | **FAIL** — 1 |
| zero introductions vs Nexus-else-S0 | **FAIL** — 2 (two distinct classes fail in total; one fails against both) |
| complete decision coverage | **FAIL** — 304 of 600 decided, 296 abstentions (49.3%), all `NO_ACTION_MEETS_RISK_CRITERION` |
| zero illegal actions | pass |
| regret improvement ≥ 0.02 vs each comparator, upper bound < 0 | pass |
| identity and geometric invariance | pass |
| deterministic replay | pass |
| compute budget | pass — median 11.6 ms, maximum 98.1 ms |

**Against C10, forced choice, paired by class, family-clustered 95% intervals.**

| contrast (kernel − C10) | estimate | interval |
|---|---|---|
| introduction rate vs S0 | −0.035 (28 vs 49) | [−0.064, −0.008] |
| introduction rate vs Nexus | −0.035 (37 vs 58) | [−0.065, −0.008] |
| catastrophic-class rate | −0.153 (52 vs 144) | [−0.203, −0.109] |
| mean nreg | −0.163 | [−0.189, −0.136] |

Distinct failing classes: 39 for the kernel's forced choice, 84 for C10. With C10 itself as the comparator (post hoc,
descriptive): the kernel introduces against C10 in 20 classes; C10 introduces against the kernel in 111.

**Secondary findings.**

- **Uncertainty quality.** The bound separates failures: AUROC 0.83 for predicting a forced-choice introduction. By
  confidence: 0 failing in the most confident 150 classes, 2 in 300, 11 in 450, 39 in 600. Of the 39 failing classes,
  37 were ones the kernel abstained on.
- **Calibration.** Risk estimates are well calibrated on unseen families: expected calibration error 0.026, Brier
  0.198, AUROC 0.762 over 5,304 action estimates.
- **Expert evidence.** Removing it raises introductions against Nexus (53 vs 37; paired difference −0.027,
  [−0.046, −0.008]) and regret (−0.066, [−0.090, −0.042]); the effect against S0 is not supported
  (−0.007, [−0.022, +0.009]).
- **Where it still fails.** Forced-choice failures are almost all MOVE (25 of 28 vs S0; 32 of 37 vs Nexus); about half
  are twin-only (16/28, 19/37), i.e. hidden-state dependent.
- **Out-of-envelope observations.** 9 classes; 1 failing. No unsupported estimate and no invalid evidence occurred.
- **Worst-case regret** is 1.0 for every policy: each has at least one class with a worst-possible action.

## 5. What this does and does not show

- Public information **does** support materially safer action selection than the earlier public-only policy on
  unseen origin families, and it supports a usable confidence signal: the kernel knew which decisions were risky.
- Public information **did not** deliver zero introductions here, even on the half of classes the kernel was most
  confident about. The absolute qualification contract is not met.
- The result is DEV-only, Forge World, one observation contract, on a population screened to stress the comparators.
  The two as-specified failures are on base worlds, not twin-only.
- The abstention threshold was set by the frozen fallback rule, not by a rule that achieved zero introductions in
  development. Coverage of 50.7% is a consequence, not a target.
- Second game: the same kernel runs unmodified against the reference grid-rescue game through a thin adapter and
  abstains for lack of a risk model. That shows API portability only; **no decision gain was measured** there.

## 6. Gate 5 — the R0 product

`api/recommend.mjs` — `recommend(canonicalPublicState, legalActions, advisoryEvidence)` returns `rankedActions`,
`recommendedActionOrAbstention`, `uncertainty`, `safetyAssessment`, `evidence`, `decisionHash`, `sourceIdentity`,
`authority`. It has no execute method and rejects any request for execution or mutation. `demo/demo.mjs` shows the
six required steps for a recommendation and for an abstention, with deterministic replay, from committed files only.
Every response carries `NOT_QUALIFIED`. It is isolated from the Prime / Arbiter path; the nine-expert roster and both
authority boundaries are untouched.

## 7. Remaining limitations

1. Not qualified: introductions remain and coverage is partial.
2. Evaluation is not reproducible from a clean checkout (custody overlay), and there is no independent backup.
3. The estimator is a bounded tree ensemble on hand-built public features; the remaining failures are concentrated
   in MOVE and are substantially hidden-state dependent.
4. Evidence from Nexus is used at action-type level only, because its specific choice is identity-unstable.
5. The validation population is now spent. Blocks 801–812 and 814–827 are spent; 828–837 are retired.
6. One threshold rule, one model, one pass: there is no estimate of run-to-run variation of the classification.

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H-SK1 ===

STATUS=SK1_COMPLETE_ONE_PASS_EXECUTED
CLASSIFICATION=B (SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED)

BASE_HEAD=966f6eb38a1049e40fa57b1c23329384a6b385a3
GATE0_INTEGRITY=PASS (limits: evaluation not clean-checkout reproducible; no independent backup)
GATE1_ATTRIBUTION=COMPLETE (diagnosis only; 10 mechanisms labelled)
GATE2_KERNEL=BUILT (four components; 12-file evaluator-free closure)
GATE3_INVARIANCE=PASS (36/36 tests; 0 identity violations in 13,200 transformed views of 600 fresh classes)
GATE4_DEV_EXPERIMENT=EXECUTED_ONCE_VALID (NOT_QUALIFIED)
GATE5_R0_API=DELIVERED (shadow-mode prototype, NOT_QUALIFIED)

EXCLUSION_REGISTRY_ENFORCED=true
BLOCKS_901_914_RETIRED=true (901-910 spent observational evidence; 911-914 retired)
SOURCE_CUSTODY_PASS=true (guards intact; 31/31 protected identities match; nothing protected is tracked)
CLEAN_CHECKOUT_REPRODUCIBLE=PARTIAL (kernel inference, tests, demo and replay: yes; population generation and evaluation: no)
EVALUATOR_FREE_INFERENCE=true

PUBLIC_OBSERVATION_CONTRACT=STAGE3H_PUBLIC_DECISION_INFORMATION_V1 / HW1_PUBLIC_PROJECTION_V1 + SK1_ADVISORY_EVIDENCE_V1
SAFETY_KERNEL_SOURCE_HASH=5588744316bf27efaabdc72b86b886f6e31d868c13f3a783bc75ca19a3bc7cb5
RISK_ESTIMATOR_ID=SK1_BAGGED_BOOSTED_TREES_V1 (model SK1_FORGE_PRIMARY_V1, hash b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b)
UNCERTAINTY_METHOD=FAMILY_BOOTSTRAP_BAG_SPREAD_V1 (mean + 1 sd across 10 bags + envelope penalty)
ACTION_RANKING_CONTRACT=SK1_TIERED_RISK_THEN_REGRET_V1 (tierWidth 0.1, tau 0.2)

EXPERT_ROSTER_UNCHANGED=true
PRIME_AUTHORITY_UNCHANGED=true
ARBITER_AUTHORITY_UNCHANGED=true

DEV_EXPLORATION_CLASSES=1000
DEV_VALIDATION_CLASSES=600
HOLDOUT_CLASSES=0

INTRODUCTIONS_VS_S0=1 as specified (304 decided); 28 forced choice (600)
INTRODUCTIONS_VS_NEXUS=2 as specified (304 decided); 37 forced choice (600)
INTRODUCTIONS_VS_C10=1 as specified; 20 forced choice (post hoc descriptive; C10 introduces against the kernel in 111)
REGRET_DELTA_VS_S0=-0.375 as specified; -0.341 forced choice
REGRET_DELTA_VS_NEXUS=-0.503 as specified; -0.404 forced choice
REGRET_CONFIDENCE_BOUNDS=one-sided 95% family-clustered upper bounds: -0.332 / -0.468 as specified; -0.313 / -0.377 forced choice

ABSTENTION_RATE=0.493 (296 of 600)
DECISION_COVERAGE=0.507 (304 of 600)
ILLEGAL_ACTIONS=0
IDENTITY_VIOLATIONS=0
COMPUTE_BUDGET=within (median 11.6 ms, maximum 98.1 ms; budget 100 / 1000)
DETERMINISTIC_REPLAY=true (two passes identical; check mode reproduced all sections)

SAFETY_KERNEL_DEV_QUALIFIED=false
SECOND_GAME_ADAPTER_STATUS=ADAPTER_CONSTRUCTED_API_PORTABLE (reference grid rescue; no mechanics changed; no risk model)
SECOND_GAME_DECISION_GAIN=NOT_MEASURED
R0_RECOMMENDATION_API_STATUS=DELIVERED_NOT_QUALIFIED_SHADOW_MODE

V4_NEGATIVE_VERDICT_FINAL=true
H_W1_NEGATIVE_VERDICT_FINAL=true
H_W4_NEGATIVE_VERDICT_FINAL=true
H_W4B_BLOCKED_VERDICT_FINAL=true
VALUE_BAND_LINE_CLOSED=true

FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

REMOTE_PUSH=false
A5_AUTHORIZED=false
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

ENGINEERING_DELIVERABLES=isolated safety kernel (A-D) with decision records; Forge and second-game adapters; R0 API and demo; fail-closed exclusion registry, allocator and successor loader; one-pass runner with negative controls and check mode; custody and reproducibility manifests
SCIENTIFIC_EVIDENCE=Gate 1 attribution; one-pass validation on 600 fresh family-disjoint classes; supported safety and regret gain over C10; calibrated risk; uncertainty that concentrates failures in abstentions
REMAINING_LIMITATIONS=not qualified (3 introductions among 304 decisions; 49% abstention); evaluation not clean-checkout reproducible; no independent backup; DEV-only stress population; failures concentrated in hidden-state-dependent MOVE
NEXT_EXACT_OWNER_DECISION=choose one: (1) accept SK1 as a NOT_QUALIFIED R0 shadow-mode advisory prototype and stop policy work here; (2) separately decide whether to define a coverage contract that permits abstention, which this result does not satisfy either (2 failing classes among 304 decisions); (3) authorize a distinct new campaign. None is implied by this result.
```
