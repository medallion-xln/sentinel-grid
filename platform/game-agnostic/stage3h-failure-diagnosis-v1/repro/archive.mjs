// Raw-archive custody for dev-runs/. Creates archive/dev-runs-38f7c1d6.tar.gz (gitignored, outside Git) and a sha256
// sidecar, extracts it into a fresh temporary directory, and checks every extracted file against the raw hashes in
// DEV_RUN_MANIFEST.json and the originals. Never deletes or modifies dev-runs/. The archive sits on the same disk as the
// originals, so it is NOT an independent copy. Writes evidence/reproducibility/ARCHIVE_VERIFICATION.json once.
// Usage (from the lane): node repro/archive.mjs
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { LANE, ok, writeExclusive } from '../lib.mjs';
import { OUT_DIR } from './manifest.mjs';

const fsha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = resolve(d, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
export const ARCHIVE = resolve(LANE, 'archive/dev-runs-38f7c1d6.tar.gz');

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'repro/archive.mjs')) {
  const manifest = JSON.parse(readFileSync(resolve(OUT_DIR, 'DEV_RUN_MANIFEST.json'), 'utf8')), devRuns = resolve(LANE, 'dev-runs');
  const expected = { ...Object.fromEntries(Object.entries(manifest.records).map(([k, v]) => [k, v.rawSha256])), ...Object.fromEntries(manifest.auxiliaryLogs.map((l) => [l.path, l.rawSha256])) };
  const originals = walk(devRuns).map((p) => relative(devRuns, p)).sort();
  ok(originals.length === Object.keys(expected).length && originals.every((k) => expected[k] === fsha(resolve(devRuns, k))), 'ORIGINALS_DO_NOT_MATCH_MANIFEST');
  ok(!existsSync(ARCHIVE), 'ARCHIVE_EXISTS');
  mkdirSync(resolve(LANE, 'archive'), { recursive: true });
  execFileSync('/usr/bin/tar', ['-czf', ARCHIVE, '-C', LANE, 'dev-runs']);
  const archiveSha = fsha(ARCHIVE);
  writeFileSync(ARCHIVE + '.sha256', `${archiveSha}  dev-runs-38f7c1d6.tar.gz\n`, { flag: 'wx' });
  const tmp = mkdtempSync(resolve(tmpdir(), 'sg-archive-check-'));
  let extracted, mismatches;
  try {
    ok(fsha(ARCHIVE) === readFileSync(ARCHIVE + '.sha256', 'utf8').split(' ')[0], 'SIDECAR_MISMATCH');
    execFileSync('/usr/bin/tar', ['-xzf', ARCHIVE, '-C', tmp]);
    const root = resolve(tmp, 'dev-runs');
    extracted = walk(root).map((p) => relative(root, p)).sort();
    mismatches = Object.entries(expected).filter(([k, h]) => !extracted.includes(k) || fsha(resolve(root, k)) !== h).map(([k]) => k);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const originalsAfter = originals.every((k) => expected[k] === fsha(resolve(devRuns, k)));
  const out = { schema: 'STAGE3H_DEV_RAW_ARCHIVE_VERIFICATION_V1', authority: 'R0', archive: 'platform/game-agnostic/stage3h-failure-diagnosis-v1/archive/dev-runs-38f7c1d6.tar.gz (gitignored)',
    archiveSha256: archiveSha, archiveSizeBytes: statSync(ARCHIVE).size, sidecar: 'archive/dev-runs-38f7c1d6.tar.gz.sha256',
    filesExpected: Object.keys(expected).length, filesExtracted: extracted.length, extraFilesInArchive: extracted.filter((k) => !(k in expected)), rawHashMismatches: mismatches,
    rawHashesRecoveredFromArchive: mismatches.length === 0 && extracted.length === Object.keys(expected).length, extractionDirectoryRemoved: !existsSync(tmp),
    originalsRetainedAndUnchanged: originalsAfter, originalsDeleted: false,
    independentCopy: false, independentCopyNote: 'The archive is on the same disk and machine as the originals. No independently stored copy exists; originals must not be deleted until one is made and verified.' };
  ok(out.rawHashesRecoveredFromArchive && originalsAfter, 'ARCHIVE_VERIFICATION_FAILED:' + JSON.stringify(mismatches));
  writeExclusive(resolve(OUT_DIR, 'ARCHIVE_VERIFICATION.json'), out);
  console.log(JSON.stringify(out, null, 1));
}
