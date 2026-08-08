/* witness-root.js — sha256-path-null-hash-lf-v1 (GUARDRAILS-v2 §4)
   Fixes an entire witness set with a single hash.
   Record format, no separator between records:
       <relative-path-utf8> 0x00 <lowercase-sha256-hex> 0x0A */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALGORITHM = 'sha256-path-null-hash-lf-v1';
const DEFAULT_GLOB = 'witnesses/**/*.json';

/* Recursive collection under <base>/<dir>, returning POSIX-normalized relative paths. */
function collect(base, dir, out) {
  const abs = path.join(base, dir);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs)) {
    const rel = dir + '/' + name;
    const st = fs.statSync(path.join(base, rel));
    if (st.isDirectory()) collect(base, rel, out);
    else if (name.endsWith('.json')) out.push(rel.split(path.sep).join('/').replace(/^\.\//, ''));
  }
  return out;
}

function byUtf8(a, b) { return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')); }

/* base: directory the witness_path_base resolves to (e.g. results-v2.1/scenario-certification). */
function witnessRoot(base, glob) {
  const g = glob || DEFAULT_GLOB;
  const rootDir = g.split('/')[0];                 // 'witnesses'
  const paths = collect(base, rootDir, []).sort(byUtf8);
  const parts = [];
  for (const p of paths) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(base, p))).digest('hex');
    parts.push(Buffer.from(p, 'utf8'), Buffer.from([0x00]), Buffer.from(h, 'ascii'), Buffer.from([0x0a]));
  }
  const stream = Buffer.concat(parts);
  return {
    witness_root_algorithm: ALGORITHM,
    witness_glob: g,
    witness_count: paths.length,
    record_stream_bytes: stream.length,
    first_witness_path: paths[0] || null,
    last_witness_path: paths[paths.length - 1] || null,
    witness_root_hash: crypto.createHash('sha256').update(stream).digest('hex')
  };
}

module.exports = { ALGORITHM, DEFAULT_GLOB, witnessRoot };
