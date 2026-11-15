// STAGE 3H-SK2-F Gate 5 — audit of the public-projection import cut (READ-ONLY; authority R0).
//   node infra-audit/import-cut-audit.mjs            recompute and print a summary (no test suites are run)
//   node infra-audit/import-cut-audit.mjs --write    the same, run the compatibility suites, create evidence/SK2F_IMPORT_CUT_AUDIT.json (exclusive)
//   node infra-audit/import-cut-audit.mjs verify     recompute the state-independent core and compare with the stored record; writes nothing
//
// The file audited is stage3h-hw1-dev-v1/public-projection.mjs. Two revisions exist:
//   OLD  the only revision ever committed up to base 16ae5c21 (sha256 2d1e7061…): imports D4_ELEMENTS from ./transforms.mjs
//   CUT  the working-tree revision (sha256 c4f9532e…): takes the same constant from its definition site
// This script never stages, commits, checks out, restores or edits anything. It reads the OLD revision from the git
// object store and the CUT revision from the working tree, so its core is the same before and after the cut is
// committed; only `gitState` differs. A temporary directory is used to load the OLD revision and for a committed-source
// export; both are removed. No world is generated and no evaluator truth is read (class records are opened for their
// public `projection` only).
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { GIT, GA, REPO, SK1_LANE, sha, fileSha, readJ, posix, traceClosure, gitFacts, protectedIdentities, classify, CLASS, stable, deepDiff } from '../../stage3h-sk1-1-assurance-v1/repro/lib.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), AUDIT_FILE = resolve(LANE, 'evidence/SK2F_IMPORT_CUT_AUDIT.json'), SCHEMA = 'SK2F_IMPORT_CUT_AUDIT_V1';
export const PP_REL = 'platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs', PP = resolve(REPO, PP_REL), HW1 = resolve(GA, 'stage3h-hw1-dev-v1'), HW4 = resolve(GA, 'stage3h-hw4-value-band-v1'), SELF_REL = 'platform/game-agnostic/stage3h-sk2f-feasibility-v1/';
export const OLD_SHA = '2d1e70611b26005179cc50e21a9d6ec5eae59704d7db36e722bb28b53eacb9ca', CUT_SHA = 'c4f9532e0771e025513122052128b0d14185e4abcde3ace9de9de5d77db6c099';
export const RECORDED_DIFF_SHA = '93c0b22fe8ca59d4c329c5180008cf17880dae2d0fe718e0b3ff3ef44edc3653'; // HW4B_RECOVERY_MANIFEST.json importCut.unifiedDiffSha256
// The recorded five-line change: two lines removed, three added (one of them blank).
export const EXPECTED = Object.freeze({
  removed: ["import { orientDirection, DIRECTION_DELTAS } from '../src/forge-symmetric/orientation-symmetric-v1.js';", "import { D4_ELEMENTS } from './transforms.mjs';"],
  added: ["import { orientDirection, DIRECTION_DELTAS, ORIENTATIONS } from '../src/forge-symmetric/orientation-symmetric-v1.js';", '', 'const D4_ELEMENTS = ORIENTATIONS; // 8 dihedral labels; identity with transforms.mjs D4_ELEMENTS, imported from its definition site'],
});
const NODE = process.execPath, J = JSON.stringify, ga = (rel) => rel.replace(/^platform\/game-agnostic\//, '');
const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 29 });
const gitBuf = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'ignore'] });

// ---------------------------------------------------------------------------------------------------------------------
// pure helpers (tested with negative controls)
// ---------------------------------------------------------------------------------------------------------------------
/** Line diff of two texts that differ in one contiguous hunk: common prefix, common suffix, and what lies between. */
export function lineDiff(oldText, newText) {
  const a = oldText.split('\n'), b = newText.split('\n'); let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return { firstChangedLine: p + 1, unchangedPrefixLines: p, unchangedSuffixLines: s, removed: a.slice(p, a.length - s), added: b.slice(p, b.length - s) };
}
/** Condition 1 as a pure predicate: the change is EXACTLY the recorded one. Returns { ok, problems }. */
export function isExactlyTheRecordedCut(oldText, newText, expected = EXPECTED) {
  const d = lineDiff(oldText, newText), problems = [];
  if (J(d.removed) !== J(expected.removed)) problems.push('REMOVED_LINES_DIFFER_FROM_RECORD');
  if (J(d.added) !== J(expected.added)) problems.push('ADDED_LINES_DIFFER_FROM_RECORD');
  if (sha(oldText) !== OLD_SHA) problems.push('OLD_REVISION_HASH_MISMATCH'); if (sha(newText) !== CUT_SHA) problems.push('CUT_REVISION_HASH_MISMATCH');
  return { ok: problems.length === 0, problems, diff: d, linesRemoved: d.removed.length, linesAdded: d.added.length, totalChangedLines: d.removed.length + d.added.length };
}
/** '-' and '+' body lines of a unified diff. */
export const hunkLines = (unified) => { const body = unified.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |@@ )/.test(l)); return { removed: body.filter((l) => l.startsWith('-')).map((l) => l.slice(1)), added: body.filter((l) => l.startsWith('+')).map((l) => l.slice(1)) }; };

// The frozen H-W4 static-import rule, restated literally from stage3h-hw4-value-band-v1/hw4-validate.mjs (a test asserts
// these literals still occur verbatim in that tracked file). Applied here to both revisions; nothing is re-qualified.
export const HW4_FORBIDDEN_SPEC = /evaluator|hw1-eval|(^|\/)(i2-|i4-|i5-|i3-audit|transforms)|lib\.mjs|stage3h-(?!hw[14]-dev|hw4-value-band)|\/scripts\/|\/work\/|\/evidence\/|^node:(?!crypto$)/;
export const HW4_FORBIDDEN_TOKEN = /\b(readFileSync|readFile|writeFileSync|writeFile|fetch|Math\.random|Date\.now|new Date|process\.env|child_process|XMLHttpRequest)\b/g, HW4_TOKEN_EXEMPT = { 'hw4-policy.mjs': ['performance.now'] };
export function hw4RuleAudit(sources, read = (f) => readFileSync(f, 'utf8')) {
  const files = new Map(), walk = (f) => { f = resolve(f); if (files.has(f)) return; const src = read(f), specs = [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]); files.set(f, { specs, src }); for (const s of specs) if (s.startsWith('.')) walk(resolve(f, '..', s)); };
  for (const f of sources) walk(f);
  const rows = [...files].map(([f, { specs, src }]) => { const rel = posix(relative(GA, f)), exempt = HW4_TOKEN_EXEMPT[rel.split('/').pop()] ?? [];
    return { file: rel, forbiddenImports: specs.filter((s) => HW4_FORBIDDEN_SPEC.test(s) || !(s.startsWith('.') || s === 'node:crypto')), forbiddenTokens: [...new Set([...src.matchAll(HW4_FORBIDDEN_TOKEN)].map((m) => m[1]))].filter((t) => !exempt.includes(t)) }; });
  return { files: rows.length, violations: rows.reduce((s, r) => s + r.forbiddenImports.length + r.forbiddenTokens.length, 0), filesWithViolations: rows.filter((r) => r.forbiddenImports.length + r.forbiddenTokens.length).map((r) => r.file).sort() };
}
/** Condition 4 as a pure predicate over a closure listing: the cut closure must not reach the transform/evaluator graph. */
export function closureIsClean(rows) {
  const bad = rows.filter((r) => /(^|\/)transforms\.mjs$|\/scripts\/|(^|\/)scripts\/|failure-diagnosis-v1\/lib\.mjs$|hw1-eval|counterfactual|evaluat|stage3h-canonical-v1\/|ascii-suite\//.test(r.file) || r.class === CLASS.PROT || r.class === CLASS.MISSING || r.class === CLASS.OTHER);
  return { ok: bad.length === 0, offending: bad.map((r) => `${r.file} [${r.class}]`) };
}

// ---------------------------------------------------------------------------------------------------------------------
// git facts for the two revisions (works before and after the cut is committed)
// ---------------------------------------------------------------------------------------------------------------------
export function revisions() {
  const commits = git('rev-list', 'HEAD', '--', PP_REL).split('\n').filter(Boolean), byCommit = commits.map((c) => { const buf = gitBuf('show', `${c}:${PP_REL}`); return { commit: c, sha256: sha(buf), blob: git('rev-parse', `${c}:${PP_REL}`).trim(), subject: git('log', '-1', '--format=%s', c).trim() }; });
  const oldRev = byCommit.find((r) => r.sha256 === OLD_SHA) ?? null, headSha = sha(gitBuf('show', `HEAD:${PP_REL}`)), workSha = fileSha(PP);
  const state = headSha === OLD_SHA && workSha === CUT_SHA ? 'CUT_UNCOMMITTED' : headSha === CUT_SHA && workSha === CUT_SHA ? 'CUT_COMMITTED' : 'UNEXPECTED';
  return { oldRev, byCommit, headSha, workSha, state, head: git('rev-parse', 'HEAD').trim(), oldText: oldRev ? gitBuf('show', `${oldRev.commit}:${PP_REL}`).toString('utf8') : null, cutText: readFileSync(PP, 'utf8') };
}

// ---------------------------------------------------------------------------------------------------------------------
// condition 2: semantics — load the OLD revision beside symlinks to the real siblings and compare every exported function
// ---------------------------------------------------------------------------------------------------------------------
function localProjections() {
  const out = [], add = (id, P) => { if (P && Array.isArray(P.menu) && Array.isArray(P.nodes)) out.push([id, P]); };
  for (const f of readdirSync(resolve(SK1_LANE, 'demo/fixtures')).sort()) { const r = readJ(resolve(SK1_LANE, 'demo/fixtures', f)), req = r.request ?? r; if (req?.state?.projection && req.legalActions) add(`demo:${f}`, { ...req.state.projection, menu: req.legalActions }); }
  const sources = { demoFixtures: out.length, classRecords: {} };
  for (const pop of ['EXPLORATION', 'VALIDATION']) { const dir = resolve(SK1_LANE, 'work/classes', pop); if (!existsSync(dir)) { sources.classRecords[pop] = 'ABSENT'; continue; } let n = 0;
    for (const f of readdirSync(dir).sort()) for (const c of JSON.parse(readFileSync(resolve(dir, f), 'utf8')).classes) { add(c.id, c.projection); n++; } // only the public `projection` field is used; truth is never touched
    sources.classRecords[pop] = n; }
  return { list: out, sources };
}
async function semantics(rev) {
  const tmp = mkdtempSync(resolve(tmpdir(), 'sk2f-cut-')), dir = resolve(tmp, 'ga/stage3h-hw1-dev-v1');
  try {
    mkdirSync(dir, { recursive: true }); writeFileSync(resolve(dir, 'public-projection.mjs'), rev.oldText); symlinkSync(resolve(HW1, 'transforms.mjs'), resolve(dir, 'transforms.mjs')); symlinkSync(resolve(GA, 'src'), resolve(tmp, 'ga/src'));
    const oldMod = await import(pathToFileURL(resolve(dir, 'public-projection.mjs')).href), cutMod = await import(pathToFileURL(PP).href);
    const orient = await import(pathToFileURL(resolve(GA, 'src/forge-symmetric/orientation-symmetric-v1.js')).href), tr = await import(pathToFileURL(resolve(HW1, 'transforms.mjs')).href);
    const surface = (m) => Object.keys(m).sort().map((k) => `${k}:${typeof m[k]}`), T = [...orient.ORIENTATIONS];
    const constants = (m) => J(Object.keys(m).sort().filter((k) => typeof m[k] !== 'function' && k !== 'D4_LINEAR').map((k) => [k, m[k]]));
    const linear = (m) => J(T.map((t) => [[1, 0], [0, 1], [2, -3], [-1, 4], [7, 7]].map(([x, y]) => m.D4_LINEAR[t](x, y))));
    const outputs = (m, P) => { const sym = m.symmetryReport(P), col = m.refine(P), n = P.menu.length, score = (i) => (i * 7 + 3) % 5;
      return J([T.map((t) => m.frameProjection(P, t)), m.keysV2(P), P.menu.map((_, i) => m.keyV1(P, i)), col, P.menu.map((_, i) => m.actionSig(P, col, i)), T.map((t) => m.structureDigest(P, t)), sym, m.canonicalFrame(P), m.canonicalActionKeys(P),
        m.selectEquivariant(P, score, sym), m.isomorphism(m.frameProjection(P, 'R90'), m.frameProjection(P, 'R0')) !== null, n]); };
    const { list, sources } = localProjections(); let differing = 0; const digestOld = [], digestCut = [];
    for (const [id, P] of list) { const a = outputs(oldMod, P), b = outputs(cutMod, P); if (a !== b) differing++; digestOld.push(sha(a)); digestCut.push(sha(b)); }
    const cutLines = rev.cutText.split('\n'), uses = cutLines.map((l, i) => (l.includes('D4_ELEMENTS') ? i + 1 : 0)).filter(Boolean), fnOf = (ln) => { for (let i = ln - 1; i >= 0; i--) { const m = /^export (?:function|const) (\w+)/.exec(cutLines[i]); if (m) return m[1]; } return null; };
    // SK1 infra/derive-projection.mjs runs on import and WRITES when --write is in argv, so it is never imported into this
    // process: derive() is called in a child process with a clean argument list, and only two hashes come back.
    const laneFile = readFileSync(resolve(SK1_LANE, 'adapters/forge/projection.mjs'), 'utf8'), child = spawnSync(NODE, ['--input-type=module', '-e', `import { readFileSync } from 'node:fs'; import { createHash } from 'node:crypto'; const { derive } = await import(${J(pathToFileURL(resolve(SK1_LANE, 'infra/derive-projection.mjs')).href)}); const h = (t) => createHash('sha256').update(t).digest('hex'); console.log('@@SK2F@@' + JSON.stringify({ old: h(derive(readFileSync(${J(resolve(dir, 'public-projection.mjs'))}, 'utf8')).text), cut: h(derive(readFileSync(${J(PP)}, 'utf8')).text) }));`], { encoding: 'utf8' });
    const derived = JSON.parse((/@@SK2F@@(.*)/.exec(child.stdout ?? '') ?? [null, '{"old":null,"cut":null}'])[1]);
    const trSrc = readFileSync(resolve(HW1, 'transforms.mjs'), 'utf8');
    return { textual: { everyLineOutsideTheHunkIsIdentical: true, note: 'follows from condition 1: the two revisions share every line except the recorded hunk, so every function body is byte-identical', d4ElementsReferencedAtLines: uses, referencedOnlyInside: [...new Set(uses.slice(1).map(fnOf))].sort(),
        projectPublicAndTraceReadsDoNotReferenceIt: !['projectPublic', 'traceReads'].some((f) => uses.slice(1).map(fnOf).includes(f)), transformsDefinesItAsTheSameConstant: /export const D4_ELEMENTS = ORIENTATIONS\b/.test(trSrc) },
      bindingIdentity: { transformsD4ElementsIsTheOrientationConstant: tr.D4_ELEMENTS === orient.ORIENTATIONS, value: T, frozen: Object.isFrozen(orient.ORIENTATIONS) },
      exportSurface: { identical: J(surface(oldMod)) === J(surface(cutMod)), exports: surface(cutMod) }, constantsIdentical: constants(oldMod) === constants(cutMod), d4LinearIdenticalOnSamples: linear(oldMod) === linear(cutMod),
      measuredNow: { projectionsCompared: list.length, sources, functionsCompared: ['frameProjection x8', 'keysV2', 'keyV1', 'refine', 'actionSig', 'structureDigest x8', 'symmetryReport', 'canonicalFrame', 'canonicalActionKeys', 'selectEquivariant', 'isomorphism'], projectionsWithAnyDifferingOutput: differing, outputDigestOld: sha(digestOld.join('\n')), outputDigestCut: sha(digestCut.join('\n')),
        notMeasuredDynamically: 'projectPublic(view) and traceReads(view) need a native observable view, which would require generating a world; they are covered by the textual identity above and do not reference the changed binding' },
      sk1Derivation: { derivedFromOld: derived.old, derivedFromCut: derived.cut, committedLaneProjection: sha(laneFile), allThreeEqual: derived.old !== null && derived.old === derived.cut && derived.cut === sha(laneFile) },
      reusedExistingEvidence: ['stage3h-sk1-safety-kernel-v1/tests/projection.test.mjs (binding identity; lane-local projection equals the frozen module)', 'stage3h-sk1-safety-kernel-v1/evidence/SK1_PROJECTION_PROVENANCE.json (derivation identical from both revisions)', 'stage3h-hw4-value-band-v1/H_W4B_ENGINEERING_RISK_REGISTER.md ER-03 (frozen H-W4 C10 decisions reproduced 600/600 with the cut)'] };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------------------------------------------------
// condition 4: static import closures of both revisions; a committed-source export of the cut closure
// ---------------------------------------------------------------------------------------------------------------------
function closures(rev) {
  const F = { ...gitFacts(), protectedMap: new Map((protectedIdentities() ?? []).map((r) => [r.path, r.sha256])) };
  const rowsOf = (read) => [...traceClosure([PP], { read })].map(([abs, n]) => { const rel = posix(relative(REPO, abs)), c = classify(rel, n.sha256, F); return { file: ga(rel), sha256: n.sha256, class: rel === PP_REL ? 'ENTRY' : c.class, imports: n.bare }; }).sort((a, b) => (a.file < b.file ? -1 : 1));
  const oldRows = rowsOf((p) => (p === PP ? rev.oldText : readFileSync(p, 'utf8'))), cutRows = rowsOf((p) => (p === PP ? rev.cutText : readFileSync(p, 'utf8')));
  const count = (rows) => rows.reduce((o, r) => { o[r.class] = (o[r.class] ?? 0) + 1; return o; }, {}), clean = closureIsClean(cutRows.filter((r) => r.class !== 'ENTRY'));
  const role = (f) => (f === 'src/forge/kernel.js' ? 'NATIVE_ENGINE (world construction and stepping are defined here; not an evaluator, not a comparator; reached only through orientation-symmetric-v1.js)' : f.startsWith('src/forge/') ? 'NATIVE_ENGINE_CONTRACT (vocabulary constants)' : f.startsWith('src/core/') ? 'CORE_UTILITY' : f.startsWith('src/forge-symmetric/') ? 'ORIENTATION_TABLES (definition site of ORIENTATIONS)' : 'ENTRY');
  const policy = ['hw4-policy.mjs', 'hw4-features.mjs', 'hw4-contract-v2.mjs'].map((f) => resolve(HW4, f)).concat(PP), ruleOld = hw4RuleAudit(policy, (f) => (f === PP ? rev.oldText : readFileSync(f, 'utf8'))), ruleCut = hw4RuleAudit(policy, (f) => (f === PP ? rev.cutText : readFileSync(f, 'utf8')));
  // committed-source export: every closure file from the base commit, the entry at the CUT revision, nothing else
  const tmp = mkdtempSync(resolve(tmpdir(), 'sk2f-export-')); let exportResult;
  try {
    for (const r of cutRows) { const rel = `platform/game-agnostic/${r.file}`, dst = resolve(tmp, rel); mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, r.class === 'ENTRY' ? rev.cutText : gitBuf('show', `HEAD:${rel}`)); }
    writeFileSync(resolve(tmp, 'platform/game-agnostic/package.json'), gitBuf('show', 'HEAD:platform/game-agnostic/package.json'));
    const probe = `import * as m from ${J(pathToFileURL(resolve(tmp, PP_REL)).href)}; const P={version:m.PROJECTION_VERSION,tick:0,grid:{width:5,height:5},actor:{energy:10,health:100,carried:0,ticksRemaining:9,terrain:'TRAVERSABLE',borderDistance:1},history:{n:0,channels:[]},terrainCounts:{},nodes:[],menu:[{type:'WAIT',params:{},target:null,dependent:null,disp:null,toRel:null,cost:0,pre:[],eff:[],energyAfter:10,destTerrain:null}],frame:'R0'}; console.log(JSON.stringify({ exports: Object.keys(m).length, frames: Object.keys(m.D4_LINEAR), keys: m.keysV2(P).length, canonical: m.canonicalFrame(P).frames.length }));`;
    const run = spawnSync(NODE, ['--input-type=module', '-e', probe], { cwd: tmp, encoding: 'utf8' }), files = cutRows.length + 1;
    exportResult = { method: 'the cut closure written to an empty temporary directory from committed blobs (entry at the CUT revision) plus package.json; the module is imported there and exercised on a minimal projection', filesInExport: files, importSucceeded: run.status === 0, output: run.status === 0 ? JSON.parse(run.stdout) : null, error: run.status === 0 ? null : String(run.stderr).split('\n').find((l) => /Error/.test(l)) ?? 'unknown' };
    // the OLD revision in an export of tracked files only: it cannot link without the protected overlay
    const tmpOld = mkdtempSync(resolve(tmpdir(), 'sk2f-export-old-'));
    try { for (const r of oldRows.filter((x) => x.class !== CLASS.PROT)) { const rel = `platform/game-agnostic/${r.file}`, dst = resolve(tmpOld, rel); mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, r.class === 'ENTRY' ? rev.oldText : gitBuf('show', `HEAD:${rel}`)); }
      writeFileSync(resolve(tmpOld, 'platform/game-agnostic/package.json'), gitBuf('show', 'HEAD:platform/game-agnostic/package.json'));
      const r2 = spawnSync(NODE, ['--input-type=module', '-e', `await import(${J(pathToFileURL(resolve(tmpOld, PP_REL)).href)}); console.log('linked');`], { cwd: tmpOld, encoding: 'utf8' }), miss = /Cannot find module '([^']+)'/.exec(r2.stderr ?? '');
      exportResult.oldRevisionFromTrackedFilesOnly = { importSucceeded: r2.status === 0, firstUnresolvedModule: miss ? miss[1].replace(/^.*\/platform\/game-agnostic\//, '') : null };
    } finally { rmSync(tmpOld, { recursive: true, force: true }); }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return { method: 'transitive static relative imports (SK1.1 repro/lib.mjs traceClosure)', oldRevision: { files: oldRows.length, byClass: count(oldRows), containsTransforms: oldRows.some((r) => /transforms\.mjs$/.test(r.file)), custodyProtectedFiles: oldRows.filter((r) => r.class === CLASS.PROT).map((r) => r.file), scriptsFiles: oldRows.filter((r) => r.file.startsWith('scripts/')).length, closureSha256: sha(oldRows.map((r) => `${r.file}:${r.sha256}`).join('\n')) },
    cutRevision: { files: cutRows.length, byClass: count(cutRows), containsTransforms: cutRows.some((r) => /transforms\.mjs$/.test(r.file)), custodyProtectedFiles: [], closureSha256: sha(cutRows.map((r) => `${r.file}:${r.sha256}`).join('\n')), list: cutRows.map((r) => ({ file: r.file, sha256: r.sha256, trackedAtBase: r.class === 'ENTRY' ? 'tracked; this is the file the commit changes' : r.class, role: role(r.file), nonRelativeImports: r.imports })) },
    removedByTheCut: oldRows.filter((r) => !cutRows.some((c) => c.file === r.file)).length, cleanOfTransformEvaluatorAndProtectedFiles: clean,
    residualEdge: { path: 'public-projection.mjs -> src/forge-symmetric/orientation-symmetric-v1.js -> src/forge/kernel.js (and src/forge/contract.js, src/core/determinism.js, src/core/errors.js)', statement: 'The native engine module remains statically reachable, exactly as in the OLD revision. It is tracked, not custody-protected and not an evaluator; nothing in public-projection.mjs calls it. Whether a flat no-engine rule would accept this edge is a separate contract question and is not decided here.' },
    resolvableFromCommittedSourceAlone: { beforeTheCommit: 'NO — the entry file at HEAD is the OLD revision', afterTheCommit: 'YES — every other closure file is already tracked and equal to HEAD', evidence: exportResult },
    frozenHw4Rule: { source: 'stage3h-hw4-value-band-v1/hw4-validate.mjs FORBIDDEN_SPEC / FORBIDDEN_TOKEN over the four H-W4 policy sources', oldRevision: ruleOld, cutRevision: ruleCut, recordedInRiskRegisterER03: { cut: '10 files, 0 violations', committedHead: '76 files, 40 violations' }, note: 'Restated and re-measured for the record. This is not a re-qualification of H-W4: its recorded verdicts are unchanged.' } };
}

// ---------------------------------------------------------------------------------------------------------------------
// condition 6: every tracked file that pins either revision
// ---------------------------------------------------------------------------------------------------------------------
const PIN_ROLES = {
  'stage3h-hw1-dev-v1/evidence/I1_PUBLIC_INPUT_AUDIT.json': ['H-W1', 'OLD', 'sourceHashes of the I-1 public-input audit (dated, carries its own head)'],
  'stage3h-hw1-dev-v1/evidence/I2_PCD_VALIDATION.json': ['H-W1', 'OLD', 'sourceHashes of the I-2 PCD validation (dated)'],
  'stage3h-hw1-dev-v1/evidence/I4_EXPLORATION_RESULTS.json': ['H-W1', 'OLD', 'code hashes of the I-4 exploration run (dated)'],
  'stage3h-hw1-dev-v1/evidence/I5_CANDIDATE_FREEZE.json': ['H-W1', 'OLD', 'sealed candidate freeze: code hash and policy-source import audit (dated)'],
  'stage3h-hw1-dev-v1/evidence/LANE_CONTENT_AUDIT_I1.json': ['H-W1', 'OLD', 'lane content audit file listing (dated)'],
  'stage3h-hw1-dev-v1/H_W3_FEASIBILITY.md': ['H-W3', 'CUT', 'prose: lists the cut as an uncommitted file preserved and not incorporated (dated to that stage)'],
  'stage3h-hw4-value-band-v1/evidence/HW4_CANDIDATE_FREEZE.json': ['H-W4', 'CUT', 'candidate freeze: hw1CodeHashes and policy-source import audit bound the UNCOMMITTED cut'],
  'stage3h-hw4-value-band-v1/evidence/HW4_EXPLORATION_V1_PUBLIC_ONLY.json': ['H-W4', 'CUT', 'exploration code hashes'],
  'stage3h-hw4-value-band-v1/evidence/HW4_EXPLORATION_V2_PUBLIC_PLUS_VALUE_BAND.json': ['H-W4', 'CUT', 'exploration code hashes'],
  'stage3h-hw4-value-band-v1/H_W4.md': ['H-W4', 'CUT', 'prose: static import gate measured on the cut, working-tree hash recorded'],
  'stage3h-hw4-value-band-v1/evidence/HW4B_PROTOCOL_FREEZE.json': ['H-W4B', 'CUT', 'protocol freeze code hashes'],
  'stage3h-hw4-value-band-v1/evidence/HW4B_PHASE1_REPRODUCIBILITY.json': ['H-W4B', 'BOTH', 'boundary measured on both revisions'],
  'stage3h-hw4-value-band-v1/evidence/HW4B_RECOVERY_MANIFEST.json': ['H-W4B', 'BOTH', 'embeds the five-line unified diff and both hashes; names its head'],
  'stage3h-hw4-value-band-v1/H_W4B.md': ['H-W4B', 'BOTH', 'prose: STATIC_IMPORT_BOUNDARY=PASS_WORKING_TREE_ONLY, FAIL at committed HEAD (names the commit)'],
  'stage3h-hw4-value-band-v1/H_W4B_ENGINEERING_RISK_REGISTER.md': ['H-W4B', 'BOTH', 'ER-03 table: both hashes against named trees (working tree; committed HEAD 9175a555)'],
  'stage3h-sk1-safety-kernel-v1/evidence/SK1_EXPERIMENT_FREEZE.json': ['SK1', 'CUT', 'evaluationDependencies bound the UNCOMMITTED cut; lists it under evaluationDependenciesDifferingFromHead at freeze time'],
  'stage3h-sk1-safety-kernel-v1/evidence/SK1_CUSTODY_MANIFEST.json': ['SK1', 'CUT', 'modifiedVsHead listing at Gate 0 (dated)'],
  'stage3h-sk1-safety-kernel-v1/evidence/SK1_PROJECTION_PROVENANCE.json': ['SK1', 'BOTH', 'derivation provenance: both hashes, with the head they were read at'],
  'stage3h-sk1-1-assurance-v1/evidence/SK1_1_REPRO_INVENTORY.json': ['SK1.1', 'BOTH', 'dated inventory at 179922dd: classifies the file TRACKED_MODIFIED and records the head hash'],
  'stage3h-sk1-1-assurance-v1/SK1_REPRODUCIBILITY_GAP.md': ['SK1.1', 'BOTH', 'prose: the cut as an uncommitted supplement (dated to base 179922dd)'],
};
export function pins() {
  const files = git('grep', '-l', '-F', '-e', OLD_SHA.slice(0, 8), '-e', CUT_SHA.slice(0, 8), '--', '.').split('\n').filter(Boolean).filter((f) => !f.startsWith(SELF_REL)).sort();
  const rows = files.map((f) => { const t = readFileSync(resolve(REPO, f), 'utf8'), n = (s) => t.split(s).length - 1, role = PIN_ROLES[ga(f)];
    return { file: ga(f), fileSha256: sha(t), fullOld: n(OLD_SHA), fullCut: n(CUT_SHA), prefixOld: n(OLD_SHA.slice(0, 8)), prefixCut: n(CUT_SHA.slice(0, 8)), lane: role?.[0] ?? 'UNCLASSIFIED', binds: role?.[1] ?? 'UNCLASSIFIED', role: role?.[2] ?? 'UNCLASSIFIED — a new pin that this audit has not reviewed', rewrittenByTheCommit: false }; });
  const by = (b) => rows.filter((r) => r.binds === b).map((r) => r.file);
  return { method: 'git grep -F for the first 8 hex digits of either sha256 over every tracked file (this lane excluded)', files: rows.length, unclassified: rows.filter((r) => r.lane === 'UNCLASSIFIED').map((r) => r.file), rows,
    boundTheOldRevision: by('OLD'), boundTheUncommittedCut: by('CUT'), recordBoth: by('BOTH'),
    lanes: { 'H-W1 (I-1, I-2, I-4, I-5 freeze, lane audit)': 'OLD', 'H-W4 (candidate freeze, both exploration records)': 'CUT (uncommitted at the time)', 'H-W4B (protocol freeze)': 'CUT; its records name both', SK1: 'CUT (uncommitted at the time; disclosed in the freeze)', 'SK1.1': 'records both' },
    effectOfCommitting: 'No pinned record is edited. Every pin is a dated statement carrying, or made at, a named commit. After the commit a checkout of the new HEAD carries the CUT revision; the OLD revision that the H-W1 records pin remains retrievable from history (see oldRevision).' };
}

// ---------------------------------------------------------------------------------------------------------------------
// conditions 3 and 7, and the block question
// ---------------------------------------------------------------------------------------------------------------------
async function custodyAndFreeze() {
  const { buildCore } = await import(pathToFileURL(resolve(GA, 'stage3h-sk1-1-assurance-v1/repro/inventory.mjs')).href), core = await buildCore(), c = core.custody;
  return { protectedIdentities: c.protectedIdentities, present: c.present, matchingRecordedIdentity: c.matchingRecordedIdentity, trackedAtHead: c.trackedAtHead, guardManifestIntact: c.guardManifestIntact, sk1FreezeDescribesTheDisk: core.freezeBinding.allOk, freezeChecks: core.freezeBinding.checks.map((k) => `${k.name}:${k.ok ? 'ok' : 'DRIFT'}`),
    sk1FreezePinsThisFileAt: readJ(resolve(SK1_LANE, 'evidence/SK1_EXPERIMENT_FREEZE.json')).evaluationDependencies['stage3h-hw1-dev-v1/public-projection.mjs'] };
}
function blockQuestion() {
  const prot = protectedIdentities() ?? [], gov = readJ(resolve(REPO, 'governance/frozen-paths.json')), closure = readFileSync(resolve(HW1, 'H_W1_CLOSURE.md'), 'utf8'), frozenRoots = [...(gov.additional_frozen_paths ?? [])];
  return { custodyProtectedIdentity: prot.some((r) => r.path === PP_REL || r.sha256 === OLD_SHA || r.sha256 === CUT_SHA), underAGovernanceFrozenPath: frozenRoots.some((p) => PP_REL.startsWith(p + '/')), governanceFrozenPaths: frozenRoots,
    hw1ClosureRecordsStaticImportFail: /STATIC_IMPORT_CONTRACT=FAIL/.test(closure), hw1ClosureSaysEdgeRetainedBecauseOfPins: /deliberately retained because four\s+sealed evidence files pin the sha/.test(closure), hw1ClosureRequiresOwnerAuthorizationForACorrectedBoundary: /corrected inference\s+dependency boundary[\s\S]{0,120}separate owner\s+authorization/.test(closure),
    reading: 'The file is tracked source, not a custody-protected identity and not under a governance frozen path. It IS a pinned dependency of the sealed H-W1 candidates, and the H-W1 closure left the edge in place for that reason and reserved a corrected boundary for separate owner authorization. That authorization is what the SK2-F mandate conditionally gives. The H-W1 verdict STATIC_IMPORT_CONTRACT=FAIL is a statement about the OLD revision, which stays in history unchanged; committing the cut does not repair it retroactively and must not be described as doing so.' };
}
function liveTools() {
  return [
    { tool: 'stage3h-sk1-safety-kernel-v1/infra/run.mjs check', readsGitHead: false, changesAfterCommit: 'NO — the freeze binds file CONTENT (sha256 c4f9532e…), which the commit does not change; verified by the compatibility run and by the simulated post-commit run in the tests' },
    { tool: 'stage3h-sk1-safety-kernel-v1/tests/projection.test.mjs', readsGitHead: false, changesAfterCommit: 'NO — derives from the working file and compares with the tracked lane projection' },
    { tool: 'stage3h-sk1-1-assurance-v1/repro/inventory.mjs verify (and the INTEGRATION test in repro.test.mjs)', readsGitHead: true, changesAfterCommit: 'YES, EXPECTED AND DISCLOSED — the dated inventory at 179922dd classifies this file TRACKED_MODIFIED; after the commit it is TRACKED_EQUALS_HEAD (same sha256), so verify reports drift on that row and on the class counts derived from it. infra-audit/status.mjs labels exactly those rows EXPECTED_AFTER_IMPORT_CUT_COMMIT. The SK1.1 record is not edited.' },
    { tool: 'stage3h-sk1-1-assurance-v1/repro/clean-checkout-probe.mjs and backup-manifest.mjs', readsGitHead: true, changesAfterCommit: 'YES, EXPECTED — one supplement fewer (the uncommitted file) and one uncommitted modification fewer; neither stores a verdict in a tracked file by itself' },
    { tool: 'stage3h-sk1-safety-kernel-v1/infra/custody-manifest.mjs and derive-projection.mjs (print modes)', readsGitHead: true, changesAfterCommit: 'print-mode output only (modifiedVsHead becomes empty; both derivations already identical). Their tracked records are dated and are not rewritten; --write is exclusive or not re-run' },
    { tool: 'stage3h-hw1-dev-v1 i1/i2/i5 and stage3h-hw4-value-band-v1 hw4-validate (one-shot writers)', readsGitHead: 'only to stamp the head they ran at', changesAfterCommit: 'not re-run; they hash the working file, which is unchanged' },
    { tool: 'stage3h-hw4-value-band-v1/hw4b-phase12.mjs (untracked)', readsGitHead: true, changesAfterCommit: 'if re-run it would no longer find an uncommitted diff; its tracked output HW4B_RECOVERY_MANIFEST.json is dated to 9175a555 and is not rewritten' },
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// compatibility runs (condition 5) — only on --write
// ---------------------------------------------------------------------------------------------------------------------
function compatibility() {
  const tests = (cwd, globs) => { const files = globs.flatMap((g) => { const d = resolve(cwd, dirname(g)); return readdirSync(d).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => resolve(d, n)); }), r = spawnSync(NODE, ['--test', ...files], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }), num = (k) => Number((new RegExp(`^ℹ ${k} (\\d+)`, 'm').exec(r.stdout) ?? [0, NaN])[1]); return { files: files.length, tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped'), exit: r.status }; };
  const sk1 = tests(SK1_LANE, ['tests/x', 'successor/x']), sk11 = tests(resolve(GA, 'stage3h-sk1-1-assurance-v1'), ['diagnostics/x', 'r0/x', 'repro/x']);
  const chk = spawnSync(NODE, ['infra/run.mjs', 'check'], { cwd: SK1_LANE, encoding: 'utf8', maxBuffer: 1 << 28 }), g = spawnSync(NODE, ['hw4-gates.mjs'], { cwd: HW4, encoding: 'utf8', maxBuffer: 1 << 28 }); let gates = null; try { gates = JSON.parse(g.stdout.slice(g.stdout.indexOf('{'))); } catch { gates = null; }
  return { sk1Tests: sk1, sk1Check: { result: /SK1_CHECK_PASS/.test(chk.stdout) ? 'SK1_CHECK_PASS' : 'SK1_CHECK_FAILED', reproducedSections: (/"reproducedKeys": (\d+)/.exec(chk.stdout) ?? [])[1] ?? null }, sk11Tests: sk11,
    hw4Gates: gates ? { script: 'stage3h-hw4-value-band-v1/hw4-gates.mjs (read-only; run unmodified)', exit: g.status, failures: gates.failures ?? null, staticImportBoundaryG1: !(gates.failures ?? []).some((f) => /^G1_/.test(f)), note: 'G8 depends on a gitignored P2R scratch dataset and fails for want of it, independently of the import cut; nothing was repaired' } : { script: 'hw4-gates.mjs', exit: g.status, parse: 'FAILED' } };
}

// ---------------------------------------------------------------------------------------------------------------------
export async function buildCore() {
  const rev = revisions(); if (!rev.oldRev) throw Error('OLD_REVISION_NOT_FOUND_IN_HISTORY'); if (rev.state === 'UNEXPECTED') throw Error(`UNEXPECTED_FILE_STATE:head=${rev.headSha.slice(0, 12)},work=${rev.workSha.slice(0, 12)}`);
  const exact = isExactlyTheRecordedCut(rev.oldText, rev.cutText), rec = readJ(resolve(HW4, 'evidence/HW4B_RECOVERY_MANIFEST.json')).importCut, prov = readJ(resolve(SK1_LANE, 'evidence/SK1_PROJECTION_PROVENANCE.json'));
  const liveDiff = git('diff', rev.oldRev.commit, '--', PP_REL), hl = hunkLines(rec.unifiedDiff), numstat = git('diff', '--numstat', rev.oldRev.commit, '--', PP_REL).trim().split(/\s+/);
  const proposalFile = resolve(HW1, 'PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md'), proposal = existsSync(proposalFile) ? readFileSync(proposalFile, 'utf8') : null, code = (l) => l.replace(/\s*\/\/.*$/, '');
  const c1 = { oldSha256: OLD_SHA, cutSha256: CUT_SHA, oldBlob: rev.oldRev.blob, oldRevisionCommittedIn: rev.oldRev.commit, oldRevisionCommitSubject: rev.oldRev.subject, revisionsInHistoryBeforeTheCut: rev.byCommit.filter((r) => r.sha256 !== CUT_SHA).length,
    exactlyTheRecordedCut: exact.ok, problems: exact.problems, linesRemoved: exact.linesRemoved, linesAdded: exact.linesAdded, totalChangedLines: exact.totalChangedLines, firstChangedLine: exact.diff.firstChangedLine, unchangedLinesBefore: exact.diff.unchangedPrefixLines, unchangedLinesAfter: exact.diff.unchangedSuffixLines, gitNumstat: { added: Number(numstat[0]), removed: Number(numstat[1]) },
    recordedDiff: { source: 'stage3h-hw4-value-band-v1/evidence/HW4B_RECOVERY_MANIFEST.json importCut (tracked, dated 9175a555)', recordedSha256: rec.unifiedDiffSha256, embeddedTextSha256: sha(rec.unifiedDiff), liveDiffAgainstOldRevisionSha256: sha(liveDiff), liveDiffIsByteIdenticalToTheRecordedDiff: liveDiff === rec.unifiedDiff && sha(liveDiff) === RECORDED_DIFF_SHA,
      recordedHunkEqualsExpected: J(hl.removed) === J(EXPECTED.removed) && J(hl.added) === J(EXPECTED.added), recordedHashes: { committedHead: rec.committedHeadSha256, workingTree: rec.workingTreeSha256 } },
    sk1ProvenanceAgrees: prov.sourceSha256.committedHead === OLD_SHA && prov.sourceSha256.workingTree === CUT_SHA && J(prov.removedLines.committedHead) === J(EXPECTED.removed) && J(prov.removedLines.workingTree) === J(EXPECTED.added.filter(Boolean)),
    proposalDraft: proposal === null ? { present: false } : { present: true, file: 'stage3h-hw1-dev-v1/PROPOSAL_PUBLIC_PROJECTION_IMPORT_CUT.md (untracked draft, not modified)', currentLinesMatch: EXPECTED.removed.every((l) => proposal.includes(l)), proposedImportLineMatches: proposal.includes(EXPECTED.added[0]), proposedConstStatementMatchesAsCode: proposal.includes(code(EXPECTED.added[2])),
      proposedConstCommentIdentical: proposal.includes(EXPECTED.added[2]), note: 'The applied edit equals the draft as code. The trailing comment on the const line was worded differently in the draft; the tracked record of the applied edit is the embedded diff above.' } };
  const c2 = await semantics(rev), c3 = await custodyAndFreeze(), c4 = closures(rev), c6 = pins(), block = blockQuestion();
  const c7 = { pathsTheCommitWouldTouch: [PP_REL], exactlyOnePath: true, noTrackedRecordIsEdited: true, sk1FreezeHashUnaffected: c3.sk1FreezePinsThisFileAt === CUT_SHA, freezeBindsContentNotCommit: 'SK1_EXPERIMENT_FREEZE.json evaluationDependencies holds sha256 of file content; checkFreeze compares content hashes only', liveToolsWhoseOutputChanges: liveTools() };
  const ok = { c1: c1.exactlyTheRecordedCut && c1.recordedDiff.liveDiffIsByteIdenticalToTheRecordedDiff && c1.recordedDiff.recordedHunkEqualsExpected && c1.sk1ProvenanceAgrees && c1.totalChangedLines === 5,
    c2: c2.bindingIdentity.transformsD4ElementsIsTheOrientationConstant && c2.exportSurface.identical && c2.constantsIdentical && c2.d4LinearIdenticalOnSamples && c2.measuredNow.projectionsWithAnyDifferingOutput === 0 && c2.measuredNow.projectionsCompared > 0 && c2.sk1Derivation.allThreeEqual && c2.textual.projectPublicAndTraceReadsDoNotReferenceIt && c2.textual.transformsDefinesItAsTheSameConstant,
    c3: c3.matchingRecordedIdentity === c3.protectedIdentities && c3.trackedAtHead === 0 && c3.guardManifestIntact && c3.sk1FreezeDescribesTheDisk,
    c4: c4.cleanOfTransformEvaluatorAndProtectedFiles.ok && !c4.cutRevision.containsTransforms && c4.resolvableFromCommittedSourceAlone.evidence.importSucceeded && c4.frozenHw4Rule.cutRevision.violations === 0,
    c6: c6.unclassified.length === 0, c7: c7.sk1FreezeHashUnaffected, block: !block.custodyProtectedIdentity && !block.underAGovernanceFrozenPath && block.hw1ClosureRecordsStaticImportFail };
  return { rev, core: { file: PP_REL, condition1_exactRecordedDiff: { pass: ok.c1, ...c1 }, condition2_semanticsUnchanged: { pass: ok.c2, ...c2 }, condition3_protectedInputsUnchanged: { pass: ok.c3, ...c3 }, condition4_staticReachability: { pass: ok.c4, ...c4 },
    condition6_historicalRecord: { pass: ok.c6, oldRevision: { sha256: OLD_SHA, blob: rev.oldRev.blob, commit: rev.oldRev.commit, retrieve: `git show ${rev.oldRev.commit.slice(0, 8)}:${PP_REL}`, staysInHistory: true }, ...c6 }, condition7_noHashRewritten: { pass: ok.c7, ...c7 }, blockQuestion: { blocked: !ok.block, ...block } }, ok };
}
const condition5 = (compat) => ({ pass: compat.sk1Tests.fail === 0 && compat.sk1Tests.exit === 0 && compat.sk1Check.result === 'SK1_CHECK_PASS' && compat.sk11Tests.fail === 0 && compat.sk11Tests.exit === 0 && compat.hw4Gates.staticImportBoundaryG1 === true, ...compat });
export function recommend(ok, c5pass) {
  const all = ok.c1 && ok.c2 && ok.c3 && ok.c4 && c5pass && ok.c6 && ok.c7 && ok.block;
  return { recommendation: all ? 'IMPORT_CUT_QUALIFIES_FOR_SCOPED_COMMIT' : 'IMPORT_CUT_COMMIT_BLOCKED', failing: Object.entries({ ...ok, c5: c5pass }).filter(([, v]) => !v).map(([k]) => k),
    scope: 'one path, one local commit, described as a PROSPECTIVE source correction; old sha256 2d1e7061… and new sha256 c4f9532e… recorded in the commit message',
    mustNotBeClaimed: ['that the H-W1 STATIC_IMPORT_CONTRACT=FAIL verdict is repaired (it describes the OLD revision, which is unchanged in history)', 'that H-W4 or SK1 were evaluated on committed source (they bound the cut while it was uncommitted)', 'that evaluation becomes reproducible from a clean checkout (the 29 protected files and the local data are still required)', 'that the exclusion loaders become importable from a clean checkout (their dependency on protected source does not pass through this file)'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] === 'verify' ? 'verify' : process.argv.includes('--write') ? 'write' : 'print', { rev, core, ok } = await buildCore(), gitState = { head: rev.head, headBlobSha256: rev.headSha, workingTreeSha256: rev.workSha, state: rev.state };
  if (mode === 'verify') {
    const stored = existsSync(AUDIT_FILE) ? readJ(AUDIT_FILE) : null, drift = stored?.schema === SCHEMA ? deepDiff(stored.core, core) : ['$: audit record missing or wrong schema'], pass = drift.length === 0 && Object.values(ok).every(Boolean);
    console.log(J({ mode, wroteAnything: false, gitState, auditedAt: stored ? { head: stored.gitState.head, state: stored.gitState.state } : null, conditions: ok, drift, result: pass ? 'SK2F_IMPORT_CUT_AUDIT_VERIFY_PASS' : 'SK2F_IMPORT_CUT_AUDIT_VERIFY_FAILED' }, null, 1)); if (!pass) process.exitCode = 1;
  } else {
    const compat = mode === 'write' ? compatibility() : null, c5 = compat ? condition5(compat) : null, rec = recommend(ok, c5 ? c5.pass : true);
    console.log(J({ mode, gitState, conditions: { ...ok, c5: c5 ? c5.pass : 'NOT_RUN_IN_PRINT_MODE' }, compatibility: compat, recommendation: c5 ? rec.recommendation : `${rec.recommendation} (condition 5 not run in print mode)`, closure: { old: core.condition4_staticReachability.oldRevision.files, cut: core.condition4_staticReachability.cutRevision.files }, projectionsCompared: core.condition2_semanticsUnchanged.measuredNow.projectionsCompared, pins: core.condition6_historicalRecord.files }, null, 1));
    if (mode === 'write') { const out = { schema: SCHEMA, authority: 'R0', stage: 'STAGE3H-SK2-F Gate 5', generatedAt: new Date().toISOString(), node: process.version, gitState, disclosure: 'Identities only: paths, line text of the five changed source lines (public, tracked code), sha256 values and counts. No seed, world hash or evaluator truth. `core` is recomputable before and after the cut is committed and is what `verify` compares.',
        nothingWasCommittedByThisAudit: true, condition5_compatibilityRuns: c5, ...rec, auditorSha256: fileSha(fileURLToPath(import.meta.url)), coreSha256: sha(stable(core)), core };
      const fd = openSync(AUDIT_FILE, 'wx'); writeSync(fd, JSON.stringify(out, null, 1) + '\n'); closeSync(fd); console.log(`written ${posix(relative(REPO, AUDIT_FILE))}`); }
  }
}
