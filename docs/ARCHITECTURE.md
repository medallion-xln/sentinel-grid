# AZL Architecture

AlphaZero-Light advisor for ZekNova: mixture of specialists sharing contracts, not a brain.

## Dataflow

```
                 game state (adapter.captureSearchState)
                              |
        main thread: azl-advisor.js (orchestrate, log, degrade)
                              |  postMessage
        +---------------------v----------------------+
        |            azl-mcts.worker.js              |
        |  Codec -> base vec (56) + ring of 32 REAL  |
        |  Oracle (trend emb 16 + 6 alarms)  <- ring |
        |  Relational (graph emb 16)  <- entities    |
        |  enriched vec (94) = base+oracle+relational|
        |  Scout 47,629p: PUCT priors/values IN TREE |
        |  MCTS (PUCT, reuse, Dirichlet, budgets)    |
        |  Strategist 340,497p: ROOT ONLY, 4 horizons|
        |  Router: constrained gate + log-prob fusion|
        +---------------------+----------------------+
                              | decision payload
        advisor -> UI + replay tuple (IndexedDB) -> sync -> PHP
                              |
        azl-training.worker.js: priority sampling, local SGD,
        self-play (idle), delta upload, candidate evaluation
                              |
        PHP: pending -> lazy FedAvg (GET_LOCK) -> candidate
             -> eval gate (Wilson LCB) -> canary 10%/12h
             -> production -> archived (rollback target)
```

## Modules (public_html/azl/)

- azl-config.js - every tunable
- azl-util.js - RNG, dirichlet, FNV hashing, masked softmax
- azl-state.js - Codec (normalize, missing-mask, hash, enrich) + Ring(32)
- azl-nn.js - single NN kernel: residual MLP, exact backprop, Adam, clip
- azl-scout.js / azl-strategist.js - the two learned specialists
- azl-oracle.js / azl-relational.js - deterministic labeled baselines
  (isLearned:false; contracts preserved for learned swaps)
- azl-mcts.js - PUCT search, tree reuse, node cap, cancellation
- azl-router.js - constrained gating (search>=0.50, strategist<=0.35,
  scoutRoot<=0.20), masked log-prob fusion, heuristic value floor
  (alpha 0.25 -> 0.85 over 50K validated samples), fallback chain
- azl-weights.js - AZLW binary container (f16/f32, CRC32) for local cache
- azl-replay.js - tuple schema, priorities, horizons, IndexedDB store, sync
- azl-federated.js - manifest/weights fetch, raw-vector activation, delta clip/upload
- azl-governor.js - frame P95 / battery / memory / idle gating, device tiers
- azl-eval.js - paired-seed candidate-vs-production harness, Wilson LCB
- azl-advisor.js - main-thread orchestrator, degradation Levels 0-4
- azl-ref-adapter.js - ZekNovaAdapter CONTRACT + honest reference simulator

## Key invariants

- Single-perspective MCTS backup: colony optimization is single-agent; values
  are NOT sign-flipped between plies. Do not "fix" this.
- Oracle consumes BASE vectors only (never enriched) - anti-recursion.
- Specialist embeddings are computed at the root and held constant across the
  tree; refresh cadence is governor-controlled.
- Missing specialists zero-fill their reserved slots; input width never changes.
- Server wire format = raw little-endian f32 param vector (PHP can do FedAvg
  arithmetic); AZLW container is client-side cache/export only.

## Degradation levels

0 full (search+scout+strategist+specialists), 1 no strategist, 2 scout-only
(no search), 3 heuristic actionScores, 4 safe action. The advisor answers at
every level; workers crashing can never take recommendations down.

## Replay tuple (client + azl_replay_tuples.payload)

session/tick ids, stateHash, baseVec(56), mask, scout/strategist policies,
mctsVisits, mctsRootValue, routerWeights, recommended/player action,
followedAdvisor, reactionMs, outcomes {now,m5,m30,session}, terminal,
priority (overrideAndWin 5x, followAndLose 4x, overrideAndLose 1.5x,
followAndWin 1x, +novelty/disagreement/confidentWrong boosts), completeness.
