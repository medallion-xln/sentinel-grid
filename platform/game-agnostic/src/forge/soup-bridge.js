/* Sentinel Forge World — Soup bridge, training provenance, candidate governance.
 *
 * ISOLATION IS THE POINT OF THIS FILE.
 *
 * Nothing here is imported by the kernel, the adapter, Prime, the router or any
 * expert. Soup consumes exported datasets and produces candidate artifacts; it
 * has no path into Sentinel inference, no path into authority, and no ability to
 * mark anything CERTIFIED. The direction of the arrow is one-way by construction,
 * not by policy: this module can WRITE a dataset and DESCRIBE a candidate, and it
 * has no function that returns anything Sentinel would act on.
 *
 * Soup version audited: 0.74.0 at commit f07e07ed7edd548a4d1d9143f77af9027b1b7036.
 */

import { sha256 } from '../core/determinism.js';
import { FORGE_REWARD_VERSION, FORGE_WORLD_VERSION, assertForge } from './contract.js';
import { FORGE_CURRICULUM_VERSION } from './scenarios.js';
import { FORGE_EXPORT_VERSION } from './export.js';

export const SOUP_BRIDGE_VERSION = 'FORGE_SOUP_BRIDGE_V1';
export const SOUP_COMMIT = 'f07e07ed7edd548a4d1d9143f77af9027b1b7036';
export const SOUP_VERSION = '0.74.0';
export const SOUP_LICENSE = 'Apache-2.0';

/* Transcribed from Soup src/soup_cli/data/formats.py at the pinned commit, along
 * with the order detect_format checks them in. Held as DATA rather than
 * reimplemented as logic, so a drift check is a comparison rather than an
 * argument about whether two implementations agree. */
export const SOUP_FORMAT_SIGNATURES = Object.freeze({
  alpaca: ['instruction', 'output'],
  llava: ['conversations', 'image'],
  sharegpt4v: ['conversations', 'image'],
  kto: ['completion', 'label', 'prompt'],
  dpo: ['chosen', 'prompt', 'rejected'],
  embedding: ['anchor', 'positive'],
  'tool-calling': ['messages', 'tool_calls', 'tools'],
  audio: ['audio', 'messages'],
  asr: ['audio', 'text'],
  sharegpt: ['conversations'],
  chatml: ['messages'],
  plaintext: ['text'],
});
export const SOUP_FORMAT_CHECK_ORDER = Object.freeze([
  'alpaca', 'llava', 'sharegpt4v', 'kto', 'dpo', 'embedding',
  'tool-calling', 'audio', 'asr', 'sharegpt', 'chatml', 'plaintext',
]);

/** Soup's own detection rule: first signature in check order that is a subset. */
export function detectSoupFormat(row) {
  const keys = new Set(Object.keys(row));
  for (const format of SOUP_FORMAT_CHECK_ORDER) {
    if (SOUP_FORMAT_SIGNATURES[format].every((key) => keys.has(key))) return format;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * The audited capability surface
 * ------------------------------------------------------------------------- */

export const SOUP_CAPABILITIES = Object.freeze({
  sft: { supported: true, evidence: 'src/soup_cli/trainer/sft.py' },
  preferenceTraining: { supported: true, evidence: 'trainer/dpo.py, orpo.py, ipo.py, simpo.py, kto.py, bco.py, online_dpo.py' },
  grpo: { supported: true, evidence: 'src/soup_cli/trainer/grpo.py (wraps trl.GRPOTrainer)' },
  ppo: { supported: true, evidence: 'src/soup_cli/trainer/ppo.py' },
  rewardModels: { supported: true, evidence: 'trainer/reward_model.py, prm.py, rewards.py' },
  customRewards: { supported: true, evidence: 'src/soup_cli/trainer/rewards.py' },
  lora: { supported: true, evidence: 'config/schema.py LoraConfig; peft>=0.20.0' },
  qlora: { supported: true, evidence: 'bitsandbytes in the [train] extra; 4-bit load path in config/schema.py' },
  qwen: { supported: true, evidence: 'recipes/catalog.py ships Qwen2.5 SFT and DPO recipes' },
  checkpointing: { supported: true, evidence: 'config/schema.py save_steps; resume paths in trainer/' },
  adapterExport: { supported: true, evidence: 'registry/store.py; peft adapter output' },
  ggufExport: { supported: true, evidence: 'gguf paths in cli.py, config/schema.py, cans/' },
  experimentMetadata: { supported: true, evidence: 'monitoring/trace_logger.py, monitoring/hf_push.py' },
  reproducibilityControls: {
    supported: 'PARTIAL',
    evidence: 'per-feature seeds (raft_shuffle_seed, replay_seed) exist in config/schema.py',
    limitation: 'No single global training seed was found that would make a full run bit-reproducible. Recorded as a limitation of the training engine, not of the bridge, and it is why SEED in the provenance envelope is mandatory but not by itself sufficient to reproduce a checkpoint.',
  },
});

export const SOUP_DEPENDENCY_NOTES = Object.freeze({
  license: SOUP_LICENSE,
  pythonRequirement: '>=3.10,<3.13',
  heavyStackIsOptional: true,
  heavyStackExtra: '[train] — torch>=2.5, transformers, peft, trl, datasets, bitsandbytes, accelerate',
  securityPolicyPresent: true,
  securityPolicyPath: 'SECURITY.md',
  networkBehaviour: 'Soup pulls base models and can push to the Hugging Face Hub (monitoring/hf_push.py). Any Sentinel use must treat that as an outbound egress surface and pin the base model by hash.',
  isolation: 'Cloned to a training-tools location outside the Sentinel repository. No Soup file is imported by, vendored into, or referenced from Sentinel runtime source.',
});

/* ---------------------------------------------------------------------------
 * Format translation
 *
 * The bridge is a TRANSLATION, not a pass-through, and the audit is what proved
 * it: Forge's SFT rows are {prompt, completion}, which matches no Soup signature
 * at all — `kto` is the only signature containing both keys and it additionally
 * requires `label`. Handing Soup the raw Forge SFT export would fail detection.
 * Preference rows are the opposite case: {prompt, chosen, rejected} IS Soup's
 * `dpo` signature exactly, and passes through unchanged.
 * ------------------------------------------------------------------------- */

export const FORGE_TO_SOUP_FORMAT_MAP = Object.freeze({
  sft: { soupFormat: 'alpaca', translation: 'REQUIRED', reason: '{prompt, completion} matches no Soup signature; mapped to {instruction, output}' },
  preference: { soupFormat: 'dpo', translation: 'NONE', reason: '{prompt, chosen, rejected} is Soup dpo exactly' },
  rl_episode: { soupFormat: null, translation: 'NOT_APPLICABLE', reason: 'Soup GRPO/PPO consume prompts plus a reward function, not (s,a,r,s-prime) tuples. Forge RL episodes are for Sentinel-side analysis; a GRPO bridge would need a reward adapter and is out of Stage 3A scope.' },
  jsonl: { soupFormat: null, translation: 'NOT_APPLICABLE', reason: 'Full-fidelity replay is a Sentinel evidence format, not a training format.' },
});

export function translateSftToSoup(sftJsonl) {
  if (sftJsonl.trim() === '') return { content: '', count: 0, soupFormat: 'alpaca' };
  const rows = sftJsonl.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  const translated = rows.map((row) => JSON.stringify({
    instruction: row.prompt,
    output: row.completion,
    /* Soup's detector reads only the signature keys, so carrying provenance
     * alongside is safe and keeps every row traceable to the record that made it. */
    forge_metadata: row.metadata,
  }));
  return { content: translated.join('\n'), count: translated.length, soupFormat: 'alpaca' };
}

export function translatePreferenceToSoup(preferenceJsonl) {
  if (preferenceJsonl.trim() === '') return { content: '', count: 0, soupFormat: 'dpo' };
  const rows = preferenceJsonl.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
  const translated = rows.map((row) => JSON.stringify({
    prompt: row.prompt,
    chosen: row.chosen,
    rejected: row.rejected,
    forge_metadata: row.metadata,
  }));
  return { content: translated.join('\n'), count: translated.length, soupFormat: 'dpo' };
}

/**
 * Build the bridge, and CHECK it: every translated row is run through Soup's own
 * detection rule and must come back as the format the bridge claims. A bridge
 * that asserted compatibility without testing a row would be exactly the kind of
 * unverified claim this project keeps finding.
 */
export function buildSoupBridge({ datasets, baseModel = null, trainingMethod = 'SFT' }) {
  const sft = translateSftToSoup(datasets.sft.content);
  const preference = translatePreferenceToSoup(datasets.preference.content);

  const verify = (name, bundle, expected) => {
    if (bundle.count === 0) {
      return { dataset: name, rows: 0, expectedFormat: expected, detectedFormat: null, compatible: null, basis: 'NOT_MEASURED_EMPTY_DATASET' };
    }
    const first = JSON.parse(bundle.content.split('\n')[0]);
    const detected = detectSoupFormat(first);
    return { dataset: name, rows: bundle.count, expectedFormat: expected, detectedFormat: detected, compatible: detected === expected, basis: 'DETECTED_BY_SOUP_SIGNATURE_RULE' };
  };

  /* The control. The UNtranslated Forge SFT row is run through the same rule and
   * must NOT detect as anything: it is what proves the translation is doing work
   * rather than decorating a row that already passed. */
  const untranslatedSft = datasets.sft.content === ''
    ? null
    : detectSoupFormat(JSON.parse(datasets.sft.content.split('\n')[0]));

  const checks = [verify('sft', sft, 'alpaca'), verify('preference', preference, 'dpo')];

  return {
    bridgeVersion: SOUP_BRIDGE_VERSION,
    soupCommit: SOUP_COMMIT,
    soupVersion: SOUP_VERSION,
    formatMap: FORGE_TO_SOUP_FORMAT_MAP,
    datasets: {
      sft: { soupFormat: sft.soupFormat, count: sft.count, contentHash: sha256(sft.content), content: sft.content },
      preference: { soupFormat: preference.soupFormat, count: preference.count, contentHash: sha256(preference.content), content: preference.content },
    },
    compatibilityChecks: checks,
    untranslatedSftDetectedAs: untranslatedSft,
    translationIsNecessary: untranslatedSft === null,
    allCompatible: checks.every((check) => check.compatible === true),
    sourceDatasetHash: datasets.jsonl.contentHash,
    simulatorVersion: FORGE_WORLD_VERSION,
    rewardVersion: FORGE_REWARD_VERSION,
    curriculumVersion: FORGE_CURRICULUM_VERSION,
    exportVersion: FORGE_EXPORT_VERSION,
    baseModelIdentity: baseModel,
    intendedTrainingMethod: trainingMethod,
    trainingExecuted: false,
    note: 'Format compatibility only. No training was run, no model was produced, and nothing here reaches Sentinel inference.',
  };
}

/* ---------------------------------------------------------------------------
 * Training provenance
 * ------------------------------------------------------------------------- */

export const FORGE_TRAINING_PROVENANCE_VERSION = 'FORGE_TRAINING_PROVENANCE_V1';

export const TRAINING_PROVENANCE_FIELDS = Object.freeze([
  'TRAINING_ENGINE', 'SOUP_COMMIT', 'BASE_MODEL', 'BASE_MODEL_HASH', 'TOKENIZER_HASH',
  'DATASET_HASH', 'DATASET_RECORD_COUNT', 'FORGE_WORLD_VERSION', 'SCENARIO_FAMILY_SET',
  'CURRICULUM_VERSION', 'REWARD_VERSION', 'TRAINING_METHOD', 'TRAINING_CONFIG_HASH',
  'SEED', 'OUTPUT_ARTIFACT_HASH',
]);

/**
 * Validate a candidate's provenance envelope.
 *
 * Fail-closed and by name. A candidate whose envelope is incomplete is REJECTED —
 * not accepted with a warning — because an artifact whose training inputs cannot
 * be named cannot be evaluated, only trusted, and trust is not a certification.
 */
export function validateTrainingProvenance(envelope) {
  const missing = [];
  const empty = [];
  for (const field of TRAINING_PROVENANCE_FIELDS) {
    if (!Object.hasOwn(envelope ?? {}, field)) { missing.push(field); continue; }
    const value = envelope[field];
    if (value === null || value === undefined || value === '') empty.push(field);
  }
  const complete = missing.length === 0 && empty.length === 0;
  return {
    provenanceVersion: FORGE_TRAINING_PROVENANCE_VERSION,
    complete,
    accepted: complete,
    missingFields: missing,
    emptyFields: empty,
    rejectionReason: complete ? null : 'INCOMPLETE_TRAINING_PROVENANCE',
    note: 'A candidate without complete training provenance is rejected. Every field names an input that changes what the artifact is.',
  };
}

/* ---------------------------------------------------------------------------
 * Candidate governance
 * ------------------------------------------------------------------------- */

export const CANDIDATE_STATES = Object.freeze([
  'GENERATED', 'TRAINED', 'CANDIDATE', 'OFFLINE_EVALUATED', 'SHADOW_EVALUATED', 'CERTIFIED', 'REJECTED',
]);

export const CANDIDATE_TRANSITIONS = Object.freeze({
  GENERATED: ['TRAINED', 'REJECTED'],
  TRAINED: ['CANDIDATE', 'REJECTED'],
  CANDIDATE: ['OFFLINE_EVALUATED', 'REJECTED'],
  OFFLINE_EVALUATED: ['SHADOW_EVALUATED', 'REJECTED'],
  SHADOW_EVALUATED: ['CERTIFIED', 'REJECTED'],
  CERTIFIED: [],
  REJECTED: [],
});

/* Who may cause each transition. The row that matters is CERTIFIED: no actor
 * other than Sentinel certification appears anywhere against it. */
export const CANDIDATE_STATE_AUTHORITY = Object.freeze({
  GENERATED: 'FORGE_WORLD',
  TRAINED: 'SOUP',
  CANDIDATE: 'SENTINEL_LAB',
  OFFLINE_EVALUATED: 'SENTINEL_LAB',
  SHADOW_EVALUATED: 'SENTINEL_LAB',
  CERTIFIED: 'SENTINEL_GRID_CERTIFICATION',
  REJECTED: 'SENTINEL_LAB',
});

export const SOUP_REACHABLE_STATES = Object.freeze(
  Object.entries(CANDIDATE_STATE_AUTHORITY).filter(([, actor]) => actor === 'SOUP').map(([state]) => state),
);

export function canTransition(from, to, actor) {
  assertForge(CANDIDATE_STATES.includes(from), 'Unknown candidate state', { from });
  assertForge(CANDIDATE_STATES.includes(to), 'Unknown candidate state', { to });
  const allowed = CANDIDATE_TRANSITIONS[from].includes(to);
  const authorised = CANDIDATE_STATE_AUTHORITY[to] === actor;
  return {
    allowed: allowed && authorised,
    transitionLegal: allowed,
    actorAuthorised: authorised,
    requiredActor: CANDIDATE_STATE_AUTHORITY[to],
    reason: allowed
      ? (authorised ? null : `${actor} may not assign ${to}; only ${CANDIDATE_STATE_AUTHORITY[to]} may`)
      : `${from} -> ${to} is not a legal transition`,
  };
}

/** The invariant the whole arrangement exists to protect. */
export function soupCanCertify() {
  return canTransition('SHADOW_EVALUATED', 'CERTIFIED', 'SOUP').allowed;
}

export const FIRST_FUTURE_TRAINING_TARGET = Object.freeze({
  target: 'LEARNED_NEXUS_CANDIDATE',
  trainedInThisStage: false,
  rationale: [
    'A deterministic relational benchmark already exists and is certified (2L.10 through 2L.18).',
    'Forge World supplies grounded counterfactual truth for relational decisions, so a learned candidate can be scored against exact optima rather than against another model.',
    'Expert complementarity is measurable: the delegation ceiling and its six-case tail are characterised, so an improvement would be visible rather than inferred.',
    'The deterministic Nexus is a strong, frozen baseline, which makes a null result informative instead of ambiguous.',
  ],
  futureComparison: [
    'deterministic Nexus (frozen baseline)',
    'learned Nexus candidate',
    'hybrid Nexus (deterministic with learned advisory)',
    'Prime without candidate',
    'Prime with candidate',
  ],
  admissionPath: 'GENERATED -> TRAINED (Soup) -> CANDIDATE -> OFFLINE_EVALUATED -> SHADOW_EVALUATED -> CERTIFIED (Sentinel only)',
});
