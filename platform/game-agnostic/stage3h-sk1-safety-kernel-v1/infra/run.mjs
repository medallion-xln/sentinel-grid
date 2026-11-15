// SK1 prospective experiment runner (one pass). Nothing is trained, tuned or selected here.
//   node infra/run.mjs freeze [--write]   bind code, models, populations and rules BEFORE any validation outcome is read
//   node infra/run.mjs audit <i> <n>      identity / public-only audit of the kernel on shard i of n (no truth is loaded)
//   node infra/run.mjs run                ONE pass: decisions, metrics, gates, classification; writes the result exactly once
//   node infra/run.mjs check              recompute everything and compare with the stored result; writes NOTHING and
//                                         verifies that no file, hash or lock state changed while it ran
// Integrity properties (each has a negative control in tests/runner-controls.test.mjs):
//   * code is hash-bound and must equal the committed HEAD blobs at freeze time
//   * VALIDATION outcomes are chmod 000 until `run`; a start marker makes a second or a resumed run impossible
//   * the population is re-checked against the fail-closed exclusion registry immediately before the run
//   * the kernel receives ONLY the public projection, the legal menu and canonical evidence; it rejects privileged fields
//   * a malformed decision is counted as illegal, never repaired
import { readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makePolicy } from '../../stage3h-hw4-value-band-v1/hw4-policy.mjs';
import { loadForgeKernel } from '../api/host.mjs';
import { loadSk1Exclusions, contamination } from './exclusions.mjs';
import { loadAllocation, blockSchedule, ALLOCATION_FILE } from './allocator.mjs';
import { loadManifest, loadPopulation, outcomeFileModes, classDir, summaryPath, registryPath, RESULT_FILE } from './population.mjs';
import { auditClass, CONTROLS, TESTS } from './audit-class.mjs';
import { evaluate, RULES } from './evaluate.mjs';
import { LANE, GA, REPO, WORK, EVIDENCE, GIT, sha, fileSha, readJ, fail, writeExclusive, exists } from './common.mjs';

const FREEZE_FILE = resolve(EVIDENCE, 'SK1_EXPERIMENT_FREEZE.json'), MARKER_FILE = resolve(EVIDENCE, 'SK1_VALIDATION_RUN_MARKER.json'), AUDIT_DIR = resolve(WORK, 'audit'), AUDIT_SHARDS = 8;
const MODEL = resolve(LANE, 'models/SK1_MODEL.json'), MODEL_NOEV = resolve(LANE, 'models/SK1_MODEL_NO_EVIDENCE.json'), C10 = resolve(GA, 'stage3h-hw4-value-band-v1/models/V1_PUBLIC_ONLY_C10_BASE_SAFE_FIRST.json');
const C10_FROZEN_SHA = '41ce761cbeeb2c110a1564cc0f28aa7c773f53587045fc5b04fd72d192d5858e';
const CODE_DIRS = ['kernel', 'adapters/forge', 'adapters/rescue', 'api', 'infra'];
const EVAL_DEPS = ['stage3h-hw1-dev-v1/hw1-eval.mjs', 'stage3h-hw1-dev-v1/i2-screen.mjs', 'stage3h-hw1-dev-v1/i2-build-class.mjs', 'stage3h-hw1-dev-v1/i2-registry.mjs', 'stage3h-hw1-dev-v1/i2-pcd.mjs', 'stage3h-hw1-dev-v1/transforms.mjs', 'stage3h-hw1-dev-v1/i3-audit-class.mjs', 'stage3h-hw1-dev-v1/i3-features.mjs',
  'stage3h-hw1-dev-v1/public-projection.mjs', 'stage3h-hw4-value-band-v1/hw4-policy.mjs', 'stage3h-hw4-value-band-v1/hw4-features.mjs', 'stage3h-failure-diagnosis-v1/lib.mjs', 'stage3h-safety-feasibility-v1/twins.mjs', 'stage3h-safety-feasibility-v1/search.mjs', 'stage3h-owner-governed-v1/connector.mjs', 'stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs'];
const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const codeFiles = () => CODE_DIRS.flatMap((d) => readdirSync(resolve(LANE, d)).filter((n) => /\.(mjs|json)$/.test(n)).sort().map((n) => `${d}/${n}`));

function freezeCore() {
  const vm = loadManifest('VALIDATION'), em = loadManifest('EXPLORATION'), train = readJ(resolve(EVIDENCE, 'SK1_TRAINING_RECORD.json'));
  if (fileSha(C10) !== C10_FROZEN_SHA) fail('FROZEN_C10_MODEL_CHANGED');
  if (train.modelFiles['models/SK1_MODEL.json'] !== fileSha(MODEL) || train.modelFiles['models/SK1_MODEL_NO_EVIDENCE.json'] !== fileSha(MODEL_NOEV) || train.population.classListDigest !== em.classListDigest || train.validationOpened !== false) fail('MODEL_DOES_NOT_MATCH_TRAINING_RECORD');
  return { codeHashes: Object.fromEntries(codeFiles().map((f) => [f, fileSha(resolve(LANE, f))])), evaluationDependencies: Object.fromEntries(EVAL_DEPS.map((f) => [f, fileSha(resolve(GA, f))])),
    models: { SK1: { file: 'models/SK1_MODEL.json', sha256: fileSha(MODEL), modelHash: readJ(MODEL).modelHash, ranking: readJ(MODEL).ranking }, SK1_NO_EVIDENCE: { file: 'models/SK1_MODEL_NO_EVIDENCE.json', sha256: fileSha(MODEL_NOEV), modelHash: readJ(MODEL_NOEV).modelHash }, C10: { file: 'stage3h-hw4-value-band-v1/models/V1_PUBLIC_ONLY_C10_BASE_SAFE_FIRST.json', sha256: C10_FROZEN_SHA } },
    populations: { EXPLORATION: { summarySha256: fileSha(summaryPath('EXPLORATION')), classListDigest: em.classListDigest, classes: em.classCount, registrySha256: fileSha(registryPath('EXPLORATION')) }, VALIDATION: { summarySha256: fileSha(summaryPath('VALIDATION')), classListDigest: vm.classListDigest, classes: vm.classCount, registrySha256: fileSha(registryPath('VALIDATION')), dataFiles: vm.dataFiles.map((d) => ({ file: d.file, sha256: d.sha256 })) } },
    allocationSha256: fileSha(ALLOCATION_FILE), exclusionRegistrySha256: fileSha(resolve(LANE, 'infra/exclusion-registry.json')), trainingRecordSha256: fileSha(resolve(EVIDENCE, 'SK1_TRAINING_RECORD.json')), designFreezeSha256: fileSha(resolve(LANE, 'SK1_DESIGN_FREEZE.md')), rules: RULES };
}
function freeze(write) {
  const vm = loadManifest('VALIDATION'); if (!outcomeFileModes(vm).every((m) => m === 0)) fail('VALIDATION_OUTCOME_FILES_NOT_LOCKED_AT_FREEZE'); if (exists(RESULT_FILE) || exists(MARKER_FILE)) fail('VALIDATION_ALREADY_STARTED');
  const core = freezeCore(), head = git('rev-parse', 'HEAD').trim(), notCommitted = [];
  for (const f of Object.keys(core.codeHashes)) { let blob = null; try { blob = sha(execFileSync(GIT, ['-C', REPO, 'show', `HEAD:${relative(REPO, resolve(LANE, f))}`], { maxBuffer: 1 << 28 })); } catch { /* not tracked */ } if (blob !== core.codeHashes[f]) notCommitted.push(f); }
  for (const f of ['models/SK1_MODEL.json', 'models/SK1_MODEL_NO_EVIDENCE.json', 'SK1_DESIGN_FREEZE.md']) { let blob = null; try { blob = sha(execFileSync(GIT, ['-C', REPO, 'show', `HEAD:${relative(REPO, resolve(LANE, f))}`], { maxBuffer: 1 << 28 })); } catch { /* not tracked */ } if (blob !== fileSha(resolve(LANE, f))) notCommitted.push(f); }
  if (notCommitted.length) fail('CODE_OR_MODEL_NOT_COMMITTED_AT_HEAD:' + notCommitted.join(','));
  const modifiedDeps = EVAL_DEPS.filter((f) => git('status', '--porcelain', '--', `platform/game-agnostic/${f}`).trim() !== '');
  const rec = { schema: 'SK1_EXPERIMENT_FREEZE_V1', authority: 'R0', stage: 'STAGE3H-SK1', frozenAt: new Date().toISOString(), node: process.version, repoHead: head, codeAndModelsEqualCommittedHead: true, validationOutcomesLockedAtFreeze: true, validationOutcomesAccessedBeforeFreeze: false,
    evaluationDependenciesDifferingFromHead: modifiedDeps, evaluationDependencyNote: 'Evaluation-side files only (never in the kernel inference graph). stage3h-hw1-dev-v1/public-projection.mjs carries the pre-existing uncommitted, identity-preserving import cut; the kernel does not import it.', ...core };
  console.log(JSON.stringify({ repoHead: head, codeFiles: Object.keys(core.codeHashes).length, models: Object.fromEntries(Object.entries(core.models).map(([k, v]) => [k, v.sha256.slice(0, 12)])), validationClasses: core.populations.VALIDATION.classes, evaluationDependenciesDifferingFromHead: modifiedDeps, ranking: core.models.SK1.ranking }, null, 1));
  if (write) { writeExclusive(FREEZE_FILE, rec); console.log('frozen ' + relative(REPO, FREEZE_FILE)); }
}
function checkFreeze() {
  if (!exists(FREEZE_FILE)) fail('SK1_EXPERIMENT_FREEZE_MISSING');
  const rec = readJ(FREEZE_FILE), now = freezeCore(); for (const k of Object.keys(now)) if (JSON.stringify(rec[k]) !== JSON.stringify(now[k])) fail('SK1_FREEZE_MISMATCH:' + k); return rec;
}
const schedules = (ctx, alloc) => { const m = new Map(); return (b, k) => { if (!m.has(b)) m.set(b, new Map(blockSchedule(ctx, b, alloc).map((c) => [c.k, c]))); return m.get(b).get(k); }; };

function auditShard(i, n) {
  if (n !== AUDIT_SHARDS || !(Number.isInteger(i) && i >= 0 && i < n)) fail(`USAGE: node infra/run.mjs audit <i> ${AUDIT_SHARDS}`);
  checkFreeze(); const man = loadManifest('VALIDATION'), ctx = loadSk1Exclusions(), comboFor = schedules(ctx, loadAllocation()), { kernel, featurizer } = loadForgeKernel(MODEL), t0 = Date.now();
  const records = man.classes.filter((_, j) => j % n === i).map((c) => auditClass(c, comboFor(c.block, c.k), kernel, featurizer));
  mkdirSync(AUDIT_DIR, { recursive: true }); writeExclusive(resolve(AUDIT_DIR, `audit-shard-${i}-of-${n}.json`), JSON.stringify({ shard: i, of: n, seconds: (Date.now() - t0) / 1000, records }));
  console.log(JSON.stringify({ shard: i, of: n, classes: records.length, seconds: (Date.now() - t0) / 1000 }));
}
export function mergeAudit(records, expectedIds) {
  const ids = records.map((r) => r.id); if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify([...expectedIds].sort())) fail('AUDIT_COVERAGE_MISMATCH');
  const set = {}, kind = {}, ctl = {}, add = (o, t, v) => { const e = (o[t] ??= { n: 0, bad: 0 }); e.n += v.n; e.bad += v.bad; };
  for (const r of records) { for (const t of TESTS) { if (r.byTest[t]) add(set, t, r.byTest[t]); if (r.kind[t]) add(kind, t, r.kind[t]); } for (const [c, tests] of Object.entries(r.controls)) for (const [t, v] of Object.entries(tests)) add((ctl[c] ??= {}), t, v); }
  const sum = (f) => records.reduce((a, r) => a + f(r), 0), km = records.flatMap((r) => r.kernelMs), q = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { identity: { set, kind }, controls: Object.fromEntries(Object.entries(CONTROLS).map(([c, d]) => [c, { expected: d.expect, detectedOn: d.expect.map((t) => ({ test: t, ...(ctl[c]?.[t] ?? { n: 0, bad: 0 }) })) }])),
    totals: { classes: records.length, twins: sum((r) => r.twins), decisions: sum((r) => r.legality.decisions), illegal: sum((r) => r.legality.illegal), repeatMismatch: sum((r) => r.repeatMismatch), poisonMismatch: sum((r) => r.poisonMismatch), d4Unlawful: sum((r) => r.d4Unlawful), hiddenNonEquivalentRejected: sum((r) => r.hiddenNonEquivalent),
      featureFrames: sum((r) => r.features.frames), featureFrameMismatch: sum((r) => r.features.bad), maxReadPaths: Math.max(...records.map((r) => r.reads)), unallowedReads: [...new Set(records.flatMap((r) => r.unallowed))], evidenceNotValidOnSomeView: sum((r) => r.evidenceNotValid) },
    compute: { kernelDecisions: km.length, kernelMedianMs: q(km, 0.5), kernelMaxMs: Math.max(...km), evidenceMedianMs: q(records.flatMap((r) => r.evidenceMs), 0.5) } };
}
const loadAuditRecords = () => { const files = readdirSync(AUDIT_DIR).filter((f) => /^audit-shard-\d+-of-\d+\.json$/.test(f)).sort(); if (files.length !== AUDIT_SHARDS) fail(`AUDIT_SHARDS_INCOMPLETE:${files.length}/${AUDIT_SHARDS}`); return files.flatMap((f) => readJ(resolve(AUDIT_DIR, f)).records); };

/** Shared by run and check. phase: 'RUN' | 'CHECK'. */
function compute(phase) {
  const fr = checkFreeze(), man = loadManifest('VALIDATION'), ctx = loadSk1Exclusions();
  const bad = contamination(ctx, man.classes.map((c) => ({ id: c.id, block: c.block, worldHash: c.worldHash, fine: c.fine, coarse: c.coarse }))); if (bad.length) fail('VALIDATION_POPULATION_CONTAMINATED:' + JSON.stringify(bad.slice(0, 3)));
  const audit = mergeAudit(loadAuditRecords(), man.classes.map((c) => c.id));
  const { classes } = loadPopulation('VALIDATION', phase), t0 = Date.now();
  if (classes.some((c) => c.population !== 'VALIDATION' || !c.evidence)) fail('VALIDATION_CLASS_RECORD_INCOMPLETE');
  const result = evaluate({ classes, kernel: loadForgeKernel(MODEL).kernel, kernelNoEvidence: loadForgeKernel(MODEL_NOEV).kernel, c10: makePolicy(readJ(C10)), audit });
  return { fr, audit, result, seconds: (Date.now() - t0) / 1000 };
}
function run() {
  if (exists(RESULT_FILE)) fail('VALIDATION_ALREADY_RUN_ONCE'); if (exists(MARKER_FILE)) fail('PREVIOUS_RUN_STARTED_BUT_DID_NOT_FINISH_OWNER_DECISION_REQUIRED');
  checkFreeze(); if (!outcomeFileModes(loadManifest('VALIDATION')).every((m) => m === 0)) fail('VALIDATION_OUTCOME_FILES_OPENED_BEFORE_RUN');
  writeExclusive(MARKER_FILE, { schema: 'SK1_VALIDATION_RUN_MARKER_V1', startedAt: new Date().toISOString(), freezeSha256: fileSha(FREEZE_FILE), note: 'Written before any validation outcome is read. Its presence without a result file means a run started and did not finish.' });
  const { audit, result, seconds } = compute('RUN');
  const out = { schema: 'SK1_VALIDATION_RESULTS_V1', authority: 'R0', stage: 'STAGE3H-SK1', population: 'VALIDATION', node: process.version, freezeSha256: fileSha(FREEZE_FILE), markerSha256: fileSha(MARKER_FILE), evaluatedOnce: true, holdoutClasses: 0,
    disclosure: 'DEV-limited prospective result on Forge World under one observation contract. Zero observed introductions would be a finite-sample observation, never a universal guarantee. VALIDATION origin families are disjoint from EXPLORATION families.', audit, ...result, elapsedSeconds: seconds };
  writeExclusive(RESULT_FILE, out); print(out); console.log('written ' + relative(REPO, RESULT_FILE));
}
function check() {
  const snapshot = () => sha(JSON.stringify([...readdirSync(EVIDENCE).sort().map((n) => [n, fileSha(resolve(EVIDENCE, n))]), ...readdirSync(resolve(LANE, 'models')).sort().map((n) => [n, fileSha(resolve(LANE, 'models', n))]), ...readdirSync(classDir('VALIDATION')).sort().map((n) => [n, statSync(resolve(classDir('VALIDATION'), n)).mode & 0o777, statSync(resolve(classDir('VALIDATION'), n)).size])]));
  const before = snapshot(), stored = readJ(RESULT_FILE), { result } = compute('CHECK'), after = snapshot();
  const keys = ['classification', 'safetyKernelDevQualified', 'executionValid', 'policies', 'gatesAsSpecified', 'gatesForcedChoice', 'paired', 'calibration', 'uncertainty', 'failureBreakdown', 'reproducibility', 'perClass'];
  const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'compute' || /Ms$/.test(k) ? undefined : v))), diff = keys.filter((k) => JSON.stringify(strip(stored[k])) !== JSON.stringify(strip(result[k])));
  console.log(JSON.stringify({ checkMode: true, wroteAnything: false, filesAndLocksUnchanged: before === after, reproducedKeys: keys.length - diff.length, of: keys.length, differing: diff, storedDecisionDigest: stored.reproducibility.decisionDigest, recomputedDecisionDigest: result.reproducibility.decisionDigest }, null, 1));
  if (before !== after || diff.length) { console.log('SK1_CHECK_FAILED'); process.exitCode = 1; } else console.log('SK1_CHECK_PASS');
}
function print(o) {
  const p = o.policies, row = (x) => x && ({ classes: x.classes ?? x.decidedClasses, introS0: x.introVsS0, introNexus: x.introVsNexus, cat: x.catastrophicClasses, dS0: x.regretDeltaVsS0 && [+x.regretDeltaVsS0.point.toFixed(4), +x.regretDeltaVsS0.upper95.toFixed(4)], dNex: x.regretDeltaVsNexus && [+x.regretDeltaVsNexus.point.toFixed(4), +x.regretDeltaVsNexus.upper95.toFixed(4)] });
  console.log(JSON.stringify({ classification: o.classification, qualified: o.safetyKernelDevQualified, executionValid: o.executionValid, executionGates: o.executionGates, coverage: p.SK1_AS_SPECIFIED.decisionCoverage, abstentions: p.SK1_AS_SPECIFIED.abstentions,
    S0: row(p.S0), NEXUS: row(p.NEXUS), C10: row(p.C10), SK1_AS_SPECIFIED: row(p.SK1_AS_SPECIFIED), SK1_FORCED: row(p.SK1_FORCED_CHOICE), SK1_NO_EVIDENCE: row(p.SK1_NO_EVIDENCE_FORCED_CHOICE), gatesAsSpecified: o.gatesAsSpecified, gatesForcedChoice: o.gatesForcedChoice, material: o.materialImprovement,
    pairedVsC10: Object.fromEntries(Object.entries(o.paired.SK1_FORCED_minus_C10).map(([k, v]) => [k, [+v.point.toFixed(4), +v.lower025.toFixed(4), +v.upper975.toFixed(4)]])), uncertainty: o.uncertainty, compute: o.compute, auditTotals: o.audit?.totals, identity: o.audit?.identity, controls: o.audit && Object.fromEntries(Object.entries(o.audit.controls).map(([c, d]) => [c, d.detectedOn])) }, null, 1));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, a1, a2] = process.argv.slice(2);
  if (mode === 'freeze') freeze(process.argv.includes('--write')); else if (mode === 'audit') auditShard(Number(a1), Number(a2)); else if (mode === 'run') run(); else if (mode === 'check') check();
  else fail('USAGE: node infra/run.mjs freeze [--write] | audit <i> <n> | run | check');
}
