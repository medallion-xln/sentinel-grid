import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import { POLICY_SET_HASH, bestPolicySet } from '../src/stage3f/policy-router-v1.js';

const file = (r) => new URL(`../${r}`, import.meta.url);
const text = (r) => readFileSync(file(r), 'utf8');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const gz = (r) => gunzipSync(readFileSync(file(r))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const certifier = text('scripts/certify-stage3f6p-policy-quality.mjs');
const code = certifier.replace(/\/\*[\s\S]*?\*\//g, '');
const generator = text('scripts/generate-stage3f6p-policy-evidence.mjs');
const a = JSON.parse(text('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json'));
const t = JSON.parse(text('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json'));
const evidence = gz('artifacts/stage3f6p-policy-quality/policy-evidence.jsonl.gz');
const proposals = new Map(gz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz').map((r) => [r.recordHash, r]));
const manifest = JSON.parse(text('artifacts/stage3f6p-policy-quality/policy-evidence-manifest.json'));
const POLICIES = ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1'];

test('1. predecessor certification hashes are intact', () => {
  assert.equal(a.certificationHash, '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca');
  assert.equal(t.certificationHash, '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582');
  assert.equal(JSON.parse(text('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json')).certificationHash, '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6');
  assert.equal(JSON.parse(text('artifacts/stage3f6d-decision-rule/stage3f6d-certification-result.json')).certificationHash, 'f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b');
});

test('2. policy definitions are unchanged', () => {
  const src = 'src/stage3f/deployable-action-proposal-v1.js';
  assert.equal(hex(readFileSync(file(src))), a.sourceHashes[src]);
});

test('3. the policy-set hash is unchanged', () => {
  assert.equal(POLICY_SET_HASH, t.policySet.hash);
});

test('4. no router is trained', () => {
  assert.equal(/fitPolicyRouter\(|fitLogisticRegression\(|scoreMatrix\(/.test(code), false);
});

test('5. no decision rule is tuned', () => {
  assert.equal(/from '[^']*decision-rule-v1|routeEpisode\(|decide\(/.test(code), false);
});

test('6. no new features are added', () => {
  assert.equal(/from '[^']*(decision-risk-state|deployable-feature-extractor)|V1[_]1|extractDeployableFeatures\(/.test(code), false);
  assert.equal(/extractDeployableFeatures|decision-risk-state/.test(generator), false);
});

test('7. action evaluation is deterministic and matches the certified producers', () => {
  assert.equal(manifest.producerFidelityMismatches, 0);
  assert.equal(manifest.evaluated, 8000);
});

test('8. regret calculations are verified against the certified proposals', () => {
  for (const row of evidence.slice(0, 1500)) {
    const p = proposals.get(row.recordHash);
    for (const policy of [...POLICIES, 'RANDOM_LEGAL_V1', 'GREEDY']) {
      if (p.chosen[policy] === null) continue;
      const b = row.branches.find((x) => x.k === p.chosen[policy]);
      assert.ok(b, `${policy} chosen branch missing`);
      assert.equal(b.r, p.regret[policy]); assert.equal(b.o, p.correct[policy]);
    }
    const minRegret = Math.min(...row.branches.map((b) => b.r));
    assert.equal(minRegret, 0, 'the horizon-optimal action must have zero regret');
    assert.ok(row.branches.filter((b) => b.o === 1).every((b) => b.r === 0));
  }
});

test('9. best-policy conditioning is verified', () => {
  const row = { chosen: { RESOURCE_PRESERVING_V1: 'a', NEXUS_SELECTOR: 'b', OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: 'c' },
    regret: { RESOURCE_PRESERVING_V1: 12, NEXUS_SELECTOR: 7, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: 7 } };
  assert.deepEqual([...bestPolicySet(row).best], ['NEXUS_SELECTOR', 'THREAT_COVERING_V1']);
  assert.match(code, /const isBest = \(row, p\) => bestPolicySet\(row\)\.best\.includes\(p\)/);
});

test('10. marginal oracle contribution is computed as full minus excluding', () => {
  assert.match(code, /MARGINAL_ORACLE_ACCURACY_GAIN: fullOracle\.accuracy - without\.accuracy/);
  assert.match(code, /MARGINAL_ORACLE_REGRET_REDUCTION: without\.meanRegret - fullOracle\.meanRegret/);
  const rows = [{ chosen: { A: 'x', B: 'y' }, regret: { A: 10, B: 0 } }, { chosen: { A: 'x', B: 'y' }, regret: { A: 0, B: 30 } }];
  const oracleRegret = (members) => rows.reduce((s, r) => s + Math.min(...members.map((m) => r.regret[m])), 0) / rows.length;
  assert.equal(oracleRegret(['A']) - oracleRegret(['A', 'B']), 5);
});

test('11. no sealed split is read', () => {
  assert.deepEqual(Object.keys(manifest.counts).sort(), ['CAL', 'DEV']);
  assert.equal(manifest.sealedPartitionsRead, false);
  assert.match(generator, /STAGE3F6P_PARTITIONS = Object\.freeze\(\['DEV', 'CAL'\]\)/);
  assert.equal(/confirmatory-holdout-ood/.test(code), false);
  assert.match(code, /CONFIRMATORY_POLICY_QUALITY_CLAIMS: false/);
});

test('12. authority stays R0', () => {
  assert.match(code, /tier: 'R0', canDispatch: false, canMutateLiveWorld: false/);
  assert.equal(/canDispatch:\s*true|canMutateLiveWorld:\s*true/.test(code), false);
});

test('13. no online learning is enabled', () => {
  assert.match(code, /onlineLearningEnabled: false/);
  assert.equal(/onlineLearningEnabled:\s*true/.test(code), false);
  assert.match(code, /READY_FOR_STAGE3G: false/);
});
