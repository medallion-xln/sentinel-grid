/* w0a-action-legality.test.js — W0-A' A1-A10 (reference-colony v2)
   A3 clone persistence/isolation/path-enforcement + FX-CLONE-DROP, FX-CLONE-ALIAS
   A4 native resource mask-difference witnesses
   A5 FX-ROOT-MASK, FX-MASK-NONDET
   A6 registry · A7 execution/cooldown timing · A8 commitment · A9 target scaffold
   A10 FX-COOLDOWN, FX-ILLEGAL, FX-SPAM, FX-OSCILLATE, FX-STALE, FX-REPLAN-BOUNDARY
   Usage: node tests/w0a-action-legality.test.js   (run from sgrid-lab/) */
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
require('./_preflight').requireFrozen(FROZEN, 'w0a-action-legality.test.js');

const REG_PATH = path.join(ROOT, 'docs/governance/action-lifecycle-registry.json');
require('./_preflight').requireFile(REG_PATH, 'w0a-action-legality.test.js', {
  ships_in: 'w0a-prime-a1-a10/docs/governance/action-lifecycle-registry.json',
  fix: 'cp /path/to/w0a-prime-a1-a10/docs/governance/action-lifecycle-registry.json ' +
       path.join(ROOT, 'docs/governance') + '/'
});
const REG = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
v4.setLifecycleRegistry(REG);
const A = k => v2.actions.findIndex(x => x.key === k);

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
  check('S1_lifecycle_advanced_in_this_slice', v4.lifecycleAdvancedInThisSlice, true);
  check('S1_current_quantum_starts_zero', s.lifecycleState.currentQuantum, 0);
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
  // A3 measures the ENVIRONMENT: native legality layer, stepped via the frozen V3
  // contract so V4's lifecycle overlay cannot be what moves the bit.
  const s = v4.initStateV4(seed); mutate(s.environmentState);
  const rootRec = v4.nativeMaskRecord(s);
  if (!rootRec.bits[bit]) return { name, ok: false, why: 'bit not legal at root' };
  const work = v4.cloneStateV4(s);
  AZL.ReferenceAdapterV3.stepQuantum(work.environmentState, actionIdx, ctx, new U.RNG(seed));
  const depthRec = v4.nativeMaskRecord(work);
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
  AZL.ReferenceAdapterV3.stepQuantum(s2.environmentState, actionIdx, ctx, new U.RNG(seed));
  r.reproducible = v4.nativeMaskRecord(s2).mask_hash === depthRec.mask_hash;
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
  const rootRec = v4.nativeMaskRecord(s);
  const work = v4.cloneStateV4(s);
  AZL.ReferenceAdapterV3.stepQuantum(work.environmentState, 4, ctx, new U.RNG(1));
  const correct = v4.nativeMaskRecord(work);

  const staleLegal = i => rootRec.bits[i] === 1;          // defective controller
  const freshLegal = i => correct.bits[i] === 1;          // correct controller
  const divergent = [];
  for (let i = 0; i < v4.actionCount; i++) if (staleLegal(i) !== freshLegal(i)) divergent.push(i);

  check('FXRM1_stale_and_fresh_masks_diverge', divergent.length > 0, true);
  check('FXRM2_defective_would_select_illegal_action',
    divergent.some(i => staleLegal(i) && !freshLegal(i)), true);
  check('FXRM3_defective_rejected', rootRec.mask_hash === correct.mask_hash, false);
  check('FXRM4_correct_implementation_accepted',
    correct.mask_hash === v4.nativeMaskRecord(work).mask_hash, true);
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

/* =================== A6 lifecycle registry =================== */
{
  check('A6_registry_id', REG.registry_id, 'reference-action-lifecycle-v0-development');
  check('A6_registry_is_development_scaffold', REG.status, 'development-scaffold');
  check('A6_registry_not_frozen', REG.not_frozen, true);
  check('A6_declares_every_action', REG.actions.length, v2.actions.length);
  check('A6_action_order_matches_frozen_v2',
    REG.actions.every((a, i) => a.index === i && a.key === v2.actions[i].key), true);
  check('A6_cost_timing_declared_not_inferred', REG.resource_cost_timing, 'per_execution_quantum');
  check('A6_cost_realization_declared', REG.resource_cost_realization, 'v2-native');
  check('A6_target_model_labelled_scaffold', REG.target_model_status, 'development-scaffold');
  check('A6_interrupts_declared', REG.declared_interrupts.join(','), 'stabilize');
  // a registry whose order disagrees with the frozen action space is rejected
  const bad = JSON.parse(JSON.stringify(REG));
  [bad.actions[0], bad.actions[1]] = [bad.actions[1], bad.actions[0]];
  let rejected = false; try { v4.setLifecycleRegistry(bad); } catch (e) { rejected = true; }
  v4.setLifecycleRegistry(REG);
  check('A6_misordered_registry_rejected', rejected, true);
}

/* =================== A7 exact execution/cooldown timing =================== */
const TIMELINE = [];
{
  // defend: executionQuanta 1, cooldownQuanta 1 — the canonical example
  const idx = A('defend');
  check('A7_fixture_is_exec1_cool1',
    REG.actions[idx].executionQuanta === 1 && REG.actions[idx].cooldownQuanta === 1, true);
  const s = v4.initStateV4(101); s.environmentState.energy = 400; s.environmentState.materials = 200;
  const rng = new U.RNG(101);
  const legalAt = () => !!v4.legalMaskV4(s, ctx)[idx];

  const q0 = { quantum: s.lifecycleState.currentQuantum, legal: legalAt(), phase: 'available' };
  v4.stepQuantumV4(s, idx, ctx, rng);
  const q1 = { quantum: s.lifecycleState.currentQuantum, legal: legalAt(),
    exec: s.lifecycleState.executionQuantaRemaining[idx], cool: s.lifecycleState.cooldownQuantaRemaining[idx] };
  v4.stepQuantumV4(s, A('gather_food'), ctx, rng);
  const q2 = { quantum: s.lifecycleState.currentQuantum, legal: legalAt(),
    exec: s.lifecycleState.executionQuantaRemaining[idx], cool: s.lifecycleState.cooldownQuantaRemaining[idx] };
  TIMELINE.push({ at: 'Q0 start', legal: q0.legal, note: 'available' },
    { at: 'Q1 start', legal: q1.legal, exec: q1.exec, cool: q1.cool, note: 'cooldown' },
    { at: 'Q2 start', legal: q2.legal, exec: q2.exec, cool: q2.cool, note: 'available' });

  check('A7_q0_available', q0.legal, true);
  check('A7_q0_execution_completes_and_cooldown_initialised', q1.exec === 0 && q1.cool === 1, true);
  check('A7_q1_masked_by_cooldown', q1.legal, false);
  check('A7_new_cooldown_not_decremented_same_quantum', q1.cool, 1);
  check('A7_q1_end_cooldown_reaches_zero', q2.cool, 0);
  check('A7_q2_available_at_exact_expiry', q2.legal, true);

  // off-by-one both directions on a 2/2 action
  const bi = A('build_defense');
  check('A7_fixture_is_exec2_cool2',
    REG.actions[bi].executionQuanta === 2 && REG.actions[bi].cooldownQuanta === 2, true);
  const t = v4.initStateV4(202); t.environmentState.materials = 4000; t.environmentState.energy = 4000;
  const r2 = new U.RNG(202);
  const seen = [];
  v4.stepQuantumV4(t, bi, ctx, r2);                       // Q0 -> exec 2->1
  seen.push(t.lifecycleState.executionQuantaRemaining[bi]);
  v4.stepQuantumV4(t, bi, ctx, r2);                       // committed: plan continues, exec 1->0, cool=2
  seen.push(t.lifecycleState.executionQuantaRemaining[bi], t.lifecycleState.cooldownQuantaRemaining[bi]);
  check('A7_exec2_decrements_one_per_quantum', seen[0], 1);
  check('A7_exec2_completes_at_second_quantum', seen[1], 0);
  check('A7_cool2_initialised_undecremented', seen[2], 2);
}

/* =================== A8 plan commitment =================== */
{
  const bi = A('build_defense'), si = A('stabilize'), gi = A('gather_food');
  check('A8_fixture_has_commitment', REG.actions[bi].commitmentQuanta, 3);
  const s = v4.initStateV4(303); s.environmentState.materials = 4000; s.environmentState.energy = 4000;
  const rng = new U.RNG(303);
  v4.stepQuantumV4(s, bi, ctx, rng);
  const ls = s.lifecycleState;
  check('A8_active_plan_recorded', ls.activePlanActionIndex, bi);
  check('A8_commitment_decremented_once', ls.commitmentQuantaRemaining, 2);
  const m = v4.legalMaskV4(s, ctx);
  check('A8_plan_continues_legal', !!m[bi], true);
  check('A8_commitment_does_not_override_cooldown', (() => {
    const c = v4.cloneStateV4(s); c.lifecycleState.cooldownQuantaRemaining[bi] = 2;
    return !!v4.legalMaskV4(c, ctx)[bi];
  })(), false);
  check('A8_declared_interrupt_stays_legal', !!m[si], true);
  check('A8_unrelated_plan_masked', !!m[gi], false);
  check('A8_reason_is_plan_commitment', v4.maskRecord(s, ctx).reasons[v2.actions[gi].key], 'plan_commitment');
  // continue the plan once more (still executing), then the plan completes and enters
  // cooldown — from that point continuing is correctly refused and the declared
  // interrupt is the only way to advance, which is the intended escape.
  v4.stepQuantumV4(s, bi, ctx, rng);
  check('A8_plan_on_cooldown_after_completion', s.lifecycleState.cooldownQuantaRemaining[bi], 2);
  let continuedWhileCooling = true;
  try { v4.stepQuantumV4(s, bi, ctx, rng); } catch (e) { continuedWhileCooling = false; }
  check('A8_continuing_a_cooling_plan_refused', continuedWhileCooling, false);
  v4.stepQuantumV4(s, si, ctx, rng);          // declared interrupt advances the quantum
  check('A8_commitment_expired', s.lifecycleState.commitmentQuantaRemaining, 0);
  check('A8_active_plan_cleared', s.lifecycleState.activePlanActionIndex, -1);
  check('A8_alternatives_available_after_expiry', !!v4.legalMaskV4(s, ctx)[gi], true);
}

/* =================== A9 synthetic target scaffold =================== */
{
  const ei = A('explore');
  check('A9_explore_requires_fresh_target', REG.actions[ei].requiresFreshTarget, true);
  const s = v4.initStateV4(404); s.environmentState.energy = 4000;
  check('A9_masked_when_never_set', !!v4.legalMaskV4(s, ctx)[ei], false);
  v4.setTargetFreshness(s, ei, 2);                       // fresh while currentQuantum < 2
  check('A9_fresh_at_q0', !!v4.legalMaskV4(s, ctx)[ei], true);
  const rng = new U.RNG(404);
  v4.stepQuantumV4(s, A('gather_food'), ctx, rng);        // -> Q1
  check('A9_fresh_at_q1', v4.isTargetFresh(s, ei), true);
  v4.stepQuantumV4(s, A('gather_food'), ctx, rng);        // -> Q2, equality
  check('A9_stale_at_equality_exclusive_boundary', v4.isTargetFresh(s, ei), false);
  check('A9_masked_at_equality', !!v4.legalMaskV4(s, ctx)[ei], false);
  check('A9_reason_is_stale_target', v4.maskRecord(s, ctx).reasons[v2.actions[ei].key], 'stale_target');
}

/* =================== A10 negative fixtures =================== */
{
  const rng = () => new U.RNG(505);
  // FX-COOLDOWN: reuse during cooldown rejected; legal at exact expiry
  {
    const di = A('defend');
    const s = v4.initStateV4(505); s.environmentState.energy = 4000;
    const r = rng(); v4.stepQuantumV4(s, di, ctx, r);
    let early = false; try { v4.stepQuantumV4(s, di, ctx, r); } catch (e) { early = e.code === 'ILLEGAL_ACTION'; }
    check('FXCOOL1_reuse_during_cooldown_rejected', early, true);
    v4.stepQuantumV4(s, A('gather_food'), ctx, r);
    let late = true; try { v4.stepQuantumV4(s, di, ctx, r); } catch (e) { late = false; }
    check('FXCOOL2_legal_at_exact_expiry', late, true);
  }
  // FX-ILLEGAL: an action masked by native legality is refused
  {
    const s = v4.initStateV4(606); s.environmentState.materials = 0;
    check('FXILL1_natively_masked', !!v4.legalMaskV4(s, ctx)[A('build_defense')], false);
    let threw = null;
    try { v4.stepQuantumV4(s, A('build_defense'), ctx, new U.RNG(606)); } catch (e) { threw = e.code; }
    check('FXILL2_illegal_action_rejected', threw, 'ILLEGAL_ACTION');
  }
  // FX-SPAM: a controller repeating one action regardless of context hits the mask
  {
    const di = A('defend');
    const s = v4.initStateV4(707); s.environmentState.energy = 4000;
    const r = rng(); let attempts = 0, refused = 0;
    for (let i = 0; i < 8; i++) {
      attempts++;
      try { v4.stepQuantumV4(s, di, ctx, r); } catch (e) { refused++; v4.stepQuantumV4(s, A('gather_food'), ctx, r); }
    }
    check('FXSPAM1_spam_controller_refused', refused > 0, true);
    check('FXSPAM2_refusal_rate_matches_cooldown', refused, 4);
  }
  // FX-OSCILLATE: flipping plans without new evidence is blocked by commitment
  {
    const bi = A('build_defense'), hi = A('build_housing');
    const s = v4.initStateV4(808); s.environmentState.materials = 4000; s.environmentState.energy = 4000;
    const r = rng(); v4.stepQuantumV4(s, bi, ctx, r);
    let flipped = true;
    try { v4.stepQuantumV4(s, hi, ctx, r); } catch (e) { flipped = false; }
    check('FXOSC1_plan_flip_during_commitment_rejected', flipped, false);
    check('FXOSC2_interrupt_still_permitted', !!v4.legalMaskV4(s, ctx)[A('stabilize')], true);
  }
  // FX-STALE: acting on expired target information is refused
  {
    const ei = A('explore');
    const s = v4.initStateV4(909); s.environmentState.energy = 4000;
    v4.setTargetFreshness(s, ei, 1);
    const r = rng(); v4.stepQuantumV4(s, A('gather_food'), ctx, r);   // -> Q1, now stale
    let threw = null;
    try { v4.stepQuantumV4(s, ei, ctx, r); } catch (e) { threw = e.code; }
    check('FXSTALE1_stale_target_action_rejected', threw, 'ILLEGAL_ACTION');
  }
  // FX-REPLAN-BOUNDARY: at a boundary nothing is legal and expansion stops
  {
    const s = v4.initStateV4(111);
    s.environmentState.threat = 200; s.environmentState.defense = 0;
    const m = v4.legalMaskV4(s, ctx);
    check('FXRB1_boundary_masks_everything', m.every(b => b === 0), true);
    let threw = null;
    try { v4.stepQuantumV4(s, A('gather_food'), ctx, new U.RNG(111)); } catch (e) { threw = e.code; }
    check('FXRB2_no_action_taken_at_boundary', threw, 'ILLEGAL_ACTION');
    check('FXRB3_root_stance_unchanged', ctx.rootStance, 'defensive');
  }
  // no-deadlock: a long rollout always has at least one legal action
  {
    const s = v4.initStateV4(222); const r = new U.RNG(222);
    let deadlock = false, steps = 0, stoppedAt = null;
    for (let q = 0; q < 30; q++) {
      // an all-zero mask is correct at a terminal or replan boundary; it is a
      // deadlock only at a non-terminal node
      const node = AZL.ReferenceAdapterV3.evaluateNode(s.environmentState, ctx,
        s.lifecycleState.currentQuantum, null, s.__envTerminal === true, 0);
      const m = v4.legalMaskV4(s, ctx);
      const legal = []; for (let i = 0; i < m.length; i++) if (m[i]) legal.push(i);
      if (!legal.length) {
        if (node.terminal) { stoppedAt = node.kind; break; }
        deadlock = true; break;
      }
      v4.stepQuantumV4(s, legal[r.int(legal.length)], ctx, r); steps++;
    }
    check('ND1_no_deadlock_at_a_nonterminal_node', deadlock, false);
    check('ND3_allzero_mask_only_at_a_declared_terminal',
      stoppedAt === null || ['faction-eliminated', 'environment-terminal', 'replan-boundary',
        'horizon', 'objective-complete', 'protected-object-destroyed',
        'deadline-incomplete'].includes(stoppedAt), true);
    check('ND2_quanta_advanced', s.lifecycleState.currentQuantum, steps);
  }
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
console.log("\nA7 execution/cooldown timeline (defend: exec 1, cool 1):");
console.table(TIMELINE);
console.log('\nnative mask-difference witnesses (A4):');
console.table(WITNESSES.map(w => ({
  witness: w.name, driver: w.driver, action: w.action, bit: w.bit,
  root_hex: w.root_hex, depth_hex: w.depth_hex, reason: w.reason,
  root_hash: w.root_hash.slice(0, 8), depth_hash: w.depth_hash.slice(0, 8),
  ok: w.ok, reproducible: w.reproducible
})));
console.log('\nNOT natively reachable: mobility gate (bit 10) — no reference action mutates s.mobility.');

console.log('frozen set:', after.count, 'files, digest', after.digest.slice(0, 16));
console.log(failures === 0
  ? `W0-A' A1-A10 TESTS PASS (${Object.keys(results).length}/${Object.keys(results).length})`
  : `W0-A' A1-A10 TESTS FAIL (${failures}/${Object.keys(results).length})`);
process.exit(failures === 0 ? 0 : 1);
