// D1 repair: an independent restore must run on a different MACHINE, not only on a different filesystem.
//
// The restore tool (stage3h-sk1-1-assurance-v1/repro/backup-manifest.mjs, verifyRestore) labels a restore
// RESTORE_ON_DIFFERENT_DEVICE whenever the restored root's st_dev differs from the repository's. Every mounted volume has
// its own st_dev, so a restore into a disk image mounted on the SAME Mac passes that test. That file, and backup.mjs which
// calls it, are pinned by hash in the SK1.1 and SK2-F source manifests, so they are not edited. This module adds the
// missing check as a separate layer:
//   node custody/machine-identity.mjs record --out <file>
//        Writes this machine's SENTINEL_SOURCE_MACHINE_IDENTITY_V1 record (exclusive create). Commit it BEFORE the backup
//        is taken, so the record is inside the backed-up history.
//   node custody/machine-identity.mjs restore-verify --backup <dir> --to <new empty dir> [--owner-attests-medium-detached]
//        Runs the existing `backup.mjs restore-verify` unchanged, reads the source record from the RESTORED history
//        (HEAD of the restored repository), and refuses acceptance condition 1 when the restoring machine is the source
//        machine, or when either identity cannot be established. It never turns a failing result into a passing one.
//   node custody/machine-identity.mjs self
//        Prints this machine's identity hash only.
// The record holds a one-way, domain-separated sha256 of the macOS IOPlatformUUID. The UUID itself is never stored,
// printed or written. Nothing here uploads, pushes or transmits anything.
//
// Limit, stated plainly: the frozen acceptance-record validator only reads the four conditions and the restore label, so
// the campaign gate cannot tell whether this wrapper or the bare backup.mjs produced the output. Using the wrapper is a
// procedure requirement until a prospective amendment makes the gate demand `machineCheck` (draft C1, section 5).
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '../..'), REPO = resolve(GA, '../..');
export const SCHEMA = 'SENTINEL_SOURCE_MACHINE_IDENTITY_V1', DOMAIN = 'SENTINEL_GRID_MACHINE_IDENTITY_V1';
export const RECORD_PATH = 'platform/game-agnostic/stage3h-hdisc1-discriminator-v1/custody/SOURCE_MACHINE_IDENTITY.json';
export const BACKUP_TOOL = resolve(GA, 'stage3h-sk2f-feasibility-v1/infra-audit/backup/backup.mjs');
const CONDITION_1 = '1_manifest_restore_on_a_different_device', HEX64 = /^[0-9a-f]{64}$/, UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));

/** Parse `ioreg -rd1 -c IOPlatformExpertDevice` output. Returns the upper-case UUID or null. Pure. */
export function parsePlatformUuid(text) { const m = /"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]{36})"/.exec(String(text ?? '')); const u = m ? m[1].toUpperCase() : null; return u && UUID.test(u) ? u : null; }
/** One-way, domain-separated identity hash. Pure. */
export function identityHash(uuid) { const u = String(uuid ?? '').toUpperCase(); if (!UUID.test(u)) throw Error('PLATFORM_UUID_INVALID'); return sha(`${DOMAIN}|${u}`); }
/** This machine's identity hash, or null when it cannot be established (fail closed). */
export function currentIdentity() {
  if (process.platform !== 'darwin') return null;
  try { const u = parsePlatformUuid(execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); return u ? identityHash(u) : null; } catch { return null; }
}

export function composeSourceRecord({ identitySha256, recordedAt, platform }) {
  const rest = { schema: SCHEMA, domain: DOMAIN, identitySha256, platform, recordedAt, role: 'SOURCE_MACHINE_OF_THE_BACKED_UP_REPOSITORY',
    disclosure: 'One-way, domain-separated sha256 of the macOS IOPlatformUUID. The UUID itself is not stored.',
    use: 'custody/machine-identity.mjs restore-verify refuses acceptance condition 1 when the restoring machine hashes to this value.' };
  return { ...rest, recordSha256: sha(stable(rest)) };
}
export function validateSourceRecord(rec) {
  const p = [];
  if (!rec || rec.schema !== SCHEMA) return { ok: false, problems: ['SOURCE_RECORD_MISSING_OR_UNKNOWN_SCHEMA'] };
  const { recordSha256, ...rest } = rec; if (recordSha256 !== sha(stable(rest))) p.push('SOURCE_RECORD_ALTERED');
  if (rec.domain !== DOMAIN) p.push('SOURCE_RECORD_WRONG_DOMAIN'); if (!HEX64.test(rec.identitySha256 ?? '')) p.push('SOURCE_IDENTITY_INVALID');
  if (typeof rec.recordedAt !== 'string' || Number.isNaN(Date.parse(rec.recordedAt))) p.push('RECORDED_AT_INVALID');
  return { ok: p.length === 0, problems: p };
}

/** Compare the restoring machine with the source record. Pure. */
export function compareMachines({ sourceRecord, current }) {
  const v = validateSourceRecord(sourceRecord);
  if (!v.ok) return { ok: false, label: 'SOURCE_MACHINE_RECORD_MISSING_OR_INVALID', problems: v.problems };
  if (!HEX64.test(current ?? '')) return { ok: false, label: 'MACHINE_IDENTITY_UNAVAILABLE', problems: ['CURRENT_IDENTITY_NOT_ESTABLISHED'] };
  if (current === sourceRecord.identitySha256) return { ok: false, label: 'SAME_MACHINE_AS_SOURCE', problems: ['RESTORE_RAN_ON_THE_SOURCE_MACHINE'] };
  return { ok: true, label: 'DIFFERENT_MACHINE', problems: [] };
}

/** Apply the machine check to a `backup.mjs restore-verify` output object. Pure. Can only remove a pass, never add one. */
export function applyMachineCheck(output, machine) {
  const o = structuredClone(output ?? {}); o.conditions = { ...(o.conditions ?? {}) }; o.restore = { ...(o.restore ?? {}) };
  o.machineCheck = { label: machine.label, ok: machine.ok === true, problems: machine.problems ?? [], tool: 'stage3h-hdisc1-discriminator-v1/custody/machine-identity.mjs' };
  if (machine.ok !== true) {
    o.conditions[CONDITION_1] = false;
    if (o.restore.label === 'RESTORE_ON_DIFFERENT_DEVICE') o.restore.label = `REJECTED_${machine.label}`;
  }
  const all = Object.keys(o.conditions).length > 0 && Object.values(o.conditions).every((x) => x === true);
  o.result = all && output?.result === 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET' ? 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET' : 'ACCEPTANCE_NOT_MET';
  if (o.result !== 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET') o.note = 'INDEPENDENT_BACKUP_VERIFIED stays false.';
  return o;
}

const readRestoredRecord = (root) => { try { return JSON.parse(execFileSync('/usr/bin/git', ['-C', root, 'show', `HEAD:${RECORD_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return null; } };
const spawnBackupTool = (args) => { const r = spawnSync(process.execPath, [BACKUP_TOOL, 'restore-verify', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 }); return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }; };

/** Run the unchanged restore-verify, then the machine check. Dependencies are injectable for tests. */
export function runRestoreVerify({ backup, to, attestDetached = false, spawn = spawnBackupTool, readRecord = readRestoredRecord, current = currentIdentity }) {
  if (!backup || !to) throw Error('USAGE: machine-identity.mjs restore-verify --backup <dir> --to <new empty dir> [--owner-attests-medium-detached]');
  const r = spawn(['--backup', resolve(backup), '--to', resolve(to), ...(attestDetached ? ['--owner-attests-medium-detached'] : [])]);
  let base; try { const t = r.stdout; base = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { base = { result: 'ACCEPTANCE_NOT_MET', conditions: { [CONDITION_1]: false }, restore: {}, error: 'RESTORE_TOOL_OUTPUT_UNREADABLE', toolError: (/^\w*Error: .*$/m.exec(r.stderr) ?? [null])[0], exitStatus: r.status }; }
  return applyMachineCheck(base, compareMachines({ sourceRecord: readRecord(resolve(to)), current: current() }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2), opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  if (cmd === 'self') { const id = currentIdentity(); console.log(JSON.stringify({ identitySha256: id, established: Boolean(id) })); if (!id) process.exitCode = 1; }
  else if (cmd === 'record') {
    const out = opt('--out'), id = currentIdentity(); if (!out) throw Error('USAGE: record --out <file>'); if (!id) { console.error('MACHINE_IDENTITY_UNAVAILABLE'); process.exit(1); }
    const rec = composeSourceRecord({ identitySha256: id, recordedAt: new Date().toISOString(), platform: `${process.platform}-${process.arch}` });
    const fd = openSync(resolve(out), 'wx'); writeSync(fd, JSON.stringify(rec, null, 1) + '\n'); closeSync(fd); console.log(JSON.stringify({ written: relative(REPO, resolve(out)), identitySha256: id }));
  } else if (cmd === 'restore-verify') {
    const o = runRestoreVerify({ backup: opt('--backup'), to: opt('--to'), attestDetached: rest.includes('--owner-attests-medium-detached') });
    console.log(JSON.stringify(o, null, 1)); if (o.result !== 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET') process.exitCode = 1;
  } else { console.error('USAGE: machine-identity.mjs self | record --out <file> | restore-verify --backup <dir> --to <dir> [--owner-attests-medium-detached]'); process.exit(2); }
}
