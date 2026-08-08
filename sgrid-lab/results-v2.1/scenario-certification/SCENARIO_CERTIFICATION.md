# Sentinel Grid — Scenario Certification (Stage 1A)

Environment: reference-colony **v2** (dynamics unchanged; no env v3). Tier: **certification** (30 seeds/scenario, nested smoke⊂dev⊂cert).
RNG: xorshift32 (lab-snapshotable twin; 1000-step sequence-verified against AZL.Util.RNG). Paired behavioral runs start from identical state + identical xorshift32 uint32; later draw counts may diverge and single-trajectory equality is not required — evidence is the paired-seed distribution.
Frozen results-v1-health-proxy/ and results-v2/ untouched. Adapter extended **additively** (legacy adapter has no scenario methods: verified).

## Certification matrix
| Scenario | Representable | Failure witness | Success witness | Witness type | Behavioral witness | Shortcut check | Deterministic | Certified |
|---|---|---|---|---|---|---|---|---|
| Stable Baseline | yes | PASS | PASS | scripted | PASS | PASS | PASS | YES |
| Scarcity | yes | PASS | PASS | scripted | PASS | PASS | PASS | YES |
| Escalating Threat | yes | PASS | PASS | scripted | PASS | PASS | PASS | YES |
| Recovery | yes | PASS | PASS | scripted | PASS | PASS | PASS | YES |
| Infrastructure Dependency | NO | — | — | — | — | — | — | BLOCKED_UNREPRESENTABLE |
| Deadline | yes | PASS | PASS | scripted | PASS | PASS | PASS | YES |

## Per-scenario evidence
### Stable Baseline
- Can it be lost? Yes — SPAM-recruit fails the objective in 27/30 seeds (0 full collapses).
- Can it be won? Yes — GUARDIAN completes 83% (mean tick 1200).
- Intended behavior: gather, defense, recruit, housing (Maintain viability and achieve modest population growth over the full horizon)
- Causal evidence: ablating [gather] drops completion 83% → 0% (mean progress −0.886) across 30 paired seeds from identical state+RNG.
- Witness type: scripted
- Shortcut check: no prohibited-category dominance

### Scarcity
- Can it be lost? Yes — STAB fails the objective in 30/30 seeds (30 full collapses).
- Can it be won? Yes — HARVESTER completes 100% (mean tick 19).
- Intended behavior: gather, trade (Restore food and energy runway to sustainable levels while preserving a viable population)
- Causal evidence: ablating [gather, trade] drops completion 100% → 0% (mean progress −1) across 30 paired seeds from identical state+RNG.
- Witness type: scripted
- Shortcut check: no prohibited-category dominance

### Escalating Threat
- Can it be lost? Yes — C0 fails the objective in 30/30 seeds (0 full collapses).
- Can it be won? Yes — SENTINEL-SCRIPT completes 100% (mean tick 1200).
- Intended behavior: defense, diplomacy, gather (Survive strong escalating pressure to the horizon while preserving population and building real defense)
- Causal evidence: ablating [defense, diplomacy] drops completion 100% → 0% (mean progress −1) across 30 paired seeds from identical state+RNG.
- Witness type: scripted
- Shortcut check: no prohibited-category dominance

### Recovery
- Can it be lost? Yes — STAB fails the objective in 30/30 seeds (30 full collapses).
- Can it be won? Yes — MEDIC completes 100% (mean tick 20).
- Intended behavior: defense, gather, recruit (Recover a damaged, raided colony to population viability, food stability, and safety)
- Causal evidence: ablating [defense, recruit] drops completion 100% → 0% (mean progress −1) across 30 paired seeds from identical state+RNG.
- Witness type: scripted
- Shortcut check: no prohibited-category dominance

### infrastructure-dependency
BLOCKED. no dependency read by simulation dynamics (link/access are written, never read); no breakable route or per-entity failure state; no repair/reroute/replace action; entities() dependency graph is an analytical view constructed for the relational encoder.
Downstream: Nexus cannot receive a meaningful deterministic dependency-scenario evaluation in reference environment v2; Nexus evaluation is deferred to ZekNova binding or a separately authorized env v3

### Deadline
- Can it be lost? Yes — C0 fails the objective in 30/30 seeds (0 full collapses).
- Can it be won? Yes — FOREMAN completes 100% (mean tick 18).
- Intended behavior: defense, housing, gather (Construct required defensive and housing capability before a fixed deadline)
- Causal evidence: ablating [defense, housing] drops completion 100% → 0% (mean progress −1) across 30 paired seeds from identical state+RNG.
- Witness type: scripted
- Shortcut check: no prohibited-category dominance

## Preregistered behavioral thresholds (revisionVersion 0 — never revised)
full ≥ 0.8 · ablated ≤ 0.2 OR progress Δ ≥ 0.25 · paired seeds ≥ 30. Shortcut default share ≤ 0.50 (escalating-threat ghost-colony detector: complete-with-pop<6 rejected).

## Negative fixtures (framework must reject)
{"impossible":"UNSOLVABLE","trivial":"TRIVIAL_AT_INITIALIZATION","shortcut":"SHORTCUT_DEPENDENT","nondet":"NONDETERMINISTIC","instrumentError":"INSTRUMENT_ERROR","survivalNotEnough":"SURVIVED_BUT_NOT_COMPLETE(correctly not certified)"}
Schema-level rejections (unit): model-dependent witness without caveat; prohibited shortcut without detector — both verified in scenario-conformance.

## Scenario conformance
{"xrngSequenceIdentity":"pass","rngSnapshotRestore":"pass","legacyAdapterUntouched":"pass","objectiveProgressDeterministic":"pass","modelDependentCaveatRequired":"pass","shortcutDetectorRequired":"pass","witnessDeterminism":"pass","pairedStartAlignment":"pass"}

## Objective-progress interface
{progress∈[0,1], complete, failed, reason, metrics, version} — pure function of (state, scenario); completion after a deadline never counts; survival is never sufficient for completion.

## Known limitations
- Recovery "maintain for interval" was dropped to keep objective progress a pure state function; noted for Stage 1B.
- infrastructure-dependency: BLOCKED_UNREPRESENTABLE (see blocked/). Nexus evaluation deferred to ZekNova binding or separately authorized env v3.
- Failure-witness choice is per-scenario (heuristic where it genuinely fails; STAB/SPAM where the heuristic would pass) — each is declared in the scenario definition.

## Reproduction
node lab3.js preflight && node lab3.js scenario-conformance && node lab3.js certify && node lab3.js negative && node lab3.js scenario-report

## Manifest
{
 "environment_id": "reference-colony",
 "environment_version": 2,
 "adapter_extension": "additive-v1",
 "scenario_schema_version": "1",
 "scenario_versions": {
  "stable-baseline": "1",
  "scarcity": "1",
  "escalating-threat": "1",
  "recovery": "2",
  "infrastructure-dependency": "1",
  "deadline": "1"
 },
 "objective_progress_version": "1",
 "witness_controller_versions": {
  "GUARDIAN": "2",
  "HARVESTER": "1",
  "SENTINEL-SCRIPT": "1",
  "MEDIC": "3",
  "FOREMAN": "1",
  "C0": "env",
  "RANDOM": "1",
  "STAB": "1",
  "SPAM-recruit": "1",
  "FX-EXPLORER": "1",
  "FX-NONDET": "1",
  "FX-THROW": "1"
 },
 "behavioral_threshold": {
  "fullWitnessMinimumCompletionRate": 0.8,
  "ablatedMaximumCompletionRate": 0.2,
  "minimumProgressDifference": 0.25,
  "minimumPairedSeeds": 30,
  "revisionVersion": 0
 },
 "seed_bank": "per-scenario base + i*9973 (nested smoke⊂dev⊂cert)",
 "rng": "xorshift32 (lab-snapshotable twin; 1000-step sequence-verified against AZL.Util.RNG)",
 "action_space_version": 1,
 "state_schema_version": 1,
 "moduleHashes": {
  "azl-config.js": "bb6dd3c7c4741c3b",
  "azl-util.js": "44a2dc74ef301dde",
  "azl-state.js": "66a48d1efd64c310",
  "azl-nn.js": "37b26f47939698f2",
  "azl-scout.js": "ae2771a6aef44da8",
  "azl-strategist.js": "e6305a4cb78b8b55",
  "azl-oracle.js": "9304ac433301d6d5",
  "azl-relational.js": "cfea5f27c7bec599",
  "azl-mcts.js": "95a6bbb84ba89cf4",
  "azl-router.js": "f614b061c00917d1",
  "azl-weights.js": "1ce04a68d7e76a5f",
  "azl-federated.js": "961ee99d95725aa8",
  "azl-eval.js": "460d590c2b473a75",
  "azl-ref-adapter-v2.js": "0c8968eae1db78cf"
 },
 "timestamp": "2026-07-21T21:58:00.572Z"
}
