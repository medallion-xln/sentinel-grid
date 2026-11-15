// Clean-clone regeneration of every DEV run record (Tasks 1-2). Usage (from the lane): node repro/clean-clone-reproduce.mjs
// 1. Verifies the authorized protected-source package (candidate d8a44ebd): its sha256 equals the value recorded in the
//    committed V4 clean-clone evidence, and every file in it equals its hash bound in REGISTRATION_CANDIDATE_V4.json.
// 2. Clones the local repository with --no-hardlinks into a fresh temporary directory, checks out 38f7c1d6, and overlays
//    the whole package (no substitute version). Re-measures the regeneration source closure inside the clone.
// 3. Runs the exact original commands inside the clone's lane: `node run-dev.mjs <set> <shard> <of>` for DEV288 (1
//    shard) and the spent DEV blocks 951/952 (5 shards each), same runtime, no flags.
// 4. Compares each regenerated record with the original: raw sha256, normalized sha256, and a field-by-field diff in
//    which only the declared timing fields may differ. Any other difference is REPRODUCTION_FAIL.
// 5. Removes the clone (it holds protected bytes) and writes evidence/reproducibility/REGENERATION_VERIFICATION.json once.
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { LANE, GA, ok, writeExclusive } from '../lib.mjs';
import { OUT_DIR, SETS, recordNames, describeRecords, concatenated, runtimeIdentity } from './manifest.mjs';
import { sourceClosure, BASE_COMMIT, CANDIDATE, PACKAGE, PACKAGE_RECORD } from './source-closure.mjs';
import { rowDiff, NORMALIZATION_ID } from './normalize.mjs';

const ROOT = resolve(GA, '../..'), git = (a, cwd = ROOT) => execFileSync('/usr/bin/git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();
const fsha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const run = (args, cwd) => new Promise((res) => { const c = spawn(process.execPath, args, { cwd, env: { ...process.env, NODE_OPTIONS: '' } }); let out = '', err = '';
  c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d)); c.on('close', (code) => res({ args: args.join(' '), code, out: out.trim(), err: err.trim().slice(-2000) })); });

const manifest = JSON.parse(readFileSync(resolve(OUT_DIR, 'DEV_RUN_MANIFEST.json'), 'utf8'));
ok(!existsSync(resolve(OUT_DIR, 'REGENERATION_VERIFICATION.json')), 'ALREADY_RECORDED');
const commit = git(['rev-parse', BASE_COMMIT]);

// ---- 1. package ----
const pkg = resolve(GA, PACKAGE), record = JSON.parse(readFileSync(resolve(GA, PACKAGE_RECORD), 'utf8')).protectedOverlay;
const bound = JSON.parse(readFileSync(resolve(GA, CANDIDATE), 'utf8')).bindings.sources;
const packageAvailable = existsSync(pkg);
ok(packageAvailable, 'PROTECTED_SOURCE_PACKAGE_UNAVAILABLE');
const packageSha256 = fsha(pkg), listing = execFileSync('/usr/bin/tar', ['-tzf', pkg], { encoding: 'utf8' }).trim().split('\n').filter((f) => !f.endsWith('/')).sort();
const tmp = mkdtempSync(resolve(tmpdir(), 'sg-dev-repro-')), stage = resolve(tmp, 'stage'), repo = resolve(tmp, 'repo');
let result;
try {
  execFileSync('/bin/mkdir', ['-p', stage]); execFileSync('/usr/bin/tar', ['-xzf', pkg, '-C', stage]);
  const packageFiles = listing.map((f) => ({ path: f, sha256: fsha(resolve(stage, f)), boundSha256: bound[f] ?? null }));
  const pkgCheck = { path: 'platform/game-agnostic/' + PACKAGE, sha256: packageSha256, recordedSha256: record.packageSha256, shaMatchesRecord: packageSha256 === record.packageSha256,
    files: packageFiles.length, listingMatchesRecord: JSON.stringify(listing) === JSON.stringify([...record.files].sort()), allFilesMatchBoundHashes: packageFiles.every((f) => f.sha256 === f.boundSha256),
    mismatches: packageFiles.filter((f) => f.sha256 !== f.boundSha256).map((f) => f.path), authoritativeManifest: 'platform/game-agnostic/' + CANDIDATE + ' bindings.sources', committed: false };
  ok(pkgCheck.shaMatchesRecord && pkgCheck.listingMatchesRecord && pkgCheck.allFilesMatchBoundHashes, 'PACKAGE_NOT_VERIFIED:' + JSON.stringify(pkgCheck));

  // ---- 2. clean clone + overlay ----
  execFileSync('/usr/bin/git', ['clone', '--quiet', '--no-hardlinks', ROOT, repo]);
  git(['checkout', '--quiet', commit], repo);
  const cloneGa = resolve(repo, 'platform/game-agnostic'), cloneLane = resolve(cloneGa, 'stage3h-failure-diagnosis-v1');
  const clonePre = { head: git(['rev-parse', 'HEAD'], repo), statusCleanBeforeOverlay: git(['status', '--porcelain', '--untracked-files=all'], repo) === '', devRunsAbsent: !existsSync(resolve(cloneLane, 'dev-runs')) };
  ok(clonePre.head === commit && clonePre.statusCleanBeforeOverlay && clonePre.devRunsAbsent, 'CLONE_NOT_CLEAN:' + JSON.stringify(clonePre));
  execFileSync('/usr/bin/tar', ['-xzf', pkg, '-C', cloneGa]);
  const overlaid = git(['status', '--porcelain', '--untracked-files=all'], repo).split('\n').filter(Boolean).map((l) => l.replace(/^\?\? platform\/game-agnostic\//, '')).sort();
  const overlay = { onlyPackageFilesAdded: JSON.stringify(overlaid) === JSON.stringify(listing), overlaidFilesMatchBound: listing.every((f) => fsha(resolve(cloneGa, f)) === bound[f]) };
  ok(overlay.onlyPackageFilesAdded && overlay.overlaidFilesMatchBound, 'OVERLAY_NOT_EXACT:' + JSON.stringify({ overlay, overlaid }));
  const closure = sourceClosure({ root: repo });
  const closureCheck = { files: closure.files, trackedAllMatchBase: closure.trackedAllMatchBase, untrackedAllInPackageAndBound: closure.untrackedAllInPackageAndBound, untracked: closure.untracked,
    closureSha256: closure.closureSha256, equalsManifestClosure: closure.closureSha256 === manifest.sourceIdentity.closureSha256 };
  ok(closureCheck.trackedAllMatchBase && closureCheck.untrackedAllInPackageAndBound && closureCheck.equalsManifestClosure, 'CLONE_CLOSURE_MISMATCH:' + JSON.stringify(closureCheck));

  // ---- 3. exact regeneration ----
  const commands = Object.keys(SETS).flatMap((set) => [...Array(SETS[set].of).keys()].map((shard) => ['run-dev.mjs', set, String(shard), String(SETS[set].of)]));
  const started = Date.now(), runs = await Promise.all(commands.map((c) => run(c, cloneLane))), seconds = (Date.now() - started) / 1000;
  ok(runs.every((r) => r.code === 0), 'REGENERATION_COMMAND_FAILED:' + JSON.stringify(runs.filter((r) => r.code !== 0)));

  // ---- 4. comparison ----
  const regen = describeRecords(resolve(cloneLane, 'dev-runs'));
  const records = Object.fromEntries(Object.entries(manifest.records).map(([k, orig]) => {
    const [set, name] = k.split('/'), d = rowDiff(name, readFileSync(resolve(LANE, 'dev-runs', set, name), 'utf8'), readFileSync(resolve(cloneLane, 'dev-runs', set, name), 'utf8'));
    return [k, { originalRawSha256: orig.rawSha256, regeneratedRawSha256: regen[k].rawSha256, rawIdentical: orig.rawSha256 === regen[k].rawSha256,
      originalNormalizedSha256: orig.normalizedSha256, regeneratedNormalizedSha256: regen[k].normalizedSha256, normalizedIdentical: orig.normalizedSha256 === regen[k].normalizedSha256, ...d }];
  }));
  const concat = Object.fromEntries(Object.keys(SETS).map((s) => [s, { original: manifest.resultMdConcatenatedHashes[s].normalizedConcatenatedSha256, regenerated: concatenated(resolve(cloneLane, 'dev-runs'), s, true) }]));
  const rs = Object.values(records);
  const summary = { records: rs.length, rows: rs.reduce((a, r) => a + r.rows[0], 0), normalizedIdentical: rs.filter((r) => r.normalizedIdentical).length, rawIdentical: rs.filter((r) => r.rawIdentical).length,
    rowCountsEqual: rs.every((r) => r.rowCountEqual), rowsWithScientificDifference: rs.reduce((a, r) => a + r.rowsWithScientificDifference, 0), rowsWithTimingDifference: rs.reduce((a, r) => a + r.rowsWithTimingDifference, 0),
    concatenatedNormalizedIdentical: Object.values(concat).every((c) => c.original === c.regenerated) };
  const pass = summary.normalizedIdentical === rs.length && summary.rowCountsEqual && summary.rowsWithScientificDifference === 0 && summary.concatenatedNormalizedIdentical;
  result = { schema: 'STAGE3H_DEV_REGENERATION_VERIFICATION_V1', authority: 'R0', baseCommit: commit, normalization: NORMALIZATION_ID, runtime: runtimeIdentity(),
    method: 'git clone --no-hardlinks of the local repository into a fresh temporary directory, checkout of the base commit, overlay of the complete authorized protected-source package, exact original commands run inside the clone lane in parallel',
    protectedPackage: pkgCheck, clone: { ...clonePre, overlay, closure: closureCheck }, regeneration: { commands: runs.map((r) => ({ argv: 'node ' + r.args, exit: r.code, stdout: r.out })), seconds },
    summary, concatenatedNormalized: concat, records, verdict: pass ? 'REGENERATION_PASS' : 'REPRODUCTION_FAIL',
    dataAccess: 'The regeneration commands read the S0 model, the V3 contract, prior-world-exclusions.json and the worldHash field of the ten V4 ledgers (outcome-blind exclusion, identical to the original run). No V4 row, LOCK or ANALYSIS file is in the measured closure.' };
} finally { rmSync(tmp, { recursive: true, force: true }); }
result.cloneRemoved = !existsSync(tmp);
writeExclusive(resolve(OUT_DIR, 'REGENERATION_VERIFICATION.json'), result);
console.log(JSON.stringify({ verdict: result.verdict, summary: result.summary, package: { sha: result.protectedPackage.sha256, ok: result.protectedPackage.allFilesMatchBoundHashes }, seconds: result.regeneration.seconds, cloneRemoved: result.cloneRemoved }, null, 1));
