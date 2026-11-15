// H-W1 I-2 population access. The frozen manifest (evidence/I2_POPULATION_<NAME>.json) is the single source of truth for which classes belong to a population; the class data lives in
// git-ignored work files whose sha256 the manifest records. loadPopulation() verifies the manifest digest and every data-file hash before returning anything.
// VALIDATION outcomes are locked: loadPopulation('VALIDATION') throws unless HW1_PHASE === 'I5', and freeze removes all permissions from the validation outcome files. This is a
// PROCEDURAL guard against accidental use in I-3/I-4 (the owner can always chmod), not a cryptographic one, and the evidence says so. HOLDOUT cannot be loaded at all.
import { readFileSync, readdirSync, chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { LANE } from './i2-allocator.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
export const MANIFEST_SCHEMA = 'STAGE3H_HW1_I2_POPULATION_V1';
export const manifestPath = (p) => resolve(LANE, 'evidence', `I2_POPULATION_${p}.json`);
export const classDir = (p) => resolve(LANE, 'work/i2/classes', p);
export const classListDigest = (ids) => sha(ids.join('\n'));

export function loadManifest(population) {
  if (population === 'HOLDOUT') throw Error('HOLDOUT_NOT_GENERATED_AND_NOT_LOADABLE');
  const f = manifestPath(population); if (!existsSync(f)) throw Error('POPULATION_MANIFEST_MISSING:' + population);
  const m = JSON.parse(readFileSync(f, 'utf8'));
  if (m.schema !== MANIFEST_SCHEMA || m.population !== population) throw Error('POPULATION_MANIFEST_INVALID:' + population);
  if (classListDigest(m.classes.map((c) => c.id)) !== m.classListDigest || m.classes.length !== m.classCount) throw Error('POPULATION_MANIFEST_TAMPERED:' + population);
  return m;
}

/** Procedural lock of every file that carries validation outcomes (class truth, the pool's regrets, the screen shards). */
export function lockValidationOutcomes() {
  const files = [...readdirSync(classDir('VALIDATION')).map((n) => resolve(classDir('VALIDATION'), n)), resolve(LANE, 'work/i2/pool/pool-VALIDATION.json'),
    ...readdirSync(resolve(LANE, 'work/i2/screen')).filter((n) => /^VALIDATION-/.test(n)).map((n) => resolve(LANE, 'work/i2/screen', n))];
  for (const f of files) chmodSync(f, 0o000);
  return files.length;
}

/** The classes of a frozen population, in manifest order, with their data-file hashes verified. VALIDATION requires HW1_PHASE=I5 and unlocks its files deliberately. */
export function loadPopulation(population, { phase = process.env.HW1_PHASE } = {}) {
  const m = loadManifest(population);
  if (population === 'VALIDATION') { if (phase !== 'I5') throw Error('VALIDATION_OUTCOMES_LOCKED_UNTIL_I5'); for (const d of m.dataFiles) chmodSync(resolve(classDir(population), d.file), 0o400); }
  const byId = new Map();
  for (const d of m.dataFiles) {
    const raw = readFileSync(resolve(classDir(population), d.file)); if (sha(raw) !== d.sha256) throw Error('POPULATION_DATA_FILE_HASH_MISMATCH:' + d.file);
    for (const c of JSON.parse(raw).classes) byId.set(c.id, c);
  }
  const classes = m.classes.map((e) => { const c = byId.get(e.id); if (!c || c.status !== 'OK' || c.worldHash !== e.worldHash) throw Error('POPULATION_CLASS_MISSING_OR_CHANGED:' + e.id); return c; });
  return { manifest: m, classes };
}
