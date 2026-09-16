# Stage 3F.6-C — Confirmatory Deployable Router and Reliability

Certification hash `40ae3b415eeca2c1774a5f4ce2e2904bb189d4d83f98f26c1614eccce5dd0051`
Evaluation freeze `a9db1fd93ab3b33ec13f2b3d336100029adee4f05426cc0bd2f2a61f3776fb28`
Corpus content hash `28fc6369511c2eb2e59d846a7a0353817cef9e56e871a65b4f8c2b577c1b62d5`

## The question

How much safe-routing competence survives when Sentinel is limited to genuinely deployable,
decision-time, non-oracle evidence?

**Primary profile is `DEPLOYABLE_CORE` (30 features).** The simulator profile is an ablation and an
upper bound, never the headline.

## Answer in one line

CORE has **genuine but weak ranking signal** (HOLDOUT AUROC 0.7254) and **cannot support selective
routing at all** at the predeclared precision-first operating point: it routes **0 of 6000** HOLDOUT
cases and 0 of 6000 OOD cases. Classification: `B_CORE_HAS_SIGNAL_BUT_NOT_SELECTIVE_RELIABILITY`.

## Two defects invalidated the first evaluation

Both were mine, both were found before certification, and both forced a full corpus regeneration.

1. **Action-identity mismatch.** The selector's answer was scored using the 64-character runtime
   action key, while `record-v2` stores a 16-character prefix. Every one of the 16,719 non-abstaining
   selector answers failed as `UNKNOWN_ACTION_ID` and was silently counted wrong, corrupting the
   fallback, hybrid, oracle and false-safe arms. The tell was `ORACLE_GREEDY_SAFE` landing exactly on
   `ALWAYS_GREEDY`. Fixed by `runtimeKey.slice(0,16)`; the mapping is verified bijective.
2. **Simulator ablation silently skipped.** Feature extraction aborted the whole row on the first
   non-AVAILABLE feature, which is exactly Stage 3F.6-S finding #6 — three one-step reward components
   the environment never declares. The ablation now trains on the satisfiable **43 of 46** features
   and names the three exclusions.

The invalidated corpus hash `343176d6…` is **not** current evidence and appears nowhere in the result.

## Dataset

Fresh seed space 401/402/403 (main) and 411 (OOD), disjoint from every prior stage
({1,2,3}, 11, {201,202,203}, 211).

| Partition | n | prevalence |
| --- | --- | --- |
| DEV | 4000 | 0.2668 |
| CAL | 4000 | 0.2655 |
| HOLDOUT | 6000 | 0.2552 |
| OOD | 6000 | 0.2575 |

All six topology overlaps, record overlap, state overlap and derived-variant leakage are **0**.
Topology assignment is a pure function of the topology hash, so a structure belongs to exactly one
partition by construction.

## Label

`GREEDY_SAFE` = the best-immediate action is a member of the authoritative horizon-optimal set.
Built only from oracle horizon evidence; no deployable feature enters it. Prevalence corroborates the
reconstruction against Stage 3E (0.2668 vs 0.2782 DEV; 0.2575 vs 0.2577 OOD).

## CORE router

Stage 3E's logistic-regression family, unchanged, so a change in result reflects the feature contract
rather than a change of model: standardized, bias last, 4000 full-batch iterations, L2 1e-3 excluding
bias. Deterministic — no RNG.

| | DEV | CAL | HOLDOUT | OOD |
| --- | --- | --- | --- | --- |
| AUROC | 0.7223 | 0.7160 | 0.7254 | 0.7161 |

Threshold **0.9** via `NO_CAL_OPERATING_POINT`: **no reliability tier was achievable** on CAL at the
n≥200 evidence floor — the best available was precision 0.408 at τ=0.5 against a 0.2655 base rate.
The threshold was not lowered to manufacture coverage.

| Tier | Achievable |
| --- | --- |
| 0.80 / 0.90 / 0.95 / 0.975 / 0.99 | **false** (no τ routes ≥200 cases at that precision) |

HOLDOUT and OOD both: routed 0, coverage 0, precision 0, Wilson lower 0, false-safe 0.
Score distribution tops out in the 0.8–0.9 bin (5 HOLDOUT cases, 6 OOD); **nothing** reaches 0.9.

## The finding that bounds every router here

The only deployable fallback is the relational selector, and it is **~81–85% collinear with greedy**:

| | selector == greedy | selector in optimal set | random-action baseline |
| --- | --- | --- | --- |
| greedy safe (y=1) | 0.807 | 0.920 | 0.349 |
| greedy unsafe (y=0) | 0.847 | **0.000** | 0.193 |

When greedy is right the selector inherits the win; when greedy is wrong it picks the same wrong
action, landing in the optimal set on 8 of 14,795 cases (0.0005) — **worse than random**, because
random at least spreads across actions while the selector concentrates on greedy's mistake.

Consequence: `ORACLE_GREEDY_SAFE` (0.2555) barely exceeds `ALWAYS_GREEDY` (0.2552). Even a *perfect*
router would gain almost nothing, because there is nothing better to route to. Stage 3E avoided this
only because its fallback arm was an independent trained V2B expert, which is unavailable here.

## Simulator ablation (upper bound, not the headline)

43 of 46 features; excluded and named, never imputed: `oneStep.bestActionObjectiveProgressDelta`,
`oneStep.bestActionOptionValueDelta`, `oneStep.bestActionTerminalOutcome`.

| | CORE | SIMULATOR | delta |
| --- | --- | --- | --- |
| HOLDOUT AUROC | 0.7254 | 0.7462 | **+0.0208** |
| OOD AUROC | 0.7161 | 0.7411 | +0.0250 |
| HOLDOUT routed | 0 | 0 | 0 |

One-step simulator evidence improves ranking slightly and **still cannot route**. The gap does not
rescue selective reliability.

## V2B ablation

`NOT_AVAILABLE` — archive-only adapter, no runtime expert. No other model was substituted.

## Confidence

HOLDOUT Brier 0.1735, ECE 0.0725; OOD Brier 0.1791, ECE 0.0723. Calibration is *not* the binding
constraint (ECE is inside the frozen 0.10 bound). High-confidence-wrong at 0.90/0.95/0.99 is
**unassessable**: zero cases reach those scores. CORE scores do not support selective confidence.

## Degradation

| Mode | mean abs score delta | route change |
| --- | --- | --- |
| PARTIAL_ENTITY_SET | 0.0972 | 0 |
| REMOVE_RESOURCE_SIGNALS | 0.0615 | 0 |
| STALE_OBSERVATION | 0.0218 | 0 |
| HIDE_SPATIAL_INFORMATION | **0.0000** | 0 |

The inherited spatial blind spot is **unresolved and still visible** — no CORE feature consumes actor
position. Not repaired here; that would be spatial-state redesign, which is out of scope.
Route-change is 0 everywhere because nothing routes at the frozen threshold.

## Capability limitation (must not be glossed)

```
ABILITY_TO_PREDICT_GREEDY_SAFETY  != ABILITY_TO_COMPUTE_GREEDY_ACTION
CORE_CAN_PREDICT_GREEDY_SAFE = true
CORE_CAN_COMPUTE_GREEDY_ACTION = false
CAPABILITY_GAP = ACTION_COMPUTATION_GAP
```

`GREEDY_SAFE` asks whether the immediate-best action is horizon-optimal, but identifying that action
requires one-step simulation, which CORE does not declare. A CORE router can advise whether a greedy
action *proposed by another component* is safe; it cannot identify that action itself. A good
`GREEDY_SAFE` classifier is therefore **not** an autonomous executable action policy for CORE.

## Evidence gaps (classified only — no remediation in this stage)

| Gap | Established |
| --- | --- |
| `ACTION_COMPUTATION_GAP` (primary) | yes |
| `REPRESENTATION_INFORMATION_GAP` | yes |
| `SPATIAL_STATE_GAP` | yes |
| `TEMPORAL_STATE_GAP` | yes |
| `CALIBRATION_GAP` | no |
| `MODEL_CAPACITY_GAP` | **NOT_ESTABLISHED** — testing it needs a larger model, forbidden here |

## Candidate

Frozen, never promoted: candidate hash `e819b0cc…`, router hash `66e12712…`, threshold 0.9.
`PROMOTED_TO_LIVE_RUNTIME=false`, `ONLINE_LEARNING_ENABLED=false`, authority R0, non-dispatching.

## Reproduce

```bash
npm run stage3f6c:generate
npm run stage3f6c:certify
npm run stage3f6c:check
npm run test:stage3f6c
```
