import { performance } from 'node:perf_hooks';
import {
  actionKey,
  findProhibitedExecutionMembers,
  validateAdapter,
  validateLegalActions,
  validateObservationPacket,
  validateOutcomePacket,
  validateTransitionResult,
} from '../core/contracts.js';
import { defaultAuthorityPolicy, assertEvaluationOnly } from '../core/authority.js';
import { createSeededRandom, deriveSeed, sha256 } from '../core/determinism.js';
import { recommend } from '../prime/root-puct.js';
import { replayRecommendation } from '../sdk/replay.js';
import { buildAdapterDeterministicEvidence } from './evidence.js';


function finalizeReport(report) {
  const deterministic = buildAdapterDeterministicEvidence(report);
  return {
    ...report,
    deterministicEvidenceHash: deterministic.deterministicEvidenceHash,
    // Backward-compatible alias. New integrations should use
    // deterministicEvidenceHash explicitly.
    evidenceHash: deterministic.deterministicEvidenceHash,
  };
}

function serializeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    details: error?.details,
  };
}

export function runAdapterConformance(adapter, {
  seed = 7n,
  observerId = 'player-1',
  simulations = 64,
  cPuct = 1.4,
} = {}) {
  const checks = [];
  const context = {};

  function check(name, fn) {
    const started = performance.now();
    try {
      const details = fn() ?? {};
      checks.push({ name, pass: true, durationMs: Number((performance.now() - started).toFixed(3)), ...details });
      return true;
    } catch (error) {
      checks.push({ name, pass: false, durationMs: Number((performance.now() - started).toFixed(3)), error: serializeError(error) });
      return false;
    }
  }

  if (!check('adapter-contract', () => {
    const validated = validateAdapter(adapter);
    context.manifest = validated.manifest;
    return { gameId: validated.manifest.gameId, adapterId: validated.manifest.adapterId };
  })) {
    return finalizeReport({
      pass: false,
      adapter: null,
      checks,
    });
  }

  check('no-execution-surface', () => {
    const prohibited = findProhibitedExecutionMembers(adapter);
    if (prohibited.length > 0) throw new Error(`Prohibited members: ${prohibited.join(', ')}`);
    if (context.manifest.authority.executionInterface !== false) throw new Error('executionInterface must be false');
    return { prohibitedMemberCount: 0 };
  });

  check('r0-default-denial', () => {
    const authority = defaultAuthorityPolicy();
    assertEvaluationOnly(authority);
    return { tier: authority.tier, canDispatch: authority.canDispatch };
  });

  check('deterministic-initial-state', () => {
    context.stateA = adapter.initialState(seed);
    context.stateB = adapter.initialState(seed);
    const hashA = sha256(context.stateA);
    const hashB = sha256(context.stateB);
    if (hashA !== hashB) throw new Error('initialState is not deterministic for the same seed');
    context.sourceHash = hashA;
    return { stateHash: hashA };
  });

  check('clone-content-fidelity', () => {
    const clone = adapter.cloneState(context.stateA);
    if (sha256(clone) !== context.sourceHash) throw new Error('cloneState changed state content');
    if (clone && typeof clone === 'object' && clone === context.stateA) throw new Error('cloneState returned the source object');
    return { cloneHash: sha256(clone) };
  });

  check('terminal-determinism', () => {
    const a = adapter.isTerminal(context.stateA);
    const b = adapter.isTerminal(context.stateB);
    if (typeof a !== 'boolean' || a !== b) throw new Error('isTerminal must return a deterministic boolean');
    context.initialTerminal = a;
    return { terminal: a };
  });

  check('deterministic-observation', () => {
    const before = sha256(context.stateA);
    const observationA = validateObservationPacket(adapter.observe(context.stateA, observerId), context.manifest);
    const observationB = validateObservationPacket(adapter.observe(context.stateB, observerId), context.manifest);
    if (sha256(observationA) !== sha256(observationB)) throw new Error('observe is not deterministic');
    if (sha256(context.stateA) !== before) throw new Error('observe mutated source state');
    context.observation = observationA;
    return {
      schemaId: observationA.schemaId,
      schemaVersion: observationA.schemaVersion,
      featureCount: observationA.features.length,
    };
  });

  check('deterministic-legal-actions', () => {
    const before = sha256(context.stateA);
    const legalA = validateLegalActions(adapter.legalActions(context.stateA, observerId), { terminal: context.initialTerminal });
    const legalB = validateLegalActions(adapter.legalActions(context.stateB, observerId), { terminal: context.initialTerminal });
    if (sha256(legalA) !== sha256(legalB)) throw new Error('legalActions is not deterministic');
    if (sha256(context.stateA) !== before) throw new Error('legalActions mutated source state');
    context.legalActions = legalA;
    return {
      actionCount: legalA.length,
      actionKeys: legalA.map(actionKey),
    };
  });

  check('deterministic-outcome', () => {
    const before = sha256(context.stateA);
    const outcomeA = validateOutcomePacket(adapter.outcome(context.stateA, observerId));
    const outcomeB = validateOutcomePacket(adapter.outcome(context.stateB, observerId));
    if (sha256(outcomeA) !== sha256(outcomeB)) throw new Error('outcome is not deterministic');
    if (outcomeA.terminal !== context.initialTerminal) throw new Error('OutcomePacket.terminal disagrees with isTerminal');
    if (sha256(context.stateA) !== before) throw new Error('outcome mutated source state');
    return { scalar: outcomeA.scalar, vectorKeys: Object.keys(outcomeA.vector).sort() };
  });

  if (!context.initialTerminal && context.legalActions?.length > 0) {
    check('deterministic-seeded-transition', () => {
      const action = context.legalActions[0];
      const actionHash = sha256(action);
      const transitionSeed = deriveSeed(seed, 'conformance-transition', actionKey(action));
      const cloneA = adapter.cloneState(context.stateA);
      const cloneB = adapter.cloneState(context.stateB);
      const resultA = validateTransitionResult(adapter.step(cloneA, structuredClone(action), {
        observerId,
        seed: transitionSeed,
        simulationIndex: 0,
        random: createSeededRandom(transitionSeed),
        mode: 'detached-simulation',
      }));
      const resultB = validateTransitionResult(adapter.step(cloneB, structuredClone(action), {
        observerId,
        seed: transitionSeed,
        simulationIndex: 0,
        random: createSeededRandom(transitionSeed),
        mode: 'detached-simulation',
      }));
      if (sha256(resultA) !== sha256(resultB)) throw new Error('step is not deterministic for the same seed');
      if (sha256(action) !== actionHash) throw new Error('step mutated action input');
      if (sha256(context.stateA) !== context.sourceHash) throw new Error('step mutated source state');
      if (resultA.terminal !== adapter.isTerminal(resultA.state)) throw new Error('Transition terminal flag mismatch');
      context.transition = resultA;
      return { transitionHash: sha256(resultA), terminal: resultA.terminal };
    });

    check('transition-outcome-contract', () => {
      const outcome = validateOutcomePacket(adapter.outcome(context.transition.state, observerId));
      if (outcome.terminal !== context.transition.terminal) throw new Error('Transition outcome terminal mismatch');
      return { scalar: outcome.scalar };
    });

    check('deterministic-prime-recommendation', () => {
      const before = sha256(context.stateA);
      const recommendationA = recommend({ adapter, state: context.stateA, observerId, seed, simulations, cPuct });
      const recommendationB = recommend({ adapter, state: context.stateB, observerId, seed, simulations, cPuct });
      if (recommendationA.recommendationHash !== recommendationB.recommendationHash) {
        throw new Error('Prime recommendation is not deterministic');
      }
      if (sha256(context.stateA) !== before) throw new Error('Prime mutated source state');
      context.recommendation = recommendationA;
      return {
        recommendationHash: recommendationA.recommendationHash,
        selectedActionKey: recommendationA.selected.actionKey,
      };
    });

    check('prime-legality-and-visit-accounting', () => {
      const legalKeys = new Set(context.legalActions.map(actionKey));
      if (!context.recommendation.ranking.every((entry) => legalKeys.has(entry.actionKey))) {
        throw new Error('Prime ranked an illegal action');
      }
      const visits = context.recommendation.ranking.reduce((sum, entry) => sum + entry.visits, 0);
      if (visits !== simulations) throw new Error(`Expected ${simulations} visits, received ${visits}`);
      if (!legalKeys.has(context.recommendation.selected.actionKey)) throw new Error('Prime selected an illegal action');
      return { visits, rankedActionCount: context.recommendation.ranking.length };
    });

    check('recommendation-r0-boundary', () => {
      assertEvaluationOnly(context.recommendation.authority);
      return {
        tier: context.recommendation.authority.tier,
        canDispatch: context.recommendation.authority.canDispatch,
        canMutateLiveWorld: context.recommendation.authority.canMutateLiveWorld,
      };
    });

    check('recommendation-replay', () => {
      const replay = replayRecommendation({
        adapter,
        state: context.stateA,
        recommendation: context.recommendation,
      });
      if (!replay.pass) throw new Error('Recommendation replay hash mismatch');
      return { replayHash: replay.actualHash };
    });
  }

  return finalizeReport({
    pass: checks.every((entry) => entry.pass),
    adapter: context.manifest,
    checks,
  });
}
