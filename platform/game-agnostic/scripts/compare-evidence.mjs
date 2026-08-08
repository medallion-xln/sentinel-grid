import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [leftPath, rightPath] = process.argv.slice(2);
if (!leftPath || !rightPath) {
  console.error('Usage: node scripts/compare-evidence.mjs <left.json> <right.json>');
  process.exit(2);
}

async function loadEvidence(filePath) {
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  if (typeof parsed.deterministicEvidenceHash === 'string') return parsed;
  if (parsed.deterministicEvidence && typeof parsed.deterministicEvidence.deterministicEvidenceHash === 'string') {
    return parsed.deterministicEvidence;
  }
  throw new Error(`${filePath} does not contain deterministic evidence`);
}

const [left, right] = await Promise.all([loadEvidence(leftPath), loadEvidence(rightPath)]);
const pass = left.deterministicEvidenceHash === right.deterministicEvidenceHash;
console.log(JSON.stringify({
  pass,
  left: { path: path.resolve(leftPath), deterministicEvidenceHash: left.deterministicEvidenceHash },
  right: { path: path.resolve(rightPath), deterministicEvidenceHash: right.deterministicEvidenceHash },
}, null, 2));
if (!pass) process.exitCode = 1;
