# ASCII 3.x isolated offline development lane

This lane is not wired into the live game runtime. It trains separately identified experimental heads and preserves all canonical weights, frozen results, rejected candidates and R0 authority.

From the repository root:

```sh
node --test platform/game-agnostic/ascii-suite/training-dev-v1/tests.mjs
node platform/game-agnostic/ascii-suite/training-dev-v1/run.mjs
node platform/game-agnostic/ascii-suite/training-dev-v1/report.mjs
node platform/game-agnostic/ascii-suite/training-dev-v1/server.mjs
```

The read-only observatory is at http://127.0.0.1:4177. Existing gameplay remains at http://127.0.0.1:4176.

`--phase=prepare|audit|collect|train|evaluate|verify` supports staged execution. Completed phase artifacts are immutable and reused; a crashed incomplete phase is not silently overwritten. Use a newly versioned lane/run after source changes or after inspecting validation. Do not delete or retune an inspected run.

## Scientific boundaries

- `public/` contains observation-only transitions. `evaluator/` contains labels and private exact replays. No evaluator endpoint is exposed; model inference has no filesystem/kernel/evaluator imports.
- Four small experimental heads learn occupancy, card playability and planner imitation. Lower supervised loss is not competence. They are not canonical Oracle, Nexus, Alexandria or Forge.
- Native Vanguard/Horizon weights are loaded only into isolated VM models on their genuine colony codec for an inference smoke test, not an invented ASCII encoder. Other missing/unbound experts remain unqualified.
- Factory training has disconnected, underpowered, disabled/broken production lines. Its public dependency-witness comparator is a transparent new engineering rule controller, not Sentinel intelligence. The original WAIT-friendly benchmark is unchanged. Structural OOD here means a new graph/geometry within this diagnostic factory family, not a new physics domain.
- The only zero-shot mapping tested is Rescue → Roguelike current hostile-cell occupancy. This excludes trap risk, future damage and value of information. Training uses the inherited dungeon scaffold; development and validation use separate random-cut layout families, applied at every Rogue level. This is cross-world diagnostic reuse, not broad structural generalization. An initial seed-only split was rejected before collection and retained as a preregistration amendment.
- Cross-episode summaries retain observed type/damage, provenance, uncertainty and expiry only. The strong planner does not consume them; cross-episode/retrieval comparisons are intentional no-op controls. The trained Rogue head uses episodic history; a trained cross-episode consumer is deferred.
- Regret, counterfactual action values, calibrated abstention cost, VOI, reward-optimality and canonical MoE marginal value remain unsupported. No RL, sealed evaluation, live deployment or certification is authorized.
- Normal validation has three lineages per D1–D5; sensor stress has one per difficulty. Intervals are episode-level development diagnostics. They do not establish population safety or independent-family replication.

Results, audit, model hashes, preregistration, dataset lineage manifests and all negative outcomes are retained in `runs/ascii3-offline-dev-001/`. `result.json` contains the requested structured result and ten direct answers.
