// SK1 population access and validation isolation.
//   EXPLORATION  development data: labels may be read by the trainer.
//   VALIDATION   outcome files are chmod 000 from the population freeze until the one-pass run. loadPopulation refuses
//                VALIDATION unless the caller is the runner in phase RUN (once) or CHECK (after results exist).
// A manifest is private (it carries seeds and world hashes). Tracked records refer to classes by opaque alias only.
import { readFileSync, readdirSync, chmodSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORK, EVIDENCE, POPULATIONS, sha, readJ, fail, exists } from './common.mjs';

export const MANIFEST_SCHEMA = 'SK1_POPULATION_MANIFEST_V1', RESULT_FILE = resolve(EVIDENCE, 'SK1_VALIDATION_RESULTS.json');
export const manifestPath = (p) => resolve(WORK, 'manifests', `SK1_POPULATION_${p}.json`), summaryPath = (p) => resolve(EVIDENCE, `SK1_POPULATION_${p}.json`), registryPath = (p) => resolve(EVIDENCE, `SK1_REGISTRY_${p}.json`);
export const classDir = (p) => resolve(WORK, 'classes', p), classListDigest = (ids) => sha(ids.join('\n'));

export function loadManifest(population) {
  if (!POPULATIONS.includes(population)) fail('UNKNOWN_OR_UNAUTHORIZED_POPULATION:' + population); // HOLDOUT cannot be named
  const f = manifestPath(population); if (!exists(f)) fail('POPULATION_MANIFEST_MISSING:' + population);
  const m = readJ(f), s = readJ(summaryPath(population));
  if (m.schema !== MANIFEST_SCHEMA || m.population !== population || classListDigest(m.classes.map((c) => c.id)) !== m.classListDigest || m.classes.length !== m.classCount) fail('POPULATION_MANIFEST_TAMPERED:' + population);
  if (s.classListDigest !== m.classListDigest || s.manifestSha256 !== sha(readFileSync(f))) fail('POPULATION_MANIFEST_DOES_NOT_MATCH_TRACKED_SUMMARY:' + population);
  return m;
}
export const outcomeFileModes = (m) => m.dataFiles.map((d) => statSync(resolve(classDir(m.population), d.file)).mode & 0o777);
export function lockOutcomes(population) { const files = readdirSync(classDir(population)).map((n) => resolve(classDir(population), n)); for (const f of files) chmodSync(f, 0o000); return files.length; }

/** phase: 'DEVELOPMENT' (EXPLORATION only) | 'RUN' | 'CHECK'. Returns class records in manifest order. */
export function loadPopulation(population, phase) {
  const m = loadManifest(population);
  if (population === 'VALIDATION') {
    if (phase !== 'RUN' && phase !== 'CHECK') fail('VALIDATION_OUTCOMES_LOCKED_UNTIL_ONE_PASS_RUN');
    if (phase === 'RUN' && exists(RESULT_FILE)) fail('VALIDATION_ALREADY_RUN_ONCE');
    if (phase === 'CHECK' && !exists(RESULT_FILE)) fail('NOTHING_TO_CHECK_VALIDATION_NOT_RUN');
  } else if (phase !== 'DEVELOPMENT' && phase !== 'RUN' && phase !== 'CHECK') fail('UNKNOWN_PHASE');
  const dir = classDir(population), before = outcomeFileModes(m), byId = new Map();
  try {
    for (const d of m.dataFiles) chmodSync(resolve(dir, d.file), 0o400);
    for (const d of m.dataFiles) { const raw = readFileSync(resolve(dir, d.file)); if (sha(raw) !== d.sha256) fail('POPULATION_DATA_FILE_HASH_MISMATCH:' + d.file); for (const c of JSON.parse(raw).classes) byId.set(c.id, c); }
  } finally { if (population === 'VALIDATION') m.dataFiles.forEach((d, i) => chmodSync(resolve(dir, d.file), phase === 'CHECK' ? before[i] : 0o400)); }
  const classes = m.classes.map((e) => { const c = byId.get(e.id); if (!c || c.status !== 'OK' || c.worldHash !== e.worldHash) fail('POPULATION_CLASS_MISSING_OR_CHANGED:' + e.id); return c; });
  return { manifest: m, classes };
}
