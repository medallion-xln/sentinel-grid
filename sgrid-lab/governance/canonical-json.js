/* canonical-json.js — canonical-json-v1 (GUARDRAILS-v2 §2.2)
   Deterministic JSON serialization for manifest hashing.
   CommonJS, no dependencies, matches sgrid-lab house style. */
'use strict';
const crypto = require('crypto');

const ALGORITHM = 'canonical-json-v1';

function esc(s) {
  let o = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '"') o += '\\"';
    else if (ch === '\\') o += '\\\\';
    else if (c < 0x20) o += '\\u' + c.toString(16).padStart(4, '0');
    else o += ch;
  }
  return '"' + o + '"';
}

function num(n) {
  if (!Number.isFinite(n)) throw new Error('canonical-json: non-finite number ' + n);
  if (Number.isInteger(n)) return String(n);
  return JSON.stringify(n);
}

/* Sort keys by bytewise ascending order of their UTF-8 encoding (§2.2.1). */
function byUtf8(a, b) { return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')); }

function canonicalize(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') return num(v);
  if (t === 'string') return esc(v);
  if (t === 'undefined') throw new Error('canonical-json: undefined is rejected');
  if (t === 'function') throw new Error('canonical-json: function is rejected');
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(v).sort(byUtf8);
    return '{' + keys.map(k => esc(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  throw new Error('canonical-json: unsupported type ' + t);
}

function canonicalBytes(v) { return Buffer.from(canonicalize(v), 'utf8'); }
function hashObject(v) { return crypto.createHash('sha256').update(canonicalBytes(v)).digest('hex'); }
function hashFileBytes(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

module.exports = { ALGORITHM, canonicalize, canonicalBytes, hashObject, hashFileBytes };
