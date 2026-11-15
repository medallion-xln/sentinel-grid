// H-DISC-1 — static source and inference audit of the discriminator's inference closure (Phase 5).
//   node audit/inference-graph-audit.mjs                 audit the working tree and print
//   node audit/inference-graph-audit.mjs committed       additionally require every closure file to equal its committed
//                                                        blob at HEAD, and repeat the audit and a live call in a clean
//                                                        `git archive HEAD` export that contains nothing but the closure
//   node audit/inference-graph-audit.mjs committed --write   create evidence/HDISC1_INFERENCE_AUDIT.json (exclusive)
//   node audit/inference-graph-audit.mjs verify          recompute and compare the stored record's core; writes nothing
// A working-tree pass is NOT a committed-source pass, and the record keeps the two apart.
//
// What "evaluator-free" means here, checked statically on the exact files reachable from the entry point:
//   closure      the real import closure equals the declared list in api/host.mjs, in both directions
//   imports      relative files and node:crypto only; node:fs / node:path / node:url in the host file only; nothing else
//   reach        no evaluation, training, population, native-simulation, test, witness or custody-protected module
//   capability   no network, process or environment access, no dynamic code, no clock or randomness, no file writes,
//                no native-world execution primitive
//   reads        no property read of evaluator truth, hidden state, seeds, world hashes or arbitrary identifiers
// Evaluation-side tooling: never imported by the inference closure it audits.
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..'), GIT = '/usr/bin/git';
export const OUT_FILE = resolve(LANE, 'evidence/HDISC1_INFERENCE_AUDIT.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const HOST_FILE = 'stage3h-hdisc1-discriminator-v1/api/host.mjs', FIXTURE = 'stage3h-sk1-safety-kernel-v1/demo/fixtures/forge-request-recommend.json';
const ANYWHERE = new Set(['node:crypto']), HOST_ONLY = new Set(['node:fs', 'node:path', 'node:url']);
// modules an inference closure may never reach
const FORBIDDEN_REACH = [/\/infra\//, /\/work\//, /\/tests?\//, /\/analysis\//, /\/witness\//, /\/audit\//, /\/demo\//, /\/protocol\//, /\/readiness\//, /\/inheritance\//, /\/successor\//, /\/models\//, /\/evidence\//, /\/scripts\//, /\/src\//,
  /hw1-eval/, /evaluat/i, /dataset/, /\btrain/, /gbdt/, /population/, /allocator/, /counterfactual/, /stage3h-canonical-v1/, /ascii-suite/, /stage3h-hw1-dev-v1/, /stage3h-hw4/, /stage3h-failure-diagnosis/, /stage3h-safety-feasibility/, /stage3h-owner-governed/, /stage3h-wider-action/];
const TOKEN_RULES = [
  ['NETWORK_ACCESS', /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|node:(http|https|http2|net|dgram|tls|dns)\b|\bnavigator\./],
  ['PROCESS_OR_ENVIRONMENT_ACCESS', /\bprocess\s*\.|\bchild_process\b|\bworker_threads\b|node:(os|vm|cluster|child_process|worker_threads)\b|\bglobalThis\b/],
  ['DYNAMIC_CODE', /\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(|\brequire\s*\(/],
  ['CLOCK_OR_RANDOMNESS', /Math\.random|Date\.now|\bnew\s+Date\b|performance\.now|randomBytes|randomUUID|getRandomValues/],
  ['FILE_WRITE', /writeFile|appendFile|\bopenSync\b|\bwriteSync\b|unlink|\brmSync\b|\bmkdir|createWriteStream|\bchmod|\brename(Sync)?\b|copyFile/],
  ['NATIVE_EXECUTION_PRIMITIVE', /\b(createWorld|cloneWorld|stepWorld|applyAction|dispatchAction|mutateWorld|runCalibratedWarmup|evaluateCounterfactuals\w*|generateScenario\w*)\b/],
  ['PRIVILEGED_PROPERTY_READ', /\.(truth|truths|utility|utilities|seed|seeds|worldHash|sourceStateHash|hiddenHealth|hiddenValue|hiddenState|members|counterfactual|counterfactuals|rollout|rollouts|oracle|nreg|regret|catAny|introB|introN|introducesVsS0|introducesVsNexus)\b|\[\s*['"](truth|seed|worldHash|hiddenHealth|hiddenValue|members)['"]\s*\]/],
  ['ARBITRARY_IDENTIFIER_READ', /\.(handle|handles|menuIndex|menuPosition|ordinal|entityId|actionId)\b/],
];
/** Remove comments so that prose cannot trip or hide a token rule. Strings are kept. */
export function stripComments(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) { const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; out += c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i]; i++; } out += src[i]; i++; } out += q; i++; continue; }
    out += c; i++; }
  return out;
}
export const importsOf = (src) => [...src.matchAll(/(?:^|[\n;])\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((m) => m[1]);

/**
 * root: directory that plays the role of platform/game-agnostic. entry and declared are paths relative to it.
 * protectedPaths: custody-protected paths relative to root (may be empty when no custody list is available).
 */
export function auditInferenceGraph({ root, entry, declared, protectedPaths = [] }) {
  const violations = [], add = (code, file, detail) => violations.push({ code, file, detail: detail ?? null }), seen = new Map(), prot = new Set(protectedPaths);
  const walk = (rel) => { if (seen.has(rel)) return; const abs = resolve(root, rel); if (!existsSync(abs)) { seen.set(rel, null); add('MODULE_NOT_FOUND', rel); return; }
    const raw = readFileSync(abs, 'utf8'), code = stripComments(raw); seen.set(rel, sha(raw));
    if (prot.has(rel)) add('CUSTODY_PROTECTED_MODULE_REACHED', rel); for (const re of FORBIDDEN_REACH) if (re.test('/' + rel)) { add('FORBIDDEN_MODULE_REACHED', rel, String(re)); break; }
    for (const [name, re] of TOKEN_RULES) { const m = code.match(re); if (m && !(name === 'FILE_WRITE' && false)) add(name, rel, m[0]); }
    for (const spec of importsOf(code)) {
      if (spec.startsWith('.')) { walk(relative(root, resolve(dirname(abs), spec))); continue; }
      if (ANYWHERE.has(spec)) continue; if (HOST_ONLY.has(spec)) { if (rel !== HOST_FILE) add('FILE_SYSTEM_IMPORT_OUTSIDE_THE_HOST', rel, spec); continue; }
      add('FORBIDDEN_BUILTIN_OR_PACKAGE_IMPORT', rel, spec); } };
  walk(entry);
  const reached = [...seen.keys()].sort(), dec = [...declared].sort();
  for (const f of reached) if (!dec.includes(f)) add('UNDECLARED_FILE_IN_CLOSURE', f); for (const f of dec) if (!seen.has(f)) add('DECLARED_FILE_NOT_REACHED', f);
  const files = reached.map((f) => ({ file: f, sha256: seen.get(f) }));
  return { entry, fileCount: reached.length, files, closureSha256: sha(files.map((x) => `${x.file}:${x.sha256}`).join('\n')), violations, evaluatorFree: violations.length === 0 };
}

// ---------------------------------------------------------------- repository-level checks
const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const gaRel = (f) => `platform/game-agnostic/${f}`;
function protectedPaths() {
  const tsv = resolve(REPO, '.git/custody/protected-identities.tsv'); if (!existsSync(tsv)) return { source: 'UNAVAILABLE', paths: [] };
  return { source: '.git/custody/protected-identities.tsv', paths: readFileSync(tsv, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[1]).filter(Boolean).map((p) => p.replace(/^platform\/game-agnostic\//, '')) };
}
async function declaredClosure(root) { const m = await import(pathToFileURL(resolve(root, HOST_FILE)).href + `?t=${sha(root).slice(0, 8)}`); return { declared: [...m.INFERENCE_CLOSURE], entry: m.ENTRY_POINT, identity: m.sourceIdentity(root) }; }

/** Is every closure file tracked and byte-equal to its blob at HEAD? */
function committedState(files) {
  const head = git('rev-parse', 'HEAD').trim(), rows = files.map((f) => { let blob = null; try { blob = sha(execFileSync(GIT, ['-C', REPO, 'show', `HEAD:${gaRel(f.file)}`], { maxBuffer: 1 << 28 })); } catch { /* not tracked at HEAD */ } return { file: f.file, tracked: blob !== null, equalsHead: blob === f.sha256 }; });
  return { head, allTrackedAndEqualToHead: rows.every((r) => r.equalsHead), notCommitted: rows.filter((r) => !r.equalsHead).map((r) => r.file) };
}
/** Export exactly the closure (plus one tracked public fixture) from HEAD into an empty directory; audit and call it there. */
async function cleanExportProbe(declared) {
  const dir = mkdtempSync(join(tmpdir(), 'hdisc1-clean-')), root = resolve(dir, 'platform/game-agnostic');
  try {
    const paths = [...declared, FIXTURE].map(gaRel), tar = execFileSync(GIT, ['-C', REPO, 'archive', '--format=tar', 'HEAD', '--', ...paths], { maxBuffer: 1 << 28 });
    execFileSync('/usr/bin/tar', ['-x', '-C', dir], { input: tar });
    const listed = execFileSync('/usr/bin/find', [dir, '-type', 'f'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((p) => relative(root, p)).sort();
    const dc = await declaredClosure(root), audit = auditInferenceGraph({ root, entry: dc.entry, declared: dc.declared, protectedPaths: [] });
    // a live call from the export, in a child process so that nothing from this working tree is in the module cache
    const probe = `import { createDiscriminatorApi } from ${JSON.stringify(pathToFileURL(resolve(root, dc.entry)).href)}; import { readFileSync } from 'node:fs';
      const fx = JSON.parse(readFileSync(${JSON.stringify(resolve(root, FIXTURE))}, 'utf8')), api = createDiscriminatorApi({ game: 'forge' }), r = api.compare(fx.state, fx.legalActions, fx.advisoryEvidence); let refused = null; try { api.execute(); } catch (e) { refused = e.code; }
      console.log(JSON.stringify({ status: r.status, decision: r.decision.kind, reason: r.decision.reason, menu: r.legalActionMenu.size, complete: r.legalActionMenu.complete, sourceHash: r.sourceIdentity.sourceHash, decisionDigest: r.decisionDigest, canDispatch: r.authority.canDispatch, executeRefusedWith: refused }));`;
    const pf = resolve(dir, 'probe.mjs'); writeFileSync(pf, probe); const live = JSON.parse(execFileSync(process.execPath, [pf], { encoding: 'utf8', cwd: dir }));
    return { exportedFiles: listed.length, exportedOnlyTheClosureAndOneFixture: JSON.stringify(listed) === JSON.stringify([...declared, FIXTURE].sort()), audit: { fileCount: audit.fileCount, closureSha256: audit.closureSha256, violations: audit.violations, evaluatorFree: audit.evaluatorFree }, sourceHash: dc.identity.sourceHash, liveCall: live };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function runAudit({ committed = false } = {}) {
  const prot = protectedPaths(), dc = await declaredClosure(GA), wt = auditInferenceGraph({ root: GA, entry: dc.entry, declared: dc.declared, protectedPaths: prot.paths });
  const core = { entryPoint: dc.entry, declaredClosure: dc.declared, files: wt.files, closureSha256: wt.closureSha256, H_DISC_1_SOURCE_HASH: dc.identity.sourceHash, violations: wt.violations, EVALUATOR_FREE_INFERENCE: wt.evaluatorFree,
    rules: { importsAllowedAnywhere: [...ANYWHERE], importsAllowedInHostOnly: [...HOST_ONLY], hostFile: HOST_FILE, forbiddenReachPatterns: FORBIDDEN_REACH.map(String), tokenRules: TOKEN_RULES.map(([n]) => n) }, custodyProtectedPathsChecked: prot.paths.length, custodyListSource: prot.source };
  const out = { schema: 'HDISC1_INFERENCE_AUDIT_V1', authority: 'R0', stage: 'STAGE3H-H-DISC-1', labels: ['STATIC_SOURCE_AUDIT', 'NO_TRAINING', 'NO_EVALUATION', 'NOT_A_PERFORMANCE_RESULT'], auditorSha256: sha(readFileSync(fileURLToPath(import.meta.url))), core, coreSha256: sha(JSON.stringify(core)),
    WORKING_TREE_AUDIT: wt.evaluatorFree ? 'PASS' : 'FAIL', COMMITTED_SOURCE_AUDIT: 'NOT_RUN' };
  if (committed) { const cs = committedState(wt.files); out.committedSource = cs;
    if (!cs.allTrackedAndEqualToHead) out.COMMITTED_SOURCE_AUDIT = 'FAIL_CLOSURE_NOT_COMMITTED_AT_HEAD';
    else { const probe = await cleanExportProbe(dc.declared); out.cleanExport = probe;
      const ok = probe.exportedOnlyTheClosureAndOneFixture && probe.audit.evaluatorFree && probe.audit.closureSha256 === wt.closureSha256 && probe.sourceHash === dc.identity.sourceHash && probe.liveCall.sourceHash === dc.identity.sourceHash && probe.liveCall.status === 'NOT_TRAINED' && probe.liveCall.decision === 'ABSTAIN' && probe.liveCall.complete === true && probe.liveCall.canDispatch === false && probe.liveCall.executeRefusedWith === 'EXECUTION_OR_MUTATION_REQUESTED';
      out.COMMITTED_SOURCE_AUDIT = ok && wt.evaluatorFree ? 'PASS' : 'FAIL'; } }
  return out;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), mode = args[0] ?? 'working-tree';
  if (mode === 'verify') { const stored = JSON.parse(readFileSync(OUT_FILE, 'utf8')), now = await runAudit({ committed: true }), same = now.coreSha256 === stored.coreSha256 && now.COMMITTED_SOURCE_AUDIT === 'PASS' && now.cleanExport.sourceHash === stored.cleanExport.sourceHash && now.cleanExport.liveCall.decisionDigest === stored.cleanExport.liveCall.decisionDigest;
    console.log(JSON.stringify({ mode, storedCore: stored.coreSha256, recomputedCore: now.coreSha256, committedSourceAudit: now.COMMITTED_SOURCE_AUDIT, recordedAtHead: stored.committedSource?.head, currentHead: now.committedSource.head }, null, 1)); console.log(same ? 'HDISC1_INFERENCE_AUDIT_VERIFY_PASS' : 'HDISC1_INFERENCE_AUDIT_VERIFY_FAILED'); if (!same) process.exitCode = 1; }
  else { const out = await runAudit({ committed: mode === 'committed' });
    console.log(JSON.stringify({ mode, files: out.core.files.length, sourceHash: out.core.H_DISC_1_SOURCE_HASH, violations: out.core.violations, WORKING_TREE_AUDIT: out.WORKING_TREE_AUDIT, COMMITTED_SOURCE_AUDIT: out.COMMITTED_SOURCE_AUDIT, notCommitted: out.committedSource?.notCommitted, cleanExport: out.cleanExport && { files: out.cleanExport.exportedFiles, evaluatorFree: out.cleanExport.audit.evaluatorFree, liveCall: out.cleanExport.liveCall } }, null, 1));
    if (args.includes('--write')) { if (out.COMMITTED_SOURCE_AUDIT !== 'PASS') { console.log('REFUSING_TO_WRITE: the committed-source audit has not passed'); process.exitCode = 1; } else { mkdirSync(dirname(OUT_FILE), { recursive: true }); const fd = openSync(OUT_FILE, 'wx'); writeSync(fd, JSON.stringify(out, null, 1) + '\n'); closeSync(fd); console.log('written evidence/HDISC1_INFERENCE_AUDIT.json'); } }
    if (out.WORKING_TREE_AUDIT !== 'PASS') process.exitCode = 1; }
}
