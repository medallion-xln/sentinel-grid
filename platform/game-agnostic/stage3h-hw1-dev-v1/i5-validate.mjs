// H-W1 I-5 validation (R0, DEV). Candidate selection on the frozen VALIDATION population: every frozen candidate (models/C*.json, at most 20) is evaluated exactly once against both frozen
// comparators (S0 and Nexus-else-S0) and the contract's acceptance rules are applied unchanged. Nothing is trained, tuned or re-selected here; the candidate set is the sealed I-4 set.
//   node i5-validate.mjs freeze [--write]   record the candidate freeze (model / code / contract / population hashes) BEFORE any validation outcome is read
//   node i5-validate.mjs audit <i> <n>      identity and public-only audit of every candidate on shard i of n of the VALIDATION classes (manifest only; no truth is loaded)
//   node i5-validate.mjs run [--write]      decisions, metrics and acceptance; merges the audit shards; requires the freeze record and unchanged hashes
// A candidate is rejected on any introduction vs either comparator (base plus twins), any invariance violation, any illegal action, or a regret rule miss (point <= -0.02 and one-sided 95%
// cluster-bootstrap upper bound < 0, each comparator). Zero observed introductions is a finite-sample observation (C1/C2), never a universal guarantee (C3).
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { LANE, loadAllocation, loadExclusions, blockSchedule } from './i2-allocator.mjs';
import { loadManifest, loadPopulation, classDir, manifestPath } from './i2-population.mjs';
import { auditClass, CONTROLS } from './i3-audit-class.mjs';
import { makePolicy } from './i3-policy.mjs';
import { actionFeatures } from './i3-features.mjs';
import { TYPE_NAMES } from './i4-data.mjs';
import { evalClass, aggregate, REGRET_THRESHOLD, CATASTROPHE, RESAMPLES, BOOTSTRAP_SEED, zeroEventUpper } from './hw1-eval.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex'), q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
// HW1_I5_SMOKE=1 exercises the identical code paths on the first HW1_I5_SMOKE_CLASSES classes of the (spent, unlocked) EXPLORATION population: no freeze record is required, nothing is written, and
// VALIDATION is never selected. It exists so a driver defect is found before the freeze binds this file's hash and before any validation outcome is unlocked.
const SMOKE = process.env.HW1_I5_SMOKE === '1', POP = SMOKE ? 'EXPLORATION' : 'VALIDATION', SMOKE_N = Number(process.env.HW1_I5_SMOKE_CLASSES ?? 24), popClasses = (man) => (SMOKE ? man.classes.slice(0, SMOKE_N) : man.classes);
const MODELS = resolve(LANE, 'models'), EVIDENCE = resolve(LANE, 'evidence'), WORK = resolve(LANE, SMOKE ? 'work/i5-smoke' : 'work/i5'), MAX_CANDIDATES = 20, TESTS = ['RELABEL', 'MENU', 'D4', 'HIDDEN'];
const CONTRACT = resolve(LANE, '../stage3h-wider-action-feasibility-v1/H_W1_CONTRACT.json'), FREEZE_FILE = resolve(EVIDENCE, 'I5_CANDIDATE_FREEZE.json'), RESULT_FILE = resolve(EVIDENCE, 'I5_VALIDATION_RESULTS.json');
const CODE = ['i3-policy.mjs', 'i3-features.mjs', 'public-projection.mjs', 'hw1-eval.mjs', 'transforms.mjs', 'i3-audit-class.mjs', 'i2-population.mjs', 'i5-validate.mjs'];
const POLICY_SOURCES = ['i3-policy.mjs', 'i3-features.mjs', 'public-projection.mjs'];
const RULES = Object.freeze({ introductionsVsS0: 0, introductionsVsNexus: 0, illegalActions: 0, invarianceViolations: 0, regretPointMax: REGRET_THRESHOLD, regretUpper95Below: 0, resamples: RESAMPLES, seed: BOOTSTRAP_SEED, catastropheRegret: CATASTROPHE, decisionMedianMsMax: 100, decisionMaxMsMax: 1000 });

function loadModels() {
  const files = readdirSync(MODELS).filter((n) => /^C\d+_.*\.json$/.test(n)).sort(); if (!files.length || files.length > MAX_CANDIDATES) throw Error('CANDIDATE_COUNT_INVALID:' + files.length);
  return files.map((f) => { const raw = readFileSync(resolve(MODELS, f)); return { id: f.replace(/\.json$/, ''), file: f, sha256: sha(raw), model: JSON.parse(raw) }; });
}

/** Static check over the TRANSITIVE import closure of the policy sources. The I-3 rule (flat: node:* and two sibling files only) flags the frozen kernel's name tables and orientation geometry, which
 *  the policy legitimately uses (FORGE_*_TYPE_NAMES, orientDirection, DIRECTION_DELTAS), so it was a false positive. This audit is stricter in a different way: every file reachable from the policy is
 *  hashed and bound into the freeze, may import only node:crypto or another closure file, may not import evaluator / population / label modules, and may not use file, network, clock, random or
 *  environment APIs (i3-policy.mjs may call performance.now(): it only fills the returned `ms` field, which no decision reads and the reproducibility digest excludes). */
const GA = resolve(LANE, '..'), FORBIDDEN_SPEC = /evaluator|hw1-eval|(^|\/)(i[245]-|i3-audit)|lib\.mjs|stage3h-(?!hw1-dev)|\/scripts\/|\/work\/|\/evidence\/|^node:(?!crypto$)/;
const FORBIDDEN_TOKEN = /\b(readFileSync|readFile|writeFileSync|writeFile|fetch|Math\.random|Date\.now|new Date|process\.env|performance\.now|child_process|XMLHttpRequest)\b/g, TOKEN_EXEMPT = { 'i3-policy.mjs': ['performance.now'] };
/** The one documented edge that is NOT held to the strict rule. public-projection.mjs imports D4_ELEMENTS (= the kernel's ORIENTATIONS constant) from transforms.mjs, which is the twin-generation tooling and
 *  therefore imports lib.mjs and scripts/stage3g/evidence.mjs (evaluator-capable). Nothing on the decision path calls them: decide() receives only a view or projection, never a world or a truth vector.
 *  The edge is NOT removed because public-projection.mjs is hash-pinned by sealed evidence (I1_PUBLIC_INPUT_AUDIT, I2_PCD_VALIDATION, I4_EXPLORATION_RESULTS, LANE_CONTENT_AUDIT_I1) and VALIDATION is frozen against it.
 *  Files reachable only through this edge are still listed, hashed and bound into the freeze, and the result records the edge as a limitation (knownLimitations). */
const DOCUMENTED_EDGES = [{ from: 'public-projection.mjs', to: './transforms.mjs', uses: ['D4_ELEMENTS'], reason: 'D4_ELEMENTS is the kernel ORIENTATIONS constant re-exported by the twin tooling; removing the edge would change a hash-pinned I-1 source' }];
const edgeKey = (from, spec) => DOCUMENTED_EDGES.some((e) => e.from === from && e.to === spec);
function closure(skipEdges) {
  const files = new Map(), walk = (f) => {
    f = resolve(f); if (files.has(f)) return; const src = readFileSync(f, 'utf8'), specs = [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    files.set(f, { specs, src }); const rel = f.startsWith(LANE + '/') ? f.slice(LANE.length + 1) : f; for (const s of specs) if (s.startsWith('.') && !(skipEdges && edgeKey(rel, s))) walk(resolve(f, '..', s));
  };
  for (const f of POLICY_SOURCES) walk(resolve(LANE, f));
  return files;
}
function importAudit() {
  const strict = closure(true), full = closure(false), relOf = (f) => (f.startsWith(LANE + '/') ? f.slice(LANE.length + 1) : f.slice(GA.length + 1));
  const describe = (f, { specs, src }) => { const rel = relOf(f), exempt = TOKEN_EXEMPT[rel] ?? [];
    return { file: rel, sha256: sha(src), imports: specs, forbiddenImports: specs.filter((s) => (FORBIDDEN_SPEC.test(s) || !(s.startsWith('.') || s === 'node:crypto')) && !edgeKey(rel, s)), forbiddenTokens: [...new Set([...src.matchAll(FORBIDDEN_TOKEN)].map((m) => m[1]))].filter((t) => !exempt.includes(t)) }; };
  const byName = (a, b) => (a.file < b.file ? -1 : 1), files = [...strict].map(([f, v]) => describe(f, v)).sort(byName), edgeOnly = [...full].filter(([f]) => !strict.has(f)).map(([f, v]) => describe(f, v)).sort(byName);
  return { rule: 'transitive closure of the policy sources: node:crypto and closure-relative imports only; no evaluator/population/label modules; no file/network/clock/random/env APIs; one documented tooling edge', sources: POLICY_SOURCES, files,
    documentedEdges: DOCUMENTED_EDGES, edgeOnlyFiles: edgeOnly, edgeOnlyFlagged: edgeOnly.reduce((a, r) => a + r.forbiddenImports.length + r.forbiddenTokens.length, 0),
    forbidden: files.flatMap((r) => [...r.forbiddenImports.map((v) => ({ file: r.file, kind: 'IMPORT', value: v })), ...r.forbiddenTokens.map((v) => ({ file: r.file, kind: 'TOKEN', value: v }))]) };
}

const outcomeFileModes = (man) => man.dataFiles.map((d) => statSync(resolve(classDir('VALIDATION'), d.file)).mode & 0o777);
const freezeCore = () => {
  const man = loadManifest('VALIDATION'), exp = loadManifest('EXPLORATION'), cands = loadModels();
  return { contractSha256: sha(readFileSync(CONTRACT)), allocationHash: loadAllocation().hash, candidates: cands.map((c) => ({ id: c.id, file: c.file, sha256: c.sha256, policyId: c.model.policyId, rule: c.model.score.rule })),
    codeHashes: Object.fromEntries(CODE.map((f) => [f, sha(readFileSync(resolve(LANE, f)))])), importClosure: (() => { const a = importAudit(); return { strict: a.files.map(({ file, sha256 }) => ({ file, sha256 })), edgeOnly: a.edgeOnlyFiles.map(({ file, sha256 }) => ({ file, sha256 })), documentedEdges: a.documentedEdges }; })(), rules: RULES,
    validation: { manifestSha256: sha(readFileSync(manifestPath('VALIDATION'))), classListDigest: man.classListDigest, classCount: man.classCount, dataFiles: man.dataFiles.map((d) => ({ file: d.file, sha256: d.sha256 })), registry: man.registry },
    exploration: { manifestSha256: sha(readFileSync(manifestPath('EXPLORATION'))), classListDigest: exp.classListDigest } };
};

function freeze(write) {
  const man = loadManifest('VALIDATION'), modes = outcomeFileModes(man);
  if (!modes.every((m) => m === 0)) throw Error('VALIDATION_OUTCOME_FILES_NOT_LOCKED_AT_FREEZE');
  if (man.classCount < 300) throw Error('VALIDATION_BELOW_MINIMUM');
  let head = 'unknown'; try { head = execFileSync('git', ['-C', LANE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* recorded as unknown */ }
  const rec = { schema: 'STAGE3H_HW1_I5_CANDIDATE_FREEZE_V1', authority: 'R0', stage: 'I-5', frozenAt: new Date().toISOString(), node: process.version, repoHead: head, maxCandidates: MAX_CANDIDATES, validationOutcomeFilesLockedAtFreeze: true,
    validationOutcomesAccessedBeforeFreeze: false, ...freezeCore(), imports: importAudit() };
  if (rec.imports.forbidden.length) throw Error('FORBIDDEN_POLICY_DEPENDENCY:' + JSON.stringify(rec.imports.forbidden));
  console.log(JSON.stringify({ closureFiles: rec.imports.files.map((f) => `${f.file}:${f.sha256.slice(0, 10)}`), candidates: rec.candidates.map((c) => `${c.id}:${c.sha256.slice(0, 12)}`), validationClasses: rec.validation.classCount, classListDigest: rec.validation.classListDigest.slice(0, 16), locked: modes.length, rules: RULES }, null, 1));
  if (write) { writeExclusive(FREEZE_FILE, rec); console.log('written ' + FREEZE_FILE); }
  return rec;
}

function checkFreeze() {
  if (!existsSync(FREEZE_FILE)) throw Error('I5_FREEZE_RECORD_MISSING');
  const rec = JSON.parse(readFileSync(FREEZE_FILE, 'utf8')), now = freezeCore();
  for (const k of ['contractSha256', 'allocationHash', 'candidates', 'codeHashes', 'importClosure', 'rules', 'validation', 'exploration']) if (JSON.stringify(rec[k]) !== JSON.stringify(now[k])) throw Error('I5_FREEZE_MISMATCH:' + k);
  return rec;
}

function auditShard(i, n) {
  if (!(Number.isInteger(i) && Number.isInteger(n) && i >= 0 && i < n)) throw Error('USAGE: node i5-validate.mjs audit <i> <n>');
  if (!SMOKE) checkFreeze(); // the audit needs only the manifest (ids, blocks, world hashes); no outcome field is read
  const man = loadManifest(POP), alloc = loadAllocation(), ctx = loadExclusions(SMOKE ? [] : [resolve(EVIDENCE, 'I2_REGISTRY_EXPLORATION.json')]), sched = new Map(), t0 = Date.now();
  const comboFor = (b, k) => { if (!sched.has(b)) sched.set(b, new Map(blockSchedule(ctx, POP, b, alloc).map((c) => [c.k, c]))); return sched.get(b).get(k); };
  const policies = Object.fromEntries(loadModels().map((c) => [c.id, makePolicy(c.model)]));
  const records = popClasses(man).filter((_, j) => j % n === i).map((c) => auditClass(c, comboFor(c.block, c.k), policies));
  mkdirSync(WORK, { recursive: true }); writeExclusive(resolve(WORK, `audit-shard-${i}-of-${n}.json`), { population: POP, shard: i, of: n, seconds: (Date.now() - t0) / 1000, records });
  console.log(JSON.stringify({ shard: i, of: n, classes: records.length, seconds: (Date.now() - t0) / 1000 }));
}

function mergeAudit(man, names) {
  const files = readdirSync(WORK).filter((f) => /^audit-shard-\d+-of-\d+\.json$/.test(f)).sort(); if (!files.length) throw Error('NO_AUDIT_SHARDS');
  const ofs = new Set(files.map((f) => f.match(/of-(\d+)/)[1])); if (ofs.size !== 1) throw Error('AUDIT_SHARD_PLAN_MIXED');
  const of = Number([...ofs][0]); if (files.length !== of) throw Error(`AUDIT_SHARDS_INCOMPLETE:${files.length}/${of}`);
  const records = files.flatMap((f) => JSON.parse(readFileSync(resolve(WORK, f), 'utf8')).records), ids = records.map((r) => r.id);
  if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify(popClasses(man).map((c) => c.id).sort())) throw Error('AUDIT_COVERAGE_MISMATCH');
  const per = Object.fromEntries(names.map((n) => [n, { orbit: {}, index: {} }])), ctl = {};
  for (const r of records) {
    for (const n of names) for (const kind of ['orbit', 'index']) for (const t of TESTS) { const src = kind === 'orbit' ? r.byTest[n]?.[t] : r.index[n]?.[t]; if (!src) continue; const e = (per[n][kind][t] ??= { n: 0, bad: 0 }); e.n += src.n; e.bad += src.bad; }
    for (const [c, tests] of Object.entries(r.controls)) for (const [t, v] of Object.entries(tests)) { const e = ((ctl[c] ??= {})[t] ??= { n: 0, bad: 0 }); e.n += v.n; e.bad += v.bad; }
  }
  const sum = (f) => records.reduce((a, r) => a + f(r), 0), ms = records.flatMap((r) => r.ms);
  const totals = { classes: records.length, twins: sum((r) => r.twins), d4Unlawful: sum((r) => r.d4Unlawful), hiddenNonEquivalentRejected: sum((r) => r.hiddenNonEquivalent), decisions: sum((r) => r.legality.decisions), illegal: sum((r) => r.legality.illegal),
    repeatMismatch: sum((r) => r.repeatMismatch), poisonMismatch: sum((r) => r.poisonMismatch), featureFrames: sum((r) => r.features.frames), featureFrameMismatch: sum((r) => r.features.bad), maxReadPaths: Math.max(...records.map((r) => r.reads)),
    unallowedReads: [...new Set(records.flatMap((r) => r.unallowed))] };
  const testN = Object.fromEntries(TESTS.map((t) => [t, names.reduce((a, n) => a + (per[n].orbit[t]?.n ?? 0), 0)]));
  const controls = Object.fromEntries(Object.entries(CONTROLS).map(([c, d]) => [c, { expected: d.expect, detectedOn: d.expect.map((t) => ({ test: t, ...ctl[c]?.[t] })), allTests: ctl[c] }]));
  const identityBad = Object.fromEntries(names.map((n) => [n, ['orbit', 'index'].flatMap((k) => TESTS.map((t) => per[n][k][t]?.bad ?? 0)).reduce((a, b) => a + b, 0)]));
  return { shards: files.length, totals, testExercised: testN, identityByPolicy: per, identityBad, controls, compute: { decisions: ms.length, medianMs: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: Math.max(...ms) } };
}

/** Every candidate decides every class once from the stored public projection only; truth is not touched until all decisions are fixed. */
function decideAllClasses(cands, classes) {
  return cands.map((c) => {
    const pol = makePolicy(c.model);
    return classes.map((cls) => { try { const d = pol.decideProjection(cls.projection); return { index: d.index, orbit: d.orbit, tied: d.tied, scores: d.scores, ms: d.ms }; } catch (e) { if (e.message === 'POLICY_ILLEGAL_ACTION') return { illegal: true, orbit: [], scores: [], ms: 0 }; throw e; } });
  });
}
const decisionDigest = (dec) => sha(JSON.stringify(dec.map((per) => per.map((d) => [d.index ?? -1, d.orbit, d.scores]))));

function run(write) {
  process.env.HW1_PHASE = 'I5';
  const fr = SMOKE ? { imports: importAudit() } : checkFreeze(), man = loadManifest(POP), cands = loadModels(), names = cands.map((c) => c.id);
  if (!SMOKE && !outcomeFileModes(man).every((m) => m === 0)) throw Error('VALIDATION_OUTCOME_FILES_OPENED_BEFORE_RUN');
  const audit = mergeAudit(man, names), t0 = Date.now();
  const classes = (SMOKE ? loadPopulation(POP, { phase: 'I5' }).classes.slice(0, SMOKE_N) : loadPopulation(POP, { phase: 'I5' }).classes), families = classes.map((c) => c.family);
  if (classes.length !== popClasses(man).length) throw Error('VALIDATION_CLASS_COUNT_MISMATCH');
  const dec1 = decideAllClasses(cands, classes), dec2 = decideAllClasses(cands, classes), digest1 = decisionDigest(dec1), digest2 = decisionDigest(dec2), reproducible = digest1 === digest2;
  const results = cands.map((c, ci) => {
    const res = classes.map((cls, k) => (dec1[ci][k].illegal ? { illegal: true } : evalClass(cls, dec1[ci][k].orbit))), agg = aggregate(res, families), ms = dec1[ci].map((d) => d.ms);
    const introIds = (key) => res.map((r, k) => (!r.illegal && r[key] ? classes[k].id : null)).filter(Boolean);
    const typeHist = {}; classes.forEach((cls, k) => { const r = res[k]; if (r.illegal || !(r.introB || r.introN)) return; const rows = actionFeatures(cls.projection).rows, t = TYPE_NAMES[rows[dec1[ci][k].index].slice(0, TYPE_NAMES.length).indexOf(1)] ?? 'UNKNOWN'; typeHist[t] = (typeHist[t] ?? 0) + 1; });
    const compute = { medianMs: q(ms, 0.5), maxMs: Math.max(...ms) }, idBad = audit.identityBad[c.id];
    const gates = { ZERO_INTRODUCTIONS_VS_S0: agg.introVsS0 === 0, ZERO_INTRODUCTIONS_VS_NEXUS: agg.introVsNexus === 0, NO_ILLEGAL_ACTIONS: agg.illegal === 0, IDENTITY_ZERO_TOLERANCE: idBad === 0 && TESTS.every((t) => (audit.identityByPolicy[c.id].orbit[t]?.n ?? 0) > 0),
      REGRET_VS_S0: agg.deltaVsS0.point <= RULES.regretPointMax && agg.deltaVsS0.upper95 < 0, REGRET_VS_NEXUS: agg.deltaVsNexus.point <= RULES.regretPointMax && agg.deltaVsNexus.upper95 < 0,
      COMPUTE_WITHIN_BUDGET: compute.medianMs <= RULES.decisionMedianMsMax && compute.maxMs <= RULES.decisionMaxMsMax };
    return { id: c.id, sha256: c.sha256, rule: c.model.score.rule, aggregate: agg, identityViolations: idBad, compute, gates, rejectedBy: Object.entries(gates).filter(([, v]) => !v).map(([k]) => k), pass: Object.values(gates).every(Boolean),
      introClassesVsS0: introIds('introB'), introClassesVsNexus: introIds('introN'), introducedActionTypes: typeHist, choseS0: agg.equalsS0, choseNexus: agg.equalsNexus, decisions: dec1[ci].map((d) => d.index ?? -1) };
  });
  const gAudit = { IMPORTS_ALLOWLISTED: fr.imports.forbidden.length === 0, ALLOWLISTED_READS_ONLY: audit.totals.unallowedReads.length === 0 && audit.totals.maxReadPaths > 0, POISONED_VIEW_IDENTICAL: audit.totals.poisonMismatch === 0,
    NO_ILLEGAL_ACTIONS_IN_AUDIT: audit.totals.illegal === 0, DETERMINISTIC_REPEAT: audit.totals.repeatMismatch === 0 && reproducible, FEATURES_INVARIANT_UNDER_D4: audit.totals.featureFrameMismatch === 0,
    EVERY_TEST_EXERCISED: TESTS.every((t) => audit.testExercised[t] > 0), NEGATIVE_CONTROLS_DETECTED: Object.values(audit.controls).every((c) => c.detectedOn.every((d) => d.bad > 0)), CLASS_COUNT_MEETS_MINIMUM: SMOKE || classes.length >= 300, NO_HOLDOUT: !existsSync(resolve(LANE, 'work/i2/classes/HOLDOUT')) };
  const valid = Object.values(gAudit).every(Boolean), passing = results.filter((r) => r.pass).map((r) => r.id), n = classes.length, k = cands.length;
  const label = !valid ? 'H_W1_I5_EXECUTION_INVALID' : passing.length ? 'H_W1_DEV_VALIDATION_CANDIDATE_PASSED' : 'H_W1_DEV_VALIDATION_NOT_QUALIFIED';
  const out = { schema: 'STAGE3H_HW1_I5_VALIDATION_RESULTS_V1', authority: 'R0', stage: 'I-5', population: POP, smoke: SMOKE, validationClasses: n, memberWorlds: classes.reduce((a, c) => a + c.members.length, 0), families: new Set(families).size, freezeRecordSha256: SMOKE ? null : sha(readFileSync(FREEZE_FILE)),
    node: process.version, candidatesEvaluated: k, maxCandidates: MAX_CANDIDATES, evaluatedOnceEach: true, rules: RULES, result: label, passingCandidates: passing, executionValid: valid, executionGates: gAudit, audit: { ...audit, identityByPolicy: audit.identityByPolicy },
    reproducibility: { independentRuns: 2, decisionDigest: digest1, identical: reproducible }, candidates: results,
    multiplicity: { candidates: k, note: `${k} of ${MAX_CANDIDATES} candidates were evaluated; a zero-event bound for the selected candidate is not corrected for choosing among them unless stated`, classLevelZeroEventUpper95: zeroEventUpper(n), selectionAdjustedZeroEventUpper95: 1 - Math.pow(0.05 / k, 1 / n) },
    knownLimitations: [`STATIC_IMPORT_EDGE: ${fr.imports.documentedEdges.map((e) => `${e.from} -> ${e.to} (uses ${e.uses.join(', ')})`).join('; ')}. The policy module graph statically reaches ${fr.imports.edgeOnlyFiles.length} evaluator-capable or tooling files through this edge (${fr.imports.edgeOnlyFlagged} flagged imports/tokens among them); none is called on the decision path, which receives only a view or projection. Not removed because public-projection.mjs is hash-pinned by sealed evidence. The I-3 flat import rule, applied unchanged to the frozen sources at I-5 preflight, flags them, and no committed evidence records a passing I-3/I-4 import gate; this closure audit replaces it.`],
    claims: { C1: 'observed counts on finite DEV data only', C3: 'universal guarantee over admissible native states: NOT CLAIMED', C4: 'limited to the stated frame, generator version, rule hash and seed namespace' },
    flags: { I6_AUTHORIZED: false, I6_EXECUTED: false, HOLDOUT_CLASSES_GENERATED: 0, ORIGIN_FAMILY_LEAKAGE: 0, REMOTE_PUSH: false }, elapsedSeconds: (Date.now() - t0) / 1000 };
  const row = (r) => ({ id: r.id, introS0: r.aggregate.introVsS0, introNex: r.aggregate.introVsNexus, introS0Base: r.aggregate.introVsS0BaseOnly, introNexBase: r.aggregate.introVsNexusBaseOnly, dS0: +r.aggregate.deltaVsS0.point.toFixed(4), dS0Up: +r.aggregate.deltaVsS0.upper95.toFixed(4), dNex: +r.aggregate.deltaVsNexus.point.toFixed(4), dNexUp: +r.aggregate.deltaVsNexus.upper95.toFixed(4), idBad: r.identityViolations, illegal: r.aggregate.illegal, pass: r.pass });
  console.log(JSON.stringify({ result: label, validationClasses: n, families: out.families, executionValid: valid, executionGates: gAudit, reproducible, candidates: results.map(row), passing, auditTotals: audit.totals, auditCompute: audit.compute, controls: Object.fromEntries(Object.entries(audit.controls).map(([c, d]) => [c, d.detectedOn])) }, null, 1));
  if (write && !SMOKE) { writeExclusive(RESULT_FILE, out); console.log('written ' + RESULT_FILE); }
  if (SMOKE) console.log('SMOKE MODE (EXPLORATION slice): nothing written; these numbers are not validation results');
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i5-validate.mjs')) {
  const [mode, a1, a2] = process.argv.slice(2), write = process.argv.includes('--write');
  if (mode === 'freeze') freeze(write); else if (mode === 'audit') auditShard(Number(a1), Number(a2)); else if (mode === 'run') run(write);
  else throw Error('USAGE: node i5-validate.mjs freeze [--write] | audit <i> <n> | run [--write]');
}
