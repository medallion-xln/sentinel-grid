import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE3F6P1E_OUT, STAGE3F6P1E_PLAN, STAGE3F6P1E_PLAN_HASH, STAGE3F6P1E_PLAN_PATH, STAGE3F6P1E_POLICY_SET, STAGE3F6P1E_POLICY_SET_HASH, STAGE3F6P1E_POLICY_SOURCES,
} from '../scripts/stage3f6p1e-analysis-plan.mjs';
import { DEPLOYABLE, OPEN_REPORT_PATH, evidenceFor, readCorpus, sealedGate } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import {
  auroc, bestSet, bootstrapMean, bootstrapPlan, calibration, cheapestClass, cheapestClassAccuracy, classifyPolicy, factorGap, normalizedRegret, pairedFlag,
  perfectSelector, quantile, resourceVerdict, uniformLegalAccuracy, wilson,
} from '../src/stage3f/policy-requalification-v1.js';
import { sha256 } from '../src/core/determinism.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const json = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const corpus = readCorpus();
const devRows = corpus.filter((r) => r.partition === 'DEV');

/* A synthetic episode: keys -> { t, c, r, o }. */
const row = (actions, choice = {}) => ({ actions, choice });
const A = { t: 'MOVE', c: 0, r: 0, o: 1, dir: 'EAST' }; const B = { t: 'MOVE', c: 0, r: 10, o: 0, dir: 'WEST' };
const C = { t: 'REPAIR', c: 2, r: 40, o: 0 }; const D = { t: 'PROTECT', c: 1, r: 0, o: 1 };
const pick = (r, p) => r.choice[p] ?? null;

test('1. the plan and policy-set hashes are deterministic and bound to the frozen plan file', () => {
  assert.equal(sha256(STAGE3F6P1E_PLAN), STAGE3F6P1E_PLAN_HASH);
  assert.equal(sha256(STAGE3F6P1E_POLICY_SET), STAGE3F6P1E_POLICY_SET_HASH);
  assert.equal(STAGE3F6P1E_PLAN.policySetHash, STAGE3F6P1E_POLICY_SET_HASH);
  const file = json(STAGE3F6P1E_PLAN_PATH);
  assert.equal(file.planHash, STAGE3F6P1E_PLAN_HASH);
  assert.equal(file.policySetHash, STAGE3F6P1E_POLICY_SET_HASH);
});

test('2. policy definitions are hash-bound: every policy source matches the frozen policy set', () => {
  for (const f of STAGE3F6P1E_POLICY_SOURCES) assert.equal(hex(readFileSync(at(f))), STAGE3F6P1E_POLICY_SET.sourceSha256[f], f);
  assert.deepEqual(DEPLOYABLE, STAGE3F6P1E_POLICY_SET.categories.DEPLOYABLE);
});

test('3. the corpus is bound by content hash to the plan and to the Stage 3F.6-P.1D certificate', () => {
  assert.equal(corpus.length, 20000);
  assert.equal(json('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').contentHash, STAGE3F6P1E_PLAN.corpus.contentHash);
  assert.equal(json('artifacts/stage3f6p1d-symmetric-corpus/stage3f6p1d-certification-result.json').certificationHash, STAGE3F6P1E_PLAN.corpus.stage3f6p1dCertification);
  assert.equal(json('artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json').certificationHash, STAGE3F6P1E_PLAN.corpus.stage3f6p1cCertification);
});

test('4. the open-phase report is bound to the plan and covers DEV and CAL only', () => {
  const open = json(OPEN_REPORT_PATH);
  assert.equal(open.planHash, STAGE3F6P1E_PLAN_HASH);
  assert.equal(open.policySetHash, STAGE3F6P1E_POLICY_SET_HASH);
  assert.deepEqual(open.partitions, ['DEV', 'CAL']);
  assert.equal(open.sealedEvidenceRead, false);
  assert.ok(!/HOLDOUT|OOD/.test(JSON.stringify(open.descriptive)));
  const { reportHash, ...body } = open;
  assert.equal(hex(JSON.stringify(body)), reportHash);
});

test('5. the sealed gate opens only when the plan and the open-phase report are committed unchanged', () => {
  assert.deepEqual(sealedGate(), []);
});

test('6. evidence replays deterministically and reproduces every stored choice (same inputs -> same evidence)', () => {
  for (const r of [devRows[0], devRows[1], devRows.find((x) => x.equivariance !== null)]) {
    const first = evidenceFor(r); const second = evidenceFor(r);
    assert.deepEqual(first, second);
    assert.equal(first.fidelity.world, 1); assert.equal(first.fidelity.surface, 1); assert.equal(first.fidelity.choices, 1);
    for (const p of DEPLOYABLE) {
      for (const k of [first.idReversed[p], ...first.idPermuted.map((x) => x[p])]) assert.ok(k === null || k in r.actions, `${p} relabelled choice must be a legal action`);
      assert.equal(first.idReversed[p] === null, first.policies[p].a === null, 'relabelling must never change abstention');
    }
    if (r.equivariance !== null) assert.equal(first.fidelity.twinMapping, 1);
  }
});

test('7. Wilson intervals and nearest-rank quantiles match known values', () => {
  const [lo, hi] = wilson(50, 100);
  assert.ok(Math.abs(lo - 0.4038) < 1e-3 && Math.abs(hi - 0.5962) < 1e-3);
  assert.equal(wilson(0, 0), null);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2);
  assert.equal(quantile([1, 2, 3, 4], 0.95), 4);
});

test('8. the bootstrap is deterministic, label-bound and paired', () => {
  const a = bootstrapPlan(50, 'X', 20); const b = bootstrapPlan(50, 'X', 20); const c = bootstrapPlan(50, 'Y', 20);
  assert.deepEqual([...a.indices], [...b.indices]);
  assert.notDeepEqual([...a.indices], [...c.indices]);
  const constant = bootstrapMean(a, new Array(50).fill(0.3));
  assert.ok(Math.abs(constant[0] - 0.3) < 1e-12 && Math.abs(constant[1] - 0.3) < 1e-12);
  const weights = Array.from({ length: 50 }, (_, i) => (i % 2 ? 1 : 0));
  const masked = bootstrapMean(a, Array.from({ length: 50 }, (_, i) => (i % 2 ? 1 : 99)), weights);
  assert.deepEqual(masked, [1, 1], 'weight-0 episodes never enter the statistic');
});

test('9. episode primitives: normalized regret, uniform and cheapest-class expectations', () => {
  const r = row({ a: A, b: B, c: C, d: D });
  assert.equal(normalizedRegret(r, 'c'), 1); assert.equal(normalizedRegret(r, 'b'), 0.25); assert.equal(normalizedRegret(r, 'a'), 0);
  assert.equal(uniformLegalAccuracy(r), 0.5);
  assert.deepEqual(cheapestClass(r).map((x) => x.key).sort(), ['a', 'b']);
  assert.equal(cheapestClassAccuracy(r), 0.5);
  assert.equal(cheapestClassAccuracy(row({ a: A, x: { t: 'SUBSTITUTE', c: null, r: 5, o: 0 } })), null, 'unknown declared cost -> not applicable');
  assert.equal(normalizedRegret(row({ a: A, d: D }), 'a'), 0, 'all-optimal surface has zero normalized regret');
});

test('10. mutation: changing one regret changes the metric that depends on it', () => {
  const base = row({ a: A, b: B, c: C, d: D });
  const mutated = row({ a: A, b: { ...B, r: 40 }, c: C, d: D });
  assert.notEqual(normalizedRegret(base, 'b'), normalizedRegret(mutated, 'b'));
  const flipped = row({ a: { ...A, o: 0, r: 5 }, b: B, c: C, d: D });
  assert.notEqual(uniformLegalAccuracy(base), uniformLegalAccuracy(flipped));
});

test('11. the perfect selector is never worse than any proposing member and falls back to the control', () => {
  const rows = [row({ a: A, b: B, c: C }, { P: 'b', Q: 'c', R: 'a' }), row({ a: A, b: B, c: C }, { P: null, Q: null, R: 'c' })];
  const o = perfectSelector(rows, ['P', 'Q'], pick, 'R');
  assert.equal(o[0].regret, 10); assert.equal(o[0].covered, true);
  assert.equal(o[1].key, 'c'); assert.equal(o[1].covered, false);
  const b = bestSet(row({ a: A, d: D }, { P: 'a', Q: 'd' }), ['P', 'Q'], pick);
  assert.deepEqual(b.best, ['P', 'Q'], 'zero-regret ties are kept');
});

test('12. factor and paired flags fire on a real gap and stay silent on noise', () => {
  assert.equal(factorGap({ x: { n: 500, accuracy: 0.30 }, y: { n: 500, accuracy: 0.31 } }).flag, false);
  assert.equal(factorGap({ x: { n: 500, accuracy: 0.20 }, y: { n: 500, accuracy: 0.45 } }).flag, true);
  assert.equal(factorGap({ x: { n: 50, accuracy: 0.0 }, y: { n: 500, accuracy: 0.9 } }).flag, false, 'levels under the minimum n do not count');
  assert.equal(pairedFlag(new Array(400).fill(0)).flag, false);
  assert.equal(pairedFlag(Array.from({ length: 400 }, (_, i) => (i % 4 === 0 ? 1 : 0))).flag, true);
});

test('13. the classification decision list: each rule is reachable and first match wins', () => {
  const base = { proposingN: 1000, nuisanceDependence: false, artifactExplains: false, marginalAccuracyGain: 0.1, marginalNormalizedRegretReduction: 0.1, aboveChance: true, accuracyWhenBest: 0.9 };
  assert.equal(classifyPolicy(base), 'KEEP');
  assert.equal(classifyPolicy({ ...base, proposingN: 199, nuisanceDependence: true }), 'INSUFFICIENT_EVIDENCE');
  assert.equal(classifyPolicy({ ...base, nuisanceDependence: true }), 'SHORTCUT_DEPENDENT');
  assert.equal(classifyPolicy({ ...base, artifactExplains: true }), 'SHORTCUT_DEPENDENT');
  assert.equal(classifyPolicy({ ...base, marginalAccuracyGain: 0.001, marginalNormalizedRegretReduction: 0.001 }), 'REDUNDANT');
  assert.equal(classifyPolicy({ ...base, accuracyWhenBest: 0.4 }), 'REDESIGN_CANDIDATE');
  assert.equal(classifyPolicy({ ...base, accuracyWhenBest: 0.6 }), 'WEAK_BUT_DISTINCT');
  assert.equal(classifyPolicy({ ...base, marginalAccuracyGain: 0.01 }), 'KEEP_BUT_LIMIT');
  assert.equal(classifyPolicy({ ...base, marginalAccuracyGain: 0.01, aboveChance: false }), 'REDESIGN_CANDIDATE');
  assert.equal(resourceVerdict({ costPriorExplains: true, reasoningBeyondCostPrior: false, nuisanceDependence: false }), 'ZERO_COST_PRIOR_ONLY');
  assert.equal(resourceVerdict({ costPriorExplains: false, reasoningBeyondCostPrior: true, nuisanceDependence: true }), 'GENUINE_RESOURCE_REASONING+ANOTHER_ARTIFACT');
  assert.equal(resourceVerdict({ costPriorExplains: false, reasoningBeyondCostPrior: false, nuisanceDependence: false }), 'MIXED');
});

test('14. calibration: ECE is zero for perfectly calibrated bins and AUROC orders correctly', () => {
  const pairs = [...new Array(10).fill({ confidence: 0.9, correct: 1 }), { confidence: 0.1, correct: 0 }];
  assert.equal(auroc(pairs), 1);
  assert.equal(auroc(pairs.map((p) => ({ ...p, confidence: 0.5 }))), 0.5);
  assert.equal(auroc([{ confidence: 0.2, correct: 1 }]), null);
  const perfect = calibration([{ confidence: 1, correct: 1 }, { confidence: 0, correct: 0 }]);
  assert.equal(perfect.ece, 0);
});

test('15. no hidden dependency on temporary directories or live authority', () => {
  for (const f of ['scripts/stage3f6p1e-analysis-plan.mjs', 'scripts/generate-stage3f6p1e-policy-evidence.mjs', 'scripts/certify-stage3f6p1e-policy-requalification.mjs',
    'src/stage3f/policy-requalification-v1.js']) {
    const source = readFileSync(at(f), 'utf8');
    assert.ok(!/\/tmp\/|\/private\/|tmpdir\(|scratchpad/.test(source), `${f} must not read temporary paths`);
    assert.ok(!/fitPolicyRouter\(|canDispatch:\s*true|onlineLearningEnabled:\s*true/.test(source), `${f} must not train or grant authority`);
  }
  assert.deepEqual(STAGE3F6P1E_PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  assert.ok(STAGE3F6P1E_OUT.startsWith('artifacts/'));
});
