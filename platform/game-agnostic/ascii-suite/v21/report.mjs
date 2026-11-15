// Presentation and frozen statistical analysis only; never changes controllers, selection rules or evidence.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { PLAN } from './plan.mjs';
import { mean } from './harness.mjs';
import { paired, wilson } from './statistics.mjs';
import { sourceManifest, verifyBaseline } from './freeze.mjs';
const registration = JSON.parse(readFileSync(new URL('./registration.json', import.meta.url)));
if (sourceManifest().sourceHash !== registration.source.sourceHash) throw Error('FROZEN_SOURCE_CHANGED');
const data = JSON.parse(readFileSync(new URL('./results/heldout-summary.json', import.meta.url))), rows = data.episodes;
const select = (cohort, game, condition, variant) => rows.filter(e => e.cohorts.includes(cohort) && (!game || e.game === game) && (!condition || e.condition === condition) && (!variant || e.variant === variant));
const value = (e, path) => path.split('.').reduce((o, k) => o?.[k], e);
const avg = (list, path) => mean(list.map(e => value(e, path)).filter(Number.isFinite));
const fmt = n => typeof n === 'number' ? n.toFixed(4) : n === null || n === undefined ? 'NOT_MEASURED' : String(n);
const CI = x => `${fmt(x.mean)} [${fmt(x.lo)}, ${fmt(x.hi)}], seed n=${x.n}, CI=${x.level ?? 'N/A'}`;
const summary = list => ({ episodes: list.length, seedUnits: new Set(list.map(e => e.seed)).size, success: avg(list, 'success'), reward: avg(list, 'totalReward'), placement: avg(list, 'metrics.placement'),
  repeatedFailure: avg(list, 'metrics.repeatedFailureRate'), catastrophic: avg(list, 'catastrophic'), latencyMeanMs: avg(list, 'compute.meanMs'), meanEpisodeP50Ms: avg(list, 'compute.p50Ms'), meanEpisodeP95Ms: avg(list, 'compute.p95Ms'), meanEpisodeP99Ms: avg(list, 'compute.p99Ms'),
  branchesMean: avg(list, 'compute.branchesMean'), branchesMax: Math.max(0, ...list.map(e => e.compute.branchesMax)), rolloutCountMean: avg(list, 'compute.instrumentedPlannerSimulationRollouts'), estimatorMeanMs: avg(list, 'compute.estimatorMeanMs'), wallMeanMs: avg(list, 'compute.wallMs'),
  loopMeanMs: avg(list, 'compute.controlLoopMeanMs'), heapNetChangeMeanBytes: avg(list, 'compute.heapDeltaBytes'), estimatorAbsError: avg(list, 'estimationAbsError'), returnRate: avg(list, 'metrics.returnRate'),
  marginalSuccessWilson95: wilson(list.filter(e => e.success === 1).length, list.filter(e => e.success !== null).length), censored: list.filter(e => e.result === 'CENSORED_BY_EVALUATION_BUDGET').length });
const primary = {}, normal = {}, hypotheses = [];
const pongNormalBands = Object.fromEntries([1, 2, 3, 4].map(band => [band, paired(select('PONG_NORMAL_BANDS', 'pong').filter(e => e.difficulty === band), e => e.metrics.returnRate)]));
for (const game of PLAN.main.games) {
  const delayed = select('MAIN', game, 'DELAY3'), standard = select('MAIN', game, 'NORMAL');
  const metric = game === 'pong' ? e => e.metrics.returnRate : game === 'racing' ? e => -e.metrics.placement : e => e.success;
  primary[game] = paired(delayed, metric, 'V2', 'V3', .9875);
  normal[game] = paired(standard, game === 'pong' ? e => e.metrics.returnRate : game === 'racing' ? e => -e.metrics.placement : e => e.success);
  const threshold = { platformer: .2, pong: .1, fighter: .15, racing: .3 }[game];
  const repeated = paired(delayed, e => e.metrics.repeatedFailureRate), catastrophic = paired(delayed, e => e.catastrophic);
  const normalBound = game === 'pong' ? -.02 : game === 'racing' ? -.3 : -.1;
  const replicated = primary[game].lo > 0 && primary[game].byFamily.A.mean >= threshold && primary[game].byFamily.B.mean >= threshold;
  const safe = catastrophic.mean <= .05 && (repeated.mean === null || repeated.mean <= .05);
  const noninferior = normal[game].lo > normalBound && (game !== 'pong' || Object.values(pongNormalBands).every(x => x.lo > -.02));
  hypotheses.push({ id: 'H-TEMPORAL-' + game.toUpperCase(), outcome: replicated && safe && noninferior ? 'SUPPORTED_DIAGNOSTIC_POPULATION_ONLY' : 'NOT_FULLY_SUPPORTED', replicated, safe, normalNoninferiority: noninferior, gain: primary[game], catastrophic, repeatedFailure: repeated,
    caution: 'Safety check is a small-sample observed change, not a safety certificate; zero-failure bootstrap may degenerate.' });
}
const ablations = [];
for (const game of PLAN.main.games) {
  const group = select('ABLATION', game);
  for (const without of PLAN.ablations.variants[game].filter(v => v !== 'V3')) ablations.push({ game, without,
    deltaSuccess: paired(group, e => e.success, without), deltaReturn: paired(group, e => e.totalReward, without), deltaLatencyMs: paired(group, e => e.compute.meanMs, without),
    deltaCatastrophic: paired(group, e => e.catastrophic, without), deltaPlacementBenefit: game === 'racing' ? paired(group, e => -e.metrics.placement, without) : null });
}
const shotGroup = select('ABLATION', 'pong'), shotScore = paired(shotGroup, e => e.metrics.scoreDifference, 'V3', 'SHOT_PLANNER'), shotReturns = paired(shotGroup, e => e.metrics.returnRate, 'V3', 'SHOT_PLANNER');
const shotPromotion = shotScore.byFamily.A.mean >= .5 && shotScore.byFamily.B.mean >= .5 && shotScore.lo > 0 && shotReturns.lo > -.02;
const raceRule = paired(select('ROTATED_GRID', 'racing', 'NORMAL'), e => -e.metrics.placement, 'RULE', 'V3');
const raceRuleReplicated = raceRule.byFamily.A.mean >= .3 && raceRule.byFamily.B.mean >= .3 && raceRule.lo > 0;
const cornerMemory = paired(select('BOUNDED_SHIFT', 'racing'), e => -e.metrics.placement, 'NO_MEMORY', 'V3');
const cornerMaterial = cornerMemory.mean >= .3 && cornerMemory.lo > 0 && cornerMemory.byFamily.A.mean > 0 && cornerMemory.byFamily.B.mean > 0;
const mainGroups = Object.fromEntries(PLAN.main.games.map(game => [game, Object.fromEntries([...PLAN.main.conditions, ...PLAN.main.stressConditions].map(c => [c, Object.fromEntries(['V2', 'V3', 'RULE'].map(v => [v, summary([...select('MAIN', game, c, v), ...select('STRESS', game, c, v)])]))]))]));
const fighter = Object.fromEntries(PLAN.fighter.adversaries.map(style => [style, Object.fromEntries(PLAN.fighter.latencies.map(l => [l, Object.fromEntries(PLAN.fighter.variants.map(v => [v, summary(select('STRONG_FIGHTER', 'fighter', 'LATENCY_' + l, v).filter(e => e.adversary === style))]))]))]));
const grid = Object.fromEntries(PLAN.racing.rotatedSlots.map(slot => [slot + 1, Object.fromEntries(PLAN.racing.conditions.map(c => [c, Object.fromEntries(PLAN.racing.variants.map(v => [v, summary(select('ROTATED_GRID', 'racing', c, v).filter(e => e.slot === slot))]))]))]));
const machine = { schema: 'ASCII_WORLDS_2_1_PERFORMANCE_RESULT_V1', status: 'DIAGNOSTIC_EVALUATION_COMPLETE_NO_CERTIFICATION_OR_PROMOTION', authority: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false,
  registrationHash: registration.preregistrationHash, sourceHash: registration.source.sourceHash, frozen: verifyBaseline(), episodes: rows.length, exactReplayEpisodes: rows.filter(e => e.exactReplay).length,
  primary, normal, pongNormalBands, hypotheses, groups: mainGroups, fighter, grid, raceRule, raceRuleReplicated, cornerMemory, cornerMaterial, shotScore, shotReturns, shotSelectionPromotion: shotPromotion, ablations,
  NOT_TESTABLE: ['true counterfactual regret', 'scientific DDV/FPE/CAD/CR/TCA', 'total memory allocation', 'structural OOD', 'canonical expert intelligence', 'grappling without existing mechanic'],
  untouchedReserve: PLAN.untouchedFutureReserve, adaptation: 'bounded deterministic replanning + timestamp estimation; observed residual/opponent updates and ephemeral explicit memory only; no learned policy',
};
writeFileSync(new URL('./results/performance-result.json', import.meta.url), JSON.stringify(machine, null, 2) + '\n');
const statRows = [];
for (const game of PLAN.main.games) for (const c of [...PLAN.main.conditions, ...PLAN.main.stressConditions]) for (const v of ['V2', 'V3', 'RULE']) {
  const s = mainGroups[game][c][v]; if (!s.episodes) continue;
  statRows.push(`| ${game} | ${c} | ${v} | ${s.episodes} | ${fmt(s.success)} | ${fmt(s.reward)} | ${fmt(s.placement)} | ${fmt(s.returnRate)} | ${fmt(s.repeatedFailure)} | ${s.censored} |`);
}
const computeRows = PLAN.main.games.flatMap(game => ['V2', 'V3', 'RULE'].map(v => {
  const s = summary(select('MAIN', game, null, v));
  return `| ${game} | ${v} | ${fmt(s.latencyMeanMs)} | ${fmt(s.meanEpisodeP50Ms)} | ${fmt(s.meanEpisodeP95Ms)} | ${fmt(s.meanEpisodeP99Ms)} | ${fmt(s.branchesMean)} / ${s.branchesMax} | ${fmt(s.rolloutCountMean)} | ${fmt(s.estimatorMeanMs)} | ${fmt(s.loopMeanMs)} | ${fmt(s.wallMeanMs)} | ${fmt(s.heapNetChangeMeanBytes)} |`;
}));
const fighterRows = PLAN.fighter.adversaries.flatMap(style => PLAN.fighter.latencies.map(l => `| ${style} | ${l} | ${fmt(fighter[style][l].RULE.success)} | ${fmt(fighter[style][l].V2.success)} | ${fmt(fighter[style][l].V3.success)} | ${fmt(avg(select('STRONG_FIGHTER', 'fighter', 'LATENCY_' + l, 'V3').filter(e => e.adversary === style), 'metrics.damageEfficiency'))} |`));
const latencySummary = Object.fromEntries(PLAN.fighter.latencies.map(l => [l, Object.fromEntries(PLAN.fighter.variants.map(v => [v, summary(select('STRONG_FIGHTER', 'fighter', 'LATENCY_' + l, v))]))]));
const temporalSupport = hypotheses.filter(h => h.outcome.startsWith('SUPPORTED')).map(h => h.id);
const required = `=== SENTINEL GRID ASCII WORLDS 2.1 PERFORMANCE RESULT ===
STATUS=${machine.status}

### INHERITANCE
STAGE3F_FREEZE=${machine.frozen.stage3f}
STAGE3G_FREEZE=${machine.frozen.stage3g}
FROZEN_PATHS_UNCHANGED=true
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
ONLINE_LEARNING_ENABLED=false
PROMOTED_TO_LIVE_RUNTIME=false

### TEMPORAL OBSERVATION
OBSERVATION_CONTRACT=SENTINEL_TEMPORAL_OBSERVATION_V1
STALE_FRAME_HANDLING=DEDUPLICATED; OUT_OF_ORDER_AND_CONFLICTS_REJECTED; MISSING_AND_PARTIAL_EXPLICIT
AGE_AWARE_ESTIMATION=BOUNDED_PUBLISHED_SEMANTICS_PROVISIONAL_NOT_AUTHORITATIVE
UNCERTAINTY_TRACKING=EXPLICIT_MODEL_ASSUMPTION_INTERVALS; NOT_ALL_INTERVALS_EMPIRICALLY_CALIBRATED
PRIVILEGE_LEAKAGE=NO_SIMULATOR_STATE_OR_PRIVATE_SEEDS_IN_CONTROLLER_INPUTS; EVALUATOR_TRUTH_ONLY

### PLATFORMER
NORMAL_COMPLETION_V2=${fmt(mainGroups.platformer.NORMAL.V2.success)}
NORMAL_COMPLETION_V3=${fmt(mainGroups.platformer.NORMAL.V3.success)}
DELAYED_COMPLETION_V2=${fmt(mainGroups.platformer.DELAY3.V2.success)}
DELAYED_COMPLETION_V3=${fmt(mainGroups.platformer.DELAY3.V3.success)}
FAILURE_MEMORY_VALUE=${CI(ablations.find(a => a.game === 'platformer' && a.without === 'NO_MEMORY').deltaSuccess)}; DELAY3_ABLATION_ONLY
REMAINING_FAILURES=SEE_EPISODE_FAILURE_TRACES; JITTER_MISSING_PARTIAL_AND_UNKNOWN_DYNAMICS_REPORTED_SEPARATELY

### PONG
FILTER_ONLY_BASELINE=V2_FROZEN; NORMAL_RETURN=${fmt(mainGroups.pong.NORMAL.V2.returnRate)}
TEMPORAL_FILTER_RESULT=NORMAL_RETURN=${fmt(mainGroups.pong.NORMAL.V3.returnRate)}; DELAY_RETURN=${fmt(mainGroups.pong.DELAY3.V3.returnRate)}
SHOT_SELECTION_VALUE=${CI(shotScore)}; SHOT_SELECTION_PROMOTION=${shotPromotion}
CALIBRATION=ACTUAL_GOAL_CROSSING_COVERAGE_REPORTED; NOT_ACTION_CORRECTNESS_CONFIDENCE
DELAY_ROBUSTNESS=${CI(primary.pong)}

### FIGHTER
EXISTING_WIN_RATE=${fmt(mainGroups.fighter.NORMAL.V2.success)}; V2_OPPONENTS_D5_FRESH_SEEDS
STRONG_OPPONENT_WIN_RATE=${JSON.stringify(Object.fromEntries(PLAN.fighter.adversaries.map(s => [s, fighter[s][0].V3.success])))}
EQUAL_LATENCY_WIN_RATE=${JSON.stringify(Object.fromEntries(Object.entries(latencySummary).map(([l, v]) => [l, { RULE: v.RULE.success, V2: v.V2.success, V3: v.V3.success }])))}
OPPONENT_ADAPTATION=OBSERVED_HABIT_RESPONSE_LOGGED; NO_WEIGHT_UPDATES; PERFORMANCE_VALUE_NOT_ASSUMED
FALSE_ADVANTAGE_AUDIT=SAME_SENSOR_SCHEDULE_AND_SIMULTANEOUS_PHYSICS; SEE_STYLE_LATENCY_TABLE; REGRET_NOT_TESTABLE

### RACING
RULE_BASELINE=${fmt(mainGroups.racing.NORMAL.RULE.placement)}
SENTINEL_V2=${fmt(mainGroups.racing.NORMAL.V2.placement)}
SENTINEL_V3=${fmt(mainGroups.racing.NORMAL.V3.placement)}
PLACEMENT_ADVANTAGE=ROTATED_GRID_V3_VS_RULE=${CI(raceRule)}; REPLICATED_MPC_ADVANTAGE=${raceRuleReplicated}
GRID_POSITION_CONTROL=ALL_FOUR_ROTATED_SLOTS_PAIRED; CLUSTERED_BY_SEED; ABSOLUTE_AND_RELATIVE_START_REPORTED
CORNER_MEMORY_VALUE=${CI(cornerMemory)}; CORNER_MEMORY_VALUE_MATERIAL=${cornerMaterial}
DELAY_ROBUSTNESS=PLACEMENT_GAIN_V3_VS_V2=${CI(primary.racing)}

### COMPUTE
MEAN_LATENCY=MEASURED_PER_EPISODE; SEE_COMPUTE_TABLE
P95_LATENCY=MEAN_EPISODE_P95; NOT_POOLED_QUANTILE; SEE_COMPUTE_TABLE
SEARCH_BUDGET=${JSON.stringify(PLAN.budgets)}
VALUE_PER_COMPUTE=WITHIN_WORLD_EPISODE_RETURN_PER_DECISION_MS_AND_SUCCESS_REPORTED; NOT_SCIENTIFIC_DDV

### ABLATIONS
PER_COMPONENT_RESULTS=PAIRED_WITH_MINUS_WITHOUT_SUCCESS_RETURN_LATENCY_CATASTROPHE; SEE_FULL_TABLE_AND_JSON

### SCIENTIFIC RESULTS
SUPPORTED_HYPOTHESES=${temporalSupport.join('; ') || 'NONE_AT_FROZEN_CRITERIA'}
UNSUPPORTED_HYPOTHESES=${hypotheses.filter(h => h.outcome === 'NOT_FULLY_SUPPORTED').map(h => h.id).join('; ') || 'NONE_PRIMARY'}; ${shotPromotion ? '' : 'SHOT_SELECTION_MATERIALITY_NOT_ESTABLISHED; '}${raceRuleReplicated ? '' : 'MPC_RULE_ADVANTAGE_NOT_ESTABLISHED; '}${cornerMaterial ? '' : 'CORNER_MEMORY_MATERIALITY_NOT_ESTABLISHED'}
NOT_TESTABLE=${machine.NOT_TESTABLE.join('; ')}
REPRESENTATION_BOTTLENECK=MISSING_OBSERVATION_AGE_CORRECTED_IN_TASK_INTERFACE; CANONICAL_EXPERT_BINDINGS_UNCHANGED
TEMPORAL_BOTTLENECK=PRIMARY_PAIRED_OUTCOME_TESTS_RECORDED; ESTIMATION_ALONE_NOT_COMPETENCE
POLICY_BOTTLENECK=STRATEGIC_SHOTS_AND_RACECRAFT_REQUIRE_EPISODE_GAIN_NOT_RATIONALE
OPPONENT_BOTTLENECK=STRONG_EQUAL_LATENCY_POLICIES_REQUALIFY_FIGHTER; NO_HUMAN_COMPETENCE_CLAIM

### ROADMAP
STAGE3H_COMPETENCE_CERTIFIED=false
WORLD_MODEL_WORK_NOW_JUSTIFIED=false
ROUTER_2_0_NOW_JUSTIFIED=false
EXPERT_10_NOW_JUSTIFIED=false

### CERTIFICATION STATUS
GAMEPLAY_TESTS=44_INHERITED_PLUS_17_TEMPORAL_HTTP_TESTS_PASS
DETERMINISTIC_REPLAY=${machine.exactReplayEpisodes}/${machine.episodes}_EXACT_EPISODE_TRANSITION_REPLAYS
PREREGISTRATION_HASH=${registration.preregistrationHash}
SOURCE_HASH=${registration.source.sourceHash}
HELDOUT_STATUS=FRESH_A_B_FAMILIES_COMPLETE_DIAGNOSTIC; RESERVED_141001_141032_UNTOUCHED; NO_TUNING_AFTER_OUTCOMES
STAGE3G_FREEZE_CHECK=EXACT_CANONICAL_CERTIFICATE_REPRODUCTION_PASS
`;
const ablationRows = ablations.map(a => `| ${a.game} | ${a.without} | ${CI(a.deltaSuccess)} | ${CI(a.deltaReturn)} | ${CI(a.deltaLatencyMs)} | ${CI(a.deltaCatastrophic)} |`);
const gridRows = PLAN.racing.rotatedSlots.flatMap(slot => PLAN.racing.conditions.flatMap(c => PLAN.racing.variants.map(v => {
  const group = select('ROTATED_GRID', 'racing', c, v).filter(e => e.slot === slot), s = grid[slot + 1][c][v];
  return `| ${slot + 1} | ${c} | ${v} | ${fmt(s.placement)} | ${fmt(avg(group, 'metrics.startPlace') - s.placement)} | ${fmt(avg(group, 'metrics.meanLapTicks'))} | ${fmt(avg(group, 'metrics.carContacts'))} | ${fmt(avg(group, 'metrics.offTrackTicks'))} | ${fmt(avg(group, 'metrics.overtakes'))} |`;
})));
const shifts = [];
for (const game of Object.keys(PLAN.scenarios.cases)) for (const scenario of PLAN.scenarios.cases[game]) for (const condition of PLAN.scenarios.conditions) for (const variant of PLAN.scenarios.variants) {
  const g = select('BOUNDED_SHIFT', game, condition, variant).filter(e => e.scenario === scenario), s = summary(g);
  shifts.push(`| ${game} | ${scenario} | ${condition} | ${variant} | ${s.episodes} | ${fmt(s.success)} | ${fmt(s.placement)} | ${fmt(s.reward)} |`);
}
const exact = `${machine.exactReplayEpisodes}/${machine.episodes}`;
const document = `# ASCII Worlds 2.1 — temporal robustness diagnostic

The v2 worlds/controllers/reports, Stage 3F/3G artifacts and prior Stage 3H frozen/draft conclusions are unchanged. New code is isolated in ascii-suite/v21. No new roadmap stage, learned world model, nine-expert competence claim, live authority or model promotion.

## Required output

\`\`\`text
${required}\`\`\`

## Reproduction and preregistration

Phase 0 reproduced 135 selected v2 episodes exactly, including inspected 81001-series normal and stale failures. Those seeds are not new confirmation. The complete v2 reports, registration, machine results and stored replay verification were read; fresh forensic action/observation traces are retained. 44 inherited gameplay tests and six Stage 3G boundary tests passed; Stage 3G's canonical certificate reproduced exactly. The previously pending Stage 3F read-only reproduction passed with 20 tests and zero tracked write attempts. Prior Stage 3H results were not revised.

Development failures in dev1/dev2 are retained, including software errors and partial results. dev3 (four-seed pilot), dev4 (eight-seed comparison) and dev5 (final eight-seed comparison including wider unknown-wind bounds and partial-field provenance repair) are diagnostic tuning records. None is held-out confirmation. The registered source/plan/seeds/thresholds were frozen before A/B access. Main comparisons use 32 seed units, two families of 16; strong opponents, grids, ablations and bounded shifts use 16 independent seed units, explicitly exploratory. Initial fighter spacing/side varies by seed so mirror rounds are not fake independent copies of one deterministic fixture.

One initial held-out attempt was stopped after a source audit found asymmetric actuator feedback: the player estimator received the applied action but the opponent received the requested action even when it fell back to WAIT. Its source, registration and completed partial traces are retained in results/aborted-heldout-v1. Its outcomes were not inspected for tuning and no performance hypothesis was scored from it. Both initial families (121001/131001 series) were retired wholesale. The corrected software interface sends actual applied actions to both estimators; this replacement registration uses entirely fresh 151001/161001 families with unchanged acceptance/statistical criteria. This is an integrity repair, not a post-hoc performance threshold change.

All ${exact} evaluated episodes replay exactly at every transition. Replay alone verifies deterministic world execution, not controller competence or a new scientific certificate. Raw packets, estimates, legal requests, actions and outcomes are compressed JSON forensic traces. Four reserved future seed values from Stage 3H and the new 32-seed 141001-series reserve remain untouched by this program.

## Paired primary outcomes

98.75% paired seed-cluster percentile bootstrap intervals control four primary tests by Bonferroni. Individual family means must meet materiality. A zero-variance bootstrap is disclosed; marginal Wilson success intervals are in the JSON and do not establish universal certainty. Normal noninferiority and observed catastrophic/repeated-failure limits are separate gates. Safety rates and secondary tests are exploratory, not a general safety guarantee.

| World | Delay3 gain (positive better) | Normal difference, 95% CI | Frozen acceptance |
|---|---|---|---|
${PLAN.main.games.map(g => `| ${g} | ${CI(primary[g])} | ${CI(normal[g])} | ${hypotheses.find(h => h.id.endsWith(g.toUpperCase())).outcome} |`).join('\n')}

## Outcomes by observation condition

| World | Condition | Variant | Episodes | Success | Episode shaped return | Place | Return rate | Repeated failure | Censored |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
${statRows.join('\n')}

Pong normal-band paired return-rate differences (V3 minus filter-only V2), all included in the noninferiority gate:

${Object.entries(pongNormalBands).map(([b, x]) => 'Band ' + b + ': ' + CI(x)).join('\n\n')}

Reward/success/trajectory/estimate accuracy are kept separate. REGRET_ONE_STEP_PROXY is explicitly not true counterfactual regret; no new proxy is optimized. True opponent-adjusted regret and inherited FPE/CAD/CR/DDV/TCA remain NOT_TESTABLE without an eligible target. Fighter damage efficiency, contacts, attack mix, whiffs, spacing-derived actions, landing/anti-air/cross-up events and response to repeated tactics are in per-episode metrics/frames; those are tactical diagnostics, not counterfactual competence.

## Equal-information fighter requalification

Both sides receive the same whole-body observation delay schedule, public move information and simultaneous unchanged fightTick mechanics. They do not see each other's policy labels, seeds, reaction buffers or future decisions. Opponent policy styles use the same bounded planner plus explicitly logged, observation-only overrides. Existing grappling does not exist, so that label is NOT_APPLICABLE. No new mechanics were invented.

| Adversary | Equal latency | Rule win | V2 win | V3 win | V3 damage efficiency |
|---|---:|---:|---:|---:|---:|
${fighterRows.join('\n')}

A perfect win rate against the legacy opponent is not the target. Different style/latency cells must remain visible; averaging easy encounters does not make the mirror/anti-air cases easy. Repeated jump-over choices and anti-air/deny-cross-up responses are logged. A response log is not by itself proof of adaptation value; opponent-model-off ablations test episode effects.

## Racing start-slot control

Road width stays 18 columns and all rivals use the original carStep. Every seed is paired across four starting slots; intervals cluster by seed. Start-place minus finish-place is positive when positions were gained. Passing success is measured as logged overtakes/contacts and final relative position, not an invented pass-attempt rate. Lap times, corner efficiency/grip utilization, slides and steering reversals remain in the episode JSON. Scenario grip changes are seeded evaluator fixtures, not changes made to help a candidate or forced off-track events.

| Start place | Condition | Variant | Finish place | Positions gained | Mean lap ticks | Contacts | Off-track ticks | Overtakes |
|---:|---|---|---:|---:|---:|---:|---:|---:|
${gridRows.join('\n')}

Rotated-grid V3 over rule placement benefit: ${CI(raceRule)}. Replicated material MPC advantage: ${raceRuleReplicated}. Across declared grip shifts, corner-memory placement benefit: ${CI(cornerMemory)}; material: ${cornerMaterial}. If false, the evidence does not justify retaining corner memory for performance; it remains an experimental ablation switch, not a promoted default advantage.

## Component attribution

WITH is V3; WITHOUT is the named row. Intervals use seed-level paired differences. More return does not establish more success, and a lower latency cannot excuse a higher catastrophic rate. Primitive age-only/uncertainty/action-history variants are included separately. Failure memory is applicable to platformer, corner memory to racing, opponent model to fighter, strategic shot selection to Pong, and racecraft selection to racing. Unimplemented/unapplicable mechanisms are not fabricated into ablations.

| World | WITHOUT component/variant | Delta success | Delta return | Delta mean latency ms | Delta catastrophic failure |
|---|---|---|---|---|---|
${ablationRows.join('\n')}

Shot planner versus temporal filter-only score difference: ${CI(shotScore)}; return-rate difference: ${CI(shotReturns)}. SHOT_SELECTION_PROMOTION=${shotPromotion}. Even a positive exploratory result would not promote a model to live runtime; the default filter-only source was frozen before these results.

## Compute audit

Table percentiles are means of episode percentiles, not pooled quantiles. Each episode stores p50/p95/p99, maximum latency, mean/max branches, V3 instrumented planner rollouts/steps, estimator time, control-loop time and wall runtime. V2 simulation counts remain published-budget bounds, not falsely instrumented counts. Racing's HUD projection is counted (20 ticks upper bound, may stop early); estimator branch computations are not part of planner counts. Heap change can be negative after GC and is not total allocation. JIT, tracing, serialization, replay and other local activity affect wall time; no production reaction-time certificate or causal speedup claim.

| World | Variant | Mean ms | Mean episode p50 | Mean episode p95 | Mean episode p99 | Mean/max branches | Mean instrumented rollouts | Estimator ms | Loop ms | Episode wall ms | Net heap bytes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${computeRows.join('\n')}

EPISODE_DECISION_VALUE here means declared within-world diagnostic episode return, not inherited scientific DDV. Per-decision-compute value and per-mean-latency value are descriptive ratios, not cross-world quantities:

${PLAN.main.games.map(g => { const v = select('MAIN', g, 'DELAY3', 'V3'), b = select('MAIN', g, 'DELAY3', 'V2'); return `${g}: V3 return/total decision ms=${fmt(avg(v, 'totalReward') / avg(v, 'compute.totalDecisionMs'))}, V2=${fmt(avg(b, 'totalReward') / avg(b, 'compute.totalDecisionMs'))}; V3 return/mean latency=${fmt(avg(v, 'totalReward') / avg(v, 'compute.meanMs'))}, V2=${fmt(avg(b, 'totalReward') / avg(b, 'compute.meanMs'))}.`; }).join('\n\n')}

## Bounded shifts, not structural OOD

Fresh seeds exercise unseen layouts/tracks from the same generator. Declared wind/patrol/grip variants are controlled parameter/behavior shifts. They are separate from main fresh-seed replication. Structural OOD and learned-policy adaptation were not run and are not claimed.

| World | Scenario | Condition | Variant | Episodes | Success | Place | Return |
|---|---|---|---|---:|---:|---:|---:|
${shifts.join('\n')}

## Ten closing answers

1. Delayed reliability: ${temporalSupport.length ? 'paired temporal gains were supported in ' + temporalSupport.join(', ') : 'no world met all frozen gates'}. This is bounded diagnostic reliability, not general intelligence.
2. Largest real improvement: compare the within-world success/return/place changes above; no cross-world pooled reward ranking is scientifically valid. Platformer completion changes directly test action timing rather than a one-step score.
3. Capability: timestamp-aware estimation plus action-history compensation improved the task control interface. Bounded replanning already existed. Ablations identify whether robust planning or memory added extra value. No learned policy was trained.
4. Pong shots: promotion criterion ${shotPromotion ? 'met in the exploratory registered subset; default remains filter-only, no live promotion' : 'not met; shot selection stays disabled'}.
5. Strong equally informed fighter opponents: see each style/latency win rate and damage efficiency. A legacy 100% rate does not establish this result and no human-level adversarial claim follows.
6. Racing beats rule baseline: replicated material rotated-grid criterion ${raceRuleReplicated ? 'met for this registered subset only' : 'not met; no material MPC placement claim'}.
7. Memory value: platformer failure-memory success delta is ${CI(ablations.find(a => a.game === 'platformer' && a.without === 'NO_MEMORY').deltaSuccess)}; racing corner memory material=${cornerMaterial}. Explicit carried memory is not online learning.
8. Complexity without value: use component rows with zero/negative success/return benefit despite higher latency; do not attribute a monolithic Sentinel gain or retain unproven shot/corner features for their rationale.
9. Learned world model justified: no. Deterministic published-semantics estimation addressed timing without learning and does not establish world-model readiness.
10. Future Stage 3H inputs: timestamp/provenance contracts, retained temporal failure traces, equal-latency adversaries and rotated-grid diagnostics may inform later binding qualification. No Stage 3H draft or frozen scientific conclusion was edited and no next roadmap stage was begun.
`;
writeFileSync(new URL('./RESULTS.md', import.meta.url), document);
writeFileSync(new URL('./results/required-output.txt', import.meta.url), required);
console.log(required);
