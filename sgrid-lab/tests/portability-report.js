#!/usr/bin/env node
/* portability-report.js — cross-machine reproduction surface for W0-G + W0-S.
 *
 * Emits a single canonical JSON document whose SHA-256 is the one value that has
 * to match between machines. Run on each platform and compare:
 *
 *     node tests/portability-report.js > /tmp/report-<platform>.json
 *     node tests/portability-report.js --digest        # just the digest
 *
 * Writes nothing anywhere. Reads frozen evidence but never opens it for write.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const ENG = path.join(ROOT, 'public_html', 'azl');
const MODULES = ['azl-config.js', 'azl-util.js', 'azl-state.js', 'azl-nn.js', 'azl-scout.js',
  'azl-strategist.js', 'azl-oracle.js', 'azl-relational.js', 'azl-mcts.js', 'azl-router.js',
  'azl-weights.js', 'azl-federated.js', 'azl-eval.js', 'azl-ref-adapter-v2.js'];
MODULES.forEach(f => require(path.join(ENG, f)));
require(path.join(ENG, 'azl-ref-adapter-v3.js'));

const AZL = globalThis.AZL, U = AZL.Util, v2 = AZL.ReferenceAdapter, v3 = AZL.ReferenceAdapterV3;
const CJ = require('../governance/canonical-json');
const WR = require('../governance/witness-root');
const G = require('../governance/verify-governance');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const FROZEN = path.join(ROOT, 'sgrid-lab/results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN, 'portability-report.js');

/* ---- 1. governance surface ---- */
const doctrineText = fs.readFileSync(path.join(ROOT, G.DOCTRINE_FILE), 'utf8');
const governance = {
  doctrine_sha256: CJ.hashFileBytes(fs.readFileSync(path.join(ROOT, G.DOCTRINE_FILE))),
  doctrine_effective_at: G.parseDoctrineEffectiveAt(doctrineText).value,
  stage1a_manifest_sha256: CJ.hashFileBytes(fs.readFileSync(path.join(FROZEN, 'certification.json')))
};
const wr = WR.witnessRoot(FROZEN);
governance.witness_root_hash = wr.witness_root_hash;
governance.witness_count = wr.witness_count;
governance.record_stream_bytes = wr.record_stream_bytes;

/* ---- 2. search context surface ---- */
const ctx = v3.createSearchContext();
const canonical = v3.contextCanonical(ctx);
const searchContext = {
  canonical: canonical,
  context_hash_fnv1a64x2: v3.contextHash(ctx),
  context_hash_sha256: sha(Buffer.from(canonical, 'utf8')),
  transition_budget_96x40: v3.transitionBudget(ctx, 96)
};

/* ---- 3. fixed-quantum deltas per action ---- */
const quantum = {};
for (let a = 0; a < v3.actions.length; a++) {
  const s = v2.sim.init(4242), t0 = v2.sim.tick(s);
  const r = v3.stepQuantum(s, a, ctx, new U.RNG(4242));
  quantum[v3.actions[a].key || String(a)] = r.envTerminal ? 'terminal' : (v2.sim.tick(r.state) - t0);
}

/* ---- 4. forced replan boundary ---- */
const bs = v2.sim.init(7); bs.threat = 200; bs.defense = 0;
const bn = v3.evaluateNode(bs, ctx, 3, null, false, 0);
const boundary = {
  kind: bn.kind, requiresReplan: bn.requiresReplan, predictedNextStance: bn.predictedNextStance,
  reason: bn.reason, transitionBonus: bn.transitionBonus, value: bn.value
};

/* ---- 5. leaf identity ---- */
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/leaf-registry.json'), 'utf8'));
const leaf = {
  leaf_version: reg.leaves[0].leaf_version,
  content_hash: reg.leaves[0].content_hash,
  module_sha256: reg.leaves[0].implementation.module_sha256,
  dependency_hashes: reg.leaves[0].implementation.dependency_hashes,
  closure_verifies: G.verifyLeafClosure(reg, ENG).pass
};

/* ---- 6. legacy 200-step health trace ---- */
const trace = [];
{
  const r = new U.RNG(31337), s = v2.sim.init(31337);
  for (let i = 0; i < 200; i++) { v2.sim.step(s, i % v2.actions.length, r); trace.push(v2.sim.health(s)); }
}
const legacy = { trace_sha256: sha(Buffer.from(JSON.stringify(trace))), samples: trace.length };

/* ---- 7. scaffold sweep ---- */
const sweep = [];
for (const th of [0.05, 0.10, 0.20, 0.40, 0.72]) {
  const c = v3.createSearchContext({ syntheticThreshold: th });
  let hit = 0;
  for (let i = 0; i < 40; i++) {
    const r = new U.RNG(1000 + i); let st = v2.sim.init(1000 + i), q = 0, eT = false, eV = 0, n;
    const m = new Uint8Array(v3.actions.length);
    for (;;) {
      n = v3.evaluateNode(st, c, q, null, eT, eV);
      if (n.terminal) break;
      v3.legalMask(st, c, m);
      const legal = []; for (let k = 0; k < m.length; k++) if (m[k]) legal.push(k);
      const res = v3.stepQuantum(st, legal[r.int(legal.length)], c, r);
      st = res.state; eT = res.envTerminal; eV = res.envTerminalValue; q++;
    }
    if (n.kind === 'replan-boundary') hit++;
  }
  sweep.push({ synthetic_threshold: th, boundary_rollouts: hit });
}

/* ---- assemble ---- */
const report = { report_version: 1, governance, searchContext, quantum, boundary, leaf, legacy, sweep };
const canonicalReport = CJ.canonicalize(report);
const digest = sha(Buffer.from(canonicalReport, 'utf8'));

const platform = {
  _not_compared: true,
  node: process.version, platform: process.platform, arch: process.arch,
  endianness: os.endianness()
};

if (process.argv.includes('--digest')) {
  console.log(digest);
} else {
  console.log(JSON.stringify({ portability_digest: digest, platform, report }, null, 2));
}
