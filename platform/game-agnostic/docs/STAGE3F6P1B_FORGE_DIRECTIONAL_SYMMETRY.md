# Stage 3F.6-P.1B — Forge Directional Symmetry Audit

Certification `120e7649a2912447d149e8a1b4c1a24c6a1af6bd64d5b6b5efd1b6dfe4ddfbdb`
Analysis plan `bfd852968c8f286d9789d8c25456ca89668fa9be5894dc8382c6c735adcaa467` (written before the symmetry evidence)
Symmetry evidence (DEV, gitignored) `7c7895c8…368d`

This is a bounded benchmark/environment diagnostic. NEXUS, the router, the policies, the Forge generators, the
kernel, the oracle and every historical corpus and evidence file are unchanged. The symmetry transform is additive
and diagnostic-only.

> The mission text for this stage arrived truncated inside Section 11. Sections 0–11 and the A–F
> classification were executed. Later sections, including the required report template, were not received.

## The question

Would the same decision, rotated or reflected, keep its optimal-action semantics? If not, why? And is the Stage
3F.6-P.1A EAST advantage (baseline direction accuracy 0.724) intentional, an accidental generation asymmetry, an
action-identity artifact, a topology artifact, a resource/objective placement artifact, or a mixture?

## Answer: `F_MIXTURE` of B + C + E

The EAST advantage has **two separate causes that happen to coincide**:

1. **Why EAST is usually optimal (E, through B).** The scenario generator puts the actor's own `material` resource
   on the cell directly EAST of the actor whenever that cell is free (`scenarios-v2.js:162-168`, used at `:257`).
   Moving onto it and collecting is what the horizon rewards. Rotate the world and the optimal direction rotates
   with it (97.9–98.4%). It is not intended: the source states only a reachability intent.
2. **Why the baseline picks EAST (C).** MOVE action identities are hashes that depend only on the direction
   name, so the key order EAST < SOUTH < WEST < NORTH is fixed in every world. Any "lowest identity" tie-break
   (RESOURCE, NEXUS V2, the P.1A baseline) therefore picks EAST whenever it is legal.

The 0.724 baseline is these two facts lining up. In a rotated corpus the same baseline scores 0.10–0.21.

A separate, important finding: **the official oracle labels are not symmetry-equivariant.** Optimal sets change in
7–30% of transformed worlds. That is caused by key-ordered tie-breaks inside the greedy continuation rollout, plus a
kernel RETREAT rule that prefers the x axis.

## 2. Direction vocabulary

| Direction | Delta | Action key |
| --- | --- | --- |
| EAST | (+1, 0) | `3491a81f…` |
| SOUTH | (0, +1) | `821eee49…` |
| WEST | (−1, 0) | `ba6697eb…` |
| NORTH | (0, −1) | `c5c63c22…` |

- **Identity rule.** `forgeActionKey = sha256(stableStringify([actionType, actorId, target, parameters]))`, with
  descriptor `{ actionType: "MOVE", actorId: "actor", target: null, parameters: { direction } }`. The actor id is
  `"actor"` in every world, so each direction's key is constant.
- **Enumeration.** `legalActions` iterates `Object.keys(FORGE_MOVE_DIRECTIONS).sort()` (EAST, NORTH, SOUTH, WEST)
  and adds a MOVE only for an unblocked cell (`kernel.js:252`). The whole legal list is then re-sorted by key
  (`kernel.js:328`), which erases insertion order.
- **Proof.** In every DEV row, the lowest-identity legal MOVE is the first legal direction in key order. So
  "lowest identity MOVE = EAST" holds exactly whenever EAST is legal.

## 3–4. Optimal and legal direction distribution (DEV, n = 4000)

| | EAST | WEST | SOUTH | NORTH |
| --- | --- | --- | --- | --- |
| P(legal) | 0.902 | 0.900 | 0.909 | 0.907 |
| P(optimal), all rows | 0.629 | 0.180 | 0.076 | 0.053 |
| P(optimal), MOVE-optimal rows (3599) | 0.699 | 0.200 | 0.084 | 0.059 |
| **P(optimal \| legal)** | **0.697** | **0.200** | **0.083** | **0.058** |

- **Legality is not the cause.** All four directions are legal about 90% of the time; the skew is in optimality
  given legality.
- **Ties are preserved, not collapsed.** Exactly one direction is optimal in 3458 rows, two in 131, three in 10
  (3.9% multi-direction). Co-optimal sets: NORTH+WEST 36, EAST+WEST 32, SOUTH+WEST 31, EAST+NORTH 17, EAST+SOUTH 15,
  EAST+SOUTH+WEST 6, EAST+NORTH+WEST 4.
- **By group.** EAST dominates in every role mix (0.68–0.73), topology (0.65–0.75), objective (0.62–0.74) and
  horizon band (0.62–0.73). It grows with level (0.57 at L0 to 0.80 at L5) and with lower energy (HIGH 0.58, MID
  0.71, LOW 0.77).
- **Actor start region is the tell.** With the actor in the western third, EAST is 0.78–0.81 and WEST 0.08–0.11.
  With the actor in the eastern third, EAST falls to 0.53–0.57 and WEST rises to 0.32–0.35: the EAST cell is more
  often off-grid, so the resource lands WEST.

## 5. Placement audit (privileged geometry, diagnosis only)

Positions at the decision equal spawn positions: the warm-up only WAITs and is truncated on any positional change.

| Group | n | East of actor | West | South | North | Asymmetric |
| --- | --- | --- | --- | --- | --- | --- |
| **material resource** | 4000 | **0.781** (adjacent E 0.780) | 0.173 (adj W 0.172) | 0.040 (adj 0.039) | 0.009 (adj 0.008) | **yes** |
| other resources | 6649 | 0.465 | 0.460 | 0.464 | 0.467 | no |
| objective / critical | 6952 | 0.461 | 0.467 | 0.467 | 0.457 | no |
| hostiles | 2655 | 0.470 | 0.452 | 0.465 | 0.464 | no |
| dependency hubs | 5669 | 0.466 | 0.462 | 0.471 | 0.462 | no |
| structural topology nodes | 62665 | 0.472 | 0.461 | 0.468 | 0.465 | no |
| civilians / substitutes / barriers | 4033 / 4679 / 1278 | — | — | — | — | no |
| hazard / blocked cells | 13193 / 6493 | 0.481 / 0.475 | 0.457 / 0.469 | — | — | no |

Actor spawn is centred: mean normalized x 0.498 and y 0.498; mean distance to the east, west, north and south edges
is 6.04, 5.97, 6.00 and 6.02. Only one group is directionally biased, and its EAST > WEST > SOUTH > NORTH ordering
is exactly the candidate order in `placeNear`.

## 6. Generator and pipeline source audit (read-only; located at certify time)

| Finding | Location | Directional |
| --- | --- | --- |
| `placeNear` candidates start at `x + 1` (EAST), then x−1, y+1, y−1 | `src/forge/scenarios-v2.js:162` | **yes** |
| first free candidate wins (`candidates[0]`) | `src/forge/scenarios-v2.js:168` | **yes** |
| `material` RESOURCE placed with `placeNear` beside the actor | `src/forge/scenarios-v2.js:257` | **yes** |
| row-major free-cell list, uniform random index | `src/forge/scenarios-v2.js:137` | no (measured symmetric) |
| hazards and blocked terrain uniform over the symmetric interior | `src/forge/scenarios-v2.js:125` | no |
| MOVE enumeration over sorted direction names | `src/forge/kernel.js:252` | no (erased by key sort) |
| legal actions sorted by hash key | `src/forge/kernel.js:328` | **yes** (fixed MOVE key order) |
| RETREAT steps along x whenever dx ≠ 0 | `src/forge/kernel.js:318` | **yes** (breaks 90° rotations) |
| greedy continuation breaks rank ties by action key | `src/forge/counterfactual-v2.js:81` | **yes** (labels) |
| greedyRegret uses the lowest-key immediate optimum | `src/forge/counterfactual-v2.js:257` | **yes** (labels) |
| GREEDY baseline / GREEDY_SAFE tie-break by key | `src/lab/stage3c-learned-nexus.js:434` | **yes** |
| RESOURCE cheapest-then-lowest-key | `src/stage3f/deployable-action-proposal-v1.js:125` | **yes** |
| NEXUS V2 ranking tie-break by key | `src/stage3f/nexus-selector-v2-candidate.js:91` | **yes** |
| warm-up plays only WAIT | `src/forge/warmup.js:269` | no |

`topology.js` has no geometry. No source documents a directional intent. There is no fixed spawn corner, no
topology orientation and no traversal-order placement.

## 7. Symmetry transform contract (`FORGE_SYMMETRY_TRANSFORM_V1`, diagnostic only)

`ROTATE_90`, `ROTATE_180`, `ROTATE_270`, `REFLECT_X` and `REFLECT_Y`, plus an `IDENTITY` control, in screen
coordinates.

- **Mapped:** grid dimensions and cells, entity positions, hazard positions, positional events, MOVE directions,
  RETREAT destinations.
- **Carried unchanged by declaration:** ids, types, values, health, flags, resources, relations, objectives,
  constraints, channels, history, and targets of targeted actions.
- **Fails closed** on rotation of a non-square grid, unknown transforms or directions, and unrecognised positional
  hazard or event fields.
- **Verified properties:** transform-then-inverse restores the world byte-for-byte; the input is never mutated;
  nothing in `src/` imports it.

## 8–9. Equivariance (all 4000 DEV rows × 5 transforms)

| Transform | valid | legal surface | optimal set | set \| legal equivariant | regret (row) | tie-break artifact | legal-surface artifact | unexplained | frame-consistent replica | GREEDY_SAFE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IDENTITY (control) | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0 | 0 | 0 | 1.000 | 1.000 |
| ROTATE_90 | 1.000 | 0.605 | 0.724 | 0.865 | 0.689 | 441 | 662 | 3 | 0.834 | 0.892 |
| ROTATE_180 | 1.000 | 1.000 | 0.862 | 0.862 | 0.686 | 552 | 0 | 0 | **1.000** | 0.893 |
| ROTATE_270 | 1.000 | 0.605 | 0.705 | 0.846 | 0.689 | 515 | 663 | 1 | 0.834 | 0.868 |
| REFLECT_X | 1.000 | 1.000 | 0.871 | 0.871 | 0.702 | 515 | 0 | 0 | **1.000** | 0.900 |
| REFLECT_Y | 1.000 | 1.000 | 0.927 | 0.927 | 0.767 | 293 | 0 | 0 | **1.000** | 0.952 |

**Required flags.**
- `TRANSFORMATION_VALID=true`.
- `OPTIMAL_SET_EQUIVARIANT=false` (0.705–0.927, all below the 0.99 bar).
- `REGRET_EQUIVARIANT=false` (up to 424 regret difference on individual actions).

**Attribution** (replica of the official oracle, exact on 400 sampled rows in W and in each transform):
- **Tie-break artifact.** For the axis-preserving transforms (180°, both reflections), breaking continuation ties
  by each action's identity in W's frame restores **100%** equivariance. The sole cause there is the key-ordered
  continuation tie-break (`counterfactual-v2.js:81`). It affects 11.3% of those transform-rows.
- **RETREAT rule.** For 90° and 270° rotations, the legal surface differs in 39.5% of rows, always by RETREAT
  (`kernel.js:318`, x axis first). That accounts for 662 and 663 of the remaining mismatches.
- **Unexplained.** 4 transform-rows are unexplained at the root. All are hostile scenarios under 90° rotations,
  which is consistent with RETREAT diverging inside rollout states. Not verified.

**Labels.** GREEDY_SAFE and horizon class disagree on 192–528 rows per transform, the same rows for both: in W the
two labels agree on 3999/4000 rows because the best immediate action is almost always unique. So the historical
GREEDY_SAFE label carries orientation-dependent noise of 5–13%.

## 10. Policy equivariance

| Policy | ROT90 | ROT180 | ROT270 | REFLECT_X | REFLECT_Y | Directionally biased |
| --- | --- | --- | --- | --- | --- | --- |
| GREEDY | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | no |
| RESOURCE_PRESERVING_V1 | 0.086 | 0.042 | 0.095 | 0.040 | 0.747 | **yes** |
| NEXUS_SELECTOR_V1 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | no |
| NEXUS_SELECTOR_V2_CANDIDATE | 0.330 | 0.272 | 0.336 | 0.277 | 0.927 | **yes** |
| OBJECTIVE_TARGETING_V1 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | no |
| THREAT_COVERING_V1 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | no |

The environment's EAST preference and the policies' EAST preference are different things. Target-based policies
and GREEDY are fully equivariant. The two policies that choose MOVEs by lowest identity carry a fixed EAST bias,
which is why they stay closer to equivariant only under REFLECT_Y, where EAST is unchanged.

## 11. EAST under rotation

| Transform | EAST maps to | P(mapped direction optimal in T(W) \| EAST optimal in W) | P(EAST still optimal) | Rotates with world | Lowest-identity MOVE accuracy in T corpus |
| --- | --- | --- | --- | --- | --- |
| IDENTITY | EAST | — | — | — | 0.721 |
| ROTATE_90 | SOUTH | **0.979** | 0.014 | yes | **0.123** |
| ROTATE_180 | WEST | **0.979** | 0.012 | yes | **0.202** |
| ROTATE_270 | NORTH | **0.981** | 0.009 | yes | **0.098** |
| REFLECT_X | WEST | **0.984** | 0.011 | yes | **0.210** |
| REFLECT_Y | EAST | 0.983 | 0.983 | n/a | 0.713 |

(n = 2515 rows with EAST optimal in W.) The optimal direction rotates with the world. The EAST result is
**primarily scenario orientation from resource placement**, not an intrinsic property of the task dynamics. The
fixed-EAST baseline is not a signal: rotate the benchmark and it scores 0.10–0.21.

## Classification

| Component | Held | Basis |
| --- | --- | --- |
| A intentional task property | no | no documented directional intent; `placeNear` states reachability only |
| B accidental scenario-generation asymmetry | **yes** | located at `scenarios-v2.js:162-168` and measured (material E−W = +0.61) |
| C action-identity / ordering artifact | **yes** | lowest-identity MOVE = EAST proven; tie-break artifact 11.3% of axis-preserving rows; RESOURCE and V2 directionally biased |
| D topology / orientation artifact | no | topology has no geometry; structural, critical and hub placement symmetric (the kernel's RETREAT axis rule is reported separately) |
| E objective / resource placement artifact | **yes** | material placement asymmetric and EAST optimality rotates with the world |

**Primary: `F_MIXTURE` (B + C + E).**

## Implications (no action taken in this stage)

- Stage 3F.6-P.1A's EAST baseline, RESOURCE's MOVE success and V2's standalone gain all partly measure this
  coincidence, not transferable skill. The P.1A conclusion that relational geometry does not predict direction was
  measured against this biased baseline. Relational features scored below it on these worlds, so this audit does
  not overturn that conclusion, but it was not re-tested on symmetric data here.
- Historical GREEDY_SAFE labels, and every router and decision-rule result built on them, carry 5–13%
  orientation-dependent label noise.
- A fix would belong in new, versioned, additive generator and oracle code (e.g. a symmetric `placeNear` candidate
  order or randomized orientation, and a direction-neutral continuation tie-break), never an edit to the frozen
  generators. None was made.

## Authority

R0, non-dispatching, no online learning, nothing promoted. `READY_FOR_FRESH_NEXUS_CONFIRMATION=false`,
`READY_FOR_ROUTER_RETRAIN=false`, `READY_FOR_STAGE3G=false`.

## Reproduce

```bash
npm run stage3f6p1b:generate
npm run stage3f6p1b:certify
npm run stage3f6p1b:check
npm run test:stage3f6p1b
```

The analysis plan is committed; `npm run stage3f6p1b:plan` rewrites the identical file.
