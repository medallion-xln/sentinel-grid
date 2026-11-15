# STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1

Additive, R0, local-only lane. It benchmarks existing Sentinel experts against the strongest existing native ASCII controllers under identical public packets and legal actions. Nothing here changes a game rule, controller, expert, checkpoint or protected file. External independent review is not available; the human project owner is the sole scientific authority. This lane does not complete, replace or relabel the inactive Forge World sealed-qualification proposal (V3, commit 320a07da).

## Files

| File | Role |
|---|---|
| `guard.mjs` | Inheritance: chains the v33.1 guard (14,447 protected files, Stage 3F/3G baseline, 5,832 ASCII sources), hash-binds 15 extra imported sources, checks 13 milestone commits, the frozen H0/H2 rule hash and the nine-expert roster. Exclusive writers, sole-writer check. |
| `arms.mjs` | Frozen policy arms (see below). One declared composition adapter; everything else is imported unchanged. |
| `harness.mjs` | Isolated paired-episode runner. Reproduces the v32 runner exactly; adds invalid-case accounting, purity checks, public regime/time labels, expert-call and compute accounting. |
| `observer.mjs` | Observer contract audit, including counterfactual-invariance leakage tests. |
| `metrics.mjs` | Task-specific metrics per game, paired bootstrap, exact McNemar/sign, Holm, Clopper-Pearson, strict TOST, catastrophe veto, MDE. |
| `inventory.mjs` | Eight-game inventory and nine-expert applicability matrix from source plus live native calls. |
| `population.mjs` | Development seeds (spent) and proposed prospective namespaces (not allocated). |
| `dev-run.mjs` | Development-fixture run. Engineering validation only. |
| `protocol.mjs` | Proposed prospective protocol. Not registered. |
| `finalize.mjs` | Reruns lane tests and the full observer audit; writes the exit matrix and `RESULT.json`. |
| `tests.mjs` | 18 structural and failure-injection tests. |

Evidence (all written once with exclusive creation): `evidence/inventory.json`, `expert-applicability.json`, `dev-run.json`, `protocol.json`, `observer-audit.json`, `exit-matrix.json`, `existing-tests/*.tap`.

## Arms

| Arm | What it is |
|---|---|
| `STRONGEST_NATIVE` | v33.1 `STRONG_V33_1` (platformer), `STRONG_RESCUE_V33_1` (rescue), else v32 `STRONG` |
| `INCUMBENT_STRONG_V32` | v32 `STRONG` |
| `RULE_V32`, `FIXED_WAIT`, `UNIFORM_RANDOM` | reference rule and floors |
| `SENTINEL_V31_AS_IS` | existing v31 Sentinel binding, unchanged: Nexus may own an offered public REPAIR (factory only), Oracle advisory only, v3 bounded planner fallback |
| `V31_FALLBACK_ABLATION` | the identical fallback planner with Nexus/Oracle removed |
| `NEXUS_REPAIR_OVER_STRONGEST_V1` | declared adapter: the same v31 public graph and Nexus selector over the same offered REPAIR set, with the strongest native controller as fallback |
| `SHADOW_SENTINEL_READONLY` | strongest native acts; Nexus and Oracle are called and never applied |

## Development findings (engineering validation, not confirmatory)

Three development seeds × 24 levels, plus four factory stress strata: 108 paired worlds, 657 episodes.

- **Integrity held.** There were no invalid episodes and no replay failures. Shadow trajectories matched the acting controller 72/72. The v31 path matched its ablation 72/72 and the adapter matched the strongest controller 39/39 wherever Nexus did not intervene.
- **Nexus rarely acts.** The adapter changed 6 of 2,192 factory decisions, all in the delayed or missing sensor strata. No success, throughput or catastrophe outcome changed.
- **The existing Sentinel path loses factory.** `SENTINEL_V31_AS_IS` failed all 45 factory worlds that the strongest native controller won. Nexus never fired in it (0 of 30,654 decisions), and its ablation fails identically. The loss belongs to the v3 bounded planner fallback on v32 factory levels, not to Nexus.
- **Baseline caveats.** `RULE_V32` is identical to `STRONG` in pong and factory by source, because the v32 policy ignores the kind there. On rescue tier 3, the rule baseline won 3/3 against 2/3 for the designated strongest controller.
- **Compute overhead is small.** The adapter adds about 0.34 ms median per factory decision over the strongest controller.

## Reproduce

```sh
builtin cd platform/game-agnostic/stage3h-ascii-competence-v1
node guard.mjs                 # inheritance verification
node --test tests.mjs          # 18 structural tests
```

The evidence writers refuse to overwrite existing evidence. A rerun needs a fresh lane copy.
