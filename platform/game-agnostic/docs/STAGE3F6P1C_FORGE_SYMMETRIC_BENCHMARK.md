# Stage 3F.6-P.1C — Forge Symmetry Remediation (`FORGE_SYMMETRIC_V2`)

Certification `81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d`
Analysis plan `91b1c3eebf9a4ced0e043f2e4a35d1276bf7241d72570022e201ec3aae7ffa86` (hashed before the evaluation)
Fresh DEV evidence `c802aefd…c50a` (1200 worlds, seeds 1001–1011, gitignored)

This stage repairs the benchmark. It does not repair Sentinel. No policy, router, feature contract or Sentinel
module was modified, and no confirmatory corpus was generated.

## Result

**`A_SYMMETRIC_BENCHMARK_CANDIDATE_CERTIFIED`.** On a fresh DEV sample the candidate benchmark is
direction-neutral and exactly equivariant: legal surfaces, optimal sets, regrets, labels and RETREAT all
score **1.000** under all five transforms, with **zero** declared-exception rows.

The diagnostic consequence is large: with the directional coincidence removed, **RESOURCE accuracy falls
from 0.609 to 0.265** and **NEXUS V2 from 0.658 to 0.306**.

## Historical preservation

| | |
| --- | --- |
| Forge V1 sources byte-identical to HEAD | yes (12 files: kernel, both generators, counterfactual-v2, record-v2, reward-v2, warmup, topology, adapter, contract, dataset-v2, validators-v2) |
| Historical records reproduce | 20 / 20 sampled DEV records rebuild to the same `recordHash` |
| Historical corpora and evidence | untouched (git-clean) |
| Historical certificates | 3F.6-A, 3F.6-P, 3F.6-P.1, 3F.6-P.1A, 3F.6-P.1B all intact; the P.1B transform-gate hash unchanged |
| Policies | unchanged, `POLICY_SET_HASH` unchanged |

## New benchmark identities

| Role | Identity | Source |
| --- | --- | --- |
| Benchmark | `FORGE_SYMMETRIC_V2` | — |
| Generator | `FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1` | `src/forge-symmetric/scenarios-symmetric-v1.js` |
| Action surface | `FORGE_ACTION_SURFACE_SYMMETRIC_V1` | `src/forge-symmetric/action-surface-symmetric-v1.js` |
| Oracle | `FORGE_COUNTERFACTUAL_SYMMETRIC_V1` | `src/forge-symmetric/counterfactual-symmetric-v1.js` |
| Label | `FORGE_GREEDY_SAFE_SYMMETRIC_V1` | (same module) |
| Geometry | `FORGE_ORIENTATION_SYMMETRIC_V1` | `src/forge-symmetric/orientation-symmetric-v1.js` |

All four modules live in a new owner directory `src/forge-symmetric/`, so `src/forge` stays exactly as certified. Historical `scenarios-v2/v3` and `counterfactual-v2` are
imported unmodified.

## The three repairs

**1. Direction-neutral placement (DEFECT_1).** The frozen V2 generator places the actor's `material`
resource with a fixed EAST-first candidate order. The symmetric generator keeps that canonical geometry and
then rotates or reflects the whole scenario by a **seed-bound element of D4**, derived from the frozen V3
scenario seed (`deriveSeed(scenarioSeed, 'forge-symmetric-orientation-v1') mod 8`). Deterministic,
reproducible, no wall-clock or ambient randomness.

**2. Symmetry-neutral tie-break (DEFECT_2).** Historical `counterfactual-v2` breaks continuation ties by
`forgeActionKey`, whose MOVE order (EAST < SOUTH < WEST < NORTH) is identical in every world. The symmetric
oracle breaks every tie — rollout, optimal representative and the label's greedy choice — by the action's
identity **in the canonical frame of the root world**: the D4 element minimising a geometry digest. Because
D4 is closed, `canonical(T(W)) ∘ T = canonical(W)`, so a world and its transformed twin break ties
identically. The frame is computed once at the root and held fixed through the rollout.

**3. Equivariant RETREAT (DEFECT_3).** The kernel resolves RETREAT with a global x-before-y preference. The
symmetric surface keeps RETREAT's meaning — step away from the nearest live hostile — but picks the
reachable neighbour that **maximises distance** from that hostile, ties broken in the canonical frame. No
axis is preferred. Because the frozen kernel's `checkLegality` only accepts actions the kernel itself
offers, a symmetric RETREAT **executes as the kernel MOVE onto the same cell**, which is the identical
transition. The benchmark verifies on every row that the symmetric surface reaches exactly the same
successor states as the kernel surface (1200/1200).

**4. Labels (DEFECT_4).** `FORGE_GREEDY_SAFE_SYMMETRIC_V1` keeps the historical meaning (is the
best-immediate action in the horizon-optimal set) and inherits the repairs. Historical GREEDY_SAFE records
are untouched.

**Identity is not tie-break order.** Action identities remain the frozen `forgeActionKey`; only the
*ordering used to break semantic ties* moved to the canonical frame.

## Direction distribution (fresh DEV, n = 1200)

| | EAST | NORTH | SOUTH | WEST |
| --- | --- | --- | --- | --- |
| P(legal) | 0.868 | 0.873 | 0.883 | 0.886 |
| **P(optimal \| legal)** | **0.267** | **0.215** | **0.273** | **0.285** |

Mean 0.260, maximum deviation 0.045 (bar: 0.15). Historical Forge was EAST 0.697 against WEST 0.200,
SOUTH 0.083, NORTH 0.058. Orientations are spread across all eight D4 elements (135–171 worlds each).

## Placement (material resource relative to the actor)

| | EAST | NORTH | SOUTH | WEST |
| --- | --- | --- | --- | --- |
| historical | **0.78** | 0.01 | 0.04 | 0.17 |
| **symmetric** | **0.241** | 0.223 | 0.258 | 0.274 |

Maximum share 0.274 (bar: 0.40). Beyond-adjacent placements are 0.4% of worlds.

## Equivariance (all 1200 worlds × 5 transforms)

| Transform | legal surface | optimal set | regret | label | RETREAT (n=601) | mapped optimal direction preserved | fixed-EAST persistence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ROTATE_90 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.061 |
| ROTATE_180 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.011 |
| ROTATE_270 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.061 |
| REFLECT_X | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.011 |
| REFLECT_Y | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 (EAST maps to EAST) |

41,475 action-level regret comparisons, **0 mismatches**. Successor-state coverage 1.000. The declared
`DIHEDRAL_SELF_SYMMETRIC_WORLD` exception occurred **0 times**, so no row was excluded from the 1.0 targets.
Historical Forge, by contrast, scored 0.705–0.927 on optimal sets and 0.868–0.952 on labels.

## Fixed-direction baselines (MOVE-optimal rows)

| FIXED_EAST | FIXED_NORTH | FIXED_SOUTH | FIXED_WEST | LOWEST_ID_MOVE | DETERMINISTIC_RANDOM_MOVE |
| --- | --- | --- | --- | --- | --- |
| 0.317 | 0.254 | 0.322 | 0.338 | **0.317** | **0.319** |

Spread 0.084 (bar 0.15). The lowest-identity move is within 0.002 of random (bar 0.10), against 0.72 on
historical Forge. The lowest-identity MOVE is still EAST whenever EAST is legal (86.8%) — the action-key
order is unchanged by design — but that now buys nothing.

## Historical policies, read-only diagnostic

On NEXUS-proposing rows (n = 998), against the Stage 3F.6-P.1A values:

| Policy | historical acc | symmetric acc | Δacc | historical regret | symmetric regret | Δregret |
| --- | --- | --- | --- | --- | --- | --- |
| RESOURCE_PRESERVING_V1 | 0.609 | **0.265** | **−0.345** | 27.44 | 31.92 | +4.48 |
| NEXUS_SELECTOR_V1 | 0.227 | 0.083 | −0.144 | 50.25 | 31.39 | −18.86 |
| NEXUS_SELECTOR_V2_CANDIDATE | 0.658 | **0.306** | **−0.353** | 21.71 | 26.52 | +4.80 |

Other policies on the candidate: OBJECTIVE 0.415 (coverage 10.6%), THREAT 0.256 (4.3%), GREEDY 0.143.
V2's RESOURCE agreement falls from 0.771 to 0.651.

**Shortcut separation (Section 17).** The *resource-cost* shortcut survives: a zero-declared-cost action is
optimal in 85.0% of worlds (historical 90.0%). The *directional* shortcut is gone: P(RESOURCE correct |
zero-cost optimal exists) falls from 0.680 to 0.312, and RESOURCE is never correct when no zero-cost action
is optimal (unchanged, structural). Knowing that a cheap action is optimal no longer tells you *which* cheap
action, because the answer is no longer "EAST".

**Comparability caveat.** These are different worlds, not paired ones: the candidate uses a fresh seed space,
and regret scales differ between corpora. Accuracy (optimal-set membership) is the comparable quantity;
regret deltas should be read as scale-dependent.

## Historical impact

| Stage | Headline claim | Impact |
| --- | --- | --- |
| 3F.6-C | CORE predicts GREEDY_SAFE; the deployable fallback cannot compute the action | MINOR_NUMERICAL_CONFOUND |
| 3F.6-A | proposal contract: producers distinct, decision-time, simulator-free | **UNAFFECTED** |
| 3F.6-T | no trained router materially beats always-RESOURCE | **REQUIRES_RERUN** |
| 3F.6-W | risk enrichment adds little to predicting the best policy | **REQUIRES_RERUN** |
| 3F.6-D | cost-sensitive rules beat argmax only marginally, collapse to RESOURCE | **REQUIRES_RERUN** |
| 3F.6-P | policy quality is binding; RESOURCE KEEP, NEXUS REDESIGN_CANDIDATE | **REQUIRES_RERUN** |
| 3F.6-P.1 | PROTECT gating improves V2 but collapses onto RESOURCE | **REQUIRES_RERUN** |
| 3F.6-P.1A | available relational spatial context cannot pick MOVE direction (baseline 0.724) | **REQUIRES_RERUN** |

Architectural and contractual findings stand. What requires rerunning are the *comparative policy numbers*,
because the policy whose strength anchored every comparison (RESOURCE) loses a third of its accuracy once the
directional coincidence is removed.

## Authority

R0, non-dispatching, no online learning, nothing promoted. 19/19 stage tests pass.

## Reproduce

```bash
npm run stage3f6p1c:generate
npm run stage3f6p1c:certify
npm run stage3f6p1c:check
npm run test:stage3f6p1c
```

## Next

A new corpus lineage (`NEW_DEV`, `NEW_CAL`, `NEW_HOLDOUT`, `NEW_OOD`) on a fresh seed space under these new
identities is required before any policy, router or Stage 3G claim. It is **not** generated here.
