# Production Adapter Package Specification

A Stage 2B production adapter is an ECMAScript module package with locked configuration and one or more locked snapshot formats.

```json
{
  "name": "@example/game-adapter",
  "version": "1.1.0",
  "type": "module",
  "sentinelGrid": {
    "adapter": {
      "entry": "./index.js",
      "factoryExport": "createAdapter",
      "configSchema": "./sentinel-grid.config.schema.json",
      "gameId": "example-game",
      "adapterId": "example-game-adapter",
      "adapterVersion": "1.1.0",
      "certificationProfile": "production-r0",
      "snapshotFormats": [
        {
          "formatId": "example-game/state-json",
          "formatVersion": 1,
          "schema": "./sentinel-grid.snapshot.schema.json",
          "importerMethod": "importSnapshot"
        }
      ]
    }
  }
}
```

The entrypoint exports a factory:

```js
export function createAdapter(configuration) {
  return defineAdapter({
    manifest() { /* universal manifest */ },
    initialState(seed) { /* detached state */ },
    cloneState(state) { /* isolated clone */ },
    observe(state, observerId) { /* canonical observation */ },
    legalActions(state, observerId) { /* legal descriptors */ },
    step(state, action, context) { /* detached transition */ },
    isTerminal(state) { /* terminal rule */ },
    outcome(state, observerId) { /* bounded outcome */ },

    importSnapshot(payload, context) {
      // Validate game-specific invariants not expressible in JSON schema.
      // Return a detached state. Never attach to or mutate a live runtime.
    },
  });
}
```

## Snapshot envelope

```json
{
  "snapshotContractVersion": 1,
  "gameId": "example-game",
  "adapterId": "example-game-adapter",
  "adapterVersion": "1.1.0",
  "snapshotId": "save-00042",
  "formatId": "example-game/state-json",
  "formatVersion": 1,
  "observers": ["player-1"],
  "payload": {},
  "metadata": {}
}
```

`payload` remains game-owned. Sentinel Grid validates it against the locked adapter schema, then passes a clone to the locked importer. The public ingestion result contains hashes and an opaque handle, never the native state.

## Lock version 2

The adapter lock binds:

- package, adapter, and entrypoint identity
- package and entrypoint hashes
- configuration schema and resolved configuration hashes
- certification profile
- every snapshot format ID and version
- every snapshot schema path and SHA-256
- every importer method name

## Prohibited behavior

- Absolute or parent-traversing package paths
- Symbolic links in adapter packages or snapshot inputs
- Importing snapshots outside approved roots
- Returning or attaching a live runtime object
- Live command dispatch or world mutation
- Authority-token creation
- Loading when package, schema, format, profile, or configuration differs from the lock
