# ZekNova Adapter Migration Specification

## Governing rule

Migration begins with behavioral parity, not redesign. Existing Stage 1A-Z observation, knowledge, legality, and recommendation behavior must be wrapped behind the universal contract before the action surface is expanded.

## Adapter identity

Recommended initial manifest identity:

```json
{
  "gameId": "zeknova",
  "adapterId": "zeknova-stage1az-shadow-adapter",
  "adapterVersion": "1.0.0",
  "contractVersion": 1,
  "authority": { "tier": "R0", "executionInterface": false }
}
```

## Mapping from certified ZekNova artifacts

| Existing ZekNova concern | Universal adapter location |
|---|---|
| 592-feature faction packet | `observe(state, observerId)` |
| Faction-private perception | Adapter information boundary before packet creation |
| Knowledge ledger and freshness | Adapter-owned state/knowledge snapshot inputs |
| Six-action development scaffold | `legalActions(state, observerId)` |
| Canonical target slots | `ActionDescriptor.target` |
| Detached clone | `cloneState(state)` |
| Development transition behavior | `step(clonedState, action, context)` |
| Mission completion | `isTerminal(state)` |
| Objective calibration | `outcome(state, observerId)` |
| Shadow telemetry | Recommendation packet plus ZekNova telemetry bridge |

## Migration phases

### Z0 — Manifest and schema wrapper

- Declare the existing 592-feature schema as fixed-size.
- Preserve exact feature order and normalization.
- Include existing schema/version hashes in metadata.
- Preserve faction-private information restrictions.

### Z1 — Action wrapper

- Convert each of the six current actions into an opaque `ActionDescriptor`.
- Preserve target-slot semantics inside `target`.
- Preserve current legal masks exactly.
- Reject any action not returned by `legalActions()`.

### Z2 — Detached transition wrapper

- Wrap the existing certified clone/step implementation.
- Pass all stochastic inputs through `context.seed` or `context.random`.
- Prohibit references to live runtime mutation services.
- Confirm source-state hash stability after every simulation.

### Z3 — Outcome wrapper

- Map existing calibrated objective/value output into a named vector.
- Document scalarization separately from the observation codec.
- Keep terminal semantics adapter-owned.

### Z4 — Universal conformance

Run the complete conformance laboratory and preserve:

- deterministic initial fixture state
- deterministic 592-feature observation
- deterministic legal actions
- detached clone fidelity
- deterministic seeded transition
- outcome/terminal agreement
- deterministic Prime recommendation
- exact recommendation replay
- R0/no-execution boundary

### Z5 — Cross-lineage parity

For a frozen fixture corpus, compare the legacy Stage 1A-Z path with the generic-kernel path:

- observation hashes
- legal masks and target slots
- search settings
- action visits
- selected action
- recommendation hash where packet formats are equivalent

Any divergence must be classified and approved before migration.

### Z6 — Production shadow integration

- Keep scripted NPC AI as sole executor.
- Record generic recommendation packets beside incumbent actions.
- Do not add a dispatcher.
- Do not increase authority above R0.

## Expansion after parity

Only after Z0–Z6 pass should the ZekNova adapter expand from the six-action scaffold into real defensive, construction, resource, route, unit, diplomacy, and multiplayer actions.

## Stage 2D-Z implementation result

Z0 through frozen-corpus Z5 are implemented in kernel v0.7.0. The adapter is production-locked at R0. Live repository fixture capture and extended shadow evidence remain required before later promotion.
