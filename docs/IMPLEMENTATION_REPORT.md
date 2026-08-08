# AZL Implementation Report (2026-07-19)

## Status

Complete against the spec, with one honest substitution: the build environment
had no repo access (not Claude Code), so Phase 0 reconnaissance was replaced by
a hard `ZekNovaAdapter` contract plus a clearly-labeled reference colony
simulator (`azl-ref-adapter.js`, `isReferenceSimulator:true`). Every layer runs
end-to-end against it today; binding real ZekNova is ~20 lines (skeleton in
DEPLOYMENT.md).

## Delivered

Client (17 modules + 2 workers + bench.html): codec/ring, hand-rolled NN kernel
(exact backprop, Adam, clip; Scout 47,629 params, Strategist 340,497), PUCT
MCTS with tree reuse and budgets, deterministic Oracle/Relational baselines,
constrained router + masked log-prob fusion + heuristic value floor, AZLW
binary weight codec, replay store (IndexedDB, priorities, horizons, sync),
federated client (raw-vector activation, delta clip/upload, idempotency,
cooldown), governor (frame P95/battery/memory/idle, tiers), paired-seed eval
harness, main-thread advisor with degradation Levels 0-4.

Server (proxy + handler + 6 models + schema): manifest with lazy lifecycle
(candidate -> canary -> production, Wilson LCB gates, canary bucketing,
rollback endpoint), weights serving with metadata headers, replay ingest
(validation, session ownership, caps, reputation), update ingest (delta
validation, bootstrap path), GET_LOCK-protected streaming trimmed FedAvg,
evaluation ingest. 10-table InnoDB schema, MariaDB-safe.

Tests: 23/23 passing in Node 22 (codec, util, NN gradcheck by central
differences, overfit, AZLW round trips + tamper/truncation rejection, MCTS
determinism/legality/reuse/node-cap, router bounds/fallbacks, replay
priorities/horizons, delta clip, sim determinism, Wilson + paired eval).
All 8 PHP files lint clean under PHP 8.3.

## Measured performance (container Node v22, indicative; browser numbers from bench.html)

- codec.encode: 2.3 us/op
- Scout forward: 65.9 us/op
- Strategist forward: 446 us/op (root-only by design)
- MCTS: 13,237 sims/sec warmed (800 sims in 60.4 ms), depth 6

At those rates the mid-tier budget (320 sims / 60 ms) is comfortably real-time
even allowing 2-4x browser slowdown; low tier (120 sims / 25 ms) covers phones.

## Known limitations

- Reference simulator, not ZekNova dynamics, until the adapter is bound.
- Oracle/Relational are deterministic labeled baselines (per decision policy),
  not learned models; contracts allow drop-in learned replacements.
- Strategist trains on the same replay stream as Scout (no separate long-horizon
  curriculum yet); its value heads need real horizon data to differentiate.
- Evaluation reports are client-claimed (bounded, capped, gated - see
  MODEL_LIFECYCLE.md residual risks).
- validatedSamples uses COUNT(*) on an indexed column; add retention pruning
  when azl_replay_tuples passes ~5M rows.
- Same-origin CSRF fallback in the bridge is weaker than platform token CSRF
  until wired.

## Next improvements (max 5)

1. Bind the real ZekNovaAdapter and re-baseline all benchmarks in-browser.
2. Wire azl-auth-bridge.php to the OTP session + SecurityService CSRF.
3. Add replay retention pruning (age + priority-weighted) server and client.
4. Promote Relational to a learned model once >=100K tuples with entity data.
5. Strategist horizon curriculum: train m30/session heads on completed-session
   slices with importance weighting by completeness.
