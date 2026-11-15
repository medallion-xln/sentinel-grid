// SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1 — composition of the four components.
//   createKernel({ featurizer, model, sourceIdentity }).recommend(canonicalPublicState, legalActions, advisoryEvidence, options)
// featurizer : a pure, game-specific adapter function (state, legalActions, evidence) -> features, keys, constraints
// model      : a frozen risk model for one observation contract and feature schema, or null (the kernel then abstains)
// The kernel is deterministic: equal inputs give an equal record and an equal decisionHash.
import { validateRequest, KernelRejection, KERNEL_ID, KERNEL_VERSION, AUTHORITY, digest } from './contract.mjs';
import { assessSemantics } from './semantics.mjs';
import { assessRisk } from './risk.mjs';
import { rankActions, RANKING_CONTRACT } from './ranking.mjs';
import { buildRecord } from './record.mjs';

const NO_MODEL_RANKING = Object.freeze({ tierWidth: 1, tau: -1, z: 0, oodPenalty: 0 });

export function createKernel({ featurizer, model = null, sourceIdentity = {} }) {
  if (typeof featurizer !== 'function') throw new KernelRejection('FEATURIZER_REQUIRED');
  if (model !== null) for (const k of ['modelId', 'modelHash', 'schema', 'heads', 'ranking', 'envelope', 'novelty', 'observationContract', 'qualification']) if (model[k] === undefined) throw new KernelRejection('MODEL_INCOMPLETE', k);
  const identity = Object.freeze({ kernelId: KERNEL_ID, kernelVersion: KERNEL_VERSION, kernelSourceHash: sourceIdentity.kernelSourceHash ?? null, adapterId: sourceIdentity.adapterId ?? null, adapterSourceHash: sourceIdentity.adapterSourceHash ?? null });
  function recommend(canonicalPublicState, legalActions, advisoryEvidence = null, options = {}) {
    validateRequest(canonicalPublicState, legalActions, advisoryEvidence, options);
    const featurized = featurizer(canonicalPublicState, legalActions, advisoryEvidence ?? null);
    if (!featurized || !featurized.schema || !Array.isArray(featurized.rows) || featurized.rows.length !== legalActions.length) throw new KernelRejection('ADAPTER_OUTPUT_INCOMPLETE', 'rows');
    const semantics = assessSemantics(featurized, legalActions.length);
    const risks = assessRisk(model, featurized, canonicalPublicState.observationContract);
    const ranking = rankActions(semantics, risks, model ? model.ranking : NO_MODEL_RANKING);
    return buildRecord({ state: canonicalPublicState, legalActions, advisoryEvidence, featurized, semantics, risks, ranking, model, sourceIdentity: identity });
  }
  return Object.freeze({ recommend, identity, authority: AUTHORITY, rankingContract: RANKING_CONTRACT, modelId: model?.modelId ?? null, modelHash: model?.modelHash ?? null });
}
export { KernelRejection, digest, AUTHORITY, KERNEL_ID, KERNEL_VERSION, RANKING_CONTRACT };
