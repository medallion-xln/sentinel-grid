#!/usr/bin/env node
/* STAGE_3G_6 — level-balanced partitions.
 *
 *   --fit           the OPEN fit set (seed 6012, levels 0-7 x bands H0-H4, 60 per cell); allowed before the freeze
 *   --verify-fit    rebuild it from committed state and require the manifest content hash (never writes a tracked file)
 *   (default)       the SEALED seed families A (7021) and B (7031), levels 0-7 x bands H0-H4, 190 per cell; refuses unless
 *                   the plan, open report, fit manifest, specification and every evaluation file are committed at HEAD
 *   --verify        rebuild the sealed payload and require the manifest content hash (never writes a tracked file)
 * Unmodified, benchmark-bound P.1D corpusRecord; per (seed, level, band) cell, combinations in canonical objectives > roles >
 * shape order until the quota is admitted. Any record / world / topology hash claimed by the 121,600-row prior lineage, the
 * fit set (for sealed rows) or an earlier admission is rejected.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { enforceCheckModeReadOnly } from '../certification/check-mode-guard.mjs';
import { FORGE_TOPOLOGY_SHAPE_IDS } from '../../src/forge/topology.js';
import { FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_ROLE_COMPOSITION_IDS } from '../../src/forge/scenarios-v2.js';
import { benchmarkBinding, corpusRecord } from '../generate-stage3f6p1d-symmetric-corpus.mjs';
import { priorLineage as g3PriorLineage, readFitRows as g4FitRows } from '../stage3g5/generate.mjs';
import { FIT_MANIFEST_PATH, FIT_PATH, HORIZON_BANDS, LEVELS, OPEN_REPORT_PATH, PLAN_HASH, PLAN_PATH, SEALED_MANIFEST_PATH, SEALED_PATH, SEED_PLAN, SEED_PLAN_HASH, } from './plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const G3_SEALED = 'artifacts/stage3g5-observable-model-search/sealed-partitions.jsonl.gz';
const G3_MANIFEST = 'artifacts/stage3g5-observable-model-search/sealed-partitions-manifest.json';
export const G3_SEALED_CONTENT_HASH = '2430e1f03b965600469016f8e9ec332c34f4642952f70b9d195957816d4e5d57';
export const EVALUATION_FILES = Object.freeze([PLAN_PATH, OPEN_REPORT_PATH, FIT_MANIFEST_PATH, 'docs/STAGE3G6_SPECIFICATION.md', 'scripts/stage3g6/plan.mjs', 'scripts/stage3g6/generate.mjs', 'scripts/stage3g6/plan-cli.mjs', 'scripts/stage3g6/evidence.mjs', 'scripts/stage3g6/prepare.mjs', 'scripts/stage3g6/certify.mjs', 'scripts/stage3g6/statistics.mjs', 'scripts/stage3g6/full-suite.mjs', 'src/stage3g/observable-action-surface-v1.js', 'tests/stage3g6-action-surface.test.js']);

const readGzRows = (f) => { const t = gunzipSync(readFileSync(at(f))).toString('utf8'); return { text: t, rows: t.split('\n').filter(Boolean).map((l) => JSON.parse(l)) }; };
/** The 121,600-row prior lineage: Stage 3F (80,000) + Stage 3G.1/3G.2 sealed (12,000) + Stage 3G.3 sealed (12,000), content-hash verified. */
export function priorLineage() {
  const p = g3PriorLineage(); const m = JSON.parse(readFileSync(at(G3_MANIFEST), 'utf8')); const { text, rows } = readGzRows(G3_SEALED);
  if (hex(text) !== m.contentHash || m.contentHash !== G3_SEALED_CONTENT_HASH) throw new Error('Stage 3G.3 sealed payload does not match its manifest and the Stage 3G.4 binding');
  return { rows: [...p.rows, ...g4FitRows(), ...rows], sources: [...p.sources, { name: 'STAGE3G5_PLUS_OPEN_FIT', rows: rows.length + g4FitRows().length, verified: true, contentHash: m.contentHash, fitContentHash: JSON.parse(readFileSync(at('artifacts/stage3g5-observable-model-search/fit-set-manifest.json'), 'utf8')).contentHash }] };
}
export function readFitRows() {
  const m = JSON.parse(readFileSync(at(FIT_MANIFEST_PATH), 'utf8')); const { text, rows } = readGzRows(FIT_PATH);
  if (hex(text) !== m.contentHash) throw new Error('fit-set payload does not match its manifest');
  return rows;
}
export function seedAudit(prior) {
  const seeds = [SEED_PLAN.families.A, SEED_PLAN.families.B, SEED_PLAN.fit]; const used = new Set(prior.map((r) => r.combination.seed));
  return { seeds, priorRowOverlap: seeds.filter((s) => used.has(s)), stillReservedTouched: seeds.filter((s) => SEED_PLAN.reservedUntouched.includes(s)),
    fitInPriorSeedSpaces: SEED_PLAN.priorSeedSpaces.includes(SEED_PLAN.fit), familiesDistinct: new Set(seeds).size === seeds.length };
}
const headHash = (f) => { const r = spawnSync('git', ['-C', repo, 'show', `HEAD:platform/game-agnostic/${f}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return r.status === 0 ? hex(r.stdout) : null; };
export function frozenGate() {
  const failures = EVALUATION_FILES.filter((f) => headHash(f) !== hex(readFileSync(at(f)))).map((f) => `${f} is not committed unchanged at HEAD`);
  if (JSON.parse(readFileSync(at(PLAN_PATH), 'utf8')).planHash !== PLAN_HASH) failures.push('plan file differs from the plan module');
  if (JSON.parse(readFileSync(at(OPEN_REPORT_PATH), 'utf8')).planHash !== PLAN_HASH) failures.push('open-phase report is bound to another plan');
  return failures;
}
const cellCombos = (seed, level, horizonBand) => { const out=[];
  // Every complete eight-row round covers all objective compositions. For each objective,
  // (role,shape) visits every pair exactly once; permutations use declared composition indices, never outcomes.
  for(let round=0;round<FORGE_ROLE_COMPOSITION_IDS.length*FORGE_TOPOLOGY_SHAPE_IDS.length;round++)for(let j=0;j<FORGE_OBJECTIVE_COMPOSITION_IDS.length;j++)out.push({shape:FORGE_TOPOLOGY_SHAPE_IDS[(Math.floor(round/FORGE_ROLE_COMPOSITION_IDS.length)+j)%FORGE_TOPOLOGY_SHAPE_IDS.length],roles:FORGE_ROLE_COMPOSITION_IDS[(round+j)%FORGE_ROLE_COMPOSITION_IDS.length],objectives:FORGE_OBJECTIVE_COMPOSITION_IDS[j],horizonBand,level,seed});return out; };

function build(partitions, quota, claimed) {
  const checkpoint=at(`build/stage3g6/generation-${partitions[0][0]}.json`); mkdirSync(at('build/stage3g6'),{recursive:true}); const checkpointKey=hex(readFileSync(new URL('./generate.mjs',import.meta.url)))+SEED_PLAN_HASH; const saved=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint)):null; if(saved&&saved.key!==checkpointKey)throw new Error('GENERATOR_CHECKPOINT_SOURCE_DRIFT'); const savedRows=saved?.rows??[]; let savedIndex=0; const rows = []; const stats = {};
  for (const [partition, seed] of partitions) {
    const s = { cells: {}, attempted: 0, admitted: 0 }; let index = 0;
    for (const level of LEVELS) for (const band of HORIZON_BANDS) {
      const combos = cellCombos(seed, level, band); const cell = { attempted: 0, admitted: 0, rejected: {}, available: combos.length };
      for (let i = 0; i < combos.length && cell.admitted < quota; i += 1) {
        cell.attempted += 1; s.attempted += 1;
        const stored=savedRows[savedIndex]; const row=stored&&stored.partition===partition&&stored.combinationIndex===index?stored:corpusRecord(partition, combos[i], index, { withEquivariance: index % 25 === 0 }); index += 1;
        const objectiveCount=rows.filter(r=>r.partition===partition&&r.combination.level===level&&r.combination.horizonBand===band&&r.combination.objectives===combos[i].objectives).length;
        const reason = objectiveCount>=quota/FORGE_OBJECTIVE_COMPOSITION_IDS.length?'OBJECTIVE_QUOTA_FILLED':!row.admitted ? row.reason : claimed.record.has(row.recordHash) ? 'RECORD_HASH_CLAIMED'
          : claimed.world.has(row.worldHash) ? 'WORLD_HASH_CLAIMED' : claimed.topology.has(row.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
        if (reason) { cell.rejected[reason] = (cell.rejected[reason] ?? 0) + 1; continue; }
        claimed.record.add(row.recordHash); claimed.world.add(row.worldHash); claimed.topology.add(row.topologyHash);
        rows.push(row); if(row===savedRows[savedIndex])savedIndex++; cell.admitted += 1; s.admitted += 1; if(rows.length%20===0){writeFileSync(checkpoint+'.tmp',JSON.stringify({key:checkpointKey,rows}));spawnSync('mv',[checkpoint+'.tmp',checkpoint]);}
      }
      if (cell.admitted !== quota) throw new Error(`STAGE3G6 ${partition} L${level} ${band}: ${cell.admitted}/${quota}`);
      s.cells[`L${level}:${band}`] = cell;
      process.stderr.write(`[stage3g6 ${partition}] L${level} ${band} ${cell.admitted}\n`);
    }
    stats[partition] = s;
  }
  return { rows, stats };
}

async function main({ fit, verify }) {
  enforceCheckModeReadOnly({ checkOnly: verify });
  const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  if (!fit) { const failures = frozenGate(); if (failures.length) throw new Error(`STAGE3G6_SEALED_GATE_CLOSED: ${failures.join('; ')}`); }
  if (!verify && existsSync(at(fit ? FIT_MANIFEST_PATH : SEALED_MANIFEST_PATH))) throw new Error('STAGE3G6_SINGLE_GENERATION_ONLY: use --verify for reproduction');
  const prior = priorLineage(); const audit = seedAudit(prior.rows);
  if (audit.priorRowOverlap.length || audit.stillReservedTouched.length || audit.fitInPriorSeedSpaces || !audit.familiesDistinct) throw new Error(`STAGE3G6 seed collision: ${JSON.stringify(audit)}`);
  const lineageRows = fit ? prior.rows : [...prior.rows, ...readFitRows()];
  const claimed = { record: new Set(lineageRows.map((r) => r.recordHash)), world: new Set(lineageRows.map((r) => r.worldHash)), topology: new Set(lineageRows.map((r) => r.topologyHash)) };
  const { rows, stats } = fit ? build([['STAGE3G6_FIT', SEED_PLAN.fit]], SEED_PLAN.quotas.fitPerLevelBand, claimed)
    : build([['STAGE3G6_A', SEED_PLAN.families.A], ['STAGE3G6_B', SEED_PLAN.families.B]], SEED_PLAN.quotas.sealedPerFamilyLevelBand, claimed);
  const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  mkdirSync(at('build/stage3g6'),{recursive:true});
  const [payloadPath, manifestPath] = fit ? [FIT_PATH, FIT_MANIFEST_PATH] : [SEALED_PATH, SEALED_MANIFEST_PATH];
  if (verify) {
    const stored = JSON.parse(readFileSync(at(manifestPath), 'utf8'));
    const reproduced = stored.contentHash === hex(content) && JSON.stringify(stored.stats) === JSON.stringify(stats);
    if (reproduced && !existsSync(at(payloadPath))) await writeFile(at(payloadPath), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
    console.log(JSON.stringify({ verify: true, fit, reproduced, contentHash: hex(content), storedContentHash: stored.contentHash, generatedAtHead: stored.generatedAtHead, head }, null, 2));
    if (!reproduced) process.exitCode = 1;
    return;
  }
  const manifest = { schemaVersion: 1, stage: 'STAGE_3G_6', kind: fit ? 'OPEN_FIT_SET' : 'SEALED', ...(fit ? {} : { planHash: PLAN_HASH }), seedPlanHash: SEED_PLAN_HASH,
    generatedAtHead: head, benchmark: benchmarkBinding(), priorLineage: prior.sources, seedAudit: audit, stats, rows: rows.length, contentHash: hex(content),
    generator: 'scripts/stage3g6/generate.mjs', recordBuilder: 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)' };
  await writeFile(at(payloadPath), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(at(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ kind: manifest.kind, rows: manifest.rows, contentHash: manifest.contentHash, seedAudit: audit, generatedAtHead: head }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main({ fit: process.argv.includes('--fit') || process.argv.includes('--verify-fit'), verify: process.argv.includes('--verify') || process.argv.includes('--verify-fit') });
