/* Stage 3C-R.1 — trusted base model acquisition and training activation. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ACTIVATION_REQUIREMENTS, COMPUTE_FEASIBILITY_BUDGET_HOURS, FORBIDDEN_ACQUISITION_METHODS,
  MODEL_FORMAT_CLASSES, NAME_IS_NOT_PROVENANCE, PROVENANCE_FIELDS, STAGE3CR1_OUTCOMES,
  STAGE3CR1_PARENT_CERTIFICATION, SUPPLIED_PATH_VARIABLES, TRAINABILITY_STEPS,
  TRAINABLE_FORMAT_CLASSES, assessComputeFeasibility, buildProvenanceEnvelope,
  classifyModelArtifact, classifyOutcome, evaluateActivationGate, evaluateTrainability,
  isSelfAuthoredFixture, isTrainableFormat, partitionInventory, readSuppliedPath,
  summarizeChannels, validateSuppliedModel,
} from '../src/lab/stage3cr1-base-model-acquisition.js';
import { STAGE3CR_TARGET_CONTRACT, STAGE3CR_TASK_CONTRACT } from '../src/lab/stage3cr-training-environment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = (name) => JSON.parse(readFileSync(path.join(root, 'artifacts/stage3cr1-base-model-acquisition', name), 'utf8'));
const certification = artifact('stage3cr1-certification-result.json');

const HF_FILES = ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json'];

test('inference working is never evidence that a model is trainable', () => {
  /* The whole point of the format taxonomy: a GGUF runs and cannot carry a gradient. */
  assert.equal(classifyModelArtifact(['model.gguf', 'config.json', 'tokenizer.json']), 'GGUF_INFERENCE_ONLY');
  assert.equal(isTrainableFormat('GGUF_INFERENCE_ONLY'), false);
  assert.equal(isTrainableFormat('OLLAMA_INFERENCE_ONLY'), false);
});

test('a stray config.json cannot promote a GGUF directory to trainable', () => {
  /* Inference-only formats are decided first precisely so this cannot happen. */
  const withEverythingElse = ['config.json', 'tokenizer.json', 'model.safetensors', 'q4.gguf'];
  assert.equal(classifyModelArtifact(withEverythingElse), 'GGUF_INFERENCE_ONLY');
});

test('format classification reads the files, never the directory name', () => {
  /* classifyModelArtifact takes only file names; there is no path parameter to
   * be fooled by. A folder called qwen2.5-0.5b-instruct holding one GGUF is a GGUF. */
  assert.equal(classifyModelArtifact(HF_FILES), 'HF_TRAINABLE_CHECKPOINT');
  assert.equal(classifyModelArtifact(['config.json', 'pytorch_model.bin', 'vocab.json']), 'PYTORCH_TRAINABLE');
  assert.equal(classifyModelArtifact(['tokenizer.json']), 'TOKENIZER_ONLY');
  assert.equal(classifyModelArtifact(['config.json']), 'PARTIAL_MODEL');
  assert.equal(classifyModelArtifact([]), 'UNKNOWN');
  for (const files of [HF_FILES, ['x.gguf'], ['tokenizer.json'], []]) {
    assert.ok(MODEL_FORMAT_CLASSES.includes(classifyModelArtifact(files)));
  }
});

test('an adapter is not a base model', () => {
  /* adapter_model.safetensors must not be mistaken for base weights. */
  assert.equal(classifyModelArtifact(['adapter_model.safetensors', 'adapter_config.json']), 'UNKNOWN');
});

test('every provenance field is required and none is optional', () => {
  assert.equal(PROVENANCE_FIELDS.length, 10);
  const complete = {
    BASE_MODEL_ID: 'x/y', BASE_MODEL_VERSION: '1', BASE_MODEL_SOURCE: 'src',
    BASE_MODEL_PATH: '/p', BASE_MODEL_LICENSE: 'apache-2.0', BASE_MODEL_PARAMETER_COUNT: 494032768,
    CONFIG_HASH: 'a', TOKENIZER_HASH: 'b', WEIGHT_FILE_HASHES: ['m:c'], AGGREGATE_MODEL_HASH: 'd',
  };
  assert.equal(buildProvenanceEnvelope(complete).complete, true);
  for (const field of PROVENANCE_FIELDS) {
    const missingOne = { ...complete, [field]: null };
    const envelope = buildProvenanceEnvelope(missingOne);
    assert.equal(envelope.complete, false, `${field} must be required`);
    assert.deepEqual(envelope.missing, [field]);
  }
});

test('a blank license string does not satisfy the license requirement', () => {
  const envelope = buildProvenanceEnvelope({
    BASE_MODEL_ID: 'x', BASE_MODEL_VERSION: '1', BASE_MODEL_SOURCE: 's', BASE_MODEL_PATH: '/p',
    BASE_MODEL_LICENSE: '   ', BASE_MODEL_PARAMETER_COUNT: 1, CONFIG_HASH: 'a',
    TOKENIZER_HASH: 'b', WEIGHT_FILE_HASHES: ['m:c'], AGGREGATE_MODEL_HASH: 'd',
  });
  assert.equal(envelope.complete, false);
  assert.deepEqual(envelope.missing, ['BASE_MODEL_LICENSE']);
});

test('the aggregate hash is derived from the parts, so the two cannot disagree', () => {
  const base = {
    BASE_MODEL_ID: 'x/y', BASE_MODEL_VERSION: '1', BASE_MODEL_SOURCE: 'src', BASE_MODEL_PATH: '/p',
    BASE_MODEL_LICENSE: 'apache-2.0', BASE_MODEL_PARAMETER_COUNT: 10, CONFIG_HASH: 'a',
    TOKENIZER_HASH: 'b', WEIGHT_FILE_HASHES: ['m:c'], AGGREGATE_MODEL_HASH: 'declared',
  };
  const envelope = buildProvenanceEnvelope(base);
  assert.equal(envelope.aggregateMatches, false);
  const honest = buildProvenanceEnvelope({ ...base, AGGREGATE_MODEL_HASH: envelope.derivedAggregate });
  assert.equal(honest.aggregateMatches, true);
  /* Changing any weight hash changes the aggregate. */
  const tampered = buildProvenanceEnvelope({ ...base, WEIGHT_FILE_HASHES: ['m:TAMPERED'], AGGREGATE_MODEL_HASH: envelope.derivedAggregate });
  assert.equal(tampered.aggregateMatches, false);
});

test('a complete, trainable, causal supplied model is accepted', () => {
  const accepted = validateSuppliedModel({
    declared: true, path: '/models/base', exists: true, isDirectory: true,
    files: HF_FILES, tokenizerPresent: true, architectures: ['Qwen2ForCausalLM'],
    provenance: {
      BASE_MODEL_ID: 'x/y', BASE_MODEL_VERSION: '1', BASE_MODEL_SOURCE: 'src', BASE_MODEL_PATH: '/models/base',
      BASE_MODEL_LICENSE: 'apache-2.0', BASE_MODEL_PARAMETER_COUNT: 494032768, CONFIG_HASH: 'a',
      TOKENIZER_HASH: 'b', WEIGHT_FILE_HASHES: ['model.safetensors:c'], AGGREGATE_MODEL_HASH: 'd',
    },
  });
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.rejections, []);
  assert.equal(accepted.formatClass, 'HF_TRAINABLE_CHECKPOINT');
});

test('a non-causal architecture is rejected however complete it otherwise is', () => {
  const rejected = validateSuppliedModel({
    declared: true, path: '/models/bert', exists: true, isDirectory: true,
    files: HF_FILES, tokenizerPresent: true, architectures: ['BertForMaskedLM'],
    provenance: {
      BASE_MODEL_ID: 'x/y', BASE_MODEL_VERSION: '1', BASE_MODEL_SOURCE: 'src', BASE_MODEL_PATH: '/models/bert',
      BASE_MODEL_LICENSE: 'apache-2.0', BASE_MODEL_PARAMETER_COUNT: 1, CONFIG_HASH: 'a',
      TOKENIZER_HASH: 'b', WEIGHT_FILE_HASHES: ['m:c'], AGGREGATE_MODEL_HASH: 'd',
    },
  });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.rejections.includes('NOT_CAUSAL_LM'));
});

test('an undeclared path is a rejection, not a licence to go looking', () => {
  const undeclared = validateSuppliedModel({ declared: false, provenance: {} });
  assert.equal(undeclared.accepted, false);
  assert.ok(undeclared.rejections.includes('NOT_DECLARED'));
  assert.equal(undeclared.path, null);
  /* No search field, no candidate list, nothing that could have been found instead. */
  assert.equal(undeclared.formatClass, null);
});

test('the supplied path is read only from the declared variables', () => {
  assert.deepEqual(readSuppliedPath({}), { declared: false, variable: null, path: null });
  assert.deepEqual(readSuppliedPath({ SENTINEL_BASE_MODEL_PATH: ' /m ' }), { declared: true, variable: 'SENTINEL_BASE_MODEL_PATH', path: '/m' });
  assert.deepEqual(readSuppliedPath({ SENTINEL_BASE_MODEL: '/n' }), { declared: true, variable: 'SENTINEL_BASE_MODEL', path: '/n' });
  /* A near-miss name is not one of the declared variables. */
  assert.equal(readSuppliedPath({ SENTINEL_MODEL_PATH: '/wrong' }).declared, false);
  assert.equal(SUPPLIED_PATH_VARIABLES.length, 2);
});

test('trainability requires every step to have been observed', () => {
  assert.equal(evaluateTrainability({}).pass, false);
  const all = Object.fromEntries(TRAINABILITY_STEPS.map((s) => [s, true]));
  assert.equal(evaluateTrainability(all).pass, true);
  for (const step of TRAINABILITY_STEPS) {
    const result = evaluateTrainability({ ...all, [step]: false });
    assert.equal(result.pass, false, `${step} must be required`);
    assert.deepEqual(result.failed, [step]);
  }
});

test('feasibility is measured throughput, and an unmeasured run is not feasible', () => {
  assert.equal(assessComputeFeasibility({ examplesPerSecond: 0, trainingExamples: 4459, epochs: 1 }).feasible, false);
  assert.equal(assessComputeFeasibility({ examplesPerSecond: Number.NaN, trainingExamples: 1, epochs: 1 }).measured, false);
  const fast = assessComputeFeasibility({ examplesPerSecond: 6.5, trainingExamples: 4459, epochs: 1 });
  assert.equal(fast.feasible, true);
  const slow = assessComputeFeasibility({ examplesPerSecond: 0.05, trainingExamples: 4459, epochs: 3 });
  assert.equal(slow.feasible, false);
  assert.equal(slow.reason, 'EXCEEDS_BUDGET');
  assert.ok(slow.estimatedHours > COMPUTE_FEASIBILITY_BUDGET_HOURS);
});

test('the activation gate opens only when all seven requirements hold', () => {
  const all = Object.fromEntries(ACTIVATION_REQUIREMENTS.map((r) => [r.id, true]));
  assert.equal(evaluateActivationGate(all).qualified, true);
  for (const r of ACTIVATION_REQUIREMENTS) {
    const gate = evaluateActivationGate({ ...all, [r.id]: false });
    assert.equal(gate.qualified, false, `${r.id} must be required`);
    assert.deepEqual(gate.missing, [r.id]);
  }
});

test('a model this project generated is not a model this project acquired', () => {
  const artifacts = [
    { path: '/home/user/soup-harness/tiny-harness', files: HF_FILES },
    { path: '/models/real', files: HF_FILES },
  ];
  const partition = partitionInventory(artifacts);
  assert.equal(partition.total, 2);
  assert.equal(partition.candidateCount, 1);
  assert.equal(partition.selfAuthoredFixtures.length, 1);
  assert.equal(isSelfAuthoredFixture('/home/user/soup-harness/out'), true);
  assert.equal(isSelfAuthoredFixture('/models/real'), false);
  /* The exclusion is by origin, not by name: a fixture that looks perfect is
   * still excluded, and a real model in a plainly-named folder is still counted. */
  assert.equal(partition.acquisitionCandidates[0].path, '/models/real');
});

test('a reachable channel is not thereby a source of models', () => {
  const summary = summarizeChannels([
    { channel: 'GCS', status: 'AUTHORIZED', carriesAuthorizedModel: false },
    { channel: 'PYPI', status: 'AUTHORIZED', carriesAuthorizedModel: false },
    { channel: 'HUGGINGFACE', status: 'DENIED_BY_POLICY', carriesAuthorizedModel: false },
  ]);
  assert.equal(summary.authorized.length, 2);
  assert.equal(summary.anyAuthorizedModelSource, false);
  const withModel = summarizeChannels([{ channel: 'X', status: 'AUTHORIZED', carriesAuthorizedModel: true }]);
  assert.equal(withModel.anyAuthorizedModelSource, true);
});

test('outcome classification names the most specific true statement', () => {
  const base = {
    phase0Reproduced: true, trainingCompleted: false, modelAccepted: false,
    pipelineCompatible: null, computeFeasible: false, artifactsFound: 0,
    trainableArtifactsFound: 0, provenanceCompleteCount: 0,
  };
  assert.equal(classifyOutcome(base), 'E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE');
  assert.equal(classifyOutcome({ ...base, phase0Reproduced: false }), 'G_BLOCKED');
  assert.equal(classifyOutcome({ ...base, trainingCompleted: true }), 'A_BASE_MODEL_BOUND_AND_LEARNED_NEXUS_TRAINED');
  assert.equal(classifyOutcome({ ...base, modelAccepted: true, computeFeasible: false }), 'B_BASE_MODEL_AVAILABLE_BUT_COMPUTE_INSUFFICIENT');
  assert.equal(classifyOutcome({ ...base, modelAccepted: true, pipelineCompatible: false }), 'F_TRAINING_PIPELINE_INCOMPATIBLE_WITH_MODEL');
  assert.equal(classifyOutcome({ ...base, artifactsFound: 2, trainableArtifactsFound: 0 }), 'C_MODEL_ARTIFACT_FOUND_BUT_NOT_TRAINABLE');
  assert.equal(classifyOutcome({ ...base, artifactsFound: 2, trainableArtifactsFound: 1 }), 'D_MODEL_PROVENANCE_INSUFFICIENT');
  /* An artifact found and rejected is never reported as nothing found. */
  assert.notEqual(classifyOutcome({ ...base, artifactsFound: 1, trainableArtifactsFound: 1 }), 'E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE');
  for (const o of STAGE3CR1_OUTCOMES) assert.equal(typeof o, 'string');
});

test('a phase 0 failure outranks every other outcome', () => {
  /* Even a completed training run cannot be certified on top of parents that
   * no longer reproduce. */
  assert.equal(classifyOutcome({
    phase0Reproduced: false, trainingCompleted: true, modelAccepted: true,
    pipelineCompatible: true, computeFeasible: true, artifactsFound: 1,
    trainableArtifactsFound: 1, provenanceCompleteCount: 1,
  }), 'G_BLOCKED');
});

test('both parents reproduce and neither is rewritten', () => {
  const phase0 = artifact('stage3cr1-phase0-reproduction.json');
  assert.equal(phase0.stage3cHashMatches, true);
  assert.equal(phase0.stage3cStillBlocked, true);
  assert.equal(phase0.stage3crHashMatches, true);
  assert.equal(phase0.stage3crStillBlocked, true);
  assert.equal(phase0.stage3crOutcomeUnchanged, true);
  assert.equal(phase0.parentsRewritten, false);
  assert.equal(certification.parents.stage3c.mutated, false);
  assert.equal(certification.parents.stage3cr.mutated, false);
  assert.equal(certification.parents.stage3cr.certification, STAGE3CR1_PARENT_CERTIFICATION);
});

test('the pipeline was re-executed in this container, not inherited', () => {
  const phase0 = artifact('stage3cr1-phase0-reproduction.json');
  for (const step of ['soupExecutable', 'torchAvailable', 'datasetParsePass', 'trainLoopPass',
    'loraApplicationPass', 'checkpointWritePass', 'adapterReloadPass', 'inferencePass']) {
    assert.equal(phase0[step], true, `${step} must have been re-observed`);
  }
  assert.equal(phase0.datasetParseRows, 4459);
  /* The adapter came back bit-identical on a different machine. */
  assert.equal(phase0.adapterReproducedFromStage3cr, true);
});

test('the gate was actually run against something and actually rejected it', () => {
  const rejection = artifact('stage3cr1-fixture-rejection.json');
  assert.equal(rejection.ran, true);
  assert.equal(rejection.formatIsTrainable, true, 'the fixture is trainable in the format sense');
  assert.equal(rejection.accepted, false, 'and is still refused');
  assert.ok(rejection.rejections.includes('PROVENANCE_INCOMPLETE'));
});

test('no base model was acquired and none was invented', () => {
  assert.equal(certification.baseModel.available, false);
  assert.equal(certification.baseModel.hashed, false);
  assert.equal(certification.baseModel.model, null);
  assert.equal(certification.baseModel.license, null);
  assert.equal(certification.baseModel.envelope.complete, false);
  assert.equal(certification.activationGate.qualified, false);
  assert.equal(certification.stage3cr1Outcome, 'E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE');
  assert.equal(certification.stage3cr1Certified, false);
  assert.equal(certification.status, 'BLOCKED');
});

test('the egress policy was respected and no forbidden method was used', () => {
  const channels = artifact('stage3cr1-acquisition-channels.json');
  assert.equal(channels.egressPolicyBypassed, false);
  assert.deepEqual(channels.forbiddenMethodsUsed, []);
  assert.deepEqual(channels.forbiddenMethods, FORBIDDEN_ACQUISITION_METHODS);
  assert.ok(FORBIDDEN_ACQUISITION_METHODS.includes('UNAUTHORIZED_MIRROR'));
  assert.ok(FORBIDDEN_ACQUISITION_METHODS.includes('LOSSY_REVERSE_CONVERSION_TO_FORCE_TRAINING'));
  /* Every channel the probe reached is recorded as carrying no authorized model. */
  assert.equal(channels.summary.anyAuthorizedModelSource, false);
});

test('the squatted bucket was found, recorded and not acted on', () => {
  const finding = artifact('stage3cr1-squatted-bucket-finding.json');
  assert.equal(finding.actedOn, false);
  assert.equal(finding.rule, NAME_IS_NOT_PROVENANCE.rule);
  assert.equal(finding.measured.probed, true);
  /* The bucket that once served OpenAI's GPT-2 holds no model files now. */
  assert.equal(finding.measured.containsModelFiles, false);
});

test('the frozen campaign was not started, redesigned or approximated', () => {
  const campaign = artifact('stage3cr1-campaign-status.json');
  assert.equal(campaign.started, false);
  assert.equal(campaign.sftStarted, false);
  assert.equal(campaign.sftCompleted, false);
  assert.equal(campaign.candidateStatus, 'NOT_TRAINED');
  assert.equal(campaign.candidateArtifact, null);
  assert.equal(campaign.datasetModified, false);
  assert.equal(campaign.frozenTaskContract, STAGE3CR_TASK_CONTRACT.taskId);
  assert.equal(campaign.frozenTargetContract, STAGE3CR_TARGET_CONTRACT.exactTiePolicy);
});

test('VALIDATION, HOLDOUT and OOD were never opened', () => {
  const campaign = artifact('stage3cr1-campaign-status.json');
  assert.equal(campaign.validationOpened, false);
  assert.equal(campaign.holdoutOpened, false);
  assert.equal(campaign.oodOpened, false);
  assert.equal(campaign.trainSplitOnly, true);
});

test('no accuracy or generalization figure is reported without a candidate', () => {
  /* A blocked acquisition stage that quoted a score would be quoting nothing. */
  const text = JSON.stringify(certification);
  for (const forbidden of ['holdoutAccuracy', 'oodAccuracy', 'candidateAccuracy', 'hybridAccuracy', 'complementarity"']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test('authority is unchanged and no candidate is referenced by a live runtime', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.liveRuntimeReferencesCandidate, false);
});

test('the certification carries no run-dependent value', () => {
  /* Wall-clock and throughput vary with machine load; if either entered the
   * hashed body, --check would fail on a busy machine and the reproduction
   * guarantee would be a coin flip. */
  const text = JSON.stringify(certification);
  for (const forbidden of ['trainWallSeconds', 'trainSamplesPerSecond', 'examplesPerSecond', 'tokensPerSecond']) {
    assert.equal(text.includes(forbidden), false, `${forbidden} must not enter the certification`);
  }
});

test('the stored certification matches a recomputed one', () => {
  const recomputed = artifact('stage3cr1-certification-result.json');
  assert.equal(recomputed.certificationHash, certification.certificationHash);
  assert.equal(typeof certification.evidenceDigest, 'string');
  assert.equal(certification.evidenceDigest.length, 64);
});

test('the trainable format set is a strict subset of the format classes', () => {
  for (const c of TRAINABLE_FORMAT_CLASSES) assert.ok(MODEL_FORMAT_CLASSES.includes(c));
  assert.ok(TRAINABLE_FORMAT_CLASSES.length < MODEL_FORMAT_CLASSES.length);
});
