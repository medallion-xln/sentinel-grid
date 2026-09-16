# Stage 3F.6-S — Deployable Runtime Feature Contract

`SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1`

Contract hash `5b0a631ece4c9304d4ee8b5298dadb7a2f8a5f18ac39a358216eb14d074ec926`
Certification hash `825084e9ef58fb5fcb27a29bee4d8a9f3b7983aed1cf0d2b1719be3b5f604b35`

## What this is

The smallest honest feature contract that can run in deployment-like conditions without privileged
future knowledge or oracle leakage. It defines **what Sentinel is allowed to know at decision time**.

```
DEPLOYABLE_FEATURE = DECISION_TIME_AVAILABLE and NON_LABEL_DERIVED and NON_FUTURE_LEAKING
                     and PROVENANCE_BOUND and DETERMINISTICALLY_RECONSTRUCTABLE

REFERENCE_PARITY  != DEPLOYABLE_VALIDITY
```

## What this is NOT

This is an **admissibility** contract, not a performance contract. It makes no reliability claim
whatsoever. Nothing here was trained, retrained, refitted, or threshold-tuned; no router was
evaluated; no fresh HOLDOUT/OOD data was generated; the frozen Stage 3E artifacts are untouched and
`REFERENCE_PARITY_MODE` still reproduces exactly as before.

A feature being admissible here does **not** mean it is informative. Three of them are provably
constant zero in the current environment (see finding 6).

## Admissibility rules (frozen before any feature was selected)

The rules were written and frozen *before* the feature set was chosen, so that the rules decide the
features rather than the desired features deciding the rules.

| Rule | Value |
| --- | --- |
| `AUTHORITATIVE_SIMULATOR_LOOKAHEAD_ALLOWED` | **false** (default deny) |
| `MULTI_STEP_ROLLOUT_ALLOWED_IN_ANY_PROFILE` | **false** |
| `hiddenStateAccessAllowed` | **false** |
| available before action execution / without actual outcome / without sealed labels | required |
| available without oracle continuation rollout / post-hoc analysis | required |
| deterministic from governed evidence, bound to observation schema identity | required |

One-step simulation is admissible **only** inside `DEPLOYABLE_WITH_SIMULATOR`, and only when the
deploying environment declares `SIMULATOR_ONE_STEP`. It is an environment capability that must be
declared, never a universal Sentinel assumption.

## Classification of the frozen 51 Stage 3E features

| Status | Count | Why |
| --- | --- | --- |
| `DEPLOYABLE` | 30 | derivable from the decision-time observation or legal action surface |
| `REQUIRES_PRIVILEGED_SIMULATOR` | 9 | requires simulating legal actions |
| `REQUIRES_MULTI_STEP_ROLLOUT` | 7 | binds the branch TOTAL reward vector — a horizon rollout total |
| `REQUIRES_V2B` | 5 | requires a genuine V2B expert answer |

All 51 are classified, all 51 map to a deployable counterpart, and the dependency sets are shared
with the Stage 3F.6-R reference parity harness so the two gates cannot silently disagree.

The 7 rollout-derived features are **label-adjacent**: the Stage 3E label is defined over the same
greedy-continuation rollouts. They are excluded from every profile under their old identity and are
`REDEFINE_ONE_STEP`-ed into new feature identities with one-step semantics. A redefinition always
takes a new name — reusing a Stage 3E name for a changed quantity is the exact silent redefinition
this contract exists to prevent.

## Profiles

| Profile | Features | Required capabilities | Works without |
| --- | --- | --- | --- |
| `DEPLOYABLE_CORE` | 30 | observation schema, legal action surface, relational expert | simulator **and** V2B |
| `DEPLOYABLE_WITH_SIMULATOR` | 46 | + one-step simulator | V2B |
| `DEPLOYABLE_WITH_V2B` | 51 | + genuine V2B expert | — |

Profiles are monotonic: core ⊂ simulator ⊂ V2B. A profile whose declared capability is absent
reports itself **unsatisfied** rather than emitting a degraded vector.

## Missing-value semantics

```
MISSING != ZERO     UNKNOWN != FALSE     UNAVAILABLE != NEUTRAL
```

`UNAVAILABLE` means the capability was not declared. `UNKNOWN` means the capability is present but
the evidence is insufficient. Both carry `value: null` and a reason string. There is no dense-vector
guarantee and no imputation — densifying is exactly where missing silently becomes zero.

## Findings

1. **`FROZEN_CONTRACT_PROVENANCE_MISLABELLED`** — the frozen Stage 3E extractor header admits reward
   vector components as "runtime-visible one-step" evidence, but training records bind them to the
   branch TOTAL reward vector (a horizon rollout total). Seven features were admitted under a
   one-step justification while carrying multi-step totals.
2. **`RUNTIME_ENERGY_FEATURE_BYPASSED_OBSERVATION`** — Stage 3F.5 computed `energy` from the
   authoritative world constraint record, not the observation. Stage 3F.6 measured
   `REMOVE_RESOURCE_SIGNALS` changing 0 of 51 features because degrading the observation cannot move
   a feature that never read it.
3. **`OBSERVATION_PACKET_REDUNDANT_ENCODING`** — entity/relation counts appear both as numeric vector
   positions and in the structured canonical state; the degradation harness edits only the latter.
4. **`CONTRACT_IS_SPATIALLY_BLIND`** — no feature consumes actor position, so hiding spatial
   information changes nothing. Recorded as an inherited limitation, **not** presented as a fix.
5. **`ONE_STEP_CONSEQUENCE_DID_NOT_READ_OBSERVATION`** — Stage 3F.6 certified
   `oneStepConsequenceReadsObservation = false`.
6. **`RUNTIME_ONE_STEP_COMPONENTS_SILENTLY_ZERO_FILLED`** — the environment's one-step reward vector
   never declares `futureObjectivePotential`, `optionValue`, or `terminalOutcome`. Across **6,723
   one-step transitions covering all 28 scenario families at levels 1–3 over 6 seeds with 0
   generation failures**, each was declared 0 times. Stage 3F.5 read them with `?? 0`, so
   `greedyFuturePotential`, `greedyOptionValue`, and `greedyTerminalOutcome` were **constant zero at
   runtime** rather than measured quantities.

No finding required modifying a frozen artifact, and none did.

## Evidence that the deployable path actually reads the observation

Deployable-core features changed under Stage 3F.6's own degradation modes:

| Degradation | Deployable features changed |
| --- | --- |
| `REMOVE_THREAT_INFORMATION` | 12 |
| `DROP_ENTITY_SUBSET` | 12 |
| `HIDE_RELATIONSHIPS` | 11 |
| `REMOVE_OBJECTIVE_INFORMATION` | 1 |
| `REMOVE_RESOURCE_SIGNALS` | **1** (was 0 under the Stage 3E runtime) |
| `HIDE_SPATIAL_INFORMATION` | 0 (declared blind spot, finding 4) |

A foreign observation schema **fails closed** to `UNKNOWN` rather than reading vector positions
blindly. Features are invariant to which future actually occurs, verified against materially
different futures at a decision point with the decision state proven unmutated.

## Router compatibility

`INCOMPATIBLE_WITHOUT_RETRAINING`. The frozen Stage 3E router consumes 51 standardized features in a
fixed key order, 21 of which are inadmissible here. `DEPLOYABLE_CORE` supplies 30 and
`DEPLOYABLE_WITH_SIMULATOR` supplies 46 under redefined identities, so the frozen weight vector
cannot be applied. **No router was retrained and no threshold was tuned** — doing so is out of scope
for this substage and requires separate authorization.

## Reproduce

```bash
npm run stage3f6s:certify
npm run stage3f6s:check
npm run test:stage3f6s
```

The contract hash is invariant to object key order (`sha256` canonicalizes before hashing).
