#!/usr/bin/env node
/* w0a-portability-report.js — canonical W0-A' portability identity.
 *
 *     node tests/w0a-portability-report.js            full canonical record
 *     node tests/w0a-portability-report.js --digest   the one value to compare
 *
 * NON-CIRCULARITY: this report never reads docs/governance/w0a-action-legality-manifest.json.
 * The relationship is implementation + registry + witnesses + frozen dependencies -> digest,
 * and then digest -> recorded inside the manifest. Asserted by a check in the W0-A' suite.
 *
 * Writes nothing. Reads frozen evidence but never opens it for write.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const ENG = path.join(ROOT, 'public_html', 'azl');
const FROZEN = path.join(ROOT, 'sgrid-lab/results-v2.1/scenario-certification');

const PF = require('./_preflight');
PF.requireFrozen(FROZEN, 'w0a-portability-report.js');
const REG_PATH = path.join(ROOT, 'docs/governance/action-lifecycle-registry.json');
PF.requireFile(REG_PATH, 'w0a-portability-report.js', {
  ships_in: 'w0a-prime-a1-a10/docs/governance/action-lifecycle-registry.json',
  fix: 'copy ALL THREE directories from w0a-prime-a1-a10'
});

const MODULES = ['azl-config.js', 'azl-util.js', 'azl-state.js', 'azl-nn.js', 'azl-scout.js',
  'azl-strategist.js', 'azl-oracle.js', 'azl-relational.js', 'azl-mcts.js', 'azl-router.js',
  'azl-weights.js', 'azl-federated.js', 'azl-eval.js', 'azl-ref-adapter-v2.js'];
MODULES.forEach(f => require(path.join(ENG, f)));
require(path.join(ENG, 'azl-ref-adapter-v3.js'));
require(path.join(ENG, 'azl-ref-adapter-v4.js'));

const AZL = globalThis.AZL, U = AZL.Util, v2 = AZL.ReferenceAdapter,
      v3 = AZL.ReferenceAdapterV3, v4 = AZL.ReferenceAdapterV4;
const CJ = require('../governance/canonical-json');
const WR = require('../governance/witness-root');
const G = require('../governance/verify-governance');

const REG = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
v4.setLifecycleRegistry(REG);
const ctx = v4.createSearchContext();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const fileSha = p => sha(fs.readFileSync(p));
const A = k => v2.actions.findIndex(x => x.key === k);

/* ---- 1. W0-A' implementation artifacts ---- */
const implementation = {
  'docs/governance/action-lifecycle-registry.json': fileSha(REG_PATH),
  'public_html/azl/azl-ref-adapter-v4.js': fileSha(path.join(ENG, 'azl-ref-adapter-v4.js')),
  'sgrid-lab/tests/w0a-action-legality.test.js': fileSha(path.join(HERE, 'w0a-action-legality.test.js')),
  'sgrid-lab/tests/_preflight.js': fileSha(path.join(HERE, '_preflight.js')),
  'sgrid-lab/tests/check-install.js': fileSha(path.join(HERE, 'check-install.js'))
};

/* ---- 2. frozen dependencies this artifact inherits ---- */
function frozenSetDigest() {
  const files = [];
  (function walk(d) { for (const n of fs.readdirSync(d).sort()) {
    const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(FROZEN);
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(path.relative(FROZEN, f)); h.update(fs.readFileSync(f)); }
  return { count: files.length, digest: h.digest('hex') };
}
const fsd = frozenSetDigest();
const wr = WR.witnessRoot(FROZEN);
const frozen_dependencies = {
  'azl-ref-adapter-v2.js': fileSha(path.join(ENG, 'azl-ref-adapter-v2.js')),
  'azl-ref-adapter-v3.js': fileSha(path.join(ENG, 'azl-ref-adapter-v3.js')),
  'w0s-search-semantics-manifest.json': fileSha(path.join(ROOT, 'docs/governance/w0s-search-semantics-manifest.json')),
  w0s_portability_digest: 'a54149dcce84cbc415c927a389947156a4ef467fe076a7892888301b90a12f7c',
  guardrails_v2_doctrine_hash: G.measuredDoctrineHash(ROOT),
  stage1a_witness_root: wr.witness_root_hash,
  stage1a_frozen_set_files: fsd.count,
  stage1a_frozen_set_digest: fsd.digest
};

/* ---- 3. semantic witnesses, recomputed here rather than quoted ---- */
const defendIdx = A('defend');
const execFixture = (() => {
  const s = v4.initStateV4(101);
  s.environmentState.energy = 400; s.environmentState.materials = 200;
  const rng = new U.RNG(101);
  const legal = [], execT = [], coolT = [];
  const snap = () => {
    legal.push(!!v4.legalMaskV4(s, ctx)[defendIdx]);
    execT.push(s.lifecycleState.currentQuantum === 0 ? null : s.lifecycleState.executionQuantaRemaining[defendIdx]);
    coolT.push(s.lifecycleState.currentQuantum === 0 ? null : s.lifecycleState.cooldownQuantaRemaining[defendIdx]);
  };
  snap();
  v4.stepQuantumV4(s, defendIdx, ctx, rng); snap();
  v4.stepQuantumV4(s, A('gather_food'), ctx, rng); snap();
  return {
    action: 'defend',
    execution_quanta: REG.actions[defendIdx].executionQuanta,
    cooldown_quanta: REG.actions[defendIdx].cooldownQuanta,
    legal_timeline: legal, execution_timeline: execT, cooldown_timeline: coolT
  };
})();

function nativeWitness(mutate, actionIdx, bit, seed) {
  const s = v4.initStateV4(seed); mutate(s.environmentState);
  const root = v4.nativeMaskRecord(s);
  const work = v4.cloneStateV4(s);
  v3.stepQuantum(work.environmentState, actionIdx, ctx, new U.RNG(seed));
  const depth = v4.nativeMaskRecord(work);
  return {
    action: v2.actions[bit].key, bit,
    root_hex: root.bitset_hex, depth_hex: depth.bitset_hex,
    root_hash: root.mask_hash, depth_hash: depth.mask_hash,
    reason: depth.reasons[v2.actions[bit].key]
  };
}
const native_mask_witnesses = {
  materials_gate: nativeWitness(s => { s.materials = 12; }, A('build_defense'), A('build_defense'), 1),
  credits_gate: nativeWitness(s => { s.credits = 12; }, A('diplomacy_talks'), A('diplomacy_talks'), 2),
  energy_gate: nativeWitness(s => { s.energy = 12; s.infra = 0; }, A('defend'), A('defend'), 3),
  housing_gate: nativeWitness(s => { s.population = s.housing - 2; }, A('recruit'), A('recruit'), 4),
  trade_credits_gate: nativeWitness(s => { s.credits = 12; s.food = 20; s.energy = 20; s.materials = 20; },
    A('diplomacy_talks'), A('trade'), 5)
};

/* Mobility gate reachability, measured rather than asserted.
   s.mobility IS mutated every tick (azl-ref-adapter-v2.js line 128 recomputes it from
   threat, defense and constructionQ), so "no action changes mobility" is false. The
   question that matters is whether the gate (mobility < 0.2) ever fires at a quantum
   boundary. Measured by bounded deterministic random play. */
const mobilityProbe = (() => {
  let minMobility = 1, flips = 0, samples = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = v4.initStateV4(seed), r = new U.RNG(seed);
    let prev = v4.nativeMaskRecord(s).bits[10];
    for (let q = 0; q < 40; q++) {
      const m = v4.nativeMaskRecord(s).bits, legal = [];
      for (let i = 0; i < m.length; i++) if (m[i]) legal.push(i);
      if (!legal.length) break;
      v3.stepQuantum(s.environmentState, legal[r.int(legal.length)], ctx, r);
      samples++;
      if (s.environmentState.mobility < minMobility) minMobility = s.environmentState.mobility;
      const now = v4.nativeMaskRecord(s).bits[10];
      if (prev === 1 && now === 0 && s.environmentState.mobility < 0.2) flips++;
      prev = now;
      if (s.environmentState.population <= 0) break;
    }
  }
  return {
    mobility_is_mutated_every_tick: true,
    gate_threshold: 0.2,
    quantum_boundary_samples: samples,
    min_mobility_observed: minMobility,
    mobility_caused_flips: flips,
    gate_reachable_at_quantum_boundary: flips > 0 || minMobility < 0.2
  };
})();

const semantics = {
  lifecycle_registry_id: REG.registry_id,
  lifecycle_registry_status: REG.status,
  action_count: v2.actions.length,
  action_order: v2.actions.map(a => a.key),
  action_space_version: v4.actionSpaceVersion,
  mask_version: v4.maskVersion,
  state_schema_version: v4.stateSchemaVersion,
  execution_cooldown_fixture: execFixture,
  native_mask_witnesses,
  target_freshness_semantics: 'currentQuantum < freshUntilQuantumExclusive',
  resource_cost_timing: REG.resource_cost_timing,
  resource_cost_realization: REG.resource_cost_realization,
  declared_interrupts: REG.declared_interrupts,
  mask_precedence: [
    'terminal or replan boundary masks everything, evaluated first',
    'cooldown always masks and outranks commitment',
    'execution masks except the active plan',
    'commitment masks non-plan non-interrupt actions and resurrects nothing',
    'declared interrupts remain available as the escape path'
  ],
  mobility_gate_probe: mobilityProbe,
  w0a_test_count: 118
};

const report = { report_version: 1, artifact: 'w0a-reference-action-legality',
  implementation, frozen_dependencies, semantics };
const canonical = CJ.canonicalize(report);
const digest = sha(Buffer.from(canonical, 'utf8'));

const platform = { _not_compared: true, node: process.version, platform: process.platform,
  arch: process.arch, endianness: os.endianness() };

if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ w0a_portability_digest: digest, platform, report }, null, 2));
