import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
  remediatedDeterministicArbiter,
} from '../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';
import {
  STAGE2L9_ADVERSARIAL_CASES,
  STAGE2L9_ADVERSARIAL_CONTROLS,
  STAGE2L9_ARBITER_RULE_DIGEST,
  STAGE2L9_CONTROL_GROUPS,
  STAGE2L9_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L9_MARGIN_BANDS,
  STAGE2L9_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L9_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L9_MIN_CASES,
  STAGE2L9_STAGE,
  STAGE2L9_STAGE2L7_OWNER_SHA256,
  STAGE2L9_STAGE2L8_OWNER_SHA256,
  buildAdversarialCase,
  buildControlCase,
  buildNexusOnlyCase,
  buildOracleOnlyCase,
  buildStage2L9Evaluation,
  buildStage2L9PortabilityDigest,
  certifyStage2L9,
  measureOracleClassification,
  runStage2L9FailureIsolation,
  runStage2L9Invariance,
  stage2L9GroundTruth,
} from '../src/lab/stage2l9-single-expert-delegation-precision-bound.js';

const evaluation = buildStage2L9Evaluation();
const certification = certifyStage2L9({ evaluation });

/* ---------------------------------------------------------------------------
 * Freeze
 * ------------------------------------------------------------------------- */

test('Stage 2L.8 and Stage 2L.7 owners remain byte-for-byte frozen', async () => {
  const l8 = await readFile(new URL('../src/lab/stage2l8-remediated-arbiter-independent-red-team-replication.js', import.meta.url));
  const l7 = await readFile(new URL('../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js', import.meta.url));
  assert.equal(createHash('sha256').update(l8).digest('hex'), STAGE2L9_STAGE2L8_OWNER_SHA256);
  assert.equal(createHash('sha256').update(l7).digest('hex'), STAGE2L9_STAGE2L7_OWNER_SHA256);
});

test('rule table, fail-closed matrix and ambiguity rule are unchanged', () => {
  assert.equal(STAGE2L7_ARBITER_RULE_DIGEST, STAGE2L9_ARBITER_RULE_DIGEST);
  assert.equal(STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST, STAGE2L9_FAIL_CLOSED_MATRIX_DIGEST);
  assert.equal(STAGE2L7_PRIME_AMBIGUITY_THRESHOLD, 0.03);
  assert.equal(certification.arbiterChanged, false);
  assert.equal(certification.arbiterRuleTableChanged, false);
  assert.equal(certification.primeAmbiguityRuleChanged, false);
  assert.equal(certification.oracleEligibilityChanged, false);
});

/* ---------------------------------------------------------------------------
 * Corpus
 * ------------------------------------------------------------------------- */

test('corpus is fresh, large enough, and fully partitioned', () => {
  assert.ok(evaluation.corpus.cases >= STAGE2L9_MIN_CASES);
  assert.equal(evaluation.corpus.effectiveSemanticGroups, evaluation.corpus.cases);
  assert.equal(evaluation.corpus.semanticFamilyLeakage, false);
  assert.equal(evaluation.corpus.corpusOverlap, 0);
  assert.ok(evaluation.corpus.oracleCases >= 7000);
  assert.ok(evaluation.corpus.nexusCases >= 7000);
});

test('ground truth is independent of expert and arbiter output', () => {
  const first = stage2L9GroundTruth(987654);
  const second = stage2L9GroundTruth(987654);
  assert.deepEqual(first, second);
  assert.equal(first.generator, 'STAGE2L9_INDEPENDENT_GROUND_TRUTH_V1');
  assert.equal(certification.corpus.groundTruthIndependentOfExpertOutput, true);
  assert.equal(certification.corpus.groundTruthIndependentOfArbiterOutput, true);
});

test('expert fallibility is measured from the real experts, not injected', () => {
  // A zero-drift oscillation is STABLE by construction; Oracle V2 genuinely misreads it.
  const flat = measureOracleClassification('probe-flat', { name: 'EXACT_FLAT', drift: 0, noise: 0, truth: 'STABLE' }, 0);
  const oscillation = measureOracleClassification('probe-osc', { name: 'ZERO_DRIFT_OSCILLATION', drift: 0, noise: 0.03, truth: 'STABLE' }, 0);
  assert.equal(flat.correct, true);
  assert.equal(oscillation.correct, false);
  assert.ok(evaluation.expertPrecision.oracleClassificationAccuracy > 0 && evaluation.expertPrecision.oracleClassificationAccuracy < 1);
});

/* ---------------------------------------------------------------------------
 * Single-expert isolation
 * ------------------------------------------------------------------------- */

test('single-expert isolation holds in both directions', () => {
  assert.equal(evaluation.bounds.oracleSelectionInfluenceFromNexus, 0);
  assert.equal(evaluation.bounds.nexusSelectionInfluenceFromOracle, 0);
  assert.equal(certification.singleExpertIsolated, true);
  for (const row of evaluation.rows.filter((entry) => entry.stratum === 'ORACLE_ONLY_RELEVANT' && entry.changed)) {
    assert.deepEqual(row.acceptedExperts, ['ORACLE'], row.caseId);
  }
  for (const row of evaluation.rows.filter((entry) => entry.stratum === 'NEXUS_ONLY_RELEVANT' && entry.changed)) {
    assert.deepEqual(row.acceptedExperts, ['NEXUS'], row.caseId);
  }
});

/* ---------------------------------------------------------------------------
 * Precision, defined exactly as the stage defines it
 * ------------------------------------------------------------------------- */

test('precision is beneficial expert-driven changes over all expert-driven changes', () => {
  for (const metrics of [evaluation.oracle, evaluation.nexus]) {
    const recomputed = metrics.selectionChanges === 0 ? 0 : metrics.beneficialChanges / metrics.selectionChanges;
    assert.ok(Math.abs(metrics.precision - recomputed) < 1e-6);
    assert.equal(metrics.beneficialChanges + metrics.harmfulChanges + metrics.neutralChanges, metrics.selectionChanges);
  }
});

test('recall is reported separately from precision', () => {
  assert.ok(evaluation.oracle.repairRate >= 0 && evaluation.oracle.repairRate <= 1);
  assert.ok(evaluation.nexus.repairRate >= 0 && evaluation.nexus.repairRate <= 1);
  assert.notEqual(evaluation.oracle.repairRate, evaluation.oracle.precision);
});

/* ---------------------------------------------------------------------------
 * The measured precision boundary
 * ------------------------------------------------------------------------- */

test('the Arbiter discriminates relevance perfectly', () => {
  assert.equal(evaluation.discrimination.relevanceDiscriminationPerfect, true);
  assert.equal(evaluation.bounds.trueButIrrelevantOracleSelectionChanges, 0);
  assert.equal(evaluation.bounds.trueButIrrelevantNexusSelectionChanges, 0);
  const matrix = evaluation.delegationMatrix.relevanceAxis;
  assert.equal(matrix.ORACLE.IRRELEVANT.selectionChanges, 0);
  assert.equal(matrix.NEXUS.IRRELEVANT.selectionChanges, 0);
});

test('the Arbiter does NOT discriminate expert correctness', () => {
  // Conditioned on a real delegation opportunity, the delegation rate is
  // indistinguishable between a correct and an incorrect expert.
  assert.ok(Math.abs(evaluation.discrimination.oracleCorrectnessDiscrimination) < 0.02);
  assert.ok(Math.abs(evaluation.discrimination.nexusCorrectnessDiscrimination) < 0.02);
  assert.ok(evaluation.discrimination.oracleDelegationOpportunities > 1000);
  assert.ok(evaluation.discrimination.nexusDelegationOpportunities > 1000);
  // Wrong experts therefore still get delegated to, and produce harm.
  assert.ok(evaluation.delegationMatrix.correctnessAxis.ORACLE.WRONG.harmfulChanges > 0);
  assert.ok(evaluation.delegationMatrix.correctnessAxis.NEXUS.WRONG.harmfulChanges > 0);
  assert.equal(evaluation.delegationMatrix.correctnessAxis.ORACLE.CORRECT.harmfulChanges, 0);
  assert.equal(evaluation.delegationMatrix.correctnessAxis.NEXUS.CORRECT.harmfulChanges, 0);
});

test('the inherited harmful-change bound is breached, and the breach is reported honestly', () => {
  // This stage FAILS on the inherited bound. The assertion records the measured
  // fact rather than asserting the bound holds.
  assert.ok(evaluation.bounds.arbiterHarmfulChangeRate > STAGE2L9_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(evaluation.bounds.arbiterCorrectPrimeBreakRate > STAGE2L9_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(evaluation.boundsPass, false);
  assert.equal(certification.status, 'FAIL');
  assert.equal(certification.stage2l9Certified, false);
});

/* ---------------------------------------------------------------------------
 * Margin, action and confidence stratification
 * ------------------------------------------------------------------------- */

test('margin bands are covered and the ambiguity gate holds above threshold', () => {
  for (const band of STAGE2L9_MARGIN_BANDS) assert.ok(band in evaluation.marginCurve, band);
  assert.equal(evaluation.marginCurve.Q_MARGIN_GT_0_030.selectionChanges, 0);
  assert.equal(evaluation.bounds.nonAmbiguousPrimeCasesChanged, 0);
});

test('harm is localized to specific expert regimes', () => {
  const regimes = evaluation.actionSpecific.byRegime;
  // Every clean Oracle regime delegates with perfect precision.
  for (const regime of ['STRONG_RISE', 'STRONG_FALL', 'WEAK_RISE', 'WEAK_FALL', 'EXACT_FLAT']) {
    assert.equal(regimes[regime].harmfulChanges, 0, regime);
    assert.equal(regimes[regime].precision, 1, regime);
  }
  // All Oracle harm comes from the one regime Oracle genuinely misreads.
  assert.ok(regimes.ZERO_DRIFT_OSCILLATION.harmfulChanges > 0);
  assert.equal(regimes.ZERO_DRIFT_OSCILLATION.beneficialChanges, 0);
  // A redundant relational path removes SPOF status, so Nexus stays silent.
  assert.equal(regimes.REDUNDANT_PATH.selectionChanges, 0);
});

test('expert confidence is measured and is not monotonic with correctness', () => {
  const curve = evaluation.confidenceCurve;
  const populated = Object.values(curve).filter((bucket) => bucket.cases > 0);
  assert.ok(populated.length >= 3);
  // A mid-confidence band exists whose accuracy is far below neighbouring bands,
  // which is why a simple confidence threshold cannot be the remediation.
  const accuracies = populated.map((bucket) => bucket.expertAccuracy);
  assert.ok(Math.max(...accuracies) - Math.min(...accuracies) > 0.3);
});

/* ---------------------------------------------------------------------------
 * Controls and fail-closed
 * ------------------------------------------------------------------------- */

test('every control group is measured and none is moved by expert presence alone', () => {
  for (const group of STAGE2L9_CONTROL_GROUPS) {
    assert.ok(group in evaluation.controls, group);
    assert.equal(evaluation.controls[group].harmfulChanges, 0, group);
  }
  assert.equal(evaluation.controls.PRIME_ONLY_CONTROL.selectionChanges, 0);
  assert.equal(evaluation.controls.NO_EXPERT_INFORMATION_CONTROL.selectionChanges, 0);
  assert.equal(evaluation.controls.BOTH_WRONG_CONTROL.selectionChanges, 0);
  assert.equal(evaluation.bounds.bothWrongHarmfulChanges, 0);
});

test('every adversarial single-expert control fails closed', () => {
  for (const control of STAGE2L9_ADVERSARIAL_CONTROLS) {
    const entry = evaluation.adversarial[control];
    assert.equal(entry.cases, STAGE2L9_ADVERSARIAL_CASES, control);
    assert.equal(entry.evidenceAccepted, 0, control);
    assert.equal(entry.selectionChanges, 0, control);
    assert.equal(entry.failClosed, STAGE2L9_ADVERSARIAL_CASES, control);
  }
});

/* ---------------------------------------------------------------------------
 * Causality, invariance, replay
 * ------------------------------------------------------------------------- */

test('every selection change is causally attributed to one accepted packet', () => {
  assert.equal(evaluation.bounds.allSingleExpertChangesCausallyAttributed, true);
  for (const row of evaluation.rows.filter((entry) => entry.changed)) {
    assert.equal(row.evidenceAccepted, 1, row.caseId);
    assert.equal(row.selectedAction, row.supportedAction, row.caseId);
  }
});

test('ordering invariance, duplicate non-amplification and conflict fail-closed hold', () => {
  const invariance = runStage2L9Invariance();
  assert.equal(invariance.legalActionOrderInvariant, true);
  assert.equal(invariance.expertEvidenceOrderInvariant, true);
  assert.equal(invariance.nexusEntityOrderInvariant, true);
  assert.equal(invariance.nexusEdgeOrderInvariant, true);
  assert.equal(invariance.duplicateEvidenceDoesNotAmplifySupport, true);
  assert.equal(invariance.conflictingDuplicateFailsClosed, true);
});

test('injected failures return Prime and authorize nothing', () => {
  const isolation = runStage2L9FailureIsolation();
  assert.equal(isolation.arbiterFailureReturnsPrime, true);
  assert.equal(isolation.validatorFailureReturnsPrime, true);
  assert.equal(isolation.oracleFailureSafe, true);
  assert.equal(isolation.nexusFailureSafe, true);
  assert.equal(isolation.noExpertAuthorizedAction, true);
});

test('replay is bit-exact and certification reproduces', () => {
  assert.equal(evaluation.replay.replayEquivalent, true);
  assert.equal(evaluation.replay.rowDigest, evaluation.replay.replayDigest);
  assert.equal(certifyStage2L9({ evaluation }).certificationHash, certification.certificationHash);
  const { certificationHash, ...body } = certification;
  assert.ok(!JSON.stringify(body).includes(certificationHash));
});

/* ---------------------------------------------------------------------------
 * Authority
 * ------------------------------------------------------------------------- */

test('the whole stage stays shadow-only at R0', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.arbiterShadowOnly, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.tokenIssues, 0);
  assert.equal(certification.arbiterSelectionInfluenceActual, 0);
  assert.equal(certification.oracleSelectionInfluenceActual, 0);
  assert.equal(certification.nexusSelectionInfluenceActual, 0);
});

test('no arbiter output generates, dispatches or mutates', () => {
  const sample = [buildOracleOnlyCase(3), buildNexusOnlyCase(3), buildControlCase('BOTH_WRONG_CONTROL', 3), buildAdversarialCase('SE_ILLEGAL_ACTION', 3)];
  for (const record of sample) {
    const result = remediatedDeterministicArbiter(record.input);
    assert.equal(result.actionGenerated, false);
    assert.equal(result.dispatch, false);
    assert.equal(result.worldMutation, false);
    assert.equal(result.shadowOnly, true);
    assert.equal(result.primaryDecisionEngine, 'PRIME');
    if (result.counterfactualFinalRecommendation !== null) {
      const legal = record.input.prime.rankedLegalActions.map((entry) => entry.actionId);
      assert.ok(legal.includes(result.counterfactualFinalRecommendation));
    }
  }
});

test('no ZekNova, readiness or promotion claim is recorded', () => {
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
  assert.equal(certification.zeknovaGameplayImprovementClaimed, false);
  assert.equal(certification.productionReadinessClaimed, false);
  assert.equal(certification.authorityPromoted, false);
  assert.equal(certification.stage, STAGE2L9_STAGE);
});

test('portability digest is stable within this platform', () => {
  const first = buildStage2L9PortabilityDigest(certification);
  assert.equal(buildStage2L9PortabilityDigest(certification).digest, first.digest);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});
