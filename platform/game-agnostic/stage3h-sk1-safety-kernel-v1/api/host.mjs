// SK1 host layer: the only inference-side code that touches the file system. It loads a frozen model, verifies its hash,
// builds the matching featurizer and computes the source identity of the kernel and adapter. It imports nothing outside
// this lane and nothing from the evaluation side.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel, KernelRejection } from '../kernel/index.mjs';
import { sha256 } from '../kernel/contract.mjs';
import { makeForgeFeaturizer } from '../adapters/forge/features.mjs';
import { rescueFeaturizer } from '../adapters/rescue/adapter.mjs';

export const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), DEFAULT_MODEL = resolve(LANE, 'models/SK1_MODEL.json');
const dirHash = (rel) => sha256(readdirSync(resolve(LANE, rel)).filter((n) => n.endsWith('.mjs')).sort().map((n) => `${rel}/${n}:${sha256(readFileSync(resolve(LANE, rel, n)))}`).join('\n'));
/** Hashes of exactly the source files that make up the kernel and one adapter. */
export const sourceIdentity = (adapter) => ({ kernelSourceHash: dirHash('kernel'), adapterId: adapter === 'forge' ? 'SK1_FORGE_ADAPTER_V1' : 'SK1_RESCUE_ADAPTER_V1', adapterSourceHash: dirHash(`adapters/${adapter}`) });

export function loadModel(path = DEFAULT_MODEL) {
  const model = JSON.parse(readFileSync(path, 'utf8')), { modelHash, ...rest } = model;
  if (typeof modelHash !== 'string' || sha256(JSON.stringify(rest)) !== modelHash) throw new KernelRejection('MODEL_HASH_MISMATCH');
  return model;
}
/** Forge World kernel for a frozen model file. */
export function loadForgeKernel(modelPath = DEFAULT_MODEL) {
  const model = loadModel(modelPath), featurizer = makeForgeFeaturizer(model.featurizer);
  if (featurizer.schema.id !== model.schema.id) throw new KernelRejection('MODEL_FEATURE_SCHEMA_MISMATCH');
  return { kernel: createKernel({ featurizer, model, sourceIdentity: sourceIdentity('forge') }), featurizer, model };
}
/** Second-game kernel: the same kernel code with the rescue adapter and NO risk model (none has been developed). */
export function loadRescueKernel() { return { kernel: createKernel({ featurizer: rescueFeaturizer, model: null, sourceIdentity: sourceIdentity('rescue') }), featurizer: rescueFeaturizer, model: null }; }
