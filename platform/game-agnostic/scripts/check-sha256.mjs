import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = await readFile(path.join(root, 'SHA256SUMS.txt'), 'utf8');
let checked = 0;
const failures = [];
for (const line of manifest.split('\n')) {
  if (!line.trim()) continue;
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) {
    failures.push({ path: line, reason: 'invalid manifest line' });
    continue;
  }
  const [, expected, relative] = match;
  try {
    const actual = createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');
    if (actual !== expected) failures.push({ path: relative, expected, actual });
  } catch (error) {
    failures.push({ path: relative, reason: error.message });
  }
  checked += 1;
}
console.log(JSON.stringify({ pass: failures.length === 0, checked, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
