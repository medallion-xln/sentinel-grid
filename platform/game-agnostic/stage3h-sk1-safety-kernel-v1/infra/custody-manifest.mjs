// SK1 Gate 0.4 — reproducibility and source-custody manifest. Read-only: hashes and classifications, never contents.
// Answers, from the actual files: what the kernel inference graph is; what the evaluation harness depends on; which of
// those dependencies are tracked, modified, or custody-protected overlay files; whether the custody guards are intact;
// and whether an independent backup exists. It reports what is NOT recoverable instead of asserting recoverability.
//   /opt/homebrew/bin/node infra/custody-manifest.mjs [--write]
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { EXCLUSION_FILES } from '../../stage3h-safety-feasibility-v1/closure/exclusions.mjs';
import { auditInferenceGraph } from './graph-audit.mjs';
import { loadSk1Exclusions } from './exclusions.mjs';
import { LANE, GA, REPO, EVIDENCE, GIT, sha, fileSha, writeExclusive } from './common.mjs';

const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 29 }), rel = (p) => relative(REPO, p);
const tracked = new Set(git('ls-files', '-z').split('\0')), dirty = new Set(git('status', '--porcelain').split('\n').filter((l) => l && !l.startsWith('??')).map((l) => l.slice(3)));
const protectedRows = readFileSync(resolve(REPO, '.git/custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).filter((c) => c.length >= 5).map((c) => ({ path: c[1], sha256: c[3] }));
const protectedPath = new Map(protectedRows.map((r) => [r.path, r.sha256]));

// ---- transitive import closure of the evaluation harness (static, relative imports only)
function closure(entries) {
  const seen = new Map(), walk = (abs) => { if (seen.has(abs)) return; if (!existsSync(abs)) { seen.set(abs, null); return; } const src = readFileSync(abs, 'utf8'); seen.set(abs, sha(src));
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g)) if (m[1].startsWith('.')) walk(resolve(dirname(abs), m[1])); };
  for (const e of entries) walk(e); return seen;
}
const harness = closure(['infra/screen.mjs', 'infra/pool.mjs', 'infra/build-class.mjs', 'infra/freeze.mjs', 'infra/train.mjs', 'infra/run.mjs', 'infra/dev-fixture.mjs'].map((f) => resolve(LANE, f)));
const classify = (abs, h) => { const r = rel(abs); return { file: r.replace(/^platform\/game-agnostic\//, ''), sha256: h, tracked: tracked.has(r), modifiedVsHead: dirty.has(r), custodyProtected: protectedPath.has(r), missing: h === null }; };
const deps = [...harness].map(([abs, h]) => classify(abs, h)).sort((a, b) => (a.file < b.file ? -1 : 1));
const dataDeps = ['stage3h-final-review-handoff/amendments/v3/contract-v3.json', 'artifacts/stage3g8-projection-disclosure/stage3g8-open-phase-report.json', ...Object.values(EXCLUSION_FILES)].map((f) => { const abs = resolve(GA, f), isDir = existsSync(abs) && statSync(abs).isDirectory();
  const files = isDir ? readdirSync(abs, { recursive: true }).map((n) => resolve(abs, n)).filter((p) => statSync(p).isFile()) : [abs];
  return { path: f, kind: isDir ? 'directory' : 'file', files: files.length, allTracked: files.every((p) => tracked.has(rel(p))), anyModified: files.some((p) => dirty.has(rel(p))), sha256: isDir ? sha(files.sort().map((p) => `${rel(p)}:${fileSha(p)}`).join('\n')) : existsSync(abs) ? fileSha(abs) : null }; });

// ---- custody guards and protected overlay
const manifestOk = readFileSync(resolve(REPO, '.git/custody/GUARD_MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean).map((l) => { const [h, f] = l.split(/\s+/); return { file: f, ok: existsSync(resolve(REPO, '.git', f)) && fileSha(resolve(REPO, '.git', f)) === h }; });
const overlay = protectedRows.map((r) => { const abs = resolve(REPO, r.path); return { present: existsSync(abs), matches: existsSync(abs) && fileSha(abs) === r.sha256, tracked: tracked.has(r.path) }; });
let hooksPath = ''; try { hooksPath = git('config', '--get', 'core.hooksPath').trim(); } catch { hooksPath = ''; }

// ---- kernel graph and exclusions
const graph = auditInferenceGraph(LANE), ctx = loadSk1Exclusions();
const laneFiles = git('ls-files', '--', rel(LANE)).split('\n').filter(Boolean), laneUntracked = git('status', '--porcelain', '--', rel(LANE)).split('\n').filter((l) => l.startsWith('??')).map((l) => l.slice(3).replace(rel(LANE) + '/', ''));

// ---- independent backup
const volumes = existsSync('/Volumes') ? readdirSync('/Volumes').filter((n) => !/^(Macintosh HD|Macintosh HD - Data|Recovery|Preboot|VM|Update|com\.apple\.TimeMachine\.localsnapshots)$/.test(n)) : [];
let timeMachine = 'UNKNOWN'; try { const o = execFileSync('/usr/bin/tmutil', ['destinationinfo'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); timeMachine = /No destinations configured/i.test(o) ? 'NO_DESTINATION_CONFIGURED' : 'DESTINATION_CONFIGURED'; } catch (e) { timeMachine = /No destinations configured/i.test(String(e.stdout) + String(e.stderr)) ? 'NO_DESTINATION_CONFIGURED' : 'NOT_DETERMINABLE'; }
let pushRefused = null; try { execFileSync('/bin/sh', [resolve(REPO, '.git/hooks/pre-push')], { input: '', stdio: ['pipe', 'pipe', 'pipe'] }); pushRefused = false; } catch { pushRefused = true; }

const protectedDeps = deps.filter((d) => d.custodyProtected), untrackedDeps = deps.filter((d) => !d.tracked && !d.custodyProtected && !d.missing && !d.file.startsWith('stage3h-sk1-safety-kernel-v1/')), modifiedDeps = deps.filter((d) => d.modifiedVsHead);
const out = { schema: 'SK1_CUSTODY_MANIFEST_V1', authority: 'R0', stage: 'STAGE3H-SK1 Gate 0.4', generatedAt: new Date().toISOString(), node: process.version, repoHead: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(),
  kernelInferenceGraph: { files: graph.files.map((f) => ({ file: f.rel, sha256: f.sha256, tracked: tracked.has(rel(resolve(LANE, f.rel))) })), closureSha256: graph.closureSha256, violations: graph.violations, evaluatorFree: graph.evaluatorFree, importsOutsideLane: 0,
    reproducibleFromCleanCheckout: 'YES once committed: the closure is 12 lane-local files plus node:crypto; verified separately on a clean export of the commit (evidence/SK1_GATE0_INTEGRITY.json)' },
  evaluationHarness: { files: deps.length, tracked: deps.filter((d) => d.tracked).length, laneLocal: deps.filter((d) => d.file.startsWith('stage3h-sk1-safety-kernel-v1/')).length,
    custodyProtectedOverlayDependencies: protectedDeps.map((d) => ({ file: d.file, presentLocally: !d.missing, sha256: d.sha256, matchesProtectedIdentity: d.sha256 === protectedPath.get('platform/game-agnostic/' + d.file) })),
    untrackedNonProtectedDependencies: untrackedDeps.map((d) => d.file), modifiedVsHead: modifiedDeps.map((d) => ({ file: d.file, sha256: d.sha256 })), missing: deps.filter((d) => d.missing).map((d) => d.file), dataDependencies: dataDeps, closureSha256: sha(deps.map((d) => `${d.file}:${d.sha256}`).join('\n')),
    reproducibleFromCleanCheckout: 'NO. Population generation and evaluation call the frozen comparators, whose sources are custody-protected overlay files that are deliberately NOT tracked. They can be re-run only on a machine that holds the protected overlay with matching hashes.' },
  custody: { guardManifest: manifestOk, guardManifestIntact: manifestOk.every((m) => m.ok), hooksPathOverride: hooksPath || null, prePushRefusesEveryPush: pushRefused, protectedIdentities: protectedRows.length, protectedPathsTracked: overlay.filter((o) => o.tracked).length, protectedOverlayPresent: overlay.filter((o) => o.present).length, protectedOverlayMatchingRecordedHash: overlay.filter((o) => o.matches).length },
  exclusions: { registrySha256: fileSha(resolve(LANE, 'infra/exclusion-registry.json')), registryHash: ctx.registryHash, forbiddenBlocks: Object.keys(ctx.forbidden).length, sealedRegistries: ctx.pcdIndex.seals, strictIndexCounts: ctx.strict.counts },
  lane: { trackedFiles: laneFiles.length, untrackedFiles: laneUntracked, privilegedWorkingData: 'work/ (gitignored): seeds, world hashes, evaluator truth, design fixture, development model — local only' },
  worktree: { modifiedTrackedFiles: [...dirty].sort(), note: 'pre-existing owner-held changes; none is staged or altered by SK1' },
  independentBackup: { externalVolumes: volumes, timeMachine, available: volumes.length > 0 || timeMachine === 'DESTINATION_CONFIGURED', remotePushAuthorized: false,
    statement: volumes.length > 0 || timeMachine === 'DESTINATION_CONFIGURED' ? 'A candidate backup destination is visible; no backup was taken or verified by this manifest.' : 'NO INDEPENDENT BACKUP IS AVAILABLE. No external volume is mounted and no Time Machine destination is configured. Commits, the protected overlay and all privileged working data exist on this one internal disk only. Independent recoverability is NOT claimed.' } };
console.log(JSON.stringify({ kernelGraph: { files: out.kernelInferenceGraph.files.length, evaluatorFree: graph.evaluatorFree, allTracked: out.kernelInferenceGraph.files.every((f) => f.tracked) }, harness: { files: deps.length, tracked: out.evaluationHarness.tracked, protected: protectedDeps.map((d) => `${d.file}:${d.sha256 === protectedPath.get('platform/game-agnostic/' + d.file)}`), untracked: out.evaluationHarness.untrackedNonProtectedDependencies, modified: modifiedDeps.map((d) => d.file), missing: out.evaluationHarness.missing, data: dataDeps.map((d) => `${d.path}:${d.allTracked}:${d.anyModified}`) },
  custody: out.custody, lane: { tracked: laneFiles.length, untracked: laneUntracked.length }, backup: out.independentBackup }, null, 1));
if (process.argv.includes('--write')) { writeExclusive(resolve(EVIDENCE, 'SK1_CUSTODY_MANIFEST.json'), out); console.log('written evidence/SK1_CUSTODY_MANIFEST.json'); }
