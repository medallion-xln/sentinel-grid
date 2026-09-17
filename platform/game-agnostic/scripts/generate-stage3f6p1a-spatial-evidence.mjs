#!/usr/bin/env node
/* STAGE_3F_6_P_1A — NEXUS relational spatial context evidence (DEV; CAL only if the DEV freeze authorizes it).
 *
 * Per decision point, three strictly separated blocks:
 *   decisionInput         what the live adapter interface exposes at decision time and nothing more:
 *                         the observation feature vector, the observed canonical relational state, and the
 *                         live legal action surface WITH its declared parameters (MOVE direction, RETREAT
 *                         destination, BYPASS dependent). Action identity is the kernel action key.
 *   labels                offline evaluation only: per-action horizon regret, optimal membership, declared cost,
 *                         and the certified Stage 3F.6-A choices of the other frozen producers.
 *   privilegedDiagnostic  kernel-internal geometry NOT exposed by the ObservationPacket or the action interface
 *                         (entity positions, grid terrain). Stored only to measure whether hidden geometry would
 *                         have been sufficient. It is never passed to any policy.
 *
 * CAL is REFUSED unless the Stage 3F.6-P.1A freeze exists, authorizes CAL evaluation, and its candidate and
 * contract source hashes match the sources on disk. HOLDOUT/OOD are never rebuilt.
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { buildTarget } from '../src/lab/stage3c-learned-nexus.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { DECLARED_ACTION_COST_MODEL } from '../src/stage3f/deployable-action-proposal-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = 'artifacts/stage3f6p1a-nexus-spatial';
const hex = (v) => createHash('sha256').update(v).digest('hex');
const KEY = 16;

export const STAGE3F6P1A_PARTITIONS = Object.freeze(['DEV', 'CAL']);
export const STAGE3F6P1A_FREEZE_PATH = `${OUT}/stage3f6p1a-dev-freeze.json`;
const OTHER_PRODUCERS = ['GREEDY', 'RESOURCE_PRESERVING_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'RANDOM_LEGAL_V1'];

function calGate() {
  const file = path.join(root, STAGE3F6P1A_FREEZE_PATH);
  if (!existsSync(file)) throw new Error('CAL_SEALED: the DEV freeze does not exist');
  const freeze = JSON.parse(readFileSync(file, 'utf8'));
  if (freeze.calGate?.CAL_EVALUATION_AUTHORIZED !== true) throw new Error('CAL_SEALED: the DEV freeze does not authorize CAL evaluation');
  const frozen = Object.entries(freeze.frozenSources ?? {});
  if (!frozen.some(([source]) => source === 'src/stage3f/nexus-relational-spatial-context-v1.js')) throw new Error('CAL_SEALED: the spatial contract is not frozen');
  if (!frozen.some(([source]) => source === 'src/stage3f/nexus-selector-v3-spatial-candidate.js')) throw new Error('CAL_SEALED: no frozen V3 candidate');
  for (const [source, hash] of frozen) {
    if (!existsSync(path.join(root, source)) || hash !== hex(readFileSync(path.join(root, source)))) throw new Error(`CAL_SEALED: ${source} differs from the frozen source`);
  }
  return { freezeHash: freeze.freezeHash, frozenSources: freeze.frozenSources };
}

async function main() {
  const partition = process.argv.find((a) => a.startsWith('--partition='))?.split('=')[1];
  if (!STAGE3F6P1A_PARTITIONS.includes(partition)) throw new Error('--partition=DEV|CAL required');
  const binding = partition === 'CAL' ? calGate() : null;

  const corpusRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8');
  const proposalsRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz'))).toString('utf8');
  const proposals = new Map(proposalsRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.recordHash, r]));
  const rows = corpusRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.partition === partition);

  const out = []; const skipped = {}; let liveSurfaceMismatches = 0;
  for (const row of rows) {
    const c = row.combination;
    const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
    if (!built.admitted || built.record.recordHash !== row.recordHash) { skipped.REBUILD_MISMATCH = (skipped.REBUILD_MISMATCH ?? 0) + 1; continue; }
    const record = built.record;
    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const kernelActions = forgeLegalActions(state.world);
    const liveActions = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
    if (kernelActions.length !== liveActions.length) liveSurfaceMismatches += 1;

    /* Live interface, keyed by the kernel action identity. Parameters come from the LIVE action (adapter), minus
     * the adapter's own bookkeeping fields; they must equal the kernel descriptor's declared parameters. */
    const legalActions = liveActions.map((live, index) => {
      const kernel = kernelActions[index];
      const { actionType, forgeActorId, ...parameters } = live.parameters;
      if (actionType !== kernel.actionType || JSON.stringify(parameters) !== JSON.stringify(kernel.parameters)) liveSurfaceMismatches += 1;
      return { actionId: forgeActionKey(kernel), actionType, targetEntityId: live.target?.id ?? null, parameters };
    }).sort((a, b) => (a.actionId < b.actionId ? -1 : 1));

    const optimal = new Set(buildTarget(record).optimalSet);
    const byKey = new Map(record.branches.map((b) => [b.actionKey, b]));
    const actions = Object.fromEntries(legalActions.map((a) => {
      const b = byKey.get(a.actionId.slice(0, KEY));
      return [a.actionId.slice(0, KEY), { r: record.optimalScalar - b.scalarReward, o: optimal.has(b.actionKey) ? 1 : 0, c: DECLARED_ACTION_COST_MODEL.cost[a.actionType] ?? null }];
    }));
    const certified = proposals.get(row.recordHash);
    const world = state.world;
    out.push({
      partition, recordHash: row.recordHash, combination: c,
      decisionInput: { observationFeatures: observation.features, canonicalState: observation.metadata.canonicalState, legalActions },
      labels: { actions, others: Object.fromEntries(OTHER_PRODUCERS.map((p) => [p, certified.chosen[p] ?? null])), nexusV1: certified.chosen.NEXUS_SELECTOR ?? null },
      privilegedDiagnostic: {
        grid: { width: world.grid.width, height: world.grid.height, cells: world.grid.cells },
        entities: Object.fromEntries([...world.entities].sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) => [e.id, { x: e.position.x, y: e.position.y, value: e.value, health: e.health, available: e.available, protected: e.flags?.protected === true }])),
      },
    });
    if (out.length % 500 === 0) process.stderr.write(`[stage3f6p1a ${partition}] ${out.length}/${rows.length}\n`);
  }
  out.sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
  const content = `${out.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const manifest = { schemaVersion: 1, partition, sealedPartitionsRead: false, calGateBinding: binding,
    sourceCorpusHash: hex(corpusRaw), sourceProposalsHash: hex(proposalsRaw), evaluated: out.length, liveSurfaceMismatches, skipped,
    blocks: { decisionInput: 'live observation + live legal action surface', labels: 'offline only', privilegedDiagnostic: 'kernel-internal; never passed to a policy' },
    contentHash: hex(content), generator: 'scripts/generate-stage3f6p1a-spatial-evidence.mjs' };
  await mkdir(path.join(root, OUT), { recursive: true });
  await writeFile(path.join(root, `${OUT}/spatial-evidence-${partition.toLowerCase()}.jsonl.gz`), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(path.join(root, `${OUT}/spatial-evidence-${partition.toLowerCase()}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
