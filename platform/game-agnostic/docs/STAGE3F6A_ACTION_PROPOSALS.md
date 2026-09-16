# Stage 3F.6-A — Deployable Action Proposal + Independent Fallback

Certification `2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca`
Proposal contract `53aaa52bf1d3ee3c06657644f8bb46496d1c6320b9fe0d961bec93d77bf65282`
Policy freeze `cd3910084dc59fc487ea6ae1853f78164d1814923fa3671ef16fc2f0f4355cf7`

## The question

Stage 3F.6-C left two structural findings. CORE could predict whether the greedy action was safe but
could not compute that action (`ACTION_COMPUTATION_GAP`), and the only deployable fallback agreed
with greedy ~81–85% of the time (`INDEPENDENT_FALLBACK_GAP`). A router cannot add value if every
candidate proposes the same action, so:

```
ROUTING_VALUE REQUIRES POLICY_DIVERSITY
PREDICTING_WHETHER_AN_ACTION_IS_SAFE != GENERATING_THE_ACTION
```

No router was trained, no threshold tuned, no routing tier evaluated. This stage establishes only
whether meaningful actions exist to route *between*.

## Action producers

8 inventoried, 5 deployable.

| Producer | Deployable | Simulator | V2B | Rollout | Future info |
| --- | --- | --- | --- | --- | --- |
| `GREEDY` | no | **yes** | no | no | no |
| `PRIME_ROOT_PUCT` | no | yes | no | **yes** | no |
| `V2B` | no | no | **yes** | no | no |
| `NEXUS_SELECTOR` | yes | no | no | no | no |
| `RESOURCE_PRESERVING_V1` | yes | no | no | no | no |
| `OBJECTIVE_TARGETING_V1` | yes | no | no | no | no |
| `THREAT_COVERING_V1` | yes | no | no | no | no |
| `RANDOM_LEGAL_V1` (control) | yes | no | no | no | no |

`PRIME_ROOT_PUCT` is inventoried but not evaluated: it performs multi-step simulated rollouts, which
this stage forbids. `V2B` remains archive-only and was never substituted.

## Action computation gap — resolved

`CORE_CAN_COMPUTE_ACTION = true`. Deployable producers compute an action from the observation, the
legal action surface, and declared action semantics alone — no simulator, no rollout, no V2B, no
future information. Each proposal carries `proposal_id`, `producer_id`, `action`, `confidence`,
`provenance`, `required_capabilities`, `decision_time`, `epistemic_basis`. A producer that cannot
justify a choice **abstains**; it never fabricates an action.

The declared action-cost model is environment-declared action semantics, not a peek into simulator
internals, and it is **verified empirically** against observed energy deltas rather than trusted.

## Independent fallback gap — resolved by exactly one producer

Acceptance rule (frozen on DEV/CAL before sealed access): n ≥ 200 greedy-wrong cases, ≥ 0.5
disagreement when greedy is wrong, and correctness **strictly better than the measured
RANDOM_LEGAL control** (0.1836) — a measured bar, not a chosen constant.

HOLDOUT, versus greedy:

| Producer | agreement | n(greedy wrong) | disagree\|gw | correct\|gw | Wilson | qualifies |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXUS_SELECTOR` | **0.8162** | 3742 | 0.1654 | 0.0005 | 0.0001 | no |
| `RESOURCE_PRESERVING_V1` | 0.0002 | 4469 | **1.0000** | **0.6482** | 0.6341 | **yes** |
| `OBJECTIVE_TARGETING_V1` | 0.6507 | 218 | 0.3991 | 0.0275 | 0.0127 | no |
| `THREAT_COVERING_V1` | 0.4130 | **72** | 0.6667 | 0.3750 | 0.2722 | no (below floor) |
| `RANDOM_LEGAL_V1` | 0.1552 | 4469 | 0.8461 | 0.1875 | 0.1763 | see caveat |

The Stage 3F.6-C collinearity finding reproduces exactly: `NEXUS_SELECTOR` agrees with greedy 0.8162
(HOLDOUT) and 0.8148 (DEV/CAL), inside the expected ~81–85% band, and is correct on 0.05% of
greedy-wrong cases. It inherits greedy's errors instead of correcting them.

`THREAT_COVERING_V1` looks promising (0.3750) but has only **72** greedy-wrong cases, below the
predeclared floor of 200. It cannot support a claim and is reported as unclaimable, not as a success.

**Acceptance-rule caveat.** `RANDOM_LEGAL_V1` marginally clears the bar on HOLDOUT (0.1875 > 0.1836)
because the rule compares sealed performance against a DEV/CAL-measured control constant, so the
control can tie itself. It correctly fails on OOD (0.1769). The classification is unaffected — the
control is excluded from the qualifying set by construction — but the rule is weaker than intended
and should be tightened (e.g. compare against the control measured on the same split) if reused.

## Policy metrics

| | HOLDOUT acc | HOLDOUT mean regret | OOD acc | OOD mean regret | abstention (HOLDOUT) |
| --- | --- | --- | --- | --- | --- |
| `GREEDY` | 0.2552 | 49.94 | 0.2575 | 72.10 | 0.0000 |
| `RESOURCE_PRESERVING_V1` | **0.6165** | **26.25** | **0.7628** | **23.37** | 0.0000 |
| `NEXUS_SELECTOR` | 0.2188 | 52.00 | 0.2376 | 74.04 | 0.1668 |
| `OBJECTIVE_TARGETING_V1` | 0.2534 | 59.40 | 0.1304 | 96.02 | 0.9513 |
| `THREAT_COVERING_V1` | 0.4457 | 25.55 | 0.4000 | 56.28 | 0.9847 |
| `RANDOM_LEGAL_V1` | 0.2238 | 58.51 | 0.2173 | 83.65 | 0.0000 |

## Why RESOURCE_PRESERVING works — and what it does not prove

Measured on DEV: `corr(immediateScalar, declaredCost) = +0.426`, so greedy picks the **max-cost
action 97.5%** of the time, while **78.3%** of horizon-optimal branches are zero-cost, and
`P(min-cost action ∈ optimal) = 0.645`. Greedy takes the most expensive action; this policy takes
the cheapest; with distinct costs they can never coincide, which is why agreement is ~0.000.

This is a genuine structural regularity of the Forge reward — **not** evidence of transferable
competence. It says greedy is badly matched to the horizon objective in this environment. Whether a
cost-minimizing prior survives in an environment where immediate value and cost are not positively
correlated is untested and should not be assumed.

## Oracle policy-set bound (diagnostic only — not deployable)

| Split | GREEDY only | deployable only | greedy + deployable | gain vs greedy |
| --- | --- | --- | --- | --- |
| DEV/CAL | 0.2661 (48.97) | 0.7009 (16.17) | 0.7425 (14.05) | — |
| HOLDOUT | 0.2552 (49.94) | 0.7078 (16.27) | **0.7432 (14.46)** | **+0.488** |
| OOD | 0.2575 (72.10) | 0.8207 (15.44) | **0.8420 (13.89)** | **+0.5845** |

A perfect router over this policy set would roughly **triple** accuracy and cut mean regret by ~71%.
The available candidate set is no longer the binding constraint, which is what makes router work
worth doing — this bound is an upper limit, not an achievable result.

## Representation gaps

| Gap | Blocked proposals | Evidence |
| --- | --- | --- |
| `RISK_STATE` | **yes** | `THREAT_COVERING` abstains 98.5% — observed risk structure rarely maps to an available action |
| `OBJECTIVE_STRUCTURE` | **yes** | `OBJECTIVE_TARGETING` abstains 95.1% — few legal actions target a critical entity |
| `SPATIAL_STATE` | no | unchanged Stage 3F.6-S blind spot; not addressed here |
| `TEMPORAL_STATE` | no | no deployable producer consumes observation history |
| `CONSTRAINT_STATE` | no | the declared cost model sufficed |

World State was not expanded and no representation was redesigned.

## Sealed-split exposure (disclosed, not glossed)

HOLDOUT was read in Stage 3F.6-C to measure the *pre-existing* selector's collinearity. The producers
frozen here have **no fitted parameters** and were constructed from DEV/CAL plus declared action
semantics, so sealed reuse is defensible. But these splits are not pristine: the same rows informed
the Stage 3F.6-C diagnosis that motivated building an independent fallback at all. That caveat travels
with the result.

## Authority

R0, non-dispatching, shadow-only. `promotedToLiveRuntime=false`, `onlineLearningEnabled=false`.
No router trained, no threshold tuned, no routing tier evaluated.

## Reproduce

```bash
npm run stage3f6a:generate
npm run stage3f6a:certify
npm run stage3f6a:check
npm run test:stage3f6a
```
