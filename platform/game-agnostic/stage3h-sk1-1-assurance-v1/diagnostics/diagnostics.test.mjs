// STAGE 3H-SK1.1 diagnostics — tests. Run: node --test diagnostics/*.test.mjs
// Tracked-evidence tests run from a clean checkout. The one test that replays frozen class records needs the
// privileged local data of the SK1 lane and is skipped (with a message) when it is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { analyse, cpUpper, sampleSizeFor, bootCI } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), SK1 = resolve(LANE, '../stage3h-sk1-safety-kernel-v1'), EV = resolve(LANE, 'evidence');
const sha = (b) => createHash('sha256').update(b).digest('hex'), readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
const matrix = readJ(resolve(EV, 'SK1_1_DECISION_FAILURE_MATRIX.json')), stored = readJ(resolve(SK1, 'evidence/SK1_VALIDATION_RESULTS.json'));
const PRIVILEGED = existsSync(resolve(SK1, 'work/manifests/SK1_POPULATION_VALIDATION.json'));

test('the matrix is bound to the frozen SK1 evidence and reconciles exactly with it', () => {
  assert.equal(sha(readFileSync(resolve(SK1, 'evidence/SK1_VALIDATION_RESULTS.json'))), matrix.source.validationResultsSha256);
  assert.equal(sha(readFileSync(resolve(SK1, 'evidence/SK1_EXPERIMENT_FREEZE.json'))), matrix.source.experimentFreezeSha256);
  assert.equal(sha(readFileSync(resolve(SK1, 'models/SK1_MODEL.json'))), matrix.source.modelFileSha256);
  assert.equal(matrix.reconciliation.exact, true); assert.deepEqual(matrix.reconciliation.issues, []);
  assert.equal(matrix.rows.length, 600); assert.equal(new Set(matrix.rows.map((r) => r.alias)).size, 600);
  assert.equal(matrix.reconciliation.decisionDigest, stored.reproducibility.decisionDigest);
});

test('every row equals the committed per-class record; the inherited baseline counts are preserved', () => {
  matrix.rows.forEach((r, i) => { const s = stored.perClass[i];
    assert.equal(r.alias, s.id); assert.equal(r.sk1.decisionHash, s.sk1.decisionHash); assert.equal(r.sk1.kind, s.sk1.kind); assert.deepEqual(r.sk1.forcedSet, s.sk1.forcedSet);
    assert.equal(r.sk1.risk.upperBound, s.sk1.riskUpperBound); assert.equal(r.policies.SK1_FORCED.introS0, s.sk1.introS0); assert.equal(r.policies.SK1_FORCED.introNexus, s.sk1.introNexus);
    assert.deepEqual(r.policies.C10.set, s.c10.set); assert.equal(r.policies.C10.introS0, s.c10.introS0); assert.equal(r.policies.C10.introNexus, s.c10.introNexus); });
  const n = (f) => matrix.rows.filter(f).length, acc = (r) => !r.sk1.abstained;
  assert.equal(n(acc), 304); assert.equal(n((r) => !acc(r)), 296);
  assert.equal(n((r) => acc(r) && r.policies.SK1_FORCED.introS0), 1); assert.equal(n((r) => acc(r) && r.policies.SK1_FORCED.introNexus), 2);
  assert.equal(n((r) => r.policies.SK1_FORCED.introS0), 28); assert.equal(n((r) => r.policies.SK1_FORCED.introNexus), 37);
  assert.equal(n((r) => r.policies.C10.introS0), 49); assert.equal(n((r) => r.policies.C10.introNexus), 58);
  assert.equal(n((r) => r.failure !== null), 39); assert.equal(n((r) => r.failure !== null && !acc(r)), 37); assert.equal(n((r) => r.failure?.accepted), 2);
  const meanNreg = (k) => matrix.rows.reduce((s, r) => s + r.policies[k].nreg, 0) / 600;
  assert.ok(Math.abs(meanNreg('SK1_FORCED') - stored.policies.SK1_FORCED_CHOICE.meanNreg) < 1e-6); assert.ok(Math.abs(meanNreg('C10') - stored.policies.C10.meanNreg) < 1e-6);
});

test('the frozen criterion is the only acceptance rule: accepted exactly when the bound is at most tau', () => {
  for (const r of matrix.rows) { assert.equal(r.sk1.margins.tau, 0.2); assert.equal(!r.sk1.abstained, r.sk1.risk.upperBound <= 0.2); assert.equal(r.horizon, 'H2'); }
});

test('tracked SK1.1 evidence carries no privileged field or private identity', () => {
  const FORBIDDEN = /^(seed|seeds|worldHash|sourceStateHash|truth|truths|utility|utilities|block|k|fine|coarse|projectionSha|membersDigest|hiddenValue|hiddenHealth|hiddenState)$/;
  const scan = (v, path) => { if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!FORBIDDEN.test(k), `privileged key ${path}.${k}`); scan(x, `${path}.${k}`); } };
  const priv = PRIVILEGED ? readJ(resolve(SK1, 'work/manifests/SK1_POPULATION_VALIDATION.json')).classes.slice(0, 600).flatMap((c) => [c.worldHash, String(c.seed)]) : [];
  for (const f of readdirSync(EV).filter((n) => n.endsWith('.json'))) { const text = readFileSync(resolve(EV, f), 'utf8'); scan(JSON.parse(text), f);
    for (const p of priv) if (p.length >= 9) assert.ok(!text.includes(p), `${f} contains a private identity`); }
  // every alias is an opaque SK1 validation alias
  for (const r of matrix.rows) assert.match(r.alias, /^SK1V-\d{4}$/);
});

test('the analysis is a pure function of tracked evidence and reproduces the stored outputs byte for byte', () => {
  const res = analyse(); assert.deepEqual(res.issues, []);
  assert.equal(JSON.stringify(res.riskCoverage, null, 1) + '\n', readFileSync(resolve(EV, 'SK1_1_RISK_COVERAGE.json'), 'utf8'));
  assert.equal(JSON.stringify(res.attribution, null, 1) + '\n', readFileSync(resolve(EV, 'SK1_1_FAILURE_ATTRIBUTION.json'), 'utf8'));
  assert.equal(res.riskCoverage.counts.failingWithheldByAbstention, 37); assert.equal(res.riskCoverage.counts.failingAcceptedDespiteCriterion, 2);
  assert.equal(res.attribution.acceptedFailures.length, 2);
  assert.equal(res.riskCoverage.calibration.bagSpreadUncertainty.status, 'NOT_VERIFIED');
  for (const o of [res.riskCoverage, res.attribution]) assert.ok(o.labels.includes('POST_HOC_DIAGNOSTIC') && o.labels.includes('NOT_VALIDATION_MATERIAL_FOR_ANY_FUTURE_POLICY'));
});

test('the reproduced cluster bootstrap equals the committed paired contrast exactly', () => {
  const fam = matrix.rows.map((r) => r.family), sp = stored.paired.SK1_FORCED_minus_C10;
  for (const [k, f] of [['introVsS0', 'introS0'], ['introVsNexus', 'introNexus']]) { const b = bootCI(matrix.rows.map((r) => Number(r.policies.SK1_FORCED[f]) - Number(r.policies.C10[f])), fam);
    assert.equal(b.point, sp[k].point); assert.equal(b.lower025, sp[k].lower025); assert.equal(b.upper975, sp[k].upper975); assert.equal(b.upper95, sp[k].upper95); assert.equal(b.clusters, 46); }
});

test('binomial bounds and sample sizes are correct at known values', () => {
  assert.ok(Math.abs(cpUpper(0, 100) - (1 - Math.pow(0.05, 1 / 100))) < 1e-9); // zero events: closed form
  assert.ok(Math.abs(cpUpper(0, 600) - stored.zeroEventBounds.classLevelUpper95) < 1e-9);
  assert.ok(cpUpper(2, 304) > 0.0205 && cpUpper(2, 304) < 0.0207);
  assert.equal(sampleSizeFor(0.01, 0), 299); assert.ok(cpUpper(0, 299) <= 0.01 && cpUpper(0, 298) > 0.01);
  assert.ok(cpUpper(1, sampleSizeFor(0.01, 1)) <= 0.01 && cpUpper(1, sampleSizeFor(0.01, 1) - 1) > 0.01);
  assert.ok(sampleSizeFor(0.01, 2) > sampleSizeFor(0.01, 1)); assert.equal(cpUpper(5, 5), 1);
});

test('negative control: a tampered matrix row is detected by the reconciliation tests', () => {
  const t = structuredClone(matrix); t.rows[0].sk1.decisionHash = '0'.repeat(64);
  assert.notEqual(t.rows[0].sk1.decisionHash, stored.perClass[0].sk1.decisionHash);
  const digest = (rows) => sha(JSON.stringify(rows.map((r) => [r.sk1.kind, r.sk1.kind === 'RECOMMEND' ? r.sk1.forcedSet : [], r.sk1.forcedSet, r.sk1.decisionHash])));
  assert.equal(digest(matrix.rows), stored.reproducibility.decisionDigest); assert.notEqual(digest(t.rows), stored.reproducibility.decisionDigest);
});

test('extraction check: replaying the frozen records reproduces the stored matrix and changes no SK1 file', { skip: PRIVILEGED ? false : 'privileged SK1 class records (work/) are not present in this checkout' }, () => {
  const snap = () => sha(JSON.stringify(['evidence', 'models', 'kernel', 'api', 'infra', 'adapters/forge', 'work/classes/VALIDATION'].flatMap((d) => readdirSync(resolve(SK1, d)).sort().map((n) => { const p = resolve(SK1, d, n), st = statSync(p); return [d, n, st.isFile() ? st.size : 0, st.mode & 0o777, st.isFile() && d !== 'work/classes/VALIDATION' ? sha(readFileSync(p)) : null]; }))));
  const before = snap(), out = execFileSync(process.execPath, [resolve(HERE, 'extract-matrix.mjs'), 'check'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.match(out, /SK1_1_MATRIX_CHECK_PASS/); assert.equal(snap(), before);
});
