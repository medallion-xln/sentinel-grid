# Stage 3F.6-P.1A — NEXUS Relational Spatial Context

Certification `c4029ff96e617341b448ae5d4f1853f6d21186134a64ce6162acc755394f40be`
DEV freeze `3b2451d7fbc447bd3aab6bf3ef9bb64015ac297f81e1bb3398c241218ea1617d`
Contract `SENTINEL_NEXUS_RELATIONAL_SPATIAL_CONTEXT_V1`, hash `0f22ffa3…0961`

This is a narrow feasibility substage under Stage 3F.6-P.1, not a new roadmap stage.

## The question

Does NEXUS need to know where relationally important entities are, relative to the actor and to threats,
in order to turn relational understanding into useful action? And is a governed, deployable form of that
information enough, without collapsing into RESOURCE or becoming a planner?

## Answer

**No.** Result: **`D_AVAILABLE_SPATIAL_CONTEXT_INSUFFICIENT`**.

MOVE direction really is the binding limitation. A V2 that always picked the best direction would cut
policy-set oracle regret from 16.51 to 5.64. But no relational-spatial relation predicts the correct
direction better than the fixed lowest-identity baseline, and that baseline is EAST. This holds for the
deployable fields and even for privileged kernel geometry. The correct MOVE follows non-relational hidden
facts: how close resource pickups are and how valuable the adjacent entities are. Following those would
make NEXUS a greedy navigator. **No V3 candidate was constructed, and CAL was not authorized.**

## Discipline

- **V1 and V2 preserved.** Both are byte-identical to HEAD and to the Stage 3F.6-P.1 freeze, and neither was
  modified.
- **Separated evidence blocks.** The DEV evidence stores three blocks separately:
  - `decisionInput`: the live ObservationPacket features, the canonical relational state, and the *live*
    legal action surface with its declared parameters.
  - `labels`: offline evaluation only.
  - `privilegedDiagnostic`: kernel entity positions and terrain. It is never passed to any policy or to the
    contract derivation, and is used only offline to test whether hidden geometry would have been enough.
- **Live surface verified.** Live adapter actions and kernel descriptors had 0 mismatches.
- **Freeze before CAL.** The DEV analysis, contract hash, field decisions, advancement rule and CAL gate
  were frozen before any CAL access. The CAL generator refuses unless the freeze authorizes CAL, and it did
  not. No CAL evidence exists.
- **Rules written after exploration.** DEV-only exploratory scripts ran before the freeze; the freeze
  discloses this.

## What NEXUS can observe (Section 5, verified on all 4000 DEV rows)

| Item | Category | Source |
| --- | --- | --- |
| Actor position | **OBSERVED** | `features[3..4]`, equal to the kernel position in every row |
| Threat position | **PRIVILEGED** | kernel only. A legal RETREAT reveals the one-step cell away from the nearest hostile, along one axis (legal in 40.7% of rows). A legal ATTACK reveals an adjacent hostile. |
| Relational or dependency target position | **PRIVILEGED** | kernel only. A legal targeted action proves its target is within range 1; absence proves nothing. |
| Adjacency | DERIVED_FROM_OBSERVATION | legal targeted actions; incomplete, because energy and flags gate which actions are legal |
| Legal MOVE destinations | DERIVED_FROM_OBSERVATION | live `parameters.direction` + declared deltas + observed actor cell |
| Terrain / hazards / entity value | **PRIVILEGED** | kernel only |

`canonicalState` carries no positions, only id, kind, hostile and critical. No grid reaches the decision
input. Hidden state was not required to *derive* the contract fields, but a useful direction signal would
have required it.

## MOVE audit (Section 8, DEV)

- `MOVE_OPTIMAL_N=2994` of 3337 NEXUS-proposing rows.
- Legal MOVE count: 4 in 1953 rows, 3 in 929, 2 in 112.
- Optimal MOVEs out of legal MOVEs: 1/4 in 1858 rows, 1/3 in 900, 1/2 in 112, 2/4 in 86, 2/3 in 29,
  3/4 in 9. Usually exactly one direction is right.
- Best and worst MOVE differ by 104.0 regret on average.
- **Layout artefact.** The lowest-identity MOVE is EAST whenever EAST is legal, because action identities are
  hashes of fixed direction parameters. EAST is optimal in 77.6% of the rows where it is legal. NORTH 6.6%,
  SOUTH 9.7%, WEST 21.8%. So the "arbitrary" MOVE chosen by V2 and RESOURCE is effectively "go EAST".
- Baseline direction accuracy (lowest identity) 0.724; random direction 0.297.

## Field information value (Sections 7 and 10)

Direction value is measured on rows where the field separates the legal MOVEs, against the lowest-identity
baseline on the same rows. Both orientations were tried and the better one is reported. The bar is ≥ 200
rows and delta ≥ +0.05.

| Field | Category | Rows | Field acc | Baseline | Δ | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| moveAlignsWithRetreat | deployable | 1455 | 0.446 | 0.756 | −0.310 | rejected: no incremental value |
| moveOpposesRetreat | deployable | 1439 | 0.449 | 0.756 | −0.307 | rejected: no incremental value |
| moveChangesThreatenedDistance | privileged | 1843 | 0.459 | 0.717 | −0.258 | rejected: not deployable |
| moveChangesHostileDistance | privileged | 1720 | 0.448 | 0.718 | −0.270 | rejected: not deployable |
| moveChangesDependencyHubDistance | privileged | 1199 | 0.464 | 0.758 | −0.294 | rejected: not deployable |
| moveChangesCriticalDistance | privileged | 2891 | 0.467 | 0.726 | −0.259 | rejected: not deployable |
| moveInterposesThreat | privileged | 435 | 0.430 | 0.713 | −0.283 | rejected: not deployable |
| moveChangesThreatenedAdjacency | privileged | 144 | 0.438 | 0.604 | −0.167 | rejected: not deployable |
| *approachResource* | *non-relational reference* | 2990 | **0.863** | 0.724 | **+0.140** | reference only |
| *adjacentProtectableValue* | *non-relational reference* | 2980 | **0.840** | 0.725 | **+0.115** | reference only |
| *avoidHazard* | *non-relational reference* | 213 | 0.606 | 0.521 | +0.085 | reference only |

**Separability summary.**

| Direction rule | Accuracy | Δ vs baseline 0.724 |
| --- | --- | --- |
| Best deployable relational (moveOpposesRetreat, prefer false) | 0.576 | −0.148 |
| Best privileged relational (moveChangesThreatenedAdjacency) | 0.716 | −0.008 |
| Best non-relational reference (approachResource) | 0.863 | +0.139 |

Within V1-best episodes, privileged critical distance is modestly positive (+0.079, n = 1105), and
threatened adjacency is +0.146 on only 41 rows. Both are negative overall.

**PROTECT vs MOVE (deployable adjacency evidence).** PROTECT is the better choice in only 9.5% of NEXUS rows.
With a threatened adjacent target that rises to 59.5% (n = 79); with a dependency hub, 40.2% (n = 127); with a
critical entity, 25.0% (n = 156). All are below 200 rows, and accuracy deltas over the no-PROTECT mapping
are +0.002, −0.008 and −0.016. None is accepted.

**Accepted fields: none.** Separability is not meaningful.

## Relational MOVE semantics (Section 9, per legal MOVE in MOVE-optimal rows)

| Effect | P(optimal \| with) | P(optimal \| without) | Lift | Evidence |
| --- | --- | --- | --- | --- |
| approach threatened entity | 0.327 | 0.251 | 1.30 | supported vs a random direction |
| approach unsupported threatened entity | 0.330 | 0.248 | 1.33 | supported vs a random direction |
| leave nearest hostile | 0.272 | 0.306 | 0.89 | contradicted |
| interpose between threat and victim | 0.286 | 0.291 | 0.98 | no effect |
| preserve dependency-hub adjacency | 0.044 | 0.350 | 0.13 | insufficient (68 MOVEs) |
| align with retreat (deployable) | 0.424 | 0.224 | 1.89 | supported vs a random direction |
| *approach resource (reference)* | 0.849 | 0.063 | 13.5 | supported |
| *avoid hazard (reference)* | 0.294 | 0.068 | 4.30 | supported |

Some relational effects beat a *random* direction, but none carries information beyond the fixed EAST
preference already available to V2 and RESOURCE. Resource proximity dominates.

## DEV policies (NEXUS-proposing rows, n = 3337)

| | acc | regret | p95 | MOVE-direction correctness | V1-best acc / regret | RES agree | GREEDY agree | P(correct ∧ RES wrong) | oracle regret |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V1 | 0.227 | 50.25 | 143 | — (no MOVE) | 0.524 / 29.31 | 0.000 | 0.822 | 0.091 | **16.51** |
| V2 | 0.658 | 21.71 | 122 | 0.735 | 0.482 / 38.10 | 0.771 | 0.043 | 0.085 | 19.21 |
| RESOURCE | 0.609 | 27.44 | 137 | 0.719 | 0.314 / 54.44 | 1.000 | 0.000 | 0.000 | 25.15 (without NEXUS) |
| *V2 + perfect direction (ceiling)* | 0.882 | 4.63 | 32 | 1.000 | 0.838 / 4.66 | 0.553 | 0.043 | 0.302 | *5.64* |
| V3 | not constructed | | | | | | | | |

## Advancement and the CAL gate

Frozen advancement rule, all required: V3 constructed; material over V1; oracle not worse than V1; RESOURCE
agreement < 0.5 with independent correct choices ≥ V1's; no tail regression; no privileged input.

It failed at the first criterion: no V3 exists. `CAL_EVALUATION_AUTHORIZED=false`, so CAL was not generated
or read.

## Boundary checks

Static audits ran on the contract source with comments and string literals stripped. They find no future
state, outcome, regret, optimal label, simulator, rollout or hidden-state access. The import closure is
`core/determinism`, `core/errors` and `stage3f/deployable-action-proposal-v1`.

A dynamic probe ran 400 DEV rows with poisoned `optimalSet`, `regret`, `labels`, `outcome`, `nextState`,
`futureState`, `scalarReward`, `privilegedDiagnostic`, `grid`, `position`, `cost` and `world` fields: 0
accesses, 0 output changes. The contract exposes relative steps only and fails closed on missing evidence
(`NO_POSITION_EVIDENCE`, `UNKNOWN_HOSTILE_GEOMETRY`, `NO_ADJACENCY_EVIDENCE`, `UNKNOWN_DIRECTION`).

**Static audit correction.** On the first test run, two static audits matched documentation strings inside
the contract rather than code. String-literal contents are now stripped before auditing. Bracket-string
access is covered by the dynamic probe. The freeze, rules and metrics are unchanged.

## Diagnosis

- **Primary:** `D_AVAILABLE_SPATIAL_CONTEXT_INSUFFICIENT`.
- **Secondary:** `PRIVILEGED_RELATIONAL_GEOMETRY_ALSO_ANTI_PREDICTIVE` +
  `MOVE_DIRECTION_DRIVEN_BY_NON_RELATIONAL_HIDDEN_FACTORS` + `LOWEST_IDENTITY_MOVE_IS_EAST_LAYOUT_ARTEFACT` +
  `MOVE_DIRECTION_IS_PRIMARY_LIMITATION`.

In Forge, the correct first MOVE is chosen by where the next greedy step can collect or protect value. It
is not chosen by where the relational structure is. Relational spatial context therefore cannot turn
NEXUS's diagnosis into the right move, and the information that would is outside NEXUS's role. It is also
hidden from the observation.

## Roadmap

`READY_FOR_FRESH_NEXUS_CONFIRMATION=false` · `READY_FOR_ROUTER_RETRAIN=false` · `READY_FOR_STAGE3G=false`.
R0, non-dispatching, no online learning, nothing promoted.

## Reproduce

```bash
npm run stage3f6p1a:generate:dev
npm run stage3f6p1a:certify
npm run stage3f6p1a:check
npm run test:stage3f6p1a
```

`stage3f6p1a:freeze` refuses once a freeze exists. The committed freeze is re-derived from regenerated DEV
evidence and must match byte-for-byte.
