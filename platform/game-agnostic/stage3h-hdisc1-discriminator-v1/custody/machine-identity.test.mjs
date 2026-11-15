// D1 repair tests. The frozen acceptance-record validator is used unchanged to show what the gate would accept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlatformUuid, identityHash, currentIdentity, composeSourceRecord, validateSourceRecord, compareMachines, applyMachineCheck, runRestoreVerify, RECORD_PATH } from './machine-identity.mjs';
import { composeRecord, validateRecord } from '../../stage3h-hdisc0-design-v1/readiness/backup/acceptance-record.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const A = '11111111-2222-3333-4444-555555555555', B = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const src = composeSourceRecord({ identitySha256: identityHash(A), recordedAt: '2026-11-14T00:00:00Z', platform: 'darwin-arm64' });
const passing = () => ({ result: 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET', conditions: { '1_manifest_restore_on_a_different_device': true, '2_reproducibility_status_verify_in_the_restored_copy': true, '3_sk1_check_in_the_restored_copy': true, '4_medium_detached_owner_attestation': true },
  restore: { label: 'RESTORE_ON_DIFFERENT_DEVICE', filesChecked: 3, missing: 0, mismatched: 0, refsChecked: 2, refsWrong: 0, fsckOk: true } });
const gateView = (out) => validateRecord(composeRecord({ restoreOutputText: JSON.stringify(out), head: 'a'.repeat(40), scopeSha256: 'b'.repeat(64), mediumLabel: 'TEST', encryption: 'AES-256_SPARSEBUNDLE', attestedBy: 'TEST OWNER', recordedAt: '2026-11-14T00:00:00Z' }));

test('ioreg parsing: accepts the UUID line, normalises case, rejects anything else', () => {
  assert.equal(parsePlatformUuid(`  | "IOPlatformSerialNumber" = "X"\n  | "IOPlatformUUID" = "${A.toLowerCase()}"\n`), A);
  for (const bad of ['', null, '"IOPlatformUUID" = "not-a-uuid"', '"IOPlatformUUID" = ""']) assert.equal(parsePlatformUuid(bad), null);
});

test('identity hash is one-way, deterministic, case-insensitive, distinct per machine, and never contains the UUID', () => {
  assert.match(identityHash(A), /^[0-9a-f]{64}$/); assert.equal(identityHash(A), identityHash(A.toLowerCase())); assert.notEqual(identityHash(A), identityHash(B));
  assert.ok(!identityHash(A).includes(A.replace(/-/g, '').toLowerCase())); assert.throws(() => identityHash('x'), /PLATFORM_UUID_INVALID/);
  assert.ok(!JSON.stringify(src).includes(A) && !JSON.stringify(src).toLowerCase().includes(A.toLowerCase()));
});

test('source record validates, and any alteration or wrong schema is refused', () => {
  assert.deepEqual(validateSourceRecord(src), { ok: true, problems: [] });
  assert.ok(validateSourceRecord({ ...src, identitySha256: identityHash(B) }).problems.includes('SOURCE_RECORD_ALTERED'));
  assert.equal(validateSourceRecord({ ...src, schema: 'X' }).ok, false); assert.equal(validateSourceRecord(null).ok, false);
});

test('machine comparison fails closed: same machine, unknown machine and missing record are all refused', () => {
  assert.equal(compareMachines({ sourceRecord: src, current: identityHash(B) }).label, 'DIFFERENT_MACHINE');
  assert.equal(compareMachines({ sourceRecord: src, current: identityHash(A) }).label, 'SAME_MACHINE_AS_SOURCE');
  assert.equal(compareMachines({ sourceRecord: src, current: null }).label, 'MACHINE_IDENTITY_UNAVAILABLE');
  assert.equal(compareMachines({ sourceRecord: null, current: identityHash(B) }).label, 'SOURCE_MACHINE_RECORD_MISSING_OR_INVALID');
  for (const c of [identityHash(A), null]) assert.equal(compareMachines({ sourceRecord: src, current: c }).ok, false);
});

test('D1: a same-Mac restore that the device-id test labelled RESTORE_ON_DIFFERENT_DEVICE is rejected, and the frozen validator refuses it', () => {
  assert.equal(gateView(passing()).ok, true, 'control: the unwrapped output is accepted by the frozen validator, which is the defect');
  const o = applyMachineCheck(passing(), compareMachines({ sourceRecord: src, current: identityHash(A) }));
  assert.equal(o.result, 'ACCEPTANCE_NOT_MET'); assert.equal(o.conditions['1_manifest_restore_on_a_different_device'], false); assert.equal(o.restore.label, 'REJECTED_SAME_MACHINE_AS_SOURCE');
  const v = gateView(o); assert.equal(v.ok, false); assert.ok(v.problems.includes('ACCEPTANCE_CONDITION_NOT_MET:1_manifest_restore_on_a_different_device')); assert.ok(v.problems.some((p) => p.startsWith('NOT_A_DIFFERENT_DEVICE_RESTORE')));
});

test('a genuine different-machine restore is left passing and still validates', () => {
  const o = applyMachineCheck(passing(), compareMachines({ sourceRecord: src, current: identityHash(B) }));
  assert.equal(o.result, 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET'); assert.equal(o.restore.label, 'RESTORE_ON_DIFFERENT_DEVICE'); assert.equal(o.machineCheck.label, 'DIFFERENT_MACHINE'); assert.equal(gateView(o).ok, true);
});

test('the machine check can never turn a failing restore into a passing one', () => {
  const ok = compareMachines({ sourceRecord: src, current: identityHash(B) });
  for (const k of Object.keys(passing().conditions)) { const f = passing(); f.conditions[k] = false; f.result = 'ACCEPTANCE_NOT_MET'; assert.equal(applyMachineCheck(f, ok).result, 'ACCEPTANCE_NOT_MET'); }
  const relabelled = passing(); relabelled.restore.label = 'REHEARSAL_ONLY_SAME_DEVICE'; assert.equal(gateView(applyMachineCheck(relabelled, ok)).ok, false);
  assert.equal(applyMachineCheck({}, ok).result, 'ACCEPTANCE_NOT_MET');
});

test('wrapper: reads the record from the restored history and fails closed on unreadable tool output', () => {
  const spawnOk = () => ({ status: 0, stdout: 'noise\n' + JSON.stringify(passing(), null, 1) + '\n', stderr: '' });
  assert.equal(runRestoreVerify({ backup: '/b', to: '/r', spawn: spawnOk, readRecord: () => src, current: () => identityHash(B) }).result, 'ALL_FOUR_ACCEPTANCE_CONDITIONS_MET');
  assert.equal(runRestoreVerify({ backup: '/b', to: '/r', spawn: spawnOk, readRecord: () => src, current: () => identityHash(A) }).machineCheck.label, 'SAME_MACHINE_AS_SOURCE');
  assert.equal(runRestoreVerify({ backup: '/b', to: '/r', spawn: spawnOk, readRecord: () => null, current: () => identityHash(B) }).result, 'ACCEPTANCE_NOT_MET');
  const broken = runRestoreVerify({ backup: '/b', to: '/r', spawn: () => ({ status: 1, stdout: '', stderr: 'Error: NOT_A_BACKUP_DIRECTORY' }), readRecord: () => src, current: () => identityHash(B) });
  assert.equal(broken.result, 'ACCEPTANCE_NOT_MET'); assert.equal(broken.error, 'RESTORE_TOOL_OUTPUT_UNREADABLE');
  let args; runRestoreVerify({ backup: '/b', to: '/r', attestDetached: true, spawn: (a) => { args = a; return spawnOk(); }, readRecord: () => src, current: () => identityHash(B) });
  assert.deepEqual(args, ['--backup', '/b', '--to', '/r', '--owner-attests-medium-detached']);
  assert.throws(() => runRestoreVerify({ backup: null, to: '/r' }), /USAGE/);
});

test('INTEGRATION the committed source-machine record validates and this machine yields an identity', { skip: process.platform !== 'darwin' }, () => {
  const p = resolve(REPO, RECORD_PATH); assert.ok(existsSync(p), 'source record present');
  assert.deepEqual(validateSourceRecord(JSON.parse(readFileSync(p, 'utf8'))), { ok: true, problems: [] });
  assert.match(currentIdentity() ?? '', /^[0-9a-f]{64}$/);
});
