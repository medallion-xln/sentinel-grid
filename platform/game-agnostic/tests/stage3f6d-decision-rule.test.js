import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';

import { POLICY_SET_HASH, ROUTED_POLICIES, STAGE3F6T_METHODOLOGY, falseSelectionHarm, evaluateStrategy, policyRouterHash, scorePolicies } from '../src/stage3f/policy-router-v1.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile } from '../src/stage3f/deployable-feature-contract-v1.js';
import {
  DecisionRule, calibrateProbabilities, classWeightsFromDev, costMatrixHash, decide, expectedCosts, matrixFromDev, nexusCapture,
} from '../src/stage3f/decision-rule-v1.js';

const file = (r) => new URL(`../${r}`, import.meta.url);
const text = (r) => readFileSync(file(r), 'utf8');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const gz = (r) => gunzipSync(readFileSync(file(r))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const certifier = text('scripts/certify-stage3f6d-decision-rule.mjs');
const t = JSON.parse(text('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json'));
const tFreeze = JSON.parse(text('artifacts/stage3f6t-policy-router/stage3f6t-evaluation-freeze.json'));
const w = JSON.parse(text('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json'));
const s = JSON.parse(text('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'));
const corpus = gz('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const props = new Map(gz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz').map((r) => [r.recordHash, r]));
const dev = corpus.filter((r) => r.partition === 'DEV').map((r) => ({ ...r, ...props.get(r.recordHash) }));
const model = { family: STAGE3F6T_METHODOLOGY.routerFamily, policies: ROUTED_POLICIES, featureKeys: tFreeze.weights.featureKeys, mu: tFreeze.weights.mu, sd: tFreeze.weights.sd, W: tFreeze.weights.W };
const ep = (regret, core = {}) => ({ core, chosen: Object.fromEntries(Object.entries(regret).map(([k, v]) => [k, v === null ? null : `${k}-a`])),
  regret, correct: Object.fromEntries(Object.entries(regret).map(([k, v]) => [k, v === null ? null : (v === 0 ? 1 : 0)])) });
const PROBS = { RESOURCE_PRESERVING_V1: 0.6, NEXUS_SELECTOR: 0.4, OBJECTIVE_TARGETING_V1: 0, THREAT_COVERING_V1: 0 };

test('1. Stage 3F.6-T router inputs are unchanged', () => {
  assert.equal(policyRouterHash(model), tFreeze.routerHash);
  assert.equal(hex(readFileSync(file('src/stage3f/policy-router-v1.js'))), t.sourceHashes['src/stage3f/policy-router-v1.js']);
  assert.equal(t.certificationHash, '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582');
});

test('2. Stage 3F.6-W and the original feature contract are intact', () => {
  assert.equal(w.certificationHash, '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6');
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT_HASH, s.contract.hash);
  assert.equal(/import[^;]*decision-risk-state|V1_1|retreatOptionCount/.test(certifier), false, 'enriched V1_1 input must not enter the headline');
});

test('3. the primary feature count remains 30 CORE features', () => {
  assert.equal(model.featureKeys.length, 30);
  assert.deepEqual([...model.featureKeys], [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort());
});

test('4. the policy set is unchanged', () => {
  assert.equal(POLICY_SET_HASH, t.policySet.hash);
});

test('5. the cost matrix is derived from DEV only', () => {
  assert.match(certifier, /const matrix = matrixFromDev\(dev\)/);
  assert.equal(/matrixFromDev\((cal|holdout|ood)/.test(certifier), false);
});

test('6. class weights are derived from DEV only', () => {
  assert.match(certifier, /const classWeights = classWeightsFromDev\(dev\)/);
  const cw = classWeightsFromDev(dev);
  assert.ok(Math.abs(Object.values(cw.weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(cw.weights.NEXUS_SELECTOR > cw.weights.RESOURCE_PRESERVING_V1, 'minority class must receive the larger weight');
});

test('7. CAL is used only for bounded calibration constants and headline selection', () => {
  assert.match(certifier, /softCrossEntropy\(cal\.map/);
  assert.match(certifier, /evaluateStrategy\(cal, \(row\) => decision\(DecisionRule\.E_NEXUS_THRESHOLD/);
});

test('8. fresh HOLDOUT/OOD are sealed until the decision freeze exists', () => {
  assert.match(certifier, /SEALED_PARTITION_ACCESS_BEFORE_FREEZE/);
  const freezeAt = certifier.indexOf('decisionFreeze = { ...freezePayload');
  assert.ok(freezeAt > 0 && certifier.indexOf("sealedRows('HOLDOUT')") > freezeAt && certifier.indexOf("sealedRows('OOD')") > freezeAt);
});

test('9. fresh splits have zero prior topology overlap and a disjoint seed space', () => {
  const m = 'artifacts/stage3f6d-decision-rule/confirmatory-holdout-ood-manifest.json';
  assert.ok(existsSync(file(m)), 'run npm run stage3f6d:generate first');
  const manifest = JSON.parse(text(m));
  assert.deepEqual(manifest.overlapWithPriorDatasets, { topology: 0, record: 0, state: 0 });
  assert.equal(manifest.internalOverlap.HOLDOUT_OOD_topology, 0);
  for (const seed of [...manifest.spec.holdout.seeds, ...manifest.spec.ood.seeds]) assert.equal(manifest.spec.priorSeedSpaces.includes(seed), false);
  assert.equal(manifest.spec.priorDatasets.length, 2);
});

test('10. decisions are deterministic', () => {
  const args = { probabilities: PROBS, available: ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR'], classWeights: classWeightsFromDev(dev).weights,
    costMatrix: matrixFromDev(dev).cost, valueMatrix: matrixFromDev(dev).value, nexusThreshold: 0.35 };
  for (const rule of Object.values(DecisionRule)) assert.deepEqual(decide(rule, args), decide(rule, args));
});

test('11. the cost-matrix hash is deterministic', () => {
  assert.equal(costMatrixHash(matrixFromDev(dev)), costMatrixHash(matrixFromDev(dev)));
});

test('12. an unavailable policy can never be selected', () => {
  const matrix = matrixFromDev(dev);
  for (const rule of Object.values(DecisionRule)) {
    const d = decide(rule, { probabilities: { ...PROBS, NEXUS_SELECTOR: 0.99 }, available: ['RESOURCE_PRESERVING_V1'], classWeights: classWeightsFromDev(dev).weights,
      costMatrix: matrix.cost, valueMatrix: matrix.value, nexusThreshold: 0.1 });
    assert.equal(d.policy, 'RESOURCE_PRESERVING_V1', rule);
  }
});

test('13. abstention is preserved when no policy proposed an action', () => {
  const matrix = matrixFromDev(dev);
  for (const rule of Object.values(DecisionRule)) {
    const d = decide(rule, { probabilities: PROBS, available: [], classWeights: classWeightsFromDev(dev).weights, costMatrix: matrix.cost, valueMatrix: matrix.value, nexusThreshold: 0.3 });
    assert.equal(d.status, 'ABSTAIN'); assert.equal(d.policy, null);
  }
});

test('14. expected-cost calculations are exact', () => {
  const cost = Object.fromEntries(ROUTED_POLICIES.map((a) => [a, Object.fromEntries(ROUTED_POLICIES.map((b) => [b, 0]))]));
  cost.RESOURCE_PRESERVING_V1.NEXUS_SELECTOR = 50; cost.NEXUS_SELECTOR.RESOURCE_PRESERVING_V1 = 20;
  const ec = expectedCosts(PROBS, ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR'], cost);
  assert.equal(ec.RESOURCE_PRESERVING_V1, 0.4 * 50);
  assert.equal(ec.NEXUS_SELECTOR, 0.6 * 20);
  const d = decide(DecisionRule.C_EXPECTED_REGRET, { probabilities: PROBS, available: ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR'], costMatrix: cost, valueMatrix: cost, classWeights: {} });
  assert.equal(d.policy, 'NEXUS_SELECTOR', 'lower expected cost must win even when less probable');
  const cal = calibrateProbabilities(PROBS, ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR'], 1);
  assert.ok(Math.abs(cal.RESOURCE_PRESERVING_V1 - 0.6) < 1e-12);
});

test('15. NEXUS capture metrics are exact', () => {
  const rows = [
    ep({ RESOURCE_PRESERVING_V1: 30, NEXUS_SELECTOR: 0, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null }),
    ep({ RESOURCE_PRESERVING_V1: 0, NEXUS_SELECTOR: 12, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null }),
  ];
  const cap = nexusCapture(rows, () => 'NEXUS_SELECTOR');
  assert.equal(cap.NEXUS_BEST_N, 1); assert.equal(cap.NEXUS_CAPTURE_RATE, 1);
  assert.equal(cap.FALSE_NEXUS_SELECTION_N, 1);
  assert.equal(cap.REGRET_SAVED_FROM_NEXUS_CAPTURE, 30); assert.equal(cap.REGRET_ADDED_FROM_FALSE_NEXUS_SELECTION, 12);
});

test('16. false-selection harm is exact', () => {
  const rows = [ep({ RESOURCE_PRESERVING_V1: 40, NEXUS_SELECTOR: 5, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null })];
  const h = falseSelectionHarm(rows, () => 'RESOURCE_PRESERVING_V1');
  assert.equal(h.falseSelections, 1); assert.equal(h.meanAddedRegret, 35); assert.equal(h.worst, 35);
});

test('17. the always-RESOURCE comparison is the headline and is computed', () => {
  assert.match(certifier, /headlineComparison: 'DECISION_RULE vs ALWAYS_RESOURCE_PRESERVING_V1'/);
  assert.match(certifier, /pairedBootstrap\(rows, choose, \(\) => RESOURCE\)/);
  const rows = [ep({ RESOURCE_PRESERVING_V1: 10, NEXUS_SELECTOR: 0, OBJECTIVE_TARGETING_V1: null, THREAT_COVERING_V1: null })];
  assert.equal(evaluateStrategy(rows, () => 'RESOURCE_PRESERVING_V1').meanRegret, 10);
  assert.ok(scorePolicies(model, dev[0]).available.includes('RESOURCE_PRESERVING_V1'));
});

test('18. authority stays R0', () => {
  assert.match(certifier, /tier: 'R0', canDispatch: false, canMutateLiveWorld: false/);
  assert.equal(/canDispatch:\s*true|canMutateLiveWorld:\s*true/.test(certifier), false);
});

test('19. no online learning is enabled', () => {
  assert.match(certifier, /onlineLearningEnabled: false/);
  assert.equal(/onlineLearningEnabled:\s*true/.test(certifier), false);
});

test('20. nothing is promoted to the live runtime', () => {
  assert.match(certifier, /promotedToLiveRuntime: false/);
  assert.equal(/promotedToLiveRuntime:\s*true/.test(certifier), false);
  assert.equal(/fitPolicyRouter|fitLogisticRegression/.test(certifier), false, 'this stage must not retrain a router');
});
