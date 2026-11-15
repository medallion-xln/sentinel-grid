// Reproducibility manifest of the ORIGINAL DEV run records (dev-runs/, gitignored, left untouched). Reads them only.
// Writes once: evidence/reproducibility/DEV_RUN_MANIFEST.json and evidence/reproducibility/DEV_WORLD_IDENTITIES.json
// (the committed copy of every DEV world identity, so blocks 951/952 and their worlds stay excludable while the raw
// rows are outside Git). RESULT.md's original concatenated hashes are checked, never rewritten.
// Usage (from the lane): node repro/manifest.mjs
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { LANE, GA, DEV_BLOCKS, ok, writeExclusive } from '../lib.mjs';
import { PLAN } from '../../stage3h-canonical-v1/plan.mjs';
import { CONTRACT, normalize, parseJsonl, sha256 } from './normalize.mjs';
import { sourceClosure, BASE_COMMIT } from './source-closure.mjs';

export const SETS = Object.freeze({ DEV288: { of: 1, scheduled: 288 }, FRESH_EXPLORE: { of: 5, scheduled: 12768 }, FRESH_CHECK: { of: 5, scheduled: 12768 } });
export const RESULT_MD_CONCAT = Object.freeze({ DEV288: 'c8513c1b4df356c5', FRESH_EXPLORE: 'b7447db13bba1238', FRESH_CHECK: 'aa46c92c129aded5' });
export const OUT_DIR = resolve(LANE, 'evidence/reproducibility');
const fbytes = (p) => readFileSync(p), fsha = (p) => createHash('sha256').update(fbytes(p)).digest('hex');
export const recordNames = (set) => [...Array(SETS[set].of).keys()].flatMap((i) => [`shard-${i}-of-${SETS[set].of}.jsonl`, `shard-${i}-of-${SETS[set].of}.done.json`]);
export const command = (set, shard) => `node run-dev.mjs ${set} ${shard} ${SETS[set].of}`;
export function runtimeIdentity() { return { node: process.version, execPathSha256: fsha(process.execPath), execArgv: [...process.execArgv], platform: `${process.platform}/${process.arch}` }; }

/** Raw, normalized and field-level identity of every record under one dev-runs directory. */
export function describeRecords(devRuns) {
  const out = {};
  for (const set of Object.keys(SETS)) for (const name of recordNames(set)) {
    const p = resolve(devRuns, set, name); ok(existsSync(p), 'MISSING_RECORD:' + set + '/' + name);
    const raw = readFileSync(p, 'utf8'), norm = normalize(name, raw);
    out[set + '/' + name] = { rawSha256: sha256(raw), normalizedSha256: sha256(norm), sizeBytes: statSync(p).size, normalizedSizeBytes: Buffer.byteLength(norm), rows: name.endsWith('.jsonl') ? parseJsonl(raw).length : 1 };
  }
  return out;
}
/** Concatenated raw shard hash per set, in the shell-glob order used for RESULT.md (`cat shard-*.jsonl`). */
export function concatenated(devRuns, set, norm = false) {
  const h = createHash('sha256');
  for (const name of recordNames(set).filter((n) => n.endsWith('.jsonl')).sort()) { const raw = readFileSync(resolve(devRuns, set, name), 'utf8'); h.update(norm ? normalize(name, raw) : raw); }
  return h.digest('hex');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'repro/manifest.mjs')) {
  const devRuns = resolve(LANE, 'dev-runs'), records = describeRecords(devRuns), closure = sourceClosure(), runtime = runtimeIdentity();
  ok(closure.trackedAllMatchBase && closure.untrackedAllInPackageAndBound, 'SOURCE_CLOSURE_NOT_VERIFIED');
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const devSeeds = Object.values(PLAN.panels).flat();
  const identities = { schema: 'STAGE3H_DEV_WORLD_IDENTITIES_V1', authority: 'R0', baseCommit: BASE_COMMIT,
    rule: 'PERMANENTLY EXCLUDED from every future confirmatory population: whole seed blocks 951 and 952 (every seed in each 10^9 block, not only the scheduled range), the six OPEN development seeds, and every world hash listed here.',
    blocks: { 951: { set: 'FRESH_EXPLORE', base: DEV_BLOCKS.FRESH_EXPLORE, firstScheduledSeed: DEV_BLOCKS.FRESH_EXPLORE, lastScheduledSeed: DEV_BLOCKS.FRESH_EXPLORE + 12767, excludedRange: [951000000000, 951999999999] },
      952: { set: 'FRESH_CHECK', base: DEV_BLOCKS.FRESH_CHECK, firstScheduledSeed: DEV_BLOCKS.FRESH_CHECK, lastScheduledSeed: DEV_BLOCKS.FRESH_CHECK + 12767, excludedRange: [952000000000, 952999999999] } },
    devOpenSeeds: devSeeds, sets: {} };
  const files = {};
  for (const set of Object.keys(SETS)) {
    const rows = recordNames(set).filter((n) => n.endsWith('.jsonl')).flatMap((n) => parseJsonl(readFileSync(resolve(devRuns, set, n), 'utf8'))).sort((a, b) => a.idx - b.idx);
    ok(rows.length === SETS[set].scheduled && rows.every((r, i) => r.idx === i), 'IDENTITY_COVERAGE:' + set);
    identities.sets[set] = { scheduled: rows.length, admitted: rows.filter((r) => !r.rejected).length, seedRule: set === 'DEV288' ? 'stage3h-canonical-v1/plan.mjs combinations()[idx].seed' : `${DEV_BLOCKS[set]} + idx`,
      worldByIdx: rows.map((r) => (r.rejected ? 'REJECTED:' + r.rejected : r.worldHash)) };
    for (let shard = 0; shard < SETS[set].of; shard++) {
      const name = `shard-${shard}-of-${SETS[set].of}`, own = rows.filter((r) => r.idx % SETS[set].of === shard);
      const rejected = {}; for (const r of own.filter((x) => x.rejected)) rejected[r.rejected] = (rejected[r.rejected] ?? 0) + 1;
      const identity = { scheduled: own.length, admitted: own.length - Object.values(rejected).reduce((a, b) => a + b, 0), rejectedByReason: rejected,
        seeds: set === 'DEV288' ? { rule: 'six OPEN panel seeds x 48 cells', distinctSeeds: [...new Set(own.map((r) => r.seed))].sort() } : { block: DEV_BLOCKS[set] / 1e9, first: own[0].seed, last: own[own.length - 1].seed, rule: `idx % ${SETS[set].of} === ${shard}` },
        orderedIdentityListSha256: sha256(JSON.stringify(own.map((r) => [r.idx, r.seed, r.worldHash ?? null, r.rejected ?? null]))) };
      for (const kind of ['.jsonl', '.done.json']) files[`${set}/${name}${kind}`] = { set, shard, of: SETS[set].of, kind: kind === '.jsonl' ? 'ROWS' : 'COMPLETION_MARKER', ...records[`${set}/${name}${kind}`],
        seedBlock: set === 'DEV288' ? 'OPEN development seeds (stage3h-canonical-v1/plan.mjs)' : String(DEV_BLOCKS[set] / 1e9), worldIdentities: identity,
        regenerationCommand: { cwd: 'platform/game-agnostic/stage3h-failure-diagnosis-v1', argv: command(set, shard), writes: [`dev-runs/${set}/${name}.jsonl`, `dev-runs/${set}/${name}.done.json`] } };
    }
  }
  writeExclusive(resolve(OUT_DIR, 'DEV_WORLD_IDENTITIES.json'), identities);
  const logs = readdirSync(resolve(devRuns, 'logs')).sort().map((n) => ({ path: 'logs/' + n, rawSha256: fsha(resolve(devRuns, 'logs', n)), sizeBytes: statSync(resolve(devRuns, 'logs', n)).size, normalized: 'NOT_APPLICABLE (console capture, not a run record)' }));
  const concat = Object.fromEntries(Object.keys(SETS).map((s) => { const raw = concatenated(devRuns, s); return [s, { rawConcatenatedSha256: raw, resultMdPrefix: RESULT_MD_CONCAT[s], matchesResultMd: raw.startsWith(RESULT_MD_CONCAT[s]), normalizedConcatenatedSha256: concatenated(devRuns, s, true) }]; }));
  ok(Object.values(concat).every((c) => c.matchesResultMd), 'RESULT_MD_HASH_MISMATCH');
  const manifest = { schema: 'STAGE3H_DEV_RUN_REPRODUCIBILITY_MANIFEST_V1', authority: 'R0', baseCommit: BASE_COMMIT, recordsLocation: 'platform/game-agnostic/stage3h-failure-diagnosis-v1/dev-runs/ (gitignored; originals untouched)',
    normalization: CONTRACT, runtime: { ...runtime, note: 'recorded at manifest time; the original run used the same node on PATH (v22.22.2, binary 5c899797..., the V4 runtime), not separately recorded then' },
    sourceIdentity: { ...closure, protectedOverlay: 'stage3h-owner-governed-v1/registration/protected-source-package-d8a44ebd.tar.gz (sha256 ecfc7016..., recorded in stage3h-owner-governed-v1/evidence/successor-v4-preflight/clean-clone-verification.json; not committed)' },
    regenerationLayout: 'DEV288: 1 shard; FRESH_EXPLORE and FRESH_CHECK: 5 shards each (idx % 5); shards may run in parallel. The commands write with exclusive creation, so dev-runs/<set>/ must not already contain the shard.',
    worldIdentitiesFile: { path: 'evidence/reproducibility/DEV_WORLD_IDENTITIES.json', sha256: fsha(resolve(OUT_DIR, 'DEV_WORLD_IDENTITIES.json')) },
    resultMdConcatenatedHashes: concat, records: files, auxiliaryLogs: logs };
  writeExclusive(resolve(OUT_DIR, 'DEV_RUN_MANIFEST.json'), manifest);
  console.log(JSON.stringify({ records: Object.keys(files).length, rows: Object.values(files).filter((f) => f.kind === 'ROWS').reduce((a, f) => a + f.rows, 0), logs: logs.length, concat, closure: { files: closure.files, untracked: closure.untracked.length, sha: closure.closureSha256 } }, null, 1));
}
