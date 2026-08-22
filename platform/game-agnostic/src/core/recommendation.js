import {
  CONTRACT_VERSION,
  KERNEL_VERSION,
  RECOMMENDATION_VERSION,
} from './constants.js';
import { assertEvaluationOnly } from './authority.js';
import { actionKey, validateActionDescriptor } from './contracts.js';
import { deepFreeze, sha256 } from './determinism.js';

export function buildRecommendationPacket({
  adapterManifest,
  sourceStateHash,
  observation,
  legalActions,
  ranking,
  selected,
  seed,
  simulations,
  cPuct,
  engineId,
  authority,
  expertContext = null,
}) {
  assertEvaluationOnly(authority);
  validateActionDescriptor(selected);

  const deterministicRanking = ranking.map((entry, index) => ({
    rank: index + 1,
    actionKey: actionKey(entry.action),
    action: entry.action,
    visits: entry.visits,
    valueSum: entry.valueSum,
    meanValue: entry.meanValue,
    prior: entry.prior,
    terminalSamples: entry.terminalSamples,
  }));

  const packetWithoutHash = {
    contractVersion: CONTRACT_VERSION,
    recommendationVersion: RECOMMENDATION_VERSION,
    kernelVersion: KERNEL_VERSION,
    engineId,
    adapter: {
      gameId: adapterManifest.gameId,
      adapterId: adapterManifest.adapterId,
      adapterVersion: adapterManifest.adapterVersion,
      manifestHash: sha256(adapterManifest),
    },
    input: {
      observerId: observation.observerId,
      sequence: observation.sequence,
      stateHash: sourceStateHash,
      observationSchemaId: observation.schemaId,
      observationSchemaVersion: observation.schemaVersion,
      observationFeatureCount: observation.features.length,
      observationHash: sha256(observation),
      legalActionsHash: sha256(legalActions),
      legalActionCount: legalActions.length,
    },
    search: {
      algorithm: 'root-puct',
      priors: 'uniform',
      seed: String(seed),
      simulations,
      cPuct,
    },
    ranking: deterministicRanking,
    selected: {
      actionKey: actionKey(selected),
      action: selected,
    },
    authority,
    // Stage 2H: present only when advisory context was consumed, so a baseline
    // packet keeps its exact pre-Stage-2H shape and hash.
    ...(expertContext === null ? {} : { expertContext }),
    replay: {
      deterministic: true,
      requiresDetachedState: true,
      requiredInputs: [
        'adapter version',
        'source state',
        'observerId',
        'seed',
        'simulations',
        'cPuct',
      ],
    },
  };

  return deepFreeze({
    ...packetWithoutHash,
    recommendationHash: sha256(packetWithoutHash),
  });
}
