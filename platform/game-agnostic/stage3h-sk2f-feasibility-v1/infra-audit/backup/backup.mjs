// STAGE 3H-SK2-F Gate 5 — independent backup PROCEDURE (executable; NOT executed by this stage).
//
//   node infra-audit/backup/backup.mjs plan [--dest <path>]
//        DRY RUN. Prints what would be copied, how large it is, and — if a destination is given — whether it would be
//        accepted. Touches nothing, hashes nothing, creates nothing.
//   node infra-audit/backup/backup.mjs run --dest <path> --owner-approved-destination
//        Creates the backup. Refuses unless EVERY condition below holds. Must be run by the owner in a terminal:
//        the encryption passphrase is typed at hdiutil's own prompt and is never an argument, a variable or a file.
//   node infra-audit/backup/backup.mjs restore-verify --backup <mounted backup directory> --to <new empty directory> [--owner-attests-medium-detached]
//        Restores into a new directory on a DIFFERENT device than this repository and runs the four-part acceptance.
//
// Refusals of `run` (each has a stable code and a test):
//   DESTINATION_REQUIRED · OWNER_APPROVAL_FLAG_REQUIRED · INTERACTIVE_TERMINAL_REQUIRED · DESTINATION_DOES_NOT_EXIST ·
//   DESTINATION_INSIDE_REPOSITORY · DESTINATION_ON_SAME_DEVICE_AS_REPOSITORY · DESTINATION_IS_CLOUD_SYNCED ·
//   DESTINATION_IS_NETWORK_MOUNT · INSUFFICIENT_FREE_SPACE
// What is backed up: a git bundle of ALL refs (it contains protected source through the custody refs), the custody
// control files inside .git, the protected overlay, uncommitted and untracked files, and the SK1 work/ data.
// Where: owner-controlled OFFLINE media only, inside an encrypted container (an encrypted APFS volume, or an AES-256
// sparsebundle created here). Never cloud storage, never a network share, never a remote git host, never a push.
// This script never claims a backup exists. INDEPENDENT_BACKUP_VERIFIED may be stated only after restore-verify prints
// ALL_FOUR_ACCEPTANCE_CONDITIONS_MET for a restore on a different device, with the medium since detached.
// A restored validation population is spent data. It is never fresh.
import { existsSync, statSync, statfsSync, mkdirSync, copyFileSync, chmodSync, readFileSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { GIT, REPO, fileSha } from '../../../stage3h-sk1-1-assurance-v1/repro/lib.mjs';
import { buildManifest, verifyRestore } from '../../../stage3h-sk1-1-assurance-v1/repro/backup-manifest.mjs';

export const APPROVAL_FLAG = '--owner-approved-destination', SK1_WORK = 'platform/game-agnostic/stage3h-sk1-safety-kernel-v1/work/';
const CLOUD = [[/\/Library\/Mobile Documents\//i, 'iCloud Drive'], [/\/Library\/CloudStorage\//i, 'a File Provider cloud folder'], [/(^|\/)iCloud( Drive)?(\/|$)/i, 'iCloud'], [/(^|\/)Dropbox(\/|$| )/i, 'Dropbox'], [/(^|\/)Google ?Drive(\/|$)|GoogleDrive/i, 'Google Drive'], [/(^|\/)OneDrive(\/|$|[ -])/i, 'OneDrive'], [/(^|\/)(Box|Box Sync|pCloud|MEGA|Sync\.com)(\/|$)/i, 'a sync client folder']];
const NETWORK_FS = new Set(['smbfs', 'afpfs', 'nfs', 'webdav', 'ftp', 'cifs', 'fuse.sshfs', 'osxfuse', 'macfuse']);
const J = JSON.stringify, fmt = (b) => (b >= 1 << 30 ? `${(b / 2 ** 30).toFixed(2)} GiB` : b >= 1 << 20 ? `${(b / 2 ** 20).toFixed(1)} MiB` : `${b} B`);

// ---------------------------------------------------------------------------------------------------------------------
// pure checks
// ---------------------------------------------------------------------------------------------------------------------
/** Parse `/sbin/mount` output into [{ device, mountPoint, fsType, flags }]. */
export function parseMounts(text) {
  return text.split('\n').map((l) => /^(.+?) on (.+) \(([^,)]+)(.*)\)$/.exec(l.trim())).filter(Boolean).map((m) => ({ device: m[1], mountPoint: m[2], fsType: m[3].trim(), flags: m[4].split(',').map((s) => s.trim()).filter(Boolean) }));
}
/** The mount that contains `path` (longest mount-point prefix). */
export const mountOf = (path, mounts) => mounts.filter((m) => path === m.mountPoint || path.startsWith(m.mountPoint.replace(/\/$/, '') + '/') || m.mountPoint === '/').sort((a, b) => b.mountPoint.length - a.mountPoint.length)[0] ?? null;
export const cloudReason = (path) => (CLOUD.find(([re]) => re.test(path)) ?? [null, null])[1];
/**
 * Decide whether a destination may receive the backup. `facts` is injectable for tests:
 *   { exists, realPath, device, repoDevice, repoRoot, mounts, freeBytes, requiredBytes }
 * Returns { ok, refusals: [{ code, detail }] }. Every failing condition is reported, not only the first.
 */
export function checkDestination(dest, facts) {
  const r = [], add = (code, detail) => r.push({ code, detail });
  if (!dest) { add('DESTINATION_REQUIRED', 'pass --dest <path on owner-controlled offline storage>'); return { ok: false, refusals: r }; }
  if (!facts.exists) { add('DESTINATION_DOES_NOT_EXIST', dest); return { ok: false, refusals: r }; }
  const p = facts.realPath, repo = facts.repoRoot;
  if (p === repo || p.startsWith(repo + sep)) add('DESTINATION_INSIDE_REPOSITORY', p);
  if (facts.device === facts.repoDevice) add('DESTINATION_ON_SAME_DEVICE_AS_REPOSITORY', 'a copy on the same disk is not an independent backup');
  const cloud = cloudReason(p) ?? cloudReason(dest); if (cloud) add('DESTINATION_IS_CLOUD_SYNCED', cloud);
  const m = mountOf(p, facts.mounts ?? []); if (m && (NETWORK_FS.has(m.fsType) || /^\/\/|^[^/]+:\//.test(m.device))) add('DESTINATION_IS_NETWORK_MOUNT', `${m.fsType} ${m.device}`);
  if (!(facts.freeBytes >= facts.requiredBytes)) add('INSUFFICIENT_FREE_SPACE', `${fmt(facts.freeBytes ?? 0)} free, ${fmt(facts.requiredBytes)} required`);
  return { ok: r.length === 0, refusals: r, mount: m ? { mountPoint: m.mountPoint, fsType: m.fsType } : null };
}
/** Pre-flight for `run`: flags and terminal, before the destination is even looked at. */
export function checkInvocation({ dest, approved, interactive }) {
  const r = []; if (!dest) r.push({ code: 'DESTINATION_REQUIRED', detail: 'pass --dest <path on owner-controlled offline storage>' });
  if (!approved) r.push({ code: 'OWNER_APPROVAL_FLAG_REQUIRED', detail: `add ${APPROVAL_FLAG} only if the owner has approved this exact destination` });
  if (!interactive) r.push({ code: 'INTERACTIVE_TERMINAL_REQUIRED', detail: 'the passphrase is typed at the hdiutil prompt; this command cannot run unattended or from an agent' });
  return { ok: r.length === 0, refusals: r };
}

// ---------------------------------------------------------------------------------------------------------------------
// scope sizes without hashing (dry run)
// ---------------------------------------------------------------------------------------------------------------------
export function scopeSizes(repo = REPO) {
  const git = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 29 }), z = (s) => s.split('\0').filter(Boolean), size = (rel) => { try { const st = statSync(resolve(repo, rel)); return st.isFile() ? st.size : 0; } catch { return 0; } };
  const walk = (abs) => { let n = 0, b = 0; if (!existsSync(abs)) return { files: 0, bytes: 0 }; for (const e of readdirSync(abs, { withFileTypes: true })) { const p = resolve(abs, e.name); if (e.isDirectory()) { const s = walk(p); n += s.files; b += s.bytes; } else if (e.isFile()) { n++; b += statSync(p).size; } } return { files: n, bytes: b }; };
  const sum = (rels) => ({ files: rels.length, bytes: rels.reduce((s, f) => s + size(f), 0) }), pack = Number((/size-pack: (\d+)/.exec(git('count-objects', '-v')) ?? [0, 0])[1]) * 1024;
  const tsv = resolve(repo, '.git/custody/protected-identities.tsv'), overlay = existsSync(tsv) ? readFileSync(tsv, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[1]).filter(Boolean) : [];
  const custody = ['.git/info/exclude', ...['pre-commit', 'pre-merge-commit', 'pre-push'].map((h) => `.git/hooks/${h}`), ...(existsSync(resolve(repo, '.git/custody')) ? readdirSync(resolve(repo, '.git/custody')).map((n) => `.git/custody/${n}`) : [])].filter((f) => existsSync(resolve(repo, f)));
  const sections = { gitBundleAllRefs: { refs: git('for-each-ref', '--format=%(refname)').split('\n').filter(Boolean).length, bytes: pack, note: 'pack size; the bundle contains protected source through the custody refs and must be handled as protected' }, custodyControlFiles: sum(custody), protectedOverlay: sum(overlay),
    uncommittedTrackedModifications: sum(z(git('diff', '--name-only', '-z'))), untrackedNotIgnored: sum(z(git('ls-files', '--others', '--exclude-standard', '-z'))), sk1WorkData: walk(resolve(repo, SK1_WORK)) };
  const bytes = Object.values(sections).reduce((s, x) => s + x.bytes, 0);
  return { head: git('rev-parse', 'HEAD').trim(), sections, totalBytes: bytes, requiredFreeBytes: Math.ceil(bytes * 1.25) + (256 << 20), sizing: 'total x 1.25 + 256 MiB head-room; nothing was hashed' };
}
function destinationFacts(dest, repo, requiredBytes) {
  const exists = Boolean(dest) && existsSync(dest); let mounts = []; try { mounts = parseMounts(execFileSync('/sbin/mount', { encoding: 'utf8' })); } catch { mounts = []; }
  if (!exists) return { exists, mounts, repoRoot: repo, requiredBytes };
  const real = realpathSync(dest), fs = statfsSync(real);
  return { exists, realPath: real, device: statSync(real).dev, repoDevice: statSync(repo).dev, repoRoot: realpathSync(repo), mounts, freeBytes: Number(fs.bavail) * Number(fs.bsize), requiredBytes };
}

// ---------------------------------------------------------------------------------------------------------------------
// copy and restore (parameterised so a tiny fixture repository can rehearse them; the CLI always uses the real checks)
// ---------------------------------------------------------------------------------------------------------------------
const copyKeepingMode = (src, dst) => { mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); chmodSync(dst, statSync(src).mode & 0o777); };
/** Write the backup into `target` (an existing, empty directory inside the encrypted container). Returns a summary. */
export function writeBackup({ repo = REPO, target, fileLevelIgnored = [SK1_WORK] }) {
  if (!existsSync(target) || readdirSync(target).length) throw Error('BACKUP_TARGET_MUST_BE_AN_EXISTING_EMPTY_DIRECTORY');
  const manifest = buildManifest({ repo, fileLevelIgnored }), s = manifest.sections, bundle = resolve(target, 'sentinel-grid.bundle');
  execFileSync(GIT, ['-C', repo, 'bundle', 'create', bundle, '--all'], { stdio: ['ignore', 'ignore', 'pipe'] }); execFileSync(GIT, ['-C', repo, 'bundle', 'verify', bundle], { stdio: ['ignore', 'ignore', 'pipe'] });
  const rows = [...s.custodyControlFiles.files, ...s.protectedOverlay.files, ...s.uncommittedTrackedModifications.files, ...s.untrackedNotIgnored.files, ...s.ignoredExperimentDataFileLevel.files].filter((r) => r.sha256 !== null);
  for (const r of rows) copyKeepingMode(resolve(repo, r.path), resolve(target, 'files', r.path));
  const bad = rows.filter((r) => fileSha(resolve(target, 'files', r.path)) !== r.sha256).map((r) => r.path);
  writeFileSync(resolve(target, 'SCOPE_MANIFEST.json'), JSON.stringify(manifest, null, 1) + '\n', { flag: 'wx' });
  writeFileSync(resolve(target, 'README_BACKUP.txt'), ['Sentinel Grid backup. Contains protected source and privileged experiment data.', 'Never upload, never push, never copy into a tracked path.', `Source head: ${s.git.head}`, `Scope sha256: ${manifest.scopeSha256}  (record this somewhere separate from the backup)`, 'Restore and verify with: node infra-audit/backup/backup.mjs restore-verify --backup <this directory> --to <new directory on another device>', 'A restored validation population is spent data and is never fresh.', ''].join('\n'), { flag: 'wx' });
  return { head: s.git.head, scopeSha256: manifest.scopeSha256, bundleBytes: statSync(bundle).size, filesCopied: rows.length, copyMismatches: bad, copyVerified: bad.length === 0, refs: s.git.refs.length,
    notCopied: { otherIgnoredEntries: manifest.summary.otherIgnoredEntries, note: 'listed in the manifest at directory level only; the owner decides which to keep and copies them separately' } };
}
/** Restore a backup directory into a new, empty root and check it against its scope manifest. */
export function restoreBackup({ backupDir, root, sourceRepo = REPO, allowSameDevice = false }) {
  const mf = resolve(backupDir, 'SCOPE_MANIFEST.json'), bundle = resolve(backupDir, 'sentinel-grid.bundle'); if (!existsSync(mf) || !existsSync(bundle)) throw Error('NOT_A_BACKUP_DIRECTORY');
  if (existsSync(root) && readdirSync(root).length) throw Error('RESTORE_ROOT_MUST_BE_NEW_OR_EMPTY'); if (resolve(root) === resolve(sourceRepo) || resolve(root).startsWith(resolve(sourceRepo) + sep)) throw Error('RESTORE_ROOT_INSIDE_SOURCE_REPOSITORY');
  const manifest = JSON.parse(readFileSync(mf, 'utf8')), g = (...a) => execFileSync(GIT, a, { stdio: ['ignore', 'ignore', 'pipe'] });
  g('clone', '-q', bundle, root); g('-C', root, 'fetch', '-q', '--update-head-ok', bundle, '+refs/*:refs/*');
  const files = resolve(backupDir, 'files'), walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(d, e.name)) : [resolve(d, e.name)]));
  for (const src of existsSync(files) ? walk(files) : []) { const dst = resolve(root, relative(files, src)); if (existsSync(dst)) chmodSync(dst, 0o600); copyKeepingMode(src, dst); }
  return { manifest, check: verifyRestore(manifest, root, { allowSameDevice, sourceRepo }) };
}

// ---------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2], arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; }, has = (k) => process.argv.includes(k), out = (o) => console.log(J(o, null, 1)), refuse = (refusals) => { out({ result: 'REFUSED', refusals, nothingWasWritten: true }); process.exitCode = 2; };
  if (cmd === 'plan' || has('--dry-run')) {
    const sizes = scopeSizes(), dest = arg('--dest'), d = dest ? checkDestination(dest, destinationFacts(dest, REPO, sizes.requiredFreeBytes)) : null;
    out({ result: 'DRY_RUN_NOTHING_WRITTEN', head: sizes.head, scope: Object.fromEntries(Object.entries(sizes.sections).map(([k, v]) => [k, { ...v, size: fmt(v.bytes) }])), total: fmt(sizes.totalBytes), requiredFreeSpace: fmt(sizes.requiredFreeBytes), sizing: sizes.sizing,
      destination: dest ? { path: dest, wouldBeAccepted: d.ok, refusals: d.refusals } : 'none given — pass --dest <path> to have it checked',
      steps: ['1. owner mounts approved OFFLINE storage (external drive) and runs: backup.mjs run --dest <path> ' + APPROVAL_FLAG, '2. an AES-256 encrypted sparsebundle is created unless the destination volume is already encrypted; the passphrase is typed at the hdiutil prompt', '3. git bundle of all refs + bundle verify; custody control files, protected overlay, uncommitted, untracked and SK1 work/ files are copied with their modes and re-hashed', '4. SCOPE_MANIFEST.json is written beside the data; its scope sha256 is printed for the owner to record separately', '5. on another device: backup.mjs restore-verify --backup <mounted backup> --to <new directory>', '6. detach the medium; only then may INDEPENDENT_BACKUP_VERIFIED=true be stated'],
      never: ['upload or push anything', 'store the passphrase on this disk or pass it as an argument', 'copy protected files into a tracked path', 'treat a restored validation population as fresh'] });
  } else if (cmd === 'run') {
    const dest = arg('--dest'), inv = checkInvocation({ dest, approved: has(APPROVAL_FLAG), interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) }); if (!inv.ok) refuse(inv.refusals);
    else { const sizes = scopeSizes(), d = checkDestination(dest, destinationFacts(dest, REPO, sizes.requiredFreeBytes)); if (!d.ok) refuse(d.refusals);
      else { const real = realpathSync(dest), stamp = new Date().toISOString().replace(/[:.]/g, '-'), info = spawnSync('/usr/sbin/diskutil', ['info', d.mount?.mountPoint ?? real], { encoding: 'utf8' }).stdout ?? '', encrypted = /(FileVault|Encrypted):\s+Yes/i.test(info);
        let target, image = null, mountPoint = null;
        if (encrypted) { target = resolve(real, `sentinel-grid-backup-${stamp}`); mkdirSync(target); }
        else { image = resolve(real, `sentinel-grid-backup-${stamp}.sparsebundle`); const gb = Math.ceil(sizes.requiredFreeBytes / 2 ** 30) + 1;
          console.error('Creating an AES-256 encrypted sparsebundle. hdiutil will now ask for a passphrase (twice). It is not stored anywhere.');
          const c = spawnSync('/usr/bin/hdiutil', ['create', '-size', `${gb}g`, '-type', 'SPARSEBUNDLE', '-fs', 'APFS', '-encryption', 'AES-256', '-volname', 'SentinelGridBackup', image], { stdio: 'inherit' }); if (c.status !== 0) throw Error('HDIUTIL_CREATE_FAILED');
          console.error('Attaching the encrypted image. hdiutil will ask for the passphrase again.');
          const a = spawnSync('/usr/bin/hdiutil', ['attach', '-nobrowse', '-owners', 'on', image], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }); if (a.status !== 0) throw Error('HDIUTIL_ATTACH_FAILED');
          mountPoint = (/(\/Volumes\/.+)$/m.exec(a.stdout) ?? [])[1]?.trim(); if (!mountPoint) throw Error('MOUNT_POINT_NOT_FOUND'); target = resolve(mountPoint, 'sentinel-grid-backup'); mkdirSync(target); }
        const s = writeBackup({ target }); if (mountPoint) spawnSync('/usr/bin/hdiutil', ['detach', mountPoint], { stdio: 'inherit' });
        out({ result: s.copyVerified ? 'BACKUP_WRITTEN_NOT_YET_VERIFIED_BY_RESTORE' : 'BACKUP_COPY_MISMATCH', container: image ? `AES-256 sparsebundle ${image}` : `encrypted volume directory ${target}`, ...s, next: 'restore on a DIFFERENT device with restore-verify; INDEPENDENT_BACKUP_VERIFIED stays false until that passes and the medium is detached' }); if (!s.copyVerified) process.exitCode = 1; } }
  } else if (cmd === 'restore-verify') {
    const backupDir = arg('--backup'), root = arg('--to'); if (!backupDir || !root) throw Error('USAGE: backup.mjs restore-verify --backup <mounted backup directory> --to <new empty directory> [--owner-attests-medium-detached]');
    const { check } = restoreBackup({ backupDir: resolve(backupDir), root: resolve(root) }), node = process.execPath, ga = resolve(root, 'platform/game-agnostic');
    // condition 2 uses the SK2-F status check, which accepts exactly the drift that committing the import cut causes in the dated SK1.1 inventory
    const inv = check.ok ? spawnSync(node, [resolve(ga, 'stage3h-sk2f-feasibility-v1/infra-audit/status.mjs'), 'verify'], { cwd: ga, encoding: 'utf8', maxBuffer: 1 << 28 }) : null, chk = check.ok ? spawnSync(node, ['infra/run.mjs', 'check'], { cwd: resolve(ga, 'stage3h-sk1-safety-kernel-v1'), encoding: 'utf8', maxBuffer: 1 << 28 }) : null;
    const c = { '1_manifest_restore_on_a_different_device': check.ok && check.label === 'RESTORE_ON_DIFFERENT_DEVICE', '2_reproducibility_status_verify_in_the_restored_copy': Boolean(inv) && /SK2F_REPRO_STATUS_VERIFY_PASS/.test(inv.stdout), '3_sk1_check_in_the_restored_copy': Boolean(chk) && /SK1_CHECK_PASS/.test(chk.stdout), '4_medium_detached_owner_attestation': has('--owner-attests-medium-detached') };
    const all = Object.values(c).every(Boolean);
    out({ result: all ? 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET' : 'ACCEPTANCE_NOT_MET', conditions: c, restore: { label: check.label, filesChecked: check.filesChecked, missing: check.missing.length, mismatched: check.mismatched.length, refsChecked: check.refsChecked, refsWrong: check.refsWrong.length, fsckOk: check.fsckOk },
      note: all ? 'The owner may now record INDEPENDENT_BACKUP_VERIFIED=true, with the date, the medium and the scope sha256. This script records nothing in the repository.' : 'INDEPENDENT_BACKUP_VERIFIED stays false.',
      reminder: 'A restored validation population is spent data and is never fresh.' }); if (!all) process.exitCode = 1;
  } else throw Error('USAGE: backup.mjs plan [--dest <path>] | run --dest <path> ' + APPROVAL_FLAG + ' | restore-verify --backup <dir> --to <dir> [--owner-attests-medium-detached]');
}
