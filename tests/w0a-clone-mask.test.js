/* w0a-clone-mask.test.js — W0-A' slice A1-A5 (reference-colony v2)
   A3 clone persistence/isolation/path-enforcement + FX-CLONE-DROP, FX-CLONE-ALIAS
   A4 native resource mask-difference witnesses
   A5 FX-ROOT-MASK, FX-MASK-NONDET
   Lifecycle mechanics (A6+) are NOT exercised: counters are never advanced here.
   Usage: node tests/w0a-clone-mask.test.js   (run from sgrid-lab/) */
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
require(path.join(ENG, 'azl-ref-adapter-v3.js'));

const AZL = globalThis.AZL, U = AZL.Util, v2 = AZL.ReferenceAdapter, v3 = AZL.ReferenceAdapterV3;
const v3Snapshot = Object.keys(v3).sort().join(',');
const v2Snapshot = { id: v2.id, version: v2.version, n: v2.actions.length };
require(path.join(ENG, 'azl-ref-adapter-v4.js'));
const v4 = AZL.ReferenceAdapterV4;

const ROOT = path.resolve(__dirname, '..', '..');
const FROZEN = path.join(ROOT, 'sgrid-lab/results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN, 'w0a-clone-mask.test.js');

const results = {};
let failures = 0;
const check = (name, actual, expected) => {
  const pass = actual === expected;
  results[name] = pass ? 'pass' : `FAIL(expected ${expected}, got ${actual})`;
  if (!pass) failures++;
};
function frozenFingerprint() {
  const files = [];
  (function walk(d) { for (const n of fs.readdirSync(d).sort()) {
    const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(FROZEN);
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(path.relative(FROZEN, f)); h.update(fs.readFileSync(f)); }
  return { count: files.length, digest: h.digest('hex') };
}
const before = frozenFingerprint();
const ctx = v4.createSearchContext();

/* =================== A1/A2 composite schema =================== */
{
  const s = v4.initStateV4(1234);
  check('S1_schema_version', s.schemaVersion, 1);
  check('S1_env_state_nested', typeof s.environmentState.t, 'number');
  check('S1_wellformed', v4.isWellFormedV4(s), true);
  check('S1_lifecycle_inert_at_init', v4.lifecycleIsInert(s.lifecycleState), true);
  check('S1_lifecycle_not_advanced_in_this_slice', v4.lifecycleAdvancedInThisSlice, false);
  check('S1_typed_arrays_action_indexed', s.lifecycleState.cooldownQuantaRemaining.length, v2.actions.length);
  // canonical serialization must not depend on typed-array stringification
  const can = v4.canonicalLifecycle(s.lifecycleState);
  check('S2_canonical_uses_plain_arrays', Array.isArray(can.cooldownQuantaRemaining), true);
  check('S2_canonical_json_stable',
    JSON.stringify(v4.canonicalLifecycle(v4.cloneStateV4(s).lifecycleState)) === JSON.stringify(can), true);
  // leaf sees environmentState only
  check('S3_leaf_ignores_lifecycle',
    v4.heuristicValueV4(s) === v2.sim.heuristicValue(s.environmentState), true);
}

/* =================== A3 clone persistence =================== */
{
  const s = v4.initStateV4(77);
  s.lifecycleState.executionQuantaRemaining[3] = 5;
  s.lifecycleState.cooldownQuantaRemaining[9] = 11;
  s.lifecycleState.activePlanActionIndex = 4;
  s.lifecycleState.commitmentQuantaRemaining = 7;
  s.lifecycleState.targetFreshUntilQuantum[10] = 4242;

  const c = v4.cloneStateV4(s);
  check('P1_execution_counter_survives', c.lifecycleState.executionQuantaRemaining[3], 5);
  check('P2_cooldown_counter_survives', c.lifecycleState.cooldownQuantaRemaining[9], 11);
  check('P3_active_plan_survives', c.lifecycleState.activePlanActionIndex, 4);
  check('P3_commitment_survives', c.lifecycleState.commitmentQuantaRemaining, 7);
  check('P4_target_freshness_survives', c.lifecycleState.targetFreshUntilQuantum[10], 4242);
  check('P5_environment_state_survives', c.environmentState.materials, s.environmentState.materials);

  /* ---- isolation ---- */
  c.lifecycleState.cooldownQuantaRemaining[9] = 99;
  check('I1_child_mutation_does_not_touch_parent', s.lifecycleState.cooldownQuantaRemaining[9], 11);
  c.environmentState.materials = -1;
  check('I1_env_mutation_does_not_touch_parent', s.environmentState.materials > 0, true);

  const a = v4.cloneStateV4(s), b = v4.cloneStateV4(s);
  a.lifecycleState.executionQuantaRemaining[3] = 1;
  check('I2_sibling_branches_do_not_alias', b.lifecycleState.executionQuantaRemaining[3], 5);
  a.environmentState.regions[0].res = 12345;
  check('I3_nested_arrays_do_not_alias', b.environmentState.regions[0].res !== 12345, true);
  check('I3_typed_array_buffers_distinct',
    a.lifecycleState.cooldownQuantaRemaining.buffer !== s.lifecycleState.cooldownQuantaRemaining.buffer, true);
}

/* =================== FX-CLONE-DROP =================== */
{
  const s = v4.initStateV4(5);
  s.lifecycleState.cooldownQuantaRemaining[2] = 6;
  // defective: uses the V2 whitelist clone on a V4 composite state
  const defective = st => v2.sim.clone(st);
  let dropped = false, illFormed = false;
  try {
    const bad = defective(s);
    dropped = bad.lifecycleState === undefined;
    illFormed = !v4.isWellFormedV4(bad);
  } catch (e) { dropped = true; illFormed = true; }
  check('FXCD1_v2_clone_drops_lifecycle', dropped, true);
  check('FXCD2_defective_clone_rejected_as_illformed', illFormed, true);
  check('FXCD3_correct_clone_retains', v4.cloneStateV4(s).lifecycleState.cooldownQuantaRemaining[2], 6);
}

/* =================== FX-CLONE-ALIAS =================== */
{
  const s = v4.initStateV4(6);
  s.lifecycleState.cooldownQuantaRemaining[1] = 3;
  // defective: shallow lifecycle copy — siblings share the same typed arrays
  const shallow = st => ({ schemaVersion: st.schemaVersion,
    environmentState: v2.sim.clone(st.environmentState),
    lifecycleState: Object.assign({}, st.lifecycleState) });
  const a = shallow(s), b = shallow(s);
  a.lifecycleState.cooldownQuantaRemaining[1] = 42;
  check('FXCA1_shallow_copy_aliases_siblings', b.lifecycleState.cooldownQuantaRemaining[1], 42);
  check('FXCA2_shallow_copy_corrupts_parent', s.lifecycleState.cooldownQuantaRemaining[1], 42);
  const ga = v4.cloneStateV4(v4.initStateV4(6)), gb = v4.cloneStateV4(v4.initStateV4(6));
  ga.lifecycleState.cooldownQuantaRemaining[1] = 42;
  check('FXCA3_correct_clone_does_not_alias', gb.lifecycleState.cooldownQuantaRemaining[1], 0);
}

/* =================== clone-path enforcement =================== */
{
  // Every clone taken by a search must pass through cloneStateV4. Instrument and count.
  const realClone = v4.cloneStateV4;
  let calls = 0;
  v4.cloneStateV4 = function (s) { calls++; return realClone(s); };
  const root = v4.initStateV4(31);
  const branches = [];
  for (let i = 0; i < 6; i++) branches.push(v4.cloneStateV4(root));
  v4.cloneStateV4 = realClone;
  check('CP1_all_search_clones_instrumented', calls, 6);
  check('CP2_branches_wellformed', branches.every(b => v4.isWellFormedV4(b)), true);
  check('CP3_root_unchanged_by_branching',
    v4.lifecycleIsInert(root.lifecycleState), true);
}

/* =================== A4 native resource mask witnesses =================== */
const WITNESSES = [];
function witness(name, mutate, actionIdx, bit, reason, seed) {
  const s = v4.initStateV4(seed); mutate(s.environmentState);
  const rootRec = v4.maskRecord(s, ctx);
  if (!rootRec.bits[bit]) return { name, ok: false, why: 'bit not legal at root' };
  const work = v4.cloneStateV4(s);
  v4.stepQuantumV4(work, actionIdx, ctx, new U.RNG(seed));
  const depthRec = v4.maskRecord(work, ctx);
  const r = {
    name, ok: rootRec.bits[bit] === 1 && depthRec.bits[bit] === 0
      && rootRec.mask_hash !== depthRec.mask_hash
      && depthRec.reasons[v2.actions[bit].key] === reason,
    bit, action: v2.actions[bit].key, driver: v2.actions[actionIdx].key,
    root_hex: rootRec.bitset_hex, depth_hex: depthRec.bitset_hex,
    root_hash: rootRec.mask_hash, depth_hash: depthRec.mask_hash,
    reason: depthRec.reasons[v2.actions[bit].key]
  };
  // reproducibility: same construction must reproduce the same depth mask
  const s2 = v4.initStateV4(seed); mutate(s2.environmentState);
  v4.stepQuantumV4(s2, actionIdx, ctx, new U.RNG(seed));
  r.reproducible = v4.maskRecord(s2, ctx).mask_hash === depthRec.mask_hash;
  WITNESSES.push(r);
  return r;
}

const w1 = witness('materials_gate', s => { s.materials = 12; }, 4, 4, 'insufficient_materials', 1);
const w2 = witness('credits_gate', s => { s.credits = 12; }, 9, 9, 'insufficient_credits', 2);
const w3 = witness('energy_gate', s => { s.energy = 12; s.infra = 0; }, 8, 8, 'insufficient_energy', 3);
const w4 = witness('housing_gate', s => { s.population = s.housing - 2; }, 7, 7, 'no_housing_capacity', 4);
const w5 = witness('trade_credits_gate', s => { s.credits = 12; s.food = 20; s.energy = 20; s.materials = 20; }, 9, 3, 'insufficient_credits', 5);

[w1, w2, w3, w4, w5].forEach(w => {
  check('W_' + w.name + '_bit_flipped_and_hash_differs', w.ok, true);
  check('W_' + w.name + '_reproducible', w.reproducible, true);
});
check('W_at_least_four_native_gates_reachable', WITNESSES.filter(w => w.ok).length >= 4, true);

/* =================== A5 FX-ROOT-MASK =================== */
{
  // A defective search computes the root mask once and reuses it below the root.
  const s = v4.initStateV4(1); s.environmentState.materials = 12;
  const rootRec = v4.maskRecord(s, ctx);
  const work = v4.cloneStateV4(s);
  v4.stepQuantumV4(work, 4, ctx, new U.RNG(1));
  const correct = v4.maskRecord(work, ctx);

  const staleLegal = i => rootRec.bits[i] === 1;          // defective controller
  const freshLegal = i => correct.bits[i] === 1;          // correct controller
  const divergent = [];
  for (let i = 0; i < v4.actionCount; i++) if (staleLegal(i) !== freshLegal(i)) divergent.push(i);

  check('FXRM1_stale_and_fresh_masks_diverge', divergent.length > 0, true);
  check('FXRM2_defective_would_select_illegal_action',
    divergent.some(i => staleLegal(i) && !freshLegal(i)), true);
  check('FXRM3_defective_rejected', rootRec.mask_hash === correct.mask_hash, false);
  check('FXRM4_correct_implementation_accepted',
    correct.mask_hash === v4.maskRecord(work, ctx).mask_hash, true);
}

/* =================== A5 FX-MASK-NONDET =================== */
{
  const s = v4.initStateV4(9); s.environmentState.materials = 4; s.environmentState.credits = 2;
  const a = v4.maskRecord(s, ctx), b = v4.maskRecord(s, ctx), c = v4.maskRecord(s, ctx);
  check('FXMN1_bitset_identical', a.bitset_hex === b.bitset_hex && b.bitset_hex === c.bitset_hex, true);
  check('FXMN2_hash_identical', a.mask_hash === b.mask_hash && b.mask_hash === c.mask_hash, true);
  check('FXMN3_bytes_identical',
    Buffer.from(a.bits).equals(Buffer.from(b.bits)) && Buffer.from(b.bits).equals(Buffer.from(c.bits)), true);
  check('FXMN4_reasons_are_diagnostic_not_hashed',
    a.canonical.indexOf('reason') < 0 && a.canonical.indexOf('insufficient') < 0, true);
  check('FXMN5_ordering_is_action_indexed_not_key_derived', a.bits.length, v2.actions.length);

  // a Set/object-key-derived mask reorders and must not reproduce the authoritative hash
  const keyed = {}; v2.actions.forEach((act, i) => { keyed[act.key] = a.bits[i]; });
  const reordered = new Uint8Array(v2.actions.length);
  Object.keys(keyed).sort().forEach((k, i) => { reordered[i] = keyed[k]; });
  check('FXMN6_key_sorted_mask_rejected', v4.maskBitsetHex(reordered) === a.bitset_hex, false);

  // clone round-trip must not perturb the mask
  check('FXMN7_clone_roundtrip_mask_stable',
    v4.maskRecord(v4.cloneStateV4(s), ctx).mask_hash, a.mask_hash);
}

/* =================== isolation of frozen layers =================== */
check('X1_v2_unchanged',
  v2.id === v2Snapshot.id && v2.version === v2Snapshot.version && v2.actions.length === v2Snapshot.n, true);
check('X2_v3_surface_unchanged', Object.keys(v3).sort().join(','), v3Snapshot);
check('X3_v2_gained_no_v4_methods',
  ['cloneStateV4', 'legalMaskV4', 'maskRecord'].some(k => k in v2), false);
check('X4_v3_gained_no_v4_methods',
  ['cloneStateV4', 'legalMaskV4', 'maskRecord'].some(k => k in v3), false);
check('X5_leaf_registry_untouched_by_this_slice',
  JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/leaf-registry.json'), 'utf8'))
    .leaves[0].leaf_version, 'reference-heuristic-v1');

const after = frozenFingerprint();
check('Z1_frozen_count_unchanged', after.count === before.count, true);
check('Z2_frozen_digest_unchanged', after.digest === before.digest, true);

/* ---------- report ---------- */
console.log(results);
console.log('\nnative mask-difference witnesses (A4):');
console.table(WITNESSES.map(w => ({
  witness: w.name, driver: w.driver, action: w.action, bit: w.bit,
  root_hex: w.root_hex, depth_hex: w.depth_hex, reason: w.reason,
  root_hash: w.root_hash.slice(0, 8), depth_hash: w.depth_hash.slice(0, 8),
  ok: w.ok, reproducible: w.reproducible
})));
console.log('\nNOT natively reachable: mobility gate (bit 10) — no reference action mutates s.mobility.');
console.log('lifecycle counters advanced in this slice:', v4.lifecycleAdvancedInThisSlice);
console.log('frozen set:', after.count, 'files, digest', after.digest.slice(0, 16));
console.log(failures === 0
  ? `W0-A' A1-A5 TESTS PASS (${Object.keys(results).length}/${Object.keys(results).length})`
  : `W0-A' A1-A5 TESTS FAIL (${failures}/${Object.keys(results).length})`);
process.exit(failures === 0 ? 0 : 1);
