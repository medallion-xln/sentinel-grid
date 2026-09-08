/* Stage 3C-R.1 — trusted base model acquisition and training activation.
 *
 * Stage 3C-R closed three of four substrate blockers and stopped on the fourth:
 * SFT adapts a base model, and no base model could be obtained. This stage asks
 * one question and builds one thing.
 *
 * THE QUESTION: can a provenance-established, trainable base model be supplied
 * through an authorized path, so that the already-frozen Stage 3C-R campaign can
 * begin? Not "can we get weights" — anyone can get weights. Weights whose parent
 * cannot be named, licensed and hashed are not a base model, they are a liability
 * with a loss curve.
 *
 * THE ANSWER MEASURED HERE is no, and the interesting part is which doors were
 * actually tried. The organizational egress policy denies huggingface.co, and this
 * stage does not work around it. What it does instead is enumerate every channel
 * that IS open, and check each one for a model that could pass provenance:
 *
 *   PyPI                     open, all 886,683 packages indexed, no trainable LM
 *   GitHub anonymous git     open, but weights live in LFS or on the denied host
 *   GitHub HTTP / releases   403, so release assets are not a channel at all
 *   GCS / S3                 open as object stores, no authorized model bucket
 *   every model host tried   unreachable
 *
 * ONE FINDING IS A TRAP WORTH NAMING. The historical `gs://gpt-2` bucket, which
 * OpenAI's own download script used, is reachable and now contains a single
 * unrelated HTML file uploaded by someone else. A stage that had gone looking for
 * "GPT-2 from Google Cloud Storage" and matched on the bucket NAME would have
 * pulled an attacker-controlled object into a training pipeline. The bucket name
 * was never evidence of anything. This is the same failure mode Stage 3B's
 * admission gate exists to prevent, arriving from a different direction.
 *
 * SO WHAT THIS STAGE BUILDS is the acquisition path itself, complete and tested,
 * with the model-shaped hole left open: format classification that refuses to call
 * inference-only weights trainable, a provenance envelope that no model enters
 * training without, a supplied-path validator behind SENTINEL_BASE_MODEL_PATH, a
 * trainability contract, a compute-feasibility measurement taken from a real run
 * rather than from a parameter count, and an activation gate that opens directly
 * into the frozen campaign with no stage in between.
 *
 * The moment a model arrives — through a supplied path, or an opened channel —
 * the gate evaluates it and training starts. Nothing else needs to be designed.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { STAGE3CR_TASK_CONTRACT, STAGE3CR_TARGET_CONTRACT } from './stage3cr-training-environment.js';

export const STAGE3CR1_STAGE = 'STAGE3CR1_BASE_MODEL_ACQUISITION_AND_TRAINING_ACTIVATION';

/* Both parents are read and neither is rewritten. */
export const STAGE3CR1_PARENT_CERTIFICATION = '50e1b908443e8592b9321103cfe3b2ca8ccb1d441e7406001430136481822db4';
export const STAGE3CR1_PARENT_STATUS = 'BLOCKED';
export const STAGE3CR1_PARENT_OUTCOME = 'F_TRAINING_ENVIRONMENT_STILL_BLOCKED';
export const STAGE3C_CERTIFICATION = 'aecd3183fa322c6e47557d309e07e1bb8d0e04695922be76e51057d6a6749e72';

/* ---------------------------------------------------------------------------
 * PHASE 2 — format classification.
 *
 * The rule that matters: inference working is not evidence of trainability. A
 * GGUF file runs beautifully and cannot carry a LoRA gradient, because the
 * quantized blocks it stores are not the parameters an optimizer updates.
 * ------------------------------------------------------------------------- */

export const MODEL_FORMAT_CLASSES = deepFreeze([
  'HF_TRAINABLE_CHECKPOINT',
  'SAFETENSORS_TRAINABLE',
  'PYTORCH_TRAINABLE',
  'GGUF_INFERENCE_ONLY',
  'OLLAMA_INFERENCE_ONLY',
  'PARTIAL_MODEL',
  'TOKENIZER_ONLY',
  'UNKNOWN',
]);

export const TRAINABLE_FORMAT_CLASSES = deepFreeze([
  'HF_TRAINABLE_CHECKPOINT', 'SAFETENSORS_TRAINABLE', 'PYTORCH_TRAINABLE',
]);

export function isTrainableFormat(formatClass) {
  return TRAINABLE_FORMAT_CLASSES.includes(formatClass);
}

/* `files` is a list of base names actually present at the artifact path. The
 * classification reads what is there; it never reads the directory's name. A
 * folder called `qwen2.5-0.5b-instruct` containing one GGUF file is a GGUF file. */
export function classifyModelArtifact(files) {
  const has = (name) => files.includes(name);
  const any = (pred) => files.some(pred);

  const gguf = any((f) => f.endsWith('.gguf'));
  const ollamaBlob = any((f) => f.startsWith('sha256-') || f === 'manifest.json');
  const safetensors = any((f) => f.endsWith('.safetensors') && !f.startsWith('adapter_'));
  const torchBin = any((f) => f === 'pytorch_model.bin' || (f.startsWith('pytorch_model-') && f.endsWith('.bin')));
  const config = has('config.json');
  const tokenizer = has('tokenizer.json') || has('tokenizer.model') || has('vocab.json');

  /* Inference-only formats are decided BEFORE the trainable ones, so that a
   * directory holding both a GGUF and a stray config.json cannot be promoted to
   * trainable by the presence of the config alone. */
  if (gguf) return 'GGUF_INFERENCE_ONLY';
  if (ollamaBlob && !config) return 'OLLAMA_INFERENCE_ONLY';

  if (config && (safetensors || torchBin) && tokenizer) {
    return safetensors ? 'HF_TRAINABLE_CHECKPOINT' : 'PYTORCH_TRAINABLE';
  }
  /* Weights and a config but no tokenizer is still trainable in principle — the
   * tokenizer is a separate requirement the gate checks, not a format question. */
  if (config && safetensors) return 'SAFETENSORS_TRAINABLE';
  if (config && torchBin) return 'PYTORCH_TRAINABLE';

  if (tokenizer && !safetensors && !torchBin) return 'TOKENIZER_ONLY';
  if (safetensors || torchBin || config) return 'PARTIAL_MODEL';
  return 'UNKNOWN';
}

/* ---------------------------------------------------------------------------
 * PHASE 4 — acquisition channels.
 *
 * A channel is AUTHORIZED when the organization's own configuration serves it.
 * It is DENIED when policy refuses it, and UNREACHABLE when nothing answers.
 * Those three are different facts and the stage keeps them apart: "we could not
 * reach it" is not a policy statement, and "policy refused" is not an outage.
 * ------------------------------------------------------------------------- */

export const CHANNEL_STATUSES = deepFreeze(['AUTHORIZED', 'DENIED_BY_POLICY', 'UNREACHABLE', 'FORBIDDEN_BY_BRIEF']);

export const FORBIDDEN_ACQUISITION_METHODS = deepFreeze([
  'PROXY_BYPASS',
  'URL_REWRITING_TO_EVADE_CONTROLS',
  'UNDOCUMENTED_PROXY',
  'UNAUTHORIZED_MIRROR',
  'RANDOM_THIRD_PARTY_ARCHIVE',
  'LOSSY_REVERSE_CONVERSION_TO_FORCE_TRAINING',
]);

/* A channel that is reachable is not thereby a source of models. `storage.googleapis.com`
 * answers, and that says nothing about whether an authorized model lives in any
 * bucket on it. `carriesAuthorizedModel` is the field that decides, and it is
 * false unless a specific model with provenance was actually found there. */
export function summarizeChannels(channels) {
  const byStatus = {};
  for (const s of CHANNEL_STATUSES) byStatus[s] = channels.filter((c) => c.status === s).length;
  const open = channels.filter((c) => c.status === 'AUTHORIZED');
  const bearing = open.filter((c) => c.carriesAuthorizedModel === true);
  return deepFreeze({
    total: channels.length,
    byStatus,
    authorized: open.map((c) => c.channel),
    authorizedCarryingModel: bearing.map((c) => c.channel),
    anyAuthorizedModelSource: bearing.length > 0,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 7 — the provenance envelope.
 *
 * No model enters training without every field. A missing license is not a
 * formality: it is the difference between a candidate that can be used and one
 * that cannot, and that question does not get easier to answer later.
 * ------------------------------------------------------------------------- */

export const PROVENANCE_FIELDS = deepFreeze([
  'BASE_MODEL_ID',
  'BASE_MODEL_VERSION',
  'BASE_MODEL_SOURCE',
  'BASE_MODEL_PATH',
  'BASE_MODEL_LICENSE',
  'BASE_MODEL_PARAMETER_COUNT',
  'CONFIG_HASH',
  'TOKENIZER_HASH',
  'WEIGHT_FILE_HASHES',
  'AGGREGATE_MODEL_HASH',
]);

function fieldPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return true;
}

export function buildProvenanceEnvelope(candidate) {
  const present = {};
  const missing = [];
  for (const field of PROVENANCE_FIELDS) {
    const ok = fieldPresent(candidate[field]);
    present[field] = ok;
    if (!ok) missing.push(field);
  }
  const complete = missing.length === 0;
  /* The aggregate hash is derived from the per-file hashes, so that two envelopes
   * agreeing on the aggregate cannot disagree on the parts. */
  const derivedAggregate = complete
    ? sha256(JSON.stringify({
      id: candidate.BASE_MODEL_ID,
      version: candidate.BASE_MODEL_VERSION,
      config: candidate.CONFIG_HASH,
      tokenizer: candidate.TOKENIZER_HASH,
      weights: [...candidate.WEIGHT_FILE_HASHES].sort(),
    }))
    : null;
  return deepFreeze({
    fields: PROVENANCE_FIELDS,
    present,
    missing,
    complete,
    derivedAggregate,
    aggregateMatches: complete ? derivedAggregate === candidate.AGGREGATE_MODEL_HASH : null,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — the supplied model path.
 *
 * The declared path is the ONLY place this looks. There is no fallback search of
 * the filesystem: a stage that goes hunting for something model-shaped when the
 * declared path is wrong is a stage that will eventually train on the wrong thing
 * and report it as the right one.
 * ------------------------------------------------------------------------- */

export const SUPPLIED_PATH_VARIABLES = deepFreeze(['SENTINEL_BASE_MODEL_PATH', 'SENTINEL_BASE_MODEL']);

export function readSuppliedPath(env) {
  for (const name of SUPPLIED_PATH_VARIABLES) {
    const value = env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return { declared: true, variable: name, path: value.trim() };
    }
  }
  return { declared: false, variable: null, path: null };
}

export const SUPPLIED_PATH_REJECTIONS = deepFreeze([
  'NOT_DECLARED', 'PATH_MISSING', 'NOT_A_DIRECTORY', 'NO_CONFIG', 'NO_WEIGHTS',
  'NO_TOKENIZER', 'FORMAT_NOT_TRAINABLE', 'NOT_CAUSAL_LM', 'PROVENANCE_INCOMPLETE',
]);

export const CAUSAL_LM_ARCHITECTURE_SUFFIX = 'ForCausalLM';

/* `inspection` is what the probe actually observed at the declared path. This
 * function decides; it does not go and look. Keeping the looking out of the
 * deciding is what lets the decision be tested without a model on disk. */
export function validateSuppliedModel(inspection) {
  const rejections = [];
  if (!inspection.declared) rejections.push('NOT_DECLARED');
  else {
    if (!inspection.exists) rejections.push('PATH_MISSING');
    else if (!inspection.isDirectory) rejections.push('NOT_A_DIRECTORY');
    else {
      const formatClass = classifyModelArtifact(inspection.files ?? []);
      if (!inspection.files.includes('config.json')) rejections.push('NO_CONFIG');
      if (!isTrainableFormat(formatClass)) rejections.push('FORMAT_NOT_TRAINABLE');
      if (!inspection.tokenizerPresent) rejections.push('NO_TOKENIZER');
      const arch = inspection.architectures ?? [];
      if (arch.length > 0 && !arch.some((a) => a.endsWith(CAUSAL_LM_ARCHITECTURE_SUFFIX))) {
        rejections.push('NOT_CAUSAL_LM');
      }
    }
  }
  const envelope = buildProvenanceEnvelope(inspection.provenance ?? {});
  if (!envelope.complete) rejections.push('PROVENANCE_INCOMPLETE');

  return deepFreeze({
    declared: inspection.declared === true,
    path: inspection.path ?? null,
    formatClass: inspection.declared && inspection.exists && inspection.isDirectory
      ? classifyModelArtifact(inspection.files ?? [])
      : null,
    provenance: envelope,
    rejections: [...new Set(rejections)],
    accepted: rejections.length === 0,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 8 — trainability, and PHASE 9 — compute feasibility.
 * ------------------------------------------------------------------------- */

export const TRAINABILITY_STEPS = deepFreeze([
  'FROM_PRETRAINED', 'TOKENIZER_LOAD', 'LORA_ATTACH', 'FORWARD_PASS',
  'BACKWARD_PASS', 'LOSS_FINITE', 'CHECKPOINT_WRITE', 'ADAPTER_RELOAD', 'INFERENCE',
]);

export function evaluateTrainability(steps) {
  const failed = TRAINABILITY_STEPS.filter((s) => steps[s] !== true);
  return deepFreeze({
    steps: TRAINABILITY_STEPS,
    observed: Object.fromEntries(TRAINABILITY_STEPS.map((s) => [s, steps[s] === true])),
    failed,
    pass: failed.length === 0,
  });
}

/* Feasibility is a measured throughput against a real row count, never an
 * extrapolation from parameter count. A model can be small and still crawl,
 * and the only honest way to know is to run some of it and time it. */
export const COMPUTE_FEASIBILITY_BUDGET_HOURS = 12;

export function assessComputeFeasibility(measurement) {
  const { examplesPerSecond, trainingExamples, epochs } = measurement;
  if (!Number.isFinite(examplesPerSecond) || examplesPerSecond <= 0) {
    return deepFreeze({ measured: false, feasible: false, reason: 'NO_THROUGHPUT_MEASURED' });
  }
  const totalExamples = trainingExamples * epochs;
  const estimatedSeconds = totalExamples / examplesPerSecond;
  const estimatedHours = estimatedSeconds / 3600;
  const feasible = estimatedHours <= COMPUTE_FEASIBILITY_BUDGET_HOURS;
  return deepFreeze({
    measured: true,
    examplesPerSecond,
    totalExamples,
    estimatedSeconds: Math.round(estimatedSeconds),
    estimatedHours: Number(estimatedHours.toFixed(3)),
    budgetHours: COMPUTE_FEASIBILITY_BUDGET_HOURS,
    feasible,
    reason: feasible ? 'WITHIN_BUDGET' : 'EXCEEDS_BUDGET',
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 10 — the activation gate.
 *
 * Every condition true means the frozen Stage 3C-R campaign starts. No new stage
 * sits between acquisition and training; that is the whole point of the gate.
 * ------------------------------------------------------------------------- */

export const ACTIVATION_REQUIREMENTS = deepFreeze([
  { id: 'BASE_MODEL_AVAILABLE', why: 'SFT adapts a base model' },
  { id: 'BASE_MODEL_HASHED', why: 'a candidate whose parent cannot be identified cannot be reproduced' },
  { id: 'BASE_MODEL_PROVENANCE_COMPLETE', why: 'source and license are decided before training, not after' },
  { id: 'TOKENIZER_AVAILABLE', why: 'the task is text-shaped and needs one' },
  { id: 'MODEL_SOUP_COMPATIBLE', why: 'the pinned engine has to be able to load it' },
  { id: 'TRAINABILITY_SMOKE_PASS', why: 'a gradient must have been observed, not assumed' },
  { id: 'COMPUTE_FEASIBLE', why: 'a run that cannot finish is not a run' },
]);

export function evaluateActivationGate(probe) {
  const missing = ACTIVATION_REQUIREMENTS.filter((r) => probe[r.id] !== true).map((r) => r.id);
  return deepFreeze({
    requirements: ACTIVATION_REQUIREMENTS,
    probe: Object.fromEntries(ACTIVATION_REQUIREMENTS.map((r) => [r.id, probe[r.id] === true])),
    missing,
    qualified: missing.length === 0,
  });
}

/* ---------------------------------------------------------------------------
 * OUTCOME.
 * ------------------------------------------------------------------------- */

export const STAGE3CR1_OUTCOMES = deepFreeze([
  'A_BASE_MODEL_BOUND_AND_LEARNED_NEXUS_TRAINED',
  'B_BASE_MODEL_AVAILABLE_BUT_COMPUTE_INSUFFICIENT',
  'C_MODEL_ARTIFACT_FOUND_BUT_NOT_TRAINABLE',
  'D_MODEL_PROVENANCE_INSUFFICIENT',
  'E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE',
  'F_TRAINING_PIPELINE_INCOMPATIBLE_WITH_MODEL',
  'G_BLOCKED',
]);

/* Ordered so that the most specific true statement wins. "No authorized model
 * exists" is the weakest claim and comes last: if an artifact was found and
 * rejected, saying nothing was found would hide the rejection. */
export function classifyOutcome(state) {
  if (state.phase0Reproduced !== true) return 'G_BLOCKED';
  if (state.trainingCompleted === true) return 'A_BASE_MODEL_BOUND_AND_LEARNED_NEXUS_TRAINED';
  if (state.modelAccepted === true && state.pipelineCompatible === false) return 'F_TRAINING_PIPELINE_INCOMPATIBLE_WITH_MODEL';
  if (state.modelAccepted === true && state.computeFeasible === false) return 'B_BASE_MODEL_AVAILABLE_BUT_COMPUTE_INSUFFICIENT';
  if (state.artifactsFound > 0 && state.trainableArtifactsFound === 0) return 'C_MODEL_ARTIFACT_FOUND_BUT_NOT_TRAINABLE';
  if (state.trainableArtifactsFound > 0 && state.provenanceCompleteCount === 0) return 'D_MODEL_PROVENANCE_INSUFFICIENT';
  return 'E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE';
}

/* ---------------------------------------------------------------------------
 * The squatted-bucket finding, recorded as a rule rather than an anecdote.
 * ------------------------------------------------------------------------- */

export const NAME_IS_NOT_PROVENANCE = deepFreeze({
  rule: 'A BUCKET, REPOSITORY OR DIRECTORY NAME IS NEVER EVIDENCE OF WHAT IS INSIDE IT',
  observed: 'gs://gpt-2, the bucket OpenAI\'s own download_model.py once used, is reachable and now holds a single unrelated HTML file uploaded by a third party in 2026.',
  consequence: 'Matching on the bucket name would have pulled an attacker-controlled object into a training pipeline under the label "GPT-2, official".',
  enforcement: 'Provenance is established from the artifact\'s own content, hashes and license, and from a publisher that can be named — never from where it happens to sit.',
});

/* The campaign this gate opens into is the one Stage 3C-R already froze. It is
 * re-exported by reference so that no second definition can drift from it. */
export const ACTIVATED_TASK_CONTRACT = STAGE3CR_TASK_CONTRACT;
export const ACTIVATED_TARGET_CONTRACT = STAGE3CR_TARGET_CONTRACT;

/* ---------------------------------------------------------------------------
 * Acquisition candidacy.
 *
 * The local inventory finds exactly one HF-format artifact on this machine: the
 * pipeline harness Stage 3C-R built itself, randomly initialised, to prove the
 * train loop runs. It is trainable in the format sense and it is not a base
 * model, and the difference is not a technicality.
 *
 * Counting it as "a candidate base model that was found and rejected" would
 * overstate the search — the search found nothing; it found its own tooling. So
 * self-authored fixtures are excluded from the candidate count BY ORIGIN, and the
 * exclusion is recorded rather than silent. The gate is still run against it
 * below, because a rejection rule that has never rejected anything is a rule
 * nobody has tested.
 * ------------------------------------------------------------------------- */

export const SELF_AUTHORED_FIXTURE_PATHS = deepFreeze(['/home/user/soup-harness']);

export function isSelfAuthoredFixture(artifactPath) {
  return SELF_AUTHORED_FIXTURE_PATHS.some((p) => artifactPath === p || artifactPath.startsWith(`${p}/`));
}

export function partitionInventory(artifacts) {
  const fixtures = artifacts.filter((a) => isSelfAuthoredFixture(a.path));
  const candidates = artifacts.filter((a) => !isSelfAuthoredFixture(a.path));
  return deepFreeze({
    total: artifacts.length,
    selfAuthoredFixtures: fixtures.map((a) => ({ path: a.path, formatClass: classifyModelArtifact(a.files) })),
    acquisitionCandidates: candidates.map((a) => ({ path: a.path, formatClass: classifyModelArtifact(a.files) })),
    candidateCount: candidates.length,
    trainableCandidateCount: candidates.filter((a) => isTrainableFormat(classifyModelArtifact(a.files))).length,
    exclusionRule: 'A model this project generated is not a model this project acquired.',
  });
}
