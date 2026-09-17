#!/usr/bin/env node
/* STAGE_3F_6_W — decision-time risk evidence for DEV/CAL ONLY.
 *
 * Rebuilds each DEV/CAL decision point from the Stage 3F.6-C corpus and records:
 *   - candidate SENTINEL_DECISION_RISK_STATE_V1 fields (contract candidates)
 *   - DIAGNOSTIC-only objective, spatial and temporal evidence (never contract fields)
 * HOLDOUT/OOD of every prior stage are exposed and are never rebuilt or read here.
 * CORE features are recomputed and compared with the stored corpus as a rebuild-fidelity check.
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { DEPLOYABLE_PROFILES, DeployableProfile, OBSERVATION_BINDING } from '../src/stage3f/deployable-feature-contract-v1.js';
import { DECISION_RISK_STATE_CONTRACT_HASH, extractDecisionRiskState } from '../src/stage3f/decision-risk-state-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const corpusPath = path.join(root, 'artifacts', 'stage3f6c-deployable-router', 'confirmatory-corpus.jsonl.gz');
const outDirectory = path.join(root, 'artifacts', 'stage3f6w-risk-state');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
const dataPath = path.join(outDirectory, limit ? 'smoke-risk-evidence.jsonl.gz' : 'risk-evidence.jsonl.gz');
const manifestPath = path.join(outDirectory, limit ? 'smoke-risk-evidence-manifest.json' : 'risk-evidence-manifest.json');

export const STAGE3F6W_PARTITIONS = Object.freeze(['DEV', 'CAL']);

/** Diagnostic evidence outside the risk contract. Objective and spatial read the observation vector;
 * temporal reads the observed channel history. None of these enter the risk contract. */
export function diagnosticEvidence(observation) {
  const v = OBSERVATION_BINDING.vector;
  const f = observation.features;
  const entities = observation.metadata?.canonicalState?.entities ?? [];
  const history = observation.metadata?.observationHistory ?? [];
  const series = history.map((frame) => frame.channels?.primary).filter((x) => typeof x === 'number');
  const n = series.length;
  const diffs = [];
  for (let i = 1; i < n; i += 1) diffs.push(series[i] - series[i - 1]);
  return {
    objective: { 'objective.shortfall': f[v.objectiveShortfall], 'objective.criticalEntityCount': entities.filter((e) => e.critical === true).length },
    spatial: { 'spatial.actorX': f[v.actorX], 'spatial.actorY': f[v.actorY] },
    temporal: n >= 3 ? {
      'temporal.historyLength': n,
      'temporal.primaryNetChange': series[n - 1] - series[0],
      'temporal.primaryRecentChange': series[n - 1] - series[n - 2],
      'temporal.primaryMeanAbsChange': diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length,
    } : null,
  };
}

async function main() {
  const raw = gunzipSync(await readFile(corpusPath)).toString('utf8');
  const corpusHash = hex(raw);
  let rows = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => STAGE3F6W_PARTITIONS.includes(r.partition));
  if (limit) rows = rows.slice(0, limit);
  const coreIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
  const out = [];
  const skipped = {};
  let coreMismatch = 0;
  for (const row of rows) {
    const c = row.combination;
    const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
    if (!built.admitted || built.record.recordHash !== row.recordHash) { skipped.REBUILD_MISMATCH = (skipped.REBUILD_MISMATCH ?? 0) + 1; continue; }
    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const legalActions = forgeLegalActions(state.world).map((a) => ({
      actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null, parameters: a.parameters,
    }));
    const core = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
    if (coreIds.some((id) => JSON.stringify(core.features[id].value) !== JSON.stringify(row.core[id]))) coreMismatch += 1;
    const risk = extractDecisionRiskState({ observation, legalActions });
    out.push({
      partition: row.partition,
      recordHash: row.recordHash,
      risk: Object.fromEntries(Object.entries(risk.fields).map(([k, v]) => [k, { value: v.value, status: v.status }])),
      diagnostic: diagnosticEvidence(observation),
    });
    if (out.length % 1000 === 0) process.stderr.write(`[stage3f6w] ${out.length}/${rows.length}\n`);
  }
  out.sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
  const content = `${out.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const manifest = {
    schemaVersion: 1, smoke: Boolean(limit), partitions: STAGE3F6W_PARTITIONS,
    sealedPartitionsRead: false, sourceCorpusHash: corpusHash, riskContractHash: DECISION_RISK_STATE_CONTRACT_HASH,
    evaluated: out.length, counts: Object.fromEntries(STAGE3F6W_PARTITIONS.map((p) => [p, out.filter((r) => r.partition === p).length])),
    coreRebuildMismatches: coreMismatch, skipped, contentHash: hex(content), generator: 'scripts/generate-stage3f6w-risk-evidence.mjs',
  };
  await mkdir(outDirectory, { recursive: true });
  await writeFile(dataPath, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
