/* Stage 3C-R — training environment provisioning and learned Nexus campaign rerun.
 *
 * Stage 3C was BLOCKED because nothing here could train. Stage 3C-R establishes
 * how much of that is now false, and it changes the answer on three of the four
 * substrate requirements:
 *
 *   SOUP_INSTALLED                    false -> TRUE
 *   TRAINING_RUNTIME                  false -> TRUE
 *   ACCELERATOR_OR_VIABLE_CPU_BUDGET  false -> TRUE (CPU, measured, not assumed)
 *   BASE_MODEL_WEIGHTS                false -> still FALSE
 *
 * ONE OF THOSE IS A CORRECTION TO STAGE 3C, NOT A CHANGE IN THE WORLD.
 *
 * Stage 3C probed for Soup with `which soup` and concluded it was absent. Soup was
 * present the whole time, as a clean git checkout at exactly the pinned commit
 * f07e07ed7edd548a4d1d9143f77af9027b1b7036, one directory above the repository. The
 * probe looked for an installed executable and a source checkout is not one, so it
 * answered a narrower question than the one being asked and the answer was wrong.
 *
 * The Stage 3C RESULT still stands and is not rewritten: it was BLOCKED, and it
 * would have been BLOCKED on the base model alone. But "no Soup" was a defect in
 * the measurement, and a stage that quietly dropped that line while re-reporting
 * the rest would be laundering its own error.
 *
 * WHAT REMAINS BLOCKED is the base model, and it is blocked by organizational
 * policy rather than by absence: huggingface_hub.snapshot_download returns
 * ProxyError 403 through the installed stack, which is the same denial curl saw.
 * The stage brief says not to bypass it, not to use an undocumented proxy, and not
 * to pull weights from an untrusted mirror to make the stage pass. So no candidate
 * exists, and no accuracy, regret, complementarity, hybrid or generalization
 * figure appears anywhere in these artifacts.
 *
 * Everything that does not need pretrained weights is built and measured: the
 * campaign lineage, the abstention decision, the topology-skew sampler, the frozen
 * task and target contracts, the Soup dataset-parser verification against real
 * FORGE_DATASET_V2 exports, and a pipeline harness that proves the train loop
 * writes and reloads a checkpoint.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { FORGE_DATASET_V2_VERSION } from '../forge/dataset-v2.js';
import { SOUP_COMMIT, SOUP_VERSION } from '../forge/soup-bridge.js';
import { STAGE3C_TASK_CONTRACT, buildTarget, classifyRuleMatches } from './stage3c-learned-nexus.js';

export const STAGE3CR_STAGE = 'STAGE3CR_TRAINING_ENVIRONMENT_AND_CAMPAIGN_RERUN';

/* The parent. Read, never rewritten. */
export const STAGE3CR_PARENT_CERTIFICATION = 'aecd3183fa322c6e47557d309e07e1bb8d0e04695922be76e51057d6a6749e72';
export const STAGE3CR_PARENT_STATUS = 'BLOCKED';
export const STAGE3CR_PARENT_OUTCOME = 'G_BLOCKED';
export const STAGE3CR_DATASET_HASH = '4d1a27925346258ebafea93890739f8d0ef206927b77ba6240e54d83488cea20';

/* ---------------------------------------------------------------------------
 * PHASE 2 — environment capability, from measurements rather than assumptions.
 * ------------------------------------------------------------------------- */

export const TRAINING_ENVIRONMENT_CLASSES = deepFreeze([
  'GPU_FULL', 'GPU_QLORA_ONLY', 'APPLE_METAL', 'CPU_SMALL_MODEL_ONLY', 'CLOUD_AVAILABLE', 'UNSUITABLE',
]);

export function classifyEnvironment(hardware) {
  const { gpuCount, vramMb, metal, cpuCount, ramMb } = hardware;
  if (gpuCount > 0 && vramMb >= 24000) return 'GPU_FULL';
  if (gpuCount > 0) return 'GPU_QLORA_ONLY';
  if (metal === true) return 'APPLE_METAL';
  /* A CPU with four cores and 16 GB will not train a 7B model, and saying
   * CPU_SMALL_MODEL_ONLY is not a euphemism for UNSUITABLE: a sub-billion
   * parameter LoRA run is genuinely within this budget. UNSUITABLE is reserved
   * for a machine that could not finish any run at all. */
  if (cpuCount >= 2 && ramMb >= 8000) return 'CPU_SMALL_MODEL_ONLY';
  return 'UNSUITABLE';
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — the qualification gate.
 * ------------------------------------------------------------------------- */

export const STAGE3CR_QUALIFICATION_REQUIREMENTS = deepFreeze([
  { id: 'SOUP_EXECUTABLE', why: 'the named training engine must actually run' },
  { id: 'TORCH_AVAILABLE', why: 'a gradient has to be computable' },
  { id: 'BASE_MODEL_AVAILABLE', why: 'SFT adapts a base model; without weights there is nothing to adapt' },
  { id: 'BASE_MODEL_HASHED', why: 'a candidate whose parent cannot be identified cannot be reproduced' },
  { id: 'TOKENIZER_AVAILABLE', why: 'the task is text-shaped and needs one' },
  { id: 'TRAIN_SPLIT_AVAILABLE', why: 'TRAIN-only optimisation must have TRAIN to optimise on' },
  { id: 'CHECKPOINT_WRITE_TEST', why: 'a run that cannot save is a run that produced nothing' },
]);

export function qualifyEnvironment(probe) {
  const results = STAGE3CR_QUALIFICATION_REQUIREMENTS.map((requirement) => ({
    id: requirement.id, why: requirement.why, satisfied: probe[requirement.id] === true,
  }));
  const missing = results.filter((entry) => !entry.satisfied).map((entry) => entry.id);
  return {
    requirements: results,
    missing,
    qualified: missing.length === 0,
    /* The distinction the stage turns on: an absent tool can be installed, a
     * policy denial cannot be worked around from inside. */
    blockerClass: missing.length === 0 ? null
      : missing.includes('BASE_MODEL_AVAILABLE') ? 'ORGANIZATIONAL_EGRESS_POLICY_DENIAL'
        : 'ENVIRONMENT_SUBSTRATE_UNAVAILABLE',
    outcome: missing.length === 0 ? null : 'F_TRAINING_ENVIRONMENT_STILL_BLOCKED',
  };
}

/* ---------------------------------------------------------------------------
 * The Stage 3C probe correction.
 * ------------------------------------------------------------------------- */

export const STAGE3C_PROBE_CORRECTION = deepFreeze({
  field: 'SOUP_INSTALLED',
  stage3cReported: false,
  stage3crMeasured: true,
  cause: 'Stage 3C probed `which soup`, which answers "is there an installed executable on PATH", not "is Soup available". A clean git checkout of Soup at the pinned commit was present outside the repository the whole time and the probe could not see it.',
  correctedBy: 'checking for a source checkout at the pinned commit AND installing it, then running the CLI',
  stage3cResultChanged: false,
  stage3cResultChangedNote: 'Stage 3C was BLOCKED and remains BLOCKED in the historical record. It would have been BLOCKED on BASE_MODEL_WEIGHTS alone, so the corrected line does not change its outcome — but the line was wrong and is corrected here rather than quietly dropped.',
});

/* ---------------------------------------------------------------------------
 * PHASE 8 — the abstention decision.
 * ------------------------------------------------------------------------- */

export const STAGE3CR_ABSTENTION_DECISION = deepFreeze({
  option: 'A_TRAIN_ACTION_SELECTION_WITHOUT_CLAIMING_ABSTENTION',
  rejected: deepFreeze([
    { option: 'B_SUPPLEMENTAL_NEGATIVE_CONTROLS', why: 'it would mean generating a new TRAIN-only control set before the first candidate has demonstrated it can learn the base task at all — solving a second problem before the first one is known to be solvable' },
    { option: 'C_DEFER', why: 'equivalent in effect to A for this campaign; A is chosen because it states positively what the candidate is being asked to do' },
  ]),
  rationale: 'FORGE_DATASET_V2 contains 20 negative controls in 50,860 TRAIN records. That is not enough signal to learn when to abstain, and a model trained on it that emitted an abstention would be guessing. The first candidate is asked to select an action, and the task contract drops the abstain field rather than carrying one nothing taught it to use.',
  canonicalDatasetRebalanced: false,
  abstentionClaimed: false,
});

/* ---------------------------------------------------------------------------
 * PHASE 11/12 — the frozen task and target.
 * ------------------------------------------------------------------------- */

export const STAGE3CR_TASK_CONTRACT = deepFreeze({
  taskId: 'LEARNED_NEXUS_ACTION_SELECTION_V1',
  parentTaskId: STAGE3C_TASK_CONTRACT.taskId,
  framing: 'STRUCTURED_ACTION_SELECTION',
  input: deepFreeze(['objective', 'canonicalEntities', 'relations', 'quantitativeState', 'legalActions']),
  output: deepFreeze({ actionId: 'string', confidence: 'number in [0,1]' }),
  abstainField: false,
  abstainFieldNote: 'Removed relative to the Stage 3C contract, per the Phase 8 decision. A field the training data cannot teach is a field the model will fill with noise.',
  naturalLanguageExplanationRequired: false,
  hiddenChainOfThoughtRequired: false,
  legalityRule: STAGE3C_TASK_CONTRACT.legalityRule,
});

export const STAGE3CR_TARGET_CONTRACT = deepFreeze({
  source: 'FORGE_COUNTERFACTUAL_OPTIMAL_SET',
  exactTiePolicy: 'ACCEPT_ANY_MEMBER_OF_OPTIMAL_SET_AT_EVALUATION; EXCLUDE_FROM_SINGLE_TARGET_SFT',
  neverTrains: 'LEXICOGRAPHIC_TIE_BREAKING_AS_CORRECTNESS',
  neverTrainsNote: 'A tie is the world saying two actions are worth the same. Training the sort order as if it were the answer teaches the sorting function, which is a fact about the code rather than about the world.',
});

/* ---------------------------------------------------------------------------
 * PHASE 9 — the topology-skew sampler. TRAIN only.
 * ------------------------------------------------------------------------- */

export const STAGE3CR_SAMPLER_VERSION = 'STAGE3CR_TOPOLOGY_BALANCED_SAMPLER_V1';

/**
 * Cap any single topology's share of the sampled set.
 *
 * Stage 3C measured that selecting for relational richness pulls 55% of the
 * subset from mesh and redundant_network, because those are the densest shapes and
 * the informative rules key on density. Training on that distribution measures
 * dense graphs. The cap is applied to TRAIN ONLY — VALIDATION, HOLDOUT and OOD are
 * never touched, because a sampler that reshaped the evaluation sets would be
 * choosing its own exam.
 *
 * Selection within a shape is by record hash order, so the sample is deterministic
 * and independent of the order records arrive in.
 */
export function sampleBalancedByTopology(records, { maxSharePerShape = 0.15, limit = null } = {}) {
  const byShape = new Map();
  for (const record of records) {
    if (!byShape.has(record.shape)) byShape.set(record.shape, []);
    byShape.get(record.shape).push(record);
  }
  for (const list of byShape.values()) {
    list.sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
  }

  const shapes = [...byShape.keys()].sort();
  const target = limit === null ? records.length : limit;
  const cap = Math.max(1, Math.floor(target * maxSharePerShape));

  const taken = [];
  for (const shape of shapes) taken.push(...byShape.get(shape).slice(0, cap));
  taken.sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
  const sampled = limit === null ? taken : taken.slice(0, limit);

  const share = (list) => {
    const counts = {};
    for (const record of list) counts[record.shape] = (counts[record.shape] ?? 0) + 1;
    return Object.fromEntries(Object.entries(counts)
      .map(([shape, count]) => [shape, Math.round((count * 10000) / list.length) / 10000]));
  };
  const sourceShare = share(records);
  const sampledShare = share(sampled);

  return {
    version: STAGE3CR_SAMPLER_VERSION,
    maxSharePerShape,
    capPerShape: cap,
    sourceRecords: records.length,
    sampledRecords: sampled.length,
    sourceDistribution: sourceShare,
    sampledDistribution: sampledShare,
    sourceLargestShare: Math.max(...Object.values(sourceShare), 0),
    sampledLargestShare: Math.max(...Object.values(sampledShare), 0),
    skewReduced: Math.max(...Object.values(sampledShare), 0) < Math.max(...Object.values(sourceShare), 0),
    appliedTo: 'TRAIN_ONLY',
    evaluationSplitsUntouched: true,
    sampled,
  };
}

/* ---------------------------------------------------------------------------
 * SFT row construction. Alpaca, because that is what Soup detects.
 * ------------------------------------------------------------------------- */

export function buildInstruction(record) {
  const actions = (record.branches ?? []).map((branch, index) => {
    const target = branch.targetId === null ? '' : ` -> ${branch.targetId}`;
    return `  ${index}. [${branch.actionKey}] ${branch.actionType}${target}`;
  }).join('\n');
  return [
    'You are a relational intervention specialist. Choose exactly one legal action.',
    '',
    `objective: ${record.objectives}   topology: ${record.shape}   level: L${record.level}`,
    `entities: ${record.entityCount}   relations: ${record.relationCount}   energy: ${record.energy}`,
    `tick: ${record.tick}/${record.maxTicks}   open objectives: ${record.objectiveCount}`,
    '',
    'legal actions:',
    actions,
    '',
    'Answer with JSON: {"actionId": "<actionKey>", "confidence": <0..1>}',
  ].join('\n');
}

/** One SFT row, or null when the record is not eligible for a single target. */
export function buildSftRow(record) {
  const target = buildTarget(record);
  if (!target.singleTargetSftEligible) return null;
  const optimal = target.optimalSet[0];
  if (optimal === undefined) return null;
  return {
    instruction: buildInstruction(record),
    output: JSON.stringify({ actionId: optimal, confidence: 1 }),
    forge_metadata: {
      recordHash: record.recordHash,
      datasetVersion: FORGE_DATASET_V2_VERSION,
      split: record.split,
      shape: record.shape,
      supervisionClass: record.supervisionClass,
      optimalSetSize: target.optimalSetSize,
      rewardGap: target.rewardGap,
    },
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 7 — campaign lineage.
 * ------------------------------------------------------------------------- */

export function buildCampaign({ environment, soup, baseModel, trainingConfig, sampler }) {
  const body = {
    campaignKind: 'SUCCESSOR',
    parentStage: 'STAGE3C_LEARNED_NEXUS_CANDIDATE',
    parentCertification: STAGE3CR_PARENT_CERTIFICATION,
    parentStatus: STAGE3CR_PARENT_STATUS,
    parentMutated: false,
    datasetVersion: FORGE_DATASET_V2_VERSION,
    datasetHash: STAGE3CR_DATASET_HASH,
    soupCommit: SOUP_COMMIT,
    soupVersion: SOUP_VERSION,
    soupInstalled: soup.installed,
    baseModel: baseModel.model,
    baseModelHash: baseModel.hash,
    tokenizerHash: baseModel.tokenizerHash,
    environment,
    trainingConfig,
    sampler,
    taskContract: STAGE3CR_TASK_CONTRACT.taskId,
    targetContract: STAGE3CR_TARGET_CONTRACT.exactTiePolicy,
  };
  return { ...body, campaignId: `STAGE3CR-${sha256(body).slice(0, 16)}` };
}

/* ---------------------------------------------------------------------------
 * PHASE 10 — the inherited selector limitation, carried forward verbatim.
 * ------------------------------------------------------------------------- */

export const STAGE3CR_SELECTOR_LIMITATION = deepFreeze({
  nexusSelectorAccuracy: 0.2462,
  greedyHeuristicAccuracy: 0.275,
  selectorBeatsGreedy: false,
  misreadingToAvoid: 'This is NOT deterministic Nexus\'s relational accuracy. Nexus emits graph-level signals and no action at all; NEXUS_RELATIONAL_SELECTOR_V1 is one policy built on those signals, and its score is that policy\'s score. A different policy over the same signals could do better or worse without Nexus having changed.',
  rawSignalsPreserved: true,
  rawSignalsPreservedWhy: 'Future hybrid work needs the signals themselves, not one policy\'s collapse of them into a choice.',
});

export { SOUP_COMMIT, SOUP_VERSION, buildTarget, classifyRuleMatches };
