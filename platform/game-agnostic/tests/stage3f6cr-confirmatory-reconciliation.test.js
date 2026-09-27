import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { AUTHORITY, CERT, CLAIM_MAP_PATH, CONTRACT_PATH, PLAN_PATH, PREDECESSOR_CHAIN, REVERIFICATION_PATH, allBindings, buildArtifacts, decisionEvaluationContract, lookup, verifyBinding }
  from '../scripts/stage3f6cr-plan.mjs';
import { CHECKS } from '../scripts/reproducibility/stage3f-chain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
const CLASSES = ['SURVIVES', 'PARTIALLY_SURVIVES', 'INVALIDATED', 'SUPERSEDED', 'NOT_RETESTABLE', 'INSUFFICIENT_EVIDENCE'];
const ERRATUM_CLASSES = ['RESOLVED', 'STILL_APPLIES', 'SUPERSEDED', 'INVALIDATED_BY_NEW_EVIDENCE'];
const planned = existsSync(at(REVERIFICATION_PATH));

test('claim map, plan and contract build deterministically and match the frozen files byte for byte', { skip: !planned && 'erratum re-verification not recorded' }, () => {
  const a = buildArtifacts();
  const b = buildArtifacts();
  assert.equal(serialise(a.plan), serialise(b.plan));
  assert.equal(serialise(a.claimMapDoc), serialise(b.claimMapDoc));
  assert.equal(serialise(a.contract), serialise(b.contract));
  for (const [f, v] of [[PLAN_PATH, a.plan], [CLAIM_MAP_PATH, a.claimMapDoc], [CONTRACT_PATH, a.contract]]) assert.equal(readFileSync(at(f), 'utf8'), serialise(v), f);
});

test('every evidence binding holds against the committed certificate it names', { skip: !planned && 'erratum re-verification not recorded' }, () => {
  const { plan, claimMapDoc } = buildArtifacts();
  const bindings = allBindings(plan, claimMapDoc);
  assert.ok(bindings.length >= 60);
  const failing = bindings.filter(({ binding }) => !verifyBinding(binding).holds).map(({ where }) => where);
  assert.deepEqual(failing, []);
});

test('a binding fails closed on a wrong value, a wrong path or a different certificate hash', () => {
  const doc = readJson(CERT.DSYM);
  const good = { certificate: CERT.DSYM, certificationHash: doc.certificationHash, path: '.authority.tier', expect: 'R0' };
  assert.equal(verifyBinding(good).holds, true);
  assert.equal(verifyBinding({ ...good, expect: 'R1' }).holds, false);
  assert.equal(verifyBinding({ ...good, path: '.authority.missing' }).holds, false);
  assert.equal(verifyBinding({ ...good, certificationHash: '0'.repeat(64) }).holds, false);
  assert.equal(verifyBinding(good, () => ({ ...doc, authority: { ...doc.authority, tier: 'R1' } })).holds, false);
  assert.equal(lookup({ a: [{ b: 1 }] }, '.a[0].b'), 1);
});

test('the canonical claim map classifies every claim once, with allowed classes and evidence', { skip: !planned && 'erratum re-verification not recorded' }, () => {
  const map = readJson(CLAIM_MAP_PATH);
  assert.deepEqual(map.classifications, CLASSES);
  const ids = map.claims.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of map.claims) {
    assert.ok(CLASSES.includes(c.classification), c.id);
    assert.ok(Array.isArray(c.evidence) ? c.evidence.length > 0 : typeof c.evidence === 'object', `${c.id} has evidence`);
  }
  const want = { RESOURCE_COMPETENCE: 'INVALIDATED', NEXUS_V1_COMPETENCE: 'SURVIVES', NEXUS_V2_COMPETENCE: 'PARTIALLY_SURVIVES', COMPLEMENTARITY_ROUTABILITY: 'INVALIDATED',
    HISTORICAL_RUNTIME_ROUTER_RELIABILITY: 'NOT_RETESTABLE', TRANSITION_PREDICTION_NEED: 'INVALIDATED', AUTHORITY: 'SURVIVES' };
  for (const [id, cls] of Object.entries(want)) assert.equal(map.claims.find((c) => c.id === id)?.classification, cls, id);
  const { claimMapHash, ...rest } = map;
  assert.equal(claimMapHash, hex(JSON.stringify(rest)));
});

test('the erratum is present, unmodified since it was recorded, and every claim in it is reconciled', { skip: !planned && 'erratum re-verification not recorded' }, () => {
  const plan = readJson(PLAN_PATH);
  const e = plan.erratumReconciliation;
  assert.equal(e.erratumId, 'STAGE3F6-ERRATUM-001');
  assert.equal(e.erratumModified, false);
  assert.equal(e.erratumSha256, hex(readFileSync(at(CERT.ERRATUM))));
  const g = spawnSync('git', ['-C', top, 'log', '--format=%H', '--', `platform/game-agnostic/${CERT.ERRATUM}`], { encoding: 'utf8' });
  assert.equal(g.stdout.trim().split('\n').filter(Boolean).length, 1, 'erratum file touched by exactly one commit');
  for (const c of e.claims) assert.ok(ERRATUM_CLASSES.includes(c.classification), c.id);
  assert.equal(e.reverification.sha256, hex(readFileSync(at(REVERIFICATION_PATH))));
  const r = readJson(REVERIFICATION_PATH).findings;
  assert.equal(r.NOT_REPRODUCIBLE_AT_HEAD, true);
  assert.equal(r.MEASUREMENTS_FAITHFUL_TO_PRE_REMEDIATION_RUNTIME, true);
  for (const f of Object.values(e.provenanceFindings)) assert.equal(f.reconfirmed, true);
});

test('Decision Evaluation Contract v1: specification only, five metrics, decision value ranks, hash binds content', () => {
  const c = decisionEvaluationContract();
  assert.equal(c.contractId, 'SENTINEL_DECISION_EVALUATION_CONTRACT_V1');
  assert.equal(c.status, 'SPECIFICATION_ONLY');
  assert.equal(c.implementsWorldModel, false);
  assert.equal(c.canonicalRule, 'LOWER FACTUAL PREDICTION LOSS DOES NOT IMPLY BETTER DECISION VALUE.');
  assert.deepEqual(Object.keys(c.metrics), ['FPE', 'CAD', 'CR', 'DDV', 'TCA']);
  assert.match(c.tournamentRule, /No learned world model may win the Stage 3I tournament solely because it has the lowest reconstruction, latent, or next-state prediction loss/);
  assert.match(c.tournamentRule, /FPE and CAD are reported diagnostics and never decide a ranking/);
  const { contractHash, ...rest } = c;
  assert.equal(contractHash, hex(JSON.stringify(rest)));
  assert.notEqual(hex(JSON.stringify({ ...rest, canonicalRule: `${rest.canonicalRule} ` })), contractHash);
  assert.deepEqual(c.authority, AUTHORITY);
});

test('Stage 3G inheritance excludes what Stage 3F does not support', { skip: !planned && 'erratum re-verification not recorded' }, () => {
  const { inheritedRequirements: r } = readJson(PLAN_PATH);
  const ids = r.requirements.map((q) => q.id);
  for (const forbidden of ['LARGE_LEARNED_WORLD_MODEL', 'JEPA_DEPLOYMENT', 'GENERATIVE_WORLD_MODEL', 'ROUTER_2_0', 'EXPERT_10', 'AUTHORITY_INCREASE']) {
    assert.ok(!ids.includes(forbidden), forbidden);
    assert.ok(forbidden in r.notEvidenceSupported, forbidden);
  }
  assert.equal(r.adoptedBy3G, false);
  assert.equal(r.requirements.find((q) => q.id === 'EPISTEMIC_PROVENANCE').status, 'REQUIRED_PRINCIPLE_LEVELS_UNDEFINED');
  assert.equal(r.requirements.find((q) => q.id === 'WORLD_MODEL_TRUST_GATE').status, 'PLANNED');
});

test('predecessor chain is the reproducible symmetric chain and authority stays R0', { skip: !planned && 'erratum re-verification not recorded' }, () => {
  const ids = CHECKS.map((c) => c.id);
  for (const p of PREDECESSOR_CHAIN) assert.ok(ids.includes(p), p);
  assert.deepEqual(AUTHORITY, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  const plan = readJson(PLAN_PATH);
  assert.deepEqual(plan.authority, AUTHORITY);
  assert.equal(plan.measurementStage, false);
});

test('the certificate, when present, never marks Stage 3G ready and keeps R0', () => {
  const f = 'artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-certification-result.json';
  if (!existsSync(at(f))) return;
  const c = readJson(f);
  assert.equal(c.conclusion.READY_FOR_STAGE3G, false);
  assert.deepEqual(c.authority, AUTHORITY);
  const { certificationHash, ...rest } = c;
  assert.equal(certificationHash, hex(JSON.stringify(rest)));
});

test('reconciliation sources contain no nondeterminism and no world-model code', () => {
  for (const f of ['scripts/stage3f6cr-plan.mjs', 'scripts/certify-stage3f6cr-confirmatory-reconciliation.mjs']) {
    const s = readFileSync(at(f), 'utf8');
    assert.doesNotMatch(s, /Math\.random|Date\.now|new Date\(|performance\.now/, f);
  }
});
