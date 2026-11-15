// SK1.1 Phase 1 — clean-checkout probe. Measures, instead of asserting, what committed source can reproduce.
//   /opt/homebrew/bin/node repro/clean-checkout-probe.mjs [--out <file outside the repo>]
// Method (everything happens in a temporary directory that is removed afterwards; the repository is only read):
//   STAGE A  a HEAD-only export (`git archive HEAD`). No working-tree edit, no gitignored data, no custody-protected
//            file. The export is sparse and converges: whenever a command touches a path that IS tracked at HEAD, that
//            path is added from HEAD and the command re-run, so the export behaves like a full clean checkout without
//            unpacking the whole 9 GiB tree. A path that is NOT tracked at HEAD is never added: it is a blocker.
//            In it: inference-graph audit, the complete SK1 test suite, both demonstrations, an import attempt of every
//            evaluation entry point, and `run.mjs check`.
//   STAGE C  the same export PLUS three explicitly declared supplements — the custody-protected overlay files in the
//            evaluation closure (hash-verified first), tracked files whose working copy differs from HEAD, and the
//            minimum of the gitignored local data that check mode asks for (copied into the temporary directory and
//            discovered the same converging way). Then `run.mjs check`: a read-only recomputation compared with the
//            committed result. It is NOT a new evaluation and it writes nothing outside the temporary directory.
//   ABLATIONS  each supplement is withdrawn in turn; the first failure is recorded. Sufficiency + necessity.
// NOT probed, by design: population generation and training (screen / pool / build-class / train). They would generate
// worlds and evaluator labels. Their dependencies are reported statically by the inventory only.
import { mkdtempSync, rmSync, mkdirSync, cpSync, copyFileSync, readFileSync, readdirSync, existsSync, statSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GIT, REPO, SK1_LANE, SK1_REL, sha, fileSha, posix, traceClosure, gitFacts, protectedIdentities, classify, CLASS } from './lib.mjs';

const NODE = process.execPath, HERE = dirname(fileURLToPath(import.meta.url)), PRELOAD = resolve(HERE, 'read-trace-preload.mjs'), GA_REL = 'platform/game-agnostic';
const BASE_PATHS = [SK1_REL, `${GA_REL}/package.json`, `${GA_REL}/src/core`, `${GA_REL}/src/sdk`, `${GA_REL}/src/adapters/reference-rescue`];
const MAX_ADD_BYTES = 400 * 1024 * 1024, MAX_ROUNDS = 24;
const lsMjs = (d) => readdirSync(resolve(SK1_LANE, d)).filter((n) => n.endsWith('.mjs')).sort().map((n) => `${d}/${n}`);
export const EVALUATION_ENTRIES = () => [...lsMjs('infra'), ...lsMjs('analysis'), ...lsMjs('successor').filter((n) => !n.endsWith('.test.mjs'))];
export const INFERENCE_ENTRIES = ['api/recommend.mjs', 'demo/demo.mjs'];
export const TEST_FILES = () => [...lsMjs('tests').filter((n) => n.endsWith('.test.mjs')), ...lsMjs('successor').filter((n) => n.endsWith('.test.mjs'))];
const GUARD = /process\.argv\[1\] && resolve\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)/;

export function runProbe({ log = () => {} } = {}) {
  const facts = gitFacts(), prot = protectedIdentities() ?? [], protectedMap = new Map(prot.map((r) => [r.path, r.sha256]));
  const sizes = new Map(facts.git('ls-tree', '-r', '-l', 'HEAD').split('\n').filter(Boolean).map((l) => { const [meta, path] = l.split('\t'); return [path, Number(meta.trim().split(/\s+/)[3])]; }));
  const trackedDirs = new Set(); for (const p of sizes.keys()) { let d = dirname(p); while (d !== '.' && !trackedDirs.has(d)) { trackedDirs.add(d); d = dirname(d); } }
  const bytesUnder = (rel) => (sizes.has(rel) ? sizes.get(rel) : [...sizes].reduce((s, [p, n]) => s + (p.startsWith(rel + '/') ? n : 0), 0));
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sk11-probe-'))), scrub = (s) => String(s).split(tmp).join('<tmp>').split(REPO).join('<repo>');
  const cls = (rel, cur) => classify(rel, cur, { ...facts, protectedMap });
  try {
    // ---- static closure in the working tree: which files exist only outside HEAD
    const closure = traceClosure([...EVALUATION_ENTRIES(), ...INFERENCE_ENTRIES, ...TEST_FILES()].map((f) => resolve(SK1_LANE, f)));
    const rows = [...closure].map(([abs, n]) => { const rel = posix(relative(REPO, abs)); return { rel, sha256: n.sha256, ...cls(rel, n.sha256) }; });
    const trackedClosure = rows.filter((r) => r.class === CLASS.EQ || r.class === CLASS.MOD).map((r) => r.rel), protectedDeps = rows.filter((r) => r.class === CLASS.PROT), modifiedDeps = rows.filter((r) => r.class === CLASS.MOD);

    const makeExport = (name) => { const root = resolve(tmp, name); mkdirSync(root); return { root, lane: resolve(root, SK1_REL), have: new Set(), skipped: [] }; };
    const covered = (x, rel) => { for (let p = rel; p !== '.'; p = dirname(p)) if (x.have.has(p)) return true; return false; };
    const add = (x, rels) => { const want = [...new Set(rels)].filter((r) => (sizes.has(r) || trackedDirs.has(r)) && !covered(x, r)), ok = [];
      for (const r of want) { if (bytesUnder(r) > MAX_ADD_BYTES) { if (!x.skipped.includes(r)) x.skipped.push(r); } else ok.push(r); }
      for (let i = 0; i < ok.length; i += 200) execFileSync('/bin/sh', ['-c', 'g=$0; r=$1; d=$2; shift 2; "$g" -C "$r" archive --format=tar HEAD -- "$@" | /usr/bin/tar -x -C "$d"', GIT, REPO, x.root, ...ok.slice(i, i + 200)], { stdio: ['ignore', 'ignore', 'pipe'] });
      ok.forEach((r) => x.have.add(r)); return ok; };

    let traceN = 0;
    const run = (x, args, { cwd = x.lane, env = {}, work = null } = {}) => { const td = resolve(tmp, `trace-${traceN++}`); mkdirSync(td);
      const e = { ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(PRELOAD).href}`, SK11_READ_TRACE_DIR: td, ...env }; delete e.SK1_WORK; if (work) e.SK1_WORK = work;
      const r = spawnSync(NODE, args, { cwd, env: e, encoding: 'utf8', maxBuffer: 1 << 28 }), hit = new Set(), miss = new Set();
      for (const f of readdirSync(td)) { const t = JSON.parse(readFileSync(resolve(td, f), 'utf8')); t.hit.forEach((p) => hit.add(p)); t.miss.forEach((p) => miss.add(p)); }
      rmSync(td, { recursive: true, force: true });
      const text = `${r.stdout}\n${r.stderr}`; for (const m of text.matchAll(/(?:Cannot find module|ENOENT[^\n]*?)\s'([^'\n]+)'/g)) miss.add(m[1].replace(/^file:\/\//, ''));
      return { status: r.status, stdout: r.stdout, stderr: r.stderr, hit, miss }; };
    /** Re-run until the export holds every HEAD-tracked path the command touched, and (stage C) every local data path it asked for. */
    const converge = (x, args, opts = {}) => { let r, rounds = 0; const added = [], copied = [];
      for (;;) { r = run(x, args, opts); rounds++; if (rounds >= MAX_ROUNDS) break;
        const inExport = [...r.miss].filter((p) => p.startsWith(x.root + '/')).map((p) => posix(relative(x.root, p))), got = add(x, inExport); added.push(...got);
        let gotWork = 0; if (opts.work && opts.workSource) for (const p of r.miss) if (p.startsWith(opts.work + '/')) { const asked = relative(opts.work, p), rel = dirname(asked) === '.' || (existsSync(resolve(opts.workSource, asked)) && statSync(resolve(opts.workSource, asked)).isDirectory()) ? asked : dirname(asked), src = resolve(opts.workSource, rel), dst = resolve(opts.work, rel);
          if (existsSync(src) && !existsSync(dst)) { mkdirSync(dirname(dst), { recursive: true }); cpSync(src, dst, { recursive: true }); copied.push(posix(rel)); gotWork++; } }
        if (!got.length && !gotWork) break; }
      const untracked = [...r.miss].filter((p) => p.startsWith(x.root + '/')).map((p) => posix(relative(x.root, p))).filter((rel) => !sizes.has(rel) && !trackedDirs.has(rel) && existsSync(resolve(REPO, rel)));
      const outside = [...r.hit].filter((p) => p.startsWith(REPO + '/')).map((p) => posix(relative(REPO, p)));
      return { ...r, rounds, addedFromHead: added, copiedLocalData: copied, untrackedPathsRequested: [...new Set(untracked)].sort(), readsOfTheRealRepository: outside }; };
    const firstError = (r) => { const t = `${r.stderr}\n${r.stdout}`, m = t.match(/Cannot find module '[^']+' imported from [^\n]+/) ?? t.match(/(?:^|\n)\s*(?:\w*Error(?: \[[A-Z_]+\])?: [^\n]+)/); return m ? scrub(m[0].trim()).slice(0, 400) : r.status === 0 ? null : scrub(t.trim().split('\n').slice(-3).join(' | ')).slice(0, 400); };
    const counts = (out) => { const n = (k) => Number((out.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) ?? [])[1] ?? -1); return { tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped') }; };

    // =========================================================== STAGE A — HEAD only
    log('stage A: HEAD-only export');
    const A = makeExport('A'); add(A, [...BASE_PATHS, ...trackedClosure]);
    const laneFiles = facts.git('ls-files', '--', SK1_REL).split('\n').filter(Boolean), laneDiffers = laneFiles.filter((f) => !existsSync(resolve(REPO, f)) || fileSha(resolve(REPO, f)) !== fileSha(resolve(A.root, f)));
    const graphRun = run(A, ['infra/graph-audit.mjs', '--root', A.lane]), graph = JSON.parse(graphRun.stdout);
    const tests = TEST_FILES().map((f) => { const r = converge(A, ['--test', f]); return { file: f, ...counts(r.stdout), exit: r.status, firstError: r.status === 0 ? null : firstError(r), addedFromHead: r.addedFromHead.length, untrackedPathsRequested: r.untrackedPathsRequested, readsOfTheRealRepository: r.readsOfTheRealRepository.length }; });
    const demoRecord = JSON.parse(readFileSync(resolve(A.lane, 'evidence/SK1_DEMO_RECORD.json'), 'utf8')).decisions;
    const demo = ['recommend', 'abstain'].map((w) => { const r = converge(A, ['demo/demo.mjs', w, '--json']); let o = null; try { o = JSON.parse(r.stdout); } catch { /* reported below */ } const want = demoRecord.find((d) => d.fixture === w);
      return { fixture: w, exit: r.status, decisionHash: o?.decisionHash ?? null, replayReproduced: o?.replayReproduced ?? null, executionRequest: o?.executionRequest ?? null, qualification: o?.qualification ?? null, equalsCommittedDemoRecord: Boolean(o && want && ['decisionHash', 'kind', 'modelHash', 'kernelSourceHash', 'adapterSourceHash', 'qualification'].every((k) => o[k] === want[k])), readsOfTheRealRepository: r.readsOfTheRealRepository.length }; });
    log('stage A: import attempts');
    const imports = EVALUATION_ENTRIES().map((f) => { const guarded = GUARD.test(readFileSync(resolve(SK1_LANE, f), 'utf8'));
      let stat; for (;;) { stat = [...traceClosure([resolve(A.lane, f)])].filter(([, n]) => n.sha256 === null).map(([abs]) => posix(relative(A.root, abs))); if (!add(A, stat).length) break; }
      const staticMissing = stat.map((rel) => ({ file: rel.replace(`${GA_REL}/`, ''), class: sizes.has(rel) ? 'TRACKED_NOT_YET_EXPORTED' : protectedMap.has(rel) ? CLASS.PROT : existsSync(resolve(REPO, rel)) ? CLASS.OTHER : CLASS.MISSING }));
      // A real import is attempted only where it cannot execute a script body: a file with a main guard, or a graph that
      // cannot link (ESM evaluates nothing when a static dependency is unresolved).
      if (!guarded && !stat.some((rel) => !sizes.has(rel))) return { entry: f, mainGuard: false, staticUnresolved: [], node: 'LINKS_STATICALLY_NOT_EXECUTED', firstError: null };
      const r = converge(A, ['--input-type=module', '-e', 'await import(process.argv[1])', pathToFileURL(resolve(A.lane, f)).href]);
      return { entry: f, mainGuard: guarded, staticUnresolved: staticMissing, node: r.status === 0 ? 'IMPORTS' : /ERR_MODULE_NOT_FOUND|Cannot find module/.test(r.stderr) ? 'LINK_FAILED_MODULE_NOT_FOUND' : 'FAILED_OTHER', firstError: firstError(r) }; });
    const checkA = converge(A, ['infra/run.mjs', 'check']);
    const stageA = { what: 'git archive HEAD only: no working-tree edit, no gitignored data, no custody-protected file', exportedTrackedPaths: A.have.size, exportedFiles: readdirSync(A.root, { recursive: true }).filter((n) => statSync(resolve(A.root, n)).isFile()).length, skippedOversizeTrackedPaths: A.skipped,
      laneTrackedFiles: laneFiles.length, laneWorkingTreeFilesDifferingFromHead: laneDiffers.map((f) => f.replace(SK1_REL + '/', '')),
      inferenceGraph: { fileCount: graph.fileCount, files: graph.files, closureSha256: graph.closureSha256, violations: graph.violations, evaluatorFree: graph.evaluatorFree },
      tests: { files: tests, totals: tests.reduce((a, t) => ({ tests: a.tests + t.tests, pass: a.pass + t.pass, fail: a.fail + t.fail, skipped: a.skipped + t.skipped }), { tests: 0, pass: 0, fail: 0, skipped: 0 }) }, demo,
      evaluationEntryPoints: imports, checkMode: { exit: checkA.status, firstError: firstError(checkA), untrackedPathsRequested: checkA.untrackedPathsRequested } };

    // =========================================================== STAGE C — HEAD + declared supplements
    log('stage C: supplemented export, check mode');
    const C = makeExport('C'); add(C, [...A.have]);
    const overlay = protectedDeps.map((d) => ({ rel: d.rel, ok: d.matchesProtectedIdentity === true })), overlayOk = overlay.every((o) => o.ok);
    const putOverlay = () => { for (const o of overlay) { const dst = resolve(C.root, o.rel); mkdirSync(dirname(dst), { recursive: true }); copyFileSync(resolve(REPO, o.rel), dst); } };
    const putModified = () => { for (const m of modifiedDeps) copyFileSync(resolve(REPO, m.rel), resolve(C.root, m.rel)); };
    const putHead = (rel) => writeFileSync(resolve(C.root, rel), execFileSync(GIT, ['-C', REPO, 'show', `HEAD:${rel}`], { maxBuffer: 1 << 28 }));
    const work = resolve(tmp, 'work'); mkdirSync(work);
    let stageC, ablations = [];
    if (!overlayOk) stageC = { blocked: 'PROTECTED_OVERLAY_DOES_NOT_MATCH_RECORDED_IDENTITY', files: overlay.filter((o) => !o.ok).map((o) => o.rel) };
    else {
      putOverlay(); putModified();
      const r = converge(C, ['infra/run.mjs', 'check'], { work, workSource: resolve(SK1_LANE, 'work') });
      let summary = null; try { summary = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)); } catch { /* reported as not passed */ }
      const localFiles = existsSync(work) ? readdirSync(work, { recursive: true }).filter((n) => statSync(resolve(work, n)).isFile()).map((n) => posix(n)).sort() : [];
      const readFiles = [...r.hit].filter((p) => p.startsWith(C.root + '/') && existsSync(p) && statSync(p).isFile()).map((p) => posix(relative(C.root, p))).sort();
      const role = (rel) => (protectedMap.has(rel) ? 'SUPPLEMENT_PROTECTED_OVERLAY' : modifiedDeps.some((m) => m.rel === rel) ? 'SUPPLEMENT_UNCOMMITTED_MODIFICATION' : sizes.has(rel) ? 'TRACKED_AT_HEAD' : 'OTHER');
      stageC = { what: 'HEAD export + protected overlay (hash-verified) + uncommitted tracked modifications + minimal gitignored local data; `infra/run.mjs check` only',
        supplements: { protectedOverlayFiles: overlay.map((o) => o.rel.replace(`${GA_REL}/`, '')).sort(), uncommittedTrackedModifications: modifiedDeps.map((m) => ({ file: m.rel.replace(`${GA_REL}/`, ''), workingSha256: m.sha256, headSha256: m.headSha256 })),
          localDataCopied: { requestedPaths: r.copiedLocalData.sort(), files: localFiles.length, bytes: localFiles.reduce((s, n) => s + statSync(resolve(work, n)).size, 0), fileList: localFiles.map((n) => `work/${n}`) } },
        check: { exit: r.status, pass: r.status === 0 && /SK1_CHECK_PASS/.test(r.stdout), rounds: r.rounds, wroteAnything: summary?.wroteAnything ?? null, filesAndLocksUnchanged: summary?.filesAndLocksUnchanged ?? null, reproducedKeys: summary?.reproducedKeys ?? null, of: summary?.of ?? null, differing: summary?.differing ?? null,
          storedDecisionDigest: summary?.storedDecisionDigest ?? null, recomputedDecisionDigest: summary?.recomputedDecisionDigest ?? null, firstError: firstError(r) },
        addedFromHeadDuringCheck: r.addedFromHead.sort(), untrackedPathsRequestedBeyondDeclaredSupplements: r.untrackedPathsRequested.filter((rel) => !protectedMap.has(rel)), readsOfTheRealRepository: r.readsOfTheRealRepository,
        measuredFilesReadThroughFs: readFiles.map((rel) => ({ file: rel.replace(`${GA_REL}/`, ''), role: role(rel), sha256: fileSha(resolve(C.root, rel)), size: statSync(resolve(C.root, rel)).size })),
        note: 'measuredFilesReadThroughFs lists files opened through node:fs (data, and source files that are hashed). Modules loaded by `import` are covered by the static closure in the inventory.' };
      // ---- ablations: withdraw one supplement at a time
      log('ablations');
      const noWork = run(C, ['infra/run.mjs', 'check'], { work: resolve(tmp, 'empty-work') });
      ablations.push({ withdrawn: 'GITIGNORED_LOCAL_DATA', checkExit: noWork.status, firstError: firstError(noWork) });
      for (const m of modifiedDeps) putHead(m.rel);
      const noCut = run(C, ['infra/run.mjs', 'check'], { work }); ablations.push({ withdrawn: 'UNCOMMITTED_TRACKED_MODIFICATIONS (HEAD content restored)', checkExit: noCut.status, firstError: firstError(noCut) });
      putModified(); for (const o of overlay) rmSync(resolve(C.root, o.rel), { force: true });
      const noOverlay = run(C, ['infra/run.mjs', 'check'], { work }); ablations.push({ withdrawn: 'CUSTODY_PROTECTED_OVERLAY', checkExit: noOverlay.status, firstError: firstError(noOverlay) });
    }
    return { schema: 'SK1_1_CLEAN_CHECKOUT_PROBE_V1', authority: 'R0', stage: 'STAGE3H-SK1.1 Phase 1', probedAt: new Date().toISOString(), node: process.version, head: facts.head, exportMethod: 'git archive HEAD (sparse, converging on every HEAD-tracked path a command touches); temporary directory removed afterwards',
      newEvaluationExecuted: false, worldsGenerated: 0, wroteInsideRepository: false, stageA_headOnly: stageA, stageC_supplemented: stageC, ablations,
      notProbedByDesign: 'Population generation and training (infra/screen.mjs, pool.mjs, build-class.mjs, train.mjs, dev-fixture.mjs, dev-cv.mjs) are not executed: they generate worlds and evaluator labels. Their source dependencies are reported statically in the inventory.' };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = runProbe({ log: (m) => console.error(`[probe] ${m}`) }), i = process.argv.indexOf('--out');
  if (i > 0) { const dest = resolve(process.argv[i + 1]); if (dest.startsWith(REPO + '/')) throw Error('PROBE_OUTPUT_MUST_BE_OUTSIDE_THE_REPOSITORY'); writeFileSync(dest, JSON.stringify(out, null, 1) + '\n', { flag: 'wx' }); }
  const A = out.stageA_headOnly, Cx = out.stageC_supplemented;
  console.log(JSON.stringify({ head: out.head, stageA: { graph: [A.inferenceGraph.fileCount, A.inferenceGraph.evaluatorFree], tests: A.tests.totals, perFile: A.tests.files.map((t) => `${t.file}:${t.pass}/${t.tests} skip ${t.skipped} fail ${t.fail}`), demo: A.demo.map((d) => `${d.fixture}:${d.equalsCommittedDemoRecord}`), laneDiffers: A.laneWorkingTreeFilesDifferingFromHead,
      entryPoints: A.evaluationEntryPoints.map((e) => `${e.entry}: ${e.node}${e.firstError ? ' — ' + e.firstError : ''}`), check: A.checkMode },
    stageC: Cx.blocked ? Cx : { check: Cx.check, overlay: Cx.supplements.protectedOverlayFiles.length, modified: Cx.supplements.uncommittedTrackedModifications.map((m) => m.file), local: [Cx.supplements.localDataCopied.requestedPaths, Cx.supplements.localDataCopied.files, Cx.supplements.localDataCopied.bytes], addedFromHead: Cx.addedFromHeadDuringCheck, beyondDeclared: Cx.untrackedPathsRequestedBeyondDeclaredSupplements, realRepoReads: Cx.readsOfTheRealRepository, filesRead: Cx.measuredFilesReadThroughFs.length },
    ablations: out.ablations }, null, 1));
}
