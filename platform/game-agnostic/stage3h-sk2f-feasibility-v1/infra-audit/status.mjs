// STAGE 3H-SK2-F Gate 5 — reproducibility and custody status (READ-ONLY; authority R0).
//   node infra-audit/status.mjs            recompute and print
//   node infra-audit/status.mjs --write    create evidence/SK2F_REPRO_STATUS.json (exclusive)
//   node infra-audit/status.mjs verify     recompute, compare the state-independent core with the stored record, writes nothing
//
// Correct BEFORE and AFTER the import cut is committed. `core` holds facts that the commit does not change (identities of
// protected files, local data, exclusion records, loader dependencies). `current` holds what the commit does change:
// the state of the cut and the drift of the dated SK1.1 inventory. After the commit that inventory reports drift on
// exactly one file's classification and on the class counts derived from it; those rows are labelled
// EXPECTED_AFTER_IMPORT_CUT_COMMIT here and the SK1.1 record itself is not edited.
// It reuses the SK1.1 repro tooling by import, generates no world, reads no truth, and never stages or commits.
import { readFileSync, existsSync, readdirSync, openSync, writeSync, closeSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { GIT, GA, REPO, SK1_LANE, INVENTORY_FILE, sha, fileSha, readJ, posix, traceClosure, gitFacts, protectedIdentities, classify, CLASS, stable, deepDiff } from '../../stage3h-sk1-1-assurance-v1/repro/lib.mjs';
import { buildCore as inventoryCore, exerciseExclusions, verifyAgainst } from '../../stage3h-sk1-1-assurance-v1/repro/inventory.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..');
export const STATUS_FILE = resolve(LANE, 'evidence/SK2F_REPRO_STATUS.json'), SCHEMA = 'SK2F_REPRO_STATUS_V1';
const PP_REL = 'platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs', PP = resolve(REPO, PP_REL), PP_GA = 'stage3h-hw1-dev-v1/public-projection.mjs';
const OLD_SHA = '2d1e70611b26005179cc50e21a9d6ec5eae59704d7db36e722bb28b53eacb9ca', CUT_SHA = 'c4f9532e0771e025513122052128b0d14185e4abcde3ace9de9de5d77db6c099';
const J = JSON.stringify, ga = (rel) => rel.replace(/^platform\/game-agnostic\//, ''), git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 29 });

/** Is this drift row of the SK1.1 inventory exactly what committing the import cut produces? (pure; tested with negative controls) */
export function isExpectedDriftRow(row) {
  if (row === `$.codeClosure.files[${PP_GA}].class: "TRACKED_MODIFIED" -> "TRACKED_EQUALS_HEAD"`) return true;
  if (row === `$.codeClosure.files[${PP_GA}].headSha256: REMOVED`) return true;
  const m = /^\$\.(?:codeClosure\.(?:byClass|byGroupAndClass\.\w+|perEvaluationEntry\[\d+\]\.byClass)|sourceIdentities\.\w+\.byClass)\.(TRACKED_MODIFIED|TRACKED_EQUALS_HEAD): (.+)$/.exec(row); if (!m) return false;
  if (m[1] === 'TRACKED_MODIFIED') return m[2] === 'REMOVED';
  const n = /^(\d+) -> (\d+)$/.exec(m[2]); return Boolean(n) && Number(n[2]) === Number(n[1]) + 1;
}
/** Classify the drift of the dated SK1.1 inventory for the current state of the cut. */
export function classifyDrift(drift, failedChecks, state) {
  const expected = drift.filter(isExpectedDriftRow), unexpected = drift.filter((r) => !isExpectedDriftRow(r)), removed = expected.filter((r) => /TRACKED_MODIFIED: REMOVED$/.test(r)).length, plus = expected.filter((r) => /TRACKED_EQUALS_HEAD: \d+ -> \d+$/.test(r)).length;
  if (state === 'CUT_UNCOMMITTED') return { ok: drift.length === 0 && failedChecks.length === 0, label: drift.length === 0 ? 'NO_DRIFT' : 'UNEXPECTED_DRIFT_BEFORE_COMMIT', expectedRows: 0, unexpectedRows: drift, failedChecks };
  const consistent = unexpected.length === 0 && failedChecks.length === 0 && expected.length > 0 && removed === plus && expected.includes(`$.codeClosure.files[${PP_GA}].class: "TRACKED_MODIFIED" -> "TRACKED_EQUALS_HEAD"`);
  return { ok: consistent, label: consistent ? 'EXPECTED_AFTER_IMPORT_CUT_COMMIT' : 'UNEXPECTED_DRIFT', expectedRows: expected.length, unexpectedRows: unexpected, failedChecks, meaning: 'the dated SK1.1 inventory (base 179922dd) classified one file TRACKED_MODIFIED; it is now TRACKED_EQUALS_HEAD with the same sha256, and every class count derived from it moved by one' };
}
/** Import chain from an entry to a target inside a traceClosure result. */
const chainTo = (closure, target) => { const out = [target]; let cur = target, guard = 0; while (closure.get(cur)?.importedBy.length && guard++ < 50) { cur = closure.get(cur).importedBy[0]; out.unshift(cur); } return out.map((p) => ga(posix(relative(REPO, p)))); };

function cutState() {
  const headSha = sha(execFileSync(GIT, ['-C', REPO, 'show', `HEAD:${PP_REL}`], { maxBuffer: 1 << 28 })), workSha = fileSha(PP), state = headSha === OLD_SHA && workSha === CUT_SHA ? 'CUT_UNCOMMITTED' : headSha === CUT_SHA && workSha === CUT_SHA ? 'CUT_COMMITTED' : 'UNEXPECTED';
  return { state, head: git('rev-parse', 'HEAD').trim(), headBlobSha256: headSha, workingTreeSha256: workSha, committedIn: state === 'CUT_COMMITTED' ? git('log', '-1', '--format=%H', '--', PP_REL).trim() : null };
}
function backupFacts() {
  const vols = existsSync('/Volumes') ? readdirSync('/Volumes').filter((n) => { try { return statSync(resolve('/Volumes', n)).dev !== statSync('/').dev; } catch { return false; } }) : [], tm = spawnSync('/usr/bin/tmutil', ['destinationinfo'], { encoding: 'utf8' });
  return { externalVolumesMounted: vols.length, timeMachine: /No destinations configured/i.test(`${tm.stdout}${tm.stderr}`) ? 'NO_DESTINATION_CONFIGURED' : tm.status === 0 ? 'A_DESTINATION_IS_CONFIGURED (not used or verified by this stage)' : 'UNKNOWN', aheadOfOrigin: (() => { try { return Number(execFileSync(GIT, ['-C', REPO, 'rev-list', '--count', 'origin/main..HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { return null; } })(), remotePushAuthorized: false, independentBackupVerified: false };
}

export async function build() {
  const inv = await inventoryCore(), excl = await exerciseExclusions(), st = cutState(), stored = existsSync(INVENTORY_FILE) ? readJ(INVENTORY_FILE) : null;
  if (st.state === 'UNEXPECTED') throw Error('UNEXPECTED_FILE_STATE');
  const F = { ...gitFacts(), protectedMap: new Map((protectedIdentities() ?? []).map((r) => [r.path, r.sha256])) };
  // ---- 1. protected source in the evaluation closure
  const prot = inv.codeClosure.files.filter((f) => f.class === CLASS.PROT).map((f) => ({ file: f.file, sha256: f.sha256, groups: f.groups }));
  // ---- 4. what the two exclusion loaders reach, with either revision of the projection file
  const oldRev = git('rev-list', 'HEAD', '--', PP_REL).split('\n').filter(Boolean).find((c) => sha(execFileSync(GIT, ['-C', REPO, 'show', `${c}:${PP_REL}`], { maxBuffer: 1 << 28 })) === OLD_SHA), oldSrc = execFileSync(GIT, ['-C', REPO, 'show', `${oldRev}:${PP_REL}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const loader = (rel) => { const entry = resolve(SK1_LANE, rel), rowsWith = (read) => { const c = traceClosure([entry], { read }); return { c, rows: [...c].map(([abs, n]) => ({ abs, file: ga(posix(relative(REPO, abs))), ...classify(posix(relative(REPO, abs)), n.sha256, F) })) }; };
    const cut = rowsWith((p) => readFileSync(p, 'utf8')), old = rowsWith((p) => (p === PP ? oldSrc : readFileSync(p, 'utf8'))), protCut = cut.rows.filter((r) => r.class === CLASS.PROT), protOld = old.rows.filter((r) => r.class === CLASS.PROT), first = protCut[0] ?? null;
    return { loader: `stage3h-sk1-safety-kernel-v1/${rel}`, closureFiles: cut.rows.length, custodyProtectedFilesReached: protCut.map((r) => r.file).sort(), shortestRecordedChainToProtectedSource: first ? chainTo(cut.c, first.abs) : null, reachesTheProjectionFile: cut.rows.some((r) => r.file === PP_GA),
      protectedFilesReachedWithTheOldRevision: protOld.length, protectedFilesReachedWithTheCut: protCut.length, importCutChangesLoadability: protCut.length === 0 && protOld.length > 0, linkableFromCommittedSourceAlone: protCut.length === 0 && cut.rows.every((r) => r.class === CLASS.EQ || r.file === PP_GA) }; };
  const loaders = [loader('infra/exclusions.mjs'), loader('successor/exclusions-v2.mjs')];
  // ---- 3. local data the check mode needs
  const need = inv.localData.files.filter((f) => /^work\/(manifests|classes\/VALIDATION|audit)\//.test(f.path)).map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 }));
  const core = {
    limitation1_protectedSource: { filesInEvaluationClosure: prot.length, protectedIdentities: inv.custody.protectedIdentities, listSha256: sha(prot.map((p) => `${p.file}:${p.sha256}`).join('\n')), byLane: prot.reduce((o, p) => { const k = p.file.split('/')[0]; o[k] = (o[k] ?? 0) + 1; return o; }, {}), files: prot.map((p) => ({ file: p.file, sha256: p.sha256 })) },
    limitation2_importCut: { file: PP_GA, oldSha256: OLD_SHA, cutSha256: CUT_SHA, workingTreeHoldsTheCut: st.workingTreeSha256 === CUT_SHA, sk1FreezeBinds: readJ(resolve(SK1_LANE, 'evidence/SK1_EXPERIMENT_FREEZE.json')).evaluationDependencies[PP_GA] },
    limitation3_localData: { filesNeededByCheckMode: need.length, bytes: need.reduce((s, f) => s + f.size, 0), groups: need.reduce((o, f) => { const k = f.path.split('/').slice(1, f.path.startsWith('work/classes/') ? 3 : 2).join('/'); o[k] = (o[k] ?? 0) + 1; return o; }, {}), listSha256: sha(need.map((f) => `${f.path}:${f.sha256}`).join('\n')), gitignored: inv.localData.gitignored, allLocalFiles: inv.localData.fileCount, allLocalBytes: inv.localData.bytes, files: need },
    limitation4_exclusionLoaders: { loaders, note: 'Both loaders import the strict-index tooling, which reaches custody-protected source. The dependency does not pass through the import cut, so committing the cut does not make them importable from a clean checkout.' },
    exclusionCustody: { registryFile: inv.exclusions.registry.file, registrySha256: inv.exclusions.registry.sha256, registryDeclaredHashVerifies: inv.exclusions.registry.declaredHashVerifies, failClosed: inv.exclusions.registry.failClosed, forbiddenBlocksInRegistry: inv.exclusions.registry.forbiddenBlocks, forbiddenBlocksInTrackedRecords: inv.exclusions.trackedRecordsAlone.forbiddenBlocks,
      blocks901to914Listed: inv.exclusions.trackedRecordsAlone.blocks901to914Listed, blocks801to837Listed: inv.exclusions.trackedRecordsAlone.blocks801to837Listed, sealedRegistries: inv.exclusions.sealedRegistries.map((r) => ({ name: r.name, count: r.count, sha256: r.sha256, matchesRecorded: r.matchesRecorded })), sk1Registries: inv.exclusions.successor.registries.map((r) => ({ file: r.file, sha256: r.sha256, matchesRecorded: r.matchesRecorded })),
      loadersInThisWorkingTree: excl },
    custody: { protectedIdentities: inv.custody.protectedIdentities, present: inv.custody.present, matchingRecordedIdentity: inv.custody.matchingRecordedIdentity, trackedAtHead: inv.custody.trackedAtHead, guardManifestIntact: inv.custody.guardManifestIntact, controlFilesLiveInsideDotGit: true },
    sk1Freeze: { describesTheDisk: inv.freezeBinding.allOk, checks: inv.freezeBinding.checks.map((c) => `${c.name}:${c.ok ? 'ok' : 'DRIFT'}`), resultSha256: inv.freezeBinding.resultSha256, classification: inv.freezeBinding.classification },
    sk11Inventory: { file: 'stage3h-sk1-1-assurance-v1/evidence/SK1_1_REPRO_INVENTORY.json', sha256: stored ? fileSha(INVENTORY_FILE) : null, generatedAtHead: stored?.repoHead ?? null, recordedClassOfTheProjectionFile: stored?.core.codeClosure.files.find((f) => f.file === PP_GA)?.class ?? null },
  };
  const v = stored ? verifyAgainst(stored, inv, excl) : { ok: false, drift: ['inventory missing'], failedChecks: [] }, drift = classifyDrift(v.drift, v.failedChecks, st.state), committed = st.state === 'CUT_COMMITTED', backup = backupFacts();
  const custodyOk = core.custody.matchingRecordedIdentity === core.custody.protectedIdentities && core.custody.trackedAtHead === 0 && core.custody.guardManifestIntact;
  const exclOk = excl.loadable === true && excl.blocks901to914Rejected === 14 && excl.blocks801to837RejectedBySuccessor === 37 && core.exclusionCustody.registryDeclaredHashVerifies && core.exclusionCustody.sealedRegistries.every((r) => r.matchesRecorded) && core.exclusionCustody.sk1Registries.every((r) => r.matchesRecorded);
  const current = { importCut: st, sk11InventoryDrift: { rows: v.drift.length, ...drift }, backup,
    limitations: [
      { id: 'L1', limitation: '29 custody-protected source files are in no commit', status: `OPEN (${core.limitation1_protectedSource.filesInEvaluationClosure} in the evaluation closure; all match their recorded identity: ${custodyOk})`, closedBy: 'a custody decision on how a second machine lawfully obtains the overlay; not by any commit', who: 'owner', affectedByTheImportCut: false },
      { id: 'L2', limitation: 'the SK1 and H-W4 freezes bind a revision of public-projection.mjs that was uncommitted', status: committed ? `CLOSED PROSPECTIVELY (committed in ${st.committedIn.slice(0, 8)}; content unchanged, sha256 ${CUT_SHA.slice(0, 8)}…)` : 'OPEN (the cut exists only in this working tree)', closedBy: 'the scoped local commit of the cut', who: 'owner-authorized; parent commits', affectedByTheImportCut: true },
      { id: 'L3', limitation: `${core.limitation3_localData.filesNeededByCheckMode} gitignored data files are needed to re-check SK1`, status: 'OPEN (present, hash-recorded, local only)', closedBy: 'not closable in git: privileged data stays local; a verified backup makes it recoverable', who: 'owner (backup)', affectedByTheImportCut: false },
      { id: 'L4', limitation: 'the exclusion loaders depend on custody-protected source', status: `OPEN (enforced in this working tree: ${exclOk}; not importable from a clean checkout)`, closedBy: 'a prospective, separately authorized refactor that lets the loaders read the tracked registries without the strict-index tooling, or L1', who: 'owner decision', affectedByTheImportCut: false },
      { id: 'L5', limitation: 'no independently verified restorable backup', status: 'OPEN (no external volume, no Time Machine destination; nothing was copied)', closedBy: 'infra-audit/backup/backup.mjs run on owner-approved offline storage, then restore-verify on a different device', who: 'owner', affectedByTheImportCut: false },
    ],
    verdicts: { IMPORT_CUT_COMMITTED: committed, CLEAN_CHECKOUT_INFERENCE_REPRODUCIBLE: true, CLEAN_CHECKOUT_EVALUATION_REPRODUCIBLE: false, EVALUATION_SUPPLEMENTS_STILL_REQUIRED: committed ? ['29 custody-protected source files', `${core.limitation3_localData.filesNeededByCheckMode} gitignored data files`] : ['29 custody-protected source files', 'the uncommitted import cut', `${core.limitation3_localData.filesNeededByCheckMode} gitignored data files`],
      EXCLUSION_REGISTRY_ENFORCED_IN_WORKING_TREE: exclOk, EXCLUSION_LOADERS_IMPORTABLE_FROM_CLEAN_CHECKOUT: loaders.every((l) => l.linkableFromCommittedSourceAlone), SOURCE_CUSTODY_PASS: custodyOk, SK1_FROZEN_EXPERIMENT_UNCHANGED_ON_DISK: core.sk1Freeze.describesTheDisk, INDEPENDENT_BACKUP_VERIFIED: false,
      CAN_RUN_LOCALLY_WITH_TRUSTWORTHY_PROVENANCE: custodyOk && exclOk && core.sk1Freeze.describesTheDisk, INDEPENDENTLY_REPRODUCIBLE: false, RECOVERABLE_AFTER_DISK_LOSS: false,
      INFRASTRUCTURE_READY_FOR_AN_INDEPENDENT_SCIENTIFIC_CAMPAIGN: 'NOT_READY', blockingItems: ['L5 no verified backup: one disk failure destroys the protected source, the local data and 60+ unpushed commits', 'L1 protected source: no second machine can re-check a result', 'L4 exclusion loaders cannot be exercised from committed source', ...(committed ? [] : ['L2 the cut is uncommitted: a new freeze would again bind a file that is in no commit'])] } };
  return { core, current, ok: custodyOk && exclOk && core.sk1Freeze.describesTheDisk && drift.ok };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] === 'verify' ? 'verify' : process.argv.includes('--write') ? 'write' : 'print', { core, current, ok } = await build();
  const summary = { importCut: current.importCut.state, sk11InventoryDrift: `${current.sk11InventoryDrift.label} (${current.sk11InventoryDrift.rows} rows, ${current.sk11InventoryDrift.unexpectedRows.length} unexpected)`, limitations: current.limitations.map((l) => `${l.id}: ${l.status}`), verdicts: current.verdicts };
  if (mode === 'verify') {
    const stored = existsSync(STATUS_FILE) ? readJ(STATUS_FILE) : null, drift = stored?.schema === SCHEMA ? deepDiff(stored.core, core) : ['$: status record missing or wrong schema'], pass = ok && drift.length === 0;
    console.log(J({ mode, wroteAnything: false, recordedAt: stored ? { head: stored.current.importCut.head, state: stored.current.importCut.state } : null, now: { head: current.importCut.head, state: current.importCut.state }, coreDrift: drift, ...summary, result: pass ? 'SK2F_REPRO_STATUS_VERIFY_PASS' : 'SK2F_REPRO_STATUS_VERIFY_FAILED' }, null, 1)); if (!pass) process.exitCode = 1;
  } else {
    console.log(J({ mode, ...summary }, null, 1));
    if (mode === 'write') { const rec = { schema: SCHEMA, authority: 'R0', stage: 'STAGE3H-SK2-F Gate 5', generatedAt: new Date().toISOString(), node: process.version, disclosure: 'Identities only: paths, sizes, sha256, counts. No seed, world hash or evaluator truth. `core` does not change when the import cut is committed; `current` is a dated observation.', statusScriptSha256: fileSha(fileURLToPath(import.meta.url)), coreSha256: sha(stable(core)), core, current };
      const fd = openSync(STATUS_FILE, 'wx'); writeSync(fd, JSON.stringify(rec, null, 1) + '\n'); closeSync(fd); console.log(`written ${posix(relative(REPO, STATUS_FILE))}`); }
    if (!ok) process.exitCode = 1;
  }
}
