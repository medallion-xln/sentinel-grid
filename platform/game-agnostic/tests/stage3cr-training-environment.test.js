/* Stage 3C-R — training environment provisioning.
 *
 * The tests that matter are the ones that would catch this stage claiming a
 * candidate it does not have, rewriting its parent's blocked result, letting a
 * random harness pass for a base model, or reshaping an evaluation split.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE3CR_ABSTENTION_DECISION, STAGE3CR_PARENT_CERTIFICATION, STAGE3CR_PARENT_OUTCOME,
  STAGE3CR_PARENT_STATUS, STAGE3CR_QUALIFICATION_REQUIREMENTS, STAGE3CR_SELECTOR_LIMITATION,
  STAGE3CR_TARGET_CONTRACT, STAGE3CR_TASK_CONTRACT, STAGE3C_PROBE_CORRECTION,
  buildCampaign, buildSftRow, classifyEnvironment, qualifyEnvironment, sampleBalancedByTopology,
} from '../src/lab/stage3cr-training-environment.js';

const record = (over = {}) => ({
  recordHash: 'a'.repeat(64), shape: 'mesh', roles: 'bare', objectives: 'restore_infrastructure',
  level: 2, split: 'TRAIN', entityCount: 10, relationCount: 12, legalActionCount: 3,
  energy: 20, tick: 5, maxTicks: 30, objectiveCount: 1, utilitySpread: 30, optimalScalar: 100,
  supervisionClass: 'UNIQUE_OPTIMUM',
  branches: [
    { actionKey: 'act-a', actionType: 'REPAIR', targetId: 'n1', scalarReward: 100, immediateScalar: 5, terminal: false },
    { actionKey: 'act-b', actionType: 'REINFORCE', targetId: 'n2', scalarReward: 80, immediateScalar: 9, terminal: false },
  ],
  ...over,
});

/* ---------------------------------------------------------------------------
 * The parent is read, never rewritten.
 * ------------------------------------------------------------------------- */

test('the parent stage stays BLOCKED and is not mutated', async () => {
  const { readFile } = await import('node:fs/promises');
  const stage3c = JSON.parse(await readFile(
    new URL('../artifacts/stage3c-learned-nexus/stage3c-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(stage3c.status, STAGE3CR_PARENT_STATUS);
  assert.equal(stage3c.stage3cOutcome, STAGE3CR_PARENT_OUTCOME);
  assert.equal(stage3c.certificationHash, STAGE3CR_PARENT_CERTIFICATION);
  assert.equal(stage3c.training.candidateStatus, 'NOT_TRAINED');
});

test('the probe correction fixes the measurement without changing the parent result', () => {
  assert.equal(STAGE3C_PROBE_CORRECTION.field, 'SOUP_INSTALLED');
  assert.equal(STAGE3C_PROBE_CORRECTION.stage3cReported, false);
  assert.equal(STAGE3C_PROBE_CORRECTION.stage3crMeasured, true);
  assert.equal(STAGE3C_PROBE_CORRECTION.stage3cResultChanged, false);
  assert.match(STAGE3C_PROBE_CORRECTION.cause, /which soup/);
});

/* ---------------------------------------------------------------------------
 * The qualification gate.
 * ------------------------------------------------------------------------- */

test('a missing base model blocks the gate and is named a policy denial', () => {
  const result = qualifyEnvironment({
    SOUP_EXECUTABLE: true, TORCH_AVAILABLE: true, BASE_MODEL_AVAILABLE: false,
    BASE_MODEL_HASHED: false, TOKENIZER_AVAILABLE: false, TRAIN_SPLIT_AVAILABLE: true,
    CHECKPOINT_WRITE_TEST: true,
  });
  assert.equal(result.qualified, false);
  assert.ok(result.missing.includes('BASE_MODEL_AVAILABLE'));
  assert.equal(result.blockerClass, 'ORGANIZATIONAL_EGRESS_POLICY_DENIAL');
  assert.equal(result.outcome, 'F_TRAINING_ENVIRONMENT_STILL_BLOCKED');
});

test('a complete substrate qualifies', () => {
  const probe = Object.fromEntries(STAGE3CR_QUALIFICATION_REQUIREMENTS.map((r) => [r.id, true]));
  const result = qualifyEnvironment(probe);
  assert.equal(result.qualified, true);
  assert.equal(result.outcome, null);
  assert.equal(result.blockerClass, null);
});

test('an absent tool blocks differently from a policy denial', () => {
  const probe = Object.fromEntries(STAGE3CR_QUALIFICATION_REQUIREMENTS.map((r) => [r.id, true]));
  const result = qualifyEnvironment({ ...probe, SOUP_EXECUTABLE: false });
  assert.equal(result.blockerClass, 'ENVIRONMENT_SUBSTRATE_UNAVAILABLE');
});

test('CPU with adequate RAM is small-model-capable, not unsuitable', () => {
  assert.equal(classifyEnvironment({ gpuCount: 0, vramMb: 0, metal: false, cpuCount: 4, ramMb: 16000 }), 'CPU_SMALL_MODEL_ONLY');
  assert.equal(classifyEnvironment({ gpuCount: 0, vramMb: 0, metal: false, cpuCount: 1, ramMb: 2000 }), 'UNSUITABLE');
  assert.equal(classifyEnvironment({ gpuCount: 1, vramMb: 40000, metal: false, cpuCount: 8, ramMb: 64000 }), 'GPU_FULL');
  assert.equal(classifyEnvironment({ gpuCount: 1, vramMb: 8000, metal: false, cpuCount: 8, ramMb: 32000 }), 'GPU_QLORA_ONLY');
});

/* ---------------------------------------------------------------------------
 * The harness is never a candidate.
 * ------------------------------------------------------------------------- */

test('the pipeline harness is recorded as not a base model and not a candidate', async () => {
  const { readFile } = await import('node:fs/promises');
  const harness = JSON.parse(await readFile(
    new URL('../artifacts/stage3cr-training-environment/stage3cr-pipeline-harness.json', import.meta.url), 'utf8'));
  assert.equal(harness.isBaseModel, false);
  assert.equal(harness.isCandidate, false);
  assert.equal(harness.purpose, 'PIPELINE_VERIFICATION_ONLY');
  assert.match(harness.provenance, /RANDOMLY_INITIALISED/);
  /* Proving the loop runs is the whole claim; no accuracy is attached to it. */
  assert.ok(!Object.hasOwn(harness, 'accuracy'));
  assert.ok(!Object.hasOwn(harness, 'optimalSetAccuracy'));
});

test('the certification reports no candidate and no training result', async () => {
  const { readFile } = await import('node:fs/promises');
  const c = JSON.parse(await readFile(
    new URL('../artifacts/stage3cr-training-environment/stage3cr-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(c.status, 'BLOCKED');
  assert.equal(c.stage3crOutcome, 'F_TRAINING_ENVIRONMENT_STILL_BLOCKED');
  assert.equal(c.stage3crCertified, false);
  assert.equal(c.training.sftCompleted, false);
  assert.equal(c.training.candidateArtifactHash, null);
  assert.equal(c.training.candidateStatus, 'NOT_TRAINED');
  assert.equal(c.training.smokeTrainPass, false);
  assert.equal(c.holdoutUntouched, true);
  assert.equal(c.oodUntouched, true);
  assert.equal(c.parent.mutated, false);
  const body = JSON.stringify(c);
  assert.ok(!/learnedAccuracy|learnedHoldoutAccuracy|learnedOodAccuracy/.test(body));
});

test('training reproducibility stays unclaimed, data and config do not', async () => {
  const { readFile } = await import('node:fs/promises');
  const r = JSON.parse(await readFile(
    new URL('../artifacts/stage3cr-training-environment/stage3cr-reproducibility.json', import.meta.url), 'utf8'));
  assert.equal(r.BITWISE_REPRODUCIBLE, null);
  assert.equal(r.STATISTICALLY_REPRODUCIBLE, null);
  assert.equal(r.DATA_REPRODUCIBLE, true);
  assert.equal(r.CONFIG_REPRODUCIBLE, true);
});

/* ---------------------------------------------------------------------------
 * The sampler touches TRAIN and nothing else.
 * ------------------------------------------------------------------------- */

test('the sampler reduces topology skew and is deterministic', () => {
  const records = [
    ...Array.from({ length: 60 }, (u, i) => record({ shape: 'mesh', recordHash: `m${i}`.padEnd(64, '0') })),
    ...Array.from({ length: 10 }, (u, i) => record({ shape: 'chain', recordHash: `c${i}`.padEnd(64, '0') })),
    ...Array.from({ length: 10 }, (u, i) => record({ shape: 'ring', recordHash: `r${i}`.padEnd(64, '0') })),
  ];
  const first = sampleBalancedByTopology(records, { maxSharePerShape: 0.4 });
  const second = sampleBalancedByTopology(records, { maxSharePerShape: 0.4 });
  assert.equal(first.skewReduced, true);
  assert.ok(first.sampledLargestShare < first.sourceLargestShare);
  assert.equal(first.appliedTo, 'TRAIN_ONLY');
  assert.equal(first.evaluationSplitsUntouched, true);
  assert.deepEqual(first.sampled.map((r) => r.recordHash), second.sampled.map((r) => r.recordHash));
});

test('the shipped sampler took the largest share down', async () => {
  const { readFile } = await import('node:fs/promises');
  const s = JSON.parse(await readFile(
    new URL('../artifacts/stage3cr-training-environment/stage3cr-sampler.json', import.meta.url), 'utf8'));
  assert.equal(s.appliedTo, 'TRAIN_ONLY');
  assert.equal(s.skewReduced, true);
  assert.ok(s.sampledLargestShare < s.sourceLargestShare);
  assert.ok(!Object.hasOwn(s, 'sampled'), 'the artifact must not inline the whole sample');
});

/* ---------------------------------------------------------------------------
 * Task and target contracts.
 * ------------------------------------------------------------------------- */

test('the task drops abstain because the data cannot teach it', () => {
  assert.equal(STAGE3CR_TASK_CONTRACT.abstainField, false);
  assert.equal(STAGE3CR_ABSTENTION_DECISION.option, 'A_TRAIN_ACTION_SELECTION_WITHOUT_CLAIMING_ABSTENTION');
  assert.equal(STAGE3CR_ABSTENTION_DECISION.abstentionClaimed, false);
  assert.equal(STAGE3CR_ABSTENTION_DECISION.canonicalDatasetRebalanced, false);
  assert.deepEqual(Object.keys(STAGE3CR_TASK_CONTRACT.output).sort(), ['actionId', 'confidence']);
});

test('an exact tie is never turned into a single SFT label', () => {
  const tied = record({
    supervisionClass: 'EXACT_EQUIVALENCE',
    branches: [
      { actionKey: 'act-a', actionType: 'REPAIR', targetId: 'n1', scalarReward: 100, immediateScalar: 1, terminal: false },
      { actionKey: 'act-b', actionType: 'REINFORCE', targetId: 'n2', scalarReward: 100, immediateScalar: 2, terminal: false },
    ],
  });
  assert.equal(buildSftRow(tied), null);
  assert.match(STAGE3CR_TARGET_CONTRACT.neverTrains, /LEXICOGRAPHIC/);
});

test('an eligible record produces a parseable alpaca row naming a legal action', () => {
  const row = buildSftRow(record());
  assert.ok(row !== null);
  assert.ok(typeof row.instruction === 'string' && row.instruction.length > 0);
  const parsed = JSON.parse(row.output);
  assert.equal(parsed.actionId, 'act-a');
  assert.equal(typeof parsed.confidence, 'number');
  assert.ok(row.instruction.includes('act-a'), 'the chosen action must appear among the legal actions shown');
  assert.equal(row.forge_metadata.split, 'TRAIN');
});

/* ---------------------------------------------------------------------------
 * Lineage and the inherited caveat.
 * ------------------------------------------------------------------------- */

test('the campaign is a successor bound to the parent certification', () => {
  const campaign = buildCampaign({
    environment: { class: 'CPU_SMALL_MODEL_ONLY' }, soup: { installed: true },
    baseModel: { model: null, hash: null, tokenizerHash: null },
    trainingConfig: null, sampler: 'STAGE3CR_TOPOLOGY_BALANCED_SAMPLER_V1',
  });
  assert.equal(campaign.campaignKind, 'SUCCESSOR');
  assert.equal(campaign.parentCertification, STAGE3CR_PARENT_CERTIFICATION);
  assert.equal(campaign.parentMutated, false);
  assert.match(campaign.campaignId, /^STAGE3CR-[0-9a-f]{16}$/);
});

test('the selector limitation is carried forward without being re-read as Nexus accuracy', () => {
  assert.equal(STAGE3CR_SELECTOR_LIMITATION.selectorBeatsGreedy, false);
  assert.equal(STAGE3CR_SELECTOR_LIMITATION.rawSignalsPreserved, true);
  assert.match(STAGE3CR_SELECTOR_LIMITATION.misreadingToAvoid, /NOT deterministic Nexus/);
});

/* ---------------------------------------------------------------------------
 * Soup drift.
 * ------------------------------------------------------------------------- */

test('the Soup format signatures pinned in the bridge match live Soup', async () => {
  const { readFile } = await import('node:fs/promises');
  const audit = JSON.parse(await readFile(
    new URL('../artifacts/stage3cr-training-environment/stage3cr-soup-audit.json', import.meta.url), 'utf8'));
  assert.deepEqual(audit.formatSignatureDrift, []);
  assert.equal(audit.formatSignaturesIdentical, true);
  assert.equal(audit.commitMatchesPin, true);
  assert.equal(audit.soupSourceModified, false);
  assert.equal(audit.datasetParserVerified, true);
  assert.ok(audit.datasetParserRows > 1000);
});

test('the base model attempt was made and the denial recorded without a bypass', async () => {
  const { readFile } = await import('node:fs/promises');
  const bm = JSON.parse(await readFile(
    new URL('../artifacts/stage3cr-training-environment/stage3cr-base-model.json', import.meta.url), 'utf8'));
  assert.equal(bm.attempted, true);
  assert.equal(bm.available, false);
  assert.equal(bm.bypassAttempted, false);
  assert.equal(bm.denialClass, 'ORGANIZATIONAL_EGRESS_POLICY_DENIAL');
  assert.ok(bm.alternateHostsProbed.length >= 4);
  assert.equal(bm.alternateHostsReachable, 0);
});
