import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';

/* CANONICAL_PROJECT_ROOT policy: the repository is the authoritative project. No normal runtime or certification
 * path may read /private/tmp, a Claude scratch directory, or any other session workspace. Historical provenance
 * may still NAME those locations (lineage metadata, documentation, guard assertions); naming is not depending. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPHEMERAL = /\/private\/tmp|claude-501|scratchpad/;
/* A mention becomes a dependency only when the same statement hands the path to a filesystem or module API. */
const FILESYSTEM_USE = /readFile|readdir|existsSync|statSync|lstat|opendir|createReadStream|openSync|accessSync|realpath|import\s*\(|require\s*\(|cpSync|rmSync|writeFile|mkdir/;
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function activeCodeFiles() {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(js|mjs)$/.test(entry.name)) files.push(absolute);
    }
  };
  for (const directory of ['src', 'scripts', 'tests']) walk(path.join(root, directory));
  return files;
}

test('no active source, script, or test uses an ephemeral path as a filesystem or module target', () => {
  const offenders = [];
  for (const file of activeCodeFiles()) {
    codeOnly(readFileSync(file, 'utf8')).split('\n').forEach((line, index) => {
      if (EPHEMERAL.test(line) && FILESYSTEM_USE.test(line)) offenders.push(`${path.relative(root, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `ephemeral filesystem dependencies: ${offenders.join(', ')}`);
});

test('canonical certification reads no ephemeral path and passes from the repository alone', async () => {
  const recovery = await certifyRecoveredStage3DE();
  assert.equal(recovery.status, 'PASS');
  assert.equal(recovery.adapter.gating, false);
  assert.equal(recovery.adapter.manifestCompositeHash, recovery.hashes.stage3dV2bCandidate);
});

test('the one-off provenance tool refuses to default to any ephemeral or home-directory path', () => {
  const code = codeOnly(readFileSync(path.join(root, 'scripts', 'canonicalize-stage3de-recovery.mjs'), 'utf8'));
  assert.equal(EPHEMERAL.test(code), false);
  assert.equal(/\/Users\//.test(code), false);
  assert.match(code, /SENTINEL_RECOVERED_SOURCE/);
});

test('historical provenance is preserved as lineage metadata, not as a runtime dependency', () => {
  const lineage = JSON.parse(readFileSync(path.join(root, 'artifacts', 'stage3de-recovery-canonicalization', 'lineage-record.json'), 'utf8'));
  assert.match(lineage.recoveredSourcePath, EPHEMERAL);
  assert.equal(lineage.recoveredSourceMutationPolicy, 'READ_ONLY_DO_NOT_DELETE_OR_MUTATE');
  assert.equal(lineage.preservation.canonicalPayloadByteIdentical, true);
});

test('a fresh clone needs no third-party install to run the project', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
});

test('frozen Stage 3D/3E identity is verified from in-repo manifests', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'training', 'stage3cr3', 'identity', 'candidate-manifest-v2b.json'), 'utf8'));
  assert.equal(typeof manifest.CANDIDATE_ARTIFACT_HASH, 'string');
  assert.ok(Object.keys(manifest.adapterFileHashes).length >= 6);
});
