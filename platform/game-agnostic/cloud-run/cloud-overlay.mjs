// Encrypted transport of the protected overlay to a cloud checkout, under the owner's custody override of 2026-11-14
// (stage3h-hdisc1-discriminator-v1/custody/OWNER_CUSTODY_OVERRIDE_2026-11-14.json).
//
//   node cloud-run/cloud-overlay.mjs keygen --key-file <path outside the repository>       random 256-bit key, mode 0600, never printed
//   node cloud-run/cloud-overlay.mjs pack   --key-file <path> --out <file>                  build the AES-256-GCM archive
//   node cloud-run/cloud-overlay.mjs unpack --root <checkout> --in <file> [--key-file <p>]  decrypt, verify every sha256, place
//   node cloud-run/cloud-overlay.mjs wipe   --root <checkout> --in <file> [--key-file <p>]  delete every placed working-tree file
// In the cloud the key comes from the environment variable SENTINEL_CLOUD_KEY (base64) when --key-file is not given.
//
// Contents: the 57 entries of the H-DISC-1 draft evidence manifest (31 protected sources, 19 SK1 data files, 7 custody
// control files inside .git) plus every file under stage3h-sk1-safety-kernel-v1/work/ (acceptance condition 2 needs all
// 305). Not included: the git history (and with it the custody refs that still hold old protected blobs).
// Only ciphertext may be committed or pushed. Plaintext overlay files must never be staged: the custody stage guard refuses
// them, and `unpack` refuses to place a protected path that the checkout tracks.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, chmodSync, rmSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '..'), REPO = resolve(GA, '../..');
export const MAGIC = Buffer.from('SGCO1\n'), SCHEMA = 'SENTINEL_CLOUD_OVERLAY_V1';
const DRAFT = 'platform/game-agnostic/stage3h-hdisc1-discriminator-v1/evidence/HDISC1_EVIDENCE_BUNDLE_MANIFEST_DRAFT.json', WORK = 'platform/game-agnostic/stage3h-sk1-safety-kernel-v1/work';
const GIT_ALLOWED = /^\.git\/(custody\/(protected-identities\.tsv|stage-guard\.sh|GUARD_MANIFEST\.sha256)|hooks\/(pre-commit|pre-merge-commit|pre-push)|info\/exclude)$/;
const sha = (b) => createHash('sha256').update(b).digest('hex'), posix = (p) => p.split(sep).join('/');

export function readKey({ keyFile = null, env = process.env } = {}) {
  const b64 = keyFile ? readFileSync(keyFile, 'utf8').trim() : (env.SENTINEL_CLOUD_KEY ?? '').trim(); const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw Error('KEY_MISSING_OR_NOT_256_BIT' + (keyFile ? '' : ' (set SENTINEL_CLOUD_KEY or pass --key-file)')); return k;
}
export function encrypt(payload, key) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv), body = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(payload)))), c.final()]); return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]); }
export function decrypt(blob, key) {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw Error('NOT_A_CLOUD_OVERLAY'); const o = MAGIC.length, iv = blob.subarray(o, o + 12), tag = blob.subarray(o + 12, o + 28);
  const d = createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); let plain; try { plain = Buffer.concat([d.update(blob.subarray(o + 28)), d.final()]); } catch { throw Error('DECRYPTION_FAILED_WRONG_KEY_OR_ALTERED_ARCHIVE'); }
  const p = JSON.parse(gunzipSync(plain).toString('utf8')); if (p.schema !== SCHEMA) throw Error('UNKNOWN_PAYLOAD_SCHEMA'); return p;
}

/** The overlay file list, read from this working tree. */
export function collect(repo = REPO) {
  const draft = JSON.parse(readFileSync(resolve(repo, DRAFT), 'utf8')), paths = new Set(draft.core.entries.map((e) => e.path));
  const walk = (d) => readdirSync(resolve(repo, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.isFile() ? [`${d}/${e.name}`] : []));
  if (existsSync(resolve(repo, WORK))) for (const p of walk(WORK)) paths.add(p);
  const declared = new Map(draft.core.entries.map((e) => [e.path, e.sha256]));
  return [...paths].sort().map((p) => { const b = readFileSync(resolve(repo, p)), h = sha(b); if (declared.has(p) && declared.get(p) !== h) throw Error('FILE_DIFFERS_FROM_DRAFT_MANIFEST:' + p);
    return { path: p, sha256: h, size: b.length, mode: (statSync(resolve(repo, p)).mode & 0o777).toString(8).padStart(3, '0'), b64: b.toString('base64') }; });
}

/** Check one entry before placing it. Pure apart from the tracked-path set. */
export function entryProblems(e, tracked) {
  const p = []; if (typeof e.path !== 'string' || e.path.startsWith('/') || e.path.split('/').includes('..')) p.push('PATH_UNSAFE');
  else if (e.path.startsWith('.git/') && !GIT_ALLOWED.test(e.path)) p.push('GIT_PATH_NOT_ALLOWED');
  if (tracked.has(e.path)) p.push('PATH_IS_TRACKED_IN_THIS_CHECKOUT'); if (sha(Buffer.from(e.b64 ?? '', 'base64')) !== e.sha256) p.push('CONTENT_HASH_MISMATCH'); return p;
}
const trackedSet = (root) => new Set(execFileSync('/usr/bin/git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean));

export function unpack({ root, blob, key }) {
  const payload = decrypt(blob, key), tracked = trackedSet(root), bad = payload.files.map((e) => [e.path, entryProblems(e, tracked)]).filter(([, p]) => p.length);
  if (bad.length) throw Error('REFUSED_NOTHING_PLACED:' + bad.slice(0, 5).map(([f, p]) => `${f}=${p.join('+')}`).join(','));
  for (const e of payload.files) { const dst = resolve(root, e.path); mkdirSync(dirname(dst), { recursive: true }); if (existsSync(dst)) chmodSync(dst, 0o600); writeFileSync(dst, Buffer.from(e.b64, 'base64')); chmodSync(dst, parseInt(e.mode, 8)); }
  return { placed: payload.files.length, bytes: payload.files.reduce((s, e) => s + e.size, 0), gitControlFiles: payload.files.filter((e) => e.path.startsWith('.git/')).length, packedAtHead: payload.head };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2), opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
  if (cmd === 'keygen') { const f = opt('--key-file'); if (!f) throw Error('USAGE: keygen --key-file <path>'); if (!relative(REPO, resolve(f)).startsWith('..')) throw Error('KEY_FILE_MUST_BE_OUTSIDE_THE_REPOSITORY');
    mkdirSync(dirname(resolve(f)), { recursive: true, mode: 0o700 }); const fd = openSync(resolve(f), 'wx', 0o600); writeSync(fd, randomBytes(32).toString('base64') + '\n'); closeSync(fd); console.log(JSON.stringify({ keyFile: resolve(f), mode: '600', printed: false })); }
  else if (cmd === 'pack') { const key = readKey({ keyFile: opt('--key-file') }), files = collect(), head = execFileSync('/usr/bin/git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const blob = encrypt({ schema: SCHEMA, head, createdAt: new Date().toISOString(), files }, key); writeFileSync(resolve(opt('--out')), blob);
    console.log(JSON.stringify({ files: files.length, plaintextBytes: files.reduce((s, e) => s + e.size, 0), protected: files.filter((e) => /ascii-suite\/|stage3h-canonical-v1\//.test(e.path)).length, gitControlFiles: files.filter((e) => e.path.startsWith('.git/')).length, archiveBytes: blob.length, archiveSha256: sha(blob), head })); }
  else if (cmd === 'unpack') console.log(JSON.stringify(unpack({ root: resolve(opt('--root')), blob: readFileSync(resolve(opt('--in'))), key: readKey({ keyFile: opt('--key-file') }) })));
  else if (cmd === 'wipe') { const root = resolve(opt('--root')), p = decrypt(readFileSync(resolve(opt('--in'))), readKey({ keyFile: opt('--key-file') })); let n = 0; for (const e of p.files) if (!e.path.startsWith('.git/') && existsSync(resolve(root, e.path))) { rmSync(resolve(root, e.path)); n++; } console.log(JSON.stringify({ removed: n })); }
  else { console.error('USAGE: cloud-overlay.mjs keygen|pack|unpack|wipe ...'); process.exit(2); }
}
