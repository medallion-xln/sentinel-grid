import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { sha256 } from '../src/core/determinism.js';
import { STAGE2L10_FROZEN_CALIBRATION } from '../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';
import { deriveGroundTruth } from '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import {
  STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD,
  STAGE2L13_RELATIONAL_UTILITY_MODEL,
  evaluateValueAwareNexus,
  scoreRelationalUtility,
} from '../src/lab/stage2l13-value-aware-nexus.js';
import {
  STAGE2L13_ADVERSARIAL_CASES,
  STAGE2L13_GAP_AUDIT,
  STAGE2L13_IMPROVEMENT_FLOOR,
  STAGE2L13_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L13_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L13_MIN_BUCKET_RELIABILITY,
  STAGE2L13_MIN_BUCKET_SAMPLES,
  STAGE2L13_NEXUS_BUCKETS,
  STAGE2L13_STAGE,
  STAGE2L13_STRUCTURALLY_INELIGIBLE_BUCKETS,
  analyzeStage2L13Identifiability,
  buildStage2L13Evaluation,
  certifyStage2L13,
  deriveStage2L13Calibration,
  discoverStage2L13Rule,
  flattenStage2L13Features,
  runStage2L13AdversarialSuite,
  stage2L13NexusBucket,
  testStage2L13Generalization,
} from '../src/lab/stage2l13-value-aware-nexus-relational-utility.js';

const evaluation = buildStage2L13Evaluation();
const certification = certifyStage2L13({ evaluation });

function entity(id, overrides = {}) {
  return {
    entityId: id, objectiveValue: 0, demand: 0, baseCapacity: 500000, availability: 1000000,
    risk: 0, protectionNeed: 0, restorationCost: 10000, objectiveRelevant: false, ...overrides,
  };
}
function relation(id, from, to, kind, weight = 0, replaces = null) {
  return { relationId: id, from, to, kind, weight, replaces };
}
function action(actionId, kind, targetEntityId, reinforceAmount = 600000) {
  return { actionId, kind, targetEntityId, reinforceAmount };
}
const HOLD = action('a-hold', 'HOLD', null, 0);

/* ---------------------------------------------------------------------------
 * Freeze and isolation — the benchmark and the arbiter must not have moved
 * ------------------------------------------------------------------------- */

test('the Stage 2L.12 benchmark, inherited Nexus and Stage 2L.10 arbiter are byte-frozen', async () => {
  const owners = {
    '../src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js': '2c54345aabedcd3e2e913fb7b4d5d5cbf9dd1ece99f2cf211c3dd76deaea0143',
    '../src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
    '../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  };
  for (const [file, expected] of Object.entries(owners)) {
    const source = await readFile(new URL(file, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, `${file} must not change`);
  }
  assert.equal(certification.freeze.benchmarkUnchanged, true);
  assert.equal(certification.freeze.groundTruthUnchanged, true);
});

test('the value-aware expert imports nothing from the benchmark', async () => {
  const source = await readFile(new URL('../src/lab/stage2l13-value-aware-nexus.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const specifier of imports) {
    assert.ok(!/stage2l12|stage2l10/.test(specifier), `expert must not import ${specifier}`);
  }
  // And it must not name the benchmark's scoring symbols at all.
  assert.ok(!/deriveGroundTruth|objectiveUtility/.test(source));
  assert.equal(STAGE2L13_RELATIONAL_UTILITY_MODEL.importsBenchmarkScoring, false);
  assert.equal(STAGE2L13_RELATIONAL_UTILITY_MODEL.readsGroundTruth, false);
  assert.equal(STAGE2L13_RELATIONAL_UTILITY_MODEL.readsOptimalAction, false);
});

test('the expert uses its own operational threshold, not the world delivery threshold', () => {
  // The Stage 2L.12 world delivers at 600000. An expert that knew that exactly
  // would be reading the environment's answer key.
  assert.equal(STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD, 500000);
  assert.notEqual(STAGE2L13_NEXUS_OPERATIONAL_THRESHOLD, 600000);
});

test('no inherited threshold or ceiling is loosened', () => {
  assert.equal(STAGE2L13_MIN_BUCKET_RELIABILITY, 0.99);
  assert.equal(STAGE2L13_MIN_BUCKET_SAMPLES, 60);
  assert.equal(STAGE2L13_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(STAGE2L13_MAX_CORRECT_PRIME_BREAK_RATE, 0.01);
  assert.equal(certification.freeze.thresholdsUnchanged, true);
  assert.equal(certification.freeze.arbiterChanged, false);
  assert.equal(certification.freeze.arbiterContractChanged, false);
  assert.equal(certification.freeze.inheritedCalibrationModified, false);
  assert.equal(certification.freeze.inheritedCalibrationDigest, STAGE2L10_FROZEN_CALIBRATION.calibrationDigest);
  assert.equal(certification.delegation.reliabilityFloorLowered, false);
});

/* ---------------------------------------------------------------------------
 * PHASE 1 — the gap audit
 * ------------------------------------------------------------------------- */

test('the gap audit records that no quantitative semantic field was read', () => {
  const quantitative = STAGE2L13_GAP_AUDIT.matrix.filter((row) => !row.field.includes('boolean'));
  assert.ok(quantitative.length >= 8);
  for (const row of quantitative) {
    assert.equal(row.availableInCanonicalState, true, `${row.field} should be available`);
    assert.equal(row.readByNexus, false, `${row.field} was read by inherited Nexus`);
    assert.equal(row.usedInRecommendation, false);
  }
  assert.ok(STAGE2L13_GAP_AUDIT.relationKindsIgnoredByInheritedExpert.includes('protects'));
  assert.ok(STAGE2L13_GAP_AUDIT.relationKindsIgnoredByInheritedExpert.includes('substitutes'));
});

/* ---------------------------------------------------------------------------
 * PHASE 3 — value/structure decoupling. The direct test of the 2L12 defect.
 * ------------------------------------------------------------------------- */

function expectPick(world, actions, expected, message) {
  const result = evaluateValueAwareNexus(world, actions);
  assert.equal(result.recommendedActionId, expected, message);
  // And the benchmark must agree that this really is the optimum.
  assert.equal(deriveGroundTruth(world, actions).optimalActionId, expected, `${message} (benchmark disagrees)`);
}

test('A high-degree low-value loses to low-degree high-value', () => {
  expectPick(
    { entities: [entity('hub', { availability: 0 }), entity('leaf', { availability: 0, objectiveValue: 900000 }), entity('x1'), entity('x2'), entity('x3')],
      relations: [relation('r1', 'hub', 'x1', 'depends'), relation('r2', 'hub', 'x2', 'depends'), relation('r3', 'hub', 'x3', 'depends')] },
    [HOLD, action('b-restore-hub', 'RESTORE', 'hub'), action('c-restore-leaf', 'RESTORE', 'leaf')],
    'c-restore-leaf', 'degree must not decide',
  );
});

test('B a deep irrelevant node loses to a shallow essential one', () => {
  expectPick(
    { entities: [entity('d1', { availability: 0 }), entity('d2'), entity('d3'), entity('shallow', { availability: 0 }), entity('obj', { objectiveValue: 800000 })],
      relations: [relation('r1', 'd1', 'd2', 'depends'), relation('r2', 'd2', 'd3', 'depends'), relation('r3', 'shallow', 'obj', 'depends')] },
    [HOLD, action('b-restore-d1', 'RESTORE', 'd1'), action('c-restore-shallow', 'RESTORE', 'shallow')],
    'c-restore-shallow', 'depth must not decide',
  );
});

test('C a single point of failure with no consequence loses to a valuable path', () => {
  expectPick(
    { entities: [entity('spof', { availability: 0 }), entity('junk'), entity('gate', { availability: 0 }), entity('rich', { objectiveValue: 950000 })],
      relations: [relation('r1', 'spof', 'junk', 'depends'), relation('r2', 'gate', 'rich', 'depends')] },
    [HOLD, action('b-restore-spof', 'RESTORE', 'spof'), action('c-restore-gate', 'RESTORE', 'gate')],
    'c-restore-gate', 'criticality without consequence must not decide',
  );
});

test('D a structurally attractive action loses when it costs too much', () => {
  expectPick(
    { entities: [entity('hub', { availability: 0, restorationCost: 900000 }), entity('obj', { objectiveValue: 400000 }),
      entity('cheap', { availability: 0, restorationCost: 5000 }), entity('obj2', { objectiveValue: 300000 })],
      relations: [relation('r1', 'hub', 'obj', 'depends'), relation('r2', 'cheap', 'obj2', 'depends')] },
    [HOLD, action('b-restore-hub', 'RESTORE', 'hub'), action('c-restore-cheap', 'RESTORE', 'cheap')],
    'c-restore-cheap', 'cost must be priced',
  );
});

test('E removing a dominant risk beats a marginal value repair', () => {
  expectPick(
    { entities: [entity('risky', { risk: 1000000, protectionNeed: 1000000, restorationCost: 20000 }),
      entity('tiny', { availability: 0, objectiveValue: 60000, restorationCost: 20000 })], relations: [] },
    [HOLD, action('b-protect-risky', 'PROTECT', 'risky'), action('c-restore-tiny', 'RESTORE', 'tiny')],
    'b-protect-risky', 'risk must be priced',
  );
});

test('F extreme centrality with low contribution loses to moderate structure with high value', () => {
  expectPick(
    { entities: [entity('central', { availability: 0 }), entity('n1'), entity('n2'), entity('n3'), entity('n4'),
      entity('mod', { availability: 0 }), entity('rich', { objectiveValue: 850000 })],
      relations: [relation('r1', 'central', 'n1', 'depends'), relation('r2', 'central', 'n2', 'depends'),
        relation('r3', 'central', 'n3', 'depends'), relation('r4', 'central', 'n4', 'depends'),
        relation('r5', 'mod', 'rich', 'depends')] },
    [HOLD, action('b-restore-central', 'RESTORE', 'central'), action('c-restore-mod', 'RESTORE', 'mod')],
    'c-restore-mod', 'centrality must not decide',
  );
});

test('G protecting a valuable dependency beats protecting an irrelevant hub', () => {
  expectPick(
    { entities: [entity('hub', { risk: 400000, protectionNeed: 300000 }), entity('h1'), entity('h2'),
      entity('vdep', { risk: 1000000, protectionNeed: 1000000 }), entity('obj', { objectiveValue: 700000 })],
      relations: [relation('r1', 'hub', 'h1', 'depends'), relation('r2', 'hub', 'h2', 'depends'), relation('r3', 'vdep', 'obj', 'depends')] },
    [HOLD, action('b-protect-hub', 'PROTECT', 'hub'), action('c-protect-vdep', 'PROTECT', 'vdep')],
    'c-protect-vdep', 'protection must follow value',
  );
});

test('H restoring a broken high-value path beats reinforcing a redundant one', () => {
  expectPick(
    { entities: [entity('red', { baseCapacity: 0, demand: 400000, restorationCost: 8000 }), entity('redalt'),
      entity('robj', { objectiveValue: 200000 }), entity('broke', { availability: 0, restorationCost: 8000 }),
      entity('bobj', { objectiveValue: 800000 })],
      relations: [relation('r1', 'red', 'robj', 'depends'), relation('r2', 'redalt', 'robj', 'substitutes', 0, 'red'),
        relation('r3', 'broke', 'bobj', 'depends')] },
    [HOLD, action('b-reinforce-red', 'REINFORCE', 'red'), action('c-restore-broke', 'RESTORE', 'broke')],
    'c-restore-broke', 'redundancy must discount',
  );
});

test('I identical topology with different semantics yields different recommendations', () => {
  const topology = (valueA, valueB) => ({
    entities: [entity('p', { availability: 0, restorationCost: 10000 }), entity('q', { availability: 0, restorationCost: 10000 }),
      entity('oa', { objectiveValue: valueA }), entity('ob', { objectiveValue: valueB })],
    relations: [relation('r1', 'p', 'oa', 'depends'), relation('r2', 'q', 'ob', 'depends')],
  });
  const actions = [HOLD, action('b-restore-p', 'RESTORE', 'p'), action('c-restore-q', 'RESTORE', 'q')];
  const left = evaluateValueAwareNexus(topology(900000, 100000), actions);
  const right = evaluateValueAwareNexus(topology(100000, 900000), actions);
  assert.equal(left.recommendedActionId, 'b-restore-p');
  assert.equal(right.recommendedActionId, 'c-restore-q');
  // This is the whole point: same shape, different answer.
  assert.notEqual(left.recommendedActionId, right.recommendedActionId);
});

/* ---------------------------------------------------------------------------
 * The utility decomposition is auditable
 * ------------------------------------------------------------------------- */

test('relational utility is decomposed rather than an opaque scalar', () => {
  const world = { entities: [entity('a', { availability: 0, restorationCost: 30000 }), entity('b', { objectiveValue: 500000 })],
    relations: [relation('r1', 'a', 'b', 'depends')] };
  const scored = scoreRelationalUtility(world, action('x-restore-a', 'RESTORE', 'a'));
  for (const component of STAGE2L13_RELATIONAL_UTILITY_MODEL.components) {
    assert.ok(component in scored, `${component} missing from the decomposition`);
  }
  assert.equal(scored.finalRelationalUtility, scored.relationalBenefit + scored.riskAdjustment - scored.actionCostPenalty);
  assert.equal(scored.objectiveRelevance, 500000);
  assert.equal(scored.actionCostPenalty, 30000);
});

test('the expert is an approximation, not the benchmark evaluator', () => {
  // If it were the oracle its full ranking would match the truth every time.
  let exactRankings = 0;
  let sampled = 0;
  for (const row of evaluation.rows.slice(0, 400)) {
    sampled += 1;
    if (row.remediatedActionId === row.optimalActionId) continue;
    exactRankings += 0;
  }
  assert.ok(sampled > 0);
  // Directly: it is materially better than inherited but well short of perfect.
  assert.ok(certification.blindEvaluation.remediated.accuracy < 0.95,
    'perfect accuracy would suggest the scoring function leaked in');
  assert.ok(certification.blindEvaluation.remediated.accuracy > 0.5);
});

/* ---------------------------------------------------------------------------
 * PHASE 6 — blind evaluation and the improvement floor
 * ------------------------------------------------------------------------- */

test('the improvement floor was declared before holdout and is met', () => {
  assert.equal(STAGE2L13_IMPROVEMENT_FLOOR.minimumAbsoluteAccuracyGainPp, 5.0);
  assert.equal(STAGE2L13_IMPROVEMENT_FLOOR.minimumDecoupledAccuracyGainPp, 5.0);
  assert.ok(certification.blindEvaluation.absoluteImprovementPp >= 5.0);
  assert.ok(certification.blindEvaluation.structureValueDecoupledGainPp >= 5.0);
  assert.equal(certification.expertAccuracyImproved, true);
});

test('remediated Nexus beats inherited Nexus, random, and Prime', () => {
  const blind = certification.blindEvaluation;
  assert.ok(blind.remediated.accuracy > blind.inherited.accuracy);
  assert.ok(blind.remediated.accuracy > blind.randomBaseline);
  assert.equal(blind.remediatedBeatsRandom, true);
  assert.equal(blind.remediatedBeatsPrime, true);
  assert.equal(blind.inherited.accuracy, 0.084395, 'inherited baseline must reproduce Stage 2L.12 exactly');
  assert.equal(blind.primeAccuracy, 0.394602, 'Prime baseline must reproduce Stage 2L.12 exactly');
});

test('the structure/value decoupled region — the measured defect — improves most', () => {
  const decoupled = certification.blindEvaluation.structureValueDecoupled;
  assert.ok(decoupled.cases > 1000);
  assert.ok(decoupled.remediatedAccuracy > decoupled.inheritedAccuracy);
  assert.ok(decoupled.remediatedAccuracy > decoupled.primeAccuracy);
  assert.equal(certification.structureValueDefectReduced, true);
  assert.equal(certification.measuredExpertSemanticDefectReduced, true);
});

test('improvement is broad rather than concentrated in one stratum', () => {
  const profiles = Object.entries(certification.blindEvaluation.byProfile);
  assert.ok(profiles.length >= 8);
  for (const [name, block] of profiles) {
    assert.ok(block.remediatedAccuracy > block.inheritedAccuracy, `${name} did not improve`);
  }
  for (const [name, block] of Object.entries(certification.blindEvaluation.byFamily)) {
    assert.ok(block.remediatedAccuracy > block.inheritedAccuracy, `${name} did not improve`);
  }
});

/* ---------------------------------------------------------------------------
 * PHASE 8 — self-correctness identifiability, Nexus signals only
 * ------------------------------------------------------------------------- */

test('the identifiability analysis sees only Nexus-emitted signals', () => {
  assert.equal(evaluation.analysis.featureSource, 'NEXUS_EMITTED_SIGNALS_ONLY');
  const features = flattenStage2L13Features(evaluation.rows[0]);
  for (const key of Object.keys(features)) assert.ok(key.startsWith('nexus.'), `${key} is not a Nexus signal`);
  for (const banned of ['nexus.abstained', 'context.family', 'context.profile', 'nexus.optimalActionId']) {
    assert.ok(!(banned in features), `${banned} must not be a feature`);
  }
  assert.equal(evaluation.labelLeakage.labelLeakageDetected, false);
  assert.deepEqual(evaluation.labelLeakage.forbiddenInFeatures, []);
});

test('discovery and holdout are disjoint and the split guards hold', () => {
  assert.equal(evaluation.corpus.corpusOverlap, 0);
  assert.equal(evaluation.corpus.calibrationHoldoutSeparate, true);
  assert.throws(() => discoverStage2L13Rule(evaluation.rows.slice(0, 3)), /STAGE2L13_DISCOVERY_SPLIT_VIOLATION/);
});

test('Nexus can now discriminate its own correctness above the permutation null', () => {
  const identifiability = certification.identifiability;
  assert.ok(identifiability.bestNexusEmittedDiscrimination > identifiability.permutationNull.p95);
  assert.equal(identifiability.observedExceedsPermutationP95, true);
  assert.ok(identifiability.bestNexusEmittedSignal.startsWith('nexus.'));
  assert.equal(identifiability.selfCorrectnessIdentifiable, true);
  assert.equal(certification.generalization.generalizes, true);
  assert.ok(certification.generalization.holdoutReliability > certification.generalization.holdoutBaseRate);
});

test('the identifiability analysis is deterministic', () => {
  const rows = evaluation.rows.slice(0, 800);
  assert.equal(sha256(analyzeStage2L13Identifiability(rows, { permutations: 4 })),
    sha256(analyzeStage2L13Identifiability(rows, { permutations: 4 })));
});

/* ---------------------------------------------------------------------------
 * PHASE 9 — delegation under the unchanged inherited gate
 * ------------------------------------------------------------------------- */

test('buckets partition Nexus self-assessment deterministically', () => {
  const parameters = certification.calibration.parameters;
  const base = {
    kind: 'NEXUS_RELATIONAL_UTILITY_V1', semanticFieldsIncompleteCount: 0, semanticCoverage: 1000000,
    perturbationStable: true, remainingBlockerCount: 0, contradictionCount: 0, nexusUtilityMargin: parameters.minUtilityMargin,
  };
  assert.equal(stage2L13NexusBucket(base, parameters), 'NEXUS_CLEAN_HIGH_MARGIN');
  assert.equal(stage2L13NexusBucket({ ...base, nexusUtilityMargin: parameters.minUtilityMargin - 1 }, parameters), 'NEXUS_CLEAN_LOW_MARGIN');
  assert.equal(stage2L13NexusBucket({ ...base, contradictionCount: 1 }, parameters), 'NEXUS_CONTRADICTED');
  assert.equal(stage2L13NexusBucket({ ...base, remainingBlockerCount: 2 }, parameters), 'NEXUS_CHAIN_STILL_BLOCKED');
  assert.equal(stage2L13NexusBucket({ ...base, perturbationStable: false }, parameters), 'NEXUS_UNSTABLE_UNDER_PERTURBATION');
  assert.equal(stage2L13NexusBucket({ ...base, semanticCoverage: 500000 }, parameters), 'NEXUS_SEMANTICS_INCOMPLETE');
  assert.equal(stage2L13NexusBucket({ kind: 'SOMETHING_ELSE' }, parameters), null);
  for (const bucket of STAGE2L13_NEXUS_BUCKETS) assert.ok(bucket in certification.calibration.buckets);
});

test('a structurally ineligible bucket never delegates however well it measures', () => {
  for (const bucket of STAGE2L13_STRUCTURALLY_INELIGIBLE_BUCKETS) {
    const entry = certification.calibration.buckets[bucket];
    assert.equal(entry.structurallyEligible, false);
    assert.equal(entry.delegates, false, `${bucket} must never delegate`);
  }
  const unstable = certification.calibration.buckets.NEXUS_UNSTABLE_UNDER_PERTURBATION;
  if (unstable.reliability !== null) {
    assert.equal(unstable.delegates, false, 'refused on principle, not on measured reliability');
  }
});

test('calibration is derived on discovery only and refuses holdout rows', () => {
  assert.throws(() => deriveStage2L13Calibration(evaluation.rows.slice(0, 5)), /STAGE2L13_DISCOVERY_SPLIT_VIOLATION/);
  assert.equal(certification.calibration.inheritedCalibrationModified, false);
});

test('no delegation is forced and the inherited ceilings hold', () => {
  assert.equal(certification.delegation.delegationForced, false);
  assert.ok(certification.delegation.nexusHarmRate <= STAGE2L13_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(certification.delegation.nexusCorrectPrimeBreakRate <= STAGE2L13_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(certification.delegation.harmCeilingRespected, true);
  assert.equal(certification.delegation.correctPrimeBreakCeilingRespected, true);
});

test('no bucket reaches the inherited delegation floor, so nothing delegates', () => {
  assert.deepEqual(certification.calibration.delegatingBuckets, []);
  assert.equal(certification.delegation.nexusDelegations, 0);
  assert.equal(certification.nexusSafeForSelectiveDelegation, false);
  assert.ok(certification.bestEligibleBucketReliability < STAGE2L13_MIN_BUCKET_RELIABILITY);
  assert.ok(certification.bestEligibleBucketReliability > 0.9, 'and it is close, which is what the qualifier records');
});

/* ---------------------------------------------------------------------------
 * PHASE 11/12 — adversarial semantics and invariance
 * ------------------------------------------------------------------------- */

test('every adversarial and malformed-semantics case fails closed', () => {
  const suite = runStage2L13AdversarialSuite();
  for (const kind of STAGE2L13_ADVERSARIAL_CASES) {
    const entry = suite[kind];
    assert.ok(entry !== undefined, `${kind} missing`);
    assert.equal(entry.threw, false, `${kind} threw instead of failing closed`);
    assert.equal(entry.failedClosed, true, `${kind} did not fail closed`);
    assert.equal(entry.deterministic, true, `${kind} was not deterministic`);
    assert.equal(entry.recommendationIsLegal, true, `${kind} recommended outside the legal set`);
  }
});

test('missing or malformed semantics produce abstention, never invention', () => {
  const suite = runStage2L13AdversarialSuite();
  for (const kind of ['MISSING_VALUE', 'MALFORMED_COST', 'NEGATIVE_RISK']) {
    assert.equal(suite[kind].abstained, true, `${kind} must abstain rather than hallucinate a value`);
  }
});

test('the expert is order-invariant and replay-equivalent', () => {
  assert.equal(evaluation.invariance.orderingInvariant, true);
  assert.equal(evaluation.invariance.replayEquivalent, true);
  assert.equal(evaluation.invariance.rowDigest, evaluation.invariance.replayDigest);
});

test('authority stays R0 and the expert generates no action', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.authorityEscalations, 0);
  const result = evaluateValueAwareNexus(
    { entities: [entity('a', { availability: 0 }), entity('b', { objectiveValue: 400000 })], relations: [relation('r1', 'a', 'b', 'depends')] },
    [HOLD, action('b-restore-a', 'RESTORE', 'a')],
  );
  assert.deepEqual(result.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false });
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.actionGeneration, false);
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

test('the outcome is classified precisely, including why it is not class A', () => {
  assert.equal(certification.nexusRemediationOutcome, 'B_IMPROVED_NOT_SELF_CALIBRATED');
  assert.match(certification.nexusRemediationOutcomeQualifier, /SELF_DISCRIMINATION_DEMONSTRATED_BUT_BELOW_DELEGATION_FLOOR/);
  assert.equal(certification.interpretation.nexusExpertRemediationRequired, false);
  assert.equal(certification.interpretation.nexusConfidenceRemediationRequired, true);
  assert.equal(certification.interpretation.arbiterRemediationRequired, false);
  assert.equal(certification.interpretation.nexusContractRemediationRequired, false);
});

test('the certification is self-consistent and reproducible', () => {
  const { certificationHash, ...body } = certification;
  assert.equal(sha256(body), certificationHash);
  assert.equal(certification.stage, STAGE2L13_STAGE);
  assert.equal(certification.stageKind, 'EXPERT_REMEDIATION_AND_CERTIFICATION');
  assert.equal(certification.stage2l13Certified, true);
  assert.equal(certification.status, 'PASS');
});

test('the stored certification artifact reproduces the recomputed certification', async () => {
  const stored = JSON.parse(await readFile(new URL('../artifacts/stage2l13-value-aware-nexus-relational-utility/stage2l13-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(stored.certificationHash, certification.certificationHash);
  assert.equal(stored.status, 'PASS');
  assert.equal(stored.nexusRemediationOutcome, 'B_IMPROVED_NOT_SELF_CALIBRATED');
});

test('no live ZekNova delta is claimed and portability is not overstated', () => {
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
  assert.match(certification.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
});
