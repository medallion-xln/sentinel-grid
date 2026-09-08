# Stage 3B — MicroWorld curriculum and large-scale counterfactual dataset

Status: **PASS** · Outcome: **A_LARGE_SCALE_CURRICULUM_AND_DATASET_CERTIFIED** · Authority: R0 (advisory only)

## The tie taxonomy came first, and it changed the plan

Stage 3A left 416 of 504 cases tied at the optimum. The obvious move is to
engineer the ties away. The brief forbids that without a taxonomy, and the
taxonomy is what made the difference.

| tie class | cases (V1) | reward defect? |
| --- | --- | --- |
| `ACCIDENTAL_REWARD_COLLAPSE` | 1 | yes |
| `INSUFFICIENT_REWARD_RESOLUTION` | 381 | yes |
| `GENUINE_STRATEGIC_EQUIVALENCE` | 17 | no |
| `SYMMETRIC_ACTIONS` | 0 | no |
| `HORIZON_ALIASING` | 17 | no |
| `OTHER` | 0 | no |

**The first version of the classifier got this wrong.** It asked "did the
immediate rewards differ?" first and called every such case horizon aliasing —
not a defect — which put 397 of 416 ties beyond scrutiny. Checking whether the
paths actually CONVERGE first showed only 17 of those 397 merge. The other 380
end in materially different worlds carrying identical accumulated reward.

## The diagnosis, and why V2 is not tie-breaking

FORGE_REWARD_V1 is a pure **flow** reward: it sums what happened along the way
and has no term for the value of the world it left behind. Two paths with the
same flow score the same however differently they end. That is a missing
dimension, not a missing tiebreaker.

V2 adds two **potential** terms — `futureObjectivePotential` and `optionValue` —
each a difference Φ(after) − Φ(before) of a function of world state. Because they
are differences of a potential they telescope: over a complete trajectory their
sum collapses to Φ(end) − Φ(start), so they cannot reorder complete trajectories.
They separate only truncated horizons, which is exactly the case the taxonomy
found and exactly the case the oracle scores.

| | V1 | V2 |
| --- | --- | --- |
| tied cases | 416 | 241 |
| reward-defect ties | 382 | 31 |
| genuine equivalence + true aliasing | 34 | 210 |
| unique-optimum rate | 0.1369 | 0.5198 |

**Genuine ties were preserved, not destroyed** — they rose, because V2 lets the
classifier tell a real equivalence from a reward that could not see a difference.
That is the gate: the certification blocks if genuine equivalence ever falls.

## Topology

15 procedural shapes composed with 6 role mixes, 8 objective
compositions, 5 horizon bands and 6 levels: 21600 combinations per seed.

Distinct topologies in the corpus: **65307**, against 1000 targeted and 105 in Stage 3A.

### A validator that was too strict

The first run of the gate rejected 3,403 cases, heavily concentrated in three
shapes. The cause was not the generator: depth and cut analysis were anchored at
the objective node, and the objective is often attached *below* the structure
being looked for. Both anchors are now canonical and label-free — depth is the
deepest run anywhere, cuts are computed from the node that reaches the most —
and rejections fell to 1196 of 72000, all of them cases where the shape
genuinely is not realized at small node counts.

## The corpus

| measure | value |
| --- | --- |
| admitted records | 70804 |
| counterfactual actions evaluated | 477119 |
| unique world hashes | 70804 |
| unique topology hashes | 65307 |
| unique reward rankings | 60493 |
| **effective dataset size** | **60493** |
| near-duplicate rate | 0 |

## Supervision routed, not forced

| class | records | SFT | preference | RL |
| --- | --- | --- | --- | --- |
| `UNIQUE_OPTIMUM` | 42325 | true | true | true |
| `NEAR_TIE` | 1006 | false | IF_GAP_AT_LEAST_PREFERENCE_MINIMUM_GAP | true |
| `EXACT_EQUIVALENCE` | 24324 | AS_AN_EXPLICIT_SET_OF_EQUAL_OPTIMA | false | true |
| `PARETO_TRADEOFF` | 474 | false | false | true |
| `INSUFFICIENTLY_RESOLVED` | 2675 | false | false | true |

Unique-optimum rate: **0.5978** against a target of 0.4.
The rate rose because the reward gained a dimension it was missing, and because
equivalent cases now go to the dataset that can represent them — not because any
distinction was fabricated. Exact equivalences produce an SFT completion that
**names every equal optimum**; a lexicographic tie-break is never taught as if it
were world truth.

## Horizon

51717 horizon-dependent cases against a target of 5000 and 86 in Stage 3A.

| | cases | Prime optimum rate |
| --- | --- | --- |
| horizon-aligned | 76 | 0.8684 |
| horizon-dependent | 223 | 0 |

Prime was not modified and was not expected to improve. The campaign exists to
give a future candidate something measurable to beat.

## Splits

Assigned by **topology hash**, so a structure can appear in exactly one split by
construction. Splitting records at random would put near-identical structures on
both sides and let a model score well by having memorised the shape.

TRAIN 50990 · VALIDATION 6402 · HOLDOUT 6268 · OOD 7144

Exact world overlap: 0. Topology leakage: 0.

The OOD set is **constructed, not sampled**: levels above the training curriculum,
with larger graphs and longer horizons. It was not used during tuning.

## The Oracle axis is unreachable, and that is a curriculum defect

Every world carries a temporal channel of 8 to 18 frames. Every decision is
recorded at **tick 0**, and `world.history` — what the adapter hands the Oracle —
accumulates one frame per step. So the Oracle sees a single frame, falls below
its three-frame sufficiency floor, and abstains on **100%** of evaluated cases.

The signal is in the world state. The expert cannot reach it. That is a defect in
how the curriculum records decisions, not in the Oracle, and it drags router
alignment down to 0.0268: cases the corpus classifies ORACLE_DOMINANT have no
Oracle contribution available to align with.

The fix is a warm-up of a few ticks before the decision is recorded. That changes
every world hash, so it is a **new corpus version** rather than a patch to this
one — and it is recorded here rather than quietly re-rolled, so the record shows
that the first composed curriculum had this shape.

## Soup

Validated against Soup 0.74.0 format signatures — **every row**, not the first.
A dataset whose thousandth row fails detection fails in training, which is the
worst place to find out.

- `sft`: 47839 rows, detected `alpaca`, expected `alpaca` — compatible
- `preference`: 33288 rows, detected `dpo`, expected `dpo` — compatible

RL episodes carry no Soup signature and none is claimed: GRPO and PPO consume
prompts plus a reward function, not transitions. Saying so is more useful than
inventing a mapping that would fail in training.

**No training was run and Soup was not invoked.**

## Measured remaining limitations

- ORACLE_AXIS_UNREACHABLE: every decision is recorded at tick 0, where world.history holds a single frame against the Oracle three-frame sufficiency floor, so the Oracle abstains on 100% of cases. The temporal signal is present in world state (8-18 channel frames per world) and cannot be read by the temporal expert. This is a curriculum defect, not an Oracle defect; the fix is a warm-up of a few ticks before the decision is recorded, which changes every world hash and is therefore a new corpus version rather than a patch to this one.
- RESIDUAL_UNRESOLVED_TIES: 2675 corpus cases still carry a tie the reward cannot see. They are routed to RL, not forced into SFT.
- CONTINUATION_POLICY_DEPENDENCE_IS_SAMPLED: policy-family agreement is measured on a sample, not on every case, so the invariance rate is an estimate with the sample size recorded beside it.
- NO_MODEL_TRAINED: Soup was schema-validated and never invoked. Nothing is claimed about what a trained candidate would do.
- ARCHIMEDES_IS_STRUCTURAL_ONLY: there is no Archimedes expert to evaluate, so its router class is a property of the corpus rather than a measured expert usefulness.
- SINGLE_PLATFORM: the inherited DIGEST_PRODUCED_SINGLE_PLATFORM limitation is unchanged.

Certification hash: `61a8ab8d7769b3c09541d3cb2665d4451eba95513f08b6055390e6212236156d`

