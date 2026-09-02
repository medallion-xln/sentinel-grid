import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { assembleOracleV2, buildOracleV2Holdout } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE, wilsonLowerBound } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L19_ARBITER_ORACLE_HEAD_BINDING,
  STAGE2L19_CERTIFIED_HEAD_IDS,
  STAGE2L19_FAMILY_WISE_ALPHA,
  STAGE2L19_HEADS,
  STAGE2L19_HEAD_CLASSES,
  STAGE2L19_HEAD_IDS,
  STAGE2L19_IDENTIFIABILITY_SIGNALS,
  STAGE2L19_IDENTIFIABILITY_STATUSES,
  STAGE2L19_INHERITED_DIRECTION_DELEGATION,
  STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN,
  STAGE2L19_MINIMUM_HOLDOUT_RETENTION,
  STAGE2L19_PORTFOLIO_OUTCOMES,
  STAGE2L19_STRESS_SPLITS,
  STAGE2L19_UNCERTIFIED_HEAD_IDS,
  analyseStage2L19CrossHeadCollisions,
  auditStage2L19GroundTruth,
  auditStage2L19HeadContracts,
  buildStage2L19Evaluation,
  buildStage2L19StressCorpus,
  buildStage2L19StressCorpusReport,
  certifyStage2L19,
  classifyStage2L19Head,
  evaluateStage2L19Delegation,
  measureStage2L19CorpusDegeneracy,
  measureStage2L19HeadInventory,
  measureStage2L19Identifiability,
} from '../src/lab/stage2l19-oracle-multi-head-qualification.js';

const ARTIFACTS = 'artifacts/stage2l19-oracle-multi-head-qualification';
const certification = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l19-certification-result.json`, 'utf8'));

/* --- Phase 1: the inventory is read off the implementation ---------------- */

test('the declared head table matches the assembly the stage actually probes', () => {
  const inventory = measureStage2L19HeadInventory();
  assert.equal(inventory.inventoryMatchesImplementation, true);
  assert.deepEqual(inventory.implementedHeadIds, [...STAGE2L19_HEAD_IDS].sort());
  assert.equal(inventory.headCount, 8);
});

test('head names are the implementation names, not invented labels', () => {
  const probe = assembleOracleV2({
    caseId: 'test', observationHistory: Array.from({ length: 20 }, (u, tick) => ({ tick, channels: { alpha: 0.5 + tick * 0.01 } })),
  });
  for (const headId of STAGE2L19_HEAD_IDS) assert.ok(Object.hasOwn(probe.heads, headId), headId);
});

test('exactly one head carries a prior certification and it is direction', () => {
  assert.deepEqual([...STAGE2L19_CERTIFIED_HEAD_IDS], ['direction']);
  assert.equal(STAGE2L19_UNCERTIFIED_HEAD_IDS.length, 7);
  assert.equal(STAGE2L19_HEADS.find((head) => head.headId === 'direction').certificationStatus, 'CERTIFIED_DIRECTION_HEAD');
});

test('no head declares an action output', () => {
  for (const head of STAGE2L19_HEADS) {
    for (const forbidden of ['recommendedAction', 'selectedAction', 'dispatchAction']) {
      assert.ok(!head.outputs.includes(forbidden), `${head.headId} exposes ${forbidden}`);
    }
  }
  assert.equal(measureStage2L19HeadInventory().forbiddenActionFieldsPresent.length, 0);
});

/* --- Phase 2: contract audit ---------------------------------------------- */

test('the contract audit finds exactly one Arbiter-consumed head', () => {
  const contracts = auditStage2L19HeadContracts();
  assert.equal(contracts.headsExposed, 8);
  assert.equal(contracts.headsConsumedByArbiter, 1);
  assert.equal(contracts.arbiterOracleHeadBinding, STAGE2L19_ARBITER_ORACLE_HEAD_BINDING);
  assert.equal(contracts.headsExposedButNotConsumed.length, 7);
});

test('the contract audit cites the real Stage 2L.10 Oracle signal schema', () => {
  const contracts = auditStage2L19HeadContracts();
  assert.ok(contracts.arbiterOracleSignalKeys.includes('head'));
  assert.equal(contracts.arbiterOracleSignalKind, 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1');
});

test('no contract deficiency is claimed without measurement', () => {
  assert.deepEqual(auditStage2L19HeadContracts().contractDeficienciesFound, []);
});

test('every head computes derived state and exposes it with a digest', () => {
  for (const head of auditStage2L19HeadContracts().heads) {
    assert.ok(head.expertOutputFieldsExposed.includes('semanticOutput'), head.headId);
    assert.ok(head.evidenceMetadataExposed.includes('outputDigest'), head.headId);
    assert.equal(head.emitsAction, false);
  }
});

/* --- Phase 3: ground truth ------------------------------------------------ */

test('ground truth is classified as deterministic-latent, not world-state derived', () => {
  const audit = auditStage2L19GroundTruth(buildOracleV2Holdout());
  for (const head of audit.heads) {
    assert.equal(head.groundTruthClass, 'DETERMINISTIC_LATENT_DERIVED');
    assert.equal(head.hiddenRandomnessInvolved, false);
    assert.equal(head.futureInformationInvolved, false);
    assert.equal(head.expertOutputUsedInTruthConstruction, false);
  }
  assert.equal(audit.labelLeakageDetected, false);
});

test('a head that cannot emit an expected label is a benchmark defect, not weak reasoning', () => {
  const audit = auditStage2L19GroundTruth(buildOracleV2Holdout());
  const persistence = audit.heads.find((head) => head.headId === 'persistence');
  assert.ok(persistence.unreachableExpectedLabels.includes('NOT_PERSISTENT'));
  assert.equal(persistence.semanticallyValid, false);
  assert.ok(persistence.achievableAccuracyCeiling < 1);
});

test('the two invalid heads are exactly persistence and timeToThreshold', () => {
  const audit = auditStage2L19GroundTruth(buildOracleV2Holdout());
  assert.deepEqual(audit.heads.filter((head) => !head.semanticallyValid).map((head) => head.headId).sort(),
    ['persistence', 'timeToThreshold']);
});

/* --- Phase 4: corpus validation ------------------------------------------- */

test('the inherited corpus is degenerate: effective n is family count, not variant count', () => {
  const degeneracy = measureStage2L19CorpusDegeneracy(buildOracleV2Holdout());
  for (const head of degeneracy.heads) {
    assert.ok(head.effectiveSampleSize <= 3, `${head.headId} claims n=${head.effectiveSampleSize}`);
    assert.ok(head.nominalCases >= 100, head.headId);
    assert.ok(head.nominalCases / head.effectiveSampleSize >= 50, head.headId);
    assert.equal(head.degenerate, true, head.headId);
  }
});

test('the stress corpus rejects ill-posed cases rather than scoring them', () => {
  const report = buildStage2L19StressCorpusReport();
  assert.ok(report.rejectedCases > 0);
  assert.ok(report.rejectionRate > 0 && report.rejectionRate < 0.5);
  assert.ok(report.acceptedCases > 1000);
});

test('no accepted stress case saturates at a range bound across its whole window', () => {
  for (const entry of buildStage2L19StressCorpus()) {
    const values = entry.observationHistory.map((frame) => Object.values(frame.channels)[0]);
    /* A zero-frame history is the intended extreme of the abstention head's
     * SHORT_HISTORY sweep, not a saturated series; it has no value to clamp. */
    if (values.length === 0) {
      assert.equal(entry.expected, 'INSUFFICIENT_EVIDENCE', entry.caseId);
      continue;
    }
    assert.ok(!values.every((value) => value === 0), entry.caseId);
    assert.ok(!values.every((value) => value === 1), entry.caseId);
  }
});

test('stress splits are disjoint and cover every variant index', () => {
  const { DEVELOPMENT, CALIBRATION, FINAL_HOLDOUT } = STAGE2L19_STRESS_SPLITS;
  assert.equal(DEVELOPMENT[1], CALIBRATION[0]);
  assert.equal(CALIBRATION[1], FINAL_HOLDOUT[0]);
  const seen = new Set(buildStage2L19StressCorpus().map((entry) => entry.splitName));
  assert.deepEqual([...seen].sort(), ['CALIBRATION', 'DEVELOPMENT', 'FINAL_HOLDOUT']);
});

test('the stress corpus is content addressed and deterministic', () => {
  const first = buildStage2L19StressCorpus().map((entry) => entry.caseDigest);
  const second = buildStage2L19StressCorpus().map((entry) => entry.caseDigest);
  assert.deepEqual(first, second);
});

/* --- Phase 5/6: blind evaluation and utility ------------------------------ */

test('utility for a label-only head is measured against the trivial classifier, not Prime', () => {
  for (const head of certification.stressBlind.heads) {
    if (head.hasCertifiedActionPath) continue;
    assert.equal(head.primeComparable, false);
    assert.notEqual(head.utilityClass, 'POSITIVE_SPECIALIST_UTILITY');
  }
});

test('combined Prime-error coverage is refused rather than fabricated', () => {
  assert.equal(certification.portfolio.combinedUniquePrimeErrorCoverage, 'NOT_MEASURABLE_WITHOUT_ACTION_PATH');
});

test('every head reports a trivial baseline alongside its accuracy', () => {
  for (const head of certification.stressBlind.heads) {
    assert.equal(typeof head.majorityBaseline, 'number');
    assert.equal(head.liftOverTrivialBaseline, Number((head.accuracy - head.majorityBaseline).toFixed(6)));
  }
});

/* --- Phase 7/8/9: identifiability, null, multiplicity --------------------- */

test('identifiability signals contain no ground truth, outcome or corpus identity', () => {
  const names = STAGE2L19_IDENTIFIABILITY_SIGNALS.map(([signal]) => signal);
  for (const forbidden of ['expected', 'correct', 'family', 'caseId', 'variantIndex', 'splitName', 'task']) {
    assert.ok(!names.includes(forbidden), forbidden);
  }
});

test('a head with no wrong cases is reported as not measurable, never as non-identifiable', () => {
  const cases = buildStage2L19StressCorpus().filter((entry) => entry.task === 'direction');
  const measured = measureStage2L19Identifiability(cases, 'direction', 8);
  assert.equal(measured.calibrationErrors, 0);
  assert.equal(measured.identifiabilityStatus, 'NOT_MEASURABLE_NO_ERROR_VARIANCE');
  assert.equal(measured.observedDiscrimination, null);
  assert.notEqual(measured.identifiabilityStatus, 'MEASURED_NON_IDENTIFIABLE');
});

test('every identifiability status is one of the declared four', () => {
  for (const head of certification.identifiability) {
    assert.ok(STAGE2L19_IDENTIFIABILITY_STATUSES.includes(head.identifiabilityStatus), head.identifiabilityStatus);
  }
});

test('the null searches the identical hypothesis space as the observed search', () => {
  for (const head of certification.identifiability) assert.equal(head.searchSpaceMatchedNull, true);
});

test('multiplicity is Bonferroni corrected across every head searched', () => {
  for (const head of certification.identifiability) {
    assert.equal(head.multiplicityAccountedFor, true);
    assert.equal(head.headsSearched, STAGE2L19_HEAD_IDS.length);
    assert.equal(head.familyWiseAlpha, STAGE2L19_FAMILY_WISE_ALPHA);
    assert.equal(head.familyWiseQuantile,
      Number((1 - STAGE2L19_FAMILY_WISE_ALPHA / STAGE2L19_HEAD_IDS.length).toFixed(6)));
  }
});

test('equality with the corrected threshold is not a signal', () => {
  for (const head of certification.identifiability) {
    if (head.observedDiscrimination === null) continue;
    if (!head.signalExceedsNull) continue;
    assert.ok(head.observedDiscrimination >= head.familyWiseThreshold + STAGE2L19_MATERIAL_DISCRIMINATION_MARGIN,
      `${head.headId} passed without the material margin`);
  }
});

test('an identifiable head keeps at least half its lift in FINAL_HOLDOUT', () => {
  for (const head of certification.identifiability) {
    if (!head.identifiable) continue;
    assert.ok(head.holdoutRetention >= STAGE2L19_MINIMUM_HOLDOUT_RETENTION, head.headId);
  }
});

test('regimeChange landed on the corrected threshold and is reported as non-identifiable', () => {
  const head = certification.identifiability.find((entry) => entry.headId === 'regimeChange');
  assert.equal(head.identifiabilityStatus, 'MEASURED_NON_IDENTIFIABLE');
  assert.equal(head.signalExceedsNull, false);
});

/* --- Phase 10/11: calibration and safe delegation ------------------------- */

test('the inherited 0.99 floor and both harm ceilings are unchanged', () => {
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
  assert.equal(certification.freeze.reliabilityFloor, 0.99);
  assert.equal(certification.freeze.reliabilityFloorLowered, false);
  assert.equal(STAGE2L14_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE, 0.01);
});

test('a head with no action path gets no delegation verdict of any kind', () => {
  for (const head of certification.delegation) {
    if (head.headId === 'direction') continue;
    assert.equal(head.safeForDelegation, false);
    assert.equal(head.evaluated, false);
    assert.notEqual(head.reason, 'REVALIDATED_AGAINST_STAGE2L10_CERTIFICATION');
  }
});

test('the inherited Stage 2L.10 certification is never extended to an uncertified head', () => {
  const borrowed = certification.delegation.filter((head) => head.headId !== 'direction' && head.evaluated);
  assert.deepEqual(borrowed, []);
});

test('direction is revalidated on this stage\'s own corpus, not presumed', () => {
  const direction = certification.delegation.find((head) => head.headId === 'direction');
  assert.equal(direction.evaluated, true);
  assert.equal(direction.revalidation.corpus, 'STAGE2L19_ORACLE_STRESS_CORPUS');
  assert.ok(direction.revalidation.supportedCases >= 50);
  assert.ok(direction.revalidation.lowerBound >= STAGE2L14_RELIABILITY_FLOOR);
  assert.equal(direction.revalidation.meetsFloor, true);
});

test('direction delegation clears the floor on both bodies of evidence', () => {
  const direction = certification.delegation.find((head) => head.headId === 'direction');
  assert.equal(direction.inheritedMeetsFloor, true);
  assert.equal(direction.ceilingsRespected, true);
  assert.equal(direction.safeForDelegation, true);
  assert.equal(direction.delegationLowerBound,
    wilsonLowerBound(STAGE2L19_INHERITED_DIRECTION_DELEGATION.delegations, STAGE2L19_INHERITED_DIRECTION_DELEGATION.delegations));
});

test('the pinned inherited delegation evidence matches the Stage 2L.10 artifact', () => {
  const stage2l10 = JSON.parse(readFileSync(
    'artifacts/stage2l10-arbiter-correctness-calibration-and-selective-delegation/stage2l10-certification-result.json', 'utf8'));
  for (const field of ['delegations', 'precision', 'harmfulChanges', 'harmfulChangeRate', 'correctPrimeBreaks', 'correctPrimeBreakRate']) {
    assert.equal(STAGE2L19_INHERITED_DIRECTION_DELEGATION[field], stage2l10.oracleSingleExpert[field], field);
  }
});

test('a microscopic perfect bucket cannot pass support', () => {
  const head = { headId: 'direction', semanticallyValid: true, arbiterEligibility: 'CERTIFIED_STAGE2L10_SELECTIVE_DELEGATION' };
  const tiny = buildStage2L19StressCorpus().filter((entry) => entry.task === 'direction').slice(0, 10);
  const result = evaluateStage2L19Delegation(head,
    { utilityClass: 'POSITIVE_SPECIALIST_UTILITY' },
    { identifiabilityStatus: 'NOT_MEASURABLE_NO_ERROR_VARIANCE' }, tiny);
  assert.equal(result.revalidation.supportAdequate, false);
  assert.equal(result.safeForDelegation, false);
});

/* --- Phase 12/13/14: collisions, classification, portfolio ---------------- */

test('collision remediation is only demanded when two heads can actually delegate', () => {
  assert.equal(certification.collisions.safeHeadCount, 1);
  assert.equal(certification.collisions.multiHeadCollisionRemediationRequired, false);
  const forced = analyseStage2L19CrossHeadCollisions(buildStage2L19StressCorpus().slice(0, 50), []);
  assert.equal(forced.multiHeadEligibleCases, 0);
});

test('every head lands in exactly one of the eight declared classes', () => {
  assert.equal(certification.classifications.length, 8);
  for (const entry of certification.classifications) {
    assert.ok(STAGE2L19_HEAD_CLASSES.includes(entry.classification), entry.classification);
  }
  assert.equal(new Set(certification.classifications.map((entry) => entry.headId)).size, 8);
});

test('benchmark invalidity outranks every downstream verdict', () => {
  const invalid = { headId: 'x', semanticallyValid: false, arbiterEligibility: 'NOT_WIRED' };
  const classification = classifyStage2L19Head(invalid, {}, { liftOverTrivialBaseline: 0.9, constantPrediction: false, cases: 100 },
    { identifiabilityStatus: 'MEASURED_IDENTIFIABLE' }, { safeForDelegation: true }, { degenerate: false });
  assert.equal(classification, 'INVALID_BENCHMARK_SEMANTICS');
});

test('an accurate head with no error variance is not classified NON_IDENTIFIABLE', () => {
  const classification = classifyStage2L19Head(
    { headId: 'x', semanticallyValid: true }, {},
    { liftOverTrivialBaseline: 0.4, constantPrediction: false, cases: 200 },
    { identifiabilityStatus: 'NOT_MEASURABLE_NO_ERROR_VARIANCE' },
    { safeForDelegation: false }, { degenerate: false });
  assert.equal(classification, 'USEFUL_NOT_SAFE');
});

test('the portfolio outcome is one of the seven declared outcomes', () => {
  assert.ok(STAGE2L19_PORTFOLIO_OUTCOMES.includes(certification.oraclePortfolioOutcome));
});

test('the portfolio counts agree with the per-head classifications', () => {
  const counts = certification.classifications.reduce((map, entry) => {
    map[entry.classification] = (map[entry.classification] ?? 0) + 1;
    return map;
  }, {});
  assert.equal(certification.portfolio.safeSpecialistHeads, counts.SAFE_SPECIALIST ?? 0);
  assert.equal(certification.portfolio.redundantHeads, counts.REDUNDANT_WITH_PRIME ?? 0);
  assert.equal(certification.portfolio.weakHeads, counts.IDENTIFIABLE_BUT_WEAK ?? 0);
  assert.equal(certification.portfolio.totalHeads, certification.classifications.length);
});

/* --- Phases 15/16/17: freeze, boundaries, certification ------------------- */

test('Nexus behaviour is unchanged and the stage says so explicitly', () => {
  assert.equal(certification.nexusBehaviorChanged, false);
  assert.equal(certification.freeze.oracleBehaviourChanged, false);
  assert.equal(certification.freeze.arbiterChanged, false);
  assert.equal(certification.freeze.primeChanged, false);
});

test('the R0 boundary is intact', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
});

test('the interpretation is derived from the evidence, not asserted', () => {
  const defects = certification.interpretation.benchmarkVocabularyDefects.map((entry) => entry.headId).sort();
  assert.deepEqual(defects, certification.groundTruth.heads.filter((head) => !head.semanticallyValid).map((head) => head.headId).sort());
  assert.equal(certification.interpretation.remediationRequired, defects.length > 0);
  assert.equal(certification.interpretation.remediationPerformedInThisStage, false);
});

test('the certification reproduces byte-identically from a fresh evaluation', () => {
  const recomputed = certifyStage2L19({ evaluation: buildStage2L19Evaluation() });
  assert.equal(recomputed.certificationHash, certification.certificationHash);
  assert.equal(recomputed.evidenceDigest, certification.evidenceDigest);
});

test('the portability limitation is recorded unchanged, not remediated', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l19-portability-report.json`, 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the stage certifies and every gate it claims is actually true', () => {
  assert.equal(certification.status, 'PASS');
  assert.equal(certification.stage2l19Certified, true);
  for (const gate of ['oracleHeadInventoryComplete', 'contractAuditComplete', 'groundTruthAuditComplete',
    'corpusValidationComplete', 'allHeadsClassified', 'searchSpaceMatchedNull', 'multiplicityAccountedFor',
    'securityRegressionPass']) {
    assert.equal(certification[gate], true, gate);
  }
  assert.equal(certification.labelLeakageDetected, false);
});
