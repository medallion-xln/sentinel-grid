#!/usr/bin/env node
/* STAGE_3F_6_P_1_SYM — fresh confirmatory partitions from the NEWLY DECLARED sealed seed space.
 *
 * Every HOLDOUT/OOD seed the P.1D plan declared is consumed (P.1D, 3F.6-T-SYM, P.1A-SYM). This stage declares a new
 * space in its analysis plan (HOLDOUT 3021-3023, OOD 3031-3033) and generates from it with the unmodified,
 * benchmark-bound P.1D record builder in canonical combination order. A candidate whose record, world or topology hash
 * is claimed anywhere in the prior lineage (P.1D corpus, T-SYM fresh, P.1A-SYM fresh), or earlier in this set, is
 * rejected.
 *
 * Refuses to run unless the plan, the open-phase report and every evaluation file are committed unchanged at HEAD; the
 * manifest records that HEAD. `--verify` rebuilds from committed state and requires the manifest content hash.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FORGE_TOPOLOGY_SHAPE_IDS } from '../src/forge/topology.js';
import { FORGE_HORIZON_BAND_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_ROLE_COMPOSITION_IDS } from '../src/forge/scenarios-v2.js';
import { benchmarkBinding, corpusRecord } from './generate-stage3f6p1d-symmetric-corpus.mjs';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import { STAGE3F6P1SYM_OUT, STAGE3F6P1SYM_PLAN, STAGE3F6P1SYM_PLAN_HASH, STAGE3F6P1SYM_PLAN_PATH, STAGE3F6P1SYM_SEED_PLAN, STAGE3F6P1SYM_SEED_PLAN_HASH } from './stage3f6p1sym-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const hex = (v) => createHash('sha256').update(v).digest('hex');
export const OPEN_REPORT_PATH = `${STAGE3F6P1SYM_OUT}/stage3f6p1sym-open-phase-report.json`;
export const FRESH_PATH = `${STAGE3F6P1SYM_OUT}/fresh-confirmatory.jsonl.gz`;
export const FRESH_MANIFEST_PATH = `${STAGE3F6P1SYM_OUT}/fresh-confirmatory-manifest.json`;
export const EVALUATION_FILES = Object.freeze([STAGE3F6P1SYM_PLAN_PATH, OPEN_REPORT_PATH, 'scripts/stage3f6p1sym-analysis-plan.mjs', 'scripts/generate-stage3f6p1sym-confirmatory.mjs',
  'scripts/stage3f6p1sym-evidence.mjs', 'scripts/certify-stage3f6p1sym-nexus.mjs', 'src/stage3f/nexus-requalification-v1.js']);
export const FRESH_PARTITIONS = Object.freeze({ P1SYM_HOLDOUT: 'HOLDOUT', P1SYM_OOD: 'OOD' });
const PRIOR_FRESH = [
  { name: 'T-SYM', payload: 'artifacts/stage3f6tsym-router-value/fresh-confirmatory.jsonl.gz', manifest: 'artifacts/stage3f6tsym-router-value/fresh-confirmatory-manifest.json',
    expected: STAGE3F6P1SYM_PLAN.predecessors.tsymFreshContentHash },
  { name: 'P.1A-SYM', payload: 'artifacts/stage3f6p1asym-free-action/fresh-confirmatory.jsonl.gz', manifest: 'artifacts/stage3f6p1asym-free-action/fresh-confirmatory-manifest.json',
    expected: STAGE3F6P1SYM_PLAN.predecessors.p1asymFreshContentHash },
];

/** The whole prior lineage (44000 rows), each payload verified against its committed manifest and the plan. */
export function readPriorLineage() {
  const rows = readCorpus();
  const sources = [{ name: 'P.1D', rows: rows.length, verified: true }];
  for (const p of PRIOR_FRESH) {
    const text = gunzipSync(readFileSync(path.join(root, p.payload))).toString('utf8');
    const m = JSON.parse(readFileSync(path.join(root, p.manifest), 'utf8'));
    const verified = hex(text) === m.contentHash && m.contentHash === p.expected;
    if (!verified) throw new Error(`PRIOR_LINEAGE_MISMATCH: ${p.name} payload does not match its manifest and the plan`);
    const r = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    rows.push(...r); sources.push({ name: p.name, rows: r.length, verified });
  }
  return { rows, sources };
}

/** Canonical order, identical to P.1D combinationsFor: seed > level > horizon band > objectives > roles > shape. */
export function combinationsFor(partition) {
  const out = [];
  for (const seed of STAGE3F6P1SYM_SEED_PLAN.declared[partition]) for (const level of STAGE3F6P1SYM_SEED_PLAN.levels[partition]) for (const horizonBand of FORGE_HORIZON_BAND_IDS) {
    for (const objectives of FORGE_OBJECTIVE_COMPOSITION_IDS) for (const roles of FORGE_ROLE_COMPOSITION_IDS) for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) out.push({ shape, roles, objectives, horizonBand, level, seed });
  }
  return out;
}

/** Declared seeds are disjoint from every prior seed and from each other; no prior row carries them. */
export function seedAudit(prior) {
  const used = new Set(prior.map((r) => r.combination.seed));
  const d = STAGE3F6P1SYM_SEED_PLAN.declared; const all = [...d.HOLDOUT, ...d.OOD];
  return { declared: d, overlapWithPriorSeeds: all.filter((s) => STAGE3F6P1SYM_SEED_PLAN.priorSeeds.includes(s)),
    usedByPriorRows: all.filter((s) => used.has(s)), holdoutOodOverlap: d.HOLDOUT.filter((s) => d.OOD.includes(s)), duplicates: all.length - new Set(all).size };
}

const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
export function freshGate() {
  const failures = [];
  for (const f of EVALUATION_FILES) if (headBytesHash(f) !== hex(readFileSync(path.join(root, f)))) failures.push(`${f} is not committed unchanged at HEAD`);
  if (JSON.parse(readFileSync(path.join(root, STAGE3F6P1SYM_PLAN_PATH), 'utf8')).planHash !== STAGE3F6P1SYM_PLAN_HASH) failures.push('plan file differs from the plan module');
  if (JSON.parse(readFileSync(path.join(root, OPEN_REPORT_PATH), 'utf8')).planHash !== STAGE3F6P1SYM_PLAN_HASH) failures.push('open-phase report is bound to another plan');
  return failures;
}

async function main({ verify }) {
  const failures = freshGate();
  if (failures.length) throw new Error(`FRESH_GATE_CLOSED: ${failures.join('; ')}`);
  const head = spawnSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const binding = benchmarkBinding();
  const prior = readPriorLineage();
  const audit = seedAudit(prior.rows);
  if (audit.overlapWithPriorSeeds.length || audit.usedByPriorRows.length || audit.holdoutOodOverlap.length || audit.duplicates) throw new Error(`SEED_OVERLAP: ${JSON.stringify(audit)}`);
  const claimed = { record: new Set(prior.rows.map((r) => r.recordHash)), world: new Set(prior.rows.map((r) => r.worldHash)), topology: new Set(prior.rows.map((r) => r.topologyHash)) };
  const admitted = []; const stats = {};
  for (const [partition, source] of Object.entries(FRESH_PARTITIONS)) {
    const combos = combinationsFor(source); const n = STAGE3F6P1SYM_SEED_PLAN.sizes[source];
    const s = { attempted: 0, admitted: 0, rejected: {}, seedsUsed: [] };
    for (let index = 0; index < combos.length && s.admitted < n; index += 1) {
      s.attempted += 1;
      const record = corpusRecord(partition, combos[index], index, { withEquivariance: index % 25 === 0 });
      const reason = !record.admitted ? record.reason : claimed.record.has(record.recordHash) ? 'RECORD_HASH_CLAIMED'
        : claimed.world.has(record.worldHash) ? 'WORLD_HASH_CLAIMED' : claimed.topology.has(record.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
      if (reason !== null) { s.rejected[reason] = (s.rejected[reason] ?? 0) + 1; continue; }
      claimed.record.add(record.recordHash); claimed.world.add(record.worldHash); claimed.topology.add(record.topologyHash);
      admitted.push(record); s.admitted += 1;
      if (!s.seedsUsed.includes(combos[index].seed)) s.seedsUsed.push(combos[index].seed);
      if (s.admitted % 1000 === 0) process.stderr.write(`[stage3f6p1sym ${partition}] ${s.admitted}/${n}\n`);
    }
    s.combinationsAvailable = combos.length; stats[partition] = s;
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
  const manifest = { schemaVersion: 1, extensionOf: 'FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1', planHash: STAGE3F6P1SYM_PLAN_HASH, seedPlanHash: STAGE3F6P1SYM_SEED_PLAN_HASH,
    generatedAtHead: head, benchmark: binding, priorLineage: prior.sources, seedAudit: audit, stats, rows: admitted.length, contentHash: hex(content),
    generator: 'scripts/generate-stage3f6p1sym-confirmatory.mjs', recordBuilder: 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)' };
  await writeFile(path.join(root, FRESH_PATH), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(path.join(root, FRESH_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ rows: manifest.rows, contentHash: manifest.contentHash, stats, seedAudit: audit }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main({ verify: process.argv.includes('--verify') });
}
