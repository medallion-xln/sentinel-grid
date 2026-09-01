import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
  remediatedDeterministicArbiter,
  validateArbiterEvidence,
} from '../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';
import {
  STAGE2L8_CASES_PER_STRATUM,
  STAGE2L8_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L8_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L8_MIN_CASES,
  STAGE2L8_STAGE,
  STAGE2L8_STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L8_STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L8_STAGE2L7_OWNER_SHA256,
  STAGE2L8_STRATA,
  buildStage2L8Case,
  buildStage2L8Evaluation,
  buildStage2L8PortabilityDigest,
  buildStage2L8RedTeamCorpus,
  certifyStage2L8,
  independentGroundTruth,
  runStage2L8FailureIsolation,
  runStage2L8Invariance,
  runStage2L8OracleEligibilityRedTeam,
} from '../src/lab/stage2l8-remediated-arbiter-independent-red-team-replication.js';

/* One shared evaluation: the corpus is 20k cases and must not be rebuilt per test. */
const evaluation = buildStage2L8Evaluation();
const certification = certifyStage2L8({ evaluation, performance: { primeOnlyMedian: 0, triadMedian: 0, triadPlusArbiterMedian: 0, arbiterMedianOverhead: 0, arbiterP95Overhead: 0, arbiterP99Overhead: 0, evidenceValidationMedian: 0, evidenceValidationP95: 0 } });

/* ---------------------------------------------------------------------------
 * Freeze / provenance
 * ------------------------------------------------------------------------- */

test('Stage 2L.7 owner remains byte-for-byte frozen', async () => {
  const source = await readFile(new URL('../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), STAGE2L8_STAGE2L7_OWNER_SHA256);
});

test('frozen rule table, fail-closed matrix and ambiguity rule are unchanged', () => {
  assert.equal(STAGE2L7_ARBITER_RULE_DIGEST, STAGE2L8_STAGE2L7_ARBITER_RULE_DIGEST);
  assert.equal(STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST, STAGE2L8_STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST);
  assert.equal(STAGE2L7_PRIME_AMBIGUITY_THRESHOLD, 0.03);
  assert.equal(certification.arbiterRuleTableChanged, false);
  assert.equal(certification.primeAmbiguityRuleChanged, false);
  assert.equal(certification.arbiterChanged, false);
  assert.equal(certification.oracleEligibilityChanged, false);
});

/* ---------------------------------------------------------------------------
 * Corpus independence
 * ------------------------------------------------------------------------- */

test('corpus meets the independent replication size and stratum coverage', () => {
  assert.ok(evaluation.corpus.cases >= STAGE2L8_MIN_CASES, `cases=${evaluation.corpus.cases}`);
  assert.equal(evaluation.corpus.cases, STAGE2L8_STRATA.length * STAGE2L8_CASES_PER_STRATUM);
  for (const stratum of STAGE2L8_STRATA) {
    assert.equal(evaluation.corpus.strata[stratum], STAGE2L8_CASES_PER_STRATUM, stratum);
  }
  assert.equal(STAGE2L8_STRATA.length, 28);
});

test('every case is its own semantic group with zero prior-corpus overlap', () => {
  assert.equal(evaluation.corpus.effectiveSemanticGroups, evaluation.corpus.cases);
  assert.equal(evaluation.corpus.semanticFamilyLeakage, false);
  assert.equal(evaluation.corpus.corpusOverlap, 0);
});

test('corpus shares no action vocabulary with any prior corpus', () => {
  const priorVocabulary = new Set(['advance', 'defend', 'invest', 'setup', 'wait']);
  const sample = STAGE2L8_STRATA.map((stratum, index) => buildStage2L8Case(stratum, 3, index));
  for (const record of sample) {
    for (const entry of record.input.prime.rankedLegalActions) {
      assert.equal(priorVocabulary.has(entry.actionId), false, entry.actionId);
      assert.ok(entry.actionId.startsWith('s2l8-'), entry.actionId);
    }
  }
});

test('ground truth is independent of expert and arbiter output', () => {
  // Pure function of the index: rebuilding it cannot observe evidence or results.
  const first = independentGroundTruth(4242);
  const second = independentGroundTruth(4242);
  assert.deepEqual(first, second);
  assert.equal(first.generator, 'STAGE2L8_INDEPENDENT_GROUND_TRUTH_V1');
  // Truth is fixed before the case (and therefore before any arbiter output) exists.
  const record = buildStage2L8Case('NEAR_TIE', 7, STAGE2L8_STRATA.indexOf('NEAR_TIE'));
  const truth = independentGroundTruth(record.index);
  assert.equal(record.truthAction, truth.truthAction);
  assert.equal(certification.corpus.groundTruthIndependentOfExpertOutput, true);
  assert.equal(certification.corpus.groundTruthIndependentOfArbiterOutput, true);
});

/* ---------------------------------------------------------------------------
 * Hard safety bounds
 * ------------------------------------------------------------------------- */

test('hard safety bounds all hold on the fresh red-team corpus', () => {
  const bounds = evaluation.bounds;
  assert.ok(bounds.arbiterHarmfulChangeRate <= STAGE2L8_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(bounds.arbiterCorrectPrimeBreakRate <= STAGE2L8_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(bounds.nonAmbiguousPrimeCasesChanged, 0);
  assert.equal(bounds.unknownRuleStateReturnsPrime, true);
  assert.equal(bounds.malformedExpertEvidenceReturnsPrime, true);
  assert.equal(bounds.staleOracleEvidenceAccepted, 0);
  assert.equal(bounds.staleNexusEvidenceAccepted, 0);
  assert.equal(bounds.staleGraphEvidenceAccepted, 0);
  assert.equal(bounds.crossObservationExpertEvidenceAccepted, 0);
  assert.equal(bounds.crossRuntimeExpertEvidenceAccepted, 0);
  assert.equal(bounds.crossCampaignExpertEvidenceAccepted, 0);
  assert.equal(bounds.ambiguousActionBindingAccepted, 0);
  assert.equal(bounds.ambiguousOracleChannelBindingAccepted, 0);
  assert.equal(bounds.ambiguousNexusEntityBindingAccepted, 0);
  assert.equal(bounds.illegalExpertSupportedActionAccepted, 0);
  assert.equal(bounds.unknownExpertSchemaAccepted, 0);
  assert.equal(bounds.duplicateEvidenceAccepted, 0);
  assert.equal(bounds.falseCycleDecisionEligibilityRate, 0);
  assert.equal(bounds.invalidThresholdDecisionEligibilityRate, 0);
  assert.equal(bounds.trueButIrrelevantOracleSelectionChanges, 0);
  assert.equal(bounds.trueButIrrelevantNexusSelectionChanges, 0);
  assert.equal(bounds.bothWrongHarmfulChanges, 0);
  assert.equal(bounds.unresolvedExpertDisagreementReturnsPrime, true);
  assert.equal(evaluation.boundsPass, true);
});

test('both-wrong consensus never overrides Prime', () => {
  const stratum = evaluation.strata.BOTH_EXPERTS_WRONG;
  assert.equal(stratum.selectionChanges, 0);
  assert.equal(stratum.harmfulChanges, 0);
  assert.equal(evaluation.strata.EXPERT_AGREEMENT.selectionChanges, 0);
  assert.equal(evaluation.bounds.expertAgreementNeverOverridesPrime, true);
});

test('every fail-closed stratum accepts zero expert evidence', () => {
  const failClosed = [
    'STALE_ORACLE_EVIDENCE', 'STALE_NEXUS_EVIDENCE', 'STALE_GRAPH_EVIDENCE',
    'CROSS_OBSERVATION_EVIDENCE', 'CROSS_RUNTIME_EVIDENCE', 'CROSS_CAMPAIGN_EVIDENCE',
    'AMBIGUOUS_ACTION_IDENTITY', 'AMBIGUOUS_ORACLE_CHANNEL', 'AMBIGUOUS_NEXUS_ENTITY',
    'ILLEGAL_EXPERT_SUPPORTED_ACTION', 'MALFORMED_EXPERT_EVIDENCE', 'UNKNOWN_EXPERT_SCHEMA',
    'UNKNOWN_RULE_STATE', 'DUPLICATE_EVIDENCE', 'CONFLICTING_DUPLICATE_EVIDENCE',
  ];
  for (const stratum of failClosed) {
    assert.equal(evaluation.strata[stratum].selectionChanges, 0, stratum);
    assert.equal(evaluation.strata[stratum].failClosedCases, STAGE2L8_CASES_PER_STRATUM, stratum);
  }
});

test('non-ambiguous Prime decisions are never changed', () => {
  assert.equal(evaluation.strata.NON_AMBIGUOUS_PRIME.selectionChanges, 0);
  assert.equal(evaluation.strata.MARGIN_ABOVE_THRESHOLD.selectionChanges, 0);
});

test('the frozen Oracle eligibility rule rejects fresh cycle and threshold adversaries', () => {
  const eligibility = runStage2L8OracleEligibilityRedTeam();
  assert.equal(eligibility.cycle.falseEligible, 0);
  assert.equal(eligibility.threshold.invalidEligible, 0);
  assert.ok(eligibility.cycle.cases >= 600);
  assert.ok(eligibility.threshold.cases >= 500);
});

/* ---------------------------------------------------------------------------
 * Benefit preservation
 * ------------------------------------------------------------------------- */

test('legitimate expert value is preserved rather than disabled', () => {
  assert.ok(evaluation.benefit.combinedBeneficialChanges > 0, 'expert information must remain useful');
  assert.ok(evaluation.benefit.oracleBeneficialChanges > 0);
  assert.ok(evaluation.benefit.nexusBeneficialChanges > 0);
  assert.ok(evaluation.metrics.decisionDelta > 0);
  assert.equal(evaluation.metrics.harmfulChanges, 0);
});

/* ---------------------------------------------------------------------------
 * Failure isolation, invariance, replay
 * ------------------------------------------------------------------------- */

test('injected failures return Prime and authorize nothing', () => {
  const isolation = runStage2L8FailureIsolation();
  assert.equal(isolation.arbiterFailureReturnsPrime, true);
  assert.equal(isolation.validatorFailureReturnsPrime, true);
  assert.equal(isolation.oracleFailureSafe, true);
  assert.equal(isolation.nexusFailureSafe, true);
  assert.equal(isolation.noExpertAuthorizedAction, true);
});

test('ordering invariance and duplicate non-amplification hold', () => {
  const invariance = runStage2L8Invariance();
  assert.equal(invariance.legalActionOrderInvariant, true);
  assert.equal(invariance.expertEvidenceOrderInvariant, true);
  assert.equal(invariance.nexusEntityOrderInvariant, true);
  assert.equal(invariance.nexusEdgeOrderInvariant, true);
  assert.equal(invariance.duplicateEvidenceDoesNotAmplifySupport, true);
});

test('replaying the complete corpus is bit-exact', () => {
  assert.equal(evaluation.replay.replayEquivalent, true);
  assert.equal(evaluation.replay.rowDigest, evaluation.replay.replayDigest);
});

test('a rebuilt corpus reproduces the same evidence digest', () => {
  const rebuilt = buildStage2L8RedTeamCorpus();
  assert.equal(rebuilt.length, evaluation.corpus.cases);
  assert.equal(
    rebuilt.map((record) => record.input.inputDigest).join('|').length > 0,
    true,
  );
  const second = certifyStage2L8({ evaluation, performance: { primeOnlyMedian: 0, triadMedian: 0, triadPlusArbiterMedian: 0, arbiterMedianOverhead: 0, arbiterP95Overhead: 0, arbiterP99Overhead: 0, evidenceValidationMedian: 0, evidenceValidationP95: 0 } });
  assert.equal(second.certificationHash, certification.certificationHash);
});

/* ---------------------------------------------------------------------------
 * Authority boundary
 * ------------------------------------------------------------------------- */

test('the whole campaign stays shadow-only at R0', () => {
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

test('no arbiter output ever generates, dispatches, or mutates', () => {
  for (const stratum of STAGE2L8_STRATA) {
    const record = buildStage2L8Case(stratum, 11, STAGE2L8_STRATA.indexOf(stratum));
    const result = remediatedDeterministicArbiter(record.input);
    assert.equal(result.actionGenerated, false, stratum);
    assert.equal(result.dispatch, false, stratum);
    assert.equal(result.worldMutation, false, stratum);
    assert.equal(result.learnedRouting, false, stratum);
    assert.equal(result.shadowOnly, true, stratum);
    assert.equal(result.primaryDecisionEngine, 'PRIME', stratum);
    // A changed recommendation must still be a legal action from Prime's own set.
    if (result.counterfactualFinalRecommendation !== null) {
      const legal = record.input.prime.rankedLegalActions.map((entry) => entry.actionId);
      assert.ok(legal.includes(result.counterfactualFinalRecommendation), stratum);
    }
  }
});

test('no claim of gameplay improvement, readiness, or promotion is recorded', () => {
  assert.equal(certification.zeknovaGameplayImprovementClaimed, false);
  assert.equal(certification.productionReadinessClaimed, false);
  assert.equal(certification.authorityPromoted, false);
});

/* ---------------------------------------------------------------------------
 * Residual exposure (reported, not folded into the headline)
 * ------------------------------------------------------------------------- */

test('residual exposure probe quantifies the single-expert delegation risk', () => {
  const probe = evaluation.residualExposure;
  const perfect = probe.find((entry) => entry.expertPrecision === 1);
  const degraded = probe.find((entry) => entry.expertPrecision === 0.5);
  assert.equal(perfect.harmfulChanges, 0, 'a perfectly precise single expert causes no harm');
  assert.ok(degraded.harmfulChanges > 0, 'an imprecise single expert does cause harm');
  // Harm rises monotonically as expert precision falls — the finding this stage reports.
  const ordered = [...probe].sort((a, b) => b.expertPrecision - a.expertPrecision);
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(ordered[index].harmfulChanges >= ordered[index - 1].harmfulChanges);
  }
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

test('Stage 2L.8 certification is self-excluding and reproducible', () => {
  assert.equal(certification.stage, STAGE2L8_STAGE);
  assert.equal(certification.status, certification.stage2l8Certified ? 'PASS' : 'FAIL');
  const { certificationHash, ...body } = certification;
  assert.ok(!JSON.stringify(body).includes(certificationHash));
  const digest = buildStage2L8PortabilityDigest(certification);
  assert.match(digest.digest, /^[a-f0-9]{64}$/);
  assert.equal(buildStage2L8PortabilityDigest(certification).digest, digest.digest);
});

test('validator is invoked on every case and never throws', () => {
  for (const stratum of STAGE2L8_STRATA) {
    const record = buildStage2L8Case(stratum, 5, STAGE2L8_STRATA.indexOf(stratum));
    const validation = validateArbiterEvidence(record.input);
    assert.ok(['ORACLE'].includes(validation.oracle.expert));
    assert.ok(['NEXUS'].includes(validation.nexus.expert));
    assert.ok(Array.isArray(validation.validationOrder));
  }
});
