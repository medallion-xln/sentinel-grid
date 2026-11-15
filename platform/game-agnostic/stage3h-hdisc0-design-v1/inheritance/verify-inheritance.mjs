// STAGE 3H H-DISC-0 Gate 0 — scientific inheritance and custody verification (READ-ONLY; authority R0).
//   node inheritance/verify-inheritance.mjs              recompute the static core and print it (no suites)
//   node inheritance/verify-inheritance.mjs --with-runs  also execute the read-only check modes and test suites
//   node inheritance/verify-inheritance.mjs --write      core + runs, then create evidence/HDISC0_INHERITANCE.json (exclusive)
//   node inheritance/verify-inheritance.mjs verify       recompute the state-independent core and compare; writes nothing
//
// Nothing here reruns, rewrites or recommits a prior scientific result. It reads tracked records, compares hashes, asks
// git read-only questions, and (with runs) executes the existing CHECK modes and test suites, which write nothing.
// It never generates a world, never trains, never calls `infra/run.mjs run`, and never passes `--write` to another tool.
// `core` holds facts that a later commit of this lane does not change (so `verify` passes before and after that commit);
// `volatile` holds the HEAD identity and counts observed when the record was written.
// Tracked output: identities only — paths, commit ids, sha256, verdict strings. No seed, world hash or evaluator truth.
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, openSync, writeSync, closeSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { GIT, GA, REPO, sha, fileSha, readJ, posix, traceClosure, stable, deepDiff } from '../../stage3h-sk1-1-assurance-v1/repro/lib.mjs';
import { build as sk2fStatus } from '../../stage3h-sk2f-feasibility-v1/infra-audit/status.mjs';
import { AUTHORITY, KERNEL_ID, KERNEL_VERSION } from '../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';
import { createAssuredApi } from '../../stage3h-sk1-1-assurance-v1/r0/assured-api.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), LANE_GA = 'stage3h-hdisc0-design-v1';
export const EVIDENCE_FILE = resolve(LANE, 'evidence/HDISC0_INHERITANCE.json'), SCHEMA = 'HDISC0_INHERITANCE_V1';
const NODE = process.execPath, J = JSON.stringify, P = 'platform/game-agnostic/';
const SK1 = 'stage3h-sk1-safety-kernel-v1', SK11 = 'stage3h-sk1-1-assurance-v1', SK2F = 'stage3h-sk2f-feasibility-v1', HW1 = 'stage3h-hw1-dev-v1', HW4 = 'stage3h-hw4-value-band-v1';
const PP = `${HW1}/public-projection.mjs`;

/** Everything this gate expects to find. A mismatch is reported as DIFFERS, never repaired. */
export const EXPECT = Object.freeze({
  baseHead: 'eb75dff868bf526720cb8d13b70f5643fed49e64',
  stageCommits: Object.freeze([['SK1 result', '179922dd'], ['SK1.1', '16ae5c21'], ['import cut', '17318b03'], ['SK2-F', 'eb75dff8']]),
  sk1Base: '966f6eb3',
  sk1: Object.freeze({ resultsSha256: '239c16bc210adef28e7cdef40ecd14298625ee26e08c13f45ad146988a3622b1', freezeSha256: 'd22be2c4766324db1794d511b3bbd79917d3771c28cfa1c7087ba4c6c0663794', modelFileSha256: '683ce6e09c374e7c3a628a53e39f9875d6b8122b6eca8a4b72d58087a0c9efa0',
    modelHash: 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b', classification: 'B_SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED', suite: Object.freeze({ tests: 40, pass: 40, fail: 0 }) }),
  sk11: Object.freeze({ suite: Object.freeze({ tests: 65, pass: 64, fail: 1 }), expectedFailingTest: 'INTEGRATION inventory verify against the working tree' }),
  sk2f: Object.freeze({ classification: 'B_SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED', priority: 'WITHIN_MENU_ACTION_RISK_DISCRIMINATION', suite: Object.freeze({ tests: 23, pass: 23, fail: 0 }) }),
  importCut: Object.freeze({ commit: '17318b03', oldSha256: '2d1e70611b26005179cc50e21a9d6ec5eae59704d7db36e722bb28b53eacb9ca', cutSha256: 'c4f9532e0771e025513122052128b0d14185e4abcde3ace9de9de5d77db6c099', oldCommit: 'b38b16ee' }),
  roster: Object.freeze(['Prime', 'Vanguard', 'Oracle', 'Nexus', 'Horizon', 'Archimedes', 'Alexandria', 'Picasso', 'Forge']),
  readiness: Object.freeze({ protectedFilesOutsideGit: 29, gitignoredDataFiles: 19, forbiddenBlocks: 114 }),
});

/** Predecessor verdicts: where each is recorded and what the record must say. kind json: dotted path; kind line: a KEY=VALUE line. */
export const VERDICT_SOURCES = Object.freeze([
  { study: 'V4', file: 'stage3h-owner-governed-v1/evidence/execution-7c41ba89/qualification-summary.json', kind: 'json', at: 'verdictMappingApplied.verdict', expect: 'BOUNDED_SELECTOR_NOT_QUALIFIED' },
  { study: 'V4', file: 'stage3h-failure-diagnosis-v1/evidence/ADJUDICATION_7c41ba89.json', kind: 'json', at: 'registeredResult', expect: 'BOUNDED_SELECTOR_NOT_QUALIFIED' },
  { study: 'V4', file: 'stage3h-failure-diagnosis-v1/evidence/ADJUDICATION_7c41ba89.json', kind: 'json', at: 'registrationStatus', expect: 'COMPLETE_AND_IRREVOCABLY_CONSUMED' },
  { study: 'V4', file: 'stage3h-failure-diagnosis-v1/evidence/ADJUDICATION_7c41ba89.json', kind: 'json', at: 'ownerAdjudication.BOUNDED_SELECTOR_QUALIFICATION', expect: 'NOT_QUALIFIED' },
  { study: 'H-W1', file: `${HW1}/evidence/I5_VALIDATION_RESULTS.json`, kind: 'json', at: 'result', expect: 'H_W1_DEV_VALIDATION_NOT_QUALIFIED' },
  { study: 'H-W1', file: `${HW1}/H_W1_CLOSURE.md`, kind: 'line', at: 'STATUS', expect: 'CLOSED' },
  { study: 'H-W1', file: `${HW1}/H_W1_CLOSURE.md`, kind: 'line', at: 'CLASSIFICATION', expect: 'H_W1_DEV_VALIDATION_NOT_QUALIFIED' },
  { study: 'H-W1', file: `${HW1}/H_W1_CLOSURE.md`, kind: 'line', at: 'STATIC_IMPORT_CONTRACT', expect: 'FAIL' },
  { study: 'H-W4', file: `${HW4}/evidence/HW4_VALIDATION_RESULTS.json`, kind: 'json', at: 'result', expect: 'H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE' },
  { study: 'H-W4', file: `${HW4}/H_W4.md`, kind: 'line', at: 'STATUS', expect: 'H_W4_COMPLETE' },
  { study: 'H-W4', file: `${HW4}/H_W4.md`, kind: 'line', at: 'CLASSIFICATION', expect: 'C' },
  { study: 'H-W4B', file: `${HW4}/evidence/HW4B_STOP_RECORD.json`, kind: 'json', at: 'status', expect: 'H_W4B_BLOCKED_AT_PHASE_2' },
  { study: 'H-W4B', file: `${HW4}/evidence/HW4B_STOP_RECORD.json`, kind: 'json', at: 'classificationLabel', expect: 'H_W4B_INVALID_OR_BLOCKED' },
  { study: 'H-W4B', file: `${HW4}/evidence/HW4B_CLOSURE_MANIFEST.json`, kind: 'json', at: 'status', expect: 'H_W4B_CLOSED' },
  { study: 'H-W4B', file: `${HW4}/evidence/HW4B_CLOSURE_MANIFEST.json`, kind: 'json', at: 'classification', expect: 'D' },
  { study: 'H-W4B', file: `${HW4}/evidence/HW4B_CLOSURE_MANIFEST.json`, kind: 'json', at: 'valueBandPolicyLine', expect: 'CLOSED' },
  { study: 'H-W4B', file: `${HW4}/H_W4B_CLOSURE.md`, kind: 'line', at: 'VALUE_BAND_POLICY_LINE', expect: 'CLOSED' },
  { study: 'H-W4B', file: `${HW4}/H_W4B_CLOSURE.md`, kind: 'line', at: 'H_W4B_CLASSIFICATION', expect: 'D' },
]);
/** Where the expert roster is defined. The Stage 3F freeze section is the governing declaration; the others must agree with it. */
export const ROSTER_SOURCES = Object.freeze([
  { role: 'GOVERNING_DECLARATION (SENTINEL_EXPERT_ROSTER_V1, bound by the Stage 3F freeze)', file: 'artifacts/stage3f-freeze/stage3f-freeze.json', kind: 'json', at: 'sections.architectureRoster' },
  { role: 'INHERITED_BY_SECTION_HASH (Stage 3G freeze)', file: 'artifacts/stage3g-freeze/stage3g-freeze.json', kind: 'json', at: 'sections.architectureRoster' },
  { role: 'MACHINE_INVENTORY (Stage 3H.2-R)', file: 'stage3h2r-development/NINE_EXPERT_INVENTORY_V1.json', kind: 'json', at: 'roster' },
  { role: 'CODE_CONSTANT checked by the Stage 3H baseline guard', file: 'stage3h-ascii-competence-v1/guard.mjs', kind: 'const' },
  { role: 'CODE_CONSTANT (expert responsibility map)', file: 'ncm-hierarchical-research-v1/contracts/expert-responsibility-map-v1.mjs', kind: 'const' },
  { role: 'CODE_CONSTANT (experimental qualification)', file: 'stage3h-experimental/qualification.mjs', kind: 'const' },
]);
const ROSTER_GUARDED_PATHS = Object.freeze([...ROSTER_SOURCES.map((s) => s.file), 'src/experts', 'src/prime', 'omni-router/omni-router-v1.js']);

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers (unit-tested with negative controls)
// ---------------------------------------------------------------------------------------------------------------
export const dig = (obj, path) => path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
/** Value of a `KEY=VALUE` line that stands alone on a line; null when absent, 'AMBIGUOUS' when it occurs with different values. */
export function keyLine(text, key) {
  const vals = [...text.matchAll(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=(.*)$`, 'gm'))].map((m) => m[1].trim());
  if (!vals.length) return null; return new Set(vals).size === 1 ? vals[0] : 'AMBIGUOUS';
}
/** Literal string array assigned to `ROSTER` in a source text, or null. */
export function rosterConst(src) { const m = /\bROSTER\s*=\s*(?:Object\.freeze|deepFreeze)?\(?\s*\[([^\]]*)\]/.exec(src); if (!m) return null; const names = [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2]); return names.length ? names : null; }
/** Summary of a `node --test` run (spec reporter text). */
export function parseTestSummary(text) {
  const n = (k) => { const m = new RegExp(`^ℹ ${k} (\\d+)$`, 'm').exec(text); return m ? Number(m[1]) : null; };
  const failing = [...new Set([...text.matchAll(/^✖ (.+?) \(\d+(?:\.\d+)?ms\)$/gm)].map((m) => m[1]))];
  return { tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped'), failing };
}
/** commits: [{ id, full }]; isAncestor(a, b) -> boolean. True when each commit is a strict ancestor of the next. */
export const orderedAncestry = (commits, isAncestor) => commits.every((c, i) => c.full && (i === 0 || (commits[i - 1].full !== c.full && isAncestor(commits[i - 1].full, c.full))));
/** One verdict row -> { ok, found }. */
export function verdictRow(src, text) { const found = src.kind === 'json' ? dig(JSON.parse(text), src.at) : keyLine(text, src.at); return { ok: found === src.expect, found: found === undefined ? null : found }; }
/** Roster definitions [{ file, names }] against the expected nine. */
export function rosterVerdict(defs, expected = EXPECT.roster) {
  const bad = defs.filter((d) => !Array.isArray(d.names) || J(d.names) !== J(expected));
  return { ok: defs.length > 0 && bad.length === 0, count: expected.length, disagreeing: bad.map((d) => ({ file: d.file, names: d.names ?? null })), nine: expected.length === 9 && new Set(expected).size === 9 };
}
/** files: [{ file, old:boolean, cut:boolean }] -> which lane pins which revision. */
export function pinsByLane(files) { const out = {}; for (const f of files) { const lane = f.file.split('/')[0], e = (out[lane] ??= { OLD: [], CUT: [], BOTH: [] }); e[f.old && f.cut ? 'BOTH' : f.old ? 'OLD' : 'CUT'].push(f.file); } return out; }
export const status = (ok, measured = true) => (!measured ? 'NOT_VERIFIED' : ok ? 'VERIFIED' : 'DIFFERS');
/** Compare a stored record with a recomputed core. */
export function verifyAgainst(stored, core) {
  const drift = stored?.schema === SCHEMA ? deepDiff(stored.core, core) : ['$: inheritance record missing or wrong schema'], failed = Object.entries(core.items).filter(([, v]) => v.status !== 'VERIFIED').map(([k, v]) => `${k}:${v.status}`);
  return { ok: drift.length === 0 && failed.length === 0, drift, failed };
}

// ---------------------------------------------------------------------------------------------------------------
// Read-only facts
// ---------------------------------------------------------------------------------------------------------------
const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'ignore'] });
const gitOk = (...a) => { try { execFileSync(GIT, ['-C', REPO, ...a], { stdio: 'ignore' }); return true; } catch { return false; } };
const gitBuf = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'ignore'] });
const full = (rev) => { try { return git('rev-parse', '--verify', `${rev}^{commit}`).trim(); } catch { return null; } };
const abs = (gaRel) => resolve(GA, gaRel), rel = (gaRel) => P + gaRel;
const tracked = (gaRel) => gitOk('ls-files', '--error-unmatch', '--', rel(gaRel)), cleanVsHead = (gaRel) => git('status', '--porcelain', '--', rel(gaRel)).trim() === '';
const introducedIn = (gaRel) => { const l = git('log', '--diff-filter=A', '--format=%H', '--', rel(gaRel)).trim().split('\n').filter(Boolean); return l.length ? l[l.length - 1] : null; };
const lastChangedIn = (gaRel) => git('log', '-1', '--format=%H', '--', rel(gaRel)).trim() || null;
const fileId = (gaRel) => ({ file: gaRel, sha256: existsSync(abs(gaRel)) ? fileSha(abs(gaRel)) : null, tracked: tracked(gaRel), equalsHead: tracked(gaRel) && cleanVsHead(gaRel), introducedIn: introducedIn(gaRel)?.slice(0, 8) ?? null, lastChangedIn: lastChangedIn(gaRel)?.slice(0, 8) ?? null });
const manifestOk = (gaLane, name) => { const f = abs(`${gaLane}/${name}`); if (!existsSync(f)) return { present: false, entries: 0, mismatching: null }; const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => /^([0-9a-f]{64})\s+(.+)$/.exec(l)).filter(Boolean);
  const bad = rows.filter((m) => { const p = resolve(GA, gaLane, m[2]); return !existsSync(p) || fileSha(p) !== m[1]; }).map((m) => m[2]); return { present: true, entries: rows.length, mismatching: bad }; };

/** Can a module be linked from committed source alone? Exports the tracked files of its static closure from HEAD into a temp dir and imports it there. */
function probeCleanImport(gaEntry) {
  const entry = abs(gaEntry), closure = traceClosure([entry]), tmp = realpathSync(mkdtempSync(resolve(tmpdir(), 'hdisc0-clean-'))); let exported = 0, notInHead = [];
  try {
    for (const [a] of closure) { const r = posix(relative(REPO, a)); let buf = null; try { buf = gitBuf('show', `HEAD:${r}`); } catch { buf = null; } if (buf === null) { notInHead.push(r.replace(P, '')); continue; } const out = resolve(tmp, r); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, buf); exported++; }
    const pkg = resolve(REPO, P, 'package.json'); if (existsSync(pkg)) { try { const out = resolve(tmp, P, 'package.json'); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, gitBuf('show', `HEAD:${P}package.json`)); } catch { /* not tracked */ } }
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.SK1_WORK;
    const r = spawnSync(NODE, ['--input-type=module', '-e', `await import(${J(pathToFileURL(resolve(tmp, P, gaEntry)).href)}); console.log('LINKED');`], { cwd: tmp, encoding: 'utf8', env, timeout: 120000 });
    const linked = r.status === 0 && /LINKED/.test(r.stdout), miss = /Cannot find module '([^']+)'/.exec(`${r.stderr}`), firstMissing = miss ? posix(relative(resolve(tmp, P), existsSync(dirname(miss[1])) ? resolve(realpathSync(dirname(miss[1])), miss[1].split('/').pop()) : miss[1])) : null;
    return { entry: gaEntry, closureFiles: closure.size, exportedFromHead: exported, closureFilesNotInHead: notInHead.sort(), linksFromCommittedSourceAlone: linked, firstUnresolvedModule: linked ? null : firstMissing, errorCode: linked ? null : (/code: '([A-Z_]+)'/.exec(`${r.stderr}`)?.[1] ?? 'UNKNOWN') };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export async function buildCore() {
  const items = {}, put = (id, title, ok, evidence, measured = true) => { items[id] = { title, status: status(ok, measured), evidence }; };
  const S = await sk2fStatus(), sc = S.core, cur = S.current;

  // ---- 1. git identity and ancestry
  const base = full(EXPECT.baseHead), head = full('HEAD'), commits = EXPECT.stageCommits.map(([name, id]) => ({ name, id, full: full(id), subject: full(id) ? git('log', '-1', '--format=%s', id).trim() : null }));
  const isAnc = (a, b) => gitOk('merge-base', '--is-ancestor', a, b), origin = full('origin/main'), baseIsHeadOrAncestor = Boolean(base) && (base === head || isAnc(base, head));
  const afterBase = base && head && base !== head ? git('diff', '--name-only', base, head).split('\n').filter(Boolean) : [], onlyThisLaneSinceBase = afterBase.every((f) => f.startsWith(rel(LANE_GA) + '/'));
  const pushed = commits.map((c) => ({ id: c.id, inOriginMain: Boolean(origin && c.full && isAnc(c.full, origin)) }));
  put('01_GIT_HEAD_AND_ANCESTRY', 'HEAD identity and ordered ancestry of the four stage commits', Boolean(base) && baseIsHeadOrAncestor && onlyThisLaneSinceBase && orderedAncestry(commits, isAnc) && commits[commits.length - 1].full === base && pushed.every((p) => !p.inOriginMain),
    { expectedBaseHead: EXPECT.baseHead, baseResolves: Boolean(base), baseIsHeadOrAncestorOfHead: baseIsHeadOrAncestor, pathsChangedSinceBaseAreAllInThisLane: onlyThisLaneSinceBase, commits: commits.map((c) => ({ name: c.name, id: c.id, full: c.full, subject: c.subject })), eachIsAStrictAncestorOfTheNext: orderedAncestry(commits, isAnc), lastStageCommitIsTheBase: commits[commits.length - 1].full === base,
      originMainResolves: Boolean(origin), stageCommitsContainedInOriginMain: pushed, nothingPushed: pushed.every((p) => !p.inOriginMain) });

  // ---- 2. custody guards
  const hooks = ['pre-commit', 'pre-merge-commit', 'pre-push'].map((h) => { const p = resolve(REPO, '.git/hooks', h); return { hook: h, present: existsSync(p), executable: existsSync(p) && (statSync(p).mode & 0o111) !== 0 }; });
  let hooksPath = ''; try { hooksPath = git('config', '--get', 'core.hooksPath').trim(); } catch { hooksPath = ''; }
  const guardFiles = ['custody/stage-guard.sh', 'custody/protected-identities.tsv', 'custody/GUARD_MANIFEST.sha256'].map((f) => ({ file: `.git/${f}`, present: existsSync(resolve(REPO, '.git', f)) }));
  put('02_SOURCE_CUSTODY_GUARDS', 'hooks present, guard manifest intact, protected identities match, none tracked', hooks.every((h) => h.present && h.executable) && hooksPath === '' && guardFiles.every((g) => g.present) && sc.custody.guardManifestIntact && sc.custody.protectedIdentities === 31 && sc.custody.present === 31 && sc.custody.matchingRecordedIdentity === 31 && sc.custody.trackedAtHead === 0,
    { hooks, coreHooksPathOverride: hooksPath || null, guardFiles, guardManifestIntact: sc.custody.guardManifestIntact, protectedIdentities: sc.custody.protectedIdentities, present: sc.custody.present, matchingRecordedIdentity: sc.custody.matchingRecordedIdentity, trackedAtHead: sc.custody.trackedAtHead, source: 'recomputed now through stage3h-sk2f-feasibility-v1/infra-audit/status.mjs build()' });

  // ---- 3. SK1
  const res = readJ(abs(`${SK1}/evidence/SK1_VALIDATION_RESULTS.json`)), model = readJ(abs(`${SK1}/models/SK1_MODEL.json`)), pa = res.policies.SK1_AS_SPECIFIED;
  const sk1 = { results: fileId(`${SK1}/evidence/SK1_VALIDATION_RESULTS.json`), freeze: fileId(`${SK1}/evidence/SK1_EXPERIMENT_FREEZE.json`), model: fileId(`${SK1}/models/SK1_MODEL.json`), marker: fileId(`${SK1}/evidence/SK1_VALIDATION_RUN_MARKER.json`), classification: res.classification, safetyKernelDevQualified: res.safetyKernelDevQualified, executionValid: res.executionValid, evaluatedOnce: res.evaluatedOnce, holdoutClasses: res.holdoutClasses, modelHash: model.modelHash, modelQualification: model.qualification.status, resultBindsFreeze: res.freezeSha256,
    baseline: { validationClasses: res.classes, accepted: pa.decidedClasses, abstained: pa.abstentions, introVsS0: pa.introVsS0, introVsNexus: pa.introVsNexus, forcedChoiceFailingClasses: res.uncertainty.failingClassesForcedChoice, failingAmongAbstained: res.uncertainty.failingAmongAbstained, failingAmongAccepted: res.uncertainty.failingAmongDecided }, freezeDescribesTheDisk: sc.sk1Freeze.describesTheDisk, laneFilesChangedSinceItsResultCommit: git('diff', '--name-only', '179922dd', 'HEAD', '--', rel(SK1)).split('\n').filter(Boolean).length };
  put('03_SK1_CLASSIFICATION_AND_IDENTITIES', 'SK1 classification B, not qualified; frozen identities', sk1.results.sha256 === EXPECT.sk1.resultsSha256 && sk1.freeze.sha256 === EXPECT.sk1.freezeSha256 && sk1.model.sha256 === EXPECT.sk1.modelFileSha256 && sk1.modelHash === EXPECT.sk1.modelHash && sk1.classification === EXPECT.sk1.classification && sk1.safetyKernelDevQualified === false && sk1.modelQualification === 'NOT_QUALIFIED' && sk1.resultBindsFreeze === EXPECT.sk1.freezeSha256 && sk1.freezeDescribesTheDisk && sk1.laneFilesChangedSinceItsResultCommit === 0 && [sk1.results, sk1.freeze, sk1.model].every((f) => f.equalsHead)
    && J(sk1.baseline) === J({ validationClasses: 600, accepted: 304, abstained: 296, introVsS0: 1, introVsNexus: 2, forcedChoiceFailingClasses: 39, failingAmongAbstained: 37, failingAmongAccepted: 2 }), sk1);

  // ---- 4. SK1.1
  const sk11Files = ['SK1_1_DECISION_FAILURE_MATRIX.json', 'SK1_1_RISK_COVERAGE.json', 'SK1_1_FAILURE_ATTRIBUTION.json', 'SK1_1_ENGINEERING_ASSURANCE.json', 'SK1_1_REPRO_INVENTORY.json'].map((n) => fileId(`${SK11}/evidence/${n}`)), m11 = manifestOk(SK11, 'SK1_1_SOURCE_MANIFEST.sha256'), mat = readJ(abs(`${SK11}/evidence/SK1_1_DECISION_FAILURE_MATRIX.json`));
  const sk11 = { evidence: sk11Files, sourceManifest: m11, matrixBoundToSk1Result: mat.source.validationResultsSha256, matrixBoundToModel: mat.source.modelHash, matrixReconciliationExact: mat.reconciliation.exact, laneFilesChangedSinceItsCommit: git('diff', '--name-only', '16ae5c21', 'HEAD', '--', rel(SK11)).split('\n').filter(Boolean).length };
  put('04_SK1_1_DIAGNOSTICS_IDENTITIES', 'SK1.1 evidence identities and source manifest', sk11Files.every((f) => f.sha256 && f.equalsHead) && m11.present && m11.entries > 0 && m11.mismatching.length === 0 && sk11.matrixBoundToSk1Result === EXPECT.sk1.resultsSha256 && sk11.matrixBoundToModel === EXPECT.sk1.modelHash && sk11.matrixReconciliationExact === true && sk11.laneFilesChangedSinceItsCommit === 0, sk11);

  // ---- 5. SK2-F
  const fz = readJ(abs(`${SK2F}/evidence/SK2F_FEASIBILITY.json`)), sk2fFiles = ['SK2F_FEASIBILITY.json', 'SK2F_EXPLORATION_MATRIX.json', 'SK2F_IMPORT_CUT_AUDIT.json', 'SK2F_REPRO_STATUS.json'].map((n) => fileId(`${SK2F}/evidence/${n}`)), m2 = manifestOk(SK2F, 'SK2F_SOURCE_MANIFEST.sha256');
  const sk2f = { evidence: sk2fFiles, sourceManifest: m2, classification: fz.verdicts.classification, nextScientificPriority: fz.verdicts.nextScientificPriority, targets: fz.target, targetsWeakened: fz.verdicts.targetsWeakened, prospectiveQualificationNotEstablished: fz.verdicts.PROSPECTIVE_QUALIFICATION_NOT_ESTABLISHED, boundToModel: fz.source.modelHash,
    recordedAttribution: { validationOrderingErrors: fz.discrimination.historicalValidation.WITHIN_MENU_RISK_ORDERING_ERROR, validationRankingContractErrors: fz.discrimination.historicalValidation.RANKING_CONTRACT_ERROR, validationFailing: fz.discrimination.historicalValidation.failing, explorationOutOfBagOrderingErrors: fz.discrimination.exploration.outOfBag.WITHIN_MENU_RISK_ORDERING_ERROR, explorationOutOfBagFailing: fz.discrimination.exploration.outOfBag.forcedChoiceFailing, publicSafeActionIdentifiability: fz.discrimination.PUBLIC_SAFE_ACTION_IDENTIFIABILITY.verdict },
    laneFilesChangedSinceItsCommit: git('diff', '--name-only', 'eb75dff8', 'HEAD', '--', rel(SK2F)).split('\n').filter(Boolean).length };
  put('05_SK2_F_CLASSIFICATION', 'SK2-F classification B and recommended priority', sk2f.classification === EXPECT.sk2f.classification && sk2f.nextScientificPriority === EXPECT.sk2f.priority && sk2f.targetsWeakened === false && sk2f.boundToModel === EXPECT.sk1.modelHash && sk2fFiles.every((f) => f.sha256 && f.equalsHead) && m2.present && m2.mismatching.length === 0 && sk2f.laneFilesChangedSinceItsCommit === 0
    && J(sk2f.recordedAttribution) === J({ validationOrderingErrors: 34, validationRankingContractErrors: 5, validationFailing: 39, explorationOutOfBagOrderingErrors: 48, explorationOutOfBagFailing: 55, publicSafeActionIdentifiability: 'NOT_ESTABLISHED' }), sk2f);

  // ---- 6. predecessor verdicts
  const vrows = VERDICT_SOURCES.map((s) => { const f = fileId(s.file), text = existsSync(abs(s.file)) ? readFileSync(abs(s.file), 'utf8') : null, r = text === null ? { ok: false, found: null } : verdictRow(s, text); return { study: s.study, file: s.file, where: s.kind === 'json' ? `field ${s.at}` : `line ${s.at}=`, expected: s.expect, found: r.found, matches: r.ok, sha256: f.sha256, tracked: f.tracked, equalsHead: f.equalsHead, introducedIn: f.introducedIn, lastChangedIn: f.lastChangedIn }; });
  const byStudy = Object.fromEntries(['V4', 'H-W1', 'H-W4', 'H-W4B'].map((st) => [st, { final: vrows.filter((r) => r.study === st).every((r) => r.matches && r.tracked && r.equalsHead), records: vrows.filter((r) => r.study === st).length }]));
  put('06_PREDECESSOR_VERDICTS', 'final outcomes of V4, H-W1, H-W4 and H-W4B from tracked records', vrows.every((r) => r.matches && r.tracked && r.equalsHead), { byStudy, rows: vrows, note: 'Each verdict is quoted from a tracked record that equals HEAD. Nothing is inferred: a missing or different string is reported as it is found.' });

  // ---- 7. import-cut commit
  const ic = EXPECT.importCut, icFull = full(ic.commit), icPaths = icFull ? git('show', '--name-only', '--format=', icFull).split('\n').filter(Boolean) : [], shaAt = (rev) => { try { return sha(gitBuf('show', `${rev}:${rel(PP)}`)); } catch { return null; } };
  const cut = { commit: icFull, subject: icFull ? git('log', '-1', '--format=%s', icFull).trim() : null, pathsTouched: icPaths, exactlyOnePath: icPaths.length === 1 && icPaths[0] === rel(PP), parentBlobSha256: icFull ? shaAt(`${icFull}^`) : null, commitBlobSha256: icFull ? shaAt(icFull) : null, headBlobSha256: shaAt('HEAD'), workingTreeSha256: fileSha(abs(PP)), oldRevisionRetrievableAt: ic.oldCommit, oldRevisionSha256There: shaAt(ic.oldCommit), sk1FreezeBinds: sc.limitation2_importCut.sk1FreezeBinds, messageRecordsBothHashes: icFull ? [ic.oldSha256, ic.cutSha256].every((h) => git('log', '-1', '--format=%B', icFull).includes(h)) : false };
  put('07_IMPORT_CUT_COMMIT', 'the scoped import-cut commit touches one path and changes no pinned content', cut.exactlyOnePath && cut.parentBlobSha256 === ic.oldSha256 && cut.commitBlobSha256 === ic.cutSha256 && cut.headBlobSha256 === ic.cutSha256 && cut.workingTreeSha256 === ic.cutSha256 && cut.oldRevisionSha256There === ic.oldSha256 && cut.sk1FreezeBinds === ic.cutSha256 && cut.messageRecordsBothHashes, cut);

  // ---- 8. exclusions
  const ex = sc.exclusionCustody, lw = ex.loadersInThisWorkingTree;
  put('08_HISTORICAL_EXCLUSIONS_ENFORCED', 'spent and retired blocks are listed and rejected by the loaders in this working tree', ex.registryDeclaredHashVerifies && ex.failClosed === true && ex.forbiddenBlocksInTrackedRecords === EXPECT.readiness.forbiddenBlocks && ex.blocks901to914Listed === 14 && ex.blocks801to837Listed === 37 && lw.loadable === true && lw.blocks901to914Rejected === 14 && lw.blocks801to837RejectedBySuccessor === 37 && ex.sealedRegistries.every((r) => r.matchesRecorded) && ex.sk1Registries.every((r) => r.matchesRecorded),
    { registryFile: ex.registryFile, registryFileSha256: ex.registrySha256, registryDeclaredHashVerifies: ex.registryDeclaredHashVerifies, failClosed: ex.failClosed, forbiddenBlocksInRegistry: ex.forbiddenBlocksInRegistry, forbiddenBlocksInTrackedRecords: ex.forbiddenBlocksInTrackedRecords, blocks901to914Listed: ex.blocks901to914Listed, blocks801to837Listed: ex.blocks801to837Listed, sealedRegistries: ex.sealedRegistries, sk1Registries: ex.sk1Registries, loadersInThisWorkingTree: lw, scope: 'WORKING TREE ONLY — see item 11 finding 3 for the clean-checkout result' });

  // ---- 9. R0 authority
  const d = createAssuredApi({ game: 'forge' }).describe(), wantAuth = { state: 'R0', mode: 'OBSERVATION_AND_RECOMMENDATION_ONLY', canDispatch: false, canMutateLiveWorld: false, promotedToRuntime: false };
  put('09_R0_AUTHORITY', 'the frozen kernel and the SK1.1 envelope are R0, cannot dispatch or mutate, and are labelled NOT_QUALIFIED', J(AUTHORITY) === J(wantAuth) && J(d.authority) === J(wantAuth) && d.qualification === 'NOT_QUALIFIED' && d.labels.includes('R0') && d.labels.includes('NOT_QUALIFIED') && d.scientificStatus.safetyKernelDevQualified === false && d.refuses.includes('execute') && d.refuses.includes('dispatch') && d.refuses.includes('mutate'),
    { kernel: { id: KERNEL_ID, version: KERNEL_VERSION, authority: AUTHORITY, source: fileId(`${SK1}/kernel/contract.mjs`) }, envelope: { apiVersion: d.assuredApiVersion, labels: d.labels, qualification: d.qualification, deployment: d.deployment, authority: d.authority, refuses: d.refuses, scientificStatus: { sk1Classification: d.scientificStatus.sk1Classification, safetyKernelDevQualified: d.scientificStatus.safetyKernelDevQualified, selectiveContractCertified: d.scientificStatus.selectiveContractCertified }, source: fileId(`${SK11}/r0/assured-api.mjs`) } });

  // ---- 10. nine-expert roster
  const defs = ROSTER_SOURCES.map((s) => { const p = abs(s.file), text = existsSync(p) ? readFileSync(p, 'utf8') : null; let names = null, extra = {}; if (text !== null) { if (s.kind === 'json') { const v = dig(JSON.parse(text), s.at); names = Array.isArray(v) ? v : v?.experts ?? null; if (v && !Array.isArray(v)) extra = { rosterId: v.rosterId ?? null, EXPERT_COUNT: v.EXPERT_COUNT ?? null, expert10Added: v.rules?.EXPERT_10_ADDED ?? null, routerArbiter: v.rules?.ROUTER_ARBITER ?? null, infrastructureNotExperts: v.infrastructureNotExperts ?? null, inheritedFromSectionHash: v.inheritedFrom?.sectionHash ?? null }; } else names = rosterConst(text); } return { role: s.role, ...fileId(s.file), names, ...extra }; });
  const rv = rosterVerdict(defs), changed = full(EXPECT.sk1Base) ? git('diff', '--name-only', EXPECT.sk1Base, 'HEAD', '--', ...ROSTER_GUARDED_PATHS.map(rel)).split('\n').filter(Boolean) : null, gov = defs[0];
  put('10_NINE_EXPERT_ROSTER', 'the canonical nine-expert roster is unchanged', rv.ok && rv.nine && gov.EXPERT_COUNT === 9 && gov.rosterId === 'SENTINEL_EXPERT_ROSTER_V1' && gov.expert10Added === false && defs.every((x) => x.tracked && x.equalsHead) && Array.isArray(changed) && changed.length === 0,
    { rosterId: gov.rosterId, experts: EXPECT.roster, expertCount: EXPECT.roster.length, definitions: defs, allDefinitionsAgree: rv.ok, disagreeing: rv.disagreeing, expert10Added: gov.expert10Added, routerArbiterClassification: gov.routerArbiter, infrastructureNotExperts: gov.infrastructureNotExperts, guardedPaths: ROSTER_GUARDED_PATHS, pathsChangedSinceSk1Base: changed, sk1Base: EXPECT.sk1Base,
      notes: ['The governing declaration is the architectureRoster section of the Stage 3F freeze; the Stage 3G freeze inherits it by section hash. The Arbiter is recorded there as INFRASTRUCTURE (Router/Arbiter), not as an expert.', 'stage3h-hw1-dev-v1/i4-candidates.mjs also exports a constant named ROSTER; it is the list of thirteen H-W1 policy candidates (C01..C13), not an expert roster, and is not counted here.'] });

  // ---- 11. the five mandatory readiness findings, re-measured now
  const prot = sc.limitation1_protectedSource, protPaths = prot.files.map((f) => f.file), inHead = protPaths.filter((f) => gitOk('cat-file', '-e', `HEAD:${rel(f)}`)), protTracked = protPaths.filter(tracked);
  const data = sc.limitation3_localData, ignoredOut = (() => { try { return execFileSync(GIT, ['-C', REPO, 'check-ignore', '--stdin', '-z'], { input: data.files.map((f) => rel(`${SK1}/${f.path}`)).join('\0'), encoding: 'utf8' }).split('\0').filter(Boolean).length; } catch (e) { return String(e.stdout ?? '').split('\0').filter(Boolean).length; } })();
  const probes = [probeCleanImport(`${SK1}/infra/exclusions.mjs`), probeCleanImport(`${SK1}/successor/exclusions-v2.mjs`)], staticLoaders = sc.limitation4_exclusionLoaders.loaders.map((l) => ({ loader: l.loader, closureFiles: l.closureFiles, custodyProtectedFilesReached: l.custodyProtectedFilesReached.length, linkableFromCommittedSourceAlone: l.linkableFromCommittedSourceAlone, shortestChainToProtectedSource: l.shortestRecordedChainToProtectedSource }));
  const grepFiles = (h) => { try { return git('grep', '-l', '-F', h.slice(0, 8), '--', P).split('\n').filter(Boolean).map((f) => f.replace(P, '')); } catch { return []; } }, oldF = new Set(grepFiles(ic.oldSha256)), cutF = new Set(grepFiles(ic.cutSha256));
  const pinFiles = [...new Set([...oldF, ...cutF])].filter((f) => !f.startsWith(LANE_GA + '/')).sort().map((f) => ({ file: f, old: oldF.has(f), cut: cutF.has(f) })), lanes = pinsByLane(pinFiles);
  const f1 = { finding: 'Twenty-nine protected source files remain outside Git', protectedFilesInTheEvaluationClosure: prot.filesInEvaluationClosure, trackedByGit: protTracked.length, presentInHeadTree: inHead.length, allMatchRecordedIdentity: sc.custody.matchingRecordedIdentity === sc.custody.protectedIdentities, byLane: prot.byLane, listSha256: prot.listSha256, resolved: false };
  const f2 = { finding: 'Nineteen gitignored data files are required for historical evaluation reproduction', filesNeededByCheckMode: data.filesNeededByCheckMode, bytes: data.bytes, groups: data.groups, confirmedIgnoredByGit: ignoredOut, trackedByGit: data.files.filter((f) => tracked(`${SK1}/${f.path}`)).length, listSha256: data.listSha256, resolved: false };
  const f3 = { finding: 'Exclusion loaders are not independently importable from clean committed source', staticClosure: staticLoaders, cleanExportProbe: probes, importableFromCommittedSourceAlone: probes.every((p) => p.linksFromCommittedSourceAlone), resolved: false, note: 'Measured by exporting the tracked part of each loader\'s static closure from HEAD into an empty directory and importing it there.' };
  const f4 = { finding: 'No independently restored backup exists', independentBackupVerified: false, restoreVerificationRecordFound: false, resolved: false, note: 'A backup counts only after a restore on a different device is hash-verified (SK2-F acceptance procedure). No such record exists in the repository. Mounted volumes and Time Machine state are dated observations and are recorded under `volatile`.' };
  const f5 = { finding: 'The import-cut revision is committed, but historical source identities remain distinct', committed: cut.headBlobSha256 === ic.cutSha256, committedIn: icFull?.slice(0, 8) ?? null, oldSha256: ic.oldSha256, cutSha256: ic.cutSha256, headCarries: cut.headBlobSha256 === ic.cutSha256 ? 'CUT' : cut.headBlobSha256 === ic.oldSha256 ? 'OLD' : 'OTHER', oldRevisionOnlyInHistoryAt: ic.oldCommit, trackedFilesPinningARevision: pinFiles.length, lanes,
    hw1PinsOnlyTheOldRevision: Boolean(lanes[HW1]) && lanes[HW1].OLD.length > 0 && lanes[HW1].BOTH.length === 0 && lanes[HW1].CUT.every((f) => f.endsWith('.md')), sk1FreezePinsTheCut: sc.limitation2_importCut.sk1FreezeBinds === ic.cutSha256, resolved: 'PARTLY: one uncommitted dependency is now committed; no historical pin was changed, and HEAD satisfies the H-W4/H-W4B/SK1 pins but not the H-W1 pins' };
  put('11_MANDATORY_READINESS_FINDINGS', 'five readiness limitations, each re-measured and none reported as resolved',
    f1.protectedFilesInTheEvaluationClosure === EXPECT.readiness.protectedFilesOutsideGit && f1.trackedByGit === 0 && f1.presentInHeadTree === 0 && f2.filesNeededByCheckMode === EXPECT.readiness.gitignoredDataFiles && f2.confirmedIgnoredByGit === f2.filesNeededByCheckMode && f2.trackedByGit === 0 && f3.importableFromCommittedSourceAlone === false && staticLoaders.every((l) => !l.linkableFromCommittedSourceAlone) && f5.committed && f5.hw1PinsOnlyTheOldRevision && f5.sk1FreezePinsTheCut && (lanes[HW4]?.CUT.length ?? 0) > 0,
    { finding1: f1, finding2: f2, finding3: f3, finding4: f4, finding5: f5, readinessVerdictOfSk2F: cur.verdicts.INFRASTRUCTURE_READY_FOR_AN_INDEPENDENT_SCIENTIFIC_CAMPAIGN });

  const volatile = { head, branch: git('branch', '--show-current').trim(), headEqualsExpectedBase: head === base, aheadOfOrigin: cur.backup.aheadOfOrigin, externalVolumesMounted: cur.backup.externalVolumesMounted, timeMachine: cur.backup.timeMachine, node: process.version, platform: `${process.platform}-${process.arch}`, sk11InventoryDrift: { label: cur.sk11InventoryDrift.label, rows: cur.sk11InventoryDrift.rows, unexpectedRows: cur.sk11InventoryDrift.unexpectedRows.length } };
  return { core: { items }, volatile };
}

// ---------------------------------------------------------------------------------------------------------------
// Dynamic runs: existing read-only check modes and test suites (never `run`, never `--write`)
// ---------------------------------------------------------------------------------------------------------------
const testFiles = (gaLane, dirs) => dirs.flatMap((d) => readdirSync(abs(`${gaLane}/${d}`)).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => `${d}/${n}`));
function run(gaLane, args, timeout = 1500000) { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; const t0 = Date.now(), r = spawnSync(NODE, args, { cwd: abs(gaLane), encoding: 'utf8', env, timeout, maxBuffer: 1 << 28 }); return { out: `${r.stdout ?? ''}`, err: `${r.stderr ?? ''}`, exit: r.status, seconds: Math.round((Date.now() - t0) / 100) / 10 }; }
export function executeRuns(log = () => {}) {
  const suite = (name, gaLane, dirs, want, expectFailing = []) => { log(name); const r = run(gaLane, ['--test', ...testFiles(gaLane, dirs)]), s = parseTestSummary(r.out), ok = s.tests === want.tests && s.pass === want.pass && s.fail === want.fail && s.failing.length === expectFailing.length && expectFailing.every((e) => s.failing.some((f) => f.startsWith(e)));
    return { command: `node --test ${dirs.map((d) => `${d}/*.test.mjs`).join(' ')}`, lane: gaLane, expected: { ...want, failingTestsStartingWith: expectFailing }, actual: s, exit: r.exit, seconds: r.seconds, asExpected: ok }; };
  const mode = (name, gaLane, args, marker) => { log(name); const r = run(gaLane, args); return { command: `node ${args.join(' ')}`, lane: gaLane, expectedMarker: marker, markerFound: r.out.includes(marker), exit: r.exit, seconds: r.seconds, asExpected: r.out.includes(marker) }; };
  return {
    sk1Check: mode('SK1 run.mjs check', SK1, ['infra/run.mjs', 'check'], 'SK1_CHECK_PASS'),
    sk1Suite: suite('SK1 suite', SK1, ['tests', 'successor'], EXPECT.sk1.suite),
    sk11AnalysisCheck: mode('SK1.1 analysis check', SK11, ['diagnostics/analyze.mjs', 'check'], 'SK1_1_ANALYSIS_CHECK_PASS'),
    sk11Suite: suite('SK1.1 suite', SK11, ['diagnostics', 'r0', 'repro'], EXPECT.sk11.suite, [EXPECT.sk11.expectedFailingTest]),
    sk2fFeasibilityCheck: mode('SK2-F feasibility check', SK2F, ['diagnostics/feasibility.mjs', 'check'], 'SK2F_FEASIBILITY_CHECK_PASS'),
    sk2fStatusVerify: mode('SK2-F status verify', SK2F, ['infra-audit/status.mjs', 'verify'], 'SK2F_REPRO_STATUS_VERIFY_PASS'),
    sk2fSuite: suite('SK2-F suite', SK2F, ['diagnostics', 'infra-audit'], EXPECT.sk2f.suite),
    sk2fImportCutAuditVerify: mode('SK2-F import-cut audit verify', SK2F, ['infra-audit/import-cut-audit.mjs', 'verify'], 'SK2F_IMPORT_CUT_AUDIT_VERIFY_PASS'),
  };
}
/** Which item each run supports, so a failed run is visible next to the item it weakens. */
export const RUN_SUPPORTS = Object.freeze({ sk1Check: '03_SK1_CLASSIFICATION_AND_IDENTITIES', sk1Suite: '03_SK1_CLASSIFICATION_AND_IDENTITIES', sk11AnalysisCheck: '04_SK1_1_DIAGNOSTICS_IDENTITIES', sk11Suite: '04_SK1_1_DIAGNOSTICS_IDENTITIES', sk2fFeasibilityCheck: '05_SK2_F_CLASSIFICATION', sk2fStatusVerify: '05_SK2_F_CLASSIFICATION', sk2fSuite: '05_SK2_F_CLASSIFICATION', sk2fImportCutAuditVerify: '07_IMPORT_CUT_COMMIT' });
export function overall(core, runs) {
  const items = Object.fromEntries(Object.entries(core.items).map(([k, v]) => [k, v.status])), runsOk = runs ? Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.asExpected])) : null;
  const weakened = runs ? Object.entries(runs).filter(([, v]) => !v.asExpected).map(([k]) => `${RUN_SUPPORTS[k]} (run ${k})`) : [];
  return { items, runs: runsOk ?? 'NOT_RUN', itemsWeakenedByAFailedRun: weakened, allItemsVerified: Object.values(items).every((s) => s === 'VERIFIED'), allRunsAsExpected: runs ? weakened.length === 0 : null, gate0: Object.values(items).every((s) => s === 'VERIFIED') && runs && weakened.length === 0 ? 'PASS' : runs ? 'FAIL' : 'STATIC_CORE_ONLY' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), mode = args[0] === 'verify' ? 'verify' : args.includes('--write') ? 'write' : 'print', withRuns = mode === 'write' || args.includes('--with-runs');
  const { core, volatile } = await buildCore();
  if (mode === 'verify') {
    const stored = existsSync(EVIDENCE_FILE) ? readJ(EVIDENCE_FILE) : null, v = verifyAgainst(stored, core), runs = withRuns ? executeRuns((m) => console.error(`[run] ${m}`)) : null, o = overall(core, runs);
    const pass = v.ok && (runs ? o.allRunsAsExpected : true);
    console.log(J({ mode, wroteAnything: false, recordedAtHead: stored?.volatile?.head ?? null, headNow: volatile.head, coreSha256: { stored: stored?.coreSha256 ?? null, recomputed: sha(stable(core)) }, items: o.items, runs: o.runs, drift: v.drift, notVerified: v.failed, result: pass ? 'HDISC0_INHERITANCE_VERIFY_PASS' : 'HDISC0_INHERITANCE_VERIFY_FAILED' }, null, 1)); if (!pass) process.exitCode = 1;
  } else {
    const runs = withRuns ? executeRuns((m) => console.error(`[run] ${m}`)) : null, o = overall(core, runs);
    console.log(J({ mode, head: volatile.head, ...o, runDetail: runs && Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.actual ? `${v.actual.pass}/${v.actual.tests} pass, ${v.actual.fail} fail${v.actual.failing.length ? ' [' + v.actual.failing.join(' | ') + ']' : ''} (${v.seconds}s)` : `${v.markerFound ? v.expectedMarker : 'MARKER_MISSING'} (${v.seconds}s)`])) }, null, 1));
    if (mode === 'write') {
      const rec = { schema: SCHEMA, authority: 'R0', stage: 'STAGE3H H-DISC-0 Gate 0', generatedAt: new Date().toISOString(), disclosure: 'Identities only: paths, commit ids, sha256, counts and verdict strings quoted from tracked records. No seed, world hash or evaluator truth. `core` is recomputable and is what `verify` compares; `volatile` and `runs` are dated observations. Nothing was rerun as a scientific evaluation, rewritten or recommitted.',
        verifierSha256: fileSha(fileURLToPath(import.meta.url)), summary: o, volatile, coreSha256: sha(stable(core)), core, runs };
      const fd = openSync(EVIDENCE_FILE, 'wx'); writeSync(fd, JSON.stringify(rec, null, 1) + '\n'); closeSync(fd); console.log(`written ${posix(relative(REPO, EVIDENCE_FILE))}`);
    }
    if (o.gate0 === 'FAIL' || !o.allItemsVerified) process.exitCode = 1;
  }
}
