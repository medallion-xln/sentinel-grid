#!/usr/bin/env node
/* STAGE_3F_6_P_1 — NEXUS risk-response remediation evidence (DEV, then CAL after the candidate freeze).
 *
 * Rebuilds each decision point of one partition of the Stage 3F.6-C corpus and stores two strictly
 * separate objects per row:
 *   decisionInput  what a deployed NEXUS selector may read at decision time: the observed canonical
 *                  relational state and the legal action surface (identity, type, target entity).
 *   labels         offline evaluation only: per-action horizon regret, optimal-set membership and declared
 *                  cost, plus the certified Stage 3F.6-A choices of the other frozen producers.
 * Policies are evaluated later by passing ONLY decisionInput to them.
 *
 * Discipline: DEV is generated first and is the only partition used to design the candidate.
 * CAL generation is REFUSED unless the candidate freeze exists and the frozen candidate source hash
 * matches the source on disk; the CAL manifest binds that freeze hash. HOLDOUT/OOD are never rebuilt.
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { buildTarget, nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { DECLARED_ACTION_COST_MODEL } from '../src/stage3f/deployable-action-proposal-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6p1-nexus-remediation');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const KEY = 16;

export const STAGE3F6P1_PARTITIONS = Object.freeze(['DEV', 'CAL']);
export const STAGE3F6P1_FREEZE_PATH = 'artifacts/stage3f6p1-nexus-remediation/stage3f6p1-candidate-freeze.json';
export const STAGE3F6P1_CANDIDATE_SOURCE = 'src/stage3f/nexus-selector-v2-candidate.js';
export const STAGE3F6P1_OTHER_PRODUCERS = Object.freeze(['GREEDY', 'RESOURCE_PRESERVING_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'RANDOM_LEGAL_V1']);
export const evidencePath = (partition) => `artifacts/stage3f6p1-nexus-remediation/nexus-evidence-${partition.toLowerCase()}.jsonl.gz`;
export const manifestPath = (partition) => `artifacts/stage3f6p1-nexus-remediation/nexus-evidence-${partition.toLowerCase()}-manifest.json`;

function calGate() {
  const freezeFile = path.join(root, STAGE3F6P1_FREEZE_PATH);
  if (!existsSync(freezeFile)) throw new Error('CAL_SEALED: the candidate freeze does not exist yet');
  const freezeText = readFileSync(freezeFile, 'utf8');
  const freeze = JSON.parse(freezeText);
  const sourceHash = hex(readFileSync(path.join(root, STAGE3F6P1_CANDIDATE_SOURCE)));
  if (freeze.candidate?.sourceHash !== sourceHash) throw new Error('CAL_SEALED: candidate source differs from the frozen candidate');
  return { freezeHash: freeze.freezeHash, candidateSourceHash: sourceHash, candidateHash: freeze.candidate.candidateHash };
}

async function main() {
  const partition = process.argv.find((a) => a.startsWith('--partition='))?.split('=')[1];
  if (!STAGE3F6P1_PARTITIONS.includes(partition)) throw new Error('--partition=DEV|CAL required');
  const binding = partition === 'CAL' ? calGate() : null;

  const corpusRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8');
  const proposalsRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz'))).toString('utf8');
  const proposals = new Map(proposalsRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.recordHash, r]));
  const rows = corpusRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.partition === partition);

  const out = []; const skipped = {}; let v1FidelityMismatches = 0;
  for (const row of rows) {
    const c = row.combination;
    const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
    if (!built.admitted || built.record.recordHash !== row.recordHash) { skipped.REBUILD_MISMATCH = (skipped.REBUILD_MISMATCH ?? 0) + 1; continue; }
    const record = built.record;
    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const legalActions = forgeLegalActions(state.world)
      .map((a) => ({ actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null }))
      .sort((a, b) => (a.actionId < b.actionId ? -1 : 1));
    const decisionInput = { canonicalState: observation.metadata.canonicalState, legalActions };

    /* V1 fidelity: the historical selector, run exactly as Stage 3F.6-A ran it, must reproduce the certified choice. */
    const nexus = evaluateNexus({ canonicalState: decisionInput.canonicalState,
      legalActions: legalActions.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
    const v1 = nexusRelationalSelector({ branches: legalActions.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
    const certified = proposals.get(row.recordHash);
    if ((v1.abstain ? null : v1.actionId.slice(0, KEY)) !== (certified.chosen.NEXUS_SELECTOR ?? null)) v1FidelityMismatches += 1;

    const optimal = new Set(buildTarget(record).optimalSet);
    const byKey = new Map(record.branches.map((b) => [b.actionKey, b]));
    const actions = Object.fromEntries(legalActions.map((a) => {
      const b = byKey.get(a.actionId.slice(0, KEY));
      return [a.actionId.slice(0, KEY), { r: record.optimalScalar - b.scalarReward, o: optimal.has(b.actionKey) ? 1 : 0,
        c: DECLARED_ACTION_COST_MODEL.cost[a.actionType] ?? null }];
    }));
    out.push({
      partition, recordHash: row.recordHash, combination: c,
      decisionInput,
      labels: { actions, others: Object.fromEntries(STAGE3F6P1_OTHER_PRODUCERS.map((p) => [p, certified.chosen[p] ?? null])) },
    });
    if (out.length % 500 === 0) process.stderr.write(`[stage3f6p1 ${partition}] ${out.length}/${rows.length}\n`);
  }
  out.sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
  const content = `${out.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const manifest = { schemaVersion: 1, partition, sealedPartitionsRead: false, candidateFreezeBinding: binding,
    sourceCorpusHash: hex(corpusRaw), sourceProposalsHash: hex(proposalsRaw), evaluated: out.length,
    v1FidelityMismatches, skipped, contentHash: hex(content), generator: 'scripts/generate-stage3f6p1-nexus-evidence.mjs' };
  await mkdir(outDirectory, { recursive: true });
  await writeFile(path.join(root, evidencePath(partition)), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(path.join(root, manifestPath(partition)), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
