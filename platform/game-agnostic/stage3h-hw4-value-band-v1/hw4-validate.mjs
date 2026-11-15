// H-W4 Phase 7: one-pass matched validation (R0, DEV). Adapted from stage3h-hw1-dev-v1/i5-validate.mjs. EXACTLY TWO
// frozen candidates are evaluated — the prespecified lexicographic selection from exploration, one per arm — each
// exactly once against both frozen comparators, with the H-W1 acceptance rules applied unchanged. Nothing is trained,
// tuned or re-selected here. The V2 model differs from V1 ONLY by 8 band one-hot columns.
//   node hw4-validate.mjs freeze [--write]   record the candidate freeze (model / code / contract / population hashes) BEFORE any validation outcome is read
//   node hw4-validate.mjs audit <i> <n>      identity and public-only audit of both candidates on shard i of n (manifest only; no truth loaded)
//   node hw4-validate.mjs run [--write]      decisions, metrics, gates; merges the audit shards; requires the freeze record and unchanged hashes
// Qualification: zero introductions vs S0 AND vs Nexus, zero illegal actions, identity zero-tolerance, mean nreg
// improvement >= 0.02 vs each comparator with one-sided 95% cluster-bootstrap upper bound < 0, compute budget.
import { readFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { loadAllocation, loadExclusions, blockSchedule } from './hw4-allocator.mjs';
import { loadManifest, loadPopulation, classDir, manifestPath } from './hw4-population.mjs';
import { auditClassHw4 } from './hw4-audit-class.mjs';
import { CONTROLS } from '../stage3h-hw1-dev-v1/i3-audit-class.mjs';
import { makePolicy, ARM_FEATURES } from './hw4-policy.mjs';
import { actionFeatures } from '../stage3h-hw1-dev-v1/i3-features.mjs';
import { evalClass, aggregate, REGRET_THRESHOLD, CATASTROPHE, RESAMPLES, BOOTSTRAP_SEED, zeroEventUpper } from '../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { frameProjection } from '../stage3h-hw1-dev-v1/public-projection.mjs';
import { D4_ELEMENTS } from '../stage3h-hw1-dev-v1/transforms.mjs';
import { bandKeyOf } from './hw4-contract-v2.mjs';

const LANE0 = dirname(fileURLToPath(import.meta.url)), sha = (b) => createHash('sha256').update(b).digest('hex');
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const ARMS = ['V1_PUBLIC_ONLY', 'V2_PUBLIC_PLUS_VALUE_BAND'];
const POP = 'VALIDATION';
const GA = resolve(LANE0, '..'), HW1 = resolve(GA, 'stage3h-hw1-dev-v1');
const MODELS = resolve(LANE0, 'models'), EVIDENCE = resolve(LANE0, 'evidence'), WORK = resolve(LANE0, 'work/val'), N_SHARDS = 6;
const TESTS = ['RELABEL', 'MENU', 'D4', 'HIDDEN'];
const CONTRACT = resolve(GA, 'stage3h-wider-action-feasibility-v1/H_W1_CONTRACT.json');
const FREEZE_FILE = resolve(EVIDENCE, 'HW4_CANDIDATE_FREEZE.json'), RESULT_FILE = resolve(EVIDENCE, 'HW4_VALIDATION_RESULTS.json');
const CODE = ['hw4-policy.mjs', 'hw4-features.mjs', 'hw4-contract-v2.mjs', 'hw4-data.mjs', 'hw4-validate.mjs', 'hw4-population.mjs', 'hw4-allocator.mjs'];
const POLICY_SOURCES = ['hw4-policy.mjs', 'hw4-features.mjs', 'hw4-contract-v2.mjs', resolve(HW1, 'public-projection.mjs')];
const RULES = Object.freeze({ introductionsVsS0: 0, introductionsVsNexus: 0, illegalActions: 0, invarianceViolations: 0, regretPointMax: REGRET_THRESHOLD, regretUpper95Below: 0, resamples: RESAMPLES, seed: BOOTSTRAP_SEED, catastropheRegret: CATASTROPHE, decisionMedianMsMax: 100, decisionMaxMsMax: 1000, minMeanNregImprovement: 0.02 });

/** The two selected candidates: the model file named by each arm's exploration evidence (selectedCandidate). */
function loadModels() {
  const files = [];
  for (const arm of ARMS) {
    const ev = JSON.parse(readFileSync(resolve(EVIDENCE, `HW4_EXPLORATION_${arm}.json`), 'utf8'));
    const f = ev.selectedCandidate.model.file; if (!existsSync(resolve(LANE0, f))) throw Error('SELECTED_MODEL_MISSING:' + f);
    files.push({ arm, id: `${arm}/${ev.selectedCandidate.id}_${ev.selectedCandidate.label}`, file: f });
  }
  return files.map(({ arm, id, file }) => { const raw = readFileSync(resolve(LANE0, file)); return { id, arm, file, sha256: sha(raw), model: JSON.parse(raw) }; });
}

/** Static audit over the TRANSITIVE import closure of the H-W4 policy sources. The working-tree import cut severs
 *  public-projection -> transforms -> evidence, so NO documented edge remains: the closure must be strictly clean. */
const FORBIDDEN_SPEC = /evaluator|hw1-eval|(^|\/)(i2-|i4-|i5-|i3-audit|transforms)|lib\.mjs|stage3h-(?!hw[14]-dev|hw4-value-band)|\/scripts\/|\/work\/|\/evidence\/|^node:(?!crypto$)/;
const FORBIDDEN_TOKEN = /\b(readFileSync|readFile|writeFileSync|writeFile|fetch|Math\.random|Date\.now|new Date|process\.env|child_process|XMLHttpRequest)\b/g, TOKEN_EXEMPT = { 'hw4-policy.mjs': ['performance.now'] };
function closure() {
  const files = new Map(), walk = (f) => {
    f = resolve(f); if (files.has(f)) return; const src = readFileSync(f, 'utf8'), specs = [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    files.set(f, { specs, src }); for (const s of specs) if (s.startsWith('.')) walk(resolve(f, '..', s));
  };
  for (const f of POLICY_SOURCES) walk(f);
  return files;
}
function importAudit() {
  const relOf = (f) => (f.startsWith(GA + '/') ? f.slice(GA.length + 1) : f);
  const describe = (f, { specs, src }) => { const rel = relOf(f), exempt = TOKEN_EXEMPT[rel] ?? [];
    return { file: rel, sha256: sha(src), imports: specs, forbiddenImports: specs.filter((s) => FORBIDDEN_SPEC.test(s) || !(s.startsWith('.') || s === 'node:crypto')), forbiddenTokens: [...new Set([...src.matchAll(FORBIDDEN_TOKEN)].map((m) => m[1]))].filter((t) => !exempt.includes(t)) }; };
  const files = [...closure()].map(([f, v]) => describe(f, v)).sort((a, b) => (a.file < b.file ? -1 : 1));
  return { rule: 'transitive closure of the H-W4 policy sources: node:crypto and closure-relative imports only; no evaluator/population/label/tooling modules (the import cut severs transforms.mjs); no file/network/clock/random/env APIs', sources: POLICY_SOURCES,
    files, forbidden: files.flatMap((r) => [...r.forbiddenImports.map((v) => ({ file: r.file, kind: 'IMPORT', value: v })), ...r.forbiddenTokens.map((v) => ({ file: r.file, kind: 'TOKEN', value: v }))]) };
}

const outcomeFileModes = (man) => man.dataFiles.map((d) => statSync(resolve(classDir('VALIDATION'), d.file)).mode & 0o777);
function freezeCore() {
  const man = loadManifest('VALIDATION'), exp = loadManifest('EXPLORATION'), cands = loadModels();
  return { contractSha256: sha(readFileSync(CONTRACT)), allocationHash: loadAllocation().hash, candidates: cands.map((c) => ({ id: c.id, arm: c.arm, file: c.file, sha256: c.sha256, policyId: c.model.policyId, rule: c.model.score.rule })),
    codeHashes: Object.fromEntries(CODE.map((f) => [f, sha(readFileSync(resolve(LANE0, f)))])),
    hw1CodeHashes: Object.fromEntries(['public-projection.mjs', 'i3-features.mjs', 'hw1-eval.mjs', 'i3-audit-class.mjs'].map((f) => [f, sha(readFileSync(resolve(HW1, f)))])),
    importClosure: (() => { const a = importAudit(); return { files: a.files.map(({ file, sha256 }) => ({ file, sha256 })) }; })(), rules: RULES,
    validation: { manifestSha256: sha(readFileSync(manifestPath('VALIDATION'))), classListDigest: man.classListDigest, classCount: man.classCount, dataFiles: man.dataFiles.map((d) => ({ file: d.file, sha256: d.sha256 })), registry: man.registry },
    exploration: { manifestSha256: sha(readFileSync(manifestPath('EXPLORATION'))), classListDigest: exp.classListDigest, selected: Object.fromEntries(ARMS.map((a) => [a, JSON.parse(readFileSync(resolve(EVIDENCE, `HW4_EXPLORATION_${a}.json`), 'utf8')).selectedCandidate])) } };
}
function freeze(write) {
  const man = loadManifest('VALIDATION'), modes = outcomeFileModes(man);
  if (!modes.every((m) => m === 0)) throw Error('VALIDATION_OUTCOME_FILES_NOT_LOCKED_AT_FREEZE');
  if (man.classCount < 300) throw Error('VALIDATION_BELOW_MINIMUM');
  let head = 'unknown'; try { head = execFileSync('git', ['-C', LANE0, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* recorded as unknown */ }
  const rec = { schema: 'STAGE3H_HW4_CANDIDATE_FREEZE_V1', authority: 'R0', stage: 'H-W4', frozenAt: new Date().toISOString(), node: process.version, repoHead: head, validationOutcomeFilesLockedAtFreeze: true, validationOutcomesAccessedBeforeFreeze: false, ...freezeCore(), imports: importAudit() };
  if (rec.imports.forbidden.length) throw Error('FORBIDDEN_POLICY_DEPENDENCY:' + JSON.stringify(rec.imports.forbidden));
  console.log(JSON.stringify({ closureFiles: rec.imports.files.map((f) => `${f.file}:${f.sha256.slice(0, 10)}`), candidates: rec.candidates.map((c) => `${c.id}:${c.sha256.slice(0, 12)}`), validationClasses: rec.validation.classCount, rules: RULES }, null, 1));
  if (write) { writeExclusive(FREEZE_FILE, rec); console.log('written ' + FREEZE_FILE); }
  return rec;
}
function checkFreeze() {
  if (!existsSync(FREEZE_FILE)) throw Error('HW4_FREEZE_RECORD_MISSING');
  const rec = JSON.parse(readFileSync(FREEZE_FILE, 'utf8')), now = freezeCore();
  for (const k of ['contractSha256', 'allocationHash', 'candidates', 'codeHashes', 'hw1CodeHashes', 'importClosure', 'rules', 'validation', 'exploration']) if (JSON.stringify(rec[k]) !== JSON.stringify(now[k])) throw Error('HW4_FREEZE_MISMATCH:' + k);
  return rec;
}

function auditShard(i, n) {
  if (!(Number.isInteger(i) && Number.isInteger(n) && i >= 0 && i < n)) throw Error('USAGE: node hw4-validate.mjs audit <i> <n>');
  checkFreeze(); // the audit needs only the manifest; no outcome field is read
  const man = loadManifest(POP), alloc = loadAllocation(), ctx = loadExclusions([resolve(EVIDENCE, 'HW4_REGISTRY_EXPLORATION.json')]), sched = new Map(), t0 = Date.now();
  const comboFor = (b, k) => { if (!sched.has(b)) sched.set(b, new Map(blockSchedule(ctx, POP, b, alloc).map((c) => [c.k, c]))); return sched.get(b).get(k); };
  const policies = Object.fromEntries(loadModels().map((c) => [c.id, makePolicy(c.model)]));
  const records = man.classes.filter((_, j) => j % n === i).map((c) => auditClassHw4(c, comboFor(c.block, c.k), policies, c.valueSpread));
  mkdirSync(WORK, { recursive: true }); writeExclusive(resolve(WORK, `audit-shard-${i}-of-${n}.json`), { population: POP, shard: i, of: n, seconds: (Date.now() - t0) / 1000, records });
  console.log(JSON.stringify({ shard: i, of: n, classes: records.length, seconds: (Date.now() - t0) / 1000 }));
}

function mergeAudit(man, names) {
  const files = readdirSync(WORK).filter((f) => /^audit-shard-\d+-of-\d+\.json$/.test(f)).sort(); if (!files.length) throw Error('NO_AUDIT_SHARDS');
  const ofs = new Set(files.map((f) => f.match(/of-(\d+)/)[1])); if (ofs.size !== 1) throw Error('AUDIT_SHARD_PLAN_MIXED');
  const of = Number([...ofs][0]); if (files.length !== of) throw Error(`AUDIT_SHARDS_INCOMPLETE:${files.length}/${of}`);
  const records = files.flatMap((f) => JSON.parse(readFileSync(resolve(WORK, f), 'utf8')).records), ids = records.map((r) => r.id);
  if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify(man.classes.map((c) => c.id).sort())) throw Error('AUDIT_COVERAGE_MISMATCH');
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

function decideAllClasses(cands, classes) {
  return cands.map((c) => {
    const pol = makePolicy(c.model);
    return classes.map((cls) => { try { const P = c.arm === 'V2_PUBLIC_PLUS_VALUE_BAND' ? cls.projectionBanded : cls.projection; const d = pol.decideProjection(P); return { index: d.index, orbit: d.orbit, tied: d.tied, scores: d.scores, ms: d.ms }; } catch (e) { if (e.message === 'POLICY_ILLEGAL_ACTION') return { illegal: true, orbit: [], scores: [], ms: 0 }; throw e; } });
  });
}
const decisionDigest = (dec) => sha(JSON.stringify(dec.map((per) => per.map((d) => [d.index ?? -1, d.orbit, d.scores]))));

/** V2 band ablation (diagnostic, design §6): zero the band columns' weights in a model COPY; decisions can only change through the band. */
function ablateBand(model) {
  const m = JSON.parse(JSON.stringify(model)), bandStart = ARM_FEATURES.V1_PUBLIC_ONLY.names.length;
  for (const h of Object.values(m.heads)) h.w = h.w.map((x, j) => (j >= bandStart ? 0 : x));
  return m;
}

function run(write) {
  process.env.HW4_PHASE = 'VALIDATION';
  const fr = checkFreeze(), man = loadManifest(POP), cands = loadModels(), names = cands.map((c) => c.id);
  if (!outcomeFileModes(man).every((m) => m === 0)) throw Error('VALIDATION_OUTCOME_FILES_OPENED_BEFORE_RUN');
  const audit = mergeAudit(man, names), t0 = Date.now();
  const classes = loadPopulation(POP, { phase: 'VALIDATION' }).classes, families = classes.map((c) => c.family);
  if (classes.length !== man.classes.length) throw Error('VALIDATION_CLASS_COUNT_MISMATCH');
  const dec1 = decideAllClasses(cands, classes), dec2 = decideAllClasses(cands, classes), digest1 = decisionDigest(dec1), digest2 = decisionDigest(dec2), reproducible = digest1 === digest2;
  // V2 band-ablation diagnostic: same classes, band weights zeroed
  const abl = cands.filter((c) => c.arm === 'V2_PUBLIC_PLUS_VALUE_BAND').map((c) => ({ id: c.id + '/BAND_ABLATED', arm: c.arm, model: ablateBand(c.model) }));
  const decAbl = abl.length ? decideAllClasses(abl, classes) : [];
  const flips = abl.length ? decAbl[0].filter((d, k) => d.index !== dec1[1][k].index).length : 0;
  // V2 band D4 invariance (structural): band key of the banded projection must be frame-invariant on real validation projections
  let d4Checked = 0, d4BandBad = 0;
  for (const cls of classes.slice(0, 100)) { try { const Pb = cls.projectionBanded; if (!Pb?.nodes?.some((n) => n.band !== undefined)) continue; const k0 = bandKeyOf(Pb); d4Checked++; for (const t of D4_ELEMENTS) if (bandKeyOf(frameProjection(Pb, t)) !== k0) d4BandBad++; } catch (e) { d4BandBad++; } }
  const results = cands.map((c, ci) => {
    const res = classes.map((cls, k) => (dec1[ci][k].illegal ? { illegal: true } : evalClass(cls, dec1[ci][k].orbit))), agg = aggregate(res, families), ms = dec1[ci].map((d) => d.ms);
    const introIds = (key) => res.map((r, k) => (!r.illegal && r[key] ? classes[k].id : null)).filter(Boolean);
    const typeHist = {}; classes.forEach((cls, k) => { const r = res[k]; if (r.illegal || !(r.introB || r.introN)) return; const rows = actionFeatures(cls.projection).rows, t = rows[dec1[ci][k].index]?.slice(0, 6).indexOf(1), name = ['MOVE', 'PROTECT', 'RESTORE', 'RETREAT', 'BYPASS', 'REPAIR'][t] ?? 'UNKNOWN'; typeHist[name] = (typeHist[name] ?? 0) + 1; });
    const compute = { medianMs: q(ms, 0.5), maxMs: Math.max(...ms) }, idBad = audit.identityBad[c.id];
    const gates = { ZERO_INTRODUCTIONS_VS_S0: agg.introVsS0 === 0, ZERO_INTRODUCTIONS_VS_NEXUS: agg.introVsNexus === 0, NO_ILLEGAL_ACTIONS: agg.illegal === 0, IDENTITY_ZERO_TOLERANCE: idBad === 0 && TESTS.every((t) => (audit.identityByPolicy[c.id].orbit[t]?.n ?? 0) > 0),
      REGRET_VS_S0: agg.deltaVsS0.point <= -RULES.minMeanNregImprovement && agg.deltaVsS0.upper95 < 0, REGRET_VS_NEXUS: agg.deltaVsNexus.point <= -RULES.minMeanNregImprovement && agg.deltaVsNexus.upper95 < 0,
      COMPUTE_WITHIN_BUDGET: compute.medianMs <= RULES.decisionMedianMsMax && compute.maxMs <= RULES.decisionMaxMsMax };
    return { id: c.id, arm: c.arm, sha256: c.sha256, rule: c.model.score.rule, aggregate: agg, identityViolations: idBad, compute, gates, rejectedBy: Object.entries(gates).filter(([, v]) => !v).map(([k]) => k), pass: Object.values(gates).every(Boolean),
      introClassesVsS0: introIds('introB'), introClassesVsNexus: introIds('introN'), introducedActionTypes: typeHist, choseS0: agg.equalsS0, choseNexus: agg.equalsNexus, decisions: dec1[ci].map((d) => d.index ?? -1) };
  });
  const gAudit = { IMPORTS_ALLOWLISTED: fr.imports.forbidden.length === 0, ALLOWLISTED_READS_ONLY: audit.totals.unallowedReads.length === 0 && audit.totals.maxReadPaths > 0, POISONED_VIEW_IDENTICAL: audit.totals.poisonMismatch === 0,
    NO_ILLEGAL_ACTIONS_IN_AUDIT: audit.totals.illegal === 0, DETERMINISTIC_REPEAT: audit.totals.repeatMismatch === 0 && reproducible, FEATURES_INVARIANT_UNDER_D4: audit.totals.featureFrameMismatch === 0,
    V2_BAND_KEY_D4_INVARIANT: d4Checked > 0 && d4BandBad === 0, EVERY_TEST_EXERCISED: TESTS.every((t) => audit.testExercised[t] > 0), NEGATIVE_CONTROLS_DETECTED: Object.values(audit.controls).every((c) => c.detectedOn.every((d) => d.bad > 0)), CLASS_COUNT_MEETS_MINIMUM: classes.length >= 300, NO_HOLDOUT: !existsSync(resolve(LANE0, 'work/classes/HOLDOUT')) };
  const valid = Object.values(gAudit).every(Boolean), passing = results.filter((r) => r.pass).map((r) => r.id), n = classes.length;
  const byArm = Object.fromEntries(ARMS.map((a) => [a, results.find((r) => r.arm === a)?.pass ?? false]));
  const v2 = results.find((r) => r.arm === 'V2_PUBLIC_PLUS_VALUE_BAND'), v1 = results.find((r) => r.arm === 'V1_PUBLIC_ONLY');
  const label = !valid ? 'H_W4_EXECUTION_INVALID' : (v2?.pass ? 'H_W4_V2_POLICY_SAFETY_QUALIFIED_ON_DEV' : (v2 && v1 && v2.aggregate.introVsS0 + v2.aggregate.introVsNexus < v1.aggregate.introVsS0 + v1.aggregate.introVsNexus ? 'H_W4_V2_SAFETY_IMPROVEMENT_BUT_NOT_QUALIFIED' : 'H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE'));
  const out = { schema: 'STAGE3H_HW4_VALIDATION_RESULTS_V1', authority: 'R0', stage: 'H-W4', population: POP, validationClasses: n, memberWorlds: classes.reduce((a, c) => a + c.members.length, 0), families: new Set(families).size, freezeRecordSha256: sha(readFileSync(FREEZE_FILE)),
    node: process.version, candidatesEvaluated: cands.length, evaluatedOnceEach: true, rules: RULES, result: label, passingCandidates: passing, executionValid: valid, executionGates: gAudit, audit: { ...audit }, reproducibility: { independentRuns: 2, decisionDigest: digest1, identical: reproducible },
    bandAblation: { v2DecisionFlips: flips, of: n, note: 'diagnostic only: V2 model with band-column weights zeroed' }, bandD4Invariance: { checked: d4Checked, bad: d4BandBad },
    candidates: results, multiplicity: { candidates: cands.length, note: 'one selected candidate per arm (prespecified lexicographic OOF rule); no multiplicity across a roster', classLevelZeroEventUpper95: zeroEventUpper(n) },
    knownLimitations: ['All results are DEV-limited (Forge worlds, contract v3 H2 band, frozen comparators). Zero observed introductions is a finite-sample observation, never a universal guarantee.'],
    claims: { C1: 'observed counts on finite DEV data only', C3: 'universal guarantee over admissible native states: NOT CLAIMED', C4: 'limited to the stated frame, generator version, rule hash and seed namespace' },
    flags: { I6_AUTHORIZED: false, I6_EXECUTED: false, HOLDOUT_CLASSES_GENERATED: 0, ORIGIN_FAMILY_LEAKAGE: 0, REMOTE_PUSH: false }, elapsedSeconds: (Date.now() - t0) / 1000 };
  const row = (r) => ({ id: r.id, introS0: r.aggregate.introVsS0, introNex: r.aggregate.introVsNexus, dS0: +r.aggregate.deltaVsS0.point.toFixed(4), dS0Up: +r.aggregate.deltaVsS0.upper95.toFixed(4), dNex: +r.aggregate.deltaVsNexus.point.toFixed(4), dNexUp: +r.aggregate.deltaVsNexus.upper95.toFixed(4), idBad: r.identityViolations, illegal: r.aggregate.illegal, pass: r.pass });
  console.log(JSON.stringify({ result: label, validationClasses: n, executionValid: valid, executionGates: gAudit, reproducible, candidates: results.map(row), passing, auditTotals: audit.totals, auditCompute: audit.compute, controls: Object.fromEntries(Object.entries(audit.controls).map(([c, d]) => [c, d.detectedOn])), bandAblation: out.bandAblation }, null, 1));
  if (write) { writeExclusive(RESULT_FILE, out); console.log('written ' + RESULT_FILE); }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE0, 'hw4-validate.mjs')) {
  const [mode, a1, a2] = process.argv.slice(2), write = process.argv.includes('--write');
  if (mode === 'freeze') freeze(write); else if (mode === 'audit') auditShard(Number(a1), Number(a2)); else if (mode === 'run') run(write);
  else throw Error('USAGE: node hw4-validate.mjs freeze [--write] | audit <i> <n> | run [--write]');
}
