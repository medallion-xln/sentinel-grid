// Post-run verification and summary for registration 7c41ba89 (after both replications locked, the recount recorded and
// the registered analysis written). Read-only on the run directory. Re-verifies source, runtime and lock identities, then
// extracts the registered statistics from ANALYSIS.json without recomputing or adjusting anything, and applies the verdict
// mapping fixed in registration/EXECUTION_AUTHORIZATION_V4.json before launch.
// Writes evidence/execution-7c41ba89/qualification-summary.json once.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { loadV4, V4_REGISTRATION } from './campaign-v4.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(LANE, p))).digest('hex');
assertSoleWriter(); const inh = verifyOwnerLane();
const OUT = resolve(LANE, 'evidence/execution-7c41ba89/qualification-summary.json'); ok(!existsSync(OUT), 'ALREADY_WRITTEN');
const reg = loadV4(V4_REGISTRATION); assertRuntimeIdentity(reg.bindings.runtime);
const RUN = 'runs/' + reg.registrationHash.slice(0, 16), auth = J('registration/EXECUTION_AUTHORIZATION_V4.json'), recount = J('evidence/execution-7c41ba89/exclusion-recount.json');
const analysisStdout = JSON.parse(readFileSync(resolve(LANE, 'evidence/execution-7c41ba89/analyse.stdout.log'), 'utf8'));
ok(fsha(RUN + '/ANALYSIS.json') === analysisStdout.analysisHash, 'ANALYSIS_HASH_MISMATCH');
const locks = {};
for (const rep of ['A', 'B']) {
  ok(!existsSync(resolve(LANE, RUN, rep, 'ABORT.json')), 'ABORT_PRESENT_' + rep);
  const lock = J(RUN + '/' + rep + '/LOCK.json'), stdout = JSON.parse(readFileSync(resolve(LANE, 'evidence/execution-7c41ba89/' + rep + '-run.stdout.log'), 'utf8').trim().split('\n').at(-1));
  const filesOk = Object.entries(lock.files).every(([pop, f]) => ['rows', 'ledger', 'admission'].every((k) => fsha(RUN + '/' + rep + '/' + pop + '.' + k + '.json') === f[k]));
  locks[rep] = { lockSha256: fsha(RUN + '/' + rep + '/LOCK.json'), runnerReportedLockHash: stdout.lockHash, matches: stdout.lockHash === fsha(RUN + '/' + rep + '/LOCK.json'), filesVerified: filesOk, wallMs: lock.wallMs, preflight: lock.preflight,
    admission: Object.fromEntries(Object.entries(lock.files).map(([p, f]) => [p, { accepted: f.accepted, scheduled: f.scheduled, rate: f.accepted / f.scheduled, admissionPass: f.admissionPass }])) };
  ok(locks[rep].matches && filesOk, 'LOCK_VERIFICATION_FAILED_' + rep);
}
const an = J(RUN + '/ANALYSIS.json');
ok(an.registrationHash === reg.registrationHash && an.panels.length === 10, 'ANALYSIS_IDENTITY');
const pick = (e) => ({ mean: e.mean, ci95: e.ci95, adjustedLower: e.lower, adjustedUpper: e.upper, n: e.n, effectiveN: e.effectiveN, inference: e.inference });
const panels = Object.fromEntries(an.panels.map((p) => { const r = p.report; return [p.key, {
  numericCriteriaPass: r.numericCriteriaPass, equalities: Object.fromEntries(Object.entries(r.equalities).map(([k, v]) => [k, v.status])),
  primaries: Object.fromEntries(Object.entries(r.primaries).map(([k, e]) => [k, { ...pick(e), interpretation: e.interpretation }])),
  accuracy: Object.fromEntries(Object.entries(r.accuracy).map(([k, e]) => [k, { ...pick(e), pass: e.pass }])),
  catastrophe: Object.fromEntries(Object.entries(r.catastrophe).map(([k, e]) => [k, { mean: e.mean, adjustedUpper: e.upper, introductions: e.introductions, introductionUpper: e.introductionUpper, pass: e.pass }])),
  safety: Object.fromEntries(Object.entries(r.safety).map(([k, e]) => [k, { mean: e.mean, adjustedUpper: e.upper, pass: e.pass }])),
  regimes: Object.fromEntries(Object.entries(r.regimes).map(([k, e]) => [k, { ...pick(e), benefit: e.interpretation.benefit, materialHarm: e.interpretation.materialHarm, equivalent: e.interpretation.equivalent, support: e.support?.pass }])),
  nuisance: Object.fromEntries(['D4', 'IDENTITY', 'ORDER'].map((c) => { const xs = Object.entries(r.nuisance).filter(([k]) => k.startsWith(c + '/')); return [c, { pass: xs.filter(([, e]) => e.pass).length + '/' + xs.length, maxAdjustedUpper: Math.max(...xs.map(([, e]) => e.upper)), failing: xs.filter(([, e]) => !e.pass).map(([k]) => k) }]; })),
}]; }));
const keys = Object.keys(panels), pops = [...new Set(keys.map((k) => k.split('/')[1]))];
const groupPass = (p, g) => Object.values(p[g]).every((e) => e.pass);
const agreement = Object.fromEntries(pops.map((pop) => { const a = panels['A/' + pop], b = panels['B/' + pop]; return [pop, {
  primaryInterpretationsAgree: Object.keys(a.primaries).every((k) => a.primaries[k].interpretation === b.primaries[k].interpretation),
  catastrophePassAgree: groupPass(a, 'catastrophe') === groupPass(b, 'catastrophe'), safetyPassAgree: groupPass(a, 'safety') === groupPass(b, 'safety'),
  nuisancePassAgree: ['D4', 'IDENTITY', 'ORDER'].every((c) => a.nuisance[c].pass === b.nuisance[c].pass), numericCriteriaPassAgree: a.numericCriteriaPass === b.numericCriteriaPass }]; }));
const range = (f) => { const v = keys.map((k) => f(panels[k])); return [Math.min(...v), Math.max(...v)]; };
const totals = { scheduled: 0, accepted: 0 }; for (const rep of ['A', 'B']) for (const x of Object.values(locks[rep].admission)) { totals.scheduled += x.scheduled; totals.accepted += x.accepted; }
const menuInvalid = ['A', 'B'].flatMap((rep) => recount.replications[rep].nativeMenuInvalid.map((x) => ({ replication: rep, ...x })));
const disposition = an.disposition.classification, mapped = auth.verdictMapping[disposition] ?? null;
const verdict = disposition === 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFIED_POSITIVE' ? (recount.reconciliation === 'RECONCILED_EXACT' ? 'BOUNDED_SELECTOR_QUALIFIED' : 'BOUNDED_SELECTOR_INCONCLUSIVE') : (mapped ?? '').split(' ')[0];
writeExclusive(OUT, {
  schema: 'STAGE3H_V4_QUALIFICATION_SUMMARY_V1', registrationHash: reg.registrationHash, inheritanceHead: inh.head, protectedFiles: inh.protectedCount, rosterPreserved: inh.rosterPreserved,
  sourceIntegrity: { boundSources: Object.keys(reg.bindings.sources).length, allMatchAfterRun: true, runtimeIdentity: 'MATCH' }, analysis: { file: RUN + '/ANALYSIS.json', sha256: analysisStdout.analysisHash, disposition: an.disposition },
  locks, admissionTotals: { ...totals, rejected: totals.scheduled - totals.accepted, rate: totals.accepted / totals.scheduled },
  recount: { reconciliation: recount.reconciliation, reasons: { A: recount.replications.A.total.reasons, B: recount.replications.B.total.reasons }, nativeMenuInvalid: menuInvalid, limitations: recount.limitations },
  panels, agreement,
  ranges: { C_FULL_VS_B_mean: range((p) => p.primaries.C_FULL_VS_B.mean), D_FULL_VS_N_mean: range((p) => p.primaries.D_FULL_VS_N.mean), A_H0_SPECIALIST_mean: range((p) => p.primaries.A_H0_SPECIALIST.mean), B_H2_AVOIDANCE_mean: range((p) => p.primaries.B_H2_AVOIDANCE.mean),
    fullPopulationEffectiveN: range((p) => p.primaries.C_FULL_VS_B.effectiveN), H0EffectiveN: range((p) => p.primaries.A_H0_SPECIALIST.effectiveN), H2EffectiveN: range((p) => p.primaries.B_H2_AVOIDANCE.effectiveN) },
  failureCounts: { catastropheIntroductionsRN: keys.reduce((n, k) => n + panels[k].catastrophe.B_H2_AVOIDANCE.introductions, 0), catastropheIntroductionsRB: keys.reduce((n, k) => n + panels[k].catastrophe.A_H0_SPECIALIST.introductions + panels[k].catastrophe.C_FULL_VS_B.introductions, 0),
    panelsFailingCatastrophe: keys.filter((k) => !groupPass(panels[k], 'catastrophe')), panelsFailingBestOfGap: keys.filter((k) => !panels[k].safety.BEST_OF_GAP.pass), panelsFailingIdentityNuisance: keys.filter((k) => panels[k].nuisance.IDENTITY.failing.length),
    panelsFailingD4: keys.filter((k) => panels[k].nuisance.D4.failing.length), panelsFailingOrder: keys.filter((k) => panels[k].nuisance.ORDER.failing.length), panelsWithRegimeHarm: keys.filter((k) => Object.values(panels[k].regimes).some((e) => e.materialHarm)), panelsNotAllPrimaryBenefit: keys.filter((k) => Object.values(panels[k].primaries).some((e) => e.interpretation !== 'MATERIAL_BENEFIT_NUMERIC_ONLY')) },
  verdictMappingApplied: { disposition, mappingFixedBeforeLaunch: auth.verdictMapping[disposition], verdict },
  labels: { INDEPENDENT_METHOD_REVIEW: false, EXTERNAL_INDEPENDENT_CUSTODY: false, FULL_CANONICAL_STAGE3H_CERTIFIED: false, CANONICAL_MOE_GAIN: 'NOT_ESTABLISHED', CAN_DISPATCH: false, CAN_MUTATE_LIVE_WORLD: false, STAGE3I_STARTED: false },
  authority: 'R0',
});
console.log(JSON.stringify({ verdict, disposition, locks: { A: locks.A.lockSha256, B: locks.B.lockSha256 }, admissionTotals: totals, recount: recount.reconciliation }, null, 1));
