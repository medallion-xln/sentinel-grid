// STAGE 3H-SK2-F Gate 5 — tests. Run: node --test infra-audit/*.test.mjs
// Pure-logic tests and negative controls run anywhere. Tests marked INTEGRATION need this working tree (protected
// overlay and SK1 local data) and skip with a message otherwise. Nothing here commits, stages or edits a tracked file:
// the "after the commit" state is produced in a scratch git directory (sim-post-commit.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, chmodSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lineDiff, isExactlyTheRecordedCut, hunkLines, closureIsClean, hw4RuleAudit, EXPECTED, OLD_SHA, CUT_SHA, RECORDED_DIFF_SHA, PP, PP_REL, AUDIT_FILE, HW4_FORBIDDEN_SPEC, HW4_FORBIDDEN_TOKEN, revisions, recommend } from './import-cut-audit.mjs';
import { isExpectedDriftRow, classifyDrift, STATUS_FILE } from './status.mjs';
import { simulateCommit } from './sim-post-commit.mjs';
import { checkDestination, checkInvocation, parseMounts, mountOf, cloudReason, writeBackup, restoreBackup, APPROVAL_FLAG } from './backup/backup.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '../..'), REPO = resolve(GA, '../..'), GIT = '/usr/bin/git', NODE = process.execPath;
const sha = (b) => createHash('sha256').update(b).digest('hex'), git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const LOCAL = existsSync(resolve(GA, 'stage3h-canonical-v1/adapters.mjs')) && existsSync(resolve(GA, 'stage3h-sk1-safety-kernel-v1/work/manifests/SK1_POPULATION_VALIDATION.json')), SKIP = LOCAL ? false : 'needs the protected overlay and SK1 local data of the working tree';
const rev = revisions(), HW4 = resolve(GA, 'stage3h-hw4-value-band-v1'), PP_GA = 'stage3h-hw1-dev-v1/public-projection.mjs';

// ---------------------------------------------------------------------------------------------------------------- condition 1
test('[C1] the change between the committed revision and the cut is exactly the recorded five lines', () => {
  assert.equal(sha(rev.oldText), OLD_SHA); assert.equal(sha(rev.cutText), CUT_SHA);
  const r = isExactlyTheRecordedCut(rev.oldText, rev.cutText); assert.deepEqual(r.problems, []); assert.equal(r.linesRemoved, 2); assert.equal(r.linesAdded, 3); assert.equal(r.totalChangedLines, 5);
  const rec = JSON.parse(readFileSync(resolve(HW4, 'evidence/HW4B_RECOVERY_MANIFEST.json'), 'utf8')).importCut;
  assert.equal(rec.unifiedDiffSha256, RECORDED_DIFF_SHA); assert.equal(sha(rec.unifiedDiff), RECORDED_DIFF_SHA); assert.deepEqual(hunkLines(rec.unifiedDiff), { removed: EXPECTED.removed, added: EXPECTED.added });
  assert.equal(git('diff', rev.oldRev.commit, '--', PP_REL) + '\n', rec.unifiedDiff); // byte-identical to the tracked record, before and after the commit
});
test('[C1] NEGATIVE CONTROL: one extra changed line anywhere is detected', () => {
  const lines = rev.cutText.split('\n');
  const extraInHunk = [...lines.slice(0, 14), '// an extra line', ...lines.slice(14)].join('\n'), farAway = lines.map((l, i) => (i === 120 ? l + ' ' : l)).join('\n'), reworded = rev.cutText.replace('const D4_ELEMENTS = ORIENTATIONS;', 'const D4_ELEMENTS = [...ORIENTATIONS];');
  for (const t of [extraInHunk, farAway, reworded]) { const r = isExactlyTheRecordedCut(rev.oldText, t); assert.equal(r.ok, false); assert.ok(r.problems.includes('CUT_REVISION_HASH_MISMATCH')); assert.ok(r.problems.includes('ADDED_LINES_DIFFER_FROM_RECORD') || r.problems.includes('REMOVED_LINES_DIFFER_FROM_RECORD')); }
  assert.equal(isExactlyTheRecordedCut(rev.oldText, rev.oldText).ok, false); // "no change" is not the recorded cut either
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nX\nY\nc'), { firstChangedLine: 2, unchangedPrefixLines: 1, unchangedSuffixLines: 1, removed: ['b'], added: ['X', 'Y'] });
});

// ---------------------------------------------------------------------------------------------------------------- condition 4
test('[C4] NEGATIVE CONTROL: a closure that contains transforms.mjs, a script, an evaluator or a protected file is rejected', () => {
  const ok = [{ file: 'src/forge-symmetric/orientation-symmetric-v1.js', class: 'TRACKED_EQUALS_HEAD' }, { file: 'src/forge/kernel.js', class: 'TRACKED_EQUALS_HEAD' }];
  assert.equal(closureIsClean(ok).ok, true);
  for (const bad of [{ file: 'stage3h-hw1-dev-v1/transforms.mjs', class: 'TRACKED_EQUALS_HEAD' }, { file: 'scripts/stage3g/evidence.mjs', class: 'TRACKED_EQUALS_HEAD' }, { file: 'stage3h-failure-diagnosis-v1/lib.mjs', class: 'TRACKED_EQUALS_HEAD' }, { file: 'stage3h-hw1-dev-v1/hw1-eval.mjs', class: 'TRACKED_EQUALS_HEAD' },
    { file: 'stage3h-canonical-v1/adapters.mjs', class: 'UNTRACKED_CUSTODY_PROTECTED' }, { file: 'src/x.js', class: 'UNTRACKED_CUSTODY_PROTECTED' }, { file: 'src/missing.js', class: 'MISSING' }, { file: 'src/new.js', class: 'UNTRACKED_OTHER' }]) { const r = closureIsClean([...ok, bad]); assert.equal(r.ok, false, bad.file); assert.equal(r.offending.length, 1); }
});
test('[C4] the frozen H-W4 rule is restated verbatim and reproduces the recorded 10 / 0 and 76 / 40', { skip: SKIP }, () => {
  const src = readFileSync(resolve(HW4, 'hw4-validate.mjs'), 'utf8'); assert.ok(src.includes(`const FORBIDDEN_SPEC = ${HW4_FORBIDDEN_SPEC};`)); assert.ok(src.includes(`const FORBIDDEN_TOKEN = ${HW4_FORBIDDEN_TOKEN}`));
  const policy = ['hw4-policy.mjs', 'hw4-features.mjs', 'hw4-contract-v2.mjs'].map((f) => resolve(HW4, f)).concat(PP), cut = hw4RuleAudit(policy, (f) => (f === PP ? rev.cutText : readFileSync(f, 'utf8'))), old = hw4RuleAudit(policy, (f) => (f === PP ? rev.oldText : readFileSync(f, 'utf8')));
  assert.deepEqual([cut.files, cut.violations], [10, 0]); assert.deepEqual([old.files, old.violations], [76, 40]);
});

// ---------------------------------------------------------------------------------------------------------------- SK1.1 inventory drift
const EXPECTED_ROWS = [`$.codeClosure.files[${PP_GA}].class: "TRACKED_MODIFIED" -> "TRACKED_EQUALS_HEAD"`, `$.codeClosure.files[${PP_GA}].headSha256: REMOVED`, '$.codeClosure.byClass.TRACKED_MODIFIED: REMOVED', '$.codeClosure.byClass.TRACKED_EQUALS_HEAD: 146 -> 147',
  '$.codeClosure.byGroupAndClass.evaluation.TRACKED_MODIFIED: REMOVED', '$.codeClosure.byGroupAndClass.evaluation.TRACKED_EQUALS_HEAD: 136 -> 137', '$.codeClosure.perEvaluationEntry[18].byClass.TRACKED_EQUALS_HEAD: 112 -> 113', '$.codeClosure.perEvaluationEntry[18].byClass.TRACKED_MODIFIED: REMOVED',
  '$.sourceIdentities.evaluationRun.byClass.TRACKED_EQUALS_HEAD: 112 -> 113', '$.sourceIdentities.evaluationRun.byClass.TRACKED_MODIFIED: REMOVED'];
test('[DRIFT] the rows that committing the cut produces are recognised; everything else is not', () => {
  for (const r of EXPECTED_ROWS) assert.equal(isExpectedDriftRow(r), true, r);
  for (const r of ['$.codeClosure.files[stage3h-hw1-dev-v1/hw1-eval.mjs].class: "TRACKED_EQUALS_HEAD" -> "TRACKED_MODIFIED"', `$.codeClosure.files[${PP_GA}].sha256: "c4f9…" -> "ffff…"`, `$.codeClosure.files[${PP_GA}].class: "TRACKED_MODIFIED" -> "MISSING"`, '$.codeClosure.byClass.TRACKED_EQUALS_HEAD: 146 -> 148', '$.codeClosure.byClass.TRACKED_EQUALS_HEAD: 146 -> 145',
    '$.codeClosure.byClass.UNTRACKED_CUSTODY_PROTECTED: 29 -> 28', '$.codeClosure.byClass.TRACKED_MODIFIED: 1 -> 2', '$.custody.matchingRecordedIdentity: 31 -> 30', '$.localData.listingSha256: "a" -> "b"', '$.freezeBinding.allOk: true -> false', '$.sourceIdentities.evaluationRun.closureSha256: "a" -> "b"']) assert.equal(isExpectedDriftRow(r), false, r);
});
test('[DRIFT] NEGATIVE CONTROL: drift before the commit, an unexpected row, a failed check or unbalanced counts all fail', () => {
  assert.equal(classifyDrift([], [], 'CUT_UNCOMMITTED').ok, true); assert.equal(classifyDrift([], [], 'CUT_UNCOMMITTED').label, 'NO_DRIFT');
  assert.equal(classifyDrift(EXPECTED_ROWS, [], 'CUT_UNCOMMITTED').ok, false); // the same rows are NOT acceptable while the cut is uncommitted
  const post = classifyDrift(EXPECTED_ROWS, [], 'CUT_COMMITTED'); assert.equal(post.ok, true); assert.equal(post.label, 'EXPECTED_AFTER_IMPORT_CUT_COMMIT'); assert.equal(post.unexpectedRows.length, 0);
  assert.equal(classifyDrift([...EXPECTED_ROWS, '$.custody.matchingRecordedIdentity: 31 -> 30'], [], 'CUT_COMMITTED').ok, false);
  assert.equal(classifyDrift(EXPECTED_ROWS, ['FREEZE:CODE_HASHES'], 'CUT_COMMITTED').ok, false);
  assert.equal(classifyDrift(EXPECTED_ROWS.slice(0, -1), [], 'CUT_COMMITTED').ok, false); // one count moved without its counterpart
  assert.equal(classifyDrift([], [], 'CUT_COMMITTED').ok, false); // committed but the dated inventory shows nothing: not the expected picture
});

// ---------------------------------------------------------------------------------------------------------------- backup refusals
const MOUNTS = parseMounts(['/dev/disk3s1s1 on / (apfs, sealed, local, read-only, journaled)', '/dev/disk5s1 on /Volumes/Vault (apfs, local, nodev, nosuid, journaled, noowners)', '//user@nas.local/share on /Volumes/share (smbfs, nodev, nosuid, mounted by user)', 'server:/export on /Volumes/nfs (nfs, nodev, nosuid)'].join('\n'));
const good = (over = {}) => ({ exists: true, realPath: '/Volumes/Vault/backups', device: 55, repoDevice: 1, repoRoot: '/Users/x/repo', mounts: MOUNTS, freeBytes: 10 * 2 ** 30, requiredBytes: 3 * 2 ** 30, ...over });
test('[BACKUP] an acceptable destination is accepted; mount parsing finds the containing volume', () => {
  assert.equal(MOUNTS.length, 4); assert.equal(mountOf('/Volumes/Vault/backups', MOUNTS).fsType, 'apfs'); assert.equal(mountOf('/Users/x', MOUNTS).mountPoint, '/');
  const r = checkDestination('/Volumes/Vault/backups', good()); assert.equal(r.ok, true); assert.deepEqual(r.refusals, []);
});
test('[BACKUP] NEGATIVE CONTROLS: every unsafe destination is refused with its own code', () => {
  const codes = (dest, f) => checkDestination(dest, f).refusals.map((x) => x.code);
  assert.deepEqual(codes(null, good()), ['DESTINATION_REQUIRED']); assert.deepEqual(codes('/nope', good({ exists: false })), ['DESTINATION_DOES_NOT_EXIST']);
  assert.ok(codes('/Users/x/repo/backup', good({ realPath: '/Users/x/repo/backup', device: 1 })).includes('DESTINATION_INSIDE_REPOSITORY'));
  assert.ok(codes('/Users/x/elsewhere', good({ realPath: '/Users/x/elsewhere', device: 1 })).includes('DESTINATION_ON_SAME_DEVICE_AS_REPOSITORY'));
  for (const p of ['/Users/x/Library/Mobile Documents/com~apple~CloudDocs/b', '/Users/x/Library/CloudStorage/GoogleDrive-a@b/My Drive/b', '/Users/x/Dropbox/b', '/Users/x/OneDrive - Org/b', '/Volumes/Vault/Google Drive/b', '/Users/x/iCloud Drive/b']) { assert.ok(cloudReason(p), p); assert.ok(codes(p, good({ realPath: p })).includes('DESTINATION_IS_CLOUD_SYNCED'), p); }
  assert.ok(codes('/Volumes/share/b', good({ realPath: '/Volumes/share/b' })).includes('DESTINATION_IS_NETWORK_MOUNT')); assert.ok(codes('/Volumes/nfs/b', good({ realPath: '/Volumes/nfs/b' })).includes('DESTINATION_IS_NETWORK_MOUNT'));
  assert.ok(codes('/Volumes/Vault/b', good({ freeBytes: 2 ** 30 })).includes('INSUFFICIENT_FREE_SPACE'));
  assert.equal(cloudReason('/Volumes/Vault/backups'), null);
  assert.deepEqual(checkInvocation({ dest: null, approved: false, interactive: false }).refusals.map((x) => x.code), ['DESTINATION_REQUIRED', 'OWNER_APPROVAL_FLAG_REQUIRED', 'INTERACTIVE_TERMINAL_REQUIRED']);
  assert.deepEqual(checkInvocation({ dest: '/Volumes/Vault', approved: true, interactive: false }).refusals.map((x) => x.code), ['INTERACTIVE_TERMINAL_REQUIRED']); assert.equal(checkInvocation({ dest: '/Volumes/Vault', approved: true, interactive: true }).ok, true);
});
test('[BACKUP] the command line refuses and writes nothing: no destination, no approval flag, not a terminal; the dry run touches nothing', () => {
  const run = (...a) => spawnSync(NODE, [resolve(HERE, 'backup/backup.mjs'), ...a], { encoding: 'utf8' }), dest = mkdtempSync(resolve(tmpdir(), 'sk2f-backup-dest-'));
  try {
    for (const args of [['run'], ['run', '--dest', dest], ['run', '--dest', dest, APPROVAL_FLAG]]) { const r = run(...args), o = JSON.parse(r.stdout); assert.equal(r.status, 2); assert.equal(o.result, 'REFUSED'); assert.equal(o.nothingWasWritten, true); assert.deepEqual(readdirSync(dest), []); }
    assert.ok(JSON.parse(run('run', '--dest', dest, APPROVAL_FLAG).stdout).refusals.some((x) => x.code === 'INTERACTIVE_TERMINAL_REQUIRED')); // a non-interactive caller can never start a backup
    const p = run('plan', '--dest', dest), o = JSON.parse(p.stdout); assert.equal(p.status, 0); assert.equal(o.result, 'DRY_RUN_NOTHING_WRITTEN'); assert.equal(o.destination.wouldBeAccepted, false);
    assert.ok(o.destination.refusals.some((x) => x.code === 'DESTINATION_ON_SAME_DEVICE_AS_REPOSITORY')); assert.deepEqual(readdirSync(dest), []);
  } finally { rmSync(dest, { recursive: true, force: true }); }
});
test('[BACKUP] REHEARSAL on a tiny fixture repository: backup, restore, verify; a same-device restore is never accepted as independent', () => {
  const tmp = mkdtempSync(resolve(tmpdir(), 'sk2f-rehearsal-')), repo = resolve(tmp, 'repo'), target = resolve(tmp, 'backup'), root = resolve(tmp, 'restored'), g = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    mkdirSync(repo); execFileSync(GIT, ['init', '-q', '-b', 'main', repo]); g('config', 'user.email', 'rehearsal@invalid'); g('config', 'user.name', 'rehearsal');
    writeFileSync(resolve(repo, 'a.txt'), 'one\n'); writeFileSync(resolve(repo, '.gitignore'), 'work/\n'); g('add', 'a.txt', '.gitignore'); g('commit', '-q', '-m', 'fixture'); g('update-ref', 'refs/custody/pre', 'HEAD');
    mkdirSync(resolve(repo, 'protected')); writeFileSync(resolve(repo, 'protected/secret.mjs'), 'export const s = 1;\n'); const ps = sha(readFileSync(resolve(repo, 'protected/secret.mjs')));
    mkdirSync(resolve(repo, '.git/custody')); writeFileSync(resolve(repo, '.git/custody/protected-identities.tsv'), `# kind\tpath\tblob\tsha256\tsize\nSRC\tprotected/secret.mjs\t0000\t${ps}\t20\n`); appendFileSync(resolve(repo, '.git/info/exclude'), 'protected/\n');
    writeFileSync(resolve(repo, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 0\n'); chmodSync(resolve(repo, '.git/hooks/pre-commit'), 0o755);
    mkdirSync(resolve(repo, 'work')); writeFileSync(resolve(repo, 'work/data.json'), '{"spent":true}\n'); chmodSync(resolve(repo, 'work/data.json'), 0o400);
    writeFileSync(resolve(repo, 'a.txt'), 'one\ntwo\n'); writeFileSync(resolve(repo, 'notes.md'), 'untracked\n');
    mkdirSync(target); const w = writeBackup({ repo, target, fileLevelIgnored: ['work/'] });
    assert.equal(w.copyVerified, true); assert.ok(w.filesCopied >= 6); assert.ok(existsSync(resolve(target, 'sentinel-grid.bundle'))); assert.ok(existsSync(resolve(target, 'files/protected/secret.mjs'))); assert.ok(existsSync(resolve(target, 'files/.git/custody/protected-identities.tsv')));
    assert.throws(() => writeBackup({ repo, target, fileLevelIgnored: ['work/'] }), /EMPTY_DIRECTORY/); // never writes into an existing backup
    const strict = restoreBackup({ backupDir: target, root, sourceRepo: repo }); // same device, not allowed: content is right, acceptance is refused
    assert.equal(strict.check.contentOk, true); assert.equal(strict.check.ok, false); assert.equal(strict.check.label, 'REJECTED_SAME_DEVICE');
    const root2 = resolve(tmp, 'restored2'), reh = restoreBackup({ backupDir: target, root: root2, sourceRepo: repo, allowSameDevice: true });
    assert.equal(reh.check.ok, true); assert.equal(reh.check.label, 'REHEARSAL_ONLY_SAME_DEVICE'); assert.deepEqual(reh.check.missing, []); assert.deepEqual(reh.check.mismatched, []); assert.deepEqual(reh.check.refsWrong, []);
    assert.equal(readFileSync(resolve(root2, 'a.txt'), 'utf8'), 'one\ntwo\n'); assert.equal(readFileSync(resolve(root2, 'work/data.json'), 'utf8'), '{"spent":true}\n'); assert.equal(execFileSync(GIT, ['-C', root2, 'rev-parse', 'refs/custody/pre'], { encoding: 'utf8' }), g('rev-parse', 'refs/custody/pre'));
    // NEGATIVE CONTROL: a tampered backup does not restore to a verified copy
    chmodSync(resolve(target, 'files/work/data.json'), 0o600); writeFileSync(resolve(target, 'files/work/data.json'), '{"spent":false}\n');
    const bad = restoreBackup({ backupDir: target, root: resolve(tmp, 'restored3'), sourceRepo: repo, allowSameDevice: true }); assert.equal(bad.check.ok, false); assert.deepEqual(bad.check.mismatched, ['work/data.json']);
  } finally { for (const d of [repo, target, root, resolve(tmp, 'restored2'), resolve(tmp, 'restored3')]) if (existsSync(d)) execFileSync('/bin/chmod', ['-R', 'u+rwX', d]); rmSync(tmp, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------------------------- integration
test('[INTEGRATION] status is correct now AND in the simulated post-commit state; the simulation leaves the real repository untouched', { skip: SKIP }, () => {
  const before = { head: git('rev-parse', 'HEAD'), refs: git('for-each-ref', '--format=%(refname) %(objectname)'), status: git('status', '--porcelain', '--', PP_REL), objects: git('count-objects'), work: sha(readFileSync(PP)) };
  const now = spawnSync(NODE, [resolve(HERE, 'status.mjs')], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 }), o = JSON.parse(now.stdout); assert.equal(now.status, 0, now.stderr);
  const committedForReal = rev.state === 'CUT_COMMITTED';
  assert.equal(o.importCut, rev.state); assert.match(o.sk11InventoryDrift, committedForReal ? /^EXPECTED_AFTER_IMPORT_CUT_COMMIT \(\d+ rows, 0 unexpected\)$/ : /^NO_DRIFT \(0 rows, 0 unexpected\)$/);
  assert.equal(o.verdicts.INDEPENDENT_BACKUP_VERIFIED, false); assert.equal(o.verdicts.CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE, false); assert.equal(o.verdicts.EXCLUSION_LOADERS_IMPORTABLE_FROM_CLEAN_CHECKOUT, false); assert.equal(o.verdicts.SOURCE_CUSTODY_PASS, true); assert.equal(o.verdicts.INFRASTRUCTURE_READY_FOR_AN_INDEPENDENT_SCIENTIFIC_CAMPAIGN, 'NOT_READY');
  if (!committedForReal) {
    const s = simulateCommit(); let sim, chk;
    try { sim = spawnSync(NODE, [resolve(HERE, 'status.mjs')], { cwd: REPO, env: s.env, encoding: 'utf8', maxBuffer: 1 << 28 }); chk = spawnSync(NODE, ['infra/run.mjs', 'check'], { cwd: resolve(GA, 'stage3h-sk1-safety-kernel-v1'), env: s.env, encoding: 'utf8', maxBuffer: 1 << 28 }); } finally { s.dispose(); }
    const p = JSON.parse(sim.stdout); assert.equal(sim.status, 0, sim.stderr); assert.equal(p.importCut, 'CUT_COMMITTED'); assert.match(p.sk11InventoryDrift, /^EXPECTED_AFTER_IMPORT_CUT_COMMIT \(\d+ rows, 0 unexpected\)$/);
    assert.equal(p.verdicts.IMPORT_CUT_COMMITTED, true); assert.ok(p.limitations.find((l) => l.startsWith('L2:')).includes('CLOSED PROSPECTIVELY')); assert.ok(!p.verdicts.EVALUATION_SUPPLEMENTS_STILL_REQUIRED.includes('the uncommitted import cut'));
    // the commit closes one limitation and only one: the others read the same before and after
    for (const id of ['L1', 'L3', 'L4', 'L5']) assert.equal(p.limitations.find((l) => l.startsWith(id + ':')), o.limitations.find((l) => l.startsWith(id + ':')), id);
    assert.equal(p.verdicts.CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE, false); assert.equal(p.verdicts.EXCLUSION_LOADERS_IMPORTABLE_FROM_CLEAN_CHECKOUT, false); assert.equal(p.verdicts.INFRASTRUCTURE_READY_FOR_AN_INDEPENDENT_SCIENTIFIC_CAMPAIGN, 'NOT_READY');
    assert.match(chk.stdout, /SK1_CHECK_PASS/); // the SK1 freeze binds content, so its check is unaffected by the commit
  }
  assert.deepEqual({ head: git('rev-parse', 'HEAD'), refs: git('for-each-ref', '--format=%(refname) %(objectname)'), status: git('status', '--porcelain', '--', PP_REL), objects: git('count-objects'), work: sha(readFileSync(PP)) }, before);
});
test('[INTEGRATION] the stored records are consistent with their verifiers', { skip: SKIP || (!existsSync(AUDIT_FILE) || !existsSync(STATUS_FILE) ? 'evidence records not written yet' : false) }, () => {
  const a = JSON.parse(readFileSync(AUDIT_FILE, 'utf8')), c = a.core;
  assert.equal(a.nothingWasCommittedByThisAudit, true); assert.equal(a.gitState.state, 'CUT_UNCOMMITTED');
  for (const k of ['condition1_exactRecordedDiff', 'condition2_semanticsUnchanged', 'condition3_protectedInputsUnchanged', 'condition4_staticReachability', 'condition6_historicalRecord', 'condition7_noHashRewritten']) assert.equal(c[k].pass, true, k);
  assert.equal(a.condition5_compatibilityRuns.pass, true); assert.equal(c.blockQuestion.blocked, false);
  assert.equal(a.recommendation, recommend({ c1: true, c2: true, c3: true, c4: true, c6: true, c7: true, block: true }, true).recommendation); assert.equal(a.recommendation, 'IMPORT_CUT_QUALIFIES_FOR_SCOPED_COMMIT');
  assert.equal(recommend({ c1: true, c2: false, c3: true, c4: true, c6: true, c7: true, block: true }, true).recommendation, 'IMPORT_CUT_COMMIT_BLOCKED'); assert.equal(recommend({ c1: true, c2: true, c3: true, c4: true, c6: true, c7: true, block: true }, false).recommendation, 'IMPORT_CUT_COMMIT_BLOCKED');
  assert.equal(c.condition1_exactRecordedDiff.totalChangedLines, 5); assert.equal(c.condition2_semanticsUnchanged.measuredNow.projectionsWithAnyDifferingOutput, 0); assert.ok(c.condition2_semanticsUnchanged.measuredNow.projectionsCompared >= 1600);
  assert.equal(c.condition4_staticReachability.cutRevision.files, 6); assert.equal(c.condition4_staticReachability.oldRevision.files, 72); assert.equal(c.condition4_staticReachability.cutRevision.containsTransforms, false); assert.deepEqual(c.condition6_historicalRecord.unclassified, []);
  const v = spawnSync(NODE, [resolve(HERE, 'status.mjs'), 'verify'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 }); assert.match(v.stdout, /SK2F_REPRO_STATUS_VERIFY_PASS/); assert.equal(JSON.parse(v.stdout).wroteAnything, false);
  for (const f of [AUDIT_FILE, STATUS_FILE]) { const t = readFileSync(f, 'utf8'); assert.ok(!/"(seed|seeds|worldHash|truth|utility)"\s*:/.test(t), 'no privileged key in ' + f); }
});
