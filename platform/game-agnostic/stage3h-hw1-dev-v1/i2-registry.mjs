// H-W1 I-2 PCD exclusion registry. A registry is a list of {id, source, fine, coarse} entries sealed by a sha256 over its canonical entry list. Loading verifies the
// schema, the hash format of every entry, id uniqueness and the seal, and throws on any inconsistency (fail closed). Matching reports every source an observation
// class collides with, on the fine or the coarse digest.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PCD_VERSION } from './i2-pcd.mjs';

export const REGISTRY_SCHEMA = 'STAGE3H_HW1_I2_PCD_REGISTRY_V1';
const HEX64 = /^[0-9a-f]{64}$/, sha = (s) => createHash('sha256').update(s).digest('hex'), fail = (m) => { throw Error('PCD_REGISTRY_INVALID:' + m); }, check = (v, m) => { if (!v) fail(m); };
const canonical = (entries) => JSON.stringify(entries.map((e) => [e.id, e.source, e.fine ?? null, e.coarse]));

/** Build a sealed registry from entries; entries are sorted by id so that the seal does not depend on generation order. */
export function sealRegistry(name, entries) {
  const sorted = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const reg = { schema: REGISTRY_SCHEMA, pcdVersion: PCD_VERSION, name, count: sorted.length, entries: sorted };
  reg.seal = sha(canonical(sorted)); return validateRegistry(reg);
}

export function validateRegistry(reg) {
  check(reg && reg.schema === REGISTRY_SCHEMA, 'SCHEMA'); check(reg.pcdVersion === PCD_VERSION, 'PCD_VERSION'); check(Array.isArray(reg.entries) && reg.entries.length === reg.count, 'COUNT');
  const ids = new Set();
  for (const e of reg.entries) {
    check(typeof e.id === 'string' && e.id.length > 0 && !ids.has(e.id), 'ID_DUPLICATE_OR_EMPTY'); ids.add(e.id);
    check(typeof e.source === 'string' && HEX64.test(e.coarse) && (e.fine === null || e.fine === undefined || HEX64.test(e.fine)), 'NON_CANONICAL_DIGEST:' + e.id);
  }
  check(typeof reg.seal === 'string' && HEX64.test(reg.seal) && reg.seal === sha(canonical(reg.entries)), 'SEAL_MISMATCH');
  return reg;
}
export const loadRegistry = (path) => { let reg; try { reg = JSON.parse(readFileSync(path, 'utf8')); } catch { fail('UNREADABLE:' + path); } return validateRegistry(reg); };

/** Union of sealed registries as lookup tables. */
export function registryIndex(regs) {
  const fine = new Map(), coarse = new Map(), add = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(`${e.source}:${e.id}`); };
  for (const r of regs) for (const e of r.entries) { if (e.fine) add(fine, e.fine, e); add(coarse, e.coarse, e); }
  return { fine, coarse, seals: regs.map((r) => ({ name: r.name, count: r.count, seal: r.seal })) };
}
/** Collisions of a PCD with the registry. Empty array: the class is not excluded. Any hit excludes it. */
export function matchPcd(index, p) {
  const out = [];
  if (p.fine && index.fine.has(p.fine)) out.push(...index.fine.get(p.fine).map((s) => 'FINE:' + s));
  if (index.coarse.has(p.coarse)) out.push(...index.coarse.get(p.coarse).map((s) => 'COARSE:' + s));
  return out;
}
