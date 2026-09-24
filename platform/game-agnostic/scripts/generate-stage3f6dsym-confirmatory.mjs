#!/usr/bin/env node
/* Sealed D-SYM partitions: requires the committed analysis freeze before generating any row. */
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
import { readPriorLineage } from './generate-stage3f6wsym-confirmatory.mjs';
import { OUT, PLAN_HASH, PLAN_PATH, FREEZE_PATH, SEED_PLAN, SEED_PLAN_HASH } from './stage3f6dsym-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
export const FRESH_PATH = `${OUT}/fresh-confirmatory.jsonl.gz`;
export const MANIFEST_PATH = `${OUT}/fresh-confirmatory-manifest.json`;
export const EVALUATION_FILES = Object.freeze([PLAN_PATH, FREEZE_PATH, 'scripts/stage3f6dsym-analysis-plan.mjs', 'scripts/stage3f6dsym-freeze.mjs',
  'scripts/generate-stage3f6dsym-confirmatory.mjs', 'scripts/certify-stage3f6dsym-decision-rule.mjs', 'tests/stage3f6dsym-decision-rule.test.js']);
const W_FRESH = 'artifacts/stage3f6wsym-risk-requalification/fresh-confirmatory.jsonl.gz';
const W_MANIFEST = 'artifacts/stage3f6wsym-risk-requalification/fresh-confirmatory-manifest.json';
const headHash = (f) => { const r = spawnSync('git', ['-C', repo, 'show', `HEAD:platform/game-agnostic/${f}`], { encoding: 'buffer' });
  return r.status === 0 ? hex(r.stdout) : null; };
export function frozenGate() {
  const mismatches = EVALUATION_FILES.filter((f) => headHash(f) !== hex(readFileSync(at(f))));
  const p = JSON.parse(readFileSync(at(PLAN_PATH), 'utf8'));
  const f = JSON.parse(readFileSync(at(FREEZE_PATH), 'utf8'));
  if (p.planHash !== PLAN_HASH || f.planHash !== PLAN_HASH || f.seedPlanHash !== SEED_PLAN_HASH || f.sealedUnopenedAtFreeze !== true)
    mismatches.push('plan/freeze binding');
  return mismatches;
}
export function combinations(partition) {
  const out = [];
  for (const seed of SEED_PLAN.declared[partition]) for (const level of SEED_PLAN.levels[partition]) for (const horizonBand of FORGE_HORIZON_BAND_IDS)
    for (const objectives of FORGE_OBJECTIVE_COMPOSITION_IDS) for (const roles of FORGE_ROLE_COMPOSITION_IDS) for (const shape of FORGE_TOPOLOGY_SHAPE_IDS)
      out.push({ shape, roles, objectives, horizonBand, level, seed });
  return out;
}
export function priorLineage() {
  const prior = readPriorLineage();
  const wm = JSON.parse(readFileSync(at(W_MANIFEST), 'utf8'));
  const wt = gunzipSync(readFileSync(at(W_FRESH))).toString('utf8');
  if (hex(wt) !== wm.contentHash) throw new Error('W-SYM fresh content mismatch');
  const wRows = wt.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { rows: [...prior.rows, ...wRows], sources: [...prior.sources, { name: 'W-SYM', rows: wRows.length, verified: true, contentHash: wm.contentHash }] };
}
export function seedAudit(prior) {
  const declared = SEED_PLAN.declared; const all = [...declared.HOLDOUT, ...declared.OOD]; const used = new Set(prior.map((r) => r.combination.seed));
  return { declared, priorSeedOverlap: all.filter((s) => SEED_PLAN.priorSeedSpaces.includes(s)), priorRowOverlap: all.filter((s) => used.has(s)),
    partitionOverlap: declared.HOLDOUT.filter((s) => declared.OOD.includes(s)), duplicateCount: all.length - new Set(all).size };
}
async function main(verify) {
  const mismatches = frozenGate();
  if (mismatches.length) throw new Error(`D-SYM freeze gate closed: ${mismatches.join(', ')}`);
  const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const prior = priorLineage(); const audit = seedAudit(prior.rows);
  if (audit.priorSeedOverlap.length || audit.priorRowOverlap.length || audit.partitionOverlap.length || audit.duplicateCount)
    throw new Error(`D-SYM seed collision: ${JSON.stringify(audit)}`);
  const claimed = { record: new Set(prior.rows.map((r) => r.recordHash)), world: new Set(prior.rows.map((r) => r.worldHash)),
    topology: new Set(prior.rows.map((r) => r.topologyHash)) };
  const rows = []; const stats = {};
  for (const partition of ['HOLDOUT', 'OOD']) {
    const combos = combinations(partition); const n = SEED_PLAN.sizes[partition];
    const s = { attempted: 0, admitted: 0, rejected: {}, seedsUsed: [] };
    for (let i = 0; i < combos.length && s.admitted < n; i += 1) {
      s.attempted += 1;
      const row = corpusRecord(`DSYM_${partition}`, combos[i], i, { withEquivariance: i % 25 === 0 });
      const reason = !row.admitted ? row.reason : claimed.record.has(row.recordHash) ? 'RECORD_HASH_CLAIMED'
        : claimed.world.has(row.worldHash) ? 'WORLD_HASH_CLAIMED' : claimed.topology.has(row.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
      if (reason) { s.rejected[reason] = (s.rejected[reason] ?? 0) + 1; continue; }
      claimed.record.add(row.recordHash); claimed.world.add(row.worldHash); claimed.topology.add(row.topologyHash);
      rows.push(row); s.admitted += 1;
      if (!s.seedsUsed.includes(combos[i].seed)) s.seedsUsed.push(combos[i].seed);
      if (s.admitted % 1000 === 0) process.stderr.write(`[D-SYM ${partition}] ${s.admitted}/${n}\n`);
    }
    s.combinationsAvailable = combos.length; stats[partition] = s;
    if (s.admitted !== n) throw new Error(`D-SYM ${partition} insufficient admitted rows: ${s.admitted}/${n}`);
  }
  const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const existing = verify ? JSON.parse(readFileSync(at(MANIFEST_PATH), 'utf8')) : null;
  if (verify) {
    const reproduced = existing.contentHash === hex(content) && JSON.stringify(existing.stats) === JSON.stringify(stats);
    if (reproduced) await writeFile(at(FRESH_PATH), gzipSync(Buffer.from(content), { level: 9 }));
    console.log(JSON.stringify({ reproduced, contentHash: hex(content), generatedAtHead: existing.generatedAtHead }));
    if (!reproduced) process.exitCode = 1;
    return;
  }
  const freeze = JSON.parse(readFileSync(at(FREEZE_PATH), 'utf8'));
  const manifest = { schemaVersion: 1, stage: 'STAGE_3F_6_D_SYM', planHash: PLAN_HASH, analysisFreezeHash: freeze.analysisFreezeHash,
    seedPlanHash: SEED_PLAN_HASH, headlinePolicySetHash: freeze.headlinePolicySetHash, decisionRuleHash: freeze.decisionRuleHash,
    generatedAtHead: head, benchmark: benchmarkBinding(), priorLineage: prior.sources, seedAudit: audit, stats, rows: rows.length,
    contentHash: hex(content), generator: 'scripts/generate-stage3f6dsym-confirmatory.mjs' };
  await writeFile(at(FRESH_PATH), gzipSync(Buffer.from(content), { level: 9 }));
  await writeFile(at(MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ contentHash: manifest.contentHash, stats, seedAudit: audit, generatedAtHead: head }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.includes('--verify'));
