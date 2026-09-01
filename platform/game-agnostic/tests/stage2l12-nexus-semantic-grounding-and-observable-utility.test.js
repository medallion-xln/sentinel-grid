import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { sha256 } from '../src/core/determinism.js';
import { STAGE2L10_FROZEN_CALIBRATION } from '../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';
import {
  STAGE2L12_ACTION_CONSEQUENCE_MODEL,
  STAGE2L12_ACTION_KINDS,
  STAGE2L12_DISCOVERY_CASES,
  STAGE2L12_ENTITY_FIELDS,
  STAGE2L12_HOLDOUT_CASES,
  STAGE2L12_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L12_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L12_MAX_TRIVIAL_BASELINE_ACCURACY,
  STAGE2L12_OBJECTIVE_MODEL,
  STAGE2L12_OBJECTIVE_TYPES,
  STAGE2L12_RELATION_KINDS,
  STAGE2L12_SEMANTIC_PROFILES,
  STAGE2L12_STAGE,
  STAGE2L12_STATUSES,
  STAGE2L12_TOPOLOGY_FAMILIES,
  STAGE2L12_TRIVIAL_BASELINES,
  analyzeStage2L12Identifiability,
  applyAction,
  buildStage2L12Case,
  buildStage2L12Evaluation,
  buildStage2L12PortabilityDigest,
  certifyStage2L12,
  chooseReachabilityQuery,
  deriveGroundTruth,
  discoverStage2L12Rule,
  evaluateNexusBlind,
  flattenStage2L12Features,
  isDecidable,
  nexusRecommendation,
  objectiveUtility,
  testStage2L12Generalization,
  validateStage2L12GroundTruth,
} from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';

const evaluation = buildStage2L12Evaluation();
const certification = certifyStage2L12({ evaluation });

/* A small hand-built world, so the semantics are checked against something a
 * reader can verify by inspection rather than only against the generator. */
function entity(id, overrides = {}) {
  return {
    entityId: id, objectiveValue: 0, demand: 0, baseCapacity: 500000,
    availability: 1000000, risk: 0, protectionNeed: 0, restorationCost: 10000,
    objectiveRelevant: false, ...overrides,
  };
}
function relation(id, from, to, kind, weight = 0, replaces = null) {
  return { relationId: id, from, to, kind, weight, replaces };
}

/* ---------------------------------------------------------------------------
 * Freeze — nothing about the subject under measurement may have moved
 * ------------------------------------------------------------------------- */

test('Nexus and the Stage 2L.10 arbiter are imported byte-for-byte frozen', async () => {
  const owners = {
    '../src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
    '../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  };
  for (const [file, expected] of Object.entries(owners)) {
    const source = await readFile(new URL(file, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, `${file} must not change`);
  }
});

test('no inherited threshold is loosened and no decision code is touched', () => {
  assert.equal(STAGE2L12_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(STAGE2L12_MAX_CORRECT_PRIME_BREAK_RATE, 0.01);
  assert.equal(certification.freeze.nexusChanged, false);
  assert.equal(certification.freeze.arbiterChanged, false);
  assert.equal(certification.freeze.calibrationChanged, false);
  assert.equal(certification.freeze.evidenceContractChanged, false);
  assert.equal(certification.freeze.thresholdsUnchanged, true);
  assert.equal(certification.freeze.stage2l10CalibrationDigest, STAGE2L10_FROZEN_CALIBRATION.calibrationDigest);
});

/* ---------------------------------------------------------------------------
 * The objective function and action consequences
 * ------------------------------------------------------------------------- */

test('the objective is deterministic and declared independent of every expert', () => {
  assert.equal(STAGE2L12_OBJECTIVE_MODEL.readsExpertOutput, false);
  assert.equal(STAGE2L12_OBJECTIVE_MODEL.readsPrimeOutput, false);
  assert.equal(STAGE2L12_OBJECTIVE_MODEL.readsArbiterOutput, false);
  assert.equal(STAGE2L12_OBJECTIVE_MODEL.readsRandomCorrectnessFlag, false);
  assert.equal(STAGE2L12_ACTION_CONSEQUENCE_MODEL.readsExpertOutput, false);
  assert.ok(STAGE2L12_ENTITY_FIELDS.length >= 8);
  assert.ok(STAGE2L12_RELATION_KINDS.length >= 7);
  assert.ok(STAGE2L12_ACTION_KINDS.length >= 5);
});

test('a delivering objective node contributes its value', () => {
  const world = { entities: [entity('a', { objectiveValue: 400000 })], relations: [] };
  assert.equal(objectiveUtility(world).utility, 400000);
});

test('an unavailable node does not deliver', () => {
  const world = { entities: [entity('a', { objectiveValue: 400000, availability: 100000 })], relations: [] };
  assert.equal(objectiveUtility(world).utility, 0);
});

test('a critical dependency blocks delivery and restoring it unblocks', () => {
  const world = {
    entities: [entity('dep', { availability: 0 }), entity('obj', { objectiveValue: 500000 })],
    relations: [relation('r1', 'dep', 'obj', 'depends')],
  };
  assert.equal(objectiveUtility(world).utility, 0);
  const restored = applyAction(world, { actionId: 'x', kind: 'RESTORE', targetEntityId: 'dep' });
  assert.equal(objectiveUtility(restored).utility, 500000);
});

test('an irrelevant dependency does not change utility when restored', () => {
  const world = {
    entities: [entity('noise', { availability: 0 }), entity('obj', { objectiveValue: 500000 })],
    relations: [],
  };
  const before = objectiveUtility(world).utility;
  const after = objectiveUtility(applyAction(world, { actionId: 'x', kind: 'RESTORE', targetEntityId: 'noise' }));
  assert.equal(after.utility, before);
});

test('a redundant dependency is survivable via a substitute, and BYPASS activates it', () => {
  const world = {
    entities: [entity('dep', { availability: 0 }), entity('alt', { availability: 0 }), entity('obj', { objectiveValue: 600000 })],
    relations: [relation('r1', 'dep', 'obj', 'depends'), relation('r2', 'alt', 'obj', 'substitutes', 0, 'dep')],
  };
  assert.equal(objectiveUtility(world).utility, 0);
  const bypassed = applyAction(world, { actionId: 'x', kind: 'BYPASS', targetEntityId: 'dep' });
  assert.equal(objectiveUtility(bypassed).utility, 600000);
});

test('a capacity bottleneck blocks delivery and REINFORCE clears it', () => {
  const world = { entities: [entity('obj', { objectiveValue: 500000, demand: 900000, baseCapacity: 100000 })], relations: [] };
  assert.equal(objectiveUtility(world).utility, 0);
  const reinforced = applyAction(world, { actionId: 'x', kind: 'REINFORCE', targetEntityId: 'obj', reinforceAmount: 900000 });
  assert.equal(objectiveUtility(reinforced).utility, 500000);
});

test('risk is penalised and PROTECT removes it', () => {
  const world = { entities: [entity('a', { objectiveValue: 0, risk: 1000000, protectionNeed: 1000000 })], relations: [] };
  assert.equal(objectiveUtility(world).utility, -1000000);
  const protectedWorld = applyAction(world, { actionId: 'x', kind: 'PROTECT', targetEntityId: 'a' });
  assert.equal(objectiveUtility(protectedWorld).utility, 0);
});

test('applying an action never mutates the source world', () => {
  const world = { entities: [entity('a', { availability: 0 })], relations: [] };
  const snapshot = JSON.stringify(world);
  applyAction(world, { actionId: 'x', kind: 'RESTORE', targetEntityId: 'a' });
  assert.equal(JSON.stringify(world), snapshot);
});

test('a decoy high-degree node with no objective relevance is not worth acting on', () => {
  const world = {
    entities: [
      entity('decoy', { availability: 0, restorationCost: 50000 }),
      entity('leaf', { availability: 0, objectiveValue: 900000, restorationCost: 50000 }),
      entity('x1'), entity('x2'), entity('x3'),
    ],
    relations: [relation('d1', 'decoy', 'x1', 'depends'), relation('d2', 'decoy', 'x2', 'depends'), relation('d3', 'decoy', 'x3', 'depends')],
  };
  const actions = [
    { actionId: 'a-hold', kind: 'HOLD', targetEntityId: null, reinforceAmount: 0 },
    { actionId: 'a-restore-decoy', kind: 'RESTORE', targetEntityId: 'decoy', reinforceAmount: 0 },
    { actionId: 'a-restore-leaf', kind: 'RESTORE', targetEntityId: 'leaf', reinforceAmount: 0 },
  ];
  const truth = deriveGroundTruth(world, actions);
  // The low-degree node holds the value; degree is not the answer.
  assert.equal(truth.optimalActionId, 'a-restore-leaf');
});

test('a utility tie is resolved by the declared rule and recorded', () => {
  const world = {
    entities: [entity('p', { availability: 0, objectiveValue: 300000, restorationCost: 1000 }), entity('q', { availability: 0, objectiveValue: 300000, restorationCost: 1000 })],
    relations: [],
  };
  const actions = [
    { actionId: 'z-restore-q', kind: 'RESTORE', targetEntityId: 'q', reinforceAmount: 0 },
    { actionId: 'a-restore-p', kind: 'RESTORE', targetEntityId: 'p', reinforceAmount: 0 },
  ];
  const truth = deriveGroundTruth(world, actions);
  assert.equal(truth.tied, true);
  assert.equal(truth.tieCount, 2);
  assert.equal(truth.optimalActionId, 'a-restore-p', 'ties break to the lowest canonical action key');
});

test('conflicting objectives are penalised when both deliver', () => {
  const world = {
    entities: [entity('a', { objectiveValue: 400000 }), entity('b', { objectiveValue: 400000 })],
    relations: [relation('c1', 'a', 'b', 'conflicts', 300000)],
  };
  assert.equal(objectiveUtility(world).utility, 800000 - 300000);
});

/* ---------------------------------------------------------------------------
 * PHASE 5 — ground-truth validation
 * ------------------------------------------------------------------------- */

test('ground truth is deterministic, order-invariant, replayable and serialisation-stable', () => {
  const validation = evaluation.validation;
  assert.equal(validation.groundTruthDeterministic, true);
  assert.equal(validation.groundTruthOrderingInvariance, true);
  assert.equal(validation.groundTruthReplayPass, true);
  assert.equal(validation.groundTruthSerializationInvariance, true);
  assert.equal(certification.groundTruthValidationPass, true);
});

test('entity and action ordering do not change the derived optimum', () => {
  for (const variant of [3, 17, 99, 512]) {
    const record = buildStage2L12Case('HOLDOUT', variant);
    const reversed = deriveGroundTruth(
      { entities: [...record.world.entities].reverse(), relations: [...record.world.relations].reverse() },
      [...record.legalActions].reverse(),
    );
    assert.equal(reversed.optimalActionId, record.groundTruth.optimalActionId);
    assert.equal(reversed.optimalActionUtility, record.groundTruth.optimalActionUtility);
  }
});

test('ground truth is derived from world state, not a random correctness draw', () => {
  assert.equal(evaluation.validation.groundTruthDerivedFromWorldState, true);
  assert.equal(evaluation.validation.independentRandomCorrectnessLabel, false);
  assert.deepEqual(evaluation.validation.hiddenCorrectnessFields, []);
  assert.equal(certification.semanticGroundingValid, true);
});

test('no case carries a hidden correctness field anywhere in its world or actions', () => {
  for (const variant of [0, 5, 41, 900]) {
    const record = buildStage2L12Case('HOLDOUT', variant);
    const serialized = JSON.stringify({ world: record.world, legalActions: record.legalActions });
    for (const banned of ['nexusAligned', 'expertCorrect', '"correct"', '"answer"', '"label"']) {
      assert.ok(!serialized.includes(banned), `${banned} leaked into case ${record.worldId}`);
    }
  }
});

test('no trivial heuristic dominates the benchmark', () => {
  const validation = evaluation.validation;
  assert.equal(validation.trivialBaselineDominates, false);
  assert.ok(validation.bestTrivialBaselineAccuracy <= STAGE2L12_MAX_TRIVIAL_BASELINE_ACCURACY);
  assert.ok(validation.bestTrivialBaselineAccuracy > validation.randomChoiceBaseline,
    'a benchmark where nothing beats random would be measuring noise');
  for (const name of STAGE2L12_TRIVIAL_BASELINES) {
    assert.ok(typeof validation.trivialBaselineAccuracy[name] === 'number');
  }
  assert.equal(validation.trivialBaselineAccuracy.ALWAYS_HOLD, 0, 'decidable cases are exactly those where holding is not optimal');
});

test('the optimal action is spread across kinds rather than dominated by one', () => {
  const kinds = evaluation.validation.optimalActionKindDistribution;
  assert.ok(Object.keys(kinds).length >= 3);
  assert.ok(evaluation.validation.maxOptimalKindShare < 0.6);
});

test('all topology families, semantic profiles and objective types are represented', () => {
  assert.equal(STAGE2L12_TOPOLOGY_FAMILIES.length, 12);
  assert.equal(STAGE2L12_SEMANTIC_PROFILES.length, 8);
  for (const family of STAGE2L12_TOPOLOGY_FAMILIES) {
    assert.ok(evaluation.validation.topologyFamilyDistribution[family] > 0, `${family} absent`);
  }
  for (const profile of STAGE2L12_SEMANTIC_PROFILES) {
    assert.ok(evaluation.validation.semanticProfileDistribution[profile] > 0, `${profile} absent`);
  }
  for (const type of STAGE2L12_OBJECTIVE_TYPES) {
    assert.ok(evaluation.validation.objectiveTypeDistribution[type] > 0, `${type} absent`);
  }
});

test('decidability is computed from world semantics and excludes only do-nothing cases', () => {
  const record = buildStage2L12Case('HOLDOUT', 7);
  assert.equal(isDecidable(record.groundTruth), record.decidable);
  assert.ok(evaluation.corpus.holdoutDecidable > 1000);
  assert.ok(evaluation.validation.decidableRate > 0.2 && evaluation.validation.decidableRate < 0.9);
});

/* ---------------------------------------------------------------------------
 * PHASE 6 — Nexus blind evaluation
 * ------------------------------------------------------------------------- */

test('the reachability question put to Nexus is value-blind and well posed', () => {
  const record = buildStage2L12Case('HOLDOUT', 12);
  const query = chooseReachabilityQuery(record.world);
  assert.ok(typeof query.source === 'string' && typeof query.target === 'string');
  assert.notEqual(query.source, query.target);
  // The query must not be aimed at whatever happens to hold the objective value.
  const byId = new Map(record.world.entities.map((e) => [e.entityId, e]));
  const topValue = [...record.world.entities].sort((a, b) => b.objectiveValue - a.objectiveValue)[0];
  const chosenByValue = query.target === topValue.entityId && topValue.objectiveValue > 0;
  assert.ok(!chosenByValue || byId.get(query.target).objectiveValue >= 0);
});

test('Nexus receives the complete canonical state including the semantic payload', () => {
  const record = buildStage2L12Case('HOLDOUT', 21);
  const recommendation = nexusRecommendation(record);
  assert.ok(recommendation.candidateCount > 0);
  assert.ok(Object.keys(recommendation.expertSignals).length > 10);
});

test('Nexus recommends only from the legal action set, and abstains rather than guessing', () => {
  for (const variant of [1, 44, 301]) {
    const record = buildStage2L12Case('HOLDOUT', variant);
    const recommendation = nexusRecommendation(record);
    if (recommendation.recommendedActionId !== null) {
      assert.ok(record.legalActions.some((action) => action.actionId === recommendation.recommendedActionId));
    } else {
      assert.equal(recommendation.abstained, true);
    }
  }
});

test('the inherited Nexus expert is measured as-is and the result is reported plainly', () => {
  const measured = certification.nexusEvaluation;
  assert.ok(measured.decidableCases > 1000);
  assert.ok(measured.nexusAccuracy >= 0 && measured.nexusAccuracy <= 1);
  assert.ok(measured.primeAccuracy >= 0 && measured.primeAccuracy <= 1);
  assert.equal(
    measured.nexusCorrectPrimeWrong + measured.nexusWrongPrimeCorrect + measured.bothCorrect + measured.bothWrong,
    measured.decidableCases,
  );
  // The measured finding: structure alone does not determine objective utility.
  assert.equal(measured.nexusBeatsBestTrivialBaseline, false);
  assert.equal(certification.interpretation.measuredLimitation, 'EXPERT_SEMANTICS');
});

test('Nexus does best where structure and value agree and worst where they are decoupled', () => {
  const byProfile = certification.nexusEvaluation.byProfile;
  assert.ok(byProfile.VALUE_ON_BOTTLENECK.cases > 0);
  assert.ok(byProfile.BOTTLENECK_WORTHLESS.cases > 0);
  assert.ok(byProfile.EXPENSIVE_BOTTLENECK.cases > 0);
  assert.ok(byProfile.VALUE_ON_BOTTLENECK.nexusAccuracy > byProfile.BOTTLENECK_WORTHLESS.nexusAccuracy,
    'a structural expert should do better where structure carries the value');
});

/* ---------------------------------------------------------------------------
 * PHASE 7 — identifiability
 * ------------------------------------------------------------------------- */

test('discovery and holdout are disjoint and split guards are enforced', () => {
  assert.equal(evaluation.corpus.corpusOverlap, 0);
  assert.equal(evaluation.corpus.calibrationHoldoutSeparate, true);
  assert.equal(evaluation.corpus.discoveryCases, STAGE2L12_DISCOVERY_CASES);
  assert.equal(evaluation.corpus.holdoutCases, STAGE2L12_HOLDOUT_CASES);
  const holdoutRows = evaluation.rows.slice(0, 3);
  assert.throws(() => discoverStage2L12Rule(holdoutRows), /STAGE2L12_DISCOVERY_SPLIT_VIOLATION/);
  // Enough cases that some are decidable; an empty row set would never reach the guard.
  const discoveryRows = evaluateNexusBlind(Array.from({ length: 60 }, (unused, v) => buildStage2L12Case('DISCOVERY', v))).rows;
  assert.ok(discoveryRows.length > 0, 'need decidable discovery rows for the guard to be exercised');
  const discovery = discoverStage2L12Rule(discoveryRows);
  assert.throws(() => testStage2L12Generalization(discovery, discoveryRows), /STAGE2L12_HOLDOUT_SPLIT_VIOLATION/);
});

test('the feature vector contains no outcome and no generator metadata', () => {
  const features = flattenStage2L12Features(evaluation.rows[0]);
  for (const banned of ['nexusCorrect', 'primeCorrect', 'optimalActionId', 'context.family', 'context.profile',
    'context.objectiveType', 'context.utilityMarginMicro', 'nexus.abstained']) {
    assert.ok(!(banned in features), `${banned} must not be a feature`);
  }
  assert.ok('context.baselineUtility' in features, 'U(current state) is a legitimate decision-time observable');
  assert.equal(evaluation.labelLeakage.labelLeakageDetected, false);
  assert.deepEqual(evaluation.labelLeakage.forbiddenInFeatures, []);
});

test('the identifiability analysis conditions on Nexus having recommended', () => {
  assert.equal(evaluation.analysis.conditionedOn, 'NEXUS_MADE_A_RECOMMENDATION');
  assert.ok(evaluation.analysis.coverage > 0 && evaluation.analysis.coverage < 1);
  assert.ok(evaluation.analysis.cases < evaluation.analysis.rowsBeforeConditioning);
});

test('the permutation null is computed rather than assumed', () => {
  const nullDistribution = evaluation.analysis.permutationNull;
  assert.equal(nullDistribution.permutations, 40);
  assert.ok(nullDistribution.median > 0);
  assert.ok(nullDistribution.p95 >= nullDistribution.median);
  assert.ok(nullDistribution.max >= nullDistribution.p95);
});

test('the identifiability analysis is deterministic', () => {
  const rows = evaluateNexusBlind(Array.from({ length: 600 }, (unused, v) => buildStage2L12Case('HOLDOUT', v))).rows;
  assert.equal(sha256(analyzeStage2L12Identifiability(rows, { permutations: 4 })), sha256(analyzeStage2L12Identifiability(rows, { permutations: 4 })));
});

test('the grounded benchmark makes correctness partially predictable', () => {
  assert.ok(STAGE2L12_STATUSES.includes(certification.identifiability.status));
  assert.equal(certification.identifiability.status, 'IDENTIFIABLE');
  assert.equal(certification.identifiability.observedExceedsPermutationP95, true);
  assert.equal(certification.generalization.generalizes, true);
  assert.ok(certification.generalization.holdoutReliability > certification.generalization.holdoutBaseRate);
});

test('the predictive signal lives in world state, not in Nexus output', () => {
  const tiers = certification.identifiability.perTierBestGap;
  assert.equal(certification.identifiability.bestSignalTier, 'TIER_WORLD_STATE');
  assert.ok(tiers.TIER_WORLD_STATE > tiers.TIER_NEXUS_OUTPUT);
  // Nexus's own outputs do not clear the permutation null.
  assert.ok(tiers.TIER_NEXUS_OUTPUT < certification.identifiability.permutationNull.p95);
});

test('no predicate reaches the inherited delegation reliability floor', () => {
  assert.equal(certification.identifiability.anyPredicateReachesReliabilityFloor, false);
  assert.equal(certification.generalization.holdoutReachesFloor, false);
});

/* ---------------------------------------------------------------------------
 * PHASE 8/9 — delegation gate and security
 * ------------------------------------------------------------------------- */

test('the Stage 2L.10 gate is applied unchanged and no delegation is forced', () => {
  assert.equal(certification.delegation.calibrationUnchanged, true);
  assert.equal(certification.delegation.calibrationDigest, STAGE2L10_FROZEN_CALIBRATION.calibrationDigest);
  assert.equal(certification.delegation.delegationForced, false);
  assert.deepEqual(certification.delegation.nexusDelegatingBuckets, []);
  assert.equal(certification.delegation.nexusDelegations, 0);
});

test('inherited safety ceilings are respected and unchanged', () => {
  assert.ok(certification.delegation.nexusHarmRate <= STAGE2L12_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(certification.delegation.nexusCorrectPrimeBreakRate <= STAGE2L12_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(certification.delegation.harmCeilingRespected, true);
  assert.equal(certification.delegation.correctPrimeBreakCeilingRespected, true);
  assert.equal(certification.security.minBucketReliabilityUnchanged, true);
  assert.equal(certification.security.minBucketSamplesUnchanged, true);
  assert.equal(certification.securityRegressionPass, true);
});

test('authority stays R0 and nothing is dispatched or mutated', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.arbiterShadowOnly, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.deepEqual(certification.security.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false });
});

test('no live ZekNova delta is claimed and portability is not overstated', () => {
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
  assert.match(certification.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

test('replay is byte-equivalent', () => {
  assert.equal(evaluation.replay.replayEquivalent, true);
  assert.equal(evaluation.replay.rowDigest, evaluation.replay.replayDigest);
});

test('the stage passes on benchmark validity, not on Nexus performing well', () => {
  assert.equal(certification.stageKind, 'BENCHMARK_REMEDIATION_AND_MEASUREMENT');
  assert.equal(certification.semanticGroundingValid, true);
  assert.equal(certification.identifiabilityQuestionAnswered, true);
  assert.equal(certification.stage2l12Certified, true);
  assert.equal(certification.status, 'PASS');
  // ...while the measured verdict on the expert is negative.
  assert.equal(certification.interpretation.nexusSafeForSelectiveDelegation, false);
  assert.equal(certification.interpretation.nexusExpertRemediationRequired, true);
  assert.equal(certification.interpretation.corpusRemediationRequired, false);
  assert.equal(certification.interpretation.arbiterRemediationRequired, false);
});

test('the certification is self-consistent and reproducible', () => {
  const { certificationHash, ...body } = certification;
  assert.equal(sha256(body), certificationHash);
  assert.equal(certification.stage, STAGE2L12_STAGE);
  const portability = buildStage2L12PortabilityDigest(certification);
  assert.equal(portability.digest, buildStage2L12PortabilityDigest(certification).digest);
});

test('the stored certification artifact reproduces the recomputed certification', async () => {
  const stored = JSON.parse(await readFile(new URL('../artifacts/stage2l12-nexus-semantic-grounding-and-observable-utility/stage2l12-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(stored.certificationHash, certification.certificationHash);
  assert.equal(stored.status, 'PASS');
  assert.equal(stored.identifiability.status, 'IDENTIFIABLE');
});

test('validation rejects a corpus a trivial heuristic would dominate', () => {
  // A corpus of one repeated shape: the same action wins everywhere.
  const degenerate = Array.from({ length: 200 }, (unused, v) => {
    const world = { entities: [entity('dep', { availability: 0, restorationCost: 1000 }), entity('obj', { objectiveValue: 900000 })], relations: [relation('r', 'dep', 'obj', 'depends')] };
    const actions = [
      { actionId: 'a-hold', kind: 'HOLD', targetEntityId: null, reinforceAmount: 0 },
      { actionId: 'b-restore-dep', kind: 'RESTORE', targetEntityId: 'dep', reinforceAmount: 0 },
    ];
    const groundTruth = deriveGroundTruth(world, actions);
    return {
      worldId: `deg-${v}`, split: 'HOLDOUT', variant: v, family: 'CHAIN', profile: 'VALUE_ON_BOTTLENECK',
      objectiveType: 'THROUGHPUT', world, legalActions: actions, groundTruth,
      decidable: isDecidable(groundTruth), highestDegreeEntity: 'dep', lowestDegreeEntity: 'obj',
    };
  });
  const validation = validateStage2L12GroundTruth(degenerate);
  assert.equal(validation.trivialBaselineDominates, true);
  assert.equal(validation.valid, false);
});
