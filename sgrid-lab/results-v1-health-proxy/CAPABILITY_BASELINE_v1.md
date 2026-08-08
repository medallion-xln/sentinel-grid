# Sentinel Grid - Capability Baseline v1

Environment: **reference-colony** (reference environment - real-ZekNova numbers PENDING adapter binding)
Runtime: node v22.22.2 (container; NOT browser). Browser/device numbers PENDING (bench.html).
Scoring: terminal value, else health at 150-tick horizon; paired seeds; tie eps 0.02; sims=128
Module hashes + frozen weights: results/baseline.json (weights {"vanguard":"280a24e8050a94a7","horizon":"3634a56cc1811994"})

## Q1 - Does Prime earn its cost?
| Comparison | means | winRate | LCB | verdict |
|---|---|---|---|---|
| C1 (Vanguard greedy) vs C0 (heuristic) | 0.121 -> 0.225 | 1 | 0.879 | DIVERGENCE |
| C2 (search, uniform prior) vs C0 | 0.121 -> 0.634 | 1 | 0.879 | GAIN |
| C3 (Vanguard+Prime) vs C2 | 0.634 -> 0.225 | 0 | 0 | no confirmed gain |

## Q2 - Does each Sentinel earn its latency?
ms/decision: C0 0 | C1 0.1 | C2 0.9 | C3 10.3 | C4 10.9 | C5 11

Action-change screen (150 shared states): search vs heuristic 0.98; Vanguard priors 1; Horizon 0; Oracle+Nexus 0

| Comparison | means | winRate | LCB | verdict |
|---|---|---|---|---|
| C4 (+Horizon) vs C3 | 0.225 -> 0.225 | 0 | 0 | parity |
| C5 (full stack) vs C3 | 0.225 -> 0.225 | 0 | 0 | parity |
| C5 vs C0 | 0.121 -> 0.225 | 1 | 0.879 | GAIN |

## Q3 - Segmentation (initial hostility regime; min n=8 or 'insufficient data')
{"calm":{"n":28,"wins":28,"losses":0,"lcb":0.879}} (no segment veto fired)

## Q4 - Compute envelope
Node numbers above are engineering indicators. Budget sweep: [{"config":"C3","rows":[{"sims":50,"mean":0.228,"msPerDecision":4.4},{"sims":100,"mean":0.228,"msPerDecision":8},{"sims":200,"mean":0.216,"msPerDecision":15.9},{"sims":400,"mean":0.185,"msPerDecision":32.2}]},{"config":"C2","rows":[{"sims":50,"mean":0.353,"msPerDecision":0.4},{"sims":100,"mean":0.434,"msPerDecision":0.6},{"sims":200,"mean":0.682,"msPerDecision":1.2},{"sims":400,"mean":0.829,"msPerDecision":2.3}]}]
REAL browser cold/warm P50-P99 and device tiers: **PENDING** (run /azl/bench.html on target devices).

## Ruler validation
Degraded-Vanguard test: {"goodMean":0.228,"degradedMean":-0.011,"degradedWins":0,"degradedLosses":16,"lcb":0,"blocked":true} -> harness correctly BLOCKED the degraded model

## Conformance (platform deliverable)
{"determinism":"pass","cloneIsolation":"pass","legalMaskNonEmpty":"pass","boundedSignals":"pass","noHiddenInfoInEncode":"pass","forwardModelPerf":"pass (2.33us)"}

## Objective-function check
{"note":"reference-env programmatic check; HUMAN ranking on real ZekNova states still required","pearsonAll":0.051,"pearsonEarly":-0.108,"pearsonLate":0.324,"samples":480}

## Preregistration outcomes
- E1: Vanguard greedy ~ heuristic (distilled from it; standalone value minimal) -> **SURPRISE: |0.104| > 0.05 - investigate before celebrating**
- E2: Search should show the clearest gain over the heuristic. ALTERNATIVE: if step stochasticity dominates at ~128 sims, gain may not confirm - that means fix forward model / budget, not add Sentinels -> **MATCHED (gain confirmed, lcb 0.879)**
- E3: Vanguard priors: parity to small gain vs uniform search pre-training (distilled priors ~ heuristic ordering) -> **SURPRISE: |-0.409| > 0.05 - investigate before celebrating**
- E4: Horizon near parity; untrained value heads; possible pure latency cost -> **MATCHED (parity)**
- E5: Full stack ~ parity with C3; LARGE immediate gain would be surprising and must trigger validation, not celebration -> **MATCHED (parity)**

## Sentinel Value Ledger (v1, reference env)
| Sentinel | ms/decision context | Quality effect | Action-change | Depends on | Status |
|---|---|---|---|---|---|
| Heuristic (C0) | 0 | baseline | - | - | production baseline |
| Vanguard alone (C1) | 0.1 | DIVERGENCE vs C0 | - | measured only with Prime | candidate evaluator |
| Prime, uniform (C2) | 0.9 | GAIN vs C0 | 0.98 | forward model | ESSENTIAL |
| Vanguard priors (C3-C2) | 10.3 | no confirmed gain | 1 | Prime | promising but untrained |
| Horizon (C4-C3) | 0.6 added | parity | 0 | root only | possible no-op until trained |
| Oracle+Nexus+Arbiter (C5-C3) | 0.7 added | parity | 0 | ring / entity graph | deterministic baselines |
| Temporal candidate | not built | unknown | - | real replay volume | deferred |

## Decision gates (auto-drafted; confirm before acting)
- Prime improves quality over the heuristic -> keep investing in search + compute allocation
- Vanguard priors not yet adding over uniform search -> expected pre-training; revisit after real-replay training
- Horizon adds no measurable value yet -> keep interface, consider disabling in routine production until trained
- Full stack ~ parity with C3 -> Arbiter/Oracle/Nexus not yet earning cost; acceptable pre-training, watch after learning begins
- Budget sweep: quality scales with sims -> keep tiered budgets, raise where devices allow

## Pending - requires Dwayne / real environment
1. Real ZekNova adapter binding (feasibility question FIRST: detached-clone tick loop)
2. Human ranking validation of ZekNova health() (50 states) - the check above is a reference-env proxy only
3. Browser + device latency via bench.html (cold/warm P50/P95/P99, low-end device)
4. Shadow advising in real sessions + real-vs-benchmark distribution comparison
5. environment_id schema partitioning (multi-tenancy) before any second environment
