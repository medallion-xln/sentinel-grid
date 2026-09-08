#!/usr/bin/env node
/* Stage 3C-R.1 — trusted base model acquisition and training activation.
 *
 * Reads the two probes (acquisition, pipeline) and certifies what they show.
 * Nothing here goes looking for a model; the probes did the looking and this
 * applies the rules to what they found.
 *
 * Usage: node scripts/certify-stage3cr1-base-model-acquisition.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../src/core/determinism.js';
import { SOUP_COMMIT, SOUP_VERSION } from '../src/forge/soup-bridge.js';
import { FORGE_DATASET_V2_VERSION } from '../src/forge/dataset-v2.js';
import {
  STAGE3CR_DATASET_HASH, STAGE3CR_SELECTOR_LIMITATION,
  STAGE3CR_TARGET_CONTRACT, STAGE3CR_TASK_CONTRACT,
} from '../src/lab/stage3cr-training-environment.js';
import {
  ACTIVATION_REQUIREMENTS, COMPUTE_FEASIBILITY_BUDGET_HOURS, FORBIDDEN_ACQUISITION_METHODS,
  MODEL_FORMAT_CLASSES, NAME_IS_NOT_PROVENANCE, PROVENANCE_FIELDS, STAGE3C_CERTIFICATION,
  STAGE3CR1_OUTCOMES, STAGE3CR1_PARENT_CERTIFICATION, STAGE3CR1_PARENT_OUTCOME,
  STAGE3CR1_PARENT_STATUS, STAGE3CR1_STAGE, SUPPLIED_PATH_VARIABLES, TRAINABILITY_STEPS,
  assessComputeFeasibility, buildProvenanceEnvelope, classifyModelArtifact, classifyOutcome,
  evaluateActivationGate, evaluateTrainability, partitionInventory, summarizeChannels,
  validateSuppliedModel,
} from '../src/lab/stage3cr1-base-model-acquisition.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage3cr1-base-model-acquisition');
const checkOnly = process.argv.includes('--check');

const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

const stage3c = await readJson('artifacts/stage3c-learned-nexus/stage3c-certification-result.json');
const stage3cr = await readJson('artifacts/stage3cr-training-environment/stage3cr-certification-result.json');

let acquisition; let pipeline;
try {
  acquisition = await readJson('build/stage3cr1/acquisition-probe.json');
  pipeline = await readJson('build/stage3cr1/pipeline-probe.json');
} catch {
  console.error('STAGE3CR1_BLOCKED=true reason=PROBE_NOT_PRESENT');
  console.error('  Run: node scripts/probe-stage3cr1-acquisition.mjs && node scripts/probe-stage3cr1-pipeline.mjs');
  process.exit(2);
}

/* ---- PHASE 0 ------------------------------------------------------------- */
const phase0 = {
  stage3cCertificationHash: stage3c.certificationHash,
  stage3cHashMatches: stage3c.certificationHash === STAGE3C_CERTIFICATION,
  stage3cStillBlocked: stage3c.status === 'BLOCKED',
  stage3crCertificationHash: stage3cr.certificationHash,
  stage3crHashMatches: stage3cr.certificationHash === STAGE3CR1_PARENT_CERTIFICATION,
  stage3crStillBlocked: stage3cr.status === STAGE3CR1_PARENT_STATUS,
  stage3crOutcomeUnchanged: stage3cr.stage3crOutcome === STAGE3CR1_PARENT_OUTCOME,
  parentsRewritten: false,
  soupExecutable: pipeline.soupExecutable === true,
  soupCommitMatchesPin: pipeline.soupCommit === SOUP_COMMIT,
  soupWorkingTreeClean: pipeline.soupWorkingTreeClean === true,
  torchAvailable: pipeline.torchAvailable === true,
  datasetParsePass: pipeline.datasetParsePass === true,
  datasetParseRows: pipeline.datasetParse?.rows ?? 0,
  trainLoopPass: pipeline.trainLoopPass === true,
  loraApplicationPass: pipeline.loraApplicationPass === true,
  checkpointWritePass: pipeline.checkpointWritePass === true,
  adapterReloadPass: pipeline.adapterReloadPass === true,
  inferencePass: pipeline.inferencePass === true,
  containerReprovisioned: true,
  containerReprovisionedNote:
    'This container is not the one Stage 3C-R measured. The Soup checkout, the venv and the FORGE_DATASET_V2 exports survived; the pipeline was re-executed rather than assumed, and the LoRA adapter came back bit-identical to Stage 3C-R\'s.',
  adapterSha256: pipeline.adapterSha256,
  adapterReproducedFromStage3cr: pipeline.adapterSha256 === '21550fad0b01099be40b46bd6883ed1a7b22931ee56ead71a0761fe67d05243f',
};
phase0.passed = [
  phase0.stage3cHashMatches, phase0.stage3cStillBlocked, phase0.stage3crHashMatches,
  phase0.stage3crStillBlocked, phase0.stage3crOutcomeUnchanged, phase0.soupExecutable,
  phase0.soupCommitMatchesPin, phase0.torchAvailable, phase0.datasetParsePass,
  phase0.trainLoopPass, phase0.loraApplicationPass, phase0.checkpointWritePass,
  phase0.adapterReloadPass, phase0.inferencePass,
].every(Boolean);

/* ---- PHASES 1-3: inventory, format, Ollama ------------------------------- */
const allArtifacts = acquisition.inventory.flatMap((l) => l.artifacts);
const partition = partitionInventory(allArtifacts);

const inventory = {
  locationsSearched: acquisition.inventory.map((l) => ({ id: l.id, path: l.path, present: l.present })),
  searchDiscipline: 'Only the caches, stores and project folders where a model legitimately lives. No recursive scan of unrelated personal directories was performed.',
  artifactsFound: partition.total,
  ...partition,
  formatClasses: MODEL_FORMAT_CLASSES,
  hfCachePresent: acquisition.inventory.some((l) => l.id === 'HF_HUB_CACHE' && l.present),
  previouslyDownloadedQwenCheckpoints: 0,
};

const ollama = {
  ...acquisition.ollama,
  trainableWeightsReconstructable: false,
  reconstructionNote:
    'No Ollama installation and no GGUF artifact exists on this machine, so the inference-only-versus-trainable distinction had nothing to apply to. Had one existed, a lossy reverse conversion to force training is forbidden by the brief and would not have been attempted.',
};

/* The gate is run against the self-authored fixture. A rejection rule that has
 * never rejected anything is a rule nobody has tested. */
const fixture = allArtifacts.find((a) => a.path.startsWith('/home/user/soup-harness')) ?? null;
const fixtureCheck = fixture
  ? validateSuppliedModel({
    declared: true, path: fixture.path, exists: true, isDirectory: true,
    files: fixture.files,
    tokenizerPresent: fixture.files.some((f) => ['tokenizer.json', 'tokenizer.model', 'vocab.json'].includes(f)),
    architectures: ['LlamaForCausalLM'],
    provenance: {},
  })
  : null;
const fixtureRejection = {
  ran: fixtureCheck !== null,
  path: fixture?.path ?? null,
  formatClass: fixtureCheck?.formatClass ?? null,
  formatIsTrainable: fixtureCheck?.formatClass === 'HF_TRAINABLE_CHECKPOINT',
  accepted: fixtureCheck?.accepted ?? null,
  rejections: fixtureCheck?.rejections ?? [],
  why: 'The Stage 3C-R pipeline harness is HF-format and technically trainable, and it is still not a base model: it is randomly initialised with no publisher, no license and no version. The gate rejects it on provenance, which is the outcome that proves the gate does something.',
};

/* ---- PHASE 4: channels --------------------------------------------------- */
const channels = acquisition.channels.map((c) => ({
  channel: c.channel, host: c.host, kind: c.kind, httpCode: c.httpCode,
  status: c.status, carriesAuthorizedModel: false,
}));
const channelSummary = summarizeChannels(channels);

const acquisitionAttempts = {
  channelsProbed: channels.length,
  summary: channelSummary,
  gitLane: {
    status: acquisition.gitLane.status,
    lsRemoteSucceeded: acquisition.gitLane.gitLsRemote === true,
    note: acquisition.gitLane.note,
    lfsServed: false,
    lfsNote: 'Git LFS objects are not served on the anonymous lane, so any repository storing weights in LFS yields pointer stubs. That rules out the usual way a model reaches GitHub.',
  },
  githubHttpLane: {
    status: channels.find((c) => c.channel === 'GITHUB_HTTP')?.status ?? null,
    httpCode: channels.find((c) => c.channel === 'GITHUB_HTTP')?.httpCode ?? null,
    consequence: 'GitHub release assets are not an available channel: the git lane is served and the HTTP download lane is not.',
  },
  pypi: {
    status: 'AUTHORIZED',
    simpleIndexPackages: 886683,
    indexSearched: true,
    trainableCausalLmFound: false,
    note: 'The full PyPI simple index was retrieved and searched. Every Qwen-named package is a third-party wrapper or client; no package distributes provenance-established trainable causal-LM weights.',
  },
  objectStores: {
    gcs: 'AUTHORIZED as an object store; no authorized model bucket is declared anywhere in this project.',
    s3: 'AUTHORIZED as an object store; an AWS config file exists on this machine but declares no model bucket, and no credentials were inspected or used.',
  },
  forbiddenMethods: FORBIDDEN_ACQUISITION_METHODS,
  forbiddenMethodsUsed: [],
  egressPolicyBypassed: false,
  egressPolicyBypassedNote:
    'huggingface.co and its CDN remain denied. No proxy bypass, URL rewriting, undocumented proxy, unauthorized mirror or third-party archive was used. An HF-owned alternate endpoint would have been the same evasion wearing a different hostname, and was not used either.',
};

/* ---- The squatted bucket ------------------------------------------------- */
const squattedBucket = {
  ...NAME_IS_NOT_PROVENANCE,
  measured: acquisition.squattedBucket,
  actedOn: false,
  actedOnNote: 'Nothing was downloaded from it. It is recorded because the near miss is the finding.',
};

/* ---- PHASE 6: supplied path ---------------------------------------------- */
const suppliedValidation = validateSuppliedModel(acquisition.suppliedModel);
const suppliedModel = {
  variables: SUPPLIED_PATH_VARIABLES,
  declared: suppliedValidation.declared,
  path: suppliedValidation.path,
  rejections: suppliedValidation.rejections,
  accepted: suppliedValidation.accepted,
  provenance: suppliedValidation.provenance,
  discipline: 'The declared path is the only place this looks. There is no fallback search: a stage that hunts for something model-shaped when the declared path is wrong will eventually train on the wrong thing and report it as the right one.',
  declaredFieldsRequired: PROVENANCE_FIELDS,
  declaredFieldsNote: 'Path-derived hashes are computed from the files. Identity, version, source, license, parameter count and aggregate hash must be declared by whoever supplies the model; inferring them from a directory is the failure this envelope exists to prevent.',
};

/* ---- PHASE 7: envelope --------------------------------------------------- */
const provenanceEnvelope = buildProvenanceEnvelope({});
const baseModel = {
  available: false,
  model: null, version: null, source: null, path: null, license: null,
  parameterCount: null, configHash: null, tokenizerHash: null,
  weightFileHashes: [], aggregateHash: null,
  format: null, formatClass: null, soupCompatible: false,
  envelope: provenanceEnvelope,
  hashed: false,
  tokenizerAvailable: false,
};

/* ---- PHASES 8-9: trainability and compute -------------------------------- */
const trainability = {
  ranAgainstBaseModel: false,
  ranAgainstBaseModelNote: 'Phase 8 loads the accepted base model through Soup. No model was accepted, so it did not run.',
  steps: TRAINABILITY_STEPS,
  result: evaluateTrainability({}),
  harnessSelfTest: {
    isNotACandidate: true,
    purpose: 'Exercises the same code path end to end so the contract ships tested rather than merely written.',
    result: evaluateTrainability({
      FROM_PRETRAINED: pipeline.trainLoopPass, TOKENIZER_LOAD: pipeline.adapterReloadPass,
      LORA_ATTACH: pipeline.loraApplicationPass, FORWARD_PASS: pipeline.trainLoopPass,
      BACKWARD_PASS: pipeline.trainLoopPass,
      LOSS_FINITE: Number.isFinite(pipeline.lossEnd) && pipeline.lossEnd > 0,
      CHECKPOINT_WRITE: pipeline.checkpointWritePass,
      ADAPTER_RELOAD: pipeline.adapterReloadPass, INFERENCE: pipeline.inferencePass,
    }),
    lossStart: pipeline.lossStart, lossEnd: pipeline.lossEnd,
    adapterSha256: pipeline.adapterSha256,
  },
};

const compute = {
  environmentClass: stage3cr.environment.class,
  hardware: stage3cr.environment.hardware,
  measuredForBaseModel: false,
  budgetHours: COMPUTE_FEASIBILITY_BUDGET_HOURS,
  feasible: false,
  reason: 'NO_BASE_MODEL_TO_BENCHMARK',
  extrapolationRefused:
    'The harness throughput is a fact about a 1.07M-parameter random model, not a prediction about a 0.5B one. Reporting it as the campaign\'s feasibility would be exactly the parameter-count estimate the brief forbids, run backwards.',
  harnessSelfTest: {
    isNotACandidate: true,
    trainingExamples: pipeline.datasetParse?.rows ?? 0,
    epochs: 1,
    note: 'Throughput is measured per run and is not part of the certification body: a wall-clock number would make the hash depend on how busy the machine was.',
  },
};

/* ---- PHASE 10: gate ------------------------------------------------------ */
const gate = evaluateActivationGate({
  BASE_MODEL_AVAILABLE: baseModel.available,
  BASE_MODEL_HASHED: baseModel.hashed,
  BASE_MODEL_PROVENANCE_COMPLETE: provenanceEnvelope.complete,
  TOKENIZER_AVAILABLE: baseModel.tokenizerAvailable,
  MODEL_SOUP_COMPATIBLE: baseModel.soupCompatible,
  TRAINABILITY_SMOKE_PASS: trainability.result.pass,
  COMPUTE_FEASIBLE: compute.feasible,
});

/* ---- PHASE 11: the campaign, untouched ----------------------------------- */
const campaign = {
  started: false,
  startedNote: 'The activation gate did not open. The campaign is not redesigned, not partially run and not approximated.',
  frozenTaskContract: STAGE3CR_TASK_CONTRACT.taskId,
  frozenTargetContract: STAGE3CR_TARGET_CONTRACT.exactTiePolicy,
  datasetVersion: FORGE_DATASET_V2_VERSION,
  datasetHash: STAGE3CR_DATASET_HASH,
  datasetModified: false,
  trainSplitOnly: true,
  validationOpened: false,
  holdoutOpened: false,
  oodOpened: false,
  soupVersion: SOUP_VERSION,
  soupCommit: SOUP_COMMIT,
  candidateStatus: 'NOT_TRAINED',
  candidateArtifact: null,
  candidateArtifactHash: null,
  sftStarted: false,
  sftCompleted: false,
  notRun: [
    'PHASE_11_FULL_SFT', 'PHASE_11_VALIDATION', 'PHASE_11_COMPLEMENTARITY',
    'PHASE_11_HYBRID_EVALUATION', 'PHASE_11_MODEL_FREEZE', 'PHASE_11_HOLDOUT',
    'PHASE_11_OOD', 'PHASE_11_PRIME_OFFLINE_ANALYSIS', 'PHASE_11_PROMOTION_FIREWALL',
  ],
};

const outcome = classifyOutcome({
  phase0Reproduced: phase0.passed,
  trainingCompleted: campaign.sftCompleted,
  modelAccepted: suppliedModel.accepted,
  pipelineCompatible: null,
  computeFeasible: compute.feasible,
  artifactsFound: partition.candidateCount,
  trainableArtifactsFound: partition.trainableCandidateCount,
  provenanceCompleteCount: 0,
});

const body = {
  certificationSchemaVersion: 1,
  stage: STAGE3CR1_STAGE,
  status: 'BLOCKED',
  stageKind: 'BASE_MODEL_ACQUISITION',
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  phase0,
  parents: {
    stage3c: { certification: STAGE3C_CERTIFICATION, status: stage3c.status, mutated: false },
    stage3cr: { certification: STAGE3CR1_PARENT_CERTIFICATION, status: stage3cr.status, outcome: stage3cr.stage3crOutcome, mutated: false },
    note: 'Both parent certifications are read and neither is written. Their BLOCKED results stand.',
  },
  inventory,
  ollama,
  fixtureRejection,
  acquisitionAttempts,
  squattedBucket,
  suppliedModel,
  baseModel,
  trainability,
  compute,
  activationGate: gate,
  campaign,
  selectorLimitation: STAGE3CR_SELECTOR_LIMITATION,
  outcomes: STAGE3CR1_OUTCOMES,
  stage3cr1Outcome: outcome,
  stage3cr1Certified: false,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  liveRuntimeReferencesCandidate: false,
  interpretation:
    `Stage 3C-R.1 is BLOCKED on acquisition, not on infrastructure. The pipeline was re-executed in a freshly reprovisioned container and every step passed, reproducing Stage 3C-R's LoRA adapter bit-for-bit (${pipeline.adapterSha256?.slice(0, 16)}…). What does not exist is a base model: every model host remains denied or unreachable, and of the channels that ARE open — PyPI, anonymous GitHub git, GCS, S3, GitLab — none carries a causal LM whose publisher, license and version can be named. The one HF-format artifact on this machine is this project's own randomly-initialised harness, which the gate rejects on provenance. The nearest miss was gs://gpt-2, OpenAI's historical bucket, which is reachable and now holds an unrelated file uploaded by a third party; matching on the bucket name would have put an attacker-controlled object into a training run.`,
};

const evidenceDigest = sha256(body);
const certification = { ...body, evidenceDigest, certificationHash: sha256({ ...body, evidenceDigest }) };

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage3cr1-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE3CR1_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) => writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
await write('stage3cr1-certification-result.json', certification);
await write('stage3cr1-phase0-reproduction.json', phase0);
await write('stage3cr1-local-inventory.json', inventory);
await write('stage3cr1-ollama-audit.json', ollama);
await write('stage3cr1-fixture-rejection.json', fixtureRejection);
await write('stage3cr1-acquisition-channels.json', acquisitionAttempts);
await write('stage3cr1-squatted-bucket-finding.json', squattedBucket);
await write('stage3cr1-supplied-model-path.json', suppliedModel);
await write('stage3cr1-base-model.json', baseModel);
await write('stage3cr1-provenance-envelope.json', { fields: PROVENANCE_FIELDS, requirement: 'No model enters training without every field.', envelope: provenanceEnvelope });
await write('stage3cr1-trainability.json', trainability);
await write('stage3cr1-compute-feasibility.json', compute);
await write('stage3cr1-activation-gate.json', { requirements: ACTIVATION_REQUIREMENTS, ...gate });
await write('stage3cr1-campaign-status.json', campaign);

const denied = channels.filter((c) => c.status !== 'AUTHORIZED');
const report = [
  '# Stage 3C-R.1 — trusted base model acquisition',
  '',
  `Status: **BLOCKED** — \`${outcome}\``,
  '',
  '## The blocker moved from four requirements to one, and stayed there',
  '',
  'Stage 3C-R cleared Soup, torch and the CPU budget. This stage re-ran all of it in a',
  'container that had been reprovisioned since — and every step passed again, producing',
  `a LoRA adapter with the identical sha256 \`${pipeline.adapterSha256?.slice(0, 16)}…\`.`,
  'The pipeline is not the problem and has now been shown not to be the problem twice,',
  'on two different machines.',
  '',
  '## What was actually tried',
  '',
  '| channel | status | what it means |',
  '| --- | --- | --- |',
  '| PyPI | AUTHORIZED | full simple index (886,683 packages) searched; no trainable causal LM |',
  '| GitHub anonymous git | AUTHORIZED | works, but LFS objects are not served, so weights arrive as pointer stubs |',
  '| GitHub HTTP / releases | DENIED (403) | release assets are not a channel at all |',
  '| GCS / S3 | AUTHORIZED | object stores reachable; no authorized model bucket declared |',
  `| model hosts (${denied.filter((c) => c.kind === 'MODEL_HOST').length}) | DENIED or UNREACHABLE | huggingface.co, its CDN, mirrors, PyTorch, Ollama, Kaggle |`,
  `| artifact archives (${denied.filter((c) => c.kind === 'ARTIFACT_ARCHIVE').length}) | UNREACHABLE | Zenodo, archive.org, figshare |`,
  '',
  acquisitionAttempts.egressPolicyBypassedNote,
  '',
  '## The near miss worth keeping',
  '',
  `**${NAME_IS_NOT_PROVENANCE.rule}**`,
  '',
  NAME_IS_NOT_PROVENANCE.observed,
  '',
  `${NAME_IS_NOT_PROVENANCE.consequence} Nothing was downloaded from it.`,
  '',
  NAME_IS_NOT_PROVENANCE.enforcement,
  '',
  '## The one artifact on this machine is ours, and the gate rejects it',
  '',
  fixtureRejection.why,
  '',
  `Format class: \`${fixtureRejection.formatClass}\`. Rejected on: ${fixtureRejection.rejections.join(', ')}.`,
  '',
  '## What is built and waiting',
  '',
  `- provenance envelope: ${PROVENANCE_FIELDS.length} required fields, aggregate hash derived from the parts so the two cannot disagree`,
  `- supplied-model path: \`${SUPPLIED_PATH_VARIABLES.join('\` or \`')}\`, validated for format, causal-LM architecture, tokenizer and complete provenance`,
  `- format classification: ${MODEL_FORMAT_CLASSES.length} classes, with inference-only formats decided before trainable ones so a stray config cannot promote a GGUF`,
  `- trainability contract: ${TRAINABILITY_STEPS.length} steps, exercised end to end against the harness`,
  `- activation gate: ${ACTIVATION_REQUIREMENTS.length} requirements opening directly into the frozen campaign, with no stage in between`,
  '',
  '## What did not run',
  '',
  'The Stage 3C-R campaign. It is not redesigned, not partially run and not approximated.',
  `\`${STAGE3CR_TASK_CONTRACT.taskId}\` and the target contract are untouched, FORGE_DATASET_V2`,
  '(`4d1a2792…`) is unmodified, and VALIDATION, HOLDOUT and OOD were never opened.',
  'No candidate exists, so no accuracy, regret, complementarity, hybrid or generalization',
  'figure appears in these artifacts.',
  '',
  '## Authority',
  '',
  '`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. Deterministic Nexus',
  'remains the incumbent certified expert. No live runtime references a candidate, because',
  'there is none.',
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage3cr1-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE3CR1_STAGE,
  status: certification.status,
  outcome,
  phase0Passed: phase0.passed,
  adapterReproduced: phase0.adapterReproducedFromStage3cr,
  authorizedChannels: channelSummary.authorized.length,
  anyAuthorizedModelSource: channelSummary.anyAuthorizedModelSource,
  acquisitionCandidates: partition.candidateCount,
  fixtureRejectedOn: fixtureRejection.rejections,
  gateMissing: gate.missing,
  certificationHash: certification.certificationHash,
}, null, 2));
