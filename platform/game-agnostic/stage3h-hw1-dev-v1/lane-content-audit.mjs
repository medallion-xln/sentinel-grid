// H-W1 DEV lane content audit. READ-ONLY. Scans every file git would stage from this lane (untracked, not ignored) for protected
// source material, secrets and unrelated data before it is committed. Protected contents are never printed: only paths, counts
// and pattern names. Identities come from .git/custody/protected-identities.tsv (path, blob id, sha256, size). The checks are those
// of stage3h-custody-audit-v1/lane-content-audit.mjs: git blob id, sha256, exact path, basename alias, embedded source lines (runs
// of >= 60-char lines copied from a protected source), archive/binary/oversize files, credential patterns.
// Usage: node lane-content-audit.mjs <STAGE> [--write]   (--write records evidence/LANE_CONTENT_AUDIT_<STAGE>.json once, only if clean)
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(LANE, '../../..');
const GA = 'platform/game-agnostic', LANES = ['stage3h-hw1-dev-v1'];
const STAGE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (!STAGE || !/^[A-Za-z0-9_-]+$/.test(STAGE)) throw Error('USAGE: node lane-content-audit.mjs <STAGE> [--write]');
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const blobId = (b) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');

const ids = readFileSync(resolve(ROOT, '.git/custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
  const c = l.split('\t'); return { path: c.find((x) => x.includes('/')), blob: c.find((x) => /^[0-9a-f]{40}$/.test(x)), sha: c.find((x) => /^[0-9a-f]{64}$/.test(x)) };
});
if (ids.length !== 31 || ids.some((i) => !i.path || !i.blob || !i.sha)) throw Error('PROTECTED_IDENTITIES_UNREADABLE');
const byBlob = new Set(ids.map((i) => i.blob)), bySha = new Set(ids.map((i) => i.sha)), paths = new Set(ids.map((i) => i.path)), pathsLc = new Set(ids.map((i) => i.path.toLowerCase()));
const names = new Set(ids.map((i) => basename(i.path).toLowerCase()));
const MINLEN = 60, protLines = new Set();
for (const i of ids) { const p = resolve(ROOT, i.path); if (!existsSync(p)) throw Error('OVERLAY_MISSING:' + i.path); for (const l of readFileSync(p, 'utf8').split('\n')) { const t = l.trim(); if (t.length >= MINLEN) protLines.add(t); } }

const SECRETS = [['PRIVATE_KEY_BLOCK', /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ['AWS_ACCESS_KEY', /AKIA[0-9A-Z]{16}/], ['SK_STYLE_KEY', /\bsk-[A-Za-z0-9_-]{20,}/], ['GITHUB_TOKEN', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['SLACK_TOKEN', /\bxox[baprs]-[A-Za-z0-9-]{10,}/], ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/], ['BEARER_TOKEN', /Bearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['URL_CREDENTIALS', /[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i], ['ASSIGNED_SECRET', /\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i]];
const SECRET_NAMES = /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519|.*\.(pem|p12|pfx|key|keystore)|credentials(\.json)?)$/i, ARCHIVE = new Set(['.tar', '.gz', '.tgz', '.zip', '.bundle', '.bak', '.7z', '.xz', '.bz2', '.dmg', '.pack', '.idx']);
const OVERSIZE = 4 * 1024 * 1024; // lane evidence may carry per-class tables; the custody audit's 256 KiB bound is for hand-written sources

const scope = LANES.map((l) => `${GA}/${l}`);
const staged = git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...scope]).split('\0').filter(Boolean);
const ignored = git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...scope]).split('\0').filter(Boolean);
const modified = git(['diff', '--name-only', '-z', '--', ...scope]).split('\0').filter(Boolean);
const findings = [], per = [];
for (const rel of [...staged, ...modified]) {
  const p = resolve(ROOT, rel), buf = readFileSync(p), text = buf.toString('utf8'), lines = text.split('\n'), f = [];
  const b = blobId(buf), s = sha256(buf), ext = extname(rel).toLowerCase();
  if (byBlob.has(b)) f.push('PROTECTED_BLOB_ID'); if (bySha.has(s)) f.push('PROTECTED_SHA256');
  if (paths.has(rel)) f.push('PROTECTED_PATH'); else if (pathsLc.has(rel.toLowerCase())) f.push('PROTECTED_PATH_CASE_ALIAS'); else if (names.has(basename(rel).toLowerCase())) f.push('PROTECTED_BASENAME_ALIAS');
  if (ARCHIVE.has(ext)) f.push('ARCHIVE_OR_BACKUP_EXTENSION'); if (SECRET_NAMES.test(rel)) f.push('SECRET_LIKE_FILENAME');
  if (buf.includes(0)) f.push('BINARY_CONTENT'); if (buf.length > OVERSIZE) f.push('OVERSIZE');
  let matched = 0, run = 0, maxRun = 0, chars = 0;
  for (const l of lines) { const t = l.trim(); if (t.length >= MINLEN && protLines.has(t)) { matched++; run++; chars += t.length; maxRun = Math.max(maxRun, run); } else if (t.length) run = 0; }
  if (maxRun >= 3 || chars >= 300) f.push('POSSIBLE_EMBEDDED_PROTECTED_SOURCE');
  const secretHits = []; lines.forEach((l, k) => { for (const [n, re] of SECRETS) if (re.test(l)) secretHits.push(`${n}@${k + 1}`); });
  if (secretHits.length) f.push('SECRET_PATTERN');
  per.push({ file: rel, bytes: buf.length, sha256: s, protectedLineMatches: matched, longestRun: maxRun });
  if (f.length) findings.push({ file: rel, flags: f, secretHits });
}
const coincident = per.filter((x) => x.protectedLineMatches > 0).map((x) => ({ file: x.file, lines: x.protectedLineMatches, longestRun: x.longestRun }));
const clean = findings.length === 0;
const out = { schema: 'STAGE3H_HW1_LANE_CONTENT_AUDIT_V1', stage: STAGE, authority: 'R0', checkedAt: new Date().toISOString(), head: git(['rev-parse', 'HEAD']).trim(),
  method: 'git blob id + sha256 against the 31 recorded protected identities; exact/case/basename path alias; verbatim >=60-char line copies (flag at a run of 3 lines or 300 chars); archive/binary/oversize; credential patterns. Contents never printed.',
  lanes: LANES, filesScanned: per.length, bytesScanned: per.reduce((a, x) => a + x.bytes, 0), ignoredNotStaged: ignored, protectedIdentitiesChecked: ids.length, findings, shortCoincidentProtectedLines: coincident, clean,
  files: per.map((x) => ({ file: x.file, bytes: x.bytes, sha256: x.sha256 })) };
if (process.argv.includes('--write')) { if (!clean) throw Error('LANE_AUDIT_NOT_CLEAN_NOT_RECORDED'); writeExclusive(resolve(LANE, `evidence/LANE_CONTENT_AUDIT_${STAGE}.json`), out); }
console.log(JSON.stringify({ stage: STAGE, clean, filesScanned: out.filesScanned, bytesScanned: out.bytesScanned, ignoredNotStaged: ignored.length, protectedIdentitiesChecked: ids.length, findings, shortCoincidentProtectedLines: coincident }, null, 1));
