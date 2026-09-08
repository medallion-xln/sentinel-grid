# Stage 3C — first learned Nexus candidate

Status: **BLOCKED** — `G_BLOCKED`

## What blocked, and what did not

Stage 3C is the first stage that trains anything, and this environment cannot
train. Measured, not assumed:

- `SOUP_INSTALLED`: **ABSENT** — the stage names Soup as the training engine and pins its commit
- `BASE_MODEL_WEIGHTS`: **ABSENT** — SFT needs a base model to adapt; no weights, no candidate
- `TRAINING_RUNTIME`: **ABSENT** — torch or equivalent to compute a gradient
- `ACCELERATOR_OR_VIABLE_CPU_BUDGET`: **ABSENT** — a candidate that cannot finish training is not a candidate

The decisive one is the base model. `huggingface.co` is refused by this
environment's egress policy with a 403 to CONNECT. The proxy documentation says
organization policy denials are to be reported rather than routed around, so no
alternate host was tried. Without weights there is no SFT, no candidate artifact,
and nothing to evaluate.

So no accuracy, regret, complementarity, hybrid or generalization figure appears
in these artifacts. A plausible number written here would be indistinguishable
from a measured one in every downstream stage that reads it.

## The entry gate passes in full

- Stage 3A reproduces: **true**
- Stage 3B reproduces: **true**
- Stage 3B.1 reproduces: **true**
- dataset: `FORGE_DATASET_V2` at `4d1a27925346258e…`
- splits: TRAIN 50860 / VALIDATION 6509 / HOLDOUT 6291 / OOD 7144
- record-level leakage from TRAIN: validation **0**, holdout **0**, ood **0**
- topology-level leakage from TRAIN: validation **0**, holdout **0**, ood **0**
- training exports drawn from: **TRAIN** only

HOLDOUT and OOD were counted and hashed and never evaluated against any policy.

## The selector had to measure its own rules

Selection keeps **11836** of 50860 TRAIN records (0.2327).
Getting there took two corrections worth recording.

The first draft keyed the rules on the generator's shape and role NAMES —
`shape === 'bridge'` meant BRIDGE. That is the mistake this project has refused
since the Stage 3A admission gate, and it admitted 99.96% of TRAIN.

Rewriting the rules to measure the record did not fix it on its own, because two
of them are constants on this corpus: every Forge world affords at least three
action types and at least one of PROTECT or REINFORCE, so `INTERVENTION_CHOICE`
and `CASCADING_FAILURE` have base rate 1.0 and separate nothing. Requiring "two
relational rules" while two rules always fire admits everything.

So the rules are now measured before they are used, and only those whose base
rate falls strictly inside (0.02, 0.98) may carry the selection:

| rule | base rate | informative |
| --- | --- | --- |
| `DEPENDENCY_CHAIN` | 0.1343 | yes |
| `SUBSTITUTION` | 0 | no — NEARLY_EMPTY_ON_THIS_CORPUS |
| `BOTTLENECK` | 0 | no — NEARLY_EMPTY_ON_THIS_CORPUS |
| `BRIDGE` | 0.7283 | yes |
| `CYCLE` | 0.2044 | yes |
| `REDUNDANCY` | 0.0892 | yes |
| `MULTI_HOP` | 0.1343 | yes |
| `DISTRIBUTED_VALUE` | 0.0669 | yes |
| `CASCADING_FAILURE` | 1 | no — CONSTANT_ON_THIS_CORPUS_FIRES_ON_ALMOST_EVERY_RECORD |
| `RESOURCE_ALLOCATION` | 0.0195 | no — NEARLY_EMPTY_ON_THIS_CORPUS |
| `INTERVENTION_CHOICE` | 1 | no — CONSTANT_ON_THIS_CORPUS_FIRES_ON_ALMOST_EVERY_RECORD |
| `NEGATIVE_CONTROL_NO_RELATIONS` | 0 | no — NEARLY_EMPTY_ON_THIS_CORPUS |
| `NEGATIVE_CONTROL_SINGLE_ACTION` | 0 | no — NEARLY_EMPTY_ON_THIS_CORPUS |
| `NEGATIVE_CONTROL_NO_SEPARATION` | 0.0004 | no — NEARLY_EMPTY_ON_THIS_CORPUS |

**NEGATIVE_CONTROLS_NEARLY_ABSENT: FORGE_DATASET_V2 contains almost no cases where relational reasoning is unnecessary, so a specialist trained on it would get very little signal for when to abstain. A measured dataset limitation for any future training run, not a defect introduced here.**

## Deterministic Nexus does not pick actions

NEXUS_RELATIONAL_SELECTOR_V1 is a deterministic policy BUILT ON deterministic Nexus, not Nexus itself. Nexus emits graph-level signals — bottleneck, critical-dependency, threatened and unsupported counts, depth, density — and no per-action output whatsoever. Ranking legal actions therefore needs a policy on top of those signals, and it is reported under its own name so no reader mistakes it for the certified expert. Nexus is unmodified.

## Baselines a learned candidate would have to beat

Measured now, on 400 VALIDATION cases, so the comparison exists before the candidate does.

| policy | optimal-set accuracy | mean regret | legal rate | abstention | cases |
| --- | --- | --- | --- | --- | --- |
| `RANDOM_LEGAL` | 0.205 | 60.65 | 1 | 0 | 400 |
| `HEURISTIC_GREEDY_IMMEDIATE` | 0.275 | 45.61 | 1 | 0 | 400 |
| `NEXUS_RELATIONAL_SELECTOR_V1` | 0.2462 | 48.15 | 1 | 0.1675 | 333 |
| `PRIME_FROZEN` | 0.26 | 43.69 | 1 | 0 | 100 |

`PRIME_FROZEN` runs on a quarter sample because it regenerates and searches each
world; its case count is reported beside it rather than being compared as though
it were the same set.

## Promotion firewall

Mutation-tested: 5 forbidden or unknown statuses, all rejected, with a permitted control accepted.
Live runtime references a candidate: **false**. Deterministic Nexus unchanged: **true**.

## Authority

`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. No model was
trained, no expert modified, Soup never invoked.

Certification hash: `aecd3183fa322c6e47557d309e07e1bb8d0e04695922be76e51057d6a6749e72`

