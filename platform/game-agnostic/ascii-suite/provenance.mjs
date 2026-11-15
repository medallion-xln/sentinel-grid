import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = b => createHash('sha256').update(b).digest('hex');
export function sourceManifest() {
  const files = {}, seen = new Set();
  function visit(file) {
    if (seen.has(file)) return; seen.add(file);
    if (!file.startsWith(root + path.sep)) throw Error('Source closure escaped kernel');
    const bytes = readFileSync(file), source = bytes.toString('utf8'); files[path.relative(root, file)] = hash(bytes);
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)) {
      if (match[1].startsWith('.')) visit(path.resolve(path.dirname(file), match[1]));
    }
  }
  for (const name of ['games.mjs', 'prime.mjs', 'controllers/index.mjs']) visit(path.join(root, 'ascii-suite', name));
  const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { method: 'RAW_SHA256_STATIC_RELATIVE_IMPORT_CLOSURE', files: ordered, sourceClosureHash: hash(JSON.stringify(ordered)), nodeVersion: process.version, status: 'DIAGNOSTIC_NOT_A_CERTIFICATE' };
}
