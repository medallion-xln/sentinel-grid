// STAGE3H_DEV_RUN_NORMALIZATION_V1: deterministic normalization of the raw DEV run records written by run-dev.mjs.
// Removes ONLY the two wall-clock fields the writer records; every other field, value, key order and the row order is
// preserved. Refuses (throws) unless each raw record re-serializes byte-identically, which proves the normalized bytes
// differ from the raw bytes by the removed fields alone. rowDiff() compares two record sets field by field and reports
// every differing path other than the removed timing fields; it never treats a scientific difference as noise.
import { createHash } from 'node:crypto';

export const NORMALIZATION_ID = 'STAGE3H_DEV_RUN_NORMALIZATION_V1';
export const CONTRACT = Object.freeze({
  id: NORMALIZATION_ID,
  records: {
    'dev-runs/<set>/shard-<i>-of-<n>.jsonl': { removed: ['$[row].ms'], reason: 'per-world wall-clock milliseconds (run-dev.mjs diagnoseWorld: Math.round(performance.now() - t0)); present on admitted rows only' },
    'dev-runs/<set>/shard-<i>-of-<n>.done.json': { removed: ['$.seconds'], reason: 'per-shard wall-clock seconds' },
  },
  preserved: 'every other field and value, object key order, row order and row count',
  serialization: 'JSONL: each line JSON.stringify(row without ms), joined by "\\n" with a trailing "\\n". done.json: JSON.stringify(record without seconds, null, 1) + "\\n"',
  precondition: 'every raw line equals JSON.stringify(JSON.parse(line)) and every done.json equals JSON.stringify(parsed, null, 1) + "\\n"; otherwise NORMALIZATION_REFUSED',
  notNormalized: 'identity.frozenAgrees can become "ERROR:COMPUTE_LIMIT_OR_SOURCE_MISMATCH" if a frozen lock exceeds its 1,000 ms assertion; it is a scientific integrity field, is NOT removed, and any change is reported as a difference',
  hash: 'sha256 of the normalized UTF-8 bytes',
});
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const refuse = (m) => { throw Error('NORMALIZATION_REFUSED:' + m); };

export function parseJsonl(text) {
  if (text.length && !text.endsWith('\n')) refuse('NO_TRAILING_NEWLINE');
  return text.split('\n').slice(0, -1).map((line, i) => { const row = JSON.parse(line); if (JSON.stringify(row) !== line) refuse('NOT_ROUND_TRIP_IDENTICAL_LINE_' + i); return row; });
}
export function normalizeJsonl(text) {
  return parseJsonl(text).map((row) => { const { ms, ...rest } = row; return JSON.stringify(rest); }).join('\n') + '\n';
}
export function normalizeDone(text) {
  const rec = JSON.parse(text); if (JSON.stringify(rec, null, 1) + '\n' !== text) refuse('NOT_ROUND_TRIP_IDENTICAL_DONE');
  const { seconds, ...rest } = rec; return JSON.stringify(rest, null, 1) + '\n';
}
export const normalize = (name, text) => (name.endsWith('.jsonl') ? normalizeJsonl(text) : name.endsWith('.done.json') ? normalizeDone(text) : refuse('UNKNOWN_RECORD_TYPE'));

/** Every differing leaf path between two values, collapsing array indices to []. */
function diffPaths(a, b, path, out) {
  if (a === b) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keysA = Object.keys(a), keysB = Object.keys(b);
    if (!Array.isArray(a) && JSON.stringify(keysA) !== JSON.stringify(keysB)) out.add(path + '{keys}');
    for (const k of new Set([...keysA, ...keysB])) diffPaths(a[k], b[k], path + (Array.isArray(a) ? '[]' : '.' + k), out);
    return;
  }
  out.add(path);
}
/** Field-level comparison of two raw record texts. Timing-only differences are counted separately from all others. */
export function rowDiff(name, rawA, rawB) {
  const timing = name.endsWith('.jsonl') ? '$.ms' : '$.seconds';
  const rowsA = name.endsWith('.jsonl') ? parseJsonl(rawA) : [JSON.parse(rawA)], rowsB = name.endsWith('.jsonl') ? parseJsonl(rawB) : [JSON.parse(rawB)];
  const paths = new Map(); let rowsWithScientificDifference = 0, rowsWithTimingDifference = 0;
  for (let i = 0; i < Math.max(rowsA.length, rowsB.length); i++) {
    const out = new Set(); diffPaths(rowsA[i], rowsB[i], '$', out);
    if (out.has(timing)) rowsWithTimingDifference++;
    out.delete(timing);
    if (out.size) { rowsWithScientificDifference++; for (const p of out) paths.set(p, (paths.get(p) ?? 0) + 1); }
  }
  return { rows: [rowsA.length, rowsB.length], rowCountEqual: rowsA.length === rowsB.length, rowsWithTimingDifference, rowsWithScientificDifference, scientificDifferencePaths: Object.fromEntries(paths) };
}
