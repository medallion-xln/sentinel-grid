import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['SHA256SUMS.txt']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const files = (await walk(root)).filter((absolute) => !excluded.has(path.relative(root, absolute)));
const lines = [];
for (const absolute of files) {
  const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
  lines.push(`${digest}  ${path.relative(root, absolute).split(path.sep).join('/')}`);
}
await writeFile(path.join(root, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(`Wrote ${lines.length} SHA-256 entries.`);
