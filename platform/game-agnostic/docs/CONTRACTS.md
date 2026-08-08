# Universal Contract Reference

## AdapterManifest

Declares game identity, adapter identity and version, supported observation schemas, deterministic capabilities, and the mandatory R0/no-execution boundary.

## ObservationPacket

A versioned, observer-specific numeric representation:

- `contractVersion`
- `gameId`
- `schemaId`
- `schemaVersion`
- `observerId`
- `sequence`
- `features`
- optional `featureShape`
- JSON metadata

The kernel imposes no global feature count. The same schema may explicitly declare variable size.

## ActionDescriptor

A legal candidate represented by:

- opaque `actionId`
- optional `actorId`
- game-defined JSON `target`
- game-defined JSON `parameters`
- optional JSON metadata

The action identity is the canonical serialization of its behavioral fields. The kernel does not parse action names or target semantics.

## TransitionResult

Returned by `step()` on a detached state:

- next `state`
- finite immediate `reward`
- `terminal` flag
- JSON `events`
- JSON `info`

## OutcomePacket

Game-defined evaluation:

- finite scalar used for terminal search evaluation
- finite named objective vector
- terminal flag
- JSON metadata

## RecommendationPacket

Contains adapter identity, source-state hash, observation hash, legal-action hash, deterministic search settings, complete ranking, selected legal action, R0 authority policy, and recommendation hash.
