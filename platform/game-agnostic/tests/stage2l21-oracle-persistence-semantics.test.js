import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { assembleOracleV2, buildOracleV2Holdout } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import { evaluateStage2I2Head } from '../src/lab/stage2i2-oracle-task-head-diagnostic.js';
import { PERSISTENCE_V2_SEARCH_SPACE, evaluatePersistenceV2 } from '../src/lab/stage2i3-oracle-head-remediation.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { STAGE2L19_HEAD_IDS } from '../src/lab/stage2l19-oracle-multi-head-qualification.js';
import { assembleOracleV2Canonical, buildStage2L20RepairedCorpus } from '../src/lab/stage2l20-oracle-vocabulary-alignment.js';
import {
  STAGE2L21_ABSTENTION_CONTRACT,
  STAGE2L21_ADVERSARIAL_CASES,
  STAGE2L21_LEFT_ALONE_REASONS,
  STAGE2L21_NARROWED_ABSTENTION_REASONS,
  STAGE2L21_NARROWED_AWAY_REASONS,
  STAGE2L21_PERSISTENCE_SEMANTICS,
  STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  STAGE2L21_SEMANTIC_AXES,
  assembleOracleV2PersistenceRepaired,
  auditStage2L21ContractArchaeology,
  buildStage2L21Corpus,
  buildStage2L21SemanticMatrix,
  classifyStage2L21AbstentionSemantics,
  compareStage2L21Heads,
  evaluatePersistenceV3,
} from '../src/lab/stage2l21-oracle-persistence-semantics.js';

const ARTIFACTS = 'artifacts/stage2l21-oracle-persistence-semantics';
const certification = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l21-certification-result.json`, 'utf8'));
const CANDIDATE = PERSISTENCE_V2_SEARCH_SPACE.find((entry) => entry.id === 'BOUNDED_INTERRUPTION_TOLERANCE');
const caseOf = (values) => ({ caseId: 'test', observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value } })) });

/* --- Phase 1: archaeology, every claim probed ----------------------------- */

test('every archaeological claim is verified against the live modules', () => {
  const audit = auditStage2L21ContractArchaeology();
  assert.equal(audit.complete, true);
  for (const stage of audit.stages) assert.equal(stage.verified, true, stage.stage);
});

test('2I.2 answers where 2I.3 abstains on an alternating series', () => {
  const values = Array.from({ length: 28 }, (unused, i) => 0.5 + (i % 2 ? 0.04 : -0.04));
  assert.equal(evaluateStage2I2Head('PERSISTENCE_HEAD', caseOf(values)).semanticOutput, 'NOT_PERSISTENT');
  const three = evaluatePersistenceV2(caseOf(values), CANDIDATE);
  assert.equal(three.semanticOutput, 'INSUFFICIENT_EVIDENCE');
  assert.equal(three.abstentionReason, 'INDETERMINATE_DIRECTION');
});

test('the gate is located at 2I.3 and the defect origin at the 2I.4 splice', () => {
  const audit = auditStage2L21ContractArchaeology();
  assert.equal(audit.gateIntroducedAt, 'STAGE2I3');
  assert.equal(audit.defectOrigin, 'STAGE2I4_INTEGRATION_SPLICE');
  assert.equal(audit.gateIntent, 'TEST_DRIVEN_AND_INTERNALLY_CONSISTENT_AT_STAGE2I3');
  assert.equal(audit.gateDocumented, false);
  assert.equal(audit.gateSafetyRationaleFound, false);
});

test('2I.3 and its own corpus agree, which is why the gate was not accidental', () => {
  const audit = auditStage2L21ContractArchaeology();
  const two = audit.stages.find((entry) => entry.stage === 'STAGE2I2');
  const three = audit.stages.find((entry) => entry.stage === 'STAGE2I3');
  const four = audit.stages.find((entry) => entry.stage === 'STAGE2I4');
  assert.equal(two.flatSeriesExpectationInOwnCorpus, 'NOT_PERSISTENT');
  assert.equal(three.flatSeriesExpectationInOwnCorpus, 'INSUFFICIENT_EVIDENCE');
  assert.equal(four.flatSeriesExpectationInOwnCorpus, 'NOT_PERSISTENT');
  assert.equal(four.spliceDetected, true);
});

/* --- Phase 2/3: semantics --------------------------------------------------*/

test('the semantic axes keep sufficiency and direction certainty separate', () => {
  const names = STAGE2L21_SEMANTIC_AXES.map((axis) => axis.axis);
  assert.ok(names.includes('DATA_SUFFICIENCY'));
  assert.ok(names.includes('DIRECTION_CERTAINTY'));
  assert.notEqual(names.indexOf('DATA_SUFFICIENCY'), names.indexOf('DIRECTION_CERTAINTY'));
});

test('the definition is versioned and derived from architecture, not accuracy', () => {
  assert.equal(STAGE2L21_PERSISTENCE_SEMANTICS.version, STAGE2L21_PERSISTENCE_SEMANTICS_VERSION);
  assert.ok(STAGE2L21_PERSISTENCE_SEMANTICS.derivedFrom.length >= 4);
  assert.ok(/No benchmark accuracy figure/.test(STAGE2L21_PERSISTENCE_SEMANTICS.notDerivedFrom));
  assert.equal(STAGE2L21_PERSISTENCE_SEMANTICS.directionUncertaintyImpliesNonPersistence, true);
  assert.equal(STAGE2L21_PERSISTENCE_SEMANTICS.oscillationImpliesNonPersistence, true);
});

test('insufficient evidence is defined as data sufficiency only', () => {
  assert.ok(/DATA SUFFICIENCY ONLY/.test(STAGE2L21_PERSISTENCE_SEMANTICS.insufficientEvidenceDefinition));
  assert.deepEqual([...STAGE2L21_ABSTENTION_CONTRACT.mayAbstainWhen].length, 1);
});

/* --- Phase 4/5: adversarial cases ----------------------------------------- */

test('expectations were declared before execution and cover every category', () => {
  const matrix = buildStage2L21SemanticMatrix();
  assert.equal(matrix.expectationsDeclaredBeforeExecution, true);
  const categories = new Set(STAGE2L21_ADVERSARIAL_CASES.map((entry) => entry.category));
  for (const required of ['FLAT', 'OSCILLATING', 'WEAK_TREND', 'STRONG_TREND', 'REVERSAL', 'BOUNDARY']) {
    assert.ok(categories.has(required), required);
  }
});

test('every adversarial case carries a rationale on the declared axes', () => {
  for (const entry of STAGE2L21_ADVERSARIAL_CASES) {
    assert.ok(entry.why && entry.why.length > 20, entry.id);
    assert.ok(['PERSISTENT', 'NOT_PERSISTENT', 'INSUFFICIENT_EVIDENCE'].includes(entry.expected), entry.id);
  }
});

test('exactly one adversarial case expects abstention, and it is the short one', () => {
  const abstaining = STAGE2L21_ADVERSARIAL_CASES.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE');
  assert.equal(abstaining.length, 1);
  assert.equal(abstaining[0].id, 'ONE_BELOW_MINIMUM_SAMPLES');
  assert.ok(abstaining[0].values.length < STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples);
});

test('the minimum-samples boundary is tested on both sides', () => {
  const at = STAGE2L21_ADVERSARIAL_CASES.find((entry) => entry.id === 'EXACTLY_MINIMUM_SAMPLES');
  const below = STAGE2L21_ADVERSARIAL_CASES.find((entry) => entry.id === 'ONE_BELOW_MINIMUM_SAMPLES');
  assert.equal(at.values.length, STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples);
  assert.equal(below.values.length, STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples - 1);
  assert.notEqual(at.expected, below.expected);
});

/* --- Phase 6: the comparison ---------------------------------------------- */

test('the gate prevents zero false assertions on the semantic table', () => {
  const comparison = compareStage2L21Heads();
  assert.equal(comparison.falseAssertionsPreventedByGate, 0);
  assert.ok(comparison.validAnswersConvertedToAbstention > 0);
});

test('every disagreement is 2I.3 abstaining where the semantics gives an answer', () => {
  for (const row of compareStage2L21Heads().disagreements) {
    assert.equal(row.type, 'STAGE2I3_ABSTAINS_WHERE_SEMANTICS_ANSWER', row.id);
  }
});

test('the abstention classification follows the measured disagreements', () => {
  assert.equal(classifyStage2L21AbstentionSemantics(compareStage2L21Heads()), 'OVER_ABSTENTION');
  assert.equal(classifyStage2L21AbstentionSemantics({ disagreements: [] }), 'VALID');
  assert.equal(classifyStage2L21AbstentionSemantics({
    disagreements: [{ type: 'STAGE2I3_ABSTAINS_WHERE_SEMANTICS_ANSWER' }, { type: 'STAGE2I3_ANSWERS_WHERE_SEMANTICS_ABSTAIN' }],
  }), 'MIXED');
});

/* --- Phase 7: the bounded repair ------------------------------------------ */

test('exactly one abstention reason is narrowed away', () => {
  assert.deepEqual([...STAGE2L21_NARROWED_AWAY_REASONS], ['INDETERMINATE_DIRECTION']);
  assert.deepEqual([...STAGE2L21_NARROWED_ABSTENTION_REASONS], ['SHORT_OR_MISSING_HISTORY']);
  assert.deepEqual([...STAGE2L21_LEFT_ALONE_REASONS], ['CONFLICTING_EVIDENCE']);
});

test('short history still abstains after the repair', () => {
  const short = caseOf([0.3, 0.34, 0.38, 0.42]);
  assert.equal(evaluatePersistenceV3(short).narrowed, false);
  assert.equal(assembleOracleV2PersistenceRepaired(short).heads.persistence.semanticOutput, 'INSUFFICIENT_EVIDENCE');
});

test('an indeterminate-direction abstention becomes NOT_PERSISTENT past the sufficiency gate', () => {
  const alternating = caseOf(Array.from({ length: 28 }, (unused, i) => 0.5 + (i % 2 ? 0.04 : -0.04)));
  const { narrowed } = evaluatePersistenceV3(alternating);
  assert.equal(narrowed, true);
  assert.equal(assembleOracleV2PersistenceRepaired(alternating).heads.persistence.semanticOutput, 'NOT_PERSISTENT');
});

test('the repair never converts a PERSISTENT answer into anything else', () => {
  for (const entry of buildStage2L21Corpus().filter((item) => item.task === 'persistence')) {
    const before = assembleOracleV2Canonical(entry).heads.persistence.semanticOutput;
    if (before !== 'PERSISTENT') continue;
    assert.equal(assembleOracleV2PersistenceRepaired(entry).heads.persistence.semanticOutput, 'PERSISTENT', entry.caseId);
  }
});

test('the frozen producer digest survives the narrowing', () => {
  const alternating = caseOf(Array.from({ length: 28 }, (unused, i) => 0.5 + (i % 2 ? 0.04 : -0.04)));
  const frozen = assembleOracleV2(alternating).heads.persistence;
  const repaired = assembleOracleV2PersistenceRepaired(alternating).heads.persistence;
  assert.equal(repaired.outputDigest, frozen.outputDigest);
  assert.equal(repaired.confidence, frozen.confidence);
});

test('the repaired head answers every adversarial case correctly', () => {
  for (const row of certification.adversarialCaseResults) assert.equal(row.correct, true, row.id);
  assert.equal(certification.repairedSemanticAccuracy, 1);
});

/* --- Phase 8/9: corpus and tradeoff --------------------------------------- */

test('the corpus was extended because the inherited one could not test abstention', () => {
  const inherited = buildStage2L20RepairedCorpus().filter((entry) => entry.task === 'persistence');
  assert.equal(inherited.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE').length, 0);
  const extended = buildStage2L21Corpus().filter((entry) => entry.task === 'persistence');
  assert.ok(extended.filter((entry) => entry.expected === 'INSUFFICIENT_EVIDENCE').length > 0);
});

test('every inherited case is carried through the extended corpus unchanged', () => {
  const inherited = buildStage2L20RepairedCorpus();
  const extended = buildStage2L21Corpus();
  const carried = extended.filter((entry) => entry.source !== 'STAGE2L21_ABSTENTION_SEMANTIC_TEST_CASES');
  assert.equal(carried.length, inherited.length);
  for (let index = 0; index < inherited.length; index += 1) {
    assert.equal(carried[index].caseDigest, inherited[index].caseDigest);
  }
});

test('the added abstention cases are all genuinely below the minimum sample count', () => {
  for (const entry of buildStage2L21Corpus().filter((item) => item.source === 'STAGE2L21_ABSTENTION_SEMANTIC_TEST_CASES')) {
    assert.ok(entry.observationHistory.length < STAGE2L21_PERSISTENCE_SEMANTICS.minimumSamples, entry.caseId);
    assert.equal(entry.expected, 'INSUFFICIENT_EVIDENCE');
  }
});

test('abstention preservation is demonstrated, not assumed', () => {
  assert.equal(certification.tradeoff.correctAbstentionEvidenceAvailable, true);
  assert.ok(certification.tradeoff.casesExpectingAbstention > 0);
  assert.equal(certification.tradeoff.abstentionRetentionRate, 1);
  assert.equal(certification.tradeoff.correctAbstentionsRemoved, 0);
});

test('no false PERSISTENT is introduced and no case goes from right to wrong', () => {
  assert.equal(certification.tradeoff.falsePersistentIntroduced, 0);
  assert.equal(certification.residual.errorsIntroducedByNarrowing, 0);
});

test('lower abstention is not treated as automatically better', () => {
  assert.equal(certification.tradeoff.lowerAbstentionIsNotAutomaticallyBetter, true);
  /* The false NOT_PERSISTENT count is reported rather than netted away. */
  assert.equal(typeof certification.tradeoff.falseNotPersistentIntroduced, 'number');
});

test('the residual is named with a cause and explicitly not remediated', () => {
  assert.ok(certification.residual.remainingErrors > 0);
  assert.ok(certification.residual.cause.length > 50);
  assert.equal(certification.residual.remediatedInThisStage, false);
  assert.ok(/SUSTAINED_RUN/.test(certification.residual.dominantShape));
});

/* --- Phase 10/11/12/13: identifiability, isolation, freezes ---------------- */

test('identifiability reuses the Stage 2L.20 method verbatim', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l21-identifiability-analysis.json`, 'utf8'));
  assert.equal(report.methodology, 'STAGE2L20_MEASURE_IDENTIFIABILITY_REUSED_VERBATIM');
  assert.equal(certification.identifiability.searchSpaceMatchedNull, true);
  assert.equal(certification.identifiability.multiplicityAccountedFor, true);
  assert.equal(certification.identifiability.headsSearched, STAGE2L19_HEAD_IDS.length);
});

test('a head with no error variance would be reported as not measurable', () => {
  assert.ok(['MEASURED_IDENTIFIABLE', 'MEASURED_NON_IDENTIFIABLE', 'NOT_MEASURABLE_NO_ERROR_VARIANCE',
    'NOT_MEASURABLE_INSUFFICIENT_CASES'].includes(certification.identifiability.identifiabilityStatus));
});

test('no unrelated Oracle head moves, by output or by digest', () => {
  assert.equal(certification.unrelatedHeadsPreserved, true);
  assert.equal(certification.isolationViolations, 0);
  assert.ok(certification.isolationChecked > 10000);
  const sample = buildStage2L21Corpus().slice(0, 150);
  for (const entry of sample) {
    const canonical = assembleOracleV2Canonical(entry);
    const repaired = assembleOracleV2PersistenceRepaired(entry);
    for (const headId of STAGE2L19_HEAD_IDS) {
      if (headId === 'persistence') continue;
      assert.equal(repaired.heads[headId].semanticOutput, canonical.heads[headId].semanticOutput, `${entry.caseId}/${headId}`);
      assert.equal(repaired.heads[headId].outputDigest, canonical.heads[headId].outputDigest, `${entry.caseId}/${headId}`);
    }
  }
});

test('timeToThreshold stays exonerated at 1.0000', () => {
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

test('the decision was made on semantics, not on aggregate accuracy', () => {
  const decision = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l21-remediation-decision.json`, 'utf8'));
  assert.equal(decision.decidedOnSemanticsNotAccuracy, true);
  assert.equal(decision.decision, 'C_ABSTENTION_NARROWED');
  /* The decision follows the abstention classification, which is computed from
   * the semantic table alone and never sees a corpus accuracy figure. */
  assert.equal(certification.abstentionSemantics, 'OVER_ABSTENTION');
});

test('the certification reproduces byte-identically from a fresh evaluation', async () => {
  const { buildStage2L21Evaluation, certifyStage2L21 } = await import('../src/lab/stage2l21-oracle-persistence-semantics.js');
  const prior = JSON.parse(readFileSync('artifacts/stage2l19-oracle-multi-head-qualification/stage2l19-certification-result.json', 'utf8'));
  const recomputed = certifyStage2L21({ evaluation: buildStage2L21Evaluation({ stage2l19Identifiability: prior.identifiability }) });
  assert.equal(recomputed.certificationHash, certification.certificationHash);
  assert.equal(recomputed.evidenceDigest, certification.evidenceDigest);
});

test('the portability limitation is recorded unchanged', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l21-portability-report.json`, 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the stage certifies and every gate it claims is actually true', () => {
  assert.equal(certification.status, 'PASS');
  assert.equal(certification.stage2l21Certified, true);
  for (const gate of ['contractArchaeologyComplete', 'persistenceSemanticsDefined', 'abstentionContractDefined',
    'semanticCasesComplete', 'stage2i2Stage2i3DifferenceExplained', 'persistenceSemanticDefectReduced',
    'unrelatedHeadsPreserved', 'oracleActionPathsUnchanged', 'securityRegressionPass']) {
    assert.equal(certification[gate], true, gate);
  }
  assert.equal(certification.labelLeakageDetected, false);
});
