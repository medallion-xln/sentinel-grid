// SK1 Gate 0 — integrity verification record. Combines:
//   (1) a CLEAN EXPORT of committed code (git archive of HEAD into a temporary directory: no working-tree edits, no
//       gitignored data, no custody-protected overlay) in which the inference graph is audited and the kernel, graph
//       and second-game tests are run;
//   (2) the full test suite in the working lane (which additionally has the privileged fixture and the overlay);
//   (3) the fail-closed exclusion load, the custody manifest and the allocator's refusal of every retired block.
// It states plainly what a clean checkout can and cannot reproduce.
//   /opt/homebrew/bin/node infra/gate0-verify.mjs [--write]
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadSk1Exclusions, blockFailures } from './exclusions.mjs';
import { LANE, REPO, EVIDENCE, GIT, sha, fileSha, readJ, writeExclusive } from './common.mjs';

const NODE = process.execPath, laneRel = relative(REPO, LANE), head = execFileSync(GIT, ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const EXPORT_PATHS = [laneRel, 'platform/game-agnostic/package.json', 'platform/game-agnostic/src/core', 'platform/game-agnostic/src/sdk', 'platform/game-agnostic/src/adapters/reference-rescue'];
const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sk1-clean-')));
const testCounts = (out) => { const n = (k) => Number((out.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) ?? [])[1] ?? -1); return { tests: n('tests'), pass: n('pass'), fail: n('fail'), skipped: n('skipped') }; };
let record;
try {
  const tar = execFileSync(GIT, ['-C', REPO, 'archive', '--format=tar', head, ...EXPORT_PATHS], { maxBuffer: 1 << 29 });
  execFileSync('/usr/bin/tar', ['-x', '-C', tmp], { input: tar });
  const xl = resolve(tmp, laneRel), walk = (d) => readdirSync(d).flatMap((n) => { const p = resolve(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }), files = walk(xl);
  const blobMismatch = files.filter((p) => sha(readFileSync(p)) !== sha(execFileSync(GIT, ['-C', REPO, 'show', `${head}:${relative(tmp, p)}`], { maxBuffer: 1 << 28 }))).map((p) => relative(xl, p));
  const graph = (await import(resolve(xl, 'infra/graph-audit.mjs'))).auditInferenceGraph(xl); // the EXPORTED, committed audit code
  const run = (tests) => { const r = spawnSync(NODE, ['--test', ...tests.map((t) => resolve(xl, 'tests', t))], { encoding: 'utf8', cwd: xl }); return { ...testCounts(r.stdout), exit: r.status }; };
  const clean = { kernelAndGraph: run(['kernel.test.mjs', 'graph.test.mjs']), secondGame: run(['second-game.test.mjs']), privilegedRunnerControls: run(['runner-controls.test.mjs']) };
  const working = spawnSync(NODE, ['--test', ...readdirSync(resolve(LANE, 'tests')).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => resolve(LANE, 'tests', n))], { encoding: 'utf8', cwd: LANE });
  const ctx = loadSk1Exclusions(), retired = Object.fromEntries([901, 902, 903, 904, 905, 906, 907, 908, 909, 910, 911, 912, 913, 914].map((b) => [b, blockFailures(ctx, b)[0] ?? 'NOT_REJECTED']));
  const custody = existsSync(resolve(EVIDENCE, 'SK1_CUSTODY_MANIFEST.json')) ? readJ(resolve(EVIDENCE, 'SK1_CUSTODY_MANIFEST.json')) : null;
  const laneStatus = execFileSync(GIT, ['-C', REPO, 'status', '--porcelain', '--', laneRel], { encoding: 'utf8' }).split('\n').filter((l) => l && !/evidence\/SK1_(CUSTODY_MANIFEST|GATE0_INTEGRITY)\.json|infra\/gate0-verify\.mjs/.test(l));
  const checks = {
    EXCLUSION_REGISTRY_LOADS_FAIL_CLOSED: true, EVERY_BLOCK_901_914_REJECTED: Object.values(retired).every((v) => /^FORBIDDEN_BLOCK_/.test(v)),
    CLEAN_EXPORT_EQUALS_COMMITTED_BLOBS: blobMismatch.length === 0, CLEAN_EXPORT_HAS_NO_PRIVILEGED_DATA: !existsSync(resolve(xl, 'work')) && !existsSync(resolve(tmp, 'platform/game-agnostic/stage3h-canonical-v1')),
    INFERENCE_GRAPH_EVALUATOR_FREE_IN_CLEAN_EXPORT: graph.evaluatorFree === true && graph.violations.length === 0, KERNEL_TESTS_PASS_IN_CLEAN_EXPORT: clean.kernelAndGraph.fail === 0 && clean.kernelAndGraph.pass === clean.kernelAndGraph.tests && clean.kernelAndGraph.tests > 0,
    SECOND_GAME_TESTS_PASS_IN_CLEAN_EXPORT: clean.secondGame.fail === 0 && clean.secondGame.pass === clean.secondGame.tests && clean.secondGame.tests > 0, PRIVILEGED_TESTS_SKIP_NOT_FAIL_IN_CLEAN_EXPORT: clean.privilegedRunnerControls.fail === 0 && clean.privilegedRunnerControls.skipped === clean.privilegedRunnerControls.tests,
    FULL_SUITE_PASSES_IN_WORKING_LANE: working.status === 0 && testCounts(working.stdout).fail === 0, LANE_CODE_COMMITTED_AND_UNMODIFIED: laneStatus.length === 0,
    CUSTODY_GUARDS_INTACT: custody ? custody.custody.guardManifestIntact && custody.custody.prePushRefusesEveryPush && custody.custody.protectedPathsTracked === 0 : false, PROTECTED_OVERLAY_MATCHES_RECORDED_IDENTITIES: custody ? custody.custody.protectedOverlayMatchingRecordedHash === custody.custody.protectedIdentities : false,
  };
  record = { schema: 'SK1_GATE0_INTEGRITY_V1', authority: 'R0', stage: 'STAGE3H-SK1 Gate 0', verifiedAt: new Date().toISOString(), node: process.version, commitVerified: head,
    cleanExport: { method: 'git archive of the commit into a temporary directory', paths: EXPORT_PATHS, laneFiles: files.length, blobMismatch, inferenceGraph: { fileCount: graph.fileCount, files: graph.files.map((f) => f.rel), closureSha256: graph.closureSha256, violations: graph.violations, evaluatorFree: graph.evaluatorFree }, tests: clean },
    workingLane: { tests: testCounts(working.stdout), exit: working.status, uncommittedLaneChanges: laneStatus }, retiredAndSpentBlocks: retired, exclusionRegistryHash: ctx.registryHash, sealedRegistries: ctx.pcdIndex.seals.length, custodyManifestSha256: custody ? fileSha(resolve(EVIDENCE, 'SK1_CUSTODY_MANIFEST.json')) : null,
    checks, gate0: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    cleanCheckoutReproducibility: { kernelInferenceAndDecisionReplay: 'YES', kernelAndSecondGameTests: 'YES', populationGenerationAndEvaluation: 'NO — requires the custody-protected comparator overlay and privileged local data', statement: 'CLEAN_CHECKOUT_REPRODUCIBLE applies to the kernel inference graph, its tests and decision replay. It does not apply to regenerating populations or re-running the evaluation.' },
    notRepairedByThisGate: 'The static-import boundary of the frozen H-W1 / H-W4 policies at committed HEAD remains FAIL as recorded in the H-W4B closure. The uncommitted import cut in stage3h-hw1-dev-v1/public-projection.mjs is neither committed nor reverted; it was verified to be identity-preserving (tests/projection.test.mjs).',
    independentBackup: custody ? custody.independentBackup : null };
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ commit: record.commitVerified, cleanExport: { laneFiles: record.cleanExport.laneFiles, blobMismatch: record.cleanExport.blobMismatch.length, graph: record.cleanExport.inferenceGraph.fileCount, tests: record.cleanExport.tests }, working: record.workingLane, checks: record.checks, gate0: record.gate0 }, null, 1));
if (process.argv.includes('--write')) { writeExclusive(resolve(EVIDENCE, 'SK1_GATE0_INTEGRITY.json'), record); console.log('written evidence/SK1_GATE0_INTEGRITY.json'); }
if (record.gate0 !== 'PASS') process.exitCode = 1;
