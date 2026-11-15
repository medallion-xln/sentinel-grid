// SENTINEL SAFETY KERNEL — R0 recommendation API, version SK1_R0_API_V1.
//   const api = createRecommendationApi({ game: 'forge' });
//   const response = api.recommend(canonicalPublicState, legalActions, advisoryEvidence);
// The response carries: rankedActions, recommendedActionOrAbstention, uncertainty, safetyAssessment, evidence,
// decisionHash, sourceIdentity, authority.
// This API RECOMMENDS. It has no method that executes, dispatches or mutates, and it rejects any request that asks for
// one (KernelRejection EXECUTION_OR_MUTATION_REQUESTED). It is a shadow-mode advisory interface, isolated from the
// certified Prime / Arbiter path; the model it serves is labelled NOT_QUALIFIED.
import { loadForgeKernel, loadRescueKernel } from './host.mjs';
import { KernelRejection, AUTHORITY, KERNEL_ID, KERNEL_VERSION } from '../kernel/index.mjs';

export const API_VERSION = 'SK1_R0_API_V1';
export function createRecommendationApi({ game = 'forge', modelPath } = {}) {
  const host = game === 'forge' ? loadForgeKernel(modelPath) : game === 'rescue' ? loadRescueKernel() : null;
  if (!host) throw new KernelRejection('UNKNOWN_GAME_ADAPTER', String(game));
  const recommend = (canonicalPublicState, legalActions, advisoryEvidence = null, options = {}) => ({ apiVersion: API_VERSION, ...host.kernel.recommend(canonicalPublicState, legalActions, advisoryEvidence, options) });
  /** Deterministic replay: re-run a request and compare with a previously returned decision hash. */
  const replay = (request, expectedDecisionHash) => { const r = recommend(request.state, request.legalActions, request.advisoryEvidence ?? null); return { reproduced: r.decisionHash === expectedDecisionHash, decisionHash: r.decisionHash, expectedDecisionHash }; };
  const describe = () => ({ apiVersion: API_VERSION, kernel: { id: KERNEL_ID, version: KERNEL_VERSION }, game, authority: AUTHORITY, sourceIdentity: host.kernel.identity, model: host.model ? { modelId: host.model.modelId, modelHash: host.model.modelHash, qualification: host.model.qualification, ranking: host.model.ranking, uncertainty: host.model.uncertainty } : null,
    capabilities: ['recommend', 'replay', 'describe'], refuses: ['execute', 'dispatch', 'mutate'] });
  return Object.freeze({ recommend, replay, describe });
}
