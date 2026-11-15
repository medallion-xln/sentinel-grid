// SENTINEL_BACKUP_ACCEPTANCE_RECORD_V1 — the record an OWNER produces after a backup has been restored on another
// device and verified, so that a campaign-entry gate can check independent recoverability mechanically.
//   node readiness/backup/acceptance-record.mjs compose --restore-output <file> --head <commit> --scope-sha256 <hex> \
//        --medium-label <text> --encryption <AES-256_SPARSEBUNDLE|ENCRYPTED_VOLUME> --attested-by <owner name> [--bundle-manifest <file>] [--out <file>]
//   node readiness/backup/acceptance-record.mjs validate --record <file>
// This module creates no backup, copies nothing and attests nothing. `compose` only assembles a record from the JSON
// that the SK2-F tool `infra-audit/backup/backup.mjs restore-verify` printed; the attestation is the owner's.
// A record made from a same-device rehearsal, or with any of the four acceptance conditions false, does not validate.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const RECORD_SCHEMA = 'SENTINEL_BACKUP_ACCEPTANCE_RECORD_V1';
export const FOUR_CONDITIONS = Object.freeze(['1_manifest_restore_on_a_different_device', '2_reproducibility_status_verify_in_the_restored_copy', '3_sk1_check_in_the_restored_copy', '4_medium_detached_owner_attestation']);
export const ENCRYPTIONS = Object.freeze(['AES-256_SPARSEBUNDLE', 'ENCRYPTED_VOLUME']);
const sha = (b) => createHash('sha256').update(b).digest('hex'), HEX64 = /^[0-9a-f]{64}$/, HEX40 = /^[0-9a-f]{40}$/;
const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));
export const recordSelfHash = (rec) => { const { recordSha256, ...rest } = rec; return sha(stable(rest)); };

export const FIELDS = Object.freeze({
  schema: RECORD_SCHEMA,
  recordedAt: 'ISO-8601 date of the restore verification',
  attestedBy: { role: 'OWNER (a human; never a model or a script)', name: 'the attesting person' },
  source: { head: 'the 40-hex commit that was backed up', scopeSha256: 'the scope sha256 printed by `backup.mjs run`', bundleBytes: 'size of the git bundle in bytes' },
  medium: { class: 'OFFLINE_EXTERNAL', label: 'how the owner identifies the medium', encryption: ENCRYPTIONS.join(' | '), detachedAfterVerification: true },
  restoreVerify: { result: 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET', conditions: Object.fromEntries(FOUR_CONDITIONS.map((c) => [c, true])), restore: { label: 'RESTORE_ON_DIFFERENT_DEVICE', filesChecked: 'integer > 0', missing: 0, mismatched: 0, refsChecked: 'integer > 0', refsWrong: 0, fsckOk: true }, outputSha256: 'sha256 of the exact JSON text printed by restore-verify' },
  evidenceBundle: 'optional { bundleId, manifestSha256 } of the SENTINEL_EVIDENCE_BUNDLE_V1 manifest issued from the same state',
  recordSha256: 'sha256 over the canonical record without this field',
});

/** Assemble a record from the restore-verify output. Pure; attests nothing by itself. */
export function composeRecord({ restoreOutputText, head, scopeSha256, bundleBytes = null, mediumLabel, encryption, attestedBy, recordedAt, evidenceBundle = null }) {
  const out = JSON.parse(restoreOutputText);
  const rec = { schema: RECORD_SCHEMA, recordedAt, attestedBy: { role: 'OWNER', name: attestedBy }, source: { head, scopeSha256, bundleBytes }, medium: { class: 'OFFLINE_EXTERNAL', label: mediumLabel, encryption, detachedAfterVerification: out.conditions?.['4_medium_detached_owner_attestation'] === true },
    restoreVerify: { result: out.result, conditions: out.conditions, restore: out.restore, outputSha256: sha(restoreOutputText) }, evidenceBundle };
  return { ...rec, recordSha256: recordSelfHash(rec) };
}

/** Validate a record. `isAncestor(a, b)` answers whether commit a is an ancestor of (or equal to) commit b; `mustContain`
 *  lists commits the backed-up head has to include (for a campaign: the commit of its frozen protocol). */
export function validateRecord(rec, { isAncestor = null, currentHead = null, mustContain = [] } = {}) {
  const p = [], bad = (m) => p.push(m);
  if (!rec || rec.schema !== RECORD_SCHEMA) return { ok: false, problems: ['RECORD_MISSING_OR_UNKNOWN_SCHEMA'] };
  if (rec.recordSha256 !== recordSelfHash(rec)) bad('RECORD_ALTERED');
  if (typeof rec.recordedAt !== 'string' || Number.isNaN(Date.parse(rec.recordedAt))) bad('RECORDED_AT_INVALID');
  if (rec.attestedBy?.role !== 'OWNER' || typeof rec.attestedBy?.name !== 'string' || rec.attestedBy.name.trim().length < 2) bad('OWNER_ATTESTATION_MISSING');
  if (!HEX40.test(rec.source?.head ?? '')) bad('SOURCE_HEAD_INVALID'); if (!HEX64.test(rec.source?.scopeSha256 ?? '')) bad('SCOPE_SHA256_INVALID');
  if (rec.medium?.class !== 'OFFLINE_EXTERNAL') bad('MEDIUM_NOT_OFFLINE_EXTERNAL'); if (!ENCRYPTIONS.includes(rec.medium?.encryption)) bad('MEDIUM_NOT_ENCRYPTED'); if (rec.medium?.detachedAfterVerification !== true) bad('MEDIUM_NOT_ATTESTED_DETACHED');
  if (typeof rec.medium?.label !== 'string' || !rec.medium.label.trim()) bad('MEDIUM_LABEL_MISSING');
  const rv = rec.restoreVerify ?? {};
  if (rv.result !== 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET') bad('RESTORE_VERIFY_RESULT_NOT_ALL_FOUR');
  for (const c of FOUR_CONDITIONS) if (rv.conditions?.[c] !== true) bad(`ACCEPTANCE_CONDITION_NOT_MET:${c}`);
  if (rv.restore?.label !== 'RESTORE_ON_DIFFERENT_DEVICE') bad('NOT_A_DIFFERENT_DEVICE_RESTORE:' + String(rv.restore?.label ?? 'none'));
  if (!(Number.isInteger(rv.restore?.filesChecked) && rv.restore.filesChecked > 0) || rv.restore?.missing !== 0 || rv.restore?.mismatched !== 0) bad('RESTORED_FILES_DO_NOT_MATCH');
  if (!(Number.isInteger(rv.restore?.refsChecked) && rv.restore.refsChecked > 0) || rv.restore?.refsWrong !== 0 || rv.restore?.fsckOk !== true) bad('RESTORED_REPOSITORY_DOES_NOT_MATCH');
  if (!HEX64.test(rv.outputSha256 ?? '')) bad('RESTORE_OUTPUT_HASH_MISSING');
  if (rec.evidenceBundle !== null && rec.evidenceBundle !== undefined && (!HEX64.test(rec.evidenceBundle.manifestSha256 ?? '') || typeof rec.evidenceBundle.bundleId !== 'string')) bad('EVIDENCE_BUNDLE_REFERENCE_INVALID');
  if (isAncestor && HEX40.test(rec.source?.head ?? '')) {
    if (currentHead && !isAncestor(rec.source.head, currentHead)) bad('BACKED_UP_HEAD_IS_NOT_IN_THE_CURRENT_HISTORY');
    for (const c of mustContain) if (!isAncestor(c, rec.source.head)) bad(`BACKUP_PREDATES_REQUIRED_COMMIT:${String(c).slice(0, 12)}`);
  }
  return { ok: p.length === 0, problems: p };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...rest] = process.argv.slice(2), opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  if (mode === 'compose') {
    const bm = opt('--bundle-manifest'), m = bm ? JSON.parse(readFileSync(bm, 'utf8')) : null;
    const rec = composeRecord({ restoreOutputText: readFileSync(opt('--restore-output'), 'utf8'), head: opt('--head'), scopeSha256: opt('--scope-sha256'), bundleBytes: opt('--bundle-bytes') ? Number(opt('--bundle-bytes')) : null, mediumLabel: opt('--medium-label'), encryption: opt('--encryption'), attestedBy: opt('--attested-by'), recordedAt: opt('--recorded-at') ?? new Date().toISOString(), evidenceBundle: m ? { bundleId: m.bundleId, manifestSha256: m.manifestSha256 } : null });
    const v = validateRecord(rec), text = JSON.stringify(rec, null, 1) + '\n', out = opt('--out');
    if (out && v.ok) { const fd = openSync(resolve(out), 'wx'); writeSync(fd, text); closeSync(fd); } else process.stdout.write(text);
    console.error(JSON.stringify({ valid: v.ok, problems: v.problems, written: out && v.ok ? resolve(out) : null })); if (!v.ok) process.exitCode = 1;
  } else if (mode === 'validate') { const v = validateRecord(JSON.parse(readFileSync(opt('--record'), 'utf8'))); console.log(JSON.stringify(v, null, 1)); console.log(v.ok ? 'BACKUP_ACCEPTANCE_RECORD_VALID' : 'BACKUP_ACCEPTANCE_RECORD_INVALID'); if (!v.ok) process.exitCode = 1; }
  else { console.error('USAGE: acceptance-record.mjs compose ... | validate --record <file>'); process.exit(2); }
}
