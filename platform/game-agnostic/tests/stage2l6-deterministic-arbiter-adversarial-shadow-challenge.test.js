import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2L6AdversarialCorpus,
  buildStage2L6AdversarialEvaluation,
  STAGE2L6_ADVERSARIAL_STRATA,
  STAGE2L6_ARBITER_OWNER,
  STAGE2L6_ARBITER_RULE_TABLE_DIGEST,
  STAGE2L6_ARBITER_SHA256,
  STAGE2L6_CASES_PER_STRATUM,
  STAGE2L6_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L6_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L6_STAGE,
  STAGE2L6_TOTAL_ADVERSARIAL_CASES,
} from '../src/lab/stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js';

let cachedCorpus;
let cachedEvaluation;
const corpus = () => cachedCorpus ??= buildStage2L6AdversarialCorpus();
const evaluation = () => cachedEvaluation ??= buildStage2L6AdversarialEvaluation();

test('Stage2L6 declares the requested adversarial shadow challenge', () => {
  assert.equal(STAGE2L6_STAGE, 'STAGE2L6_DETERMINISTIC_ARBITER_ADVERSARIAL_SHADOW_CHALLENGE');
});

test('the frozen Stage2L5 Arbiter owner and source hash are explicit', () => {
  assert.equal(STAGE2L6_ARBITER_OWNER, 'src/lab/stage2l5-deterministic-arbiter-candidate.js');
  assert.equal(STAGE2L6_ARBITER_SHA256, 'ed294a98c44bb3e4ee0f021ad73f58a703d9ba976c642ed2a1782881e5107e88');
});

test('the frozen Stage2L5 rule-table digest is explicit', () => {
  assert.equal(STAGE2L6_ARBITER_RULE_TABLE_DIGEST, '85f03d3665a9242d350a67842ecdf5a8a007bf4eabde7ac5fa74185ea5b28c9b');
});

test('the preregistered corpus contains 16500 cases', () => {
  assert.equal(STAGE2L6_TOTAL_ADVERSARIAL_CASES, 16500);
  assert.equal(corpus().length, STAGE2L6_TOTAL_ADVERSARIAL_CASES);
});

test('all 33 adversarial strata contain exactly 500 cases', () => {
  assert.equal(STAGE2L6_ADVERSARIAL_STRATA.length, 33);
  for (const stratum of STAGE2L6_ADVERSARIAL_STRATA) assert.equal(corpus().filter((record) => record.canonicalObservation.stratum === stratum).length, STAGE2L6_CASES_PER_STRATUM);
});

test('semantic groups are independently named with zero prior namespace overlap', () => {
  assert.equal(evaluation().corpus.effectiveSemanticGroups, 16500);
  assert.equal(evaluation().corpus.semanticTemplates, 33);
  assert.equal(evaluation().corpus.overlapWithPriorCorpora, 0);
});

test('Prime-correct ambiguous stress exceeds the 2000-case target', () => {
  assert.ok(evaluation().corpus.primeCorrectAmbiguousCases >= 2000);
  assert.equal(evaluation().corpus.primeCorrectAmbiguousCases, 11000);
});

test('both wrong experts agreeing breaks all 500 correct Prime controls', () => {
  const result = evaluation().expertCorrectness.bothExpertsWrong;
  assert.deepEqual([result.cases, result.selectionChanges, result.harmfulChanges], [500, 500, 500]);
});

test('both right experts repair all 500 positive controls', () => {
  const result = evaluation().expertCorrectness.bothExpertsRight;
  assert.deepEqual([result.cases, result.selectionChanges, result.beneficialChanges, result.harmfulChanges], [500, 500, 500, 0]);
});

test('Oracle-right Nexus-wrong cases select the Prime-ranked correct support', () => {
  const result = evaluation().expertCorrectness.oracleRightNexusWrong;
  assert.equal(result.beneficialChanges, 500);
  assert.equal(result.harmfulChanges, 0);
});

test('Nexus-right Oracle-wrong cases are measured independently', () => {
  const result = evaluation().expertCorrectness.nexusRightOracleWrong;
  assert.equal(result.beneficialChanges, 500);
  assert.equal(result.harmfulChanges, 0);
});

test('all four disagreement truth classes are populated', () => {
  const disagreement = evaluation().expertCorrectness.disagreement;
  assert.deepEqual(Object.values(disagreement).map((entry) => entry.cases), [500, 500, 500, 500]);
  assert.equal(disagreement.primeCorrect.metrics.harmfulChanges, 500);
  assert.equal(disagreement.oracleCorrect.metrics.beneficialChanges, 500);
  assert.equal(disagreement.nexusCorrect.metrics.beneficialChanges, 500);
  assert.equal(disagreement.neitherCorrect.metrics.selectionChanges, 0);
});

test('the frozen Arbiter accepts all stale Oracle packets', () => {
  assert.equal(evaluation().identityAttacks.staleOracleEvidenceAccepted, 500);
});

test('the frozen Arbiter accepts all stale Nexus packets', () => {
  assert.equal(evaluation().identityAttacks.staleNexusEvidenceAccepted, 500);
});

test('cross-observation expert evidence is accepted', () => {
  assert.equal(evaluation().identityAttacks.crossObservationExpertEvidenceAccepted, 1000);
});

test('cross-runtime expert evidence is accepted', () => {
  assert.equal(evaluation().identityAttacks.crossRuntimeExpertEvidenceAccepted, 500);
});

test('campaign identity is absent from the frozen canonical contract', () => {
  assert.equal(evaluation().identityAttacks.campaignIdentityInCanonicalContract, false);
  assert.equal(evaluation().identityAttacks.crossCampaignExpertEvidenceAccepted, 0);
});

test('ambiguous action bindings are accepted but illegal action IDs are rejected', () => {
  const attacks = evaluation().identityAttacks;
  assert.equal(attacks.ambiguousActionBindingAccepted, 300);
  assert.equal(attacks.illegalExpertSupportedActionAccepted, 0);
});

test('ambiguous Nexus entity bindings are accepted', () => {
  assert.equal(evaluation().identityAttacks.ambiguousNexusEntityBindingAccepted, 500);
});

test('ambiguous Oracle channel bindings are accepted', () => {
  assert.equal(evaluation().identityAttacks.ambiguousOracleChannelBindingAccepted, 500);
});

test('explicitly ineligible true-but-irrelevant evidence remains safe', () => {
  assert.equal(evaluation().causalIrrelevance.trueButIrrelevantOracleSelectionChanges, 0);
  assert.equal(evaluation().causalIrrelevance.trueButIrrelevantNexusSelectionChanges, 0);
});

test('false-cycle challenge exposes nonzero decision eligibility', () => {
  assert.equal(evaluation().oracleAdversarial.cycle.cases, 600);
  assert.equal(evaluation().oracleAdversarial.cycle.falseCycleDecisionEligibilityRate, 1 / 6);
});

test('invalid threshold challenge exposes out-of-horizon eligibility', () => {
  assert.equal(evaluation().oracleAdversarial.threshold.cases, 600);
  assert.equal(evaluation().oracleAdversarial.threshold.invalidThresholdDecisionEligibilityRate, 1 / 6);
});

test('Nexus exact relational reference produces zero false redundancy support', () => {
  assert.equal(evaluation().nexusAdversarial.cases, 500);
  assert.equal(evaluation().nexusAdversarial.falseRedundancyDecisionSupportRate, 0);
});

test('graph-version race packets are accepted as current support', () => {
  assert.equal(evaluation().identityAttacks.staleGraphEvidenceAccepted, 500);
});

test('all ten tie boundaries behave exactly and no margin above 0.03 changes', () => {
  const tie = evaluation().tieBoundary;
  assert.equal(tie.margins.length, 10);
  assert.equal(tie.behaviorExact, true);
  assert.equal(tie.tieEligibilityCrossPlatformIdentical, true);
  assert.equal(tie.marginGt003SelectionChanges, 0);
});

test('legal-action and expert-evidence ordering remain invariant', () => {
  assert.equal(evaluation().invariance.legalActionOrderInvariant, true);
  assert.equal(evaluation().invariance.expertEvidenceOrderInvariant, true);
});

test('duplicate evidence cannot multiply support', () => {
  assert.equal(evaluation().invariance.duplicateEvidenceDoesNotMultiplySupport, true);
});

test('conflicting duplicate evidence fails closed', () => {
  assert.equal(evaluation().invariance.conflictingDuplicateEvidenceFailsClosed, true);
});

test('missing Oracle Nexus or both returns Prime', () => {
  assert.equal(evaluation().failClosed.missingExpertEvidenceReturnsSafeBehavior, true);
});

test('malformed packet digests are rejected', () => {
  assert.equal(evaluation().failClosed.malformedDigestAccepted, 0);
});

test('unknown expert schema version is accepted by the frozen validator', () => {
  assert.equal(evaluation().failClosed.unknownExpertSchemaAccepted, 250);
});

test('an extra unknown expert rule state does not return Prime', () => {
  assert.equal(evaluation().failClosed.unknownRuleStateReturnsPrime, false);
});

test('outside-ambiguity and explicitly ineligible high-signal evidence remain safe', () => {
  const boundary = evaluation().authorityBoundary;
  assert.equal(boundary.agreementOutsideAmbiguitySelectionChanges, 0);
  assert.equal(boundary.highConfidenceIneligibleOracleChanges, 0);
  assert.equal(boundary.highImportanceIneligibleNexusChanges, 0);
});

test('primary adversarial safety gates are decisively falsified', () => {
  const result = evaluation().results;
  assert.equal(result.selectionChanges, 8900);
  assert.equal(result.beneficialChanges, 2850);
  assert.equal(result.harmfulChanges, 6050);
  assert.ok(result.harmfulChangeRate > STAGE2L6_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(result.correctPrimeBreakRate > STAGE2L6_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.ok(result.decisionDelta < 0);
});

test('fail-closed rate records the measured falsification without remediation', () => {
  const failClosed = evaluation().failClosed;
  assert.deepEqual([failClosed.requiredCases, failClosed.successCases], [11000, 5450]);
  assert.equal(failClosed.rate, 5450 / 11000);
  assert.ok(failClosed.rate < 1);
});

test('all rules are exercised and every selection change remains attributable', () => {
  const result = evaluation();
  assert.equal(result.ruleCoverage.coverage, 1);
  assert.deepEqual(result.ruleCoverage.exercised, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.equal(result.causality.groundTruthIndependentOfArbiter, true);
  assert.equal(result.causality.allArbiterSelectionChangesCausallyAttributed, true);
});

test('frozen owners stay unchanged and no remediation is smuggled into the challenge', () => {
  const result = evaluation();
  assert.ok(Object.entries(result.freezes).every(([, value]) => value === false));
  assert.equal(result.arbiterIdentity.identityMatchesStage2l5, true);
  assert.equal(result.remediation.arbiterRemediationImplemented, false);
  assert.equal(result.actualPath.arbiterShadowOnly, true);
  assert.equal(result.authority.tier, 'R0');
  const { evidenceDigest, ...body } = result;
  assert.equal(evidenceDigest, sha256(body));
});
