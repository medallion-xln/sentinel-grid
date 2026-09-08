/* Sentinel Forge World — deterministic dataset exporters.
 *
 * Four formats, one source of truth. Each exporter is a pure function of the
 * replay records; none consults an expert, a model, or anything outside the
 * records it is handed. Ordering is canonical, so exporting the same records
 * twice — in either order, on any machine — yields byte-identical output.
 *
 * The observation text handed to a trainer is a RENDERING of structured state.
 * It is generated here rather than in the renderer because a trainer needs a
 * stable textual contract, and because tying the training prompt to the human
 * ASCII view would make a cosmetic change to the display a silent change to
 * every dataset ever exported.
 */

import { sha256 } from '../core/determinism.js';
import { FORGE_REWARD_VERSION } from './contract.js';
import { FORGE_REPLAY_RECORD_VERSION } from './replay.js';

export const FORGE_EXPORT_VERSION = 'FORGE_EXPORT_V1';
export const FORGE_EXPORT_FORMATS = Object.freeze(['jsonl', 'sft', 'preference', 'rl_episode']);

/* ---------------------------------------------------------------------------
 * Prompt construction
 * ------------------------------------------------------------------------- */

function describeAction(action) {
  const target = action.targetId === null ? '' : ` ${action.targetId}`;
  const parameters = Object.keys(action.parameters).length === 0
    ? ''
    : ` (${Object.keys(action.parameters).sort().map((key) => `${key}=${action.parameters[key]}`).join(', ')})`;
  return `${action.actionType}${target}${parameters}`;
}

export function buildPrompt(record) {
  const objectives = record.state.objectives
    .map((objective) => `  - ${objective.id}: deliver ${objective.requiredValue - objective.deliveredValue} more to ${objective.entityId}`)
    .join('\n');
  const actions = record.legalActions
    .map((action, index) => `  ${index}. ${describeAction(action)}`)
    .join('\n');
  return [
    `# Sentinel Forge World — decision`,
    `family: ${record.scenarioFamily}  level: L${record.scenarioLevel}  tick: ${record.state.tick}`,
    `entities: ${record.state.entityCount}  relations: ${record.state.relationCount}  energy: ${record.state.energy}`,
    '',
    'objectives:',
    objectives,
    '',
    'legal actions:',
    actions,
    '',
    'Choose exactly one legal action.',
  ].join('\n');
}

function completionFor(record) {
  const optimal = record.legalActions.find((action) => action.actionKey === record.optimalActionKey);
  return optimal === undefined ? null : describeAction(optimal);
}

/* ---------------------------------------------------------------------------
 * Exporters
 * ------------------------------------------------------------------------- */

/** Full-fidelity replay: the record itself, one JSON object per line. */
export function exportJsonl(records) {
  return sortRecords(records).map((record) => JSON.stringify(record)).join('\n');
}

/**
 * Supervised fine-tuning pairs.
 *
 * Records with an EXACT TIE are excluded, and the exclusion is counted rather
 * than hidden: when two actions have identical utility there is no single correct
 * completion, and training a model to prefer one of them teaches it the
 * tie-breaking rule instead of the task.
 */
export function exportSft(records) {
  const lines = [];
  let excludedTies = 0;
  let excludedNoOptimum = 0;
  for (const record of sortRecords(records)) {
    if (record.exactTie) { excludedTies += 1; continue; }
    const completion = completionFor(record);
    if (completion === null) { excludedNoOptimum += 1; continue; }
    lines.push(JSON.stringify({
      prompt: buildPrompt(record),
      completion,
      metadata: {
        recordHash: record.recordHash,
        scenarioFamily: record.scenarioFamily,
        scenarioLevel: record.scenarioLevel,
        optimalUtility: record.optimalUtility,
        rewardVersion: FORGE_REWARD_VERSION,
      },
    }));
  }
  return { content: lines.join('\n'), count: lines.length, excludedTies, excludedNoOptimum };
}

/**
 * Preference pairs for DPO-style training.
 *
 * A pair is emitted only where the utility gap is STRICTLY POSITIVE. A pair whose
 * two sides score identically is not a preference; it is noise wearing a label,
 * and it would teach a preference model that the world has an opinion where it
 * does not.
 */
export function exportPreferencePairs(records, { minimumGap = 1 } = {}) {
  const lines = [];
  let skippedZeroGap = 0;
  for (const record of sortRecords(records)) {
    const chosen = record.legalActions.find((action) => action.actionKey === record.optimalActionKey);
    if (chosen === undefined) continue;
    const ranked = [...record.counterfactuals].sort((a, b) =>
      a.scalarReward - b.scalarReward || (a.actionKey < b.actionKey ? -1 : 1));
    for (const candidate of ranked) {
      if (candidate.actionKey === record.optimalActionKey) continue;
      const gap = record.optimalUtility - candidate.scalarReward;
      if (gap < minimumGap) { skippedZeroGap += 1; continue; }
      const rejected = record.legalActions.find((action) => action.actionKey === candidate.actionKey);
      lines.push(JSON.stringify({
        prompt: buildPrompt(record),
        chosen: describeAction(chosen),
        rejected: describeAction(rejected),
        metadata: {
          recordHash: record.recordHash,
          utilityGap: gap,
          chosenUtility: record.optimalUtility,
          rejectedUtility: candidate.scalarReward,
          rewardVersion: FORGE_REWARD_VERSION,
        },
      }));
      break;   // One pair per record: the optimum against the worst clear alternative.
    }
  }
  return { content: lines.join('\n'), count: lines.length, skippedZeroGap };
}

/** (state, action, reward, next_state, done) transitions, one per legal branch. */
export function exportRlEpisodes(records) {
  const lines = [];
  for (const record of sortRecords(records)) {
    for (const branch of record.counterfactuals) {
      lines.push(JSON.stringify({
        state: record.state.worldHash,
        state_features: {
          tick: record.state.tick,
          entities: record.state.entityCount,
          relations: record.state.relationCount,
          energy: record.state.energy,
        },
        action: branch.actionType,
        action_key: branch.actionKey,
        reward: branch.scalarReward,
        reward_vector: branch.rewardVector,
        next_state: branch.nextStateHash,
        done: branch.terminal,
        metadata: { recordHash: record.recordHash, rewardVersion: FORGE_REWARD_VERSION },
      }));
    }
  }
  return { content: lines.join('\n'), count: lines.length };
}

/* Canonical order: by record hash. Independent of the order records arrived in,
 * so two runs that produce the same set produce the same file. */
function sortRecords(records) {
  return [...records].sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
}

/** Export every format at once, with a manifest binding them to their source. */
export function exportAll(records, options = {}) {
  const jsonl = exportJsonl(records);
  const sft = exportSft(records);
  const preference = exportPreferencePairs(records, options);
  const rl = exportRlEpisodes(records);
  const datasets = {
    jsonl: { content: jsonl, count: records.length, contentHash: sha256(jsonl) },
    sft: { content: sft.content, count: sft.count, excludedTies: sft.excludedTies, excludedNoOptimum: sft.excludedNoOptimum, contentHash: sha256(sft.content) },
    preference: { content: preference.content, count: preference.count, skippedZeroGap: preference.skippedZeroGap, contentHash: sha256(preference.content) },
    rl_episode: { content: rl.content, count: rl.count, contentHash: sha256(rl.content) },
  };
  return {
    exportVersion: FORGE_EXPORT_VERSION,
    recordVersion: FORGE_REPLAY_RECORD_VERSION,
    rewardVersion: FORGE_REWARD_VERSION,
    formats: FORGE_EXPORT_FORMATS,
    datasets,
    datasetHash: sha256(Object.fromEntries(
      Object.entries(datasets).map(([name, entry]) => [name, entry.contentHash]),
    )),
  };
}
