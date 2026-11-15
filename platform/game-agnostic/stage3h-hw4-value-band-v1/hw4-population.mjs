// H-W4 Phase 5 population access — parameterized copy of stage3h-hw1-dev-v1/i2-population.mjs (same manifest digest,
// data-file hash verification, procedural validation lock; H-W4 paths and schema). HOLDOUT cannot be loaded at all.
// VALIDATION outcomes are locked until HW4_PHASE === 'VALIDATION' (one-pass protocol).
import { readFileSync, readdirSync, chmodSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const LANE = dirname(fileURLToPath(import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const MANIFEST_SCHEMA = 'STAGE3H_HW4_POPULATION_V1';
export const manifestPath = (p) => resolve(LANE, 'evidence', `HW4_POPULATION_${p}.json`);
export const classDir = (p) => resolve(LANE, 'work/classes', p);
export const classListDigest = (ids) => sha(ids.join('\n'));

export function loadManifest(population) {
  if (population === 'HOLDOUT') throw Error('HOLDOUT_NOT_GENERATED_AND_NOT_LOADABLE');
  const f = manifestPath(population); if (!existsSync(f)) throw Error('POPULATION_MANIFEST_MISSING:' + population);
  const m = JSON.parse(readFileSync(f, 'utf8'));
  if (m.schema !== MANIFEST_SCHEMA || m.population !== population) throw Error('POPULATION_MANIFEST_INVALID:' + population);
  if (classListDigest(m.classes.map((c) => c.id)) !== m.classListDigest || m.classes.length !== m.classCount) throw Error('POPULATION_MANIFEST_TAMPERED:' + population);
  return m;
}

export function lockValidationOutcomes() {
  const files = [...readdirSync(classDir('VALIDATION')).map((n) => resolve(classDir('VALIDATION'), n)), resolve(LANE, 'work/pool/pool-VALIDATION.json'),
    ...readdirSync(resolve(LANE, 'work/screen')).filter((n) => /^VALIDATION-/.test(n)).map((n) => resolve(LANE, 'work/screen', n))];
  for (const f of files) chmodSync(f, 0o000);
  return files.length;
}

export function loadPopulation(population, { phase = process.env.HW4_PHASE } = {}) {
  const m = loadManifest(population);
  if (population === 'VALIDATION') { if (phase !== 'VALIDATION') throw Error('VALIDATION_OUTCOMES_LOCKED_UNTIL_ONE_PASS'); for (const d of m.dataFiles) chmodSync(resolve(classDir(population), d.file), 0o400); }
  const byId = new Map();
  for (const d of m.dataFiles) {
    const raw = readFileSync(resolve(classDir(population), d.file)); if (sha(raw) !== d.sha256) throw Error('POPULATION_DATA_FILE_HASH_MISMATCH:' + d.file);
    for (const c of JSON.parse(raw).classes) byId.set(c.id, c);
  }
  const classes = m.classes.map((e) => { const c = byId.get(e.id); if (!c || c.status !== 'OK' || c.worldHash !== e.worldHash) throw Error('POPULATION_CLASS_MISSING_OR_CHANGED:' + e.id); return c; });
  return { manifest: m, classes };
}
