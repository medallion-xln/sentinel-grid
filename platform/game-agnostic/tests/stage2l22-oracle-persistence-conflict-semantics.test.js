import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { PERSISTENCE_V2_SEARCH_SPACE, evaluatePersistenceV2 } from '../src/lab/stage2i3-oracle-head-remediation.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { STAGE2L19_HEAD_IDS } from '../src/lab/stage2l19-oracle-multi-head-qualification.js';
import { STAGE2L21_PERSISTENCE_SEMANTICS, STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  assembleOracleV2PersistenceRepaired, buildStage2L21Corpus } from '../src/lab/stage2l21-oracle-persistence-semantics.js';
import {
  STAGE2L22_CONFLICT_OWNER,
  STAGE2L22_CONFLICT_TAXONOMY,
  STAGE2L22_MINIMUM_CONFLICT_POPULATION,
  STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY,
  adjudicateStage2L22Series,
  assembleOracleV2ConflictRepaired,
  auditStage2L22ConflictOwner,
  auditStage2L22SustainedRun,
  buildStage2L22PhaseMap,
  buildStage2L22SemanticTable,
  decideStage2L22Remediation,
  describeStage2L22Series,
  measureStage2L22ConflictReachability,
  measureStage2L22ConflictSemantics,
} from '../src/lab/stage2l22-oracle-persistence-conflict-semantics.js';

const ARTIFACTS = 'artifacts/stage2l22-oracle-persistence-conflict-semantics';
const certification = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l22-certification-result.json`, 'utf8'));
const CANDIDATE = PERSISTENCE_V2_SEARCH_SPACE.find((entry) => entry.id === 'BOUNDED_INTERRUPTION_TOLERANCE');
const caseOf = (values) => ({ caseId: 'test', observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value } })) });

/* --- Question A: the conflict gate ---------------------------------------- */

test('the conflict gate is the fourth gate and sits before the NOT_PERSISTENT fallthrough', () => {
  assert.equal(STAGE2L22_CONFLICT_OWNER.gateOrdinal, 4);
  assert.equal(STAGE2L22_CONFLICT_OWNER.gateAfter, 'NOT_PERSISTENT fallthrough');
  assert.equal(STAGE2L22_CONFLICT_OWNER.introducedAt, 'STAGE2I3');
  assert.equal(STAGE2L22_CONFLICT_OWNER.presentInStage2I2, false);
  assert.equal(STAGE2L22_CONFLICT_OWNER.presentInAnyLabelSchema, false);
});

test('the gate never fires on a window that failed the sufficiency check', () => {
  const audit = auditStage2L22ConflictOwner();
  assert.equal(audit.conflictingEvidenceRequiresSufficientHistory, true);
  assert.equal(audit.gateKind, 'BEHAVIOR_CLASSIFICATION_GATE');
  for (const probe of audit.probes) {
    if (probe.abstentionReason !== 'CONFLICTING_EVIDENCE') continue;
    assert.ok(probe.samples >= STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples);
    assert.ok(probe.historyCoverage >= STAGE2L21_PERSISTENCE_SEMANTICS.minimumHistoryCoverage);
  }
});

test('a short window abstains for sufficiency, never for conflict', () => {
  const raw = evaluatePersistenceV2(caseOf([0.3, 0.34, 0.31, 0.36]), CANDIDATE);
  assert.equal(raw.abstentionReason, 'SHORT_OR_MISSING_HISTORY');
});

test('the gate is effectively unreachable across a wide deterministic sweep', () => {
  const reach = measureStage2L22ConflictReachability();
  assert.ok(reach.sweepCases > 3000);
  assert.equal(reach.conflictGateHits, 0);
  assert.equal(reach.empiricallyReachable, false);
  assert.ok(reach.shadowingExplanation.length > 50);
});

test('directional consistency can never fall below one half, which is why', () => {
  /* max(up, down) / (up + down) >= 0.5 always, so a gate at 0.62 leaves a band of
   * width 0.12 — and a near-balanced series almost always fails |slope| >= .003
   * at the gate above it. */
  for (const values of [[0.5, 0.55, 0.5, 0.55, 0.5, 0.55, 0.5], [0.2, 0.3, 0.25, 0.4, 0.3, 0.5, 0.4]]) {
    const stats = describeStage2L22Series(values);
    assert.ok(stats.directionalConsistency >= 0.5, JSON.stringify(stats));
  }
});

test('no case reaching the gate is a correct abstention', () => {
  const measured = measureStage2L22ConflictSemantics();
  assert.ok(measured.conflictCases > 0);
  assert.equal(measured.conflictCorrectAbstentions, 0);
  assert.equal(measured.classification, 'OVER_ABSTENTION');
});

/* --- The refusal to act on a thin population ------------------------------ */

test('an over-abstention with no measurable population is not repaired', () => {
  assert.equal(certification.conflictSemanticsClassification, 'OVER_ABSTENTION');
  assert.equal(certification.persistenceHeadChanged, false);
  assert.equal(certification.remediationDecision, 'E_NO_CHANGE_INCONCLUSIVE');
  assert.equal(certification.remediationRationale.reason, 'STRUCTURALLY_OVER_ABSTENTION_BUT_EMPIRICALLY_UNREACHABLE');
  assert.equal(certification.corpusConflictCases, 0);
});

test('the same decision function DOES repair when the population is adequate', () => {
  const decision = decideStage2L22Remediation(
    { classification: 'OVER_ABSTENTION', conflictCases: 4, separatesOnCoverage: true },
    { conflictGateHitRate: 0.1 }, 40);
  assert.equal(decision.decision, 'B_MAP_TO_NOT_PERSISTENT');
  assert.equal(decision.adequate, true);
});

test('a valid abstention is kept even with an adequate population', () => {
  const decision = decideStage2L22Remediation(
    { classification: 'VALID_ABSTENTION', conflictCases: 10, separatesOnCoverage: true },
    { conflictGateHitRate: 0.1 }, 30);
  assert.equal(decision.decision, 'A_KEEP_AS_ABSTENTION');
});

test('a declined change may not claim a defect reduction', () => {
  assert.equal(certification.persistenceSemanticDefectReduced, false);
  assert.equal(certification.persistenceHeadChanged, false);
});

test('the minimum population is declared, not chosen after the fact', () => {
  assert.equal(typeof STAGE2L22_MINIMUM_CONFLICT_POPULATION, 'number');
  assert.ok(STAGE2L22_MINIMUM_CONFLICT_POPULATION > 1);
  assert.equal(certification.remediationRationale.minimumPopulation, STAGE2L22_MINIMUM_CONFLICT_POPULATION);
});

/* --- The semantic table ---------------------------------------------------- */

test('the semantic table has ten categories with expectations declared first', () => {
  const table = buildStage2L22SemanticTable();
  assert.equal(table.complete, true);
  assert.equal(table.cases.length, 10);
  assert.equal(table.expectationsDeclaredBeforeExecution, true);
  assert.equal(table.semanticsVersion, STAGE2L21_PERSISTENCE_SEMANTICS_VERSION);
  assert.equal(table.semanticsUnchanged, true);
  assert.equal(table.definitionProvedIncomplete, false);
});

test('the V1 definition is used unchanged and is not silently revised', () => {
  assert.equal(certification.semanticsVersion, STAGE2L21_PERSISTENCE_SEMANTICS_VERSION);
  assert.equal(certification.semanticsUnchanged, true);
});

test('the only case expecting abstention is genuinely below the coverage minimum', () => {
  const abstaining = STAGE2L22_CONFLICT_TAXONOMY.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE');
  assert.equal(abstaining.length, 1);
  const entry = abstaining[0];
  const coverage = entry.present.filter(Boolean).length / entry.values.length;
  assert.ok(coverage < STAGE2L21_PERSISTENCE_SEMANTICS.minimumHistoryCoverage,
    `coverage ${coverage} must be below the V1 minimum to justify abstention`);
});

test('every taxonomy expectation is consistent with the V1 definition', () => {
  /* A case may only expect abstention when it actually fails sufficiency. */
  for (const entry of STAGE2L22_CONFLICT_TAXONOMY) {
    const observed = entry.present === null ? entry.values.length : entry.present.filter(Boolean).length;
    const coverage = observed / entry.values.length;
    const sufficient = entry.values.length >= STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples
      && coverage >= STAGE2L21_PERSISTENCE_SEMANTICS.minimumHistoryCoverage;
    if (entry.expected === 'INSUFFICIENT_EVIDENCE') assert.equal(sufficient, false, entry.id);
    else assert.equal(sufficient, true, entry.id);
  }
});

/* --- Question B: the corpus audit, Oracle-free ---------------------------- */

test('the SUSTAINED_RUN audit never consults Oracle', () => {
  const audit = auditStage2L22SustainedRun();
  assert.equal(audit.adjudicationMethod, 'DESCRIPTIVE_STATISTICS_ONLY_ORACLE_NOT_CONSULTED');
  assert.equal(certification.labelLeakage.corpusAuditUsedOracle, false);
});

test('adjudication is a pure function of the series', () => {
  const values = Array.from({ length: 20 }, (unused, i) => 0.2 + i * 0.03);
  const first = adjudicateStage2L22Series(values);
  const second = adjudicateStage2L22Series(values);
  assert.deepEqual(first, second);
  assert.equal(first.semanticTruth, 'PERSISTENT');
});

test('a clean monotone ramp adjudicates persistent and an alternating series does not', () => {
  assert.equal(adjudicateStage2L22Series(Array.from({ length: 20 }, (u, i) => 0.2 + i * 0.03)).semanticTruth, 'PERSISTENT');
  assert.equal(adjudicateStage2L22Series(Array.from({ length: 20 }, (u, i) => 0.5 + (i % 2 ? 0.05 : -0.05))).semanticTruth, 'NOT_PERSISTENT');
});

test('a short series adjudicates as insufficient regardless of shape', () => {
  assert.equal(adjudicateStage2L22Series([0.3, 0.34, 0.38]).semanticTruth, 'INSUFFICIENT_EVIDENCE');
});

test('the audit covers every generator variant and finds real mislabelling', () => {
  const audit = auditStage2L22SustainedRun();
  assert.equal(audit.complete, true);
  assert.equal(audit.totalCases, 120);
  assert.equal(audit.semanticallyPersistentCases + audit.semanticallyNotPersistentCases, audit.totalCases);
  assert.ok(audit.semanticallyNotPersistentCases > 0);
  assert.equal(audit.corpusStatus, 'PARTIALLY_MISLABELLED');
});

test('the signal-to-noise finding is what explains the mislabelling', () => {
  const audit = auditStage2L22SustainedRun();
  assert.ok(audit.medianSignalToNoise <= 1, `median SNR ${audit.medianSignalToNoise} should show noise rivalling signal`);
  assert.ok(audit.minSignalToNoise < 0.2);
  assert.ok(audit.noiseFreeCases > 0, 'some cases have no jitter and must still be counted');
});

test('the phase map places the generator box relative to the boundary', () => {
  const map = buildStage2L22PhaseMap();
  assert.ok(map.persistentCells > 0);
  assert.ok(map.notPersistentCells > 0);
  assert.equal(map.generatorOperatingRange.slopeMin, 0.004);
  assert.equal(map.generatorOperatingRange.jitterMax, 0.024);
});

test('the corpus is diagnosed and owned, not regenerated', () => {
  assert.equal(certification.freeze.sustainedRunCorpusRegenerated, false);
  const classification = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l22-corpus-classification.json`, 'utf8'));
  assert.equal(classification.regeneratedInThisStage, false);
  assert.ok(classification.ownershipEstablished.includes('SUSTAINED_RUN'));
});

/* --- Phase 10: two scorecards --------------------------------------------- */

test('the as-labelled and adjudicated scores are reported separately', () => {
  assert.notEqual(certification.asLabelledAfter.accuracy, certification.adjudicatedAfter.accuracy);
  assert.ok(certification.adjudicatedAfter.casesWhereLabelDisagreesWithSeries > 0);
  assert.equal(certification.asLabelledAfter.adjudication, 'AS_LABELLED');
  assert.equal(certification.adjudicatedAfter.adjudication, 'SEMANTIC');
});

test('the gap between the two scorecards equals the corpus defect', () => {
  assert.equal(certification.adjudicatedAfter.casesWhereLabelDisagreesWithSeries,
    certification.sustainedRunAudit.semanticallyNotPersistentCases);
});

/* --- Phase 11/12/13/14: controls, identifiability, isolation, freezes ------ */

test('abstention controls are real, so the tradeoff zeros are results', () => {
  assert.equal(certification.tradeoff.controlEvidenceAvailable, true);
  assert.ok(certification.tradeoff.legitimateAbstentionControlCases > 0);
  assert.equal(certification.tradeoff.abstentionRetentionRate, 1);
});

test('identifiability reuses the Stage 2L.20 method verbatim', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l22-identifiability-analysis.json`, 'utf8'));
  assert.equal(report.methodology, 'STAGE2L20_MEASURE_IDENTIFIABILITY_REUSED_VERBATIM');
  assert.equal(certification.identifiability.searchSpaceMatchedNull, true);
  assert.equal(certification.identifiability.multiplicityAccountedFor, true);
  assert.equal(certification.identifiability.headsSearched, STAGE2L19_HEAD_IDS.length);
});

test('no unrelated Oracle head moves, by output or by digest', () => {
  assert.equal(certification.unrelatedHeadsPreserved, true);
  assert.equal(certification.isolationViolations, 0);
  const sample = buildStage2L21Corpus().slice(0, 120);
  for (const entry of sample) {
    const prior = assembleOracleV2PersistenceRepaired(entry);
    const repaired = assembleOracleV2ConflictRepaired(entry);
    for (const headId of STAGE2L19_HEAD_IDS) {
      if (headId === 'persistence') continue;
      assert.equal(repaired.heads[headId].semanticOutput, prior.heads[headId].semanticOutput, `${entry.caseId}/${headId}`);
      assert.equal(repaired.heads[headId].outputDigest, prior.heads[headId].outputDigest, `${entry.caseId}/${headId}`);
    }
  }
});

test('timeToThreshold stays at 1.0000', () => {
  assert.equal(certification.timeToThresholdAccuracy, 1);
});

test('no action path is added and the Arbiter is untouched', () => {
  assert.deepEqual(certification.actionPaths.before, ['direction']);
  assert.deepEqual(certification.actionPaths.after, ['direction']);
  assert.equal(certification.oracleActionPathsUnchanged, true);
  assert.equal(certification.actionPaths.arbiterSchemaWidened, false);
});

test('the R0 boundary, the floor and every frozen module are intact', () => {
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.nexusBehaviorChanged, false);
  assert.equal(certification.freeze.frozenProducerEdited, false);
});

/* --- Certification --------------------------------------------------------- */

test('the two questions are answered independently', () => {
  /* The corpus verdict never consults Oracle; the semantic verdict never
   * consults a corpus accuracy figure. */
  const decision = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l22-remediation-decision.json`, 'utf8'));
  assert.equal(decision.decidedOnSemanticsAndReachabilityNotAccuracy, true);
  assert.equal(certification.sustainedRunAudit.adjudicationMethod, 'DESCRIPTIVE_STATISTICS_ONLY_ORACLE_NOT_CONSULTED');
});

test('the outcome reflects a sound head and a defective corpus', () => {
  assert.equal(certification.persistenceConflictOutcome, 'E_HEAD_CORRECT_CORPUS_DEFECTIVE');
});

test('the certification reproduces byte-identically from a fresh evaluation', async () => {
  const { buildStage2L22Evaluation, certifyStage2L22 } = await import('../src/lab/stage2l22-oracle-persistence-conflict-semantics.js');
  const recomputed = certifyStage2L22({ evaluation: buildStage2L22Evaluation() });
  assert.equal(recomputed.certificationHash, certification.certificationHash);
  assert.equal(recomputed.evidenceDigest, certification.evidenceDigest);
});

test('the portability limitation is recorded unchanged', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l22-portability-report.json`, 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the stage certifies and every gate it claims is actually true', () => {
  assert.equal(certification.status, 'PASS');
  assert.equal(certification.stage2l22Certified, true);
  for (const gate of ['conflictOwnerAuditComplete', 'conflictSemanticsClassified', 'semanticTableComplete',
    'sustainedRunAuditComplete', 'corpusWellPosednessClassified', 'unrelatedHeadsPreserved',
    'oracleActionPathsUnchanged', 'securityRegressionPass']) {
    assert.equal(certification[gate], true, gate);
  }
  assert.equal(certification.labelLeakageDetected, false);
});

test('the semantic persistence threshold used for adjudication is declared', () => {
  assert.equal(typeof STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY, 'number');
  assert.equal(certification.sustainedRunAudit.consistencyThreshold, STAGE2L22_SEMANTIC_PERSISTENT_CONSISTENCY);
});
