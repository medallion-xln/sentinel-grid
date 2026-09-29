#!/usr/bin/env node
/* STAGE_3G_3 — sealed partitions (HOLDOUT seed 5021, OOD seed 5031; 5022-5023 / 5032-5033 reserved).
 *
 * The unmodified, benchmark-bound P.1D record builder in canonical order. Any record, world or topology hash claimed by the
 * 80,000-row Stage 3F lineage, the 12,000 Stage 3G.1/3G.2 sealed rows or earlier Stage 3G.3 admissions is rejected. Refuses
 * to run unless the plan, the open-phase report and every evaluation file are committed unchanged at HEAD. `--verify`
 * rebuilds the gitignored payload from committed state, requires the manifest content hash and never writes a tracked file.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { enforceCheckModeReadOnly } from '../certification/check-mode-guard.mjs';
import { FORGE_TOPOLOGY_SHAPE_IDS } from '../../src/forge/topology.js';
import { FORGE_HORIZON_BAND_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_ROLE_COMPOSITION_IDS } from '../../src/forge/scenarios-v2.js';
import { benchmarkBinding, corpusRecord } from '../generate-stage3f6p1d-symmetric-corpus.mjs';
import { stage3fLineage } from '../generate-stage3g-sealed.mjs';
import { OPEN_REPORT_PATH, PLAN_HASH, PLAN_PATH, SEALED_MANIFEST_PATH, SEALED_PATH, SEED_PLAN, SEED_PLAN_HASH } from './plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const G12_SEALED = 'artifacts/stage3g-predictive-integrity/sealed-partitions.jsonl.gz';
const G12_MANIFEST = 'artifacts/stage3g-predictive-integrity/sealed-partitions-manifest.json';
export const G12_SEALED_CONTENT_HASH = '2a7c042ee826a5a73d575c6c9576889e2c7173ed8f1ccc98337373ec16935d8d';
export const EVALUATION_FILES = Object.freeze([PLAN_PATH, OPEN_REPORT_PATH, 'scripts/stage3g3/plan.mjs', 'scripts/stage3g3/evidence.mjs', 'scripts/stage3g3/scorers.mjs',
  'scripts/stage3g3/plan-cli.mjs', 'scripts/stage3g3/generate-sealed.mjs', 'scripts/stage3g3/certify.mjs', 'src/stage3g/prediction-lifecycle-v1.js',
  'tests/stage3g3-prediction-lifecycle.test.js', 'tests/stage3g3-temporal-attribution.test.js']);

const headHash = (f) => { const r = spawnSync('git', ['-C', repo, 'show', `HEAD:platform/game-agnostic/${f}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return r.status === 0 ? hex(r.stdout) : null; };
export function frozenGate() {
  const failures = EVALUATION_FILES.filter((f) => headHash(f) !== hex(readFileSync(at(f)))).map((f) => `${f} is not committed unchanged at HEAD`);
  if (JSON.parse(readFileSync(at(PLAN_PATH), 'utf8')).planHash !== PLAN_HASH) failures.push('plan file differs from the plan module');
  if (JSON.parse(readFileSync(at(OPEN_REPORT_PATH), 'utf8')).planHash !== PLAN_HASH) failures.push('open-phase report is bound to another plan');
  return failures;
}
export function combinations(partition) {
  const out = [];
  for (const seed of SEED_PLAN.declared[partition]) for (const level of SEED_PLAN.levels[partition]) for (const horizonBand of FORGE_HORIZON_BAND_IDS)
    for (const objectives of FORGE_OBJECTIVE_COMPOSITION_IDS) for (const roles of FORGE_ROLE_COMPOSITION_IDS) for (const shape of FORGE_TOPOLOGY_SHAPE_IDS)
      out.push({ shape, roles, objectives, horizonBand, level, seed });
  return out;
}
/** The 92,000-row prior lineage: the Stage 3F lineage plus the Stage 3G.1/3G.2 sealed rows (content-hash verified). */
export function priorLineage() {
  const f = stage3fLineage();
  const m = JSON.parse(readFileSync(at(G12_MANIFEST), 'utf8')); const text = gunzipSync(readFileSync(at(G12_SEALED))).toString('utf8');
  if (hex(text) !== m.contentHash || m.contentHash !== G12_SEALED_CONTENT_HASH) throw new Error('Stage 3G.1/3G.2 sealed payload does not match its manifest and the Stage 3G.3 binding');
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { rows: [...f.rows, ...rows], sources: [...f.sources, { name: 'STAGE3G12', rows: rows.length, verified: true, contentHash: m.contentHash }] };
}
export function seedAudit(prior) {
  const d = SEED_PLAN.declared; const all = [...d.HOLDOUT, ...d.OOD, ...SEED_PLAN.reservedForLaterStage3G.HOLDOUT, ...SEED_PLAN.reservedForLaterStage3G.OOD];
  const used = new Set(prior.map((r) => r.combination.seed));
  return { declared: d, reserved: SEED_PLAN.reservedForLaterStage3G, priorSeedOverlap: all.filter((s) => SEED_PLAN.priorSeedSpaces.includes(s)),
    priorRowOverlap: all.filter((s) => used.has(s)), partitionOverlap: d.HOLDOUT.filter((s) => d.OOD.includes(s)), duplicateCount: all.length - new Set(all).size };
}

async function main(verify) {
  enforceCheckModeReadOnly({ checkOnly: verify });
  const failures = frozenGate();
  if (failures.length) throw new Error(`STAGE3G3_SEALED_GATE_CLOSED: ${failures.join('; ')}`);
  const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const prior = priorLineage(); const audit = seedAudit(prior.rows);
  if (audit.priorSeedOverlap.length || audit.priorRowOverlap.length || audit.partitionOverlap.length || audit.duplicateCount) throw new Error(`STAGE3G3 seed collision: ${JSON.stringify(audit)}`);
  const claimed = { record: new Set(prior.rows.map((r) => r.recordHash)), world: new Set(prior.rows.map((r) => r.worldHash)), topology: new Set(prior.rows.map((r) => r.topologyHash)) };
  const rows = []; const stats = {};
  for (const partition of ['HOLDOUT', 'OOD']) {
    const combos = combinations(partition); const n = SEED_PLAN.sizes[partition];
    const s = { attempted: 0, admitted: 0, rejected: {}, seedsUsed: [] };
    for (let i = 0; i < combos.length && s.admitted < n; i += 1) {
      s.attempted += 1;
      const row = corpusRecord(`STAGE3G3_${partition}`, combos[i], i, { withEquivariance: i % 25 === 0 });
      const reason = !row.admitted ? row.reason : claimed.record.has(row.recordHash) ? 'RECORD_HASH_CLAIMED'
        : claimed.world.has(row.worldHash) ? 'WORLD_HASH_CLAIMED' : claimed.topology.has(row.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
      if (reason) { s.rejected[reason] = (s.rejected[reason] ?? 0) + 1; continue; }
      claimed.record.add(row.recordHash); claimed.world.add(row.worldHash); claimed.topology.add(row.topologyHash);
      rows.push(row); s.admitted += 1;
      if (!s.seedsUsed.includes(combos[i].seed)) s.seedsUsed.push(combos[i].seed);
      if (s.admitted % 1000 === 0) process.stderr.write(`[stage3g3 ${partition}] ${s.admitted}/${n}\n`);
    }
    s.combinationsAvailable = combos.length; stats[partition] = s;
    if (s.admitted !== n) throw new Error(`STAGE3G3 ${partition} insufficient admitted rows: ${s.admitted}/${n}`);
  }
  const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  if (verify) {
    const stored = JSON.parse(readFileSync(at(SEALED_MANIFEST_PATH), 'utf8'));
    const reproduced = stored.contentHash === hex(content) && JSON.stringify(stored.stats) === JSON.stringify(stats);
    if (reproduced) await writeFile(at(SEALED_PATH), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
    console.log(JSON.stringify({ verify: true, reproduced, contentHash: hex(content), storedContentHash: stored.contentHash, generatedAtHead: stored.generatedAtHead, head }, null, 2));
    if (!reproduced) process.exitCode = 1;
    return;
  }
  const manifest = { schemaVersion: 1, stage: 'STAGE_3G_3', planHash: PLAN_HASH, seedPlanHash: SEED_PLAN_HASH, generatedAtHead: head, benchmark: benchmarkBinding(),
    priorLineage: prior.sources, seedAudit: audit, stats, rows: rows.length, contentHash: hex(content), generator: 'scripts/stage3g3/generate-sealed.mjs',
    recordBuilder: 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)' };
  await writeFile(at(SEALED_PATH), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(at(SEALED_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ rows: manifest.rows, contentHash: manifest.contentHash, stats, seedAudit: audit, generatedAtHead: head }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.includes('--verify'));
