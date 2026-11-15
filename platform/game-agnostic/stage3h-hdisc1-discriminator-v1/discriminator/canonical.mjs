// Canonical serialisation and hashing for the discriminator. Pure; the only import is node:crypto.
import { createHash } from 'node:crypto';

/** Deterministic canonical JSON: sorted object keys, arrays in order, undefined dropped, non-finite numbers refused. */
export function stable(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('NON_FINITE_NUMBER_IN_CANONICAL_VALUE'); return JSON.stringify(v); }
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : stable(x))).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  throw new Error('UNSERIALISABLE_VALUE_IN_CANONICAL_VALUE');
}
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const digest = (v) => sha256(stable(v));
