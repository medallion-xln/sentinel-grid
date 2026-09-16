#!/usr/bin/env node
/* STAGE_3F_6_A — deployable action proposals over the certified Stage 3F.6-C corpus.
 *
 * Walks the Stage 3F.6-C corpus once and records, per decision, what every action producer
 * proposes and whether that action is in the authoritative horizon-optimal set. Certification
 * then reads this artifact, so the expensive world rebuild happens once and `--check` stays
 * deterministic and fast.
 *
 * Producers are evaluated, never trained. No router is fitted here.
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
import {
  DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH, DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID, proposeAll,
} from '../src/stage3f/deployable-action-proposal-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const corpusPath = path.join(root, 'artifacts', 'stage3f6c-deployable-router', 'confirmatory-corpus.jsonl.gz');
const outDirectory = path.join(root, 'artifacts', 'stage3f6a-action-proposals');
const proposalsPath = path.join(outDirectory, 'action-proposals.jsonl.gz');
const manifestPath = path.join(outDirectory, 'action-proposals-manifest.json');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);

/** Record branch keys are 16-character prefixes of the runtime digest (Stage 3F.6-C finding). */
const RECORD_KEY_PREFIX = 16;
const toRecordKey = (actionId) => (typeof actionId === 'string' ? actionId.slice(0, RECORD_KEY_PREFIX) : null);

export const STAGE3F6A_PRODUCERS = Object.freeze([
  { id: 'GREEDY', deployable: false, requiresSimulator: true, requiresV2B: false,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: false,
    objective: 'MAXIMIZE_IMMEDIATE_TRANSITION_VALUE' },
  { id: 'NEXUS_SELECTOR', deployable: true, requiresSimulator: false, requiresV2B: false,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: true,
    objective: 'FOLLOW_OBSERVED_RELATIONAL_STRUCTURE' },
  { id: 'RESOURCE_PRESERVING_V1', deployable: true, requiresSimulator: false, requiresV2B: false,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: true,
    objective: 'MINIMIZE_DECLARED_RESOURCE_COST' },
  { id: 'OBJECTIVE_TARGETING_V1', deployable: true, requiresSimulator: false, requiresV2B: false,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: true,
    objective: 'ADVANCE_OBSERVED_OBJECTIVE_STRUCTURE' },
  { id: 'THREAT_COVERING_V1', deployable: true, requiresSimulator: false, requiresV2B: false,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: true,
    objective: 'COVER_OBSERVED_UNSUPPORTED_THREAT' },
  { id: 'RANDOM_LEGAL_V1', deployable: true, requiresSimulator: false, requiresV2B: false,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: true,
    objective: 'CONTROL_NO_OBJECTIVE' },
  { id: 'PRIME_ROOT_PUCT', deployable: false, requiresSimulator: true, requiresV2B: false,
    requiresMultiStepRollout: true, requiresFutureInformation: false, availableInGeneralEnvironment: false,
    objective: 'MAXIMIZE_SEARCHED_VALUE', evaluated: false,
    exclusionReason: 'root-PUCT performs multi-step simulated rollouts; Stage 3F.6-A forbids adding multi-step '
      + 'simulator planning, so it is inventoried but not evaluated.' },
  { id: 'V2B', deployable: false, requiresSimulator: false, requiresV2B: true,
    requiresMultiStepRollout: false, requiresFutureInformation: false, availableInGeneralEnvironment: false,
    objective: 'LEARNED_EXPERT_PREFERENCE', evaluated: false,
    exclusionReason: 'archive-only adapter; no runtime expert produces genuine V2B answers. Never substituted.' },
]);

async function main() {
  const raw = gunzipSync(await readFile(corpusPath)).toString('utf8');
  const corpusHash = hex(raw);
  const rows = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const subset = limit > 0 ? rows.slice(0, limit) : rows;
  process.stderr.write(`[stage3f6a] corpus rows=${rows.length} evaluating=${subset.length}\n`);

  const out = [];
  const skipped = {};
  let processed = 0;

  for (const row of subset) {
    const c = row.combination;
    const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives,
      horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
    if (!built.admitted) { skipped.NOT_ADMITTED = (skipped.NOT_ADMITTED ?? 0) + 1; continue; }
    const record = built.record;
    if (record.recordHash !== row.recordHash) { skipped.RECORD_HASH_MISMATCH = (skipped.RECORD_HASH_MISMATCH ?? 0) + 1; continue; }

    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const legalActions = forgeLegalActions(state.world).map((action) => ({
      actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
    }));
    if (legalActions.length === 0) { skipped.NO_LEGAL_ACTIONS = (skipped.NO_LEGAL_ACTIONS ?? 0) + 1; continue; }

    const target = buildTarget(record);
    const optimal = new Set(target.optimalSet);

    /* GREEDY needs one-step transition values, so it is simulator-dependent and is included for
     * comparison only — it is not part of the deployable candidate set. */
    const greedyKey = heuristicGreedyBaseline(record).actionId;

    const nexus = evaluateNexus({
      canonicalState: observation.metadata.canonicalState,
      legalActions: legalActions.map((entry) => ({ actionId: entry.actionId, targetEntityId: entry.targetEntityId })),
    });
    const selector = nexusRelationalSelector(
      { branches: legalActions.map((entry) => ({ actionKey: entry.actionId, actionType: entry.actionType })) }, nexus,
    );

    const chosen = {
      GREEDY: greedyKey,
      NEXUS_SELECTOR: selector.abstain ? null : toRecordKey(selector.actionId),
    };
    for (const proposal of proposeAll({ observation, legalActions })) {
      chosen[proposal.producerId] = proposal.action === null ? null : toRecordKey(proposal.action.actionId);
    }

    const regretOf = (key) => {
      if (key === null) return null;
      const branch = record.branches.find((entry) => entry.actionKey === key);
      return branch ? record.optimalScalar - branch.scalarReward : null;
    };
    const correctOf = (key) => (key === null ? null : (optimal.has(key) ? 1 : 0));

    out.push({
      partition: row.partition,
      recordHash: row.recordHash,
      y: row.y,
      greedyCorrect: correctOf(greedyKey),
      legalActionCount: legalActions.length,
      optimalSetSize: target.optimalSetSize,
      chosen,
      correct: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, correctOf(v)])),
      regret: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, regretOf(v)])),
    });

    processed += 1;
    if (processed % 2000 === 0) process.stderr.write(`[stage3f6a] ${processed}/${subset.length}\n`);
  }

  out.sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
  const content = `${out.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
  const contentHash = hex(content);

  const counts = {};
  for (const entry of out) counts[entry.partition] = (counts[entry.partition] ?? 0) + 1;

  const manifest = {
    schemaVersion: 1,
    stage: 'STAGE_3F_6_A_ACTION_PROPOSALS',
    sourceCorpusHash: corpusHash,
    proposalContract: { id: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID, hash: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH },
    producers: STAGE3F6A_PRODUCERS,
    evaluated: out.length,
    counts,
    contentHash,
    skipped,
    routerTrained: false,
    thresholdsTuned: false,
    generator: 'scripts/generate-stage3f6a-proposals.mjs',
  };

  await mkdir(outDirectory, { recursive: true });
  await writeFile(proposalsPath, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ evaluated: out.length, counts, contentHash, sourceCorpusHash: corpusHash, skipped }, null, 2));
}

/* Import-safe: the producer inventory is imported by the certifier, so generation must run only
 * when this file is executed directly. Without this guard, importing it would silently re-run a
 * full 20,000-record corpus pass. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
