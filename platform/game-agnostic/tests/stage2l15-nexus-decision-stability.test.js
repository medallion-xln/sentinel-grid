/* Stage 2L.15 — Nexus decision stability and confidence-ceiling certification.
 *
 * These tests defend the things that would let a stability stage manufacture a
 * pass: a perturbation that changes the decision problem, a signal that peeks at
 * ground truth, a leaked split, a lowered floor, a swapped statistical method, or
 * a delegation gate that trusts unvalidated stability evidence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE2L15_STAGE,
  STAGE2L15_RELIABILITY_FLOOR,
  STAGE2L15_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L15_BOUND_METHOD,
  STAGE2L15_BOUND_Z,
  STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT,
  STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT,
  STAGE2L15_MINIMUM_DELEGATION_COUNT,
  STAGE2L15_SPLITS,
  STAGE2L15_PERTURBATION_MODEL_ID,
  STAGE2L15_PERTURBATION_FAMILIES,
  STAGE2L15_PERTURBATIONS_PER_CASE,
  STAGE2L15_AVAILABILITY_THRESHOLD,
  STAGE2L15_SIGNAL_INVENTORY,
  STAGE2L15_STABILITY_SIGNALS,
  STAGE2L15_FORBIDDEN_FIELDS,
  STAGE2L15_ADVERSARIAL_CASES,
  STAGE2L15_MAX_CONJUNCTION_WIDTH,
  perturbStage2L15World,
  measureStage2L15Stability,
  stage2L15StructurallyEligible,
  stage2L15StabilityEvidenceUsable,
  buildStage2L15Split,
  buildStage2L15RuleSet,
  evaluateStage2L15Delegation,
  runStage2L15AdversarialSuite,
  falseDiscoveryProbability,
  auroc,
  buildStage2L15Evaluation,
  buildStage2L15PortabilityDigest,
  certifyStage2L15,
} from '../src/lab/stage2l15-nexus-decision-stability.js';
import { evaluateValueAwareNexus } from '../src/lab/stage2l13-value-aware-nexus.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l15-nexus-decision-stability-and-confidence-ceiling');

const evaluation = buildStage2L15Evaluation();
const certification = certifyStage2L15({ evaluation });
const sampleCases = buildStage2L15Split('DEVELOPMENT').slice(0, 40);

/* The rule the calibration actually froze. Probes must be run against this, not
 * against an accept-all stand-in, or the threshold cases prove nothing. */
const frozenRule = evaluation.calibration.delegatingRuleId === null
  ? null
  : buildStage2L15RuleSet().find((rule) => rule.id === evaluation.calibration.delegatingRuleId) ?? null;
const frozenTest = frozenRule === null ? null : frozenRule.test;

/* --------------------------------------------------------------------------
 * Inherited thresholds and method. The constants a failing stage would move.
 * ------------------------------------------------------------------------ */

test('the reliability floor is inherited at 0.99 and never redeclared locally', () => {
  assert.equal(STAGE2L15_RELIABILITY_FLOOR, 0.99);
  assert.equal(certification.freeze.reliabilityFloorLowered, false);
  const source = readFileSync(path.join(root, 'src/lab/stage2l15-nexus-decision-stability.js'), 'utf8');
  const localDeclarations = [...source.matchAll(/STAGE2L15_RELIABILITY_FLOOR\s*=\s*([0-9.]+)/g)];
  assert.equal(localDeclarations.length, 0, 'the floor must be re-exported from Stage 2L.14, not restated');
});

test('the statistical method is Stage 2L.14\'s, unchanged', () => {
  assert.equal(STAGE2L15_BOUND_METHOD, 'WILSON_SCORE_LOWER_BOUND');
  assert.equal(STAGE2L15_BOUND_Z, 1.6449);
  assert.equal(STAGE2L15_CONSERVATIVE_BOUND_REQUIREMENT, 0.95);
  assert.equal(certification.freeze.statisticalMethodInherited, 'WILSON_SCORE_LOWER_BOUND');
});

test('inherited harm ceilings are not loosened', () => {
  assert.equal(STAGE2L15_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(STAGE2L15_MAX_CORRECT_PRIME_BREAK_RATE, 0.01);
  assert.equal(certification.freeze.harmCeilingUnchanged, true);
  assert.equal(certification.freeze.correctPrimeBreakCeilingUnchanged, true);
});

/* --------------------------------------------------------------------------
 * Perturbation legitimacy. A perturbation that changes the problem is not a
 * stability probe.
 * ------------------------------------------------------------------------ */

test('every perturbation family declares its magnitude and its invariants', () => {
  assert.ok(STAGE2L15_PERTURBATION_FAMILIES.length >= 6);
  for (const family of STAGE2L15_PERTURBATION_FAMILIES) {
    assert.equal(typeof family.id, 'string');
    assert.equal(typeof family.rationale, 'string');
    assert.ok(family.maxMagnitudePercent <= 10, `${family.id} exceeds the declared magnitude bound`);
    assert.equal(family.preservesActionSet, true);
    assert.equal(family.preservesObjectiveIdentity, true);
    assert.equal(family.preservesGraphShape, true);
  }
});

test('perturbations preserve the graph, the objective and the action set', () => {
  for (const record of sampleCases.slice(0, 12)) {
    for (const family of STAGE2L15_PERTURBATION_FAMILIES) {
      const perturbed = perturbStage2L15World(record.world, family.id, 0);
      assert.equal(perturbed.entities.length, record.world.entities.length);
      assert.equal(perturbed.relations.length, record.world.relations.length);
      const byId = new Map(record.world.entities.map((entity) => [entity.entityId, entity]));
      for (const entity of perturbed.entities) {
        const original = byId.get(entity.entityId);
        assert.ok(original !== undefined, 'no entity may be invented or dropped');
        assert.equal(entity.objectiveRelevant, original.objectiveRelevant, 'the objective may not move');
      }
      const relationsById = new Map(record.world.relations.map((relation) => [relation.relationId, relation]));
      for (const relation of perturbed.relations) {
        const original = relationsById.get(relation.relationId);
        assert.ok(original !== undefined);
        assert.equal(relation.from, original.from);
        assert.equal(relation.to, original.to);
        assert.equal(relation.kind, original.kind);
      }
    }
  }
});

test('availability perturbation never flips an entity across the operational threshold', () => {
  for (const record of sampleCases.slice(0, 15)) {
    for (const probe of [0, 1]) {
      const perturbed = perturbStage2L15World(record.world, 'AVAILABILITY_JITTER', probe);
      const byId = new Map(record.world.entities.map((entity) => [entity.entityId, entity]));
      for (const entity of perturbed.entities) {
        const wasUp = byId.get(entity.entityId).availability >= STAGE2L15_AVAILABILITY_THRESHOLD;
        const isUp = entity.availability >= STAGE2L15_AVAILABILITY_THRESHOLD;
        assert.equal(wasUp, isUp, 'which entities are down is an invariant, not a perturbable quantity');
      }
      for (const entity of perturbed.entities) {
        assert.ok(entity.availability >= 0 && entity.availability <= 1000000);
      }
    }
  }
});

test('perturbation magnitudes stay inside the declared bound', () => {
  for (const record of sampleCases.slice(0, 12)) {
    const perturbed = perturbStage2L15World(record.world, 'ENTITY_VALUE_JITTER', 0);
    const byId = new Map(record.world.entities.map((entity) => [entity.entityId, entity]));
    for (const entity of perturbed.entities) {
      const base = byId.get(entity.entityId).objectiveValue;
      if (base === 0) continue;
      assert.ok(Math.abs(entity.objectiveValue - base) <= Math.ceil(base * 0.08) + 1,
        `${entity.entityId} moved beyond the 8% bound`);
    }
  }
});

test('the ordering probe is a genuine semantic no-op', () => {
  for (const record of sampleCases.slice(0, 10)) {
    const permuted = perturbStage2L15World(record.world, 'ORDERING_PERMUTATION', 0);
    const original = [...record.world.entities].map((entity) => JSON.stringify(entity)).sort();
    const shuffled = [...permuted.entities].map((entity) => JSON.stringify(entity)).sort();
    assert.deepEqual(shuffled, original, 'reordering must not change any value');
  }
});

test('perturbation is deterministic and never mutates its input', () => {
  const record = sampleCases[0];
  const before = JSON.stringify(record.world);
  const first = perturbStage2L15World(record.world, 'COMBINED_MILD', 0);
  const second = perturbStage2L15World(record.world, 'COMBINED_MILD', 0);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(record.world), before, 'the source world must be untouched');
});

test('the two probes of a family bracket the estimate rather than repeating it', () => {
  const record = sampleCases.find((entry) => entry.world.entities.some((entity) => entity.objectiveValue > 0));
  const up = perturbStage2L15World(record.world, 'ENTITY_VALUE_JITTER', 0);
  const down = perturbStage2L15World(record.world, 'ENTITY_VALUE_JITTER', 1);
  assert.notDeepEqual(up.entities, down.entities);
});

test('an unknown perturbation family is rejected, not silently ignored', () => {
  assert.throws(() => perturbStage2L15World(sampleCases[0].world, 'NOT_A_FAMILY', 0),
    /STAGE2L15_UNKNOWN_PERTURBATION_FAMILY/);
});

test('the perturbation model preserves the decision problem at the declared rate', () => {
  const validation = certification.perturbationModel.validation;
  assert.equal(validation.problemPreservationPass, true);
  assert.ok(validation.problemPreservationRate >= validation.minimumRequired);
  assert.equal(validation.objectiveIdentityPreservedRate, 1);
  assert.equal(validation.graphShapePreservedRate, 1);
});

/* --------------------------------------------------------------------------
 * No ground-truth leakage.
 * ------------------------------------------------------------------------ */

test('stability is computable from expert outputs alone, before correctness is known', () => {
  const record = sampleCases[0];
  const base = evaluateValueAwareNexus(record.world, record.legalActions, { inheritedSignals: false });
  const stability = measureStage2L15Stability(record.world, record.legalActions, base);
  for (const field of STAGE2L15_FORBIDDEN_FIELDS) {
    assert.ok(!Object.hasOwn(stability, field), `${field} must not appear in a stability measurement`);
  }
  assert.equal(stability.perturbationModelId, STAGE2L15_PERTURBATION_MODEL_ID);
});

test('no forbidden field reaches any stability signal on real rows', () => {
  assert.equal(certification.labelLeakageDetected, false);
  assert.deepEqual(certification.labelLeakage.forbiddenInStability, []);
});

test('every inventoried signal is decision-time available and reads no ground truth', () => {
  assert.ok(STAGE2L15_SIGNAL_INVENTORY.length >= 8);
  for (const entry of STAGE2L15_SIGNAL_INVENTORY) {
    assert.equal(entry.deterministic, true);
    assert.equal(entry.decisionTimeAvailable, true);
    assert.equal(entry.readsGroundTruth, false);
    assert.equal(entry.potentialLeakage, false);
  }
});

test('the perturbation seed derives from world content, not from case identity', () => {
  const source = readFileSync(path.join(root, 'src/lab/stage2l15-nexus-decision-stability.js'), 'utf8');
  const fn = source.slice(source.indexOf('function contentSeed'), source.indexOf('function signedFraction'));
  for (const forbidden of ['variant', 'split', 'family', 'profile', 'worldId', 'objectiveType']) {
    assert.ok(!fn.includes(forbidden), `the seed must not depend on ${forbidden}`);
  }
});

/* --------------------------------------------------------------------------
 * Split discipline.
 * ------------------------------------------------------------------------ */

test('the three splits are disjoint by declaration and by measurement', () => {
  assert.equal(Object.keys(STAGE2L15_SPLITS).length, 3);
  assert.ok(STAGE2L15_SPLITS.DEVELOPMENT.to <= STAGE2L15_SPLITS.CALIBRATION.from);
  assert.ok(STAGE2L15_SPLITS.CALIBRATION.to <= STAGE2L15_SPLITS.FINAL_HOLDOUT.from);
  assert.equal(certification.splits.splitsDisjoint, true);
  assert.equal(certification.splits.overlaps.developmentCalibration, 0);
  assert.equal(certification.splits.overlaps.developmentHoldout, 0);
  assert.equal(certification.splits.overlaps.calibrationHoldout, 0);
});

test('delegation refuses rows from any split but the final holdout', () => {
  const row = {
    splitName: 'CALIBRATION',
    signals: { kind: 'NEXUS_RELATIONAL_UTILITY_V1' },
    stability: {},
    structurallyEligible: false,
    movesPrime: false,
    nexusCorrect: false,
    primeCorrect: true,
  };
  for (const splitName of ['CALIBRATION', 'DEVELOPMENT']) {
    assert.throws(
      () => evaluateStage2L15Delegation([{ ...row, splitName }], evaluation.calibration, () => true),
      /STAGE2L15_HOLDOUT_SPLIT_VIOLATION/,
    );
  }
});

test('an unknown split name is rejected', () => {
  assert.throws(() => buildStage2L15Split('NOT_A_SPLIT'), /STAGE2L15_UNKNOWN_SPLIT/);
});

/* --------------------------------------------------------------------------
 * The rule set stays auditable.
 * ------------------------------------------------------------------------ */

test('no rule exceeds the declared conjunction width', () => {
  const rules = buildStage2L15RuleSet();
  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.ok(rule.width <= STAGE2L15_MAX_CONJUNCTION_WIDTH, `${rule.id} is wider than ${STAGE2L15_MAX_CONJUNCTION_WIDTH} signals`);
    assert.ok(['EXISTING', 'STABILITY', 'COMBINED'].includes(rule.cls));
  }
  assert.equal(rules.length, certification.calibration.ruleCount);
});

test('every rule is a readable inequality, not a fitted model', () => {
  for (const rule of buildStage2L15RuleSet()) {
    assert.match(rule.id, /^[A-Za-z0-9_ >=<&.]+$/);
  }
});

/* --------------------------------------------------------------------------
 * Fail-closed handling of stability evidence.
 * ------------------------------------------------------------------------ */

const usableStability = (overrides = {}) => ({
  stabilitySchema: 'NEXUS_DECISION_STABILITY_V1',
  perturbationModelId: STAGE2L15_PERTURBATION_MODEL_ID,
  nexusTopActionStability: 1000000, nexusTop2Stability: 1000000, nexusRankingStability: 1000000,
  nexusUtilityVariance: 0, nexusMarginVariance: 0, nexusSemanticStability: 1000000,
  nexusRelationSupportStability: 1000000, nexusCounterfactualAgreement: 1000000,
  nexusAbstentionStability: 1000000, ...overrides,
});

test('well-formed stability evidence is usable', () => {
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability()), true);
});

test('unknown schema, stale model and out-of-domain values are all refused', () => {
  assert.equal(stage2L15StabilityEvidenceUsable(null), false);
  assert.equal(stage2L15StabilityEvidenceUsable(undefined), false);
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability({ stabilitySchema: 'OTHER_V9' })), false);
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability({ perturbationModelId: 'STAGE2L14_ROBUSTNESS_V1' })), false);
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability({ nexusMarginVariance: -1 })), false);
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability({ nexusTopActionStability: 10000000 })), false);
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability({ nexusMarginVariance: Number.NaN })), false);
  assert.equal(stage2L15StabilityEvidenceUsable(usableStability({ nexusMarginVariance: 0.5 })), false);
});

test('the expert disclaiming its own basis is structurally ineligible', () => {
  const clean = (overrides = {}) => ({
    kind: 'NEXUS_RELATIONAL_UTILITY_V1', abstained: false, semanticCoverage: 1000000,
    semanticFieldsIncompleteCount: 0, perturbationStable: true,
    remainingBlockerCount: 0, contradictionCount: 0, ...overrides,
  });
  assert.equal(stage2L15StructurallyEligible(clean()), true);
  assert.equal(stage2L15StructurallyEligible(null), false);
  assert.equal(stage2L15StructurallyEligible(clean({ kind: 'OTHER' })), false);
  for (const overrides of [
    { abstained: true }, { semanticFieldsIncompleteCount: 1 }, { semanticCoverage: 500000 },
    { perturbationStable: false }, { remainingBlockerCount: 1 }, { contradictionCount: 1 },
  ]) {
    assert.equal(stage2L15StructurallyEligible(clean(overrides)), false);
  }
});

test('every adversarial probe fails closed', () => {
  const suite = runStage2L15AdversarialSuite(evaluation.calibration, frozenTest);
  assert.equal(Object.keys(suite).length, STAGE2L15_ADVERSARIAL_CASES.length);
  for (const [name, result] of Object.entries(suite)) {
    assert.equal(result.failsClosed, true, `${name} did not fail closed`);
  }
  assert.equal(certification.securityRegressionPass, true);
});

test('stale Stage 2L.14 robustness evidence never satisfies this stage\'s gate', () => {
  const suite = runStage2L15AdversarialSuite(evaluation.calibration, frozenTest);
  assert.equal(suite.STALE_STABILITY_EVIDENCE.delegates, false);
  assert.equal(suite.UNKNOWN_STABILITY_SCHEMA.delegates, false);
  assert.equal(suite.ILLEGAL_PERTURBED_STATE.delegates, false);
  assert.equal(suite.CROSS_RUNTIME_STABILITY_EVIDENCE.delegates, false);
});

/* --------------------------------------------------------------------------
 * Measurement helpers.
 * ------------------------------------------------------------------------ */

test('AUROC is 0.5 on a degenerate label set and ordered otherwise', () => {
  assert.equal(auroc([{ nexusCorrect: true }], () => 1), 0.5);
  const rows = [
    { nexusCorrect: false, v: 1 }, { nexusCorrect: false, v: 2 },
    { nexusCorrect: true, v: 3 }, { nexusCorrect: true, v: 4 },
  ];
  assert.equal(auroc(rows, (row) => row.v), 1);
  assert.equal(auroc(rows, (row) => -row.v), 0);
});

test('the false-discovery calculation prices the multiplicity honestly', () => {
  assert.equal(falseDiscoveryProbability(0, 0.98, 0.99), 0);
  const at98 = falseDiscoveryProbability(111, 0.98, 0.99);
  assert.ok(at98 > 0.2 && at98 < 0.5, `expected a substantial chance, got ${at98}`);
  /* More evidence must make a false discovery less likely, not more. */
  assert.ok(falseDiscoveryProbability(1000, 0.98, 0.99) < at98);
});

test('the stability battery runs the declared number of probes', () => {
  const record = sampleCases[0];
  const base = evaluateValueAwareNexus(record.world, record.legalActions, { inheritedSignals: false });
  const stability = measureStage2L15Stability(record.world, record.legalActions, base);
  assert.equal(stability.probeCount, STAGE2L15_PERTURBATIONS_PER_CASE);
  for (const [signal] of STAGE2L15_STABILITY_SIGNALS) {
    assert.ok(Number.isInteger(stability[signal]), `${signal} must be an integer in micro-units`);
    assert.ok(stability[signal] >= 0 && stability[signal] <= 1000000);
  }
});

test('the expert is order invariant, so the no-op probe is a real check', () => {
  assert.equal(certification.invariance.orderingInvariant, true);
});

/* --------------------------------------------------------------------------
 * Certification gates and outcome.
 * ------------------------------------------------------------------------ */

test('certification requires every gate', () => {
  const gates = [
    'perturbationModelValid', 'stabilityInformationPass', 'reliabilityPass',
    'conservativeReliabilityBoundPass', 'minimumDelegationSupportPass', 'utilityPass',
    'harmCeilingPass', 'primeProtectionPass', 'securityRegressionPass',
  ];
  const allPass = gates.every((gate) => certification[gate] === true);
  assert.equal(certification.stage2l15Certified,
    allPass && !certification.labelLeakageDetected && certification.splits.splitsDisjoint);
  assert.equal(certification.status, certification.stage2l15Certified ? 'PASS' : 'FAIL');
});

test('a delegation below the inherited floor cannot pass the reliability gate', () => {
  if (certification.delegation.nexusDelegations > 0
    && certification.delegation.nexusDelegationPrecision < STAGE2L15_RELIABILITY_FLOOR) {
    assert.equal(certification.reliabilityPass, false);
    assert.equal(certification.stage2l15Certified, false);
  }
});

test('zero delegation could never certify safe delegation', () => {
  if (certification.delegation.nexusDelegations === 0) {
    assert.equal(certification.utilityPass, false);
    assert.equal(certification.reliabilityPass, false);
  }
});

test('the outcome class is one of the declared classes', () => {
  assert.ok([
    'A_SAFE_DELEGATION_CERTIFIED', 'B_STABILITY_IMPROVES_CONFIDENCE_BUT_BELOW_FLOOR',
    'C_STABILITY_ADDS_NO_USEFUL_INFORMATION', 'D_RELIABLE_REGION_TOO_SMALL',
    'E_CONFIDENCE_CEILING_CONFIRMED_BELOW_099',
  ].includes(certification.nexusStabilityOutcome));
  if (certification.nexusStabilityOutcome === 'A_SAFE_DELEGATION_CERTIFIED') {
    assert.equal(certification.stage2l15Certified, true);
  }
});

test('the Prime baseline is the inherited certified path, matching Stage 2L.14', () => {
  /* Stage 2L.14 measured Prime at 0.399512 on this same holdout. A different
   * figure here would mean a different Prime, and every uplift would be fiction. */
  assert.equal(certification.delegation.primeOnlyAccuracy, 0.399512);
});

test('harm accounting is internally consistent', () => {
  const d = certification.delegation;
  assert.equal(d.correctPrimeBreaks, d.harmfulChanges);
  assert.equal(d.beneficialChanges + d.harmfulChanges <= d.nexusDelegations, true);
  assert.ok(d.harmfulOpportunitiesRejected <= d.harmfulOpportunities);
  assert.equal(d.delegationForced, false);
  assert.equal(d.reliabilityFloorLowered, false);
});

test('the confidence ceiling is reported conservatively, not as the point estimate', () => {
  const ceiling = certification.confidenceCeiling;
  assert.equal(ceiling.estimatedConfidenceCeiling, ceiling.lowerBoundAtHighestReliability);
  assert.ok(ceiling.estimatedConfidenceCeiling <= ceiling.highestSupportedReliability);
  assert.ok(ceiling.supportAtHighestReliability >= STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT);
  assert.ok(['RESIDUAL_EXPERT_ERROR', 'CONFIDENCE_SIGNAL_LIMITATION', 'SAMPLE_SUPPORT_LIMITATION',
    'NON_STATIONARY_BUCKET', 'OTHER'].includes(ceiling.ceilingLimitationClass));
});

test('what the inherited criterion alone would have selected is disclosed in full', () => {
  const candidates = certification.calibration.inheritedCriterionCandidates;
  assert.equal(candidates.length, certification.calibration.meetsInheritedCriterionCount);
  for (const candidate of candidates) {
    assert.ok(candidate.calibration.n >= STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT);
    assert.ok(candidate.calibration.precision >= STAGE2L15_RELIABILITY_FLOOR);
    assert.equal(typeof candidate.rejectedByCrossSplitGuard, 'boolean');
    assert.ok(Object.hasOwn(candidate, 'development'), 'the development measurement must be shown alongside');
  }
});

test('safety posture is unchanged: R0, shadow only, Prime owns the recommendation', () => {
  assert.equal(certification.stage, STAGE2L15_STAGE);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.arbiterShadowOnly, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
});

test('this stage changed neither the expert, the benchmark nor the arbiter', () => {
  assert.equal(certification.freeze.nexusExpertChanged, false);
  assert.equal(certification.freeze.nexusRecommendationSemanticsChanged, false);
  assert.equal(certification.freeze.benchmarkUnchanged, true);
  assert.equal(certification.freeze.groundTruthUnchanged, true);
  assert.equal(certification.freeze.arbiterChanged, false);
});

test('the inherited portability limitation is recorded, not remediated', () => {
  assert.match(certification.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
  const report = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l15-portability-report.json'), 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

/* --------------------------------------------------------------------------
 * Determinism and stored evidence.
 * ------------------------------------------------------------------------ */

test('the certification is byte-stable across an independent rebuild', () => {
  const again = certifyStage2L15({ evaluation: buildStage2L15Evaluation() });
  assert.equal(again.certificationHash, certification.certificationHash);
  assert.equal(again.evidenceDigest, certification.evidenceDigest);
  assert.equal(certification.stabilityModelDeterministic, true);
});

test('the portability witness is a function of the certification alone', () => {
  assert.equal(
    buildStage2L15PortabilityDigest(certification).digest,
    buildStage2L15PortabilityDigest(certification).digest,
  );
});

test('the stored certification artifact matches the recomputed one', () => {
  const stored = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l15-certification-result.json'), 'utf8'));
  assert.equal(stored.certificationHash, certification.certificationHash);
  assert.equal(stored.status, certification.status);
  assert.equal(stored.nexusStabilityOutcome, certification.nexusStabilityOutcome);
});

test('the minimum delegation support threshold is inherited and non-trivial', () => {
  assert.ok(STAGE2L15_MINIMUM_DELEGATION_COUNT >= 50);
  assert.ok(STAGE2L15_MINIMUM_ELIGIBLE_CASE_COUNT >= 100);
});
