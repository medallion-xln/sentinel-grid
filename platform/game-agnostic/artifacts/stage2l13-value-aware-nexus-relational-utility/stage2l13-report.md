# Stage 2L.13 — Value-aware Nexus relational utility and safe selective delegation

**Status: PASS** · `NEXUS_REMEDIATION_OUTCOME = B_IMPROVED_NOT_SELF_CALIBRATED`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.

> Nexus went from **0.0844 to 0.7826** accuracy on the frozen grounded benchmark,
> overtaking Prime (0.3946). It can now also discriminate its own correctness. But
> its best bucket reaches **0.9459** against the inherited **0.99** delegation
> floor, so **selective Nexus delegation remains unauthorised**. Zero delegations.

## The measured defect

Stage 2L.12 located the limitation precisely: `MEASURED_LIMITATION = EXPERT_SEMANTICS`.
A source audit of the complete inherited Nexus path confirms it:

| field | in canonical state | read by Nexus | used in recommendation | used in confidence |
|---|---|---|---|---|
| `objectiveValue` | yes | **no** | no | no |
| `restorationCost` | yes | **no** | no | no |
| `risk` | yes | **no** | no | no |
| `protectionNeed` | yes | **no** | no | no |
| `availability` | yes | **no** | no | no |
| `demand` | yes | **no** | no | no |
| `baseCapacity` | yes | **no** | no | no |
| `objectiveRelevant` | yes | **no** | no | no |
| `critical` (boolean) | yes | yes | yes | yes |
| `hostile` (boolean) | yes | yes | no | yes |

Not one quantitative semantic field was read anywhere. Five of eight relation
kinds (`protects`, `inhibits`, `amplifies`, `substitutes`, `conflicts`) were
ignored by the expert; six of eight by the relational analyzer. Recommendation and
confidence were functions of graph shape and two booleans, while optimality is set
by value, cost and risk.

## What changed — and what deliberately did not

Nexus stops asking *"which entity is structurally important?"* and starts asking
*"which relational intervention has the best objective consequence?"*

```
finalRelationalUtility = relationalBenefit + riskAdjustment − actionCostPenalty
```

decomposed and auditable, never one opaque scalar:

| component | meaning |
|---|---|
| `structuralImportance` | how much of the graph hangs off the target |
| `objectiveRelevance` | **structure crossed with value** — the new capability |
| `relationalBenefit` | value this intervention would unblock, attenuated per remaining blocker |
| `actionCostPenalty` | the target's restoration cost |
| `riskAdjustment` | exposure this action removes, net of standing protection |
| `redundancyAdjustment` | discount where an alternate path already exists |

**The benchmark was not touched.** Same world generator, topology families,
objective model, consequence model, decidability rule and ground-truth derivation.
The Stage 2L.10 arbiter, its calibration, the evidence contract and all four
inherited ceilings are unchanged.

### Why this is an expert and not a copy of the oracle

The expert lives in its own file that **imports nothing from the benchmark** —
enforced by the certify script, which refuses to run if it does, and by test. It
builds its own approximate model, deliberately weaker in ways that produce real,
interpretable errors:

- its **own** operational threshold (0.5), not the world's delivery threshold
  (0.6), so it misjudges entities near the boundary;
- a single-pass blocking analysis, not the world's recursive fixed point;
- no semantics at all for `amplifies` or `conflicts`;
- capacity approximated as `baseCapacity` vs `demand`, ignoring `supports`.

Measured against the truth on a 551-case sample: it picks the optimal action 80%
of the time but reproduces the **full true ranking only 38.5%** of the time
(pairwise ordering agreement 85.1%). An oracle would be at ~100%.

## Decoupling tests — the direct test of the defect

All nine classes pass, with the benchmark independently confirming each optimum:

| | case | result |
|---|---|---|
| A | high-degree low-value vs low-degree high-value | degree does not decide |
| B | deep irrelevant vs shallow essential | depth does not decide |
| C | consequence-free SPOF vs valuable path | criticality alone does not decide |
| D | structurally attractive but too expensive | cost is priced |
| E | dominant risk vs marginal value | risk is priced |
| F | extreme centrality low value vs moderate structure high value | centrality does not decide |
| G | protect valuable dependency vs irrelevant hub | protection follows value |
| H | redundant reinforce vs broken high-value restore | redundancy discounts |
| **I** | **identical topology, different semantics** | **different recommendation** |

Class I is the decisive one. Under the inherited expert, identical topology always
produced an identical recommendation — which is exactly why it failed.

## Blind evaluation — 5,261 decidable cases, frozen benchmark

| | inherited | remediated |
|---|---|---|
| **accuracy** | 0.0844 | **0.7826** |
| accuracy when recommending | 0.1383 | 0.8041 |
| abstention rate | 0.3899 | 0.0268 |

Prime 0.3946 · random 0.1667 · best trivial policy 0.3931 · **improvement +69.82 pp**

### The headline: where structure and value disagree

| region | cases | inherited | remediated | Prime |
|---|---|---|---|---|
| **structure/value DECOUPLED** | 4,093 | 0.0469 | **0.7520** | 0.3951 |
| structure/value aligned | 1,168 | 0.2158 | 0.8896 | 0.3930 |

**`STRUCTURE_VALUE_DECOUPLED_ACCURACY` improved by +70.51 pp.** That region is
78% of the decidable corpus and is precisely where Stage 2L.12 said the expert was
blind. The improvement floor (≥5 pp on both global and decoupled accuracy) was
declared before holdout was inspected.

Improvement is broad, not concentrated: **every one** of the 12 topology families
and **all 8** semantic profiles improved. Weakest remaining regions are
`VALUE_DIFFUSE` (0.574) and `CYCLE` (0.573) — exactly where the expert's
approximations are weakest, which is the signature of an honest model.

### Versus Prime

| | inherited | remediated |
|---|---|---|
| Nexus correct, Prime wrong | 311 | **2,282** |
| Nexus wrong, Prime correct | 1,943 | 241 |
| both correct | 133 | 1,835 |
| both wrong | 2,874 | 903 |

## Self-correctness identifiability — Nexus signals only

Stage 2L.12's sharpest finding was that no Nexus-emitted feature cleared the
permutation null. That is now false.

| | |
|---|---|
| cases (conditioned on recommending) | 5,120 · coverage 0.973 |
| base rate | 0.8041 |
| **best Nexus-emitted signal** | `nexus.nexusTopUtility <= 227543` |
| **discrimination** | **0.5475** |
| permutation null median / p95 | 0.0652 / 0.1055 |
| exceeds null p95? | **yes, by 5×** |
| frozen rule, discovery → holdout | 0.9881 → **0.9833** (base rate 0.8041) |
| generalizes out of sample? | **yes** (lost only 0.0048) |
| reaches the 0.99 floor? | **no** |

Every feature is Nexus-derived. `nexusUtilityMargin` is Nexus's **own**
first-versus-second estimate, named so it cannot be confused with the benchmark's
optimal-minus-runner-up, which is excluded.

## Selective delegation — inherited gate, unchanged

| bucket | n | reliability | eligible | delegates |
|---|---|---|---|---|
| `NEXUS_CLEAN_HIGH_MARGIN` | 148 | 0.9459 | yes | **no** |
| `NEXUS_CONTRADICTED` | 86 | 0.9186 | yes | no |
| `NEXUS_CLEAN_LOW_MARGIN` | 1,146 | 0.8962 | yes | no |
| `NEXUS_CHAIN_STILL_BLOCKED` | 1,224 | 0.6757 | yes | no |
| `NEXUS_UNSTABLE_UNDER_PERTURBATION` | 8 | 1.0000 | **no** | no |
| `NEXUS_SEMANTICS_INCOMPLETE` | 0 | — | **no** | no |

`NEXUS_UNSTABLE_UNDER_PERTURBATION` measured reliability 1.0 and is **still
refused** — a bucket whose recommendation flips under a 10% cost nudge is not a
basis for delegation, however it happens to score. That a-priori principle is
inherited from Stage 2L.10.

The margin ladder was swept on discovery only: reliability rises monotonically
from 0.898 (margin ≥ 50k, 1,187 opportunities) to 0.946 (margin ≥ 1M, 148
opportunities). **It never reaches 0.99.**

```
NEXUS_DELEGATIONS = 0        harm rate = 0.000000
delegating buckets = none    correct-Prime-break rate = 0.000000
```

No ceiling was lowered and no delegation was forced. Zero delegations is the
correct, measured outcome.

## Adversarial semantics

All eleven classes fail closed and are deterministic. `MISSING_VALUE`,
`MALFORMED_COST`, `NEGATIVE_RISK` and `ABSENT_OBJECTIVE_WEIGHTS` all **abstain**
rather than invent a value. `CYCLIC_DEPENDENCY`, `DUPLICATED_RELATIONS`,
`CONTRADICTORY_RELATIONS`, `DISCONNECTED_GRAPH`, `LEGAL_ACTION_MISMATCH`,
`ZERO_UTILITY_MARGIN` and `EXPERT_TIE` stay inside the legal action set.

The expert is order-invariant (entity and action order reversed) and
replay-equivalent.

## Outcome

**`B_IMPROVED_NOT_SELF_CALIBRATED`**, with a qualifier that matters:

> `SELF_DISCRIMINATION_DEMONSTRATED_BUT_BELOW_DELEGATION_FLOOR`:
> best eligible bucket reliability 0.9459 against a 0.99 floor.

The four outcome classes are coarse and this result sits between two of them.
Nexus **can** tell when it is right — the frozen rule held at 0.9833 out of sample
against a 0.8041 base rate. What it cannot do is reach the standard delegation
demands. "Cannot tell when it is right" and "can tell, but not to 0.99" imply
different next stages, so the distinction is recorded rather than flattened.

## Limitations

- Scoped to the Stage 2L.12 objective model and action vocabulary. A different
  objective could rank experts differently.
- The remaining ~22% error concentrates in `VALUE_DIFFUSE` and `CYCLE`, where the
  single-pass, no-fixed-point approximation is weakest.
- Delegation remains unauthorised. Closing the 0.9459 → 0.99 gap is a *confidence*
  problem, not an accuracy one.
- Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM` for 2L.10 through 2L.13.
- No live ZekNova decision delta is measured or claimed.

## Reproduction

```
npm run nexus:stage2l13:certify
npm run nexus:stage2l13:check
npm run test:stage2l13-value-aware-nexus
```
