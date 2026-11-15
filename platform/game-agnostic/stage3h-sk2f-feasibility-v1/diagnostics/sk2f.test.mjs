// STAGE 3H-SK2-F diagnostics — tests. Run: node --test diagnostics/*.test.mjs
// Tracked-evidence tests run from a clean checkout; the extraction replay needs the SK1 lane's privileged local data
// and is skipped with a message when it is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { analyse, TARGET, binCdf, passCount, passProbability, requiredN } from './feasibility.mjs';
import { cpUpper } from '../../stage3h-sk1-1-assurance-v1/diagnostics/analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), SK1 = resolve(GA, 'stage3h-sk1-safety-kernel-v1'), EV = resolve(LANE, 'evidence');
const sha = (b) => createHash('sha256').update(b).digest('hex'), readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
const E = readJ(resolve(EV, 'SK2F_EXPLORATION_MATRIX.json')), Fz = readJ(resolve(EV, 'SK2F_FEASIBILITY.json')), PRIVILEGED = existsSync(resolve(SK1, 'work/manifests/SK1_POPULATION_EXPLORATION.json'));

test('the exploration matrix is bound to the frozen SK1 model and training record and reconciles exactly', () => {
  assert.equal(E.source.modelHash, 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b');
  assert.equal(sha(readFileSync(resolve(SK1, 'models/SK1_MODEL.json'))), E.source.modelFileSha256);
  assert.equal(sha(readFileSync(resolve(SK1, 'evidence/SK1_TRAINING_RECORD.json'))), E.source.trainingRecordSha256);
  assert.equal(sha(readFileSync(resolve(SK1, 'evidence/SK1_VALIDATION_RESULTS.json'))), E.source.validationResultsSha256);
  assert.equal(E.reconciliation.exact, true); assert.equal(E.rows.length, 1000); assert.equal(new Set(E.rows.map((r) => r.alias)).size, 1000);
  assert.equal(E.source.classListDigest, readJ(resolve(SK1, 'evidence/SK1_TRAINING_RECORD.json')).population.classListDigest);
  assert.deepEqual(E.frozenCriterion, { tau: 0.2, tierWidth: 0.1, z: 1, oodPenalty: 0.05, contract: 'SK1_TIERED_RISK_THEN_REGRET_V1' });
});

test('every bag bootstrap was re-derived and verified against the stored bag base; no bag was refitted', () => {
  assert.equal(E.reconciliation.bagBootstrapVerifiedAgainstStoredBase.risk.length, 10); assert.equal(E.reconciliation.bagBootstrapVerifiedAgainstStoredBase.regret.length, 10);
  assert.ok(E.reconciliation.bagBootstrapVerifiedAgainstStoredBase.risk.every(Boolean) && E.reconciliation.bagBootstrapVerifiedAgainstStoredBase.regret.every(Boolean));
  for (const r of E.rows) { assert.equal(r.outOfBag !== null, r.oob.available); assert.equal(r.oob.available, r.oob.riskBags >= 2 && r.oob.regretBags >= 1); assert.equal(r.inSample.accepted, r.inSample.upper <= 0.2); if (r.outOfBag) assert.equal(r.outOfBag.accepted, r.outOfBag.upper <= 0.2); }
  const src = readFileSync(resolve(HERE, 'extract-exploration.mjs'), 'utf8');
  assert.ok(!/\b(fitHead|fitOne|binColumns)\s*\(/.test(src), 'the extractor must not call any fitting routine');
  assert.match(src, /import \{ prng \} from '[^']*infra\/gbdt\.mjs';/, 'only the seeded generator is imported from the trainer module'); assert.ok(!/infra\/train\.mjs/.test(src));
});

test('the inherited SK1 baseline is preserved exactly', () => {
  assert.deepEqual(Fz.baselinePreserved, { validationClasses: 600, acceptedClasses: 304, abstainedClasses: 296, uniqueAcceptedIntroductionClasses: 2, comparatorRelativeAcceptedIntroductions: 3, forcedChoiceFailureClasses: 39, abstainedForcedFailureClasses: 37, sk1ModelHash: 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b' });
  const hv = Fz.endpoints.historicalValidation; assert.equal(hv.acceptedDecisions, 304); assert.equal(hv.endpoints.C_UNION_INTRODUCTION.uniqueAcceptedFailingClasses, 2); assert.equal(hv.endpoints.C_UNION_INTRODUCTION.comparatorRelativeEvents, 3); assert.equal(hv.endpoints.C_UNION_INTRODUCTION.classesFailingBothComparators, 1);
  assert.equal(hv.endpoints.A_INTRODUCTION_VS_S0.acceptedIntroductions, 1); assert.equal(hv.endpoints.B_INTRODUCTION_VS_NEXUS.acceptedIntroductions, 2);
  assert.ok(Math.abs(hv.endpoints.C_UNION_INTRODUCTION.exactUpper95 - 0.02056) < 1e-5); assert.equal(hv.endpoints.C_UNION_INTRODUCTION.supportsOnePercentUpperBound, false);
  assert.equal(Fz.discrimination.historicalValidation.WITHIN_MENU_RISK_ORDERING_ERROR, 34); assert.equal(Fz.discrimination.historicalValidation.RANKING_CONTRACT_ERROR, 5); assert.equal(Fz.discrimination.historicalValidation.recordedAttributionVerified, true);
});

test('the out-of-fold reference equals the tracked training record', () => {
  const t = readJ(resolve(SK1, 'evidence/SK1_TRAINING_RECORD.json')).arms.find((a) => a.arm === 'PRIMARY').outOfFold, o = Fz.endpoints.explorationOutOfFoldReference, at = t.ruleT2.find((x) => x.tau === 0.2);
  assert.equal(o.acceptedDecisions, at.decided); assert.equal(o.endpoints.C_UNION_INTRODUCTION.uniqueAcceptedFailingClasses, at.failingClasses); assert.equal(at.decided, 434); assert.equal(at.failingClasses, 3);
  assert.equal(o.endpoints.C_UNION_INTRODUCTION.supportsOnePercentUpperBound, false); assert.equal(o.thresholdGrid.length, t.ruleT2.length);
});

test('the three endpoints are distinct and the union is never double counted', () => {
  for (const k of ['explorationInSample', 'explorationOutOfBag', 'historicalValidation']) { const b = Fz.endpoints[k], A = b.endpoints.A_INTRODUCTION_VS_S0.acceptedIntroductions, B = b.endpoints.B_INTRODUCTION_VS_NEXUS.acceptedIntroductions, C = b.endpoints.C_UNION_INTRODUCTION;
    assert.equal(C.comparatorRelativeEvents, A + B); assert.equal(C.uniqueAcceptedFailingClasses, A + B - C.classesFailingBothComparators); assert.ok(C.uniqueAcceptedFailingClasses >= Math.max(A, B) && C.uniqueAcceptedFailingClasses <= A + B);
    assert.ok(Math.abs(C.SELECTIVE_FAILURE_RATE - C.uniqueAcceptedFailingClasses / b.acceptedDecisions) < 1e-6); assert.ok(Math.abs(C.FULL_POPULATION_INTRODUCTION_RATE - C.uniqueAcceptedFailingClasses / b.eligibleClasses) < 1e-6);
    assert.ok(Math.abs(b.SELECTIVE_COVERAGE.value - b.acceptedDecisions / b.eligibleClasses) < 1e-6); assert.ok(Math.abs(C.exactUpper95 - cpUpper(C.uniqueAcceptedFailingClasses, b.acceptedDecisions)) < 1e-6); }
});

test('the research targets are the mandated inputs and nothing selects a threshold', () => {
  assert.deepEqual({ ...TARGET }, { selectiveRisk: 0.01, confidence: 0.95, minimumCoverage: 0.40, status: 'RESEARCH_TARGETS_NOT_RATIFIED' }); assert.deepEqual(Fz.target, { ...TARGET }); assert.equal(Fz.verdicts.targetsWeakened, false);
  const banned = /^(recommendedThreshold|proposedThreshold|selectedThreshold|proposedTau|recommendedTau|newTau|operatingPoint|qualifiedOperatingPoint)$/i;
  const scan = (v) => { if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.test(k), 'threshold-selection key ' + k); scan(x); } }; scan(Fz);
  assert.equal(Fz.riskCoverage.label, 'POST_HOC_EXPLORATORY_ONLY'); for (const c of ['explorationInSample', 'explorationOutOfBag', 'historicalValidation']) assert.equal(Fz.riskCoverage.curves[c].reading, 'POST_HOC_EXPLORATORY_ONLY');
  assert.equal(Fz.endpoints.pooledDescriptive.label, 'POST_HOC_EXPLORATORY_ONLY'); assert.ok(Fz.labels.includes('NOT_A_QUALIFICATION') && Fz.labels.includes('NO_TRAINING'));
});

test('the analysis is a pure function of tracked evidence and reproduces the stored output byte for byte', () => {
  const res = analyse(); assert.deepEqual(res.issues, []); assert.equal(JSON.stringify(res.out, null, 1) + '\n', readFileSync(resolve(EV, 'SK2F_FEASIBILITY.json'), 'utf8'));
});

test('the verdict follows from the stated rules', () => {
  const v = Fz.verdicts, b = v.statisticalBoundBasis;
  assert.equal(v.STATISTICAL_BOUND_FEASIBLE, b.anyExistingReadingSupportsTheBoundAtTheCoverageTarget || b.eligibleValidationClassesNeeded <= v.practicalityRule.practicalCeilingEligibleValidationClasses);
  assert.equal(v.classification, v.STATISTICAL_BOUND_FEASIBLE ? 'A_SELECTIVE_ASSURANCE_FEASIBLE_FOR_PROSPECTIVE_TEST' : 'B_SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED');
  assert.equal(v.classification, 'B_SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED'); assert.equal(v.nextScientificPriority, 'WITHIN_MENU_ACTION_RISK_DISCRIMINATION'); assert.equal(v.PROSPECTIVE_QUALIFICATION_NOT_ESTABLISHED, true);
  assert.ok(v.orderingShare.historicalValidation > 0.5 && v.orderingShare.explorationOutOfBag > 0.5);
});

test('binomial design arithmetic is correct at known values', () => {
  assert.ok(Math.abs(binCdf(0, 299, 0.01) - Math.pow(0.99, 299)) < 1e-12); assert.equal(binCdf(5, 5, 0.3), 1); assert.equal(binCdf(-1, 5, 0.3), 0);
  assert.equal(passCount(298, 0.01, 0.05), -1); assert.equal(passCount(299, 0.01, 0.05), 0); assert.equal(passCount(473, 0.01, 0.05), 1); assert.equal(passCount(472, 0.01, 0.05), 0);
  for (const n of [300, 700, 1400]) { const k = passCount(n, 0.01, 0.05); assert.ok(cpUpper(k, n) <= 0.01 && cpUpper(k + 1, n) > 0.01); }
  assert.equal(passProbability(298, 0.01, 0.05, 0.001), 0); assert.ok(Math.abs(passProbability(299, 0.01, 0.05, 0.001) - Math.pow(0.999, 299)) < 1e-12);
  const n = requiredN(0.01, 0.05, 0.002, 0.8); assert.ok(passProbability(n, 0.01, 0.05, 0.002) >= 0.8 && passProbability(n - 1, 0.01, 0.05, 0.002) < 0.8);
  assert.ok(requiredN(0.01, 0.05, 0.007, 0.8) > requiredN(0.01, 0.05, 0.005, 0.8)); assert.ok(requiredN(0.01, 0.025, 0.002, 0.8) > requiredN(0.01, 0.05, 0.002, 0.8));
});

test('tracked SK2-F evidence carries no privileged field or private identity', () => {
  const FORBIDDEN = /^(seed|seeds|worldHash|sourceStateHash|truth|truths|utility|utilities|block|k|fine|coarse|projectionSha|membersDigest|hiddenValue|hiddenHealth|hiddenState)$/;
  const scan = (v, path) => { if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!FORBIDDEN.test(k), `privileged key ${path}.${k}`); scan(x, `${path}.${k}`); } };
  const priv = new Set(); if (PRIVILEGED) for (const p of ['EXPLORATION', 'VALIDATION']) for (const c of readJ(resolve(SK1, `work/manifests/SK1_POPULATION_${p}.json`)).classes) for (const v of [c.worldHash, String(c.seed), c.fine, c.coarse, c.projectionSha, c.membersDigest]) if (v && String(v).length >= 9) priv.add(String(v));
  for (const f of readdirSync(EV).filter((n) => n.endsWith('.json'))) { const text = readFileSync(resolve(EV, f), 'utf8'); if (/^SK2F_(EXPLORATION_MATRIX|FEASIBILITY)\.json$/.test(f)) scan(JSON.parse(text), f); for (const m of text.matchAll(/[0-9a-f]{64}|\b\d{9,}\b/g)) assert.ok(!priv.has(m[0]), `${f} contains a private identity`); }
  for (const r of E.rows) assert.match(r.alias, /^SK1E-\d{4}$/); for (const c of E.validationAcceptedFailureContrasts) assert.match(c.alias, /^SK1V-\d{4}$/);
});

test('extraction check: replaying the frozen model on the exploration records reproduces the matrix and changes no SK1 file', { skip: PRIVILEGED ? false : 'privileged SK1 class records (work/) are not present in this checkout' }, () => {
  const snap = () => sha(JSON.stringify(['evidence', 'models', 'kernel', 'api', 'infra', 'adapters/forge', 'work/classes/VALIDATION', 'work/classes/EXPLORATION'].flatMap((d) => readdirSync(resolve(SK1, d)).sort().map((n) => { const p = resolve(SK1, d, n), st = statSync(p); return [d, n, st.isFile() ? st.size : 0, st.mode & 0o777, st.isFile() && !d.startsWith('work/') ? sha(readFileSync(p)) : null]; }))));
  const before = snap(), out = execFileSync(process.execPath, [resolve(HERE, 'extract-exploration.mjs'), 'check'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.match(out, /SK2F_EXPLORATION_CHECK_PASS/); assert.equal(snap(), before);
});
