/* w0s-search-semantics.test.js — Track R / W0-S conformance (reference-colony v2)
   House style: plain node, no dependencies, prints a checks object, exits non-zero.
   Usage: node tests/w0s-search-semantics.test.js   (run from sgrid-lab/)

   Writes nothing outside os.tmpdir(). Frozen evidence is fingerprinted before and after. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ENG = path.join(__dirname, '..', '..', 'public_html', 'azl');
const MODULES = ['azl-config.js', 'azl-util.js', 'azl-state.js', 'azl-nn.js', 'azl-scout.js',
  'azl-strategist.js', 'azl-oracle.js', 'azl-relational.js', 'azl-mcts.js', 'azl-router.js',
  'azl-weights.js', 'azl-federated.js', 'azl-eval.js', 'azl-ref-adapter-v2.js'];
MODULES.forEach(f => require(path.join(ENG, f)));

const AZL = globalThis.AZL;
const v2 = AZL.ReferenceAdapter;
const v2SnapshotBefore = {
  id: v2.id, version: v2.version, actionCount: v2.actions.length,
  hasV3Keys: ['createSearchContext', 'stepQuantum', 'evaluateNode'].some(k => k in v2)
};
require(path.join(ENG, 'azl-ref-adapter-v3.js'));
const v3 = AZL.ReferenceAdapterV3;

const CJ = require('../governance/canonical-json');
const G = require('../governance/verify-governance');
const ROOT = G.defaultRoot();
const FROZEN = path.join(ROOT, 'sgrid-lab/results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN, 'w0s-search-semantics.test.js');

const results = {};
let failures = 0;
function check(name, actual, expected) {
  const pass = actual === expected;
  results[name] = pass ? 'pass' : `FAIL(expected ${expected}, got ${actual})`;
  if (!pass) failures++;
}
function frozenFingerprint() {
  const files = [];
  (function walk(d) { for (const n of fs.readdirSync(d).sort()) {
    const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(FROZEN);
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(path.relative(FROZEN, f)); h.update(fs.readFileSync(f)); }
  return { count: files.length, digest: h.digest('hex') };
}
const before = frozenFingerprint();

/* use the engine's own RNG (has .int, matches env dynamics exactly) */
const U = AZL.Util;
const rng = seed => new U.RNG(seed >>> 0);

/* ================= 1. SearchContext ================= */

const ctx = v3.createSearchContext();
check('C1_context_frozen', Object.isFrozen(ctx), true);
check('C1_schema_version', ctx.schemaVersion, 1);
check('C1_leaf_version', ctx.leafVersion, 'reference-heuristic-v1');
check('C1_stance_model', ctx.stanceModelVersion, 'synthetic-reference-stance-v1');
check('C1_stance_model_status', ctx.stanceModelStatus, 'development-scaffold');
check('C1_synthetic_threshold', ctx.syntheticThreshold, 0.72);
check('C1_quantum', ctx.controlQuantumTicks, 30);
check('C1_horizon', ctx.horizonQuanta, 40);

// immutability: mutation must not take effect
(() => { try { ctx.rootStance = 'hostile'; } catch (e) { /* strict-mode throw is also acceptable */ } })();
check('C2_mutation_has_no_effect', ctx.rootStance, 'defensive');

// determinism of canonical serialization and hash
const cA = v3.createSearchContext(), cB = v3.createSearchContext();
check('C3_canonical_identical', v3.contextCanonical(cA) === v3.contextCanonical(cB), true);
check('C3_hash_identical', v3.contextHash(cA) === v3.contextHash(cB), true);
check('C3_hash_differs_on_change',
  v3.contextHash(v3.createSearchContext({ seed: 99 })) !== v3.contextHash(cA), true);
const FIXED_CTX_HASH = v3.contextHash(ctx);
const FIXED_CTX_SHA256 = CJ.hashFileBytes(Buffer.from(v3.contextCanonical(ctx), 'utf8'));

// rejection cases
function rejects(overrides) {
  try { v3.createSearchContext(overrides); return false; } catch (e) { return true; }
}
check('C4_rejects_unknown_schema_version', rejects({ schemaVersion: 2 }), true);
check('C4_rejects_unknown_stance', rejects({ rootStance: 'belligerent' }), true);
check('C4_rejects_missing_field', rejects({ objectiveProfileId: null }), true);
check('C4_rejects_nonpositive_quantum', rejects({ controlQuantumTicks: 0 }), true);
check('C4_rejects_fractional_horizon', rejects({ horizonQuanta: 12.5 }), true);
check('C4_rejects_foreign_leaf', rejects({ leafVersion: 'world-control-leaf-v0-development' }), true);
check('C4_unfrozen_context_rejected_by_validate',
  v3.validateContext({ ...ctx }).some(e => /not frozen/.test(e)), true);

/* ================= 2. Fixed quantum and equal horizon ================= */

// every transition advances exactly one quantum regardless of action
let quantumOk = true; const deltas = new Set();
for (let a = 0; a < v3.actions.length; a++) {
  const s0 = v2.sim.init(4242);
  const t0 = v2.sim.tick(s0);
  const r = v3.stepQuantum(s0, a, ctx, rng(4242));
  const d = v2.sim.tick(r.state) - t0;
  if (!r.envTerminal) { deltas.add(d); if (d !== ctx.controlQuantumTicks) quantumOk = false; }
}
check('Q1_every_nonterminal_transition_advances_one_quantum', quantumOk, true);
check('Q1_single_distinct_delta', deltas.size, 1);
check('Q1_delta_value', [...deltas][0], 30);
check('Q1_all_actions_exercised', v3.actions.length, 12);

// transition budget
check('Q2_transition_budget_96x40', v3.transitionBudget(ctx, 96), 3840);
check('Q2_transition_budget_128x40', v3.transitionBudget(ctx, 128), 5120);

/* ================= 3. Rollout: equal horizon, terminals, replan boundary ================= */

function rollout(seed, actionPicker) {
  const r = rng(seed);
  let s = v2.sim.init(seed), q = 0, node = null, envT = false, envV = 0;
  const mask = new Uint8Array(v3.actions.length);
  for (;;) {
    node = v3.evaluateNode(s, ctx, q, null, envT, envV);
    if (node.terminal) break;
    v3.legalMask(s, ctx, mask);
    const legal = []; for (let i = 0; i < mask.length; i++) if (mask[i]) legal.push(i);
    const res = v3.stepQuantum(s, actionPicker(legal, r), ctx, r);
    s = res.state; envT = res.envTerminal; envV = res.envTerminalValue;
    q++;
  }
  return { quanta: q, node, state: s };
}
const pickRandom = (legal, r) => legal[r.int(legal.length)];

const runs = [];
for (let i = 0; i < 40; i++) runs.push(rollout(1000 + i, pickRandom));

const horizonRuns = runs.filter(r => r.node.kind === 'horizon');
check('R1_horizon_rollouts_all_equal_quanta',
  horizonRuns.every(r => r.quanta === ctx.horizonQuanta), true);
check('R1_terminal_kinds_are_declared',
  runs.every(r => ['horizon', 'replan-boundary', 'faction-eliminated', 'environment-terminal',
    'objective-complete', 'protected-object-destroyed', 'deadline-incomplete'].includes(r.node.kind)), true);
check('R1_no_irreversibly_failed_kind',
  runs.every(r => r.node.kind !== 'irreversibly-failed'), true);

// replan boundary behaviour, forced deterministically
const boundaryState = (() => {
  let s = v2.sim.init(7); s.threat = 200; s.defense = 0; return s;
})();
const bNode = v3.evaluateNode(boundaryState, ctx, 3, null, false, 0);
check('B1_boundary_detected', bNode.kind, 'replan-boundary');
check('B1_requires_replan', bNode.requiresReplan, true);
check('B1_predicted_next_stance', bNode.predictedNextStance, 'hostile');
check('B1_reason', bNode.reason, 'synthetic_tension_threshold_crossed');
check('B1_stance_model_recorded', bNode.stanceModelVersion, 'synthetic-reference-stance-v1');
check('B1_expansion_stops', bNode.terminal, true);
check('B1_no_transition_bonus', bNode.transitionBonus, 0);
check('B1_valued_with_current_leaf',
  bNode.value === v2.sim.heuristicValue(boundaryState), true);
check('B1_root_stance_unchanged_after_boundary', ctx.rootStance, 'defensive');

// no next-stance action exposure: the mask at a boundary state is still the v2 mask
// computed under the root stance, and carries no additional actions
{
  const m3 = new Uint8Array(v3.actions.length); v3.legalMask(boundaryState, ctx, m3);
  const m2 = new Uint8Array(v2.actions.length); v2.sim.legalMask(boundaryState, m2);
  check('B2_mask_width_unchanged', m3.length, v2.actions.length);
  check('B2_no_extra_actions_exposed', m3.every((v, i) => v === m2[i]), true);
}

// boundary-bias instrumentation (mechanism-conformance only)
const boundaryRuns = runs.filter(r => r.node.kind === 'replan-boundary');
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const INSTR = {
  search_context_hash: FIXED_CTX_HASH,
  root_stance: ctx.rootStance,
  objective_profile_id: ctx.objectiveProfileId,
  stance_model_version: ctx.stanceModelVersion,
  stance_model_status: ctx.stanceModelStatus,
  synthetic_threshold: ctx.syntheticThreshold,
  control_quantum_ticks: ctx.controlQuantumTicks,
  horizon_quanta: ctx.horizonQuanta,
  simulations: runs.length,
  transition_budget: v3.transitionBudget(ctx, runs.length),
  replan_boundary_rollouts: boundaryRuns.length,
  replan_boundary_fraction: Number((boundaryRuns.length / runs.length).toFixed(4)),
  mean_boundary_leaf_value: mean(boundaryRuns.map(r => r.node.value)),
  mean_non_boundary_leaf_value: mean(runs.filter(r => r.node.kind !== 'replan-boundary').map(r => r.node.value)),
  label: 'Mechanism-conformance measurement under synthetic-reference-stance-v1; not an observed ZekNova behavioral property. Never used for promotion or tuning.'
};
/* Scaffold sensitivity: at the default 0.72 the synthetic predicate is never crossed
   by random play, so the boundary mechanism is proven only by the forced B1 case.
   Sweeping the SCAFFOLD threshold (not a leaf parameter, not a tuned value) shows the
   mechanism produces boundaries when the predicate is reachable. Reported, not tuned. */
const SWEEP = [];
for (const th of [0.05, 0.10, 0.20, 0.40, 0.72]) {
  const c = v3.createSearchContext({ syntheticThreshold: th });
  let hit = 0; const vals = [];
  for (let i = 0; i < 40; i++) {
    const r = rng(1000 + i); let st = v2.sim.init(1000 + i), q = 0, eT = false, eV = 0, n;
    const m = new Uint8Array(v3.actions.length);
    for (;;) {
      n = v3.evaluateNode(st, c, q, null, eT, eV);
      if (n.terminal) break;
      v3.legalMask(st, c, m);
      const legal = []; for (let k = 0; k < m.length; k++) if (m[k]) legal.push(k);
      const res = v3.stepQuantum(st, legal[r.int(legal.length)], c, r);
      st = res.state; eT = res.envTerminal; eV = res.envTerminalValue; q++;
    }
    if (n.kind === 'replan-boundary') { hit++; vals.push(n.value); }
  }
  SWEEP.push({ synthetic_threshold: th, boundary_rollouts: hit,
    boundary_fraction: Number((hit / 40).toFixed(4)),
    mean_boundary_leaf_value: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : null });
}
check('I2_mechanism_reachable_at_some_threshold', SWEEP.some(x => x.boundary_rollouts > 0), true);
check('I2_sweep_is_monotone_nonincreasing',
  SWEEP.every((x, i) => i === 0 || SWEEP[i - 1].boundary_fraction >= x.boundary_fraction), true);

check('I1_instrumentation_complete',
  ['search_context_hash', 'transition_budget', 'replan_boundary_rollouts',
    'replan_boundary_fraction', 'mean_boundary_leaf_value',
    'mean_non_boundary_leaf_value'].every(k => k in INSTR), true);
check('I1_carries_scaffold_label', /not an observed ZekNova behavioral property/.test(INSTR.label), true);

/* ================= 4. Leaf identity ================= */

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/leaf-registry.json'), 'utf8'));
const entry = reg.leaves.find(l => l.leaf_version === 'reference-heuristic-v1');
check('L1_reference_leaf_registered', !!entry, true);
check('L1_world_control_leaf_absent',
  !reg.leaves.some(l => l.leaf_version === 'world-control-leaf-v0-development'), true);
check('L1_registry_verifies', G.verifyLeafRegistry(reg).pass, true);
check('L2_module_hash_binds_implementation',
  entry.implementation.module_sha256 ===
  CJ.hashFileBytes(fs.readFileSync(path.join(ENG, 'azl-ref-adapter-v2.js'))), true);
check('L2_dependency_closure_bound',
  entry.implementation.dependency_hashes['azl-util.js'] ===
  CJ.hashFileBytes(fs.readFileSync(path.join(ENG, 'azl-util.js'))), true);

// every leaf record in one tree carries identical identity
const recs = runs.map(r => v3.leafRecord(r.state, ctx, entry.content_hash));
check('L3_all_records_same_context_hash',
  new Set(recs.map(r => r.search_context_hash)).size, 1);
check('L3_all_records_same_leaf_version', new Set(recs.map(r => r.leaf_version)).size, 1);
check('L3_all_records_same_leaf_content_hash', new Set(recs.map(r => r.leaf_content_hash)).size, 1);
check('L3_all_records_same_root_stance', new Set(recs.map(r => r.root_stance)).size, 1);
check('L3_all_records_same_objective', new Set(recs.map(r => r.objective_profile_id)).size, 1);
check('L3_record_hash_matches_context', recs[0].search_context_hash, FIXED_CTX_HASH);

/* ================= 5. Legacy isolation ================= */

check('X1_v2_object_not_mutated',
  v2.id === v2SnapshotBefore.id && v2.version === v2SnapshotBefore.version &&
  v2.actions.length === v2SnapshotBefore.actionCount, true);
check('X1_v2_gained_no_v3_methods',
  ['createSearchContext', 'stepQuantum', 'evaluateNode', 'contextHash'].some(k => k in v2), false);
check('X1_v3_is_separate_object', v3 !== v2, true);
check('X2_v2_step_still_reachable', typeof v2.sim.step, 'function');

// with v3 unused, v2 behaviour is byte-identical to a v3-free process
{
  const trace = [];
  const r = rng(31337); const s = v2.sim.init(31337);
  for (let i = 0; i < 200; i++) { v2.sim.step(s, i % v2.actions.length, r); trace.push(v2.sim.health(s)); }
  const digest = CJ.hashFileBytes(Buffer.from(JSON.stringify(trace)));
  /* identical trace produced in a process where azl-ref-adapter-v3.js is never loaded */
  const child = require('child_process').execFileSync(process.execPath, ['-e', `
    const path=require('path');const ENG=${JSON.stringify(ENG)};
    ${JSON.stringify(MODULES)}.forEach(f=>require(path.join(ENG,f)));
    const AZL=globalThis.AZL, v2=AZL.ReferenceAdapter;
    const r=new AZL.Util.RNG(31337); const st=v2.sim.init(31337); const t=[];
    for(let i=0;i<200;i++){v2.sim.step(st,i%v2.actions.length,r);t.push(v2.sim.health(st));}
    process.stdout.write(require('crypto').createHash('sha256').update(JSON.stringify(t)).digest('hex'));
  `], { encoding: 'utf8' });
  check('X3_v3_absent_from_child_process',
    require('child_process').execFileSync(process.execPath, ['-e', `
      const path=require('path');const ENG=${JSON.stringify(ENG)};
      ${JSON.stringify(MODULES)}.forEach(f=>require(path.join(ENG,f)));
      process.stdout.write(String(!!globalThis.AZL.ReferenceAdapterV3));
    `], { encoding: 'utf8' }), 'false');
  check('X3_v2_trace_identical_without_v3_loaded', digest === child, true);
}

/* ================= 6. Frozen evidence untouched ================= */

const after = frozenFingerprint();
check('Z1_frozen_count_unchanged', after.count === before.count, true);
check('Z2_frozen_digest_unchanged', after.digest === before.digest, true);

/* ---------- report ---------- */
console.log(results);
console.log('\nfixed-fixture SearchContext canonical form:');
console.log('  ' + v3.contextCanonical(ctx));
console.log('  contextHash (fnv1a64x2) :', FIXED_CTX_HASH);
console.log('  contextHash (sha256)    :', FIXED_CTX_SHA256);
console.log('\nW0-S instrumentation record:');
console.log(JSON.stringify(INSTR, null, 2));
console.log('\nsynthetic-stance scaffold sweep (SCAFFOLD parameter, not a leaf parameter):');
console.table ? console.table(SWEEP) : console.log(JSON.stringify(SWEEP, null, 1));
console.log('\nfrozen set:', after.count, 'files, digest', after.digest.slice(0, 16));
console.log(failures === 0
  ? `W0-S TESTS PASS (${Object.keys(results).length}/${Object.keys(results).length})`
  : `W0-S TESTS FAIL (${failures}/${Object.keys(results).length})`);
process.exit(failures === 0 ? 0 : 1);
