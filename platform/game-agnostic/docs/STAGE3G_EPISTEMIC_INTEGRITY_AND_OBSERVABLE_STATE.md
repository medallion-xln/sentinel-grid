# Stage 3G.1 / 3G.2 — Epistemic Integrity and Canonical Observable Entity State

Stage 3G asks whether Sentinel can build a trustworthy current world state, represent actions relative to that world,
tell observed fact from inference, and prepare for decision-relevant prediction without contaminating authoritative
state. This first substage covers two parts:

- **3G.1, epistemic integrity:** what kind of knowledge each value is, and the rules that stop predictions,
  counterfactuals or synthetic data from becoming authoritative.
- **3G.2, canonical observable entity and spatial state:** where the relevant entities are relative to the actor, and
  what each legal action means spatially, using only what the environment shows at decision time.

No world model is trained. There is no JEPA, no Router 2.0 and no Expert #10. No expert or policy is changed, and no
counterfactual prediction is made. Authority stays R0.

Stage 3F is frozen inheritance. Stage 3G reads its freeze (`41748ff6…`), its certificate (`0fe5d3e2…`) and its 18
immutable facts (`IMMUTABLE_FACTS_HASH=ab4d7f31…`). It never rewrites any of them.

| Artifact | Role |
| --- | --- |
| `src/stage3g/epistemic-provenance-v1.js` | `SENTINEL_EPISTEMIC_PROVENANCE_V1`: classes, records, promotion rules, epistemic state, contamination audit |
| `src/stage3g/observable-entity-state-v1.js` | `SENTINEL_OBSERVABLE_ENTITY_STATE_V1`: the visible-map channel, entity schema, field classification, privileged boundary |
| `src/stage3g/action-semantics-v1.js` | `ACTION_SEMANTICS_V1`: per-action contract, action-relative spatial state, scoring blocks |
| `scripts/stage3g/plan.mjs`, `scripts/stage3g-plan.mjs` | The pre-registered analysis plan, and its writer/checker |
| `scripts/stage3g/evidence.mjs` | Per-row OLD/NEW evidence and integrity probes |
| `scripts/generate-stage3g-sealed.mjs` | Sealed partitions (new seed space), gated on the freeze commit |
| `scripts/certify-stage3g-predictive-integrity.mjs` | Open phase, sealed evaluation, certificate, `--check` |
| `tests/stage3g-epistemic-integrity.test.js`, `tests/stage3g-observable-state.test.js` | Tests |

## 3G.1 — Epistemic schema

### The candidate taxonomy, evaluated

The candidate scale E0–E5 was checked against three existing contracts:

- `SENTINEL_WORLD_STATE_V1`, with categories OBSERVED, DERIVED, PREDICTED and UNKNOWN;
- the Stage 3F.6-P.1A-SYM feature classes;
- the Stage 3F freeze rule "deployable / privileged / oracle".

The six names are kept, with six changes:

1. **`EU` (UNKNOWN) is added.** World State V1 already has it, and fail-closed reads need an explicit absent class.
2. **Access is a separate axis.** The axis is `DEPLOYABLE`, `PRIVILEGED` or `ORACLE`, and it is the Stage 3F provenance
   rule. A kernel position is not a weaker kind of observation. It is a true fact the decision maker may not see. The
   candidate scale mixed the two ideas.
3. **The classes are not a ladder.**
   - E0–E2 are authoritative about the present.
   - E3 is provisional, and a later observation can check it.
   - E4 (counterfactual) and E5 (synthetic) can never be checked, so they can never become authoritative.
4. **Derivation is taint-propagating.** A value computed from any E3, E4 or E5 input takes the weakest input's class. It
   may not claim E1.
5. **E2 needs a trusted verifier.** The verifier must be registered as trusted. The Forge registry is empty, so no Forge
   value is E2.
6. **Memory is history.** A value re-asserted from memory is bound to its original observation. It never overwrites a
   newer observation.

| Class | Name | Tier | Checkable |
| --- | --- | --- | --- |
| E0 | OBSERVED | authoritative | not needed |
| E1 | DETERMINISTICALLY_DERIVED | authoritative | not needed (exact, from VALID E0/E1/E2 only) |
| E2 | EXTERNALLY_VERIFIED | authoritative | by a registered trusted verifier |
| E3 | MODEL_PREDICTION | provisional | by a later observation (CONFIRMED / REFUTED) |
| E4 | COUNTERFACTUAL | non-factual | never |
| E5 | SYNTHETIC | non-factual | never |
| EU | UNKNOWN | absent | — |

Every record carries these fields:

- `epistemicClass`
- `source` (id and kind)
- `sourceStateHash`
- `timestamp` (logical time; for a prediction, also the target time)
- `confidence`
- `validity`
- `invalidationReason`
- `verificationStatus`
- `access`

Records are immutable and content-addressed. Validity and verification change only through logged, deterministic
transitions. Wall-clock time is never an input.

### Promotion rules

| Rule | Effect |
| --- | --- |
| P1 class immutable | There is no promote operation. A request to relabel E3/E4/E5 as E0/E1/E2 is refused and flagged. |
| P2 authoritative slot | Only DEPLOYABLE E0/E1/E2 may hold it. |
| P3 prediction provisional | E3 goes to the provisional lane only, whatever its confidence. |
| P4 counterfactual excluded | E4 never enters runtime state. |
| P5 synthetic excluded | E5 never enters runtime state. A synthetic or simulator-oracle source claiming any other class is refused (masquerade). |
| P6 recency | Older values are history. Equal-time conflicting observations mark the path CONTRADICTED, and it reads as EU until a newer observation arrives. |
| P7 source-state binding | An E0 must carry the hash of the observation registered for its logical time. A replayed or unregistered observation is refused. |
| P8 derivation taint | E1 needs admitted, VALID, E0/E1/E2 inputs and the digest of those inputs. |
| P9 trusted verifier | E2 needs a registered verifier. |
| P10 staleness | A newer observation supersedes the old one, marks derived values STALE, and resolves predictions about that time as CONFIRMED or REFUTED. The authoritative value is the observation, never the prediction. |
| P11 access | PRIVILEGED and ORACLE values are refused from runtime state. |
| P12 unknown | EU never holds a value. Reading an absent or contradicted path returns EU. |

### Task-state contamination flags

`auditContamination(state, trace)` reports these flags. Each is a diagnostic: it has no authority, casts no vote and
cannot change a decision. The audit never modifies state.

| Flag | Raised when |
| --- | --- |
| `STALE_ASSUMPTION` | The trace relies on a SUPERSEDED or STALE record, or a newer authoritative record exists. |
| `UNSUPPORTED_ASSUMPTION` | The path has no authoritative record, the record was never admitted, or an E3/E4/E5 record is used as authoritative. |
| `STALE_PLAN` | A plan's dependent paths changed since the plan was formed. |
| `CONTRADICTED_STATE` | The path is CONTRADICTED, or the record relied on was REFUTED. |
| `UNVERIFIED_STATE_PROMOTION` | A refused promotion attempt occurred, or a non-authoritative class is used as authoritative. |

The epistemic state projects onto World State V1 as follows:

- E0 projects to OBSERVED, and E1 to DERIVED.
- E3 is deliberately not projected. World State V1 would otherwise select a PREDICTED fact as a path's current fact when
  no observation exists.
- E2, E4 and E5 have no World State V1 category and are refused.

## 3G.2 — Observable entity state

### What is observable

Two facts make the visible map legitimate decision-time information:

- The Forge adapter declares `capabilities.imperfectInformation=false`.
- The renderer draws every entity: its cell, its kind (the glyph) and whether it is in service (the glyph's case).

The Stage 3F interfaces discarded that map. The ObservationPacket carries only the actor cell, which is why Stage
3F.6-P.1A classified entity positions as UNAVAILABLE.

`forgeVisibleMap(world)` is the only Stage 3G function that reads a kernel world. It reads through an explicit
whitelist: tick, grid size, terrain per cell, and entity id, kind, position and in-service status. Positions are in the
**presented** frame, and the hidden orientation is never exposed. The ASCII is never parsed. A test checks that the
visible map says exactly what the renderer draws.

This is an environment declaration. Nothing here asserts that any other game is fully observable.

### Entity fields

| Class | Fields |
| --- | --- |
| OBSERVED (E0) | `entityId` (opaque handle), `entityKind`, `observedPosition` (frame-dependent), `inService`, `hostileFlag`, `criticalFlag`, `observedRelationships`, `observationTimestamp` |
| DETERMINISTICALLY_DERIVED (E1) | `actorRelativePosition`, `relativeDistance` (Manhattan and observed-terrain path), `relativeDirection`, `resourceFlag`, `objectiveFlag`, `threatenedFlag`, `hubFlag`, `provenance` |
| MODEL_INFERRED (E3) | `entityFuturePosition`, `entityIntent`: reserved; none is produced |
| UNAVAILABLE (EU) | entity value, non-actor health, cost, risk, resources, private flags |

The actor adds these fields: observed position, energy, health, carried material, ticks remaining and terrain (all E0),
plus border distance (E1).

The state fails closed if the packet and the map disagree about the tick, the actor or any entity's kind.

### Privileged boundary

The following never enter the runtime state:

- kernel-private geometry: base-frame positions, the geometry digest and the canonical frame;
- the hidden orientation;
- oracle optimal actions;
- regret;
- future state;
- rollout results;
- synthetic labels;
- the kernel world digest (`ObservationPacket.metadata.worldHash`);
- entity internals.

Three mechanisms enforce the boundary:

- a recursive privileged-key scan;
- a poisoning probe, which perturbs every unexposed or privileged field and requires the decision-time view to stay
  byte-identical;
- an access spy, which proves that `worldHash` and `scenarioFamily` are never read.

### ACTION_SEMANTICS_V1 and action-relative spatial state

Every Forge action type is declared, with these fields:

- `actionType`, `actor`, `target` and `parameters`;
- `preconditions`, each marked either OBSERVED or IMPLIED_BY_LEGALITY;
- `declaredCost`;
- `deterministicImmediateEffects`;
- `observableSpatialEffect`;
- `failureConditions`;
- `provenance`.

Deterministic effects (E1) are only those the action contract implies for a legal action:

- actor displacement for MOVE and RETREAT;
- the declared energy change;
- the tick advance;
- COLLECT taking the resource out of service, and PROTECT shielding the target;
- the TRANSFER delivery.

Every E1 effect is a claim about the **post-transition** observable state. RESTORE and BUILD do return their target to
service, but a hostile attack or a hazard in the same environment step can take it out again. The first open-phase run
measured this in 3 of 103 DEV RESTOREs. Their post-transition service is therefore declared EU.

Effects whose size depends on an unexposed attribute are declared EU, for example a resource's value or a target's
health.

Environment dynamics (hostile attacks, hazard damage) are excluded: modelling them is transition prediction.

Every E1 claim is checked against the frozen kernel's executed transition in tests and in the certifier.

Each legal action also carries its action-relative spatial state:

- `ACTION_ID` (an opaque label, never a scoring input);
- `ACTION_TYPE`;
- `SOURCE_ENTITY` and `TARGET_ENTITY`;
- `CURRENT_RELATIVE_GEOMETRY`;
- `DECLARED_RESOURCE_COST`;
- `LEGAL_PRECONDITIONS`;
- `RELATIVE_SPATIAL_EFFECT_IF_DETERMINISTIC`: the change in nearest distance to each observable entity class, plus
  destination hazard;
- `TARGET_RELATIONSHIPS`.

The observable entity classes are OBJECTIVE, RESOURCE, HOSTILE, THREATENED, CRITICAL and HUB.

## Representation sufficiency recheck

The recheck uses the frozen Stage 3F.6-P.1A-SYM method, unchanged:

- the same eligibility and candidates;
- the same conditional-logit scorer and optimiser;
- a DEV fit and CAL selection;
- uniform tie-breaking;
- the same bootstrap and materiality rule.

Only the representation changes.

- **OLD:** the certified `SC_GEOMETRY_MAIN`. The DEV refit must reproduce the certified model hash (`db686ef8…`) and the
  certified P.1A-SYM top-1 values (0.375648 / 0.294442).
- **NEW:** OLD plus the Stage 3G entity block, in a Manhattan or observed-terrain-path variant, selected on CAL.

The sealed partitions use a new seed space: HOLDOUT seed 4021 and OOD seed 4031, with 4022–4023 and 4032–4033
reserved. They exclude all 80,000 Stage 3F lineage rows, and they are generated only after the freeze commit.

Results are recorded below after certification.
