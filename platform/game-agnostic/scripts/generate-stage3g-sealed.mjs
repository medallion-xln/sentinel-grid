#!/usr/bin/env node
/* STAGE_3G_1/3G_2 — sealed confirmatory partitions for the representation sufficiency recheck.
 *
 * Every seed Stage 3F declared is consumed (D-SYM used the last, 3023 / 3033), so Stage 3G declares a new, disjoint seed
 * space in its hashed seed plan (HOLDOUT 4021, OOD 4031; 4022-4023 / 4032-4033 reserved for later Stage 3G substages) and
 * generates with the unmodified, benchmark-bound P.1D record builder in canonical order. A candidate whose record, world or
 * topology hash is claimed anywhere in the 80,000-row Stage 3F lineage (P.1D, T-SYM, P.1A-SYM, P.1-SYM, W-SYM, D-SYM) or
 * earlier in the new set is rejected.
 *
 * Refuses to run unless the plan, the open-phase report and every evaluation file are committed unchanged at HEAD. The
 * manifest records that HEAD. `--verify` rebuilds the gitignored payload from committed state, requires the manifest
 * content hash and never writes a tracked file (check-mode guard).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { enforceCheckModeReadOnly } from './certification/check-mode-guard.mjs';
import { FORGE_TOPOLOGY_SHAPE_IDS } from '../src/forge/topology.js';
import { FORGE_HORIZON_BAND_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_ROLE_COMPOSITION_IDS } from '../src/forge/scenarios-v2.js';
import { benchmarkBinding, corpusRecord } from './generate-stage3f6p1d-symmetric-corpus.mjs';
import { priorLineage as dsymPriorLineage } from './generate-stage3f6dsym-confirmatory.mjs';
import { OPEN_REPORT_PATH, PLAN_HASH, PLAN_PATH, SEALED_MANIFEST_PATH, SEALED_PATH, SEED_PLAN, SEED_PLAN_HASH } from './stage3g/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const DSYM_FRESH = 'artifacts/stage3f6dsym-decision-rule/fresh-confirmatory.jsonl.gz';
const DSYM_MANIFEST = 'artifacts/stage3f6dsym-decision-rule/fresh-confirmatory-manifest.json';
export const DSYM_CONTENT_HASH = '8aa1672a1acdfe62251458b8e986b2f79b4f0eb1cc794596315f92ba7ccbac9c';
/** Files that must be committed unchanged at HEAD before generation, and unchanged from generation to certification. */
export const EVALUATION_FILES = Object.freeze([PLAN_PATH, OPEN_REPORT_PATH, 'scripts/stage3g/plan.mjs', 'scripts/stage3g-plan.mjs', 'scripts/stage3g/evidence.mjs',
  'scripts/generate-stage3g-sealed.mjs', 'scripts/certify-stage3g-predictive-integrity.mjs', 'src/stage3g/epistemic-provenance-v1.js',
  'src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js', 'tests/stage3g-epistemic-integrity.test.js', 'tests/stage3g-observable-state.test.js']);

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

/** The full 80,000-row Stage 3F lineage: D-SYM's verified prior lineage plus the D-SYM rows (content-hash verified). */
export function stage3fLineage() {
  const prior = dsymPriorLineage();
  const m = JSON.parse(readFileSync(at(DSYM_MANIFEST), 'utf8'));
  const text = gunzipSync(readFileSync(at(DSYM_FRESH))).toString('utf8');
  if (hex(text) !== m.contentHash || m.contentHash !== DSYM_CONTENT_HASH) throw new Error('D-SYM fresh payload does not match its manifest and the Stage 3G binding');
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { rows: [...prior.rows, ...rows], sources: [...prior.sources, { name: 'D-SYM', rows: rows.length, verified: true, contentHash: m.contentHash }] };
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
  if (failures.length) throw new Error(`STAGE3G_SEALED_GATE_CLOSED: ${failures.join('; ')}`);
  const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const prior = stage3fLineage(); const audit = seedAudit(prior.rows);
  if (audit.priorSeedOverlap.length || audit.priorRowOverlap.length || audit.partitionOverlap.length || audit.duplicateCount) throw new Error(`STAGE3G seed collision: ${JSON.stringify(audit)}`);
  const claimed = { record: new Set(prior.rows.map((r) => r.recordHash)), world: new Set(prior.rows.map((r) => r.worldHash)), topology: new Set(prior.rows.map((r) => r.topologyHash)) };
  const rows = []; const stats = {};
  for (const partition of ['HOLDOUT', 'OOD']) {
    const combos = combinations(partition); const n = SEED_PLAN.sizes[partition];
    const s = { attempted: 0, admitted: 0, rejected: {}, seedsUsed: [] };
    for (let i = 0; i < combos.length && s.admitted < n; i += 1) {
      s.attempted += 1;
      const row = corpusRecord(`STAGE3G_${partition}`, combos[i], i, { withEquivariance: i % 25 === 0 });
      const reason = !row.admitted ? row.reason : claimed.record.has(row.recordHash) ? 'RECORD_HASH_CLAIMED'
        : claimed.world.has(row.worldHash) ? 'WORLD_HASH_CLAIMED' : claimed.topology.has(row.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
      if (reason) { s.rejected[reason] = (s.rejected[reason] ?? 0) + 1; continue; }
      claimed.record.add(row.recordHash); claimed.world.add(row.worldHash); claimed.topology.add(row.topologyHash);
      rows.push(row); s.admitted += 1;
      if (!s.seedsUsed.includes(combos[i].seed)) s.seedsUsed.push(combos[i].seed);
      if (s.admitted % 1000 === 0) process.stderr.write(`[stage3g ${partition}] ${s.admitted}/${n}\n`);
    }
    s.combinationsAvailable = combos.length; stats[partition] = s;
    if (s.admitted !== n) throw new Error(`STAGE3G ${partition} insufficient admitted rows: ${s.admitted}/${n}`);
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
  const manifest = { schemaVersion: 1, stage: 'STAGE_3G_1_3G_2', planHash: PLAN_HASH, seedPlanHash: SEED_PLAN_HASH, generatedAtHead: head,
    benchmark: benchmarkBinding(), priorLineage: prior.sources, seedAudit: audit, stats, rows: rows.length, contentHash: hex(content),
    generator: 'scripts/generate-stage3g-sealed.mjs', recordBuilder: 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)' };
  await writeFile(at(SEALED_PATH), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(at(SEALED_MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ rows: manifest.rows, contentHash: manifest.contentHash, stats, seedAudit: audit, generatedAtHead: head }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.includes('--verify'));
