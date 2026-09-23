#!/usr/bin/env node
/* STAGE_3F_6_T_SYM — fresh confirmatory partitions for the symmetric router-value requalification.
 *
 * The P.1D/P.1E HOLDOUT and OOD are exposed: P.1E evaluated every policy on them and the costly-action hypothesis was
 * formed there. As the historical Stage 3F.6-T did, fresh confirmatory partitions are generated from seeds the P.1D
 * corpus plan declared but never used (HOLDOUT 2022, OOD 2032), with the unmodified, benchmark-bound P.1D record
 * builder, in canonical combination order. A candidate whose record, world or topology hash is claimed anywhere in the
 * 20000-row lineage, or earlier in the fresh set, is rejected.
 *
 * Refuses to run unless the analysis plan, the open-phase report and the evaluation code are committed unchanged at
 * HEAD. The manifest records that HEAD. `--verify` rebuilds the partitions from committed state and requires the
 * manifest content hash; it rewrites the payload but never the manifest.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { benchmarkBinding, combinationsFor, corpusRecord } from './generate-stage3f6p1d-symmetric-corpus.mjs';
import { STAGE3F6P1D_PLAN } from './stage3f6p1d-corpus-plan.mjs';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import { STAGE3F6TSYM_OUT, STAGE3F6TSYM_PLAN_HASH, STAGE3F6TSYM_PLAN_PATH } from './stage3f6tsym-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const hex = (v) => createHash('sha256').update(v).digest('hex');
export const OPEN_REPORT_PATH = `${STAGE3F6TSYM_OUT}/stage3f6tsym-open-phase-report.json`;
export const FRESH_PATH = `${STAGE3F6TSYM_OUT}/fresh-confirmatory.jsonl.gz`;
export const FRESH_MANIFEST_PATH = `${STAGE3F6TSYM_OUT}/fresh-confirmatory-manifest.json`;
/** Files that must be committed unchanged at HEAD before generation, and unchanged from generation to certification. */
export const EVALUATION_FILES = Object.freeze([STAGE3F6TSYM_PLAN_PATH, OPEN_REPORT_PATH, 'scripts/stage3f6tsym-analysis-plan.mjs',
  'scripts/generate-stage3f6tsym-confirmatory.mjs', 'scripts/certify-stage3f6tsym-router-value.mjs', 'src/stage3f/router-value-v1.js']);
/** Declared-but-unused seeds of the P.1D plan; levels follow the declared partition. */
export const FRESH_SPEC = Object.freeze({
  FRESH_HOLDOUT: { source: 'HOLDOUT', seed: 2022, n: 6000 },
  FRESH_OOD: { source: 'OOD', seed: 2032, n: 6000 },
});

const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
export function freshGate() {
  const failures = [];
  for (const f of EVALUATION_FILES) {
    if (headBytesHash(f) !== hex(readFileSync(path.join(root, f)))) failures.push(`${f} is not committed unchanged at HEAD`);
  }
  if (JSON.parse(readFileSync(path.join(root, STAGE3F6TSYM_PLAN_PATH), 'utf8')).planHash !== STAGE3F6TSYM_PLAN_HASH) failures.push('plan file differs from the plan module');
  if (JSON.parse(readFileSync(path.join(root, OPEN_REPORT_PATH), 'utf8')).planHash !== STAGE3F6TSYM_PLAN_HASH) failures.push('open-phase report is bound to another plan');
  return failures;
}

/** The declared seeds are unused by the lineage and outside every prior seed list. */
export function seedAudit(lineage) {
  const used = new Set(lineage.map((r) => r.combination.seed));
  return Object.fromEntries(Object.entries(FRESH_SPEC).map(([p, s]) => [p, {
    seed: s.seed, declaredForPartition: STAGE3F6P1D_PLAN.seeds[s.source].includes(s.seed), usedByLineage: used.has(s.seed),
    inPriorConsumed: STAGE3F6P1D_PLAN.seeds.priorConsumed.includes(s.seed) }]));
}

async function main({ verify }) {
  const failures = freshGate();
  if (failures.length) throw new Error(`FRESH_GATE_CLOSED: ${failures.join('; ')}`);
  const head = spawnSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const binding = benchmarkBinding();
  const lineage = readCorpus();
  const claimed = { record: new Set(lineage.map((r) => r.recordHash)), world: new Set(lineage.map((r) => r.worldHash)), topology: new Set(lineage.map((r) => r.topologyHash)) };
  const admitted = []; const stats = {};
  for (const [partition, spec] of Object.entries(FRESH_SPEC)) {
    const combos = combinationsFor(spec.source).filter((c) => c.seed === spec.seed);
    const s = { attempted: 0, admitted: 0, rejected: {} };
    for (let index = 0; index < combos.length && s.admitted < spec.n; index += 1) {
      s.attempted += 1;
      const record = corpusRecord(partition, combos[index], index, { withEquivariance: index % 25 === 0 });
      const reason = !record.admitted ? record.reason : claimed.record.has(record.recordHash) ? 'RECORD_HASH_CLAIMED'
        : claimed.world.has(record.worldHash) ? 'WORLD_HASH_CLAIMED' : claimed.topology.has(record.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
      if (reason !== null) { s.rejected[reason] = (s.rejected[reason] ?? 0) + 1; continue; }
      claimed.record.add(record.recordHash); claimed.world.add(record.worldHash); claimed.topology.add(record.topologyHash);
      admitted.push(record); s.admitted += 1;
      if (s.admitted % 1000 === 0) process.stderr.write(`[stage3f6tsym ${partition}] ${s.admitted}/${spec.n}\n`);
    }
    s.combinationsAvailable = combos.length;
    stats[partition] = s;
  }
  const content = `${admitted.map((r) => JSON.stringify(r)).join('\n')}\n`;
  if (verify) {
    const stored = JSON.parse(readFileSync(path.join(root, FRESH_MANIFEST_PATH), 'utf8'));
    const reproduced = stored.contentHash === hex(content) && JSON.stringify(stored.stats) === JSON.stringify(stats);
    if (reproduced) await writeFile(path.join(root, FRESH_PATH), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
    console.log(JSON.stringify({ verify: true, reproduced, contentHash: hex(content), storedContentHash: stored.contentHash, generatedAtHead: stored.generatedAtHead, head }, null, 2));
    if (!reproduced) process.exitCode = 1;
    return;
  }
  const manifest = { schemaVersion: 1, extensionOf: STAGE3F6P1D_PLAN.corpusId, planHash: STAGE3F6TSYM_PLAN_HASH, generatedAtHead: head, benchmark: binding,
    spec: FRESH_SPEC, seedAudit: seedAudit(lineage), stats, rows: admitted.length, contentHash: hex(content),
    generator: 'scripts/generate-stage3f6tsym-confirmatory.mjs', recordBuilder: 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)' };
  await writeFile(path.join(root, FRESH_PATH), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(path.join(root, FRESH_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ rows: manifest.rows, contentHash: manifest.contentHash, stats, seedAudit: manifest.seedAudit }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main({ verify: process.argv.includes('--verify') });
}
