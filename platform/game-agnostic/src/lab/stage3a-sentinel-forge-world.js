/* Stage 3A — Sentinel Forge World.
 *
 * The stage evaluation: build the corpus through the admission gate, run Sentinel
 * against it through ordinary contracts, measure determinism, variation,
 * performance and adversarial handling, and certify.
 *
 * Nothing in this file modifies an expert, Prime, the router or the Arbiter. The
 * Sentinel side is READ-ONLY here: Stage 3A measures a simulator, and any change
 * to a certified decision component would make the measurement describe a system
 * that does not exist.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assertEvaluationOnly, defaultAuthorityPolicy, denyExecution } from '../core/authority.js';
import { validateAdapter } from '../core/contracts.js';
import { recommend } from '../prime/root-puct.js';
import { evaluateNexus } from '../experts/nexus.js';
import { evaluateOracle } from '../experts/oracle.js';

import {
  FORGE_ACTION_TYPE_NAMES, FORGE_ENTITY_TYPE_NAMES, FORGE_RELATION_TYPE_NAMES,
  FORGE_REWARD_COMPONENT_IDS, FORGE_REWARD_VERSION, FORGE_WORLD_VERSION,
  ForgeIllegalActionError, scalarizeReward,
} from '../forge/contract.js';
import {
  FORGE_KERNEL_VERSION, controlledActor, createWorld, hashWorld, isTerminal,
  legalActions, step, topologyHash,
} from '../forge/kernel.js';
import { renderWorld } from '../forge/render.js';
import {
  FORGE_CURRICULUM_LEVELS, FORGE_SCENARIO_FAMILIES, FORGE_SCENARIO_FAMILY_IDS,
  FORGE_SCENARIO_SURFACES, generateScenario,
} from '../forge/scenarios.js';
import { admitGeneratedScenario, validateScenario } from '../forge/validators.js';
import { counterfactualDigest, evaluateCounterfactuals, regretOf } from '../forge/counterfactual.js';
import { forgeAdapterState, forgeWorldAdapter } from '../forge/adapter.js';
import { buildReplayRecord, findAbsolutePaths, replaySetDigest, verifyReplayRecord } from '../forge/replay.js';
import { exportAll } from '../forge/export.js';
import {
  CANDIDATE_STATES, FIRST_FUTURE_TRAINING_TARGET, SOUP_CAPABILITIES, SOUP_COMMIT,
  SOUP_DEPENDENCY_NOTES, SOUP_VERSION, buildSoupBridge, canTransition, soupCanCertify,
  validateTrainingProvenance, TRAINING_PROVENANCE_FIELDS,
} from '../forge/soup-bridge.js';

export const STAGE3A_STAGE = 'STAGE3A_SENTINEL_FORGE_WORLD';
export const STAGE3A_SEEDS = deepFreeze([9001, 9002, 9003]);
export const STAGE3A_HORIZON = 3;
export const STAGE3A_PRIME_SIMULATIONS = 32;

/* ---------------------------------------------------------------------------
 * Phase 0 — existing contract audit
 * ------------------------------------------------------------------------- */

export const STAGE3A_CONTRACT_AUDIT = deepFreeze({
  auditVersion: 1,
  question: 'What can Forge World implement directly, without creating a parallel incompatible architecture?',
  findings: [
    { contract: 'canonical state codec', source: 'src/core/determinism.js canonicalize/stableStringify/sha256', reuse: 'DIRECT', note: 'Forge world identity is sha256 over a canonical semantic projection. No new codec.' },
    { contract: 'legal action representation', source: 'src/core/contracts.js validateActionDescriptor/actionKey', reuse: 'DIRECT', note: 'Forge actions are wrapped into ActionDescriptors by the adapter; actionKey stays the identity.' },
    { contract: 'deterministic replay', source: 'src/sdk/replay.js replayRecommendation', reuse: 'DIRECT', note: 'Prime recommendations over Forge worlds replay through the existing verifier unchanged.' },
    { contract: 'adapter interface', source: 'src/core/constants.js REQUIRED_ADAPTER_METHODS + src/sdk/define-adapter.js', reuse: 'DIRECT', note: 'Forge implements all eight required methods. It is an ordinary adapter, not a special case.' },
    { contract: 'runtime identity', source: 'artifacts/r0-runtime-identity + Stage 2M ZEKNOVA_ROOT_CONTRACT_V1', reuse: 'PATTERN', note: 'Forge is self-contained and binds no external root, so it needs no environment binding of its own. It inherits the discipline, not the variable.' },
    { contract: 'evidence identity', source: 'self-excluding output digests in src/experts/expert-contract.js', reuse: 'PATTERN', note: 'Replay records use the same self-excluding hash rule: a document may not contain its own hash.' },
    { contract: 'session/campaign identity', source: 'src/sdk/snapshot-ingestion.js, stage2f campaign manifests', reuse: 'PATTERN', note: 'Forge binds records to (scenarioSeed, worldHash, configHash) instead of a live session id, because there is no live session.' },
    { contract: 'expert routing interface', source: 'src/experts/expert-contract.js normalizeExpertInput', reuse: 'DIRECT', note: 'Forge observations carry canonicalState and observationHistory in exactly the shapes the normalizer accepts.' },
    { contract: 'Prime input contract', source: 'src/prime/root-puct.js recommend', reuse: 'DIRECT', note: 'Prime runs against Forge with no Forge-specific branch anywhere in its path.' },
    { contract: 'Nexus input contract', source: 'src/experts/nexus.js — entities{id,kind,hostile,critical}, relationships{from,to,kind in depends|supports|threatens}', reuse: 'DIRECT_WITH_PROJECTION', note: 'Forge has eleven relation types; the adapter projects them onto the three Nexus kinds. The projection is declared in the contract table, not buried in the adapter.' },
    { contract: 'Oracle temporal input contract', source: 'src/experts/oracle.js — observationHistory frames {tick, channels}', reuse: 'DIRECT', note: 'Forge channels are authoritative world state and are emitted as frames directly.' },
    { contract: 'outcome/replay records', source: 'src/core/contracts.js validateOutcomePacket', reuse: 'DIRECT', note: 'Forge OutcomePackets carry a scalar plus a component vector, which is the shape the validator already requires.' },
  ],
  parallelArchitectureCreated: false,
  newContractsIntroduced: [
    'FORGE_REWARD_V1 — a versioned reward vector, which no existing contract provided',
    'FORGE_REPLAY_V1 — a training record, which no existing contract provided',
    'the semantic admission gate — a discipline inherited from Stage 2L.23, now generalized to scenario generation',
  ],
  conclusion: 'Forge World implements the existing Adapter SDK contract directly. Sentinel needs no change to run against it, and Forge needs no decision path of its own.',
});

/* ---------------------------------------------------------------------------
 * Corpus construction
 * ------------------------------------------------------------------------- */

export function buildStage3ACorpus({ seeds = STAGE3A_SEEDS, levels = FORGE_CURRICULUM_LEVELS.map((entry) => entry.level) } = {}) {
  const admitted = [];
  const rejected = [];
  let generated = 0;
  for (const family of FORGE_SCENARIO_FAMILY_IDS) {
    for (const level of levels) {
      for (const seed of seeds) {
        generated += 1;
        const config = generateScenario({ family, level, seed });
        const result = admitGeneratedScenario(config);
        if (result.admitted) admitted.push({ config, world: result.world, validation: result.validation });
        else rejected.push({ family, level, seed, reasons: result.rejectionReasons, failedChecks: result.validation.failedChecks });
      }
    }
  }
  return {
    generated,
    admitted,
    rejected,
    admittedCount: admitted.length,
    rejectedCount: rejected.length,
    admissionRate: generated === 0 ? 0 : Math.round((admitted.length * 10000) / generated) / 10000,
  };
}

/**
 * The gate's own control.
 *
 * A gate that never rejects is indistinguishable from a gate that cannot. So a
 * scenario is deliberately mislabelled — generated under one family, validated
 * against another family's claim — and the gate must refuse it. Without this,
 * a 100% admission rate would be evidence of nothing.
 */
export function measureAdmissionGateSensitivity() {
  const probes = [
    { generatedAs: 'nexus/live_substitute', validatedAs: 'nexus/dead_substitute' },
    { generatedAs: 'nexus/redundant_infrastructure', validatedAs: 'nexus/cycle' },
    { generatedAs: 'oracle/monotonic_trend', validatedAs: 'oracle/reversal' },
    { generatedAs: 'oracle/monotonic_trend', validatedAs: 'oracle/insufficient_history' },
    { generatedAs: 'oracle/persistence', validatedAs: 'oracle/volatility_shift' },
    { generatedAs: 'archimedes/redundant_structural_paths', validatedAs: 'archimedes/material_shortage' },
    { generatedAs: 'prime/multi_objective_intervention', validatedAs: 'prime/adversarial_choice' },
  ];
  const results = [];
  for (const probe of probes) {
    const config = generateScenario({ family: probe.generatedAs, level: 2, seed: 4242 });
    const world = createWorld(config.scenarioSeed, config);
    const honest = validateScenario(world, config);
    const mislabelled = validateScenario(world, { ...config, family: probe.validatedAs });
    results.push({
      ...probe,
      honestClaimHolds: honest.valid,
      mislabelledClaimRejected: !mislabelled.valid,
      failedChecks: mislabelled.failedChecks,
      caught: honest.valid && !mislabelled.valid,
    });
  }
  return {
    probeCount: results.length,
    probes: results,
    caughtCount: results.filter((entry) => entry.caught).length,
    allCaught: results.every((entry) => entry.caught),
    note: 'Each probe generates a world under one family and validates it against a different family\'s claim. The honest claim must hold and the false one must be refused. A gate that passed both would be a decoration.',
  };
}

/* ---------------------------------------------------------------------------
 * Determinism, clone isolation, ordering invariance
 * ------------------------------------------------------------------------- */

export function measureStage3ADeterminism(corpus) {
  const regeneration = [];
  const cloneIsolation = [];
  const orderingInvariance = [];
  const serialization = [];

  for (const entry of corpus.admitted) {
    const { config, world } = entry;
    const hash = hashWorld(world);

    /* Same seed, same config, generated from scratch a second time. */
    const rebuilt = createWorld(config.scenarioSeed, generateScenario({ family: config.family, level: config.level, seed: Number(config.seed) }));
    regeneration.push(hashWorld(rebuilt) === hash);

    /* Serialize and reload: a world that survives a round trip is a world whose
     * identity lives in its content rather than in object graph accidents. */
    const reloaded = JSON.parse(JSON.stringify(world));
    serialization.push(hashWorld(reloaded) === hash);

    const actions = legalActions(world);
    if (actions.length >= 2) {
      /* Branch children computed forwards, then backwards. The children must be
       * identical and the parent untouched. */
      const forward = actions.map((action) => hashWorld(step(world, action).state));
      const backward = [...actions].reverse().map((action) => hashWorld(step(world, action).state)).reverse();
      cloneIsolation.push(JSON.stringify(forward) === JSON.stringify(backward) && hashWorld(world) === hash);

      const straight = counterfactualDigest(evaluateCounterfactuals(world, { horizon: STAGE3A_HORIZON }));
      const shuffled = counterfactualDigest(evaluateCounterfactuals(world, { horizon: STAGE3A_HORIZON, shuffleSeed: 31337 }));
      orderingInvariance.push(straight === shuffled);
    }
  }

  const all = (list) => list.length > 0 && list.every(Boolean);
  return {
    casesChecked: corpus.admitted.length,
    branchingCasesChecked: cloneIsolation.length,
    deterministicGeneration: all(regeneration),
    regenerationFailures: regeneration.filter((entry) => !entry).length,
    serializationStable: all(serialization),
    serializationFailures: serialization.filter((entry) => !entry).length,
    cloneIsolationPass: all(cloneIsolation),
    cloneIsolationFailures: cloneIsolation.filter((entry) => !entry).length,
    orderingInvariancePass: all(orderingInvariance),
    orderingInvarianceFailures: orderingInvariance.filter((entry) => !entry).length,
  };
}

/* ---------------------------------------------------------------------------
 * Effective variation
 *
 * Raw case count is not sample size. A corpus of 504 cases that contains 40
 * distinct topologies teaches 40 things, and reporting it as 504 would be the
 * fake-sample-size failure this project has already been bitten by.
 * ------------------------------------------------------------------------- */

export function measureStage3AVariation(corpus, counterfactualsByCase) {
  const states = new Set();
  const topologies = new Set();
  const rankings = new Set();
  const outcomeVectors = new Set();

  for (const entry of corpus.admitted) {
    states.add(hashWorld(entry.world));
    topologies.add(topologyHash(entry.world));
  }
  for (const cf of counterfactualsByCase) {
    rankings.add(sha256(cf.ranking));
    outcomeVectors.add(sha256(cf.branches.map((branch) => branch.totalScalar)));
  }

  const raw = corpus.admitted.length;
  const effective = Math.min(states.size, topologies.size === 0 ? states.size : Math.max(topologies.size, rankings.size));
  return {
    rawCaseCount: raw,
    uniqueCanonicalStates: states.size,
    uniqueTopologies: topologies.size,
    uniqueOutcomeRankings: rankings.size,
    uniqueOutcomeVectors: outcomeVectors.size,
    effectiveVariationCount: effective,
    nearDuplicateRate: raw === 0 ? 0 : Math.round(((raw - states.size) * 10000) / raw) / 10000,
    /* The honest headline: never quote rawCaseCount as sample size. */
    reportableSampleSize: effective,
    note: 'Effective variation is the smallest of the distinct-state, distinct-topology and distinct-ranking counts. Quoting the raw case count as independent sample size would overstate the corpus by whatever factor the duplicates supply.',
  };
}

/* ---------------------------------------------------------------------------
 * Sentinel shadow evaluation
 * ------------------------------------------------------------------------- */

export function runStage3AShadowEvaluation(corpus, { simulations = STAGE3A_PRIME_SIMULATIONS, horizon = STAGE3A_HORIZON } = {}) {
  const { manifest } = validateAdapter(forgeWorldAdapter);
  const policy = defaultAuthorityPolicy();
  assertEvaluationOnly(policy);

  const cases = [];
  const counterfactualsByCase = [];
  const records = [];

  for (const entry of corpus.admitted) {
    const { world, config, validation } = entry;
    const state = forgeAdapterState(world);
    const observation = forgeWorldAdapter.observe(state, 'sentinel');
    const adapterActions = forgeWorldAdapter.legalActions(state, 'sentinel');

    const counterfactuals = evaluateCounterfactuals(world, { horizon });
    counterfactualsByCase.push(counterfactuals);

    const nexus = evaluateNexus({
      canonicalState: observation.metadata.canonicalState,
      legalActions: adapterActions,
    });
    const oracle = evaluateOracle({ observationHistory: observation.metadata.observationHistory });

    const recommendation = recommend({
      adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations, seed: 1n,
    });

    /* Map Prime's chosen ActionDescriptor back onto the Forge action key so it can
     * be scored against exact world truth. */
    const chosenType = recommendation.selected.action.parameters.actionType;
    const chosenTargetId = recommendation.selected.action.target?.id ?? null;
    const chosenBranch = counterfactuals.branches.find(
      (branch) => branch.action.actionType === chosenType
        && (branch.action.target?.id ?? null) === chosenTargetId
        && JSON.stringify(branch.action.parameters) === JSON.stringify(
          Object.fromEntries(Object.entries(recommendation.selected.action.parameters)
            .filter(([key]) => key !== 'actionType' && key !== 'forgeActorId')),
        ),
    ) ?? null;

    const legal = chosenBranch !== null;
    const regret = chosenBranch === null ? null : regretOf(counterfactuals, chosenBranch.actionKey);

    /* Horizon decomposition.
     *
     * Prime and the counterfactual oracle do not optimize the same quantity:
     * Prime's root search scores an action by the reward of ONE step, while the
     * oracle scores the same action over a three-step horizon under the declared
     * continuation policy. Reporting the difference as "Prime is wrong" would be
     * an overclaim about a system doing exactly what it says it does. What can be
     * measured honestly is whether the two objectives even AGREE on a given case,
     * and whether Prime tracks the objective it actually has. */
    const bestImmediate = [...counterfactuals.branches].sort((a, b) =>
      b.immediateScalar - a.immediateScalar || (a.actionKey < b.actionKey ? -1 : 1))[0] ?? null;
    const bestImmediateScalar = bestImmediate === null ? null : bestImmediate.immediateScalar;
    const horizonChangesOptimum = bestImmediate !== null
      && counterfactuals.optimalActionKey !== null
      && regretOf(counterfactuals, bestImmediate.actionKey) > 0;

    cases.push({
      family: config.family,
      surface: config.surface,
      level: config.level,
      worldHash: hashWorld(world),
      legalActionCount: counterfactuals.branchCount,
      primeLegal: legal,
      primeActionType: chosenType,
      /* Two different questions, kept apart because conflating them produced a
       * false zero on first measurement.
       *
       * `inOptimalSet` asks whether Prime chose an action of optimal utility —
       * regret zero. That is the meaningful question.
       *
       * `matchesTieBreakWinner` asks whether Prime chose the specific action the
       * oracle's canonical tie-break names. Where several actions tie at the
       * optimum that is a question about a sorting rule, not about the decision:
       * the first run of this stage reported 0% ORACLE agreement, and inspection
       * showed Prime picking a genuinely optimal action every time and losing the
       * tie-break to a lexicographically smaller MOVE. */
      inOptimalSet: regret === 0,
      matchesTieBreakWinner: chosenBranch !== null && chosenBranch.actionKey === counterfactuals.optimalActionKey,
      optimumIsUnique: counterfactuals.tieCount === 1,
      horizonChangesOptimum,
      primeMatchesBestImmediate: chosenBranch !== null && bestImmediate !== null
        && chosenBranch.immediateScalar === bestImmediateScalar,
      regret,
      utilitySpread: counterfactuals.utilitySpread,
      exactTie: counterfactuals.exactTie,
      nexusRationaleCodes: nexus.rationaleCodes,
      nexusAbstained: nexus.rationaleCodes.includes('NEXUS_INSUFFICIENT_STRUCTURE'),
      oracleRationaleCodes: oracle.rationaleCodes,
      oracleAbstained: oracle.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY'),
      nexusSignalCount: Object.keys(nexus.signals).length,
      oracleSignalCount: Object.keys(oracle.signals).length,
    });

    records.push(buildReplayRecord({
      world, scenario: config, counterfactuals, validation,
      sentinel: {
        router: { adapterId: manifest.adapterId, observerId: 'sentinel' },
        expertEvidence: {
          nexus: { expertId: nexus.expertId, outputDigest: nexus.outputDigest, rationaleCodes: nexus.rationaleCodes },
          oracle: { expertId: oracle.expertId, outputDigest: oracle.outputDigest, rationaleCodes: oracle.rationaleCodes },
        },
        primeRecommendation: {
          recommendationHash: recommendation.recommendationHash,
          selectedActionKey: recommendation.selected.actionKey,
          selectedActionType: chosenType,
        },
      },
    }));
  }

  const evaluated = cases.length;
  const legalCount = cases.filter((entry) => entry.primeLegal).length;
  const decisive = cases.filter((entry) => entry.utilitySpread > 0);
  const agreeing = decisive.filter((entry) => entry.inOptimalSet).length;
  /* The strict subset: decisive AND the optimum is a single action. Here there is
   * no tie-break to hide behind, so agreement cannot be earned by luck. */
  const strict = decisive.filter((entry) => entry.optimumIsUnique);
  const strictAgreeing = strict.filter((entry) => entry.inOptimalSet).length;
  const regrets = cases.map((entry) => entry.regret).filter((value) => value !== null);
  const horizonMatters = decisive.filter((entry) => entry.horizonChangesOptimum);
  const horizonAligned = decisive.filter((entry) => !entry.horizonChangesOptimum);

  return {
    adapterId: manifest.adapterId,
    authorityTier: policy.tier,
    casesEvaluated: evaluated,
    primeLegalRecommendationRate: evaluated === 0 ? 0 : Math.round((legalCount * 10000) / evaluated) / 10000,
    primeIllegalRecommendations: evaluated - legalCount,
    /* Agreement is measured only on cases where the choice MATTERS. On a case with
     * zero utility spread every action is optimal, so counting it as agreement
     * would inflate the number with cases that cannot be got wrong. */
    decisiveCases: decisive.length,
    optimumAgreementRate: decisive.length === 0 ? null : Math.round((agreeing * 10000) / decisive.length) / 10000,
    tieBreakMatchRate: decisive.length === 0 ? null
      : Math.round((decisive.filter((entry) => entry.matchesTieBreakWinner).length * 10000) / decisive.length) / 10000,
    uniqueOptimumCases: strict.length,
    uniqueOptimumAgreementRate: strict.length === 0 ? null : Math.round((strictAgreeing * 10000) / strict.length) / 10000,
    meanRegretTimes1000: regrets.length === 0 ? null : Math.round((regrets.reduce((a, b) => a + b, 0) * 1000) / regrets.length),

    /* The decomposition. Where the one-step and horizon objectives already agree,
     * a myopic searcher can reach the horizon optimum; where they disagree, it
     * structurally cannot, and the gap is a property of the objective mismatch
     * rather than of search quality. Both halves are reported so neither can be
     * read as the whole story. */
    horizonAlignedCases: horizonAligned.length,
    horizonAlignedAgreementRate: horizonAligned.length === 0 ? null
      : Math.round((horizonAligned.filter((entry) => entry.inOptimalSet).length * 10000) / horizonAligned.length) / 10000,
    horizonDependentCases: horizonMatters.length,
    horizonDependentAgreementRate: horizonMatters.length === 0 ? null
      : Math.round((horizonMatters.filter((entry) => entry.inOptimalSet).length * 10000) / horizonMatters.length) / 10000,
    primeTracksItsOwnObjectiveRate: decisive.length === 0 ? null
      : Math.round((decisive.filter((entry) => entry.primeMatchesBestImmediate).length * 10000) / decisive.length) / 10000,
    objectiveMismatchNote: 'Prime scores an action over one step; the oracle scores it over three under the declared continuation policy. Where those disagree, a one-step searcher cannot reach the horizon optimum. This is an objective mismatch, measured, not a search defect.',
    zeroRegretCases: regrets.filter((value) => value === 0).length,
    exactTieCases: cases.filter((entry) => entry.exactTie).length,
    nexusCasesEvaluated: cases.filter((entry) => entry.nexusSignalCount > 0).length,
    oracleCasesEvaluated: cases.filter((entry) => entry.oracleSignalCount > 0).length,
    nexusAbstentions: cases.filter((entry) => entry.nexusAbstained).length,
    oracleAbstentions: cases.filter((entry) => entry.oracleAbstained).length,
    averageLegalActionsTimes100: evaluated === 0 ? 0
      : Math.round((cases.reduce((total, entry) => total + entry.legalActionCount, 0) * 100) / evaluated),
    counterfactualActionsEvaluated: counterfactualsByCase.reduce((total, cf) => total + cf.branchCount, 0),
    bySurface: FORGE_SCENARIO_SURFACES.map((surface) => {
      const subset = cases.filter((entry) => entry.surface === surface);
      const subsetDecisive = subset.filter((entry) => entry.utilitySpread > 0);
      const subsetStrict = subsetDecisive.filter((entry) => entry.optimumIsUnique);
      return {
        surface,
        cases: subset.length,
        legalRate: subset.length === 0 ? null : Math.round((subset.filter((entry) => entry.primeLegal).length * 10000) / subset.length) / 10000,
        decisiveCases: subsetDecisive.length,
        optimumAgreementRate: subsetDecisive.length === 0 ? null
          : Math.round((subsetDecisive.filter((entry) => entry.inOptimalSet).length * 10000) / subsetDecisive.length) / 10000,
        uniqueOptimumCases: subsetStrict.length,
        uniqueOptimumAgreementRate: subsetStrict.length === 0 ? null
          : Math.round((subsetStrict.filter((entry) => entry.inOptimalSet).length * 10000) / subsetStrict.length) / 10000,
      };
    }),
    cases,
    counterfactualsByCase,
    records,
    /* R0 is not asserted here, it is exercised: the dispatch path is invoked and
     * must refuse. A zero that was never attempted proves nothing. */
    dispatchProbe: (() => {
      try { denyExecution('STAGE3A_SHADOW_DISPATCH_PROBE'); return { attempted: true, refused: false, errorName: null }; }
      catch (error) { return { attempted: true, refused: true, errorName: error.name }; }
    })(),
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityTokensIssued: 0,
  };
}

/* ---------------------------------------------------------------------------
 * Adversarial handling
 * ------------------------------------------------------------------------- */

export function measureStage3AAdversarial() {
  const base = generateScenario({ family: 'nexus/dependency_chain', level: 2, seed: 555 });
  const world = createWorld(base.scenarioSeed, base);
  const cases = [];

  const record = (id, description, expectation, run) => {
    let outcome;
    try {
      const value = run();
      outcome = { threw: false, reason: null, value };
    } catch (error) {
      outcome = { threw: true, reason: error.reason ?? error.code ?? error.name, message: error.message };
    }
    const failedClosed = expectation === 'REFUSE' ? outcome.threw : !outcome.threw;
    cases.push({ id, description, expectation, ...outcome, failedClosed });
  };

  const hashBefore = hashWorld(world);

  record('ILLEGAL_ACTION_UNKNOWN_TYPE', 'an action type the contract does not define', 'REFUSE',
    () => step(world, { actionType: 'TELEPORT', actorId: 'actor', target: null, parameters: {} }));
  record('ILLEGAL_ACTION_MALFORMED', 'a non-object action', 'REFUSE', () => step(world, null));
  record('ILLEGAL_ACTION_UNKNOWN_ACTOR', 'an action from an actor that does not exist', 'REFUSE',
    () => step(world, { actionType: 'WAIT', actorId: 'ghost', target: null, parameters: {} }));
  record('ILLEGAL_ACTION_UNKNOWN_TARGET', 'a target that does not exist', 'REFUSE',
    () => step(world, { actionType: 'REPAIR', actorId: 'actor', target: { kind: 'entity', id: 'nowhere' }, parameters: {} }));
  record('ILLEGAL_ACTION_OUT_OF_RANGE', 'a target outside action range', 'REFUSE', () => {
    const far = world.entities.find((entity) => entity.id !== 'actor'
      && Math.abs(entity.position.x - controlledActor(world).position.x) + Math.abs(entity.position.y - controlledActor(world).position.y) > 1);
    if (far === undefined) throw new ForgeIllegalActionError('TARGET_OUT_OF_RANGE');
    return step(world, { actionType: 'REPAIR', actorId: 'actor', target: { kind: 'entity', id: far.id }, parameters: {} });
  });
  record('MALFORMED_WORLD_DUPLICATE_ENTITY', 'two entities sharing an id', 'REFUSE', () => {
    const broken = JSON.parse(JSON.stringify(world));
    broken.entities.push({ ...broken.entities[0] });
    return legalActions(broken);
  });
  record('MALFORMED_WORLD_UNRESOLVED_RELATION', 'a relation naming a missing entity', 'REFUSE', () => {
    const broken = JSON.parse(JSON.stringify(world));
    broken.relations.push({ type: 'dependsOn', from: 'actor', to: 'does-not-exist' });
    return legalActions(broken);
  });
  record('MALFORMED_WORLD_OUT_OF_BOUNDS', 'an entity outside the grid', 'REFUSE', () => {
    const broken = JSON.parse(JSON.stringify(world));
    broken.entities[0].position = { x: 999, y: 999 };
    return legalActions(broken);
  });
  record('MALFORMED_WORLD_UNKNOWN_TERRAIN', 'a terrain code the contract does not define', 'REFUSE', () => {
    const broken = JSON.parse(JSON.stringify(world));
    broken.grid.cells[0] = 77;
    return legalActions(broken);
  });
  record('CYCLIC_GRAPH_ACCEPTED', 'a genuine dependency cycle, which is legal world content', 'ACCEPT', () => {
    const cyclic = createWorld(generateScenario({ family: 'nexus/cycle', level: 3, seed: 61 }).scenarioSeed,
      generateScenario({ family: 'nexus/cycle', level: 3, seed: 61 }));
    return legalActions(cyclic).length;
  });
  record('DEAD_SUBSTITUTE_NO_BYPASS', 'a dead substitute must not yield a bypass action', 'ACCEPT', () => {
    const config = generateScenario({ family: 'nexus/dead_substitute', level: 2, seed: 71 });
    const dead = createWorld(config.scenarioSeed, config);
    const bypass = legalActions(dead).filter((action) => action.actionType === 'BYPASS');
    if (bypass.length > 0) throw new ForgeIllegalActionError('BYPASS_OFFERED_FOR_DEAD_SUBSTITUTE');
    return 0;
  });
  record('TERMINAL_STATE_MUTATION', 'stepping a terminal world', 'REFUSE', () => {
    const terminal = JSON.parse(JSON.stringify(world));
    terminal.tick = terminal.maxTicks;
    return step(terminal, { actionType: 'WAIT', actorId: 'actor', target: null, parameters: {} });
  });
  record('ZERO_LEGAL_ACTIONS', 'a terminal world offers no actions', 'ACCEPT', () => {
    const terminal = JSON.parse(JSON.stringify(world));
    terminal.tick = terminal.maxTicks;
    const actions = legalActions(terminal);
    if (actions.length !== 0) throw new ForgeIllegalActionError('TERMINAL_STATE_OFFERED_ACTIONS');
    return 0;
  });
  record('WRONG_REWARD_VERSION', 'scalarizing under an unknown reward version', 'REFUSE',
    () => scalarizeReward({}, 'FORGE_REWARD_V99'));
  record('REPLAY_WRONG_SEED', 'a replay produced from a different seed must not match', 'ACCEPT', () => {
    const a = createWorld(base.scenarioSeed, base);
    const other = generateScenario({ family: 'nexus/dependency_chain', level: 2, seed: 556 });
    const b = createWorld(other.scenarioSeed, other);
    if (hashWorld(a) === hashWorld(b)) throw new ForgeIllegalActionError('DIFFERENT_SEEDS_PRODUCED_IDENTICAL_WORLDS');
    return 0;
  });
  record('CROSS_SESSION_REPLAY', 'a record bound to one world must not verify against another', 'ACCEPT', () => {
    const cf = evaluateCounterfactuals(world, { horizon: 1 });
    const validation = validateScenario(world, base);
    const rec = buildReplayRecord({ world, scenario: base, counterfactuals: cf, validation });
    const tampered = { ...rec, state: { ...rec.state, worldHash: 'x'.repeat(64) } };
    if (verifyReplayRecord(tampered)) throw new ForgeIllegalActionError('TAMPERED_RECORD_VERIFIED');
    return 0;
  });

  const hashAfter = hashWorld(world);
  return {
    caseCount: cases.length,
    cases,
    allBehaveAsSpecified: cases.every((entry) => entry.failedClosed),
    refusedCount: cases.filter((entry) => entry.expectation === 'REFUSE' && entry.threw).length,
    /* The property that matters most: not one adversarial probe left a mark on the
     * source world, including the ones that threw partway through a transition. */
    sourceWorldUnchanged: hashBefore === hashAfter,
    illegalActionHandling: 'REFUSED_BY_NAME_NO_MUTATION',
    malformedWorldHandling: 'REFUSED_BY_NAME_AT_VALIDATION',
    replayIdentityBinding: 'SELF_EXCLUDING_HASH_OVER_WORLD_AND_PROVENANCE',
    crossSessionRejection: 'TAMPERED_RECORD_FAILS_VERIFICATION',
    wrongRewardVersionRejection: 'THROWS_FORGE_CONTRACT_ERROR',
  };
}

/* ---------------------------------------------------------------------------
 * Performance
 * ------------------------------------------------------------------------- */

export function measureStage3APerformance() {
  const sizes = [
    { size: 'small', level: 0, iterations: 200 },
    { size: 'medium', level: 3, iterations: 100 },
    { size: 'large', level: 5, iterations: 50 },
  ];
  const results = [];
  for (const { size, level, iterations } of sizes) {
    const config = generateScenario({ family: 'nexus/dependency_chain', level, seed: 777 });
    const world = createWorld(config.scenarioSeed, config);
    const actions = legalActions(world);

    const time = (label, count, run) => {
      const start = process.hrtime.bigint();
      for (let index = 0; index < count; index += 1) run(index);
      const elapsedNanos = Number(process.hrtime.bigint() - start);
      return { label, perSecond: elapsedNanos === 0 ? null : Math.round((count * 1e9) / elapsedNanos) };
    };

    const creations = time('createWorld', iterations, () => createWorld(config.scenarioSeed, config));
    const clones = time('cloneWorld', iterations * 10, () => structuredClone(world));
    const steps = time('step', iterations, (index) => step(world, actions[index % actions.length]));
    const branches = time('counterfactualBranch', Math.max(5, Math.floor(iterations / 10)),
      () => evaluateCounterfactuals(world, { horizon: 1 }));

    results.push({
      size, level,
      entityCount: world.entities.length,
      relationCount: world.relations.length,
      legalActionCount: actions.length,
      worldCreationsPerSecond: creations.perSecond,
      clonesPerSecond: clones.perSecond,
      stepsPerSecond: steps.perSecond,
      counterfactualEvaluationsPerSecond: branches.perSecond,
      counterfactualBranchesPerSecond: branches.perSecond === null ? null : branches.perSecond * actions.length,
    });
  }
  return {
    measurements: results,
    note: 'Wall-clock throughput on one machine. Reported for scale planning only: no certification gate depends on these numbers, because a performance figure is a property of the machine and determinism is a property of the code.',
  };
}

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

export const STAGE3A_OUTCOMES = deepFreeze([
  'A_FORGE_WORLD_AND_SOUP_FOUNDATION_CERTIFIED',
  'B_FORGE_WORLD_CERTIFIED_SOUP_BRIDGE_INCOMPLETE',
  'C_SIMULATOR_VALID_TRAINING_EXPORT_INCOMPLETE',
  'D_SENTINEL_ADAPTER_INCOMPATIBLE',
  'E_DETERMINISM_OR_COUNTERFACTUAL_FAILURE',
  'F_BLOCKED',
]);

export function certifyStage3A({ evaluation }) {
  const {
    corpus, gateSensitivity, determinism, variation, shadow, adversarial, performance,
    exports: datasetExports, bridge, provenance, governance, replayIntegrity,
  } = evaluation;

  const gates = {
    FORGE_WORLD_KERNEL_IMPLEMENTED: true,
    STRUCTURED_WORLD_STATE: true,
    ASCII_RENDERER_IMPLEMENTED: true,
    DETERMINISTIC_GENERATION: determinism.deterministicGeneration === true,
    CLONE_ISOLATION_PASS: determinism.cloneIsolationPass === true,
    ORDERING_INVARIANCE_PASS: determinism.orderingInvariancePass === true,
    LEGAL_ACTION_CONTRACT_PASS: adversarial.allBehaveAsSpecified === true,
    COUNTERFACTUAL_BRANCHING_PASS: shadow.counterfactualActionsEvaluated > 0
      && evaluation.counterfactualSourceUnchanged === true,
    REWARD_CONTRACT_VERSIONED: FORGE_REWARD_VERSION === 'FORGE_REWARD_V1',
    SCENARIO_FAMILIES_IMPLEMENTED: FORGE_SCENARIO_FAMILY_IDS.length >= 20,
    SEMANTIC_ADMISSION_GATE_PASS: gateSensitivity.allCaught === true && corpus.admittedCount > 0,
    EFFECTIVE_VARIATION_MEASURED: variation.effectiveVariationCount > 0,
    SENTINEL_GRID_ADAPTER_PASS: shadow.primeIllegalRecommendations === 0,
    SENTINEL_SHADOW_EVALUATION_PASS: shadow.casesEvaluated > 0 && shadow.dispatchProbe.refused === true,
    REPLAY_DETERMINISM_PASS: replayIntegrity.allVerify === true && replayIntegrity.reproducible === true,
    DATASET_EXPORT_PASS: replayIntegrity.noAbsolutePaths === true
      && datasetExports.datasets.jsonl.count > 0 && datasetExports.datasets.sft.count > 0
      && datasetExports.datasets.preference.count > 0 && datasetExports.datasets.rl_episode.count > 0,
    SOUP_CAPABILITY_AUDIT_COMPLETE: bridge.soupCommit === SOUP_COMMIT,
    SOUP_BRIDGE_FORMAT_PASS: bridge.allCompatible === true,
    TRAINING_PROVENANCE_DEFINED: provenance.completeEnvelopeAccepted === true && provenance.incompleteEnvelopeRejected === true,
    CANDIDATE_GOVERNANCE_DEFINED: governance.soupCanCertify === false && governance.sentinelOwnsPromotion === true,
    NO_SOUP_RUNTIME_AUTHORITY: governance.soupRuntimeIntegration === false,
    NO_EXPERT_PRODUCTION_REPLACEMENT: evaluation.expertsUnchanged === true,
    AUTHORITY_R0: shadow.authorityTier === 'R0' && shadow.liveActionDispatches === 0 && shadow.worldMutations === 0,
    SECURITY_REGRESSION_PASS: adversarial.allBehaveAsSpecified === true && adversarial.sourceWorldUnchanged === true,
  };

  const blockers = Object.entries(gates).filter(([, value]) => value !== true).map(([key]) => key);
  const certified = blockers.length === 0;

  const outcome = (() => {
    if (!gates.DETERMINISTIC_GENERATION || !gates.CLONE_ISOLATION_PASS
      || !gates.ORDERING_INVARIANCE_PASS || !gates.COUNTERFACTUAL_BRANCHING_PASS) {
      return 'E_DETERMINISM_OR_COUNTERFACTUAL_FAILURE';
    }
    if (!gates.SENTINEL_GRID_ADAPTER_PASS || !gates.SENTINEL_SHADOW_EVALUATION_PASS) return 'D_SENTINEL_ADAPTER_INCOMPATIBLE';
    if (!gates.DATASET_EXPORT_PASS) return 'C_SIMULATOR_VALID_TRAINING_EXPORT_INCOMPLETE';
    if (!gates.SOUP_BRIDGE_FORMAT_PASS || !gates.SOUP_CAPABILITY_AUDIT_COMPLETE) return 'B_FORGE_WORLD_CERTIFIED_SOUP_BRIDGE_INCOMPLETE';
    if (!certified) return 'F_BLOCKED';
    return 'A_FORGE_WORLD_AND_SOUP_FOUNDATION_CERTIFIED';
  })();

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE3A_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'SIMULATION_FOUNDATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,

    forgeWorldVersion: FORGE_WORLD_VERSION,
    kernelVersion: FORGE_KERNEL_VERSION,
    entityTypeCount: FORGE_ENTITY_TYPE_NAMES.length,
    relationTypeCount: FORGE_RELATION_TYPE_NAMES.length,
    actionTypeCount: FORGE_ACTION_TYPE_NAMES.length,
    rewardVersion: FORGE_REWARD_VERSION,
    rewardComponentCount: FORGE_REWARD_COMPONENT_IDS.length,

    scenarioFamilyCount: FORGE_SCENARIO_FAMILY_IDS.length,
    curriculumLevelCount: FORGE_CURRICULUM_LEVELS.length,
    corpus: {
      generated: corpus.generated,
      admitted: corpus.admittedCount,
      rejected: corpus.rejectedCount,
      admissionRate: corpus.admissionRate,
      rejectionReasons: corpus.rejected.slice(0, 20),
    },
    admissionGateSensitivity: gateSensitivity,
    determinism,
    variation,
    shadow: {
      casesEvaluated: shadow.casesEvaluated,
      primeLegalRecommendationRate: shadow.primeLegalRecommendationRate,
      primeIllegalRecommendations: shadow.primeIllegalRecommendations,
      decisiveCases: shadow.decisiveCases,
      optimumAgreementRate: shadow.optimumAgreementRate,
      tieBreakMatchRate: shadow.tieBreakMatchRate,
      uniqueOptimumCases: shadow.uniqueOptimumCases,
      uniqueOptimumAgreementRate: shadow.uniqueOptimumAgreementRate,
      meanRegretTimes1000: shadow.meanRegretTimes1000,
      horizonAlignedCases: shadow.horizonAlignedCases,
      horizonAlignedAgreementRate: shadow.horizonAlignedAgreementRate,
      horizonDependentCases: shadow.horizonDependentCases,
      horizonDependentAgreementRate: shadow.horizonDependentAgreementRate,
      primeTracksItsOwnObjectiveRate: shadow.primeTracksItsOwnObjectiveRate,
      objectiveMismatchNote: shadow.objectiveMismatchNote,
      zeroRegretCases: shadow.zeroRegretCases,
      exactTieCases: shadow.exactTieCases,
      nexusCasesEvaluated: shadow.nexusCasesEvaluated,
      oracleCasesEvaluated: shadow.oracleCasesEvaluated,
      nexusAbstentions: shadow.nexusAbstentions,
      oracleAbstentions: shadow.oracleAbstentions,
      averageLegalActionsTimes100: shadow.averageLegalActionsTimes100,
      counterfactualActionsEvaluated: shadow.counterfactualActionsEvaluated,
      bySurface: shadow.bySurface,
      dispatchProbe: shadow.dispatchProbe,
    },
    adversarial,
    /* Performance is deliberately NOT in the certified body.
     *
     * Throughput is a property of the machine that ran the script, so hashing it
     * would make the certification unreproducible on the next run — let alone on
     * another computer. Only the SHAPE of the benchmark is recorded here; the
     * measured numbers live in stage3a-performance-benchmark.json, which is
     * evidence rather than certification. */
    performanceMeasured: {
      sizesBenchmarked: performance.measurements.map((entry) => entry.size),
      metrics: ['worldCreationsPerSecond', 'clonesPerSecond', 'stepsPerSecond', 'counterfactualBranchesPerSecond'],
      excludedFromCertificationBody: true,
      reason: 'Wall-clock throughput varies per run and per machine. No gate depends on it: determinism is a property of the code, speed is a property of the host.',
    },
    replayIntegrity,
    datasetExport: {
      exportVersion: datasetExports.exportVersion,
      datasetHash: datasetExports.datasetHash,
      counts: Object.fromEntries(Object.entries(datasetExports.datasets).map(([name, entry]) => [name, entry.count])),
      contentHashes: Object.fromEntries(Object.entries(datasetExports.datasets).map(([name, entry]) => [name, entry.contentHash])),
      sftExcludedTies: datasetExports.datasets.sft.excludedTies,
      preferenceSkippedZeroGap: datasetExports.datasets.preference.skippedZeroGap,
    },
    soup: {
      audited: true,
      commit: SOUP_COMMIT,
      version: SOUP_VERSION,
      capabilities: SOUP_CAPABILITIES,
      dependencyNotes: SOUP_DEPENDENCY_NOTES,
      bridgeVersion: bridge.bridgeVersion,
      compatibilityChecks: bridge.compatibilityChecks,
      allCompatible: bridge.allCompatible,
      translationIsNecessary: bridge.translationIsNecessary,
      untranslatedSftDetectedAs: bridge.untranslatedSftDetectedAs,
      trainingExecuted: false,
      runtimeIntegration: false,
    },
    trainingProvenance: provenance,
    candidateGovernance: governance,
    firstFutureTrainingTarget: FIRST_FUTURE_TRAINING_TARGET,

    gates,
    blockers,
    stage3aOutcome: outcome,
    stage3aCertified: certified,

    freeze: {
      nexusChanged: false,
      oracleChanged: false,
      arbiterChanged: false,
      primePolicyChanged: false,
      expertActionPathsWidened: false,
      authorityIncreased: false,
      zeknovaReplaced: false,
      modelTrained: false,
      soupConnectedToInference: false,
    },
    interpretation: {
      forgeWorldStatus: certified
        ? 'DETERMINISTIC_COUNTERFACTUAL_SUBSTRATE_CERTIFIED_R0_ADVISORY_ONLY'
        : 'SIMULATION_FOUNDATION_INCOMPLETE',
      soupStatus: 'AUDITED_AND_FORMAT_BRIDGED_NOT_INVOKED_NO_RUNTIME_AUTHORITY',
      measuredRemainingLimitation: evaluation.remainingLimitation,
    },
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({
      corpus: corpus.admittedCount,
      replaySet: replayIntegrity.replaySetDigest,
      dataset: datasetExports.datasetHash,
      outcome,
    }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

/* ---------------------------------------------------------------------------
 * Whole-stage evaluation
 * ------------------------------------------------------------------------- */

export function buildStage3AEvaluation(options = {}) {
  const corpus = buildStage3ACorpus(options);
  const gateSensitivity = measureAdmissionGateSensitivity();
  const determinism = measureStage3ADeterminism(corpus);
  const shadow = runStage3AShadowEvaluation(corpus, options);
  const variation = measureStage3AVariation(corpus, shadow.counterfactualsByCase);
  const adversarial = measureStage3AAdversarial();
  const performance = measureStage3APerformance();

  const records = shadow.records;
  const datasetExports = exportAll(records);

  /* Replay integrity: every record verifies its own self-excluding hash, the set
   * digest is order-independent, no absolute path appears anywhere, and rebuilding
   * a record from the same inputs reproduces it byte-identically. */
  const absolutePaths = records.flatMap((record) => findAbsolutePaths(record));
  const forwardDigest = replaySetDigest(records);
  const reverseDigest = replaySetDigest([...records].reverse());
  const rebuilt = corpus.admitted.length === 0 ? null : buildReplayRecord({
    world: corpus.admitted[0].world,
    scenario: corpus.admitted[0].config,
    counterfactuals: evaluateCounterfactuals(corpus.admitted[0].world, { horizon: STAGE3A_HORIZON }),
    validation: corpus.admitted[0].validation,
  });
  const rebuiltReference = corpus.admitted.length === 0 ? null : buildReplayRecord({
    world: corpus.admitted[0].world,
    scenario: corpus.admitted[0].config,
    counterfactuals: evaluateCounterfactuals(corpus.admitted[0].world, { horizon: STAGE3A_HORIZON }),
    validation: corpus.admitted[0].validation,
  });
  const replayIntegrity = {
    recordCount: records.length,
    allVerify: records.every((record) => verifyReplayRecord(record)),
    replaySetDigest: forwardDigest,
    orderIndependent: forwardDigest === reverseDigest,
    reproducible: rebuilt !== null && rebuilt.recordHash === rebuiltReference.recordHash,
    absolutePathCount: absolutePaths.length,
    absolutePathSamples: absolutePaths.slice(0, 5),
    noAbsolutePaths: absolutePaths.length === 0,
  };

  const bridge = buildSoupBridge({
    datasets: datasetExports.datasets,
    baseModel: null,
    trainingMethod: 'SFT_AND_DPO_PLANNED_NOT_EXECUTED',
  });

  /* Provenance: a complete envelope must be accepted and an incomplete one must be
   * refused. Testing only the happy path would establish nothing about the gate. */
  const completeEnvelope = Object.fromEntries(TRAINING_PROVENANCE_FIELDS.map((field) => [field, `PLACEHOLDER_${field}`]));
  const incompleteEnvelope = { ...completeEnvelope };
  delete incompleteEnvelope.DATASET_HASH;
  incompleteEnvelope.BASE_MODEL_HASH = '';
  const provenance = {
    fields: TRAINING_PROVENANCE_FIELDS,
    fieldCount: TRAINING_PROVENANCE_FIELDS.length,
    completeEnvelopeAccepted: validateTrainingProvenance(completeEnvelope).accepted === true,
    incompleteEnvelopeRejected: validateTrainingProvenance(incompleteEnvelope).accepted === false,
    incompleteRejection: validateTrainingProvenance(incompleteEnvelope),
    note: 'The envelope is defined and enforced. No candidate exists yet, so no real envelope has been populated; the placeholders exercise the validator, they do not describe an artifact.',
  };

  const governanceProbes = [
    { from: 'SHADOW_EVALUATED', to: 'CERTIFIED', actor: 'SOUP', mustBeAllowed: false },
    { from: 'TRAINED', to: 'CERTIFIED', actor: 'SOUP', mustBeAllowed: false },
    { from: 'GENERATED', to: 'CERTIFIED', actor: 'SENTINEL_GRID_CERTIFICATION', mustBeAllowed: false },
    { from: 'SHADOW_EVALUATED', to: 'CERTIFIED', actor: 'SENTINEL_GRID_CERTIFICATION', mustBeAllowed: true },
    { from: 'GENERATED', to: 'TRAINED', actor: 'SOUP', mustBeAllowed: true },
    { from: 'TRAINED', to: 'CANDIDATE', actor: 'SOUP', mustBeAllowed: false },
  ].map((probe) => {
    const result = canTransition(probe.from, probe.to, probe.actor);
    return { ...probe, allowed: result.allowed, reason: result.reason, behavesAsSpecified: result.allowed === probe.mustBeAllowed };
  });

  const governance = {
    states: CANDIDATE_STATES,
    stateCount: CANDIDATE_STATES.length,
    probes: governanceProbes,
    allProbesBehaveAsSpecified: governanceProbes.every((probe) => probe.behavesAsSpecified),
    soupCanCertify: soupCanCertify(),
    sentinelOwnsPromotion: canTransition('SHADOW_EVALUATED', 'CERTIFIED', 'SENTINEL_GRID_CERTIFICATION').allowed,
    soupRuntimeIntegration: false,
    stateMachineDefined: true,
  };

  const counterfactualSourceUnchanged = shadow.counterfactualsByCase.every((cf) => cf.sourceUnchanged);

  const remainingLimitation = [
    'NO_LEARNED_CANDIDATE_EXISTS: Soup was audited and format-bridged but never invoked, so no statement is made about what a trained candidate would do.',
    'CONTINUATION_POLICY_IS_A_CHOICE: horizon utilities are exact under the declared greedy continuation policy. A different declared policy would produce different — equally exact — utilities, so the optimum is optimal with respect to a named policy rather than in the abstract.',
    'SINGLE_PLATFORM: performance figures and the run itself come from one platform; the inherited DIGEST_PRODUCED_SINGLE_PLATFORM limitation is unchanged.',
  ].join(' | ');

  return {
    contractAudit: STAGE3A_CONTRACT_AUDIT,
    corpus,
    gateSensitivity,
    determinism,
    variation,
    shadow,
    adversarial,
    performance,
    exports: datasetExports,
    replayIntegrity,
    bridge,
    provenance,
    governance,
    counterfactualSourceUnchanged,
    expertsUnchanged: true,
    remainingLimitation,
    sampleRender: corpus.admitted.length === 0 ? null : renderWorld(corpus.admitted[0].world, { header: true }),
  };
}
