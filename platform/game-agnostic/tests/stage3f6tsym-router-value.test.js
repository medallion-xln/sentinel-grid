import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGE3F6TSYM_FEATURE_SET, STAGE3F6TSYM_FEATURE_SET_HASH, STAGE3F6TSYM_PLAN, STAGE3F6TSYM_PLAN_HASH, STAGE3F6TSYM_PLAN_PATH } from '../scripts/stage3f6tsym-analysis-plan.mjs';
import { FRESH_SPEC, OPEN_REPORT_PATH, freshGate, seedAudit } from '../scripts/generate-stage3f6tsym-confirmatory.mjs';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { DeployableProfile, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES } from '../src/stage3f/deployable-feature-contract-v1.js';
import { POLICY_SET_HASH, ROUTED_POLICIES, STAGE3F6T_METHODOLOGY, fitPolicyRouter, policyRouterHash } from '../src/stage3f/policy-router-v1.js';
import {
  atThreshold, aurocOf, averagePrecision, brier, ece10, f1Threshold, fitBinaryLogistic, identifiability, materiality, predictBinary, routerConclusion, specialistValue,
} from '../src/stage3f/router-value-v1.js';
import { sha256 } from '../src/core/determinism.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const json = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const corpus = readCorpus();

const diff = (o) => ({ accuracyDifference: 0, accuracyCi95: [-0.01, 0.01], regretDifference: 0, regretCi95: [-1, 1], normalizedRegretDifference: 0, normalizedRegretCi95: [-0.01, 0.01], ...o });

test('1. plan and feature-set hashes are deterministic and bound to the frozen plan file', () => {
  assert.equal(sha256(STAGE3F6TSYM_PLAN), STAGE3F6TSYM_PLAN_HASH);
  assert.equal(sha256(STAGE3F6TSYM_FEATURE_SET), STAGE3F6TSYM_FEATURE_SET_HASH);
  const file = json(STAGE3F6TSYM_PLAN_PATH);
  assert.equal(file.planHash, STAGE3F6TSYM_PLAN_HASH);
  assert.equal(file.featureSetHash, STAGE3F6TSYM_FEATURE_SET_HASH);
});

test('2. the feature set is exactly the historical Stage 3F.6-T router input and the policy set is unchanged', () => {
  assert.deepEqual(STAGE3F6TSYM_FEATURE_SET.featureIds, [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort());
  assert.equal(STAGE3F6TSYM_FEATURE_SET.contract.hash, DEPLOYABLE_FEATURE_CONTRACT_HASH);
  const historical = json('artifacts/stage3f6t-policy-router/stage3f6t-evaluation-freeze.json');
  assert.deepEqual(historical.weights.featureKeys, STAGE3F6TSYM_FEATURE_SET.featureIds);
  assert.equal(POLICY_SET_HASH, STAGE3F6TSYM_PLAN.policySet.stage3f6tPolicySetHash);
  assert.deepEqual(STAGE3F6TSYM_PLAN.router.methodology, STAGE3F6T_METHODOLOGY);
});

test('3. the corpus and predecessor certificates are hash-bound', () => {
  assert.equal(json('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').contentHash, STAGE3F6TSYM_PLAN.predecessors.corpusContentHash);
  assert.equal(json('artifacts/stage3f6p1e-policy-requalification/stage3f6p1e-certification-result.json').certificationHash, STAGE3F6TSYM_PLAN.predecessors.stage3f6p1eCertification);
  assert.equal(json('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json').certificationHash, STAGE3F6TSYM_PLAN.predecessors.historicalStage3f6tCertification);
});

test('4. the open-phase report is bound to the plan, scores no sealed row, and uses only deployable features', () => {
  const open = json(OPEN_REPORT_PATH);
  assert.equal(open.planHash, STAGE3F6TSYM_PLAN_HASH);
  assert.equal(open.featureSetHash, STAGE3F6TSYM_FEATURE_SET_HASH);
  assert.deepEqual(open.partitions, ['DEV', 'CAL']);
  assert.equal(open.noSealedRowScored, true);
  assert.equal(open.router.deterministic, true);
  assert.deepEqual(open.headlineFeatures, STAGE3F6TSYM_FEATURE_SET.featureIds);
  const { reportHash, ...body } = open;
  assert.equal(hex(JSON.stringify(body)), reportHash);
});

test('5. the fresh-partition gate opens only on a committed plan; the fresh seeds are declared and unused', () => {
  assert.deepEqual(freshGate(), []);
  for (const s of Object.values(seedAudit(corpus))) { assert.equal(s.declaredForPartition, true); assert.equal(s.usedByLineage, false); assert.equal(s.inPriorConsumed, false); }
  assert.deepEqual(Object.keys(FRESH_SPEC), ['FRESH_HOLDOUT', 'FRESH_OOD']);
});

test('6. router training is deterministic (same DEV rows -> same router hash)', () => {
  const rows = corpus.filter((r) => r.partition === 'DEV').slice(0, 300).map((r) => {
    const chosen = { RESOURCE_PRESERVING_V1: r.policies.RESOURCE_PRESERVING_V1, NEXUS_SELECTOR: r.policies.NEXUS_SELECTOR_V1,
      OBJECTIVE_TARGETING_V1: r.policies.OBJECTIVE_TARGETING_V1, THREAT_COVERING_V1: r.policies.THREAT_COVERING_V1 };
    const regret = Object.fromEntries(Object.entries(chosen).filter(([, k]) => k !== null).map(([p, k]) => [p, r.actions[k].r]));
    return { core: r.core, chosen, regret };
  });
  const a = fitPolicyRouter(rows, STAGE3F6TSYM_FEATURE_SET.featureIds, { iterations: 50 });
  const b = fitPolicyRouter(rows, STAGE3F6TSYM_FEATURE_SET.featureIds, { iterations: 50 });
  assert.equal(policyRouterHash(a), policyRouterHash(b));
  assert.deepEqual(a.policies, ROUTED_POLICIES);
});

test('7. binary logistic regression is deterministic and learns a separable signal', () => {
  const X = Array.from({ length: 200 }, (_, i) => [i % 2, (i * 7) % 5]);
  const y = X.map((x) => x[0]);
  const m1 = fitBinaryLogistic(X, y, { iterations: 300 }); const m2 = fitBinaryLogistic(X, y, { iterations: 300 });
  assert.deepEqual(m1, m2);
  const p = X.map((x) => predictBinary(m1, x));
  assert.equal(aurocOf(p, y), 1);
});

test('8. discrimination and calibration metrics match hand-computed values', () => {
  assert.equal(aurocOf([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(aurocOf([0.5, 0.5], [0, 1]), 0.5);
  assert.equal(aurocOf([0.1, 0.2], [1, 1]), null);
  assert.ok(Math.abs(averagePrecision([0.9, 0.8, 0.7, 0.6], [1, 0, 1, 0]) - (1 + 2 / 3) / 2) < 1e-12);
  assert.equal(brier([1, 0], [1, 0]), 0);
  assert.ok(Math.abs(ece10([0.95, 0.05], [1, 0]) - 0.05) < 1e-12);
  const s = atThreshold([0.9, 0.6, 0.2], [1, 0, 1], 0.5);
  assert.equal(s.precision, 0.5); assert.equal(s.recall, 0.5);
  assert.equal(f1Threshold([0.9, 0.1], [1, 0]).f1, 1);
});

test('9. materiality: statistical significance alone is not material; the historical raw rule is reported separately', () => {
  assert.equal(materiality(diff({ accuracyDifference: 0.01, accuracyCi95: [0.005, 0.015] })).MATERIAL, false);
  assert.equal(materiality(diff({ accuracyDifference: 0.01, accuracyCi95: [0.005, 0.015] })).statisticallyBetter, true);
  assert.equal(materiality(diff({ accuracyDifference: 0.03, accuracyCi95: [0.01, 0.05] })).MATERIAL, true);
  assert.equal(materiality(diff({ normalizedRegretDifference: -0.03, normalizedRegretCi95: [-0.04, -0.02] })).MATERIAL, true);
  const raw = materiality(diff({ regretDifference: -3, regretCi95: [-4, -2] }));
  assert.equal(raw.MATERIAL, false); assert.equal(raw.HISTORICAL_RAW_RULE_MATERIAL, true);
  assert.equal(materiality(diff({ accuracyDifference: -0.02, accuracyCi95: [-0.03, -0.01] })).ACCURACY_WORSE, true);
  const mixed = materiality(diff({ accuracyDifference: -0.05, accuracyCi95: [-0.06, -0.04], normalizedRegretDifference: -0.05, normalizedRegretCi95: [-0.06, -0.04] }));
  assert.equal(mixed.MATERIAL, false, 'a regret win bought with significantly worse accuracy is not material');
  assert.equal(mixed.MIXED_ACCURACY_REGRET_TRADEOFF, true); assert.equal(mixed.statisticallyBetter, false);
});

test('10. conclusion precedence: confirmed needs every condition; collapse and insufficiency win when they hold', () => {
  const good = { holdoutN: 6000, vsBestSingle: materiality(diff({ accuracyDifference: 0.05, accuracyCi95: [0.03, 0.07] })),
    vsCascadeHeadline: materiality(diff({ accuracyDifference: 0.03, accuracyCi95: [0.01, 0.05] })), oodNotWorse: true, collapse: false, harmAcceptable: true,
    costlyIdentifiability: 'REGIME_IDENTIFIABLE', nexusIdentifiability: 'REGIME_IDENTIFIABLE', headroomLower: 0.1, headroomCapturedAccuracy: 0.4 };
  assert.equal(routerConclusion(good).primary, 'ROUTER_VALUE_CONFIRMED');
  assert.equal(routerConclusion({ ...good, holdoutN: 100 }).primary, 'INSUFFICIENT_EVIDENCE');
  assert.equal(routerConclusion({ ...good, vsCascadeHeadline: materiality(diff({})) }).primary, 'ROUTER_VALUE_SMALL');
  const none = { ...good, vsBestSingle: materiality(diff({})), vsCascadeHeadline: materiality(diff({})) };
  assert.equal(routerConclusion({ ...none, collapse: true }).primary, 'ROUTER_COLLAPSES_TO_SINGLE_POLICY');
  assert.equal(routerConclusion({ ...none, costlyIdentifiability: 'NOT_IDENTIFIABLE', nexusIdentifiability: 'NOT_IDENTIFIABLE' }).primary, 'DEPLOYABLE_FEATURES_INSUFFICIENT');
  assert.equal(routerConclusion({ ...none, headroomCapturedAccuracy: 0.05 }).primary, 'EXPERT_COMPLEMENTARITY_NOT_ROUTABLE');
  assert.equal(routerConclusion({ ...none, headroomLower: 0.01 }).primary, 'ROUTER_VALUE_NOT_MATERIAL');
  assert.ok(routerConclusion({ ...none, collapse: true }).secondary.includes('ROUTER_VALUE_NOT_MATERIAL'));
  assert.equal(identifiability(0.8), 'REGIME_IDENTIFIABLE'); assert.equal(identifiability(0.7), 'WEAKLY_IDENTIFIABLE'); assert.equal(identifiability(0.6), 'NOT_IDENTIFIABLE');
});

test('11. specialist value separates benefit saved from false-selection harm (mutation-sensitive)', () => {
  const row = (rRes, rS) => ({ chosen: { R: 'a', S: 'b' }, regret: { R: rRes, S: rS }, maxRegret: 10 });
  const rows = [row(10, 0), row(0, 4), row(5, 5), row(3, 3)];
  const nrm = (r, p) => r.regret[p] / r.maxRegret;
  const v = specialistValue(rows, (r) => (r.regret.R === 3 ? 'R' : 'S'), { reference: 'R', specialists: ['S'], normalized: nrm }).S;
  assert.equal(v.selectedN, 3); assert.equal(v.improvedN, 1); assert.equal(v.worsenedN, 1);
  assert.equal(v.BENEFIT_SAVED, 10 / 4); assert.equal(v.FALSE_SELECTION_HARM, 4 / 4); assert.equal(v.benefitExceedsHarm, true);
  const mutated = specialistValue([row(10, 0), row(0, 40)], () => 'S', { reference: 'R', specialists: ['S'], normalized: nrm }).S;
  assert.equal(mutated.benefitExceedsHarm, false);
});

test('12. no hidden temporary paths, no larger model, R0 intact', () => {
  for (const f of ['scripts/stage3f6tsym-analysis-plan.mjs', 'scripts/generate-stage3f6tsym-confirmatory.mjs', 'scripts/certify-stage3f6tsym-router-value.mjs', 'src/stage3f/router-value-v1.js']) {
    const s = readFileSync(at(f), 'utf8');
    assert.ok(!/\/tmp\/|\/private\/|tmpdir\(|scratchpad/.test(s), f);
    assert.ok(!/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(s), f);
  }
  assert.deepEqual(STAGE3F6TSYM_PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
});

test('13. plan amendment 001 is additive: every field of the original freeze is unchanged', () => {
  const g = spawnSync('git', ['-C', path.resolve(root, '..', '..'), 'show', `8bcff515ffc4371078849ae0a9e212e1261aaf05:platform/game-agnostic/${STAGE3F6TSYM_PLAN_PATH}`], { encoding: 'utf8' });
  assert.equal(g.status, 0);
  const original = JSON.parse(g.stdout);
  assert.equal(original.planHash, '642336d950dcc01ae61c94104eaefead041d67d81ec29b72e64d984c71d0cb79');
  const current = json(STAGE3F6TSYM_PLAN_PATH);
  const strip = (p) => { const c = structuredClone(p); delete c.planHash; delete c.amendments; delete c.roadmap.EXPERT_COMPLEMENTARITY_EXISTS; delete c.roadmap.POLICY_QUALITY_REMAINS_PRIMARY_BOTTLENECK; return c; };
  assert.deepEqual(strip(current), strip(original));
  assert.equal(current.amendments.length, 1);
  assert.equal(current.amendments[0].id, 'STAGE3F6TSYM-PLAN-AMENDMENT-001');
  const open = json(OPEN_REPORT_PATH);
  for (const p of ['DEV', 'CAL']) {
    const s = open.descriptive[p].ROUTER_SELECTION;
    assert.ok(Math.abs(Object.values(s.selectionDistribution).reduce((a, b) => a + b, 0) - 1) < 1e-5);
    assert.ok(Math.abs(s.routedShare + s.abstainedShare - 1) < 1e-9);
  }
});

test('14. specialist value counts correct (best-set) and false selections when a best-set oracle is supplied', () => {
  const row = (rRes, rS, best) => ({ chosen: { R: 'a', S: 'b' }, regret: { R: rRes, S: rS }, maxRegret: 10, best });
  const rows = [row(10, 0, ['S']), row(0, 4, ['R']), row(5, 5, ['R', 'S'])];
  const nrm = (r, p) => r.regret[p] / r.maxRegret;
  const v = specialistValue(rows, () => 'S', { reference: 'R', specialists: ['S'], normalized: nrm, inBest: (r, p) => r.best.includes(p) }).S;
  assert.equal(v.correctSelectionsN, 2); assert.equal(v.falseSelectionsN, 1);
  assert.equal(specialistValue(rows, () => 'S', { reference: 'R', specialists: ['S'], normalized: nrm }).S.correctSelectionsN, undefined);
});
