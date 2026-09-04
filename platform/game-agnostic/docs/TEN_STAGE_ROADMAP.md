# Sentinel Grid — Ten-Stage Game-Agnostic Roadmap

## Stage 0 — Universal deterministic kernel

Build canonical contracts, deterministic hashing and randomness, R0 authority denial, legal-action enforcement, recommendation packets, and replay metadata.

**Exit:** One reference adapter produces deterministic legal R0 recommendations and exact replay.

## Stage 1 — Adapter SDK and Certification Lab

Provide reusable adapter definitions, TypeScript interfaces, JSON schemas, conformance checks, negative fixtures, performance hooks, verification scripts, and a second structurally different reference adapter.

**Exit:** Two unrelated games pass without kernel modifications.

## Stage 2 — First production adapter: ZekNova parity

Wrap the certified 592-feature observation, private knowledge, six-action legality, targets, clone/step, outcome, and shadow telemetry behind the universal SDK.

**Exit:** Existing Stage 1A-Z behavior is reproduced through the generic kernel with no authority increase.

## Stage 3 — Universal multistep simulation

Support variable horizons, simultaneous decisions, deterministic seeded stochastic events, chance nodes, terminal states, outcome vectors, and adapter-specific simulation fidelity tiers.

**Exit:** Certified multistep transition parity in at least two production-grade game environments.

## Stage 4 — Universal Sentinel Prime

Advance from root-only PUCT to multistep PUCT/MCTS, hierarchical actions, transpositions, belief-state search, bounded rollout policies, and adapter-provided objective scalarization.

**Exit:** Prime independently beats approved baselines in every certified game domain where it is promoted.

## Stage 5 — Universal Expert SDK

Standardize expert packets for Vanguard, Oracle, Horizon, Nexus, Strategist, and future experts. Separate game-specific encoders from universal calibration, attribution, ablation, and failure handling.

**Exit:** Experts can be independently enabled, disabled, benchmarked, and versioned without changing game adapters or Prime internals.

## Stage 6 — Temporal and relational intelligence

Deploy Oracle as an interpretable temporal baseline, Horizon as a learned temporal predictor, and Nexus as a relationship/dependency reasoner when a game exposes suitable history and graphs.

**Exit:** Each expert proves independent and integrated value on compatible games; unsupported games degrade safely.

## Stage 7 — Calibrated policy learning

Rebuild Vanguard from certified search targets with uncertainty, calibration, root-coverage protection, state-familiarity detection, and uniform-prior fallback.

**Exit:** Vanguard plus Prime beats uniform-prior Prime under equal compute budgets without suppressing rare critical actions.

## Stage 8 — Constrained mixture-of-experts routing

Introduce deterministic routing and adaptive compute first. Evaluate learned routing only after multiple experts independently pass promotion gates.

**Exit:** Better decision quality per unit of compute, complete attribution, safe expert disablement, and deterministic fallback.

## Stage 9 — Intelligence Lab and improvement planes

Expand Alexandria evidence/memory, Archimedes bounded critique, Forge isolated engineering, Picasso non-authoritative experience generation, replay/outcome datasets, model registry, federated candidate generation, shadow, canary, promotion, and rollback.

**Exit:** Reproducible candidate-to-promotion lifecycle across multiple games with no self-promotion or direct production writes.

## Stage 10 — Separately certified authority plane

Add optional per-game execution adapters only behind explicit human authorization, capability tokens, final legality revalidation, rate and resource limits, idempotency, emergency stop, rollback, and immutable audit evidence.

**Exit:** Authority can progress from R0 on a per-game and per-action-domain basis without changing the intelligence kernel or allowing any model to grant itself authority.

## Current roadmap position

Documentation reconciliation only — no historical evidence is rewritten here.

| Stage | State |
|---|---|
| Stage 2D-Z | Frozen ZekNova parity certified |
| Stage 2E-Z | Real-state capture and sustained-shadow machinery certified |
| Stage 2F | Runtime identity, provenance binding and campaign identity complete and certified. Runtime `sha256:bdc88a75…`, campaign `sha256:6fe9f8ab…`. The live qualification campaign itself is still **not** certified: it awaits provenance-verified live records under the current lineage. |
| Stage 2G | Sentinel Oracle + Sentinel Nexus certified as deterministic R0 experts. Portability PASS on darwin and linux. |
| Stage 2H | Shadow expert consumption and Prime context integration — certified. Prime consumes bounded expert context while remaining the decision owner. |
| Stage 2H.1 | Action-discriminating expert context — certified. Oracle and Nexus score individual legal actions within the unchanged 0.02/0.03 bounds; every ranking change is causally attributed. |
| Stage 2I–2K | Oracle V2 head architecture, bounded depth-2 Prime, and Nexus relational reasoning — certified as individual expert capabilities. |
| Stage 2L.0–2L.5 | Core triad shadow integration, counterfactual expert information, and the first deterministic Arbiter candidate. |
| Stage 2L.6 | **FAIL** — the first Arbiter failed adversarial evidence and trust-boundary testing: stale evidence, cross-observation mismatch, ambiguous binding, and unsafe expert consensus. |
| Stage 2L.7 | **PASS** — remediated. Evidence identity binding, runtime/campaign binding, expert and head eligibility, default-deny validation, malformed/stale/cross-runtime rejection, fail-closed behaviour, R0 preserved. |
| Stage 2L.8 | **PASS** — independent 20,020-case red-team replication. Prime 49.83%, Arbiter 52.36% (+2.53 pp), 507 selection changes, 0 harmful changes, 0 correct-Prime breaks. |
| Stage 2L.9 | **FAIL** — 20,500 cases. Prime 49.94%, Arbiter 61.48% (+11.54 pp), but 915 harmful changes against a 1.00% ceiling (4.46%). Correctness discrimination measured at −0.0038 (Oracle) and +0.0030 (Nexus): the Arbiter could prove evidence was *authentic* but had no signal for whether the expert was *correct*. |
| Stage 2L.10 | **PASS** — Arbiter correctness calibration and selective delegation. 22,750-case holdout, disjoint from an 8,450-case calibration corpus. Prime 54.81%, Arbiter 60.66% (+5.85 pp), 1,332 beneficial changes, **0 harmful changes**, **0 correct-Prime breaks**, delegation precision 1.000. Oracle correctness discrimination **+0.5651**, Nexus 0.0000 (abstains everywhere; whether that was remediable was left open and is settled by Stage 2L.11). Portability recorded on a single platform. |
| Stage 2L.11 | **PASS** — Nexus semantic identifiability and decision-utility certification. A measurement stage: it passes because it answered its question, not because Nexus turned out useful. 12,000-case holdout over twelve topology families, disjoint from a 6,000-case discovery corpus. `NEXUS_IDENTIFIABILITY_STATUS = NON_IDENTIFIABLE_CURRENT_TASK`. Best gap over 264 predicates spanning all four feature tiers was 0.0520, **below** the permutation-null median of 0.0593; a rule frozen on discovery fell from 0.5947 to 0.5242 out of sample against a 0.5338 base rate. Nexus delegations 0, harm 0, correct-Prime breaks 0. |
| Stage 2L.12 | **PASS** — Nexus semantic grounding and observable utility. A benchmark-remediation stage: it passes because Nexus evaluation became meaningful and reproducible, not because Nexus performed well. Ground truth is now computed from world state — entity value, capacity, availability, risk and cost across seven relation kinds, scored by a versioned objective function over five action kinds — replacing the independent `nexusAligned` draw entirely. 14,000-case holdout (5,261 decidable, 84,000 legal actions evaluated), disjoint from a 7,000-case discovery corpus. Best trivial baseline 0.393 against a 0.60 rejection gate. **Measured: Nexus 0.0844, Prime 0.3946** — the inherited expert beats neither random (0.1667) nor the best trivial baseline. `GROUNDED_NEXUS_IDENTIFIABILITY_STATUS = IDENTIFIABLE` but only from world state (gap 0.1526), not from Nexus output (0.0379, below the permutation null). Nexus delegations 0, harm 0. |
| Stage 2L.13 | **PASS** — Value-aware Nexus relational utility. A bounded expert remediation: the benchmark, the Arbiter, its calibration and every ceiling are untouched; only Nexus changes. A source audit confirmed the Stage 2L.12 diagnosis — of the eight quantitative semantic fields the canonical state carries, the inherited Nexus path read **none**, and ignored five of eight relation kinds. The remediated expert scores an auditable relational utility (`relationalBenefit + riskAdjustment − actionCostPenalty`) over structure crossed with value, cost and risk. On the frozen 5,261-case grounded benchmark: **Nexus 0.0844 → 0.7826**, overtaking Prime (0.3946), random 0.1667. `STRUCTURE_VALUE_DECOUPLED_ACCURACY` **0.0469 → 0.7520 (+70.51 pp)** across 4,093 cases. Nexus can now also discriminate its own correctness (gap 0.5475 vs null p95 0.1055; frozen rule held 0.9833 out of sample). But its best bucket reaches **0.9459** against the inherited **0.99** floor, so **delegations remain 0** and safe delegation is still unauthorised. Outcome `B_IMPROVED_NOT_SELF_CALIBRATED`. |
| Stage 2L.14 | **FAIL** — Nexus confidence calibration and safe selective delegation. A calibration stage that failed honestly: it asked whether a genuinely high-confidence Nexus region exists, and the answer measured out as no. Three disjoint splits carved from the frozen Stage 2L.12 corpus — `DEVELOPMENT` 5,261, `CALIBRATION` 5,232, `FINAL_HOLDOUT` 5,324 decidable cases — with only `CALIBRATION` permitted to select and `FINAL_HOLDOUT` scored once, after freezing. Nexus confidence is real and strongly ordered (`OBSTRUCTED` 0.7135 → best region 0.9832), but **no supported region on the 25-cell predeclared risk/margin grid reached the inherited 0.99 floor**. Cells that cleared it on `DEVELOPMENT` (0.9917 at n=121, 1.0000 at n=48) fell to 0.9691 and 0.9444 on a fresh calibration draw — the overfitting a two-way split would have shipped, since those same cells score 0.9926 and 0.9844 on the final holdout. `SELECTED = null`; the frozen parameters fall back to the most restrictive rung, not the best-measured one. **0 delegations, 0 harmful changes, 0 correct-Prime breaks, 172/172 harmful opportunities rejected**, and 2,332 beneficial opportunities deliberately forgone. Outcome `D_CONFIDENCE_DOES_NOT_GENERALIZE`, `FAILURE_MODE = FAILED_GENERALIZATION`. The 0.99 floor was **not** lowered — the certify script exits `2` on any attempt to weaken it. |
| Stage 2L.15 | **FAIL** — Nexus decision stability, counterfactual consistency and confidence-ceiling evaluation. Tested whether surviving legitimate perturbation identifies a smaller region at >=0.99. Eight heterogeneous perturbation families, 15 probes per case, seeded from a digest of world CONTENT only; validated before use — the benchmark's own optimum survives **99.30%** of perturbations, and objective identity and graph shape survive 100%. Stability **is** a real signal: out-of-sample discrimination rises from **0.6245 to 0.6744** (+0.0499), so `STABILITY_ADDS_INFORMATION=true`. One rule of 406 cleared the floor on CALIBRATION (`risk>=400k & margin>=100k & marginVariance<=20k`, 0.9910 at n=111) and was frozen and carried to the final holdout, where it delegated **94 times at 0.9894** — one harmful change, and **below the inherited 0.99 floor**. Every other gate passed; the stage fails on 0.0006 of precision. Outcome `B_STABILITY_IMPROVES_CONFIDENCE_BUT_BELOW_FLOOR`. Estimated ceiling **0.9606** (conservative bound), limitation class `RESIDUAL_EXPERT_ERROR`: inside the high-confidence region the four errors are *more* stable than the successes (margin variance 30074 vs 31140), so no rule built from these signals can exclude them. The floor was not lowered and the statistical method was not changed. |
| Stage 2L.16 | **PASS** — Nexus residual error decomposition and risk-aware reasoning diagnosis. A diagnostic stage: it passes because it explained the residual errors reproducibly and changed nothing, not because Nexus improved. 3,308 residual errors over 15,817 decidable cases. **The mechanism Stage 2L.15 nominated is not the defect**: Nexus is 17 points *better* in risk-dominated worlds (0.9022) than outside them (0.7353), and pricing risk conditionally measures **net −309**, so `NONLINEAR_RISK_DEFECT_DETECTED=false`. The dominant defect is `SUBSTITUTE_MISVALUATION` (41.9%): Nexus credits a BYPASS whenever a substitute *exists*, without checking it is itself delivering. A bounded probe correcting only that lifts accuracy **0.7909 → 0.8130** (+351 net, 27.3% of errors); threshold alignment adds +213. Second class `SINGLE_PASS_APPROXIMATION` (39.8% dominant, 66.1% any-label) is prevalent but only marginally productive (+13 net, flagged marginal). Explained share 0.8948. **73.5% of errors choose an action worse than doing nothing** and 80.6% are fundamental misorders, because Nexus never ranks HOLD — its "should I act" test is a threshold on its own private scale. Only 11 errors are high-confidence, and their dominant class differs from the overall one (n too small for rates). Outcome `B_MULTIPLE_BOUNDED_REMEDIABLE_DEFECTS`, `NEXUS_099_FEASIBILITY=PLAUSIBLE_WITH_BOUNDED_REMEDIATION`. No remediation implemented. |
| Stage 2L.17 | **PASS** (expert remediation) — Nexus live-substitute validation and do-nothing baseline. A bounded expert remediation acting on exactly the Stage 2L.16 diagnosis; the Stage 2L.13 expert is imported frozen and was not edited. Two corrections: a BYPASS is credited only when at least one substitute could actually carry the dependency once its availability is restored, and benefit counts only value **not already delivering**. Measured on the frozen 15,817-case corpus: **Nexus 0.790858 -> 0.829108 (+3.83 pp)**, 657 errors fixed against 52 broken, **605 net eliminated**. Dead-substitute region **0.8046 -> 0.9193**; BYPASS->RESTORE errors 925 -> 417; worse-than-HOLD error rate 0.1375 -> 0.0984. `SUBSTITUTE_MISVALUATION` falls **1,385 -> 517** on the unchanged Stage 2L.16 classifier, and the replay confirms this is not relabelling. The ablation rejected switching everything on: the abstention half of the HOLD baseline measures **net -934 with zero fixes**, because the corpus is decidability-filtered so HOLD is never optimal — a limit of the corpus, not a refutation. **Safe delegation still fails**: precision **0.989474** against the 0.99 floor, one harmful change in 95 delegations — essentially unmoved from Stage 2L.15's 0.989362 despite a far better expert. Outcome `B_EXPERT_FIXED_DELEGATION_STILL_BELOW_FLOOR`. Fixed-point importance fell from +13 to **-93** and was not implemented. |
| Stage 2L.18 | **PASS** (diagnostic). Nexus high-confidence tail isolation and delegation-boundary diagnosis. Stage 2L.17 showed the delegation ceiling does not move with expert accuracy, so this stage isolated the population that actually governs it. **The entire high-confidence wrong tail is SIX cases** across all three splits (4 DEV / 1 CAL / 1 HOLDOUT) against 304 correct. A bounded search over 34 decision-time features found a rule — `nexusTopRiskAdjustment<=526975 & positiveUtilityCandidateCount<=2` — whose development lift of **0.2311 lands exactly on the permutation null's p95** (median 0.1789, p99 0.2543) and which retains only **33%/31%** of that lift on CALIBRATION and FINAL_HOLDOUT. It fails both declared criteria independently, so `SEPARABLE_SIGNAL=false`. Propagation is ruled out (the iterative probe fixes **0** and breaks 0 on this region); value diffusion has **no variance** here (every case has concentration 1.0 and one value bearer); and action type has **no contrast by construction** — the region is 310/310 PROTECT, because the rule gates on a risk adjustment the expert assigns only to PROTECT. All six errors are RISK_DOMINATED and five choose PROTECT where RESTORE was optimal; all six are fixable by a bounded single-field edit and none is a structural modelling failure. Outcome `D_REPRESENTATION_LIMIT_IDENTIFIED`, `NEXUS_099_FEASIBILITY=NOT_SEPARABLE_WITH_CURRENT_REPRESENTATION`. Nothing remediated. |
| Stage 2L.19 | **PASS** (characterization). Oracle multi-head correctness, identifiability and selective-delegation qualification. Stage 2L.18 closed the Nexus line on principle, so this stage turned to the one unexamined expert surface: `assembleOracleV2` composes **eight** heads — `direction`, `persistence`, `reversal`, `regimeChange`, `volatility`, `cycle`, `timeToThreshold`, `abstention` — and Stage 2L.10 had certified exactly one of them. Two facts had to be established before any head could be scored. **Seven of the eight emit temporal labels, not actions**: the assembly declares `actionMapping: false` and forbids `recommendedAction` and its relatives, and the Stage 2L.10 Arbiter binding pins `head: 'direction'` with a direction-shaped signal schema that rejects every other head by identity. "Utility beyond Prime" is therefore undefined for seven heads, and the honest baseline is the best trivial classifier. **The inherited Stage 2I.4 corpus is degenerate**: 2,400 nominal cases but three generator families per head and predictions constant within every family, so **effective n = 3 per head** — reporting it as n=300 would have repeated the Stage 2L.11 failure. An independent stress corpus was built (2,007 accepted, 153 rejected as ill-posed); its well-posedness filter exists because a first-draft reversal generator saturated at the range bound, flattened the recent window, and would have been scored as a head defect when the head was right. Results: `direction` **1.0000** (baseline 0.3429) and revalidated at the inherited floor on two independent bodies of evidence — 350/350 on the stress corpus, Wilson lower bound **0.992329**, and the pinned Stage 2L.10 evidence of 1,332 delegations at precision 1.0 with 0 harmful changes and 0 correct-Prime breaks (lower bound 0.997973). `volatility` 1.0000 and `abstention` 0.9952 are useful but have no delegation path. `reversal` (0.6625) and `regimeChange` (0.9167) were measured against a search-space-matched, Bonferroni-corrected null and did **not** clear it by the predeclared 0.02 margin — `regimeChange` landed exactly on the corrected threshold, the same pattern that ended 2L.18. `cycle` is identifiable but weak (lift 0.0127). Two **benchmark vocabulary defects** were found: `persistence` emits `NON_PERSISTENT` where the benchmark expects `NOT_PERSISTENT`, and `timeToThreshold` never emits `CROSSING_1_TO_3` — each caps achievable accuracy at 0.6667 regardless of reasoning quality. A head that never erred is recorded as `NOT_MEASURABLE_NO_ERROR_VARIANCE`, not as non-identifiable: an undefined AUROC reported as 0.5 would have misclassified the certified `direction` head. Outcome `B_ONE_SAFE_SPECIALIST_OTHERS_USEFUL_NOT_SAFE`, `MEASURED_ORACLE_LIMITATION=ORACLE_IS_ONE_CERTIFIED_ACTION_HEAD_PLUS_LABEL_ONLY_DIAGNOSTICS`, `REMEDIATION_CLASS=BENCHMARK_LABEL_VOCABULARY_ALIGNMENT`. Nothing remediated; Nexus untouched and all of 2L.10–2L.18 reproduce byte-identically. |
| Stage 2L.20 | **PASS** (bounded contract remediation). Oracle benchmark vocabulary alignment and head contract repair. Stage 2L.19 filed two heads as `INVALID_BENCHMARK_SEMANTICS` under one remediation class; tracing each defect to its owner shows they are different in kind, and **one of them Stage 2L.19 attributed to the wrong party**. For `persistence` the divergence is real and the producer is at fault: `NOT_PERSISTENT` is canonical on authoritative ownership — the original Stage 2I.2 head emits it, that head's own corpus expects it, and the Stage 2L.1/2L.2/2L.4 label schemas all declare it — while `NON_PERSISTENT` appears in exactly one place, the Stage 2I.3 remediation that introduced the drift. For `timeToThreshold` the head was **always correct**: it emits `CROSSING_1_TO_3` whenever that state occurs, and **every** benchmark case claiming the label — 100/100 inherited and 45/45 in Stage 2L.19's own stress corpus — generates a series whose last observed value is already past the threshold, making `ALREADY_CROSSED` the right answer. Stage 2L.19's well-posedness rule caused its half: it required the crossing to fall *inside* the observed window, which for a monotone ramp guarantees the series ends above the threshold — it enforced the negation of the label it was guarding. Defect classes `PRODUCER_LABEL_DRIFT` and `B_BENCHMARK_LABEL_INVALID`. Repairs supersede rather than edit, as in 2L.13 and 2L.17: a canonical view wraps the frozen assembly (preserving each head's own `outputDigest`) and only the family proven ill-posed is regenerated, with a `CROSSING_4_TO_8` family added because the producer emits that label and no benchmark had ever exercised it. Result: `timeToThreshold` **0.8421 → 1.0000** against a 0.2308 trivial baseline, all 5 canonical labels reachable; `persistence` **0.3432 → 0.3432**, unmoved. That null result is the finding: the rename was never what capped the head. On the inherited corpus the head does not emit the misnamed label either — it **abstains** (rate 0.3333), because Stage 2I.3 changed two things at once and added an indeterminate-direction gate the original head lacked. `MEASURED_REMAINING_LIMITATION=ABSTENTION_SEMANTICS_DIVERGENCE`, owned by `stage2i3-oracle-head-remediation.js`; fixing it means editing an abstention gate inside a frozen head, which is an algorithm redesign and out of scope. Outcome `E_DEEPER_HEAD_SEMANTICS_DEFECT` despite both contracts being repaired, because that is the fact a reader would otherwise miss. Action paths unchanged (`direction` only), no Arbiter schema widening, Nexus untouched, and 2L.10–2L.19 all reproduce byte-identically. |
| Stage 2L.21 | **PASS** (bounded head-semantics remediation). Oracle persistence abstention semantics. Stage 2L.20 named `ABSTENTION_SEMANTICS_DIVERGENCE` and pointed at the Stage 2I.3 `INDETERMINATE_DIRECTION` gate; the archaeology shows the gate is real but was **not introduced in isolation** — Stage 2I.3 changed the head and its own benchmark in the same step and the two agree (`STABLE_NO_TREND` and `ALTERNATING_DIRECTION` expect `INSUFFICIENT_EVIDENCE`, which is exactly what the gated head emits). Stage 2I.2's contract says the opposite: it abstains on `values.length < 6` and nothing else, and its own `STABLE` family expects `NOT_PERSISTENT`. **Stage 2I.4 then wired the 2I.3 head to a corpus carrying the 2I.2 expectation**, and every stage since scored that inconsistency as head error. Gate intent `TEST_DRIVEN_AND_INTERNALLY_CONSISTENT_AT_STAGE2I3`; defect origin `STAGE2I4_INTEGRATION_SPLICE`. Because neither contract is internally broken, the question was decided from architecture, not accuracy: four independent parts of the system — the 2I.2 head, the 2I.3 head's own `abstentionReason` vocabulary, the `src/experts/oracle.js` contract ("when history is too short the expert says so"), and the assembly's dedicated `abstention` head — define abstention as DATA SUFFICIENCY, and three label schemas (2L.1/2L.2/2L.4) declare a two-label persistence vocabulary with no abstention member. `STAGE2L21_PERSISTENCE_SEMANTICS_V1` therefore holds that direction indeterminacy over an adequate window is a **positive finding of NOT_PERSISTENT**, not an inability to answer. On 18 semantic cases declared before either head ran, 2I.2 scores **1.0000** and 2I.3 **0.5000**; all 9 disagreements are the same shape and the gate prevents **zero** false assertions — classification `OVER_ABSTENTION`. Repair `C_ABSTENTION_NARROWED`: only the `INDETERMINATE_DIRECTION` outcome is converted to `NOT_PERSISTENT`, and only past the head's own sufficiency gate; `SHORT_OR_MISSING_HISTORY` still abstains and `CONFLICTING_EVIDENCE` is measured and deliberately left alone. Persistence **0.343220 → 0.851695** on the frozen 2L.20 corpus (abstention 0.605932 → 0) and **0.666667 → 1.000000** on the inherited 2I.4 holdout. The 2L.19/2L.20 corpus contains **zero** cases expecting abstention, so "correct abstentions removed = 0" was vacuous there; a 60-case `SHORT_HISTORY` family was added and all 60 abstentions are retained (rate 1.0), with 0 false `PERSISTENT` introduced and 0 cases moved from right to wrong. 35 errors remain, all `SUSTAINED_RUN` cases where 2L.19's generator jitter overwhelms a slope as small as 0.004 — a corpus well-posedness question, not relabelled here. Cross-head isolation 16,114 comparisons, 0 violations; `timeToThreshold` still 1.000000; action paths still `direction` only; Nexus untouched and 2L.10–2L.20 all reproduce byte-identically. |
| Stage 2L.22 | **PASS** (semantic completion and corpus diagnosis). Two independent questions, answered without letting either stand in for the other. **A — is `CONFLICTING_EVIDENCE` an abstention or a label?** The control flow settles what it can mean: it is the FOURTH of five gates, structurally unreachable until sufficiency has passed, and the only outcome below it is `NOT_PERSISTENT`. In position it says *this answer would be NOT_PERSISTENT, but consistency is low, so abstain instead* — a behaviour-classification gate wearing an epistemic label, the same category error Stage 2L.21 found one gate above. `CONFLICTING_EVIDENCE_REQUIRES_SUFFICIENT_HISTORY=true`, classification `OVER_ABSTENTION`. **And the head was still not changed.** A sweep of **3,520** deterministic cases across slope, jitter, window length and variant reaches the gate **zero** times; so does the Stage 2L.21 corpus, **0** of 296 persistence cases. The reason is structural: `directionalConsistency` is `max(dominant, other)/nonzero` and so never falls below 0.5, leaving a band of width 0.12 below the 0.62 threshold — and a near-balanced series almost always fails `|slope| >= .003` at the gate above, which catches it first. Gate two shadows gate four across nearly the whole input space. A change justified by two hand-built cases, altering nothing on any real corpus, is not a repair, and certifying a defect "reduced" on it would be false — so decision `E_NO_CHANGE_INCONCLUSIVE`, recorded as a documentation-level defect in the frozen head: owned, not patched. **B — do the SUSTAINED_RUN cases depict a sustained run?** Adjudicated from the produced series against `STAGE2L21_PERSISTENCE_SEMANTICS_V1` with Oracle never consulted: **18 of 120** cases labelled PERSISTENT are not, and 13 more sit within 0.06 of the consistency threshold. Status `PARTIALLY_MISLABELLED`. The cause is signal-to-noise: the generator sweeps slope 0.004-0.028 against jitter 0-0.024, and a jitter swing moves a step by twice its amplitude, so the **median SNR is 0.5** (min 0.083, max 2.33) — the typical case has noise at twice the intended per-step advance. The phase map places the generator's operating box straddling the boundary rather than inside it. The corpus is **diagnosed and owned, not regenerated**: the brief asks for ownership first, and the defect does not block the semantic analysis, which never consults a label. Two scorecards are reported and never merged: as-labelled **0.881757**, semantically adjudicated **0.942568** — the gap is exactly the 18 mislabelled cases. Outcome `E_HEAD_CORRECT_CORPUS_DEFECTIVE`. Cross-head isolation 16,114 comparisons with 0 violations; `timeToThreshold` still 1.000000; action paths still `direction` only; semantics version unchanged; Nexus untouched and 2L.10-2L.21 all reproduce byte-identically. |
| Stage 2L.23 | **PASS** (evaluation-infrastructure remediation) — **current**. The Stage 2L arc had found three generator defects of one shape — a clamped reversal (2L.19), a crossing family that had already crossed (2L.20), jitter overwhelming slope (2L.22) — each caught late by a diagnostic stage puzzling over an expert that looked wrong. The common mistake: generators validated at nominal settings and never at their parameter extremes, with the family NAME treated as ground truth. This stage builds the missing discipline. **21 temporal families** inventoried from generator source, each given a semantic validator that reads the produced series and answers one question — is the intended label actually true? — **without ever calling the head under test**; the certify script scans the validator body and refuses to certify if it does. Dense sweeps over every declared range, including cross-product extremes. **Three families were proven defective on the certification corpus**: `persistence/SUSTAINED_RUN` (18 of 116), `reversal/LATE_REVERSAL` (1 of 120) and `reversal/CONTINUING` (1 of 120, a case labelled NO_REVERSAL that contains one). Six more are fragile somewhere in their declared range but clean where the corpus actually samples — recorded, not silently narrowed. **Two of the stage's own validators were wrong first and were corrected before any repair**: the reversal test looked only at the midpoint split and reported 9 defects where searching every split shows 8 turn away from the middle and are fine; and saturation was applied as a universal disqualifier, reporting 17 defects in `abstention/SUFFICIENT_HISTORY` when clamping cannot make a 24-frame window shorter — the label survived every one, and the saturation is recorded as hygiene instead. All three real defects share one root cause: a shape parameter and a noise parameter sampled independently. The repair makes noise a **fraction of** the shape parameter, bounding the worst jitter swing below one step so every case sits strictly inside the semantic region by construction; margins are reported per family in that family's own units (0.28 consistency share for SUSTAINED_RUN against a required 0.2). A reusable admission gate — generate, validate, assert, admit — rejected 5 cases during construction rather than months later during diagnosis, and 8 declared generator properties cover each historical defect shape and pass. Only proven-defective families were regenerated: 1,946 carried byte-identically, 356 removed, 355 replaced, with parent and changed-family digests recorded. **Oracle heads are byte-identical** (2,800 digest comparisons, 0 drift), so every score change is corpus movement: `persistence` **0.881757 → 0.939189**, converging on the 0.942568 Stage 2L.22 measured by adjudicating series instead of trusting labels — the check that the repair was the right one; `reversal` 0.6625 → 0.715481. Identifiability recertified for both changed heads with the 2L.20 method verbatim; `reversal` moves to `MEASURED_NON_IDENTIFIABLE` (0.707407 against a corrected threshold of 0.688889 plus the 0.02 margin), which matches its existing 2L.19 portfolio class, so no classification changes. Outcome `B_MULTIPLE_GENERATOR_DEFECTS_REPAIRED`. Action paths still `direction` only; Nexus untouched; 2L.10–2L.22 all reproduce byte-identically. |
| Stage 3+ | Not started |

Authority remains **R0** at every stage above: `canDispatch=false`,
`canMutateLiveWorld=false`. The scripted ZekNova NPC AI is still the sole live
executor, and no authority increase is permitted before Stage 10.

### What Stage 2L.10 established

Delegation now requires two independent things, not one:

- **evidence validity** — is this legitimate Oracle/Nexus evidence for this exact
  decision? (Stage 2L.7, imported frozen, still holds the veto)
- **expert correctness confidence** — given legitimate evidence, how justified are
  we in believing this expert should replace Prime?

The second is answered by expert-emitted correctness attestations mapped to
deterministic uncertainty buckets, each carrying a reliability measured only on
the calibration corpus and gated at a floor fixed a priori from the inherited
harm ceiling. A valid expert that cannot establish decision-specific confidence
produces `ABSTAIN_FROM_DELEGATION`, never trust-by-default. Stage 2L.10
delegations are a strict subset of Stage 2L.7 delegations, so no inherited
protection can be weakened by construction.

### What Stage 2L.11 established

Stage 2L.10 left one question open: was Nexus's zero contribution a property of
Nexus, of the evidence contract, or of the task? Stage 2L.11 measured it and
found the *benchmark* was the defect — correctness was an independent seeded
draw, so no expert could be shown good or bad. `CONTRACT_INCOMPLETE` was
empirically excluded; `REMEDIATION_CLASS = CORPUS_SEMANTICS`.

### What Stage 2L.12 established

Stage 2L.12 repaired the benchmark and then re-ran the measurement.

Ground truth is now derived from deterministic world semantics — never drawn.
Topology, semantics and action sets come from three independent seeded streams,
so structural attractiveness and objective utility are free to disagree, and
eight semantic profiles ensure they frequently do (worthless bottlenecks,
expensive bottlenecks, value on low-degree leaves, risk-dominated worlds,
available substitutes). An anti-degeneracy gate rejects any corpus a trivial
heuristic could win; an earlier draft with `ALWAYS_HOLD` optimal 73.7% of the
time was rejected under it before any expert was evaluated.

Measured against the repaired benchmark, the inherited Nexus expert scores
**0.0844** where Prime scores **0.3946**, random is 0.1667 and the best trivial
policy is 0.3931. Its accuracy tracks the decoupling exactly: 0.1432 where
structure carries the value, 0.0225 where the value sits on a low-degree leaf.

Correctness is now partially predictable — a rule frozen on discovery held at
0.2581 on holdout against a 0.1383 base rate — but the predictive signal is
`baselineUtility`, world state the Arbiter does not receive. Every feature Nexus
itself emits falls **below** the permutation null.

`MEASURED_LIMITATION = EXPERT_SEMANTICS`: Nexus reasons about structure while
optimality is determined by value, cost and risk — quantities that are present in
the canonical state but that its contract does not read.

### What Stage 2L.13 established

Stage 2L.12 named the limitation `EXPERT_SEMANTICS` and stopped. Stage 2L.13 acted
on exactly that, and nothing else.

A source audit of the whole inherited Nexus path confirmed the diagnosis at the
line level: `objectiveValue`, `restorationCost`, `risk`, `protectionNeed`,
`availability`, `demand`, `baseCapacity` and `objectiveRelevant` were read by
nothing. Recommendation and confidence were functions of graph shape and two
booleans.

The remediated expert reasons about relational *utility* — value reached through
the dependency graph, priced against cost and risk, discounted for redundancy —
and emits an auditable decomposition rather than one opaque scalar. It lives in
its own file that imports nothing from the benchmark; the certify script refuses
to run if that ever changes. It remains an approximation, not the oracle: it picks
the optimal action 80% of the time but reproduces the true full ranking only 38.5%
of the time.

The decisive check is the identical-topology test. Under the inherited expert the
same graph always produced the same recommendation regardless of where the value
sat, which is why it failed. It no longer does.

Still open after Stage 2L.13, and carried into Stage 2L.14:

- **Nexus delegation remains unauthorised, and the blocker has moved.** It is no
  longer accuracy — Nexus now beats Prime by 39 points. It is *confidence*: the
  best eligible bucket reaches 0.9459 against the inherited 0.99 floor. Closing
  that gap needs better expert self-assessment, not better recommendations.
- **Nexus can now discriminate its own correctness**, which it could not at
  Stage 2L.12. The frozen rule held at 0.9833 out of sample against a 0.8041 base
  rate. It just does not reach the delegation standard.
- **The residual ~22% error concentrates in `VALUE_DIFFUSE` and `CYCLE`**, where
  the expert's single-pass, no-fixed-point approximation is weakest.
- **Only Oracle's direction head has a calibrated correctness signal.** The other
  six heads still cannot justify a delegation.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.13. It remains an explicit later certification item.
- Prime's priors are still uniform; the Router remains outside the certified Prime
  path.
- **Live ZekNova qualification remains uncertified** under the current lineage:
  0 accepted records, 0 accepted sessions, 0 accepted simulations,
  `thresholdsPass=false`, `certified=false`.

### What Stage 2L.14 established

Stage 2L.13 left the blocker precisely located: not accuracy, but *confidence*.
Stage 2L.14 tested whether that gap could be closed by calibration alone — with
the inherited 0.99 floor held fixed — and established that on this corpus it
cannot.

The stage's design is the result. A two-way split would have explored on one draw,
selected `R>=500000 / M>=300000` at 0.9917, scored **0.9927** on the holdout and
reported a pass. The three-way separation put a second, independent draw between
exploration and selection, and that draw scores the same cell at **0.9691**. Every
cell that cleared the floor on `DEVELOPMENT` lost it on `CALIBRATION`; several
regained it on the final holdout. High, low, high, at n in the tens to low
hundreds, is a region whose true rate sits near 0.97-0.98 with sampling noise on
either side — not a region that is genuinely >=0.99.

Three further things were measured and deliberately not acted on:

- **Structural ineligibility still overrides measurement.** Three of the six
  confidence buckets are ineligible a priori because the expert disclaims its own
  basis in them. That rule is inherited from Stage 2L.10, where a bucket measuring
  1.0 reliability was refused for the same reason.
- **The added multi-axis robustness probe is near-useless as a signal.** 98.1% of
  cases are fully robust, and that set is 0.8062 accurate against a 0.8041 base
  rate. It is recorded as `discriminativeValue: NEGLIGIBLE` and retained only as a
  fail-closed gate.
- **`nexusUtilityMargin` inverts at the top.** Above 3M, the expert's own margin is
  *negatively* associated with correctness (0.4396). Confidence is carried by
  `nexusTopRiskAdjustment`. Margin survives only as a secondary gate at
  predeclared values.

Still open after Stage 2L.14, and carried into Stage 2L.15:

- **Selective Nexus delegation remains unauthorised**, and the limitation is now
  named precisely: it is neither the expert (2L.13), the benchmark (2L.12), the
  Arbiter, nor the expressiveness of the confidence contract. It is that this
  expert's achievable reliability ceiling on this corpus sits near 0.98, below a
  floor of 0.99. Prime keeps the recommendation on every case, forgoing 2,332
  measured beneficial opportunities to do so.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.14. Stage 2L.14 records the limitation and does not address it.
- Everything else open after Stage 2L.13 remains open. Stage 2L.14 changed no
  expert, no benchmark, no arbiter and no threshold.

### What Stage 2L.15 established

Stage 2L.14 left the ceiling measured but unexplained: supported reliability near
0.98 against a 0.99 floor, with no account of *why*. Stage 2L.15 added one family
of decision-time evidence — does the recommendation survive bounded, legitimate
perturbation of the quantities the world is uncertain about? — and answered it.

**The signal is real.** Combining stability with the existing confidence signal
lifts out-of-sample discrimination from 0.6245 to 0.6744. That is reported as a
genuine gain, not talked up and not talked down.

**It is not sufficient, and the reason is specific.** Stability exposes errors in
the regions where Nexus was already visibly unsure, and exposes nothing where
delegation would actually occur:

| high-confidence region (risk >= 500k, margin >= 200k), n=274, 4 wrong | correct | wrong |
|---|---|---|
| mean margin variance | 31140 | 30074 |
| mean top-action stability | 999471 | 1000000 |

The errors that matter are not unstable, not contradicted, not low-margin and not
low-risk. They are simply wrong, and confidently so. Hence
`CEILING_LIMITATION_CLASS = RESIDUAL_EXPERT_ERROR`: the remaining gap is reachable
by improving the expert, not by measuring confidence better over the current one.

Three further findings, measured and deliberately not acted on:

- **The flip rate is nearly worthless.** 81.1% of all errors are perfectly
  top-stable and 7.8% of correct answers are not. Variance carries what signal
  exists; flipping does not.
- **Multiplicity was priced rather than ignored.** At n=111 a region whose true
  rate is 0.98 has a 34.7% chance of measuring at or above 0.99. Across 406 rules,
  one such region appearing is the expectation. The one that did scored 0.9524 on
  DEVELOPMENT — the Stage 2L.14 noise-pocket pattern with the odd draw moved.
- **`VALUE_DIFFUSE` errors are unstable; `RISK_DOMINATED` errors are not.** The
  former is the worst regime (0.5476) and stability finds it. The latter is the
  largest (982 cases), holds most delegation-eligible work, and stability is blind
  to its errors.

Two defects in this stage's own machinery were caught by its adversarial suite and
fixed before certification: a delegation gate that trusted stability evidence with
an unknown schema, a superseded producing model or out-of-domain values; and a
Prime baseline that used a convenience ordering rather than the inherited certified
path, understating Prime at 0.0605 instead of 0.3995 and inflating apparent uplift
roughly sixfold. A test now pins the Prime figure to Stage 2L.14's.

Still open after Stage 2L.15, and carried into Stage 2L.16:

- **Selective Nexus delegation remains unauthorised.** The blocker has moved once
  more — from accuracy (2L.13) to confidence (2L.14) to *residual expert error that
  carries no observable instability*. Prime keeps the recommendation on all 5,324
  holdout cases.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.15. Stage 2L.15 records the limitation and does not address it.
- Everything else open after Stage 2L.14 remains open. Stage 2L.15 changed no
  expert, no benchmark, no arbiter, no threshold and no statistical method.

### What Stage 2L.16 established

Stage 2L.15 closed off confidence mining and named the limitation
`RESIDUAL_EXPERT_ERROR` without saying what the error *was*. Stage 2L.16 diagnosed
it, and the first result is a correction to the previous stage's hypothesis.

**Risk is not the defect.** Stage 2L.15 nominated `RISK_DOMINATED` worlds as a
candidate locus. They are where Nexus performs *best*: 0.9022 against 0.7353
elsewhere, with accuracy rising monotonically across aggregate-exposure quartiles.
A real structural asymmetry does exist — the objective penalises risk conditionally
on a protector delivering, while Nexus prices exposure only for a PROTECT on the
target itself, so 95.1% of its errors credit no risk at all — but pricing that
conditionality measures **net −309**. Prevalence is not causation:
`RISK_UNDERESTIMATION` carries an 84.6% any-label prevalence and explains nothing.

**The dominant defect is substitute liveness.** Nexus credits a BYPASS whenever a
substitute *exists* (`addressesTarget = substitutes.length > 0`), while the world
honours a substitute only when it is itself delivering. That is 41.9% of residual
errors, and a bounded probe correcting only it moves accuracy 0.7909 → 0.8130.
Threshold alignment — the expert operates at 500,000 where the world's
availability threshold is 600,000 — adds a further +213 net.

**The severity finding matters more than the rank finding.** The true optimum sits
second in Nexus's ordering 52% of the time, which reads like near-miss error. It is
not: 80.6% of errors are fundamental by utility, and **73.5% choose an action worse
than doing nothing**. Both are true because *Nexus never ranks HOLD* — it orders
interventions only and acts whenever its own `finalRelationalUtility > 0`, a
threshold on a private scale never calibrated against the true do-nothing baseline.
Counterfactuals agree: 82.3% of errors are deep mis-modelling, not boundary ties.

**Value diffusion is real and monotone.** Accuracy falls from 0.8654 with one
value-bearing entity to about 0.56 with seven or more; diffuse worlds score 0.5844
against 0.8489 concentrated.

Methodological note, because the conclusion depends on it: an early draft
reimplemented the Nexus scorer to toggle mechanisms and agreed with the frozen
expert on only 98.5% of cases. It was discarded. Every probe reported instead adds
an additive delta to the frozen expert's own decomposition, so the baseline
reproduces the expert by construction and the certification refuses to run if it
does not.

Still open after Stage 2L.16, and carried into Stage 2L.17:

- **Selective Nexus delegation remains unauthorised.** Nothing was remediated; this
  stage only says what to remediate.
- **Raw accuracy is not delegation precision.** Stages 2L.14 and 2L.15 both showed
  a supported region at 0.99 is a far stronger requirement than an accuracy gain,
  so `PLAUSIBLE_WITH_BOUNDED_REMEDIATION` is a diagnosis, not a forecast.
- **Only 11 residual errors are high-confidence**, and their dominant class
  (`SINGLE_PASS_APPROXIMATION`) differs from the overall one. The sample is too
  small to carry rates.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.16.
- Everything else open after Stage 2L.15 remains open. Stage 2L.16 changed no
  expert, no benchmark, no arbiter, no threshold and no statistical method.

### What Stage 2L.17 established

Stage 2L.16 named two defects and measured a probe for the first. Stage 2L.17
implemented both properly and measured what they were worth.

**The diagnosis was right, and the probe was not the fix.** Stage 2L.16's probe
tested "is the substitute currently delivering", which cost it 552 broken cases.
That test is wrong, because the world's BYPASS *sets the substitute's availability
to full* — a substitute that is down only because it is unavailable is exactly the
case the action repairs. The correct decision-time question is counterfactual:
would this substitute deliver once availability is no longer its problem, i.e. has
it the capacity it needs and is its own prerequisite closure clear. Implemented
that way, the live-substitute requirement fixes 300 cases and breaks **zero**.

**The second defect was mis-stated as a HOLD problem.** Stage 2L.16 observed that
73.5% of errors chose an action worse than inaction and inferred that Nexus needed
to rank HOLD. The measured truth is narrower: the benefit term was never a
counterfactual delta, so an intervention on an already-healthy chain scored the
chain's whole worth. Crediting only value **not already delivering** is the fix
(+501 net). Adding the abstention gate on top measures **-934 with zero fixes**,
because the corpus is decidability-filtered and HOLD is never optimal in it. The
gate's merit is untested here rather than disproven, and it was not shipped.

**The delegation ceiling did not move.** This is the stage's most important
negative result. With an expert 3.83 points more accurate and 605 errors lighter,
delegation precision went from 0.989362 to **0.989474** — one ten-thousandth — and
the failure is still a single harmful change out of 95 delegations. Whatever
governs the 0.99 ceiling on this corpus, it is not the expert's average accuracy.

**The dominant class changed for an uninteresting reason.**
`SINGLE_PASS_APPROXIMATION` is now largest, but it was already second at 1,318 and
grew by 38. It was promoted because the class above it shrank, so the stage does
NOT report a newly exposed defect; the certification requires a class to be both
not-already-prominent and materially grown before it will.

Still open after Stage 2L.17, and carried into Stage 2L.18:

- **Selective Nexus delegation remains unauthorised**, now for a reason that
  survived a real expert improvement. The next question is what the delegation
  ceiling actually depends on, since accuracy has been ruled out.
- **The abstention mechanism is unmeasurable on this corpus.** Testing it needs
  cases where holding is correct, which the decidability filter removes.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.17.
- Everything else open after Stage 2L.16 remains open. Stage 2L.17 changed no
  benchmark, no arbiter, no Prime, no threshold and no statistical method.

### What Stage 2L.18 established

Stage 2L.17 ruled out expert accuracy as the thing governing the 0.99 ceiling.
Stage 2L.18 asked what does, and the answer is a population too small to interrogate.

**Six cases.** That is the entire high-confidence wrong tail across all three
splits — four in DEVELOPMENT, one in CALIBRATION, one in FINAL_HOLDOUT, against
304 correct. Every figure in the stage is reported with its sample size attached,
and shares over six cases are labelled as counts rather than rates.

**The search found a rule, and the rule is noise.** A bounded search over 34
decision-time features produced a two-term conjunction with a development lift of
0.2311. The permutation null — re-running the *identical* greedy conjunction
search over shuffled labels — has median 0.1789, p95 0.2311 and p99 0.2543. The
observed lift lands exactly on p95: the search finds a rule this good on shuffled
labels one time in twenty. It also retains only a third of its lift out of sample
(33.2% on CALIBRATION, 30.7% on FINAL_HOLDOUT). It fails both declared criteria
independently.

A methodological note that changed the verdict: an earlier draft compared a
conjunction search against a single-term null. That is rigged — the observed
search explores a strictly larger space, so its best is inflated relative to its
threshold — and it produced a false positive. Corrected, the signal disappears.

**Three candidate mechanisms were ruled out, each for a different reason.**

- *Propagation* is not it: the wrong cases are LESS likely to show a propagation
  disagreement than the correct ones (0.833 vs 0.878), and the Stage 2L.16
  iterative probe applied to this region fixes 0 and breaks 0.
- *Value diffusion* cannot be it: every case in the region, correct and wrong,
  has value concentration 1.0 and exactly one value bearer. The feature has no
  variance to separate anything with.
- *Action type* has no contrast by construction: the region is 310/310 PROTECT,
  because the frozen rule gates on `nexusTopRiskAdjustment` and the expert assigns
  a non-zero risk adjustment only to PROTECT. That is arithmetic, and it is
  recorded as such rather than reported as "PROTECT carries 100% of the errors".

**The limit is information, not mechanism.** `REPRESENTATION_INSUFFICIENT`. And
the honest statement cuts both ways: no separating property was found in the
expert-visible state, AND at six positives a real but moderate effect could not
have been detected if one existed. That is a characterised absence of evidence,
not evidence of absence. `RECOMMENDED_REMEDIATION_CLASS=NONE_SUPPORTED_BY_EVIDENCE`
— proposing a fix here would mean fitting to six cases.

Still open after Stage 2L.18, and carried into Stage 2L.19:

- **Selective Nexus delegation remains unauthorised**, and both obvious routes are
  now closed: it does not yield to a better expert (2L.17) and it does not yield
  to a better confidence rule over the current representation (2L.18).
- **The delegation region is structurally PROTECT-only.** Whether that is the
  right region at all is a question this arc has not asked.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.18.
- Everything else open after Stage 2L.17 remains open. Stage 2L.18 changed no
  expert, no benchmark, no arbiter, no threshold and no confidence rule.

### What Stage 2L.19 established

Oracle is not a multi-capability delegation portfolio. It is **one certified
action head plus seven label-only diagnostics**, and that is an architectural
fact rather than a quality judgement: the heads are computed coherently and
exposed with their own digests, but the Arbiter's Oracle signal schema is
direction-shaped down to the field names, so admitting another head would be a
schema change, not a configuration change. Nothing in the measurements says the
other seven reason badly — `volatility` is perfect and `abstention` near-perfect
on a corpus built to stress them — only that there is no delegation for them to
be safe or unsafe about.

Two methodological points carried over from earlier stages and both mattered
here. The null searches the identical hypothesis space as the observed search
(2L.18's hard-won requirement), and the Bonferroni correction across eight heads
is fixed before any holdout figure is read; under that discipline two heads that
looked separable were not. And a measurement artifact was caught before it became
a finding: three heads have no wrong cases on a measurable split, so their
self-correctness AUROC is undefined — reporting that as 0.5 would have classified
the Stage 2L.10-certified `direction` head as non-identifiable.

Still open after Stage 2L.19, and carried into Stage 2L.20:

- **Two Oracle heads cannot be scored at all** until the benchmark label
  vocabulary and the head output vocabulary are aligned. This is a contract
  defect with a named owner, not a reasoning defect, and it was not fixed here.
- **Whether any label-only head deserves an action path** is unasked. Answering
  it means widening the Arbiter's Oracle signal schema, which is out of scope.
- **Selective Nexus delegation remains unauthorised** on exactly the Stage 2L.18
  terms; Stage 2L.19 touched no Nexus code and reproduced 2L.17 and 2L.18
  byte-identically to prove it.
- **Portability is single-platform** (`DIGEST_PRODUCED_SINGLE_PLATFORM`) for
  2L.10 through 2L.19.

### What Stage 2L.20 established

Two lessons, one about Oracle and one about this project's own method.

About Oracle: a label mismatch and a missing label are not the same defect, and
neither is automatically the producer's fault. `timeToThreshold` was never broken
— it scored 0.8421 because a third of its benchmark asked it to be wrong, and it
scores **1.0000** once the benchmark states the case it claims to state. Fixing
`persistence`'s vocabulary, by contrast, moved accuracy by exactly zero digits,
because the naming drift and the accuracy ceiling had different causes that
Stage 2I.3 introduced in the same change.

About method: Stage 2L.19 built a well-posedness filter precisely to stop a
generator bug being reported as a head defect, and then shipped a rule that
enforced the negation of the label it guarded. The filter caught the reversal
family and missed the crossing family. A well-posedness rule needs its own
adversarial case — "what series would satisfy this rule and still make the label
false" — and Stage 2L.19 did not ask that question of the rule it wrote.

Still open after Stage 2L.20, and carried into Stage 2L.21:

- **`persistence` remains below its trivial baseline** (0.3432 against 0.5085) and
  the cause is an abstention gate inside a frozen head. Changing it is an Oracle
  algorithm redesign, deliberately not attempted here.
- **The Stage 2I.4 inherited corpus still cannot reach every canonical label.**
  Only the Stage 2L.20 repaired corpus can. The inherited corpus was left
  untouched so prior certifications keep reproducing.
- **No Oracle head gained an action path.** `direction` remains the only one, and
  whether any label-only head deserves delegation is still unasked.
- **Portability is single-platform** for 2L.10 through 2L.20.

### What Stage 2L.21 established

The lesson is about attribution. Stage 2L.20 correctly identified *where* the
persistence defect lived and still described it slightly wrong: not "the gate is
a mistake" but "two internally consistent contracts were spliced, and the splice
was never adjudicated." Stage 2I.3 shipped its gate with tests that expect exactly
what the gate produces. It was Stage 2I.4 that paired that head with the older
corpus, and no stage since had asked which contract was intended.

Adjudicating it required a rule the project had not written down: abstention
means insufficient data, not insufficient certainty. Once that is stated, most of
the persistence "errors" stop being errors — the head was answering a different
question from the one the corpus asked.

The other lesson repeats one from 2L.19 and 2L.20. A metric that cannot come out
any other way is not evidence. "Correct abstentions removed = 0" looked like proof
the narrowing was safe, on a corpus where no case expects an abstention at all.
It took adding 60 cases that genuinely require one before the claim could be made.

Still open after Stage 2L.21, and carried into Stage 2L.22:

- **35 persistence errors remain**, all in the `SUSTAINED_RUN` family, where the
  generator's jitter can overwhelm a slope as small as 0.004. Whether those cases
  are truly `PERSISTENT` is a corpus question. They were not relabelled, because
  relabelling a case because the head disagrees is the tuning this arc has
  refused throughout.
- **`CONFLICTING_EVIDENCE` remains an abstention reason** on a sufficient window.
  Under the Stage 2L.21 definition it is likely the same category error as
  `INDETERMINATE_DIRECTION`, but the evidence is weaker and narrowing it would
  exceed the smallest bounded change.
- **No Oracle head gained an action path.** `direction` is still the only one.
- **Portability is single-platform** for 2L.10 through 2L.21.

### What Stage 2L.22 established

Persistence semantics are now complete, and the completion is mostly a negative
result — which is the point. The `CONFLICTING_EVIDENCE` gate really is the same
category error Stage 2L.21 repaired one gate above it. It also fires on nothing:
zero cases in a 3,520-case sweep, zero in the real corpus. Being right about a
defect is not the same as having something to repair, and this stage declined to
act on a population of two hand-built cases exactly as 2L.15, 2L.18 and 2L.19
declined before it. The certification refuses to record a reduction for a change
that did not ship.

The corpus question turned out to be the substantive one. Fifteen percent of the
`SUSTAINED_RUN` family does not depict a sustained run, because the generator was
built to sweep slope and jitter independently without asking whether the two
ranges are compatible — at the low end the jitter is six times the slope. That is
the third generator defect this arc has found in its own corpora (the 2L.19
reversal family clamped, the crossing family ran past its threshold, and now
this), which suggests the pattern is not bad luck but a missing discipline:
a generator needs a well-posedness proof at its parameter extremes, not just at
its centre.

Still open after Stage 2L.22, and addressed in Stage 2L.23:

- **The SUSTAINED_RUN family is mislabelled** on 18 of 120 cases and unstable on
  13 more. Ownership is established and regeneration is deliberately deferred to
  a stage that can re-derive the family and re-certify everything downstream of
  it.
- **`CONFLICTING_EVIDENCE` remains in the frozen head** as an unreachable
  documentation-level defect. Repairing it would require an input that provokes
  it, and no natural one exists.
- **No Oracle head gained an action path.** `direction` is still the only one.
- **Portability is single-platform** for 2L.10 through 2L.22.

### What Stage 2L.23 established

The three generator defects were not three accidents. They were one missing
discipline, and the discipline is now code: a validator per family that reads the
produced series rather than trusting the family name, a dense sweep across every
declared parameter range instead of the nominal centre, and an admission gate that
refuses an ill-posed case at construction time. The gate fires — five cases were
rejected during generation — which is the difference between a check and a
decoration.

The stage also had to correct itself twice before it could correct anything else.
Its first reversal validator tested only the midpoint split and manufactured eight
false defects; its first saturation rule was universal and manufactured seventeen
more. A validator that is too strict fabricates corpus defects exactly as a
generator that is too loose fabricates expert defects, and the same evidence
standard has to apply in both directions.

The convergence is the strongest single result: repairing the corpus moved
`persistence` from 0.881757 to 0.939189, almost exactly onto the 0.942568 that
Stage 2L.22 had computed by adjudicating the series and ignoring the labels
entirely. Two independent routes to the same number is what a correct repair looks
like.

Still open after Stage 2L.23:

- **Six families remain fragile at parameter extremes** the certification corpus
  never visits. Nothing certified rests on them; the ranges are recorded rather
  than narrowed, so a future generator that samples those corners will be caught
  by the sweep rather than by an expert diagnosis.
- **`CONFLICTING_EVIDENCE` remains** in the frozen persistence head as an
  unreachable documentation-level defect (2L.22).
- **No Oracle head gained an action path.** `direction` is still the only one.
- **Portability is single-platform** for 2L.10 through 2L.23.

## Stage 2M — portability, environment independence and qualification readiness

Stage 2L closed at 2L.23. Stage 2M is the first stage of this arc that changes no
reasoning at all: not one Oracle head, not one Nexus module, not the Arbiter
policy, not an action path. Every one of those is a frozen owner of the certify
script, which exits 2 rather than proceed if any of them moves. What it changes is
how the repository *finds* its runtime.

### The defect

Thirty-one entry points would not run on a machine other than the one they were
written on, in two shapes.

Twenty-eight of them — every ZekNova-dependent certify script and test in the
kernel workspace — resolved the runtime as:

```js
process.env.ZEKNOVA_ROOT || '/Users/<developer>/Desktop/zeknova-shared-gaming-experience'
```

On the machine where that path exists, everything worked. Anywhere else the
fallback produced a path that did not exist, and the failure surfaced several
layers later as an anonymous `ENOENT`. A missing dependency was being reported as
a broken file read, which is why it survived this long: the error never named the
thing that was actually wrong.

The other three are the more interesting ones, because no literal-path search
finds them. Two mainline shell entry points hardcoded absolute paths for *both*
repositories. And `integration/status.mjs` defaulted both roots to
`os.homedir()/Desktop/...` — which reads as a default and is in fact a machine
assumption. That shape is the one worth remembering: it had passed every previous
audit precisely because it contains no suspicious string.

### The contract, and what portability is not

`ZEKNOVA_ROOT` (`ZEKNOVA_ROOT_CONTRACT_V1`): one variable, no default, no search,
four structural markers, five named statuses, fail-closed.

Portability here does **not** mean "finds the runtime somewhere". A resolver that
walked the filesystem or read a home directory would satisfy every behavioural
test in this stage while reintroducing exactly the defect the stage exists to
remove — it would simply fail later and less legibly. So the certify script scans
the resolver's own source for directory traversal, home-directory reads, developer
paths and fallback defaults, and refuses to certify if it finds any of them. The
prohibition is structural, not behavioural, because the behaviour is identical
right up until it is catastrophic.

Structural validity is also kept separate from lineage identity. Asking "is this a
ZekNova root?" and "is this the certified ZekNova?" are different questions, and a
resolver that answered both would refuse a legitimate runtime for the sin of
having changed.

Eight adversarial roots were exercised. Six refuse — unset, blank, nonexistent, an
empty directory, a file, and a decoy carrying three of four markers. Two bind — a
path containing a space, and one with surrounding whitespace. Refusing those two
would be a portability defect of the opposite kind. Every refusal carries a named
status and a reason; none reaches a raw `ENOENT`.

### Path independence, proved in both directions

Two byte-identical trees at unrelated roots — one nested three levels deep with a
space in its name — produce one identity. A single changed byte under a third root
breaks it.

Both halves are load-bearing and neither is sufficient alone: a constant digest
passes the first test, and a path-dependent digest passes the second. Only a
content-addressed identity passes both. The same measurement re-run from a
different working directory produces byte-identical results, which is the
invocation-independence claim.

### What was not measured, and was not assumed

No ZekNova runtime is reachable from the certifying environment. Three phases
therefore report `NOT_MEASURED`, and the certification refuses outcome A for
exactly that reason:

- **Current lineage** — `UNKNOWN`, basis `NOT_MEASURED_ZEKNOVA_ROOT_UNBOUND`. A
  lineage classification produced without reading the runtime would be a guess
  wearing a certification label.
- **Observation-contract compatibility** — every one of the nine surfaces is
  `null`, not `compatible`.
- **The full suite under a valid root** — a fixture root is not a runtime, and
  running the suite against one and calling the result "the full suite with a
  valid root" would be the overclaim this stage is meant to prevent.

The machinery for all three is built and exercised against fixtures. It is the
runtime that is absent, not the capability.

`CURRENT_LINEAGE_LIVE_QUALIFICATION_READY=false`. Live qualification was not begun.

### The portability claim, stated at its actual size

**`MULTI_ROOT_SAME_PLATFORM_CERTIFIED`** — and specifically not
`MULTI_PLATFORM_CERTIFIED`. Measured on one platform across multiple invocation
directories and multiple runtime roots. No second operating system was available,
so the inherited `DIGEST_PRODUCED_SINGLE_PLATFORM` limitation is carried forward
unchanged rather than closed. Environment independence and platform diversity are
different claims and this stage earned only the first. The certify script blocks
on an unrecorded platform rather than silently widening the claim by being run
somewhere new.

### The delivered lean bundle

Audited, not rebuilt. The bundle delivered after 2L.19 is pinned to `91ec243`,
four commits behind, and carries the defect this stage removed in 33 files —
unpacked anywhere but the build machine, it fails in exactly the way described
above. It is left byte-identical: overwriting the artifact an earlier delivery
refers to would destroy the object being certified. A portable bundle is a new
file under a new name. "Lean" describes packaging, not authority; the bundled
system is R0 advisory-only and shipping it promotes nothing.

### Three defects the stage found in its own fence

Testing the certification from a distribution bundle — the thing the stage is
supposed to make possible — broke it three times, and each break was the failure
mode this stage exists to remove, reproduced by the script enforcing its removal.

**It died on a raw git error.** Unpacked from a zip there is no `.git`, and the
repository-wide scan crashed with `fatal: not a git repository` — an anonymous
error standing in for a missing dependency, which is exactly the shape of the
original defect. It is now a named status, `REPOSITORY_SCAN_UNAVAILABLE_NOT_A_GIT_CHECKOUT`,
that blocks certification and permits `--check`; and the survivor count and the
bundle's commit distance are pinned rather than re-derived from git, so the
certification verifies from the bundle it ships in.

**The fence read prose.** Once this stage's own sources were committed, the scan
saw them and flagged them — they quote the defect in the scan pattern, in the
dependency descriptions and throughout the report. Excluding two files from a text
search and stopping there would put the blind spot exactly where a defect could
hide best, so string literals are now collapsed to a token before scanning: what a
file *says* disappears, what it *does* survives, and the two files are held to the
stricter question of whether they resolve anything from a fallback.

**The pattern missed the real shape.** A mutation test — reintroduce the defect
four ways, confirm each is caught — found that the fallback pattern matched
`process.env.ZEKNOVA_ROOT || '...'` but not `env[ZEKNOVA_ROOT_ENV] || '...'`,
which is the form the resolver actually uses. A fence that catches the defect only
in the shape nobody would write it in is decoration. All four mutants are caught
now, and the fence was verified against a genuinely mutated resolver, not only in
a probe.

### One inherited finding, recorded rather than absorbed

`SHA256SUMS.txt` already disagreed with four artifacts at `3d9a14d`, before this
stage changed anything — none of the four is modified in the Stage 2M tree and
the manifest itself is unmodified, so the drift is inherited. Regenerating the
manifest is the normal end-of-stage inventory step and would have corrected those
four silently, which is precisely how a stale manifest survives a dozen stages.
The finding is written down in
`artifacts/stage2m-portability-and-qualification-readiness/stage2m-inventory-drift-note.json`,
deliberately outside the certification body: it says nothing about any certified
claim, and every prior certification was re-verified independently and reproduces
byte-identically.

### Still open after Stage 2M

- **Current ZekNova lineage is unmeasured.** Not drifted, not compatible —
  unmeasured. The comparison runs the moment a root is bound.
- **Portability is single-platform.** `DIGEST_PRODUCED_SINGLE_PLATFORM` is carried
  forward, not remediated.
- **Six corpus families remain fragile at parameter extremes** (2L.23).
- **`CONFLICTING_EVIDENCE` remains** in the frozen persistence head as an
  unreachable documentation-level defect (2L.22).
- **No Oracle head gained an action path.** `direction` is still the only one.

Stage 2M certification hash: `9a44f6bc6803b2d32ff53203d9eb8fd56ff4a77809e7d7d7a1bfc72ca09af463`
(`npm run portability:stage2m:check` reproduces it byte-identically, including from an
unpacked distribution tree with no `.git`).

## Stage 3A — Sentinel Forge World

A new subsystem rather than a change to an existing one: a deterministic ASCII
simulation environment that owns world truth — dynamics, legal actions, canonical
state, exact counterfactual outcomes and a versioned reward — so Sentinel can be
measured against exact answers instead of against another model's opinion.

Recorded here as an early foundational capability. Forge World belongs primarily
to **Stage 5 — Learning & Adaptation**; it was built ahead of the stage that will
use it, and nothing in Stage 3A trains anything.

Every certified decision component is a frozen owner of the Stage 3A certify
script: both experts, Prime, the authority core, the contract layer, and the 2L/2M
lab modules. Forge World is measured against Sentinel; Sentinel is not adjusted to
suit Forge World.

### What it establishes

28 scenario families across four decision surfaces, six curriculum levels, 504
generated cases, all admitted. 12 entity types, 11 relation types, 12 action types,
11 reward components under `FORGE_REWARD_V1`. Forge World implements the existing
Adapter SDK contract, so Prime and both experts run against it with no
Forge-specific branch anywhere in their path — Prime produced a legal
recommendation on 100% of cases.

Every quantity is an integer. No floating point appears in any transition or
reward path, which makes determinism a property of the arithmetic rather than a
hope about it, and makes an exact tie exactly a tie.

### The three disciplines carried forward

**ASCII is presentation, and it is checked.** `hashWorld` excludes presentation,
the certify script verifies neither kernel nor adapter imports the renderer, and a
test renders a world twice with different options and requires identical identity.

**The admission gate has a control.** A 100% admission rate is equally consistent
with a gate that cannot reject anything, so seven scenarios are generated under one
family and validated against a different family's claim — the honest claim must
hold and the false one must be refused. The gate earned its place during
construction: `prime/resource_constrained_planning` was rejected on all eighteen of
its first cases because the generator placed repairable nodes by entity count and
the energy budget always covered every repair. The family claimed a constraint that
was not in the world it produced.

**Effective variation, not raw count.** 504 cases rest on 105 distinct topologies
and 334 distinct outcome rankings. The reportable sample size is the smallest of
those, never the raw count.

### The measurement that had to be corrected

The first run reported 0% agreement between Prime and the counterfactual optimum
across all 144 Oracle-surface cases. Zero across a whole surface is a claim about a
systematic effect, so it was inspected rather than reported — and the defect was in
the metric. Prime was choosing `PROTECT target`, which tied at the optimum, and
losing a lexicographic tie-break to a `MOVE`. The metric was measuring agreement
with a sorting rule.

Agreement now means regret zero. The corrected decomposition is the stage's most
useful result:

| | cases | agreement |
| --- | --- | --- |
| horizon-aligned (one-step optimum is the horizon optimum) | 319 | 94.04% |
| horizon-dependent (they differ) | 86 | 0% |

Prime scores an action over one step; the oracle scores it over three under a
declared continuation policy. Where those agree Prime reaches the optimum almost
always; where they disagree it reaches it never, because a one-step objective
structurally cannot. That is an objective mismatch, measured — not a search defect
and not a claim that Prime is wrong. Those 86 cases are the first precisely
characterised target this substrate has produced.

### Soup

Audited at `f07e07ed` (v0.74.0, Apache-2.0) from a clone in an isolated
training-tools location. SFT, preference training, GRPO, PPO, reward models, LoRA,
QLoRA, Qwen recipes, checkpointing and adapter/GGUF export are all present.
Reproducibility control is **partial** — no single global training seed makes a run
bit-reproducible — and that is recorded as a limitation of the training engine.

The bridge is a translation, not a pass-through, and the audit proved it: Forge SFT
rows are `{prompt, completion}`, which matches no Soup format signature at all.
Preference rows are already Soup `dpo` exactly. Every translated row is checked
against Soup's own detection rule, and the untranslated row is checked too as a
control — it must detect as nothing.

No training was run. Soup may reach `TRAINED` and may never reach `CERTIFIED`; no
transition into that state names any actor but Sentinel certification, and the
certify script blocks if that stops being true.

### Still open after Stage 3A

- **No learned candidate exists.** Nothing is claimed about what one would do.
- **The continuation policy is a choice.** Horizon utilities are exact under a
  named policy, not in the abstract.
- **416 of 504 cases have an exact tie at the optimum**, capping SFT yield at 88
  rows. Sharpening the reward vector is scenario-design work.
- **Portability is single-platform.** `DIGEST_PRODUCED_SINGLE_PLATFORM` unchanged.

Full architecture: [`docs/SENTINEL_FORGE_WORLD.md`](SENTINEL_FORGE_WORLD.md).

## Stage 3B — MicroWorld curriculum, reward resolution and large-scale dataset

Stage 3A produced a working substrate with two measured limits: 82.5% of cases
tied at the optimum, and 504 cases rested on 105 topologies. Stage 3B addresses
both. Everything Stage 3A certified — the kernel, FORGE_REWARD_V1, the V1 oracle,
the V1 generators and validators, the adapter, the export layer — is a frozen
owner here; Stage 3B adds superseding modules beside them.

### The taxonomy came before the fix, and changed it

The brief forbids removing ties without classifying them first, and that
prohibition earned its place. Under V1, 416 tied cases classify as:

| class | cases | reward defect? |
| --- | --- | --- |
| `INSUFFICIENT_REWARD_RESOLUTION` | 381 | yes |
| `GENUINE_STRATEGIC_EQUIVALENCE` | 17 | no |
| `HORIZON_ALIASING` | 17 | no |
| `ACCIDENTAL_REWARD_COLLAPSE` | 1 | yes |

**The first classifier was wrong.** It asked "did the immediate rewards differ?"
first and called every such case horizon aliasing — not a defect — which put 397
of 416 ties beyond scrutiny. Checking whether the paths actually *converge* first
showed only 17 of those 397 merge. The other 380 end in materially different
worlds carrying identical accumulated reward. Aliasing means the paths merge; if
they do not, the equality of the totals is the reward's problem.

### FORGE_REWARD_V2 is a missing dimension, not a tiebreaker

V1 is a pure flow reward: it sums what happened along the way and has no term for
the value of the world it left behind. V2 adds two potential terms —
`futureObjectivePotential` and `optionValue` — each a difference Φ(after) −
Φ(before) of a function of world state. Being differences of a potential they
telescope over a complete trajectory, so they cannot reorder complete
trajectories; they separate only truncated horizons, which is exactly what the
oracle scores.

Measured on the identical frozen Stage 3A worlds:

| | V1 | V2 |
| --- | --- | --- |
| tie rate | 0.8254 | 0.4782 |
| reward-defect ties | 382 | 31 |
| genuine equivalence + true aliasing | 34 | 210 |
| unique-optimum rate | 0.1369 | 0.5198 |

Genuine ties were **preserved and grew** — V2 lets the classifier tell a real
equivalence from a reward that could not see a difference. The certification
blocks if genuine equivalence ever falls.

### A latent bug the tests caught

`vectorKey` compared only FORGE_REWARD_V1's component names. Applied to a V2
vector it silently dropped the five components V2 exists for, both potential terms
among them, so every V2 tie looked like a vector match. It happened not to change
the numbers on this corpus — verified, not assumed — but a comparison that only
sees the components it was written against is not a comparison of the vectors it
was handed. Both the tie comparison and the Pareto comparison are now
schema-agnostic.

### Topology by composition

15 procedural shapes × 6 role mixes × 8 objective compositions × 5 horizon bands ×
6 levels. The gate's first run rejected 3,403 cases concentrated in three shapes —
because depth and cut analysis were anchored at the objective node, which is often
attached *below* the structure being sought. Both anchors are now canonical and
label-free. A second defect surfaced immediately: `longestDependencyDepth`
enumerated every simple path and stalled on dense meshes; it is now O(V+E).

### Supervision routed, not forced

Five classes decide which exporter may use a case. Exact equivalences produce an
SFT completion naming **every** equal optimum rather than teaching a lexicographic
tie-break as world truth; Pareto-incomparable pairs never become chosen/rejected,
because preferring one is a statement about weights. Supervision density rises
because cases go where they can be represented truthfully.

### Still open after Stage 3B

- **Residual unresolved ties** remain and are routed to RL, not forced into SFT.
- **Continuation-policy dependence is sampled**, not measured on every case.
- **No model was trained.** Soup was schema-validated and never invoked.
- **Portability is single-platform.** `DIGEST_PRODUCED_SINGLE_PLATFORM` unchanged.

Full architecture: [`docs/SENTINEL_FORGE_WORLD.md`](SENTINEL_FORGE_WORLD.md).
