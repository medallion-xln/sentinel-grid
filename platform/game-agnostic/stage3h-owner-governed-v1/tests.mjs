// Structural tests for the owner-governed connector, amendments and runner. node --test tests.mjs
// Development worlds only (STAGE3H1 OPEN panels, already evaluated). No prospective seed is ever generated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { hashWorld } from '../src/forge/kernel.js';
import { orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { evaluateCombo } from '../stage3h1d-development/confirm-core.mjs';
import { lockFrozenPolicies, scoreSyntheticTruth, nuisanceDependence } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { analyseSyntheticPanel } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { nativeRow, nativeLock, schedule, scheduleHash, PROVENANCE } from './connector.mjs';
import { nuisanceOwnerV1 } from './nuisance.mjs';
import { analyseNativePanel, validateNativeRows, ownerGovernedDisposition } from './analysis-native.mjs';
import { runReplication, loadActiveRegistration, registrationHash, ownerAdmission } from './campaign.mjs';
import { admissionReport } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { verifyOwnerLane, GA } from './inherit.mjs';

const dev = openCombos().map(({ panel, ...c }) => c);
const pick = (n) => [...dev.filter((c) => c.horizonBand === 'H0').slice(0, n / 2), ...dev.filter((c) => c.horizonBand === 'H2').slice(0, n / 2)];
const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));

test('inheritance: V1, closure, V3 contract, protected files and frozen rule unchanged', () => {
  const v = verifyOwnerLane();
  assert.equal(v.protectedCount, 14447); assert.equal(v.frozenRuleHashMatches, true); assert.equal(v.v3UnchangedSince320a07da, true); assert.equal(v.closureCommitAncestorOfHead, true);
});

test('native lock equals V3 lockFrozenPolicies on native development views', () => {
  for (const c of pick(8)) {
    const warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w })), view = observableView(warm.world);
    const mine = nativeLock(view, c.horizonBand);
    // Equivalence harness only: V3 accepts its lock function solely through a fixture-shaped argument.
    const v3 = lockFrozenPolicies({ synthetic: true, band: c.horizonBand, publicView: view });
    assert.deepEqual(mine.selections, v3.selections); assert.deepEqual(mine.menu, v3.menu); assert.equal(mine.regime, v3.regime);
  }
});

test('native rows reproduce the frozen confirmation core (selections and R/B/N scores) on development worlds', () => {
  for (const c of pick(16)) {
    const r = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set(), twins: false }), ref = evaluateCombo({ panel: 'DEV', ...c }, new Set());
    assert.equal(!!r.rejected, !!ref.rejected); if (r.rejected) continue;
    const s = ref.row.selections, sc = ref.row.scores;
    assert.deepEqual(r.row.selections, { R: s.HORIZON_ROUTED, B: s.S0, N: s.NEXUS_ELSE_S0 });
    for (const [arm, k] of [['R', 'HORIZON_ROUTED'], ['B', 'S0'], ['N', 'NEXUS_ELSE_S0']]) {
      assert.equal(r.row.metrics[arm].nreg, sc[k].normalizedRegret); assert.equal(r.row.metrics[arm].regret, sc[k].regret); assert.equal(r.row.metrics[arm].hit, sc[k].hit);
    }
    assert.equal(r.ledger.worldHash, ref.row.worldHash);
  }
});

test('native twins: R0 twin is the same world; D4 and ORDER truth invariant; nuisance computed for every unit', () => {
  for (const c of pick(8)) {
    const warm = runCalibratedWarmup(c.seed, (w) => generateScenarioSymmetricV1({ ...c, warmupTicks: w }));
    assert.equal(hashWorld(orientWorld('R0', warm.world)), hashWorld(warm.world));
    const r = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set() });
    assert.ok(r.row && ['D4', 'IDENTITY', 'ORDER'].every((k) => Number.isFinite(r.row.nuisance[k].RB) && Number.isFinite(r.row.nuisance[k].RN)));
    assert.equal(typeof r.row.identityTruthInvariant, 'boolean'); assert.equal(typeof r.row.identityRetreatRemapped, 'boolean');
  }
});

test('duplicate world hashes are an integrity failure; prior-excluded worlds are rejected, never replaced', () => {
  const c = dev[0], ctx = { seen: new Set() };
  nativeRow({ population: 'DEV', cell: 'dev', ...c }, { ...ctx, twins: false });
  assert.throws(() => nativeRow({ population: 'DEV', cell: 'dev', ...c }, { ...ctx, twins: false }), /DUPLICATE_WORLD_HASH/);
  const h = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set(), twins: false }).ledger.worldHash;
  assert.equal(nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen: new Set(), prior: new Set([h]), twins: false }).rejected.reason, 'PRIOR_WORLD_EXCLUDED');
});

// Row-level fixtures: menu a,b,c,d; truth invariant under every map unless stated.
function fixtureRows(identityTruthChanges = false) {
  const menu = ['a', 'b', 'c', 'd'], truth = [{ id: 'a', utility: 100 }, { id: 'b', utility: 90 }, { id: 'c', utility: 0 }, { id: 'd', utility: 50 }];
  const sel = selectSets('H0', ['b'], ['a']), row = (m, t, s) => ({ id: 'u', band: 'H0', regime: 'OBSERVED_THREAT', selections: s, menu: m, truth: t, metrics: scoreSyntheticTruth(s, m, t).metrics });
  const original = row(menu, truth, sel), variants = [];
  for (const t of ['R0', 'R90', 'R180', 'R270', 'MX', 'MY', 'MD', 'MA']) variants.push({ category: 'D4', transform: t, actionMap: Object.fromEntries(menu.map((x) => [x, x])), row: row(menu, truth, t === 'MX' ? selectSets('H0', ['d'], ['a']) : sel) });
  const ren = Object.fromEntries(menu.map((x, i) => [x, 'e' + (4 - i)])), rmenu = menu.map((x) => ren[x]);
  const rtruth = truth.map((t) => ({ id: ren[t.id], utility: identityTruthChanges && t.id === 'b' ? 95 : t.utility }));
  variants.push({ category: 'IDENTITY', transform: 'IDENTITY', actionMap: ren, row: row(rmenu, rtruth, selectSets('H0', [ren.d], [ren.a])) });
  variants.push({ category: 'ORDER', transform: 'ORDER', actionMap: Object.fromEntries(menu.map((x) => [x, x])), row: row([...menu].reverse(), truth, sel) });
  return { original, variants };
}
test('nuisance amendment O-2 equals V3 whenever native truth is identity-invariant, and handles identity-dependent truth', () => {
  const { original, variants } = fixtureRows(false);
  assert.deepEqual(nuisanceOwnerV1(original, variants).values, nuisanceDependence(original, variants).values);
  const changed = fixtureRows(true);
  assert.throws(() => nuisanceDependence(changed.original, changed.variants), /NUISANCE_TRUTH_CHANGED/);
  const o2 = nuisanceOwnerV1(changed.original, changed.variants);
  assert.equal(o2.identityTruthInvariant, false); assert.ok(Number.isFinite(o2.values.IDENTITY.RB));
  const bad = fixtureRows(false); bad.variants[0].row = { ...bad.variants[0].row, truth: bad.variants[0].row.truth.map((t) => ({ ...t, utility: t.utility + 1 })) };
  bad.variants[0].row.metrics = scoreSyntheticTruth(bad.variants[0].row.selections, bad.variants[0].row.menu, bad.variants[0].row.truth).metrics;
  assert.throws(() => nuisanceOwnerV1(bad.original, bad.variants), /NUISANCE_TRUTH_CHANGED/, 'D4 keeps the V3 truth-equality assertion');
});

function panelRows(n = 160, native = true) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const band = i % 2 ? 'H2' : 'H0', effect = 2 + (i % 7), menu = ['b', 'n', 'low', 'high'], selections = selectSets(band, ['b'], ['n']);
    const truth = [{ id: 'b', utility: band === 'H0' ? 100 - effect : 100 }, { id: 'n', utility: band === 'H0' ? 100 : 100 - effect }, { id: 'low', utility: 0 }, { id: 'high', utility: 100 }];
    const base = { id: 'r' + i, cell: band + '/c' + (i % 8), band, regime: i % 3 ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT', selections, menu, truth, ...scoreSyntheticTruth(selections, menu, truth), nuisance: Object.fromEntries(['D4', 'IDENTITY', 'ORDER'].map((k) => [k, { RB: 0, RN: 0 }])) };
    rows.push(native ? { provenance: PROVENANCE, ...base } : { synthetic: true, ...base });
  }
  return rows;
}
test('native analysis O-1 is numerically identical to V3 analyseSyntheticPanel; only validator and label differ', () => {
  const opts = { resamples: 1000 };
  const a = analyseNativePanel(panelRows(160, true), opts), b = analyseSyntheticPanel(panelRows(160, false), opts);
  for (const k of ['equalities', 'primaries', 'accuracy', 'catastrophe', 'safety', 'regimes', 'nuisance', 'DDVBundle', 'numericCriteriaPass']) assert.deepEqual(a[k], b[k], k);
  assert.equal(a.decision, 'OWNER_GOVERNED_NATIVE_NUMERIC'); assert.equal(a.independentMethodReview, false); assert.equal(a.boundedQualificationImpliesFullCertification, false);
  assert.throws(() => validateNativeRows(panelRows(4, false)), /NATIVE_OWNER_GOVERNED_ROWS_ONLY/);
  assert.throws(() => validateNativeRows(panelRows(4, true).map((r) => ({ ...r, seed: 1 }))), /NATIVE_OWNER_GOVERNED_ROWS_ONLY/);
});

test('schedule: exact V3 population sizes, unique seeds, A/B disjoint, deterministic', () => {
  const c = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json');
  const A = schedule(c.populations, 731000000000), B = schedule(c.populations, 732000000000);
  assert.equal(A.length, 12768); assert.equal(A.length * 2, c.proposedWorlds);
  for (const [p, spec] of Object.entries(c.populations)) assert.equal(A.filter((x) => x.population === p).length, spec.scheduledPerReplication, p);
  assert.equal(new Set(A.map((x) => x.seed)).size, A.length);
  const bs = new Set(B.map((x) => x.seed)); assert.ok(A.every((x) => !bs.has(x.seed)));
  assert.equal(scheduleHash(A), scheduleHash(schedule(c.populations, 731000000000)));
});

test('runner refuses without an active owner-approved registration and once-only authorization', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 's3h-owner-')), reg = resolve(dir, 'reg.json'), auth = resolve(dir, 'auth.json');
  assert.throws(() => runReplication('A', { registrationPath: reg, authorizationPath: auth }), /NO_ACTIVE_REGISTRATION/);
  const pending = { status: 'REGISTRATION_PENDING_OWNER_APPROVAL', reviewMode: 'OWNER_GOVERNED', independentMethodReview: false };
  writeFileSync(reg, JSON.stringify({ ...pending, registrationHash: registrationHash(pending) }));
  assert.throws(() => loadActiveRegistration(reg), /REGISTRATION_NOT_ACTIVE_OWNER_GOVERNED/);
  const forged = { status: 'ACTIVE_OWNER_GOVERNED', reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, ownerApproval: { decisions: {} } };
  writeFileSync(reg, JSON.stringify({ ...forged, registrationHash: 'x' }));
  assert.throws(() => loadActiveRegistration(reg), /REGISTRATION_HASH_MISMATCH/);
  writeFileSync(reg, JSON.stringify({ ...forged, registrationHash: registrationHash(forged) }));
  assert.throws(() => loadActiveRegistration(reg), /OWNER_SCOPE_APPROVAL_MISSING/);
});

test('owner-governed disposition never certifies Stage 3H and is blocked without signed scope approval', () => {
  assert.equal(ownerGovernedDisposition({}).classification, 'CONTRACT_BLOCKED');
  const decisions = Object.fromEntries(['SCOPE-DDV', 'SCOPE-TCA', 'SCOPE-PRIME', 'SCOPE-REGIME', 'SCOPE-THRESHOLDS'].map((s) => [s, { approved: true, signatureOrTrustedApprovalReference: null }]));
  assert.equal(ownerGovernedDisposition({ ownerApproval: { decisions }, registered: true }).classification, 'CONTRACT_BLOCKED', 'unsigned approval does not count');
  for (const s of Object.keys(decisions)) decisions[s].signatureOrTrustedApprovalReference = 'test-only';
  const r = ownerGovernedDisposition({ ownerApproval: { decisions }, registered: true, panels: [] });
  assert.equal(r.classification, 'UNMEASURED'); assert.equal(r.reviewMode, 'OWNER_GOVERNED');
});

test('admission O-3: KEEP_V3 reproduces V3 exactly; MIN_TWO keeps population, band and effective-N floors', () => {
  const sched = {}, rows = [];
  for (let c = 0; c < 48; c++) { const band = c % 2 ? 'H2' : 'H0'; sched['c' + c] = { scheduled: 52, band }; for (let k = 0; k < 52; k++) rows.push({ id: c + ':' + k, cell: 'c' + c, band, rejected: c === 0 && k < 30, reason: c === 0 && k < 30 ? 'VALIDATOR_INVALID' : undefined }); }
  const v3 = admissionReport(rows, sched), keep = ownerAdmission(rows, sched, 'KEEP_V3_HALF_PER_CELL'), two = ownerAdmission(rows, sched, 'MIN_TWO_PER_CELL');
  assert.equal(keep.pass, v3.pass); assert.equal(v3.pass, false, 'cell 0 has 22/52 < 26'); assert.equal(two.pass, true);
  assert.throws(() => ownerAdmission(rows, sched, undefined), /O3_CHOICE_REQUIRED/);
});
