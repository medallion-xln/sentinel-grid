import { createHash } from 'node:crypto';
import { ContractError } from './errors.js';

const UINT64_MASK = (1n << 64n) - 1n;
const TWO_POW_53 = 9007199254740992;

function canonicalizeNumber(value) {
  if (Number.isNaN(value)) return { $number: 'NaN' };
  if (value === Infinity) return { $number: 'Infinity' };
  if (value === -Infinity) return { $number: '-Infinity' };
  if (Object.is(value, -0)) return { $number: '-0' };
  return value;
}

function canonicalizeInternal(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return canonicalizeNumber(value);
  if (typeof value === 'bigint') return { $bigint: value.toString(10) };
  if (typeof value === 'undefined') return { $undefined: true };
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new ContractError(`Unsupported deterministic value type: ${typeof value}`);
  }

  if (ancestors.has(value)) throw new ContractError('Cannot canonicalize a cyclic value');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => canonicalizeInternal(entry, ancestors));

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new ContractError('Invalid Date cannot be canonicalized');
      return { $date: value.toISOString() };
    }

    if (ArrayBuffer.isView(value)) {
      return {
        $typedArray: value.constructor.name,
        values: Array.from(value, (entry) => canonicalizeNumber(Number(entry))),
      };
    }

    if (value instanceof ArrayBuffer) {
      return { $arrayBuffer: Array.from(new Uint8Array(value)) };
    }

    if (value instanceof Map) {
      const entries = [...value.entries()].map(([key, entryValue]) => {
        const canonicalKey = canonicalizeInternal(key, ancestors);
        const canonicalValue = canonicalizeInternal(entryValue, ancestors);
        return [canonicalKey, canonicalValue];
      });
      entries.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
      return { $map: entries };
    }

    if (value instanceof Set) {
      const entries = [...value].map((entry) => canonicalizeInternal(entry, ancestors));
      entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      return { $set: entries };
    }

    const constructorName = value.constructor?.name;
    const entries = Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeInternal(value[key], ancestors)]);
    const object = Object.fromEntries(entries);
    if (constructorName && constructorName !== 'Object') {
      return { $class: constructorName, value: object };
    }
    return object;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalize(value) {
  return canonicalizeInternal(value, new Set());
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

export function normalizeSeed(seed) {
  if (typeof seed === 'bigint') return BigInt.asUintN(64, seed);
  if (typeof seed === 'number' && Number.isSafeInteger(seed)) return BigInt.asUintN(64, BigInt(seed));
  if (typeof seed === 'string' && /^-?\d+$/.test(seed)) return BigInt.asUintN(64, BigInt(seed));
  throw new ContractError('Seed must be a bigint, safe integer, or base-10 integer string');
}

export function deriveSeed(seed, ...parts) {
  const base = normalizeSeed(seed).toString(10);
  const digest = sha256([base, ...parts]);
  return BigInt(`0x${digest.slice(0, 16)}`);
}

export function createSeededRandom(seed) {
  let state = normalizeSeed(seed);
  return function random() {
    state = (state + 0x9e3779b97f4a7c15n) & UINT64_MASK;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
    z ^= z >> 31n;
    return Number(z >> 11n) / TWO_POW_53;
  };
}

export function seededUnitFloat(seed, ...parts) {
  return createSeededRandom(deriveSeed(seed, ...parts))();
}

export function randomInt(random, minInclusive, maxExclusive) {
  if (typeof random !== 'function') throw new ContractError('random must be a function');
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive) || maxExclusive <= minInclusive) {
    throw new ContractError('randomInt requires an integer range where maxExclusive > minInclusive');
  }
  return minInclusive + Math.floor(random() * (maxExclusive - minInclusive));
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}
