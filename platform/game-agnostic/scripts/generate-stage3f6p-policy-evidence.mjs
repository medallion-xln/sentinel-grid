#!/usr/bin/env node
/* STAGE_3F_6_P — per-action policy evidence for DEV/CAL ONLY (diagnostic).
 *
 * Rebuilds each DEV/CAL decision point from the Stage 3F.6-C corpus and records what the policy-quality
 * audit needs and the certified artifacts do not carry: every legal branch's action type, declared cost,
 * horizon regret, optimal-set membership, immediate scalar and what it targets in the observed state;
 * the action type each frozen producer chose; and why the relational selector acted or abstained.
 * Producer choices are verified against the certified Stage 3F.6-A proposals (fidelity check).
 * Every prior HOLDOUT/OOD is exposed and is never rebuilt or read here.
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { buildTarget, heuristicGreedyBaseline, nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { DECLARED_ACTION_COST_MODEL, observedThreatStructure, proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6p-policy-quality');
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
const dataPath = path.join(outDirectory, limit ? 'smoke-policy-evidence.jsonl.gz' : 'policy-evidence.jsonl.gz');
const manifestPath = path.join(outDirectory, limit ? 'smoke-policy-evidence-manifest.json' : 'policy-evidence-manifest.json');
const hex = (v) => createHash('sha256').update(v).digest('hex');

export const STAGE3F6P_PARTITIONS = Object.freeze(['DEV', 'CAL']);
export const STAGE3F6P_PRODUCERS = Object.freeze(['GREEDY', 'NEXUS_SELECTOR', 'RESOURCE_PRESERVING_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'RANDOM_LEGAL_V1']);
const KEY = 16;

async function main() {
  const corpusRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8');
  const proposalsRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz'))).toString('utf8');
  const proposals = new Map(proposalsRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.recordHash, r]));
  let rows = corpusRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => STAGE3F6P_PARTITIONS.includes(r.partition));
  if (limit) rows = rows.slice(0, limit);

  const out = []; const skipped = {}; let fidelityMismatches = 0;
  for (const row of rows) {
    const c = row.combination;
    const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
    if (!built.admitted || built.record.recordHash !== row.recordHash) { skipped.REBUILD_MISMATCH = (skipped.REBUILD_MISMATCH ?? 0) + 1; continue; }
    const record = built.record;
    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const actions = forgeLegalActions(state.world);
    const legalActions = actions.map((a) => ({ actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null }));
    const optimal = new Set(buildTarget(record).optimalSet);
    const structure = observedThreatStructure(observation.metadata.canonicalState);

    const byKey = new Map(record.branches.map((b) => [b.actionKey, b]));
    const branches = legalActions.map((a) => {
      const b = byKey.get(a.actionId.slice(0, KEY));
      return { k: a.actionId.slice(0, KEY), t: a.actionType, c: DECLARED_ACTION_COST_MODEL.cost[a.actionType] ?? null,
        r: record.optimalScalar - b.scalarReward, o: optimal.has(b.actionKey) ? 1 : 0, i: b.immediateScalar,
        crit: a.targetEntityId !== null && structure.criticalIds.has(a.targetEntityId) ? 1 : 0,
        thr: a.targetEntityId !== null && structure.unsupportedThreatened.has(a.targetEntityId) ? 1 : 0 };
    });

    const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState,
      legalActions: legalActions.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
    const selector = nexusRelationalSelector({ branches: legalActions.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
    const chosen = { GREEDY: heuristicGreedyBaseline(record).actionId, NEXUS_SELECTOR: selector.abstain ? null : selector.actionId.slice(0, KEY) };
    for (const p of proposeAll({ observation, legalActions })) chosen[p.producerId] = p.action === null ? null : p.action.actionId.slice(0, KEY);

    const certified = proposals.get(row.recordHash);
    if (STAGE3F6P_PRODUCERS.some((p) => (certified.chosen[p] ?? null) !== (chosen[p] ?? null))) fidelityMismatches += 1;

    const typeOf = (key) => (key === null ? null : branches.find((b) => b.k === key)?.t ?? null);
    out.push({
      partition: row.partition, recordHash: row.recordHash,
      nexusReason: selector.reason ?? null, nexusRationale: [...(nexus.rationaleCodes ?? [])].sort(),
      chosenType: Object.fromEntries(STAGE3F6P_PRODUCERS.map((p) => [p, typeOf(chosen[p])])),
      branches,
    });
    if (out.length % 1000 === 0) process.stderr.write(`[stage3f6p] ${out.length}/${rows.length}\n`);
  }
  out.sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
  const content = `${out.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const manifest = { schemaVersion: 1, smoke: Boolean(limit), partitions: STAGE3F6P_PARTITIONS, sealedPartitionsRead: false,
    sourceCorpusHash: hex(corpusRaw), sourceProposalsHash: hex(proposalsRaw), evaluated: out.length,
    counts: Object.fromEntries(STAGE3F6P_PARTITIONS.map((p) => [p, out.filter((r) => r.partition === p).length])),
    producerFidelityMismatches: fidelityMismatches, skipped, contentHash: hex(content), generator: 'scripts/generate-stage3f6p-policy-evidence.mjs' };
  await mkdir(outDirectory, { recursive: true });
  await writeFile(dataPath, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
