# ASCII Worlds 3.0 - completed local diagnostic build

**Status:** IMPLEMENTED_VERIFIED_OPEN_DIAGNOSTIC_NOT_SCIENTIFICALLY_CERTIFIED.

Four new playable worlds, five mechanically distinct difficulties, manual and automatic play, fixed-perspective card partners, deterministic private replay, observation-only controller packets, and unchanged compatibility access to the four existing worlds. Local-only browser acceptance covered desktop and 390px layouts. No publishing, canonical expert calls, training, live dispatch, promotion or new roadmap stage.

Launch from `/Users/dwaynecampbell/Desktop/sentinel-grid`:

```sh
node platform/game-agnostic/ascii-suite/v3/server.mjs
```

Open [ASCII Worlds 3.0](http://127.0.0.1:4176/). Select a world and D1-D5, then Reset. Play runs the selected baseline; Auto Step advances one decision; Manual Action executes the selected legal action. Reset applies changed settings. The temporary QA server is stopped after verification; this command starts your own session.

The [play/rules guide](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/README.md) explains costs and controls. Rescue's extraction is at **(3,2)** (zero-based coordinates), initially occupied by the scout, whose glyph overlays X; extraction is permitted within one cell. The state panels are condensed: the full permitted observation is in the public API packet. Old-world controller choices map to their unchanged primary baseline, except RANDOM_LEGAL maps to the old uniform-random comparator; they are explicitly compatibility views, not newly qualified V3 policies.

## Verified accounting

| Check | Result |
|---|---|
| V3 tests | 115 passed, 0 failed |
| OPEN main scheduled/admitted/completed/rejected | 1600 / 1600 / 1600 / 0 |
| Main timeouts | 208, retained in results |
| Supplemental memory/partner episodes | 100 / 100, all completed |
| Independently exact-replayed episodes | 1800 |
| Decision source bindings checked | 278244 |
| Predecision belief labels checked | 59032 |
| Raw summaries/final metrics verified | 1800 |
| Aggregate cells independently recomputed | 80 |
| Successful privileged software witnesses | 20/20 world/difficulty cells |
| Protected predecessor files unchanged | 14502 |
| Stage 3F / 3G freezes | Intact |
| Prior Stage 3H conclusions | Unchanged |
| Canonical expert invocations | 0 |

The inheritance check establishes current byte/source closure and retains earlier semantic reproductions. It is **not a newly run F/G semantic certification**. Witnesses prove successful trajectories for software fixtures only; every admission has structural checks, not a guarantee of limited-information solvability for every seed. Hidden-truth swap and server perspective regressions pass; the audited worker import boundary is not a hostile-code OS sandbox.

Source SHA-256: `d78b3882651e04aa222b9a9773123969e83e7273eed986e602ad68b119eb5c21`.

Plan SHA-256: `9ebf8e67c17ddb7efe3a093ddb8f8c97869a5b6253666ec7fe49e26949d6ea63`.

Sources and parameters were frozen before OPEN outcomes. No code, policy, reward or difficulty retuning followed exposure. Final development validation completed 800 episodes; the original 800-episode DEV run and a deliberately stopped 624-artifact development attempt remain preserved and separately labeled. The stopped attempt is not counted as a completed population.

## OPEN success curves

Each entry is success percentage over **20 paired seeds**. Equal quotas, known-family A/B replication; not structural OOD or sealed evidence. Cards varies P0's controller with fixed RULE_BASED partners. Rogue main results use CAMPAIGN_MEMORY.

| World | Difficulty | Random | Reactive | Rule | Bounded |
|---|---|---:|---:|---:|---:|
| Rescue | D1 | 0 | 5 | 100 | 100 |
| Rescue | D2 | 0 | 0 | 95 | 95 |
| Rescue | D3 | 0 | 0 | 100 | 100 |
| Rescue | D4 | 0 | 0 | 100 | 100 |
| Rescue | D5 | 0 | 0 | 80 | 75 |
| Cards | D1 | 0 | 60 | 65 | 70 |
| Cards | D2 | 0 | 90 | 90 | 90 |
| Cards | D3 | 0 | 70 | 70 | 70 |
| Cards | D4 | 0 | 0 | 0 | 0 |
| Cards | D5 | 0 | 0 | 0 | 0 |
| Factory | D1 | 0 | 100 | 100 | 100 |
| Factory | D2 | 0 | 100 | 100 | 100 |
| Factory | D3 | 0 | 100 | 100 | 100 |
| Factory | D4 | 0 | 100 | 100 | 100 |
| Factory | D5 | 0 | 100 | 100 | 100 |
| Rogue | D1 | 0 | 100 | 100 | 100 |
| Rogue | D2 | 0 | 95 | 95 | 100 |
| Rogue | D3 | 0 | 95 | 95 | 100 |
| Rogue | D4 | 0 | 0 | 0 | 0 |
| Rogue | D5 | 0 | 0 | 0 | 0 |

The [full 80-cell artifact](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/results/OPEN/report.json) includes scheduled/admitted/completed/rejected counts, returns, catastrophes, belief scores, team scores, factory throughput, timing/work, failure/timeout counts, paired intervals, raw episode paths and artifact hashes. Pooled success is 50.0625% and catastrophe 27%, descriptive only; world returns have different units and should not be compared across worlds.

## Main findings

Rescue strongly distinguishes retaining public map/civilian evidence from the weak reactive comparator, but D1-D4 are near ceiling for rule/planner. At D5 the rule succeeds 80% versus planner 75%; planner complexity does not guarantee better rescue prioritization. Over 100 matched rescue episodes, planner-minus-rule success is -1 percentage point, exploratory 95% interval [-3,0]. No single-action causal DDV follows from that policy contrast.

Cards D4/D5 defeats every tested controller without exhausting the sensible policies' error budgets. Rule valid-play rate is 100% in these cells, but mean scores are only 9.95/10.10 against target 18, with 5.95/5.80 critical card losses per episode. Safe immediate plays are not sufficient for cooperative completion: irreversible discards and limited clues matter. Those observations do not identify a qualified canonical cooperation effect.

Factory's conserved resource graph and delayed repairs operate correctly, but all sensible controllers succeed at every difficulty. It currently tests basic chain restoration and power allocation better than advanced relational/mechanical planning. The planner saves one mean tick at D5 (88 versus 89), with extra compute; that is not a competence certification. Its public upgrade forecast is explicitly approximate, as documented in the rules guide.

Rogue D4/D5 is too hard for these limited-information baselines: rule policies complete a mean 1.20/0.45 of three levels before death, with mean cumulative damage 195.8/190.35. Privileged witnesses successfully finish both cells, so observed baseline failure is not itself proof of an impossible world. Limited-information feasibility remains unproven.

## Matched memory and partner panels

The same bounded policy/budget ran 25 campaigns per memory mode, fresh memory and empty external experience corpus:

| Mode | Successful campaigns | Success difference vs no memory |
|---|---:|---:|
| NO_MEMORY | 0/25 | Reference |
| EPISODE_MEMORY_ONLY | 15/25 | +60 percentage points |
| CAMPAIGN_MEMORY | 15/25 | +60 percentage points |
| EXPERIENCE_RETRIEVAL | 15/25 | +60 percentage points |

Exploratory paired-bootstrap 95% interval for each success difference: **[+40,+76] points**; mean level-progress difference +0.6933, interval [0.5333,0.8400]. Campaign/experience modes show **no additional measured outcome benefit over episode memory in this panel**. Their historical retrieval scaffolding is not evidence of Alexandria competence. These are 25 matched campaign units, not thousands of independent turns; no multiplicity-controlled certification is claimed.

With fixed P0 BOUNDED_PLANNER over 25 matched card episodes per partner policy, successes were REACTIVE 8, RULE_BASED 9, INFERENCE_BASED 10 and COOPERATIVE_PLANNER 10. The last two names map to the same current policy implementation; identical outcomes are not evidence of two independent cooperation mechanisms. Separate software fixtures also exercise 2/3/4-player views and all partner aliases.

## Timing and compute

Main evaluation recorded 242243 controller invocations (including card partners), 4933668 path expansions, 461139 candidates and 923840 public-model ticks. Canonical expert invocations are zero. Path work is capped at 2048 expansions per decision; factory candidates have a 16-tick public horizon. Presentation speed does not affect transitions.

| Bounded policy | Selection p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|
| Rescue | 0.254 | 0.665 | 0.995 |
| Cards, including fixed partners | 0.013 | 0.026 | 0.052 |
| Factory | 0.957 | 1.160 | 1.353 |
| Rogue | 0.436 | 1.125 | 1.426 |

These are local CPU selection timings, not browser round-trip or production-latency certification. Observation and transition timing, all 16 policy/world groups and work counts are in [latency-compute.json](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/results/latency-compute.json); Node v26.7.0/darwin/arm64 environment details are separately recorded.

## Scientific status and ten requested answers

FPE as a qualified canonical metric, CAD, CR, DDV, TCA and scientific VOI remain **NOT_ESTABLISHED**. Explicit predecision Brier scores are supported where hypotheses exist, not broad calibration certification. Card probabilities are constrained count-weighted marginals rather than an exact joint posterior; rescue probabilities are sparse uninformed priors. Clue counts, tiles revealed, immediate reward and episode utility are not scientific information value or DDV.

1. **Poor belief reasoning:** Cards provides the densest explicit hidden-card belief scoring. Rescue exposes missing map/civilian evidence retention, but its sparse threat priors are not yet a demanding belief-model test. Neither supplies canonical Oracle evidence.
2. **Limited-information cooperation:** Signal Cards, because own hands remain concealed, partners have independent permitted views and clues use a fixed resource-limited grammar. Main and partner-shift outcomes evaluate diagnostic agents, not multi-expert Sentinel cooperation.
3. **Mechanistic/relational planning:** Factory has the right causal/conservation infrastructure but poor discrimination at current objectives: every sensible policy succeeds. Its standard graph is too repetitive and the rule policy too task-specific to establish transfer.
4. **Useful memory-dependent decisions:** Rogue map retention supports a +60-point completion contrast against no memory. There is no measured extra completion/progress gain from campaign/experience retrieval over episode memory in the matched panel.
5. **Genuinely delayed consequences:** Civilian deadlines and transport, irreversible card discards/final turns, construction/repair delays with resource congestion, and multi-level potion depletion. These are real delayed game consequences, not automatically qualified DDV.
6. **Too easy/difficult:** Factory all levels and rescue D1-D4 are near ceiling for sensible policies; cards and rogue D4/D5 have floor effects for the tested policies. D2 cards being easier than D1 empirically shows that the curves are not monotone. Software witnesses establish fixture feasibility only.
7. **Reactive defeating a planner:** The reactive card policy succeeds at D3 seed 6103000 while the bounded policy fails, despite equal aggregate D3 success. Treat this as a matched whole-policy outcome, not attributed single-clue value. Factory's simple rule also reaches the same objective with less selection work; more planning is not automatically more useful.
8. **Later Stage 3H qualification:** All four are candidates for separate local binding qualification after benchmark weaknesses are resolved. None is ready for automatic sealed use, and no expert is promoted or certified here.
9. **Before sealed evaluation:** Establish limited-information feasibility and stronger independent/OOD families; improve exact card inference/cooperative loss controls; remove factory ceiling effects; build more discriminating memory/attribute shifts and controller diversity; expand condensed human status presentation; qualify causal VOI/DDV/TCA estimands and native expert source/target bindings. The current adversary/sensing rules and approximate forecast models must be explicit in that qualification.
10. **Cross-world transfer:** Freeze a shared representation/controller and budget before destination-world exposure, leave a world/family out, feed public evidence only, and compare paired fresh episodes with quality/catastrophe accounting. Do not tune task-specific policies on destination outcomes or present shared hand-written utilities as learned transfer. This run establishes no cross-world transfer.

## Artifacts and stop boundary

Read the [machine-readable result](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/results/result.json), [independent verification](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/results/independent-verification.json), [source freeze](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/freeze.json) and [OPEN registration](/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/ascii-suite/v3/registration.json). Offline episode artifacts contain private evaluator truth and must never become controller inputs. The browser exports only a public integrity replay; a downloaded 27-record factory replay also passed its public verifier.

STAGE3H_COMPETENCE_CERTIFIED=false. ROUTER_2_0_JUSTIFIED=false. WORLD_MODEL_JUSTIFIED=false. EXPERT_10_JUSTIFIED=false. SCIENTIFIC_CERTIFICATION=NOT_CLAIMED.

Next action is **recommendation only**: review the diagnosed weaknesses and, if desired, separately authorize benchmark/expert-binding qualification. No further stage, new candidate cycle, training or promotion was started.
