import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { assembleOracleV2, buildOracleV2Holdout } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import { evaluateStage2I2Head } from '../src/lab/stage2i2-oracle-task-head-diagnostic.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { STAGE2L19_HEAD_IDS, buildStage2L19StressCorpus } from '../src/lab/stage2l19-oracle-multi-head-qualification.js';
import {
  STAGE2L20_AFFECTED_HEADS,
  STAGE2L20_CANONICAL_LABEL_SETS,
  STAGE2L20_PERSISTENCE_CANONICAL_LABEL,
  STAGE2L20_PERSISTENCE_LEGACY_LABEL,
  STAGE2L20_SEMANTIC_ALIASES,
  STAGE2L20_THRESHOLD,
  assembleOracleV2Canonical,
  auditStage2L20ContractOwners,
  canonicaliseLabel,
  classifyStage2L20Diagnostic,
  diagnoseStage2L20TimeToThreshold,
  buildStage2L20RepairedCorpus,
  measureStage2L20ActionPaths,
  measureStage2L20Bijection,
  measureStage2L20Reachability,
  runStage2L20BoundaryTests,
  stage2L20CrossingWellPosed,
} from '../src/lab/stage2l20-oracle-vocabulary-alignment.js';

const ARTIFACTS = 'artifacts/stage2l20-oracle-vocabulary-alignment';
const certification = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l20-certification-result.json`, 'utf8'));

/* --- Phase 1: contract owner audit ---------------------------------------- */

test('producer label sets are probed off the implementation, not the head table', () => {
  const audit = auditStage2L20ContractOwners();
  const ttt = audit.heads.find((head) => head.headId === 'timeToThreshold');
  assert.ok(ttt.producerLabels.includes('CROSSING_1_TO_3'));
  assert.ok(ttt.producerLabels.includes('CROSSING_4_TO_8'));
  /* Stage 2L.19's declared outputs omit both, which is exactly the drift a
   * probe catches and a copied table does not. */
  assert.equal(ttt.declaredMatchesProducer, false);
});

test('the contract audit is complete for both affected heads', () => {
  const audit = auditStage2L20ContractOwners();
  assert.equal(audit.complete, true);
  assert.deepEqual(audit.heads.map((head) => head.headId), [...STAGE2L20_AFFECTED_HEADS]);
  for (const head of audit.heads) {
    for (const field of ['implementationOwner', 'schemaOwners', 'corpusOwner', 'benchmarkOwner', 'testOwner', 'serializationOwner']) {
      assert.ok(head[field], `${head.headId} missing ${field}`);
    }
  }
});

test('the persistence divergence is owned by the producer, not the benchmark', () => {
  const persistence = auditStage2L20ContractOwners().heads.find((head) => head.headId === 'persistence');
  assert.ok(persistence.producerLabels.includes(STAGE2L20_PERSISTENCE_LEGACY_LABEL));
  assert.ok(persistence.inheritedBenchmarkLabels.includes(STAGE2L20_PERSISTENCE_CANONICAL_LABEL));
  assert.ok(persistence.implementationOwner.includes('stage2i3'));
  assert.ok(persistence.originalImplementationOwner.includes('stage2i2'));
});

/* --- Phase 2: bijection ---------------------------------------------------- */

test('canonicalisation maps the legacy label and leaves every other label alone', () => {
  assert.equal(canonicaliseLabel(STAGE2L20_PERSISTENCE_LEGACY_LABEL), STAGE2L20_PERSISTENCE_CANONICAL_LABEL);
  for (const label of ['PERSISTENT', 'INSUFFICIENT_EVIDENCE', 'CROSSING_1_TO_3', 'ALREADY_CROSSED', 'UP']) {
    assert.equal(canonicaliseLabel(label), label);
  }
});

test('the alias table has exactly one entry and it is not circular', () => {
  const entries = Object.entries(STAGE2L20_SEMANTIC_ALIASES);
  assert.equal(entries.length, 1);
  for (const [from, to] of entries) {
    assert.notEqual(from, to);
    assert.ok(!Object.hasOwn(STAGE2L20_SEMANTIC_ALIASES, to), 'alias target is itself an alias');
  }
});

test('no benchmark label is beyond the producer vocabulary after canonicalisation', () => {
  const bijection = measureStage2L20Bijection(auditStage2L20ContractOwners());
  assert.equal(bijection.bijectionValid, true);
  for (const head of bijection.heads) assert.deepEqual(head.unreachableAfterCanonicalisation, []);
});

test('no casing collisions are introduced', () => {
  for (const head of measureStage2L20Bijection(auditStage2L20ContractOwners()).heads) {
    assert.deepEqual(head.casingCollisions, []);
  }
});

/* --- Phase 3: persistence repair ------------------------------------------ */

test('the canonical assembly never emits the legacy persistence label', () => {
  for (const entry of buildStage2L19StressCorpus().filter((item) => item.task === 'persistence')) {
    const head = assembleOracleV2Canonical(entry).heads.persistence;
    assert.notEqual(head.semanticOutput, STAGE2L20_PERSISTENCE_LEGACY_LABEL, entry.caseId);
    assert.notEqual(head.rawSemanticOutput, STAGE2L20_PERSISTENCE_LEGACY_LABEL, entry.caseId);
  }
});

test('the frozen producer digest survives canonicalisation untouched', () => {
  const entry = buildStage2L19StressCorpus().find((item) => item.task === 'persistence');
  const frozen = assembleOracleV2(entry);
  const canonical = assembleOracleV2Canonical(entry);
  assert.equal(canonical.heads.persistence.outputDigest, frozen.heads.persistence.outputDigest);
  assert.equal(canonical.provenance.historyDigest, frozen.provenance.historyDigest);
});

test('canonicalisation changes the label and nothing else about the head', () => {
  const entry = buildStage2L19StressCorpus()
    .find((item) => item.task === 'persistence'
      && assembleOracleV2(item).heads.persistence.semanticOutput === STAGE2L20_PERSISTENCE_LEGACY_LABEL);
  assert.ok(entry, 'expected at least one case emitting the legacy label');
  const frozen = assembleOracleV2(entry).heads.persistence;
  const canonical = assembleOracleV2Canonical(entry).heads.persistence;
  assert.equal(canonical.semanticOutput, STAGE2L20_PERSISTENCE_CANONICAL_LABEL);
  assert.equal(canonical.confidence, frozen.confidence);
  assert.equal(canonical.supported, frozen.supported);
  assert.equal(canonical.supportContext, frozen.supportContext);
});

/* --- Phase 4: timeToThreshold, the producer was right --------------------- */

test('the crossing state is legitimate and the producer already handles it', () => {
  const diagnosis = diagnoseStage2L20TimeToThreshold();
  assert.equal(diagnosis.semanticStateLegitimate, true);
  assert.equal(diagnosis.producerLabelOnWellPosedCase, 'CROSSING_1_TO_3');
  assert.equal(diagnosis.producerChanged, false);
});

test('every benchmark case claiming the label is already past the threshold', () => {
  const diagnosis = diagnoseStage2L20TimeToThreshold();
  assert.equal(diagnosis.everyBenchmarkClaimIllPosed, true);
  for (const family of diagnosis.benchmarkFamilies) {
    assert.ok(family.casesClaimingLabel > 0, family.corpus);
    assert.equal(family.casesWhoseLastValueIsAlreadyPastThreshold, family.casesClaimingLabel, family.corpus);
  }
});

test('the defect is classified as an invalid benchmark label, not a missing branch', () => {
  assert.equal(diagnoseStage2L20TimeToThreshold().defectClass, 'B_BENCHMARK_LABEL_INVALID');
  assert.equal(certification.timeToThreshold.repairOwner, 'BENCHMARK_CORPUS_GENERATOR');
});

test('the corrected well-posedness rule rejects what Stage 2L.19 accepted', () => {
  const slope = 0.012;
  /* A Stage 2L.19-shaped case: crossing inside the window, so it ends above. */
  const illPosed = Array.from({ length: 24 }, (unused, i) => 0.4 + i * slope);
  assert.equal(stage2L20CrossingWellPosed(illPosed, STAGE2L20_THRESHOLD, 1, 3), false);
  /* A genuinely approaching case: ends below, two ticks short. */
  const wellPosed = Array.from({ length: 24 }, (unused, i) => (STAGE2L20_THRESHOLD - 2 * slope) - (23 - i) * slope);
  assert.equal(stage2L20CrossingWellPosed(wellPosed, STAGE2L20_THRESHOLD, 1, 3), true);
});

/* --- Phase 5: boundaries --------------------------------------------------- */

test('every probed state maps to exactly one label, deterministically', () => {
  const boundaries = runStage2L20BoundaryTests();
  assert.equal(boundaries.nonDeterministicCases, 0);
  assert.equal(boundaries.unlabelledStates, 0);
  assert.deepEqual(boundaries.insideBucketDisagreements, []);
  assert.equal(boundaries.deterministicSingleLabelPerState, true);
});

test('the exact-edge float sensitivity is reported rather than smoothed away', () => {
  const boundaries = runStage2L20BoundaryTests();
  if (boundaries.exactEdgeFloatSensitiveCases.length > 0) {
    assert.ok(boundaries.exactEdgeFloatSensitivityNote);
    for (const row of boundaries.exactEdgeFloatSensitiveCases) assert.equal(row.placement, 'EXACT_EDGE');
  }
});

test('the repaired corpus targets bucket interiors, never the edge', () => {
  for (const entry of buildStage2L20RepairedCorpus()
    .filter((item) => item.source === 'STAGE2L20_REPAIRED_CROSSING_CORPUS' && item.parameters.slope !== undefined)) {
    const values = entry.observationHistory.map((frame) => frame.channels.alpha);
    const last = values.at(-1);
    assert.ok(last < STAGE2L20_THRESHOLD, entry.caseId);
    const exact = (STAGE2L20_THRESHOLD - last) / entry.parameters.slope;
    assert.ok(Math.abs(exact - Math.round(exact)) > 0.2, `${entry.caseId} sits on a bucket edge`);
  }
});

test('boundary probes agree with the contract everywhere inside a bucket', () => {
  for (const row of runStage2L20BoundaryTests().timeToThreshold) {
    if (row.placement !== 'INSIDE_BUCKET') continue;
    assert.equal(row.emitted, row.expected, `ticks=${row.ticksToThreshold}`);
  }
});

/* --- Phase 6: reachability -------------------------------------------------*/

test('every canonical label is reachable on the repaired corpus', () => {
  const reach = measureStage2L20Reachability(buildStage2L20RepairedCorpus());
  assert.equal(reach.allCanonicalLabelsReachable, true);
  for (const head of reach.heads) {
    assert.deepEqual(head.unreachableLabels, []);
    assert.equal(head.reachableCount, STAGE2L20_CANONICAL_LABEL_SETS[head.headId].length);
  }
});

test('the inherited corpus still cannot reach every label, which is why it was repaired', () => {
  const inherited = measureStage2L20Reachability(buildOracleV2Holdout());
  assert.equal(inherited.allCanonicalLabelsReachable, false);
});

/* --- Phase 7: scoped corpus repair and preservation ----------------------- */

test('only the proven-defective family is regenerated; every other case is byte-identical', () => {
  assert.equal(certification.corpusReport.carriedCasesByteIdentical, true);
  assert.equal(certification.corpusReport.removedIllPosedCases, 45);
  assert.deepEqual([...certification.corpusReport.repairedFamilies].sort(),
    ['timeToThreshold/APPROACHING', 'timeToThreshold/APPROACHING_4_TO_8']);
});

test('no unrelated Oracle head changes by output or by digest', () => {
  assert.equal(certification.unrelatedHeadsPreserved, true);
  const sample = buildStage2L19StressCorpus().filter((entry) => !STAGE2L20_AFFECTED_HEADS.includes(entry.task)).slice(0, 200);
  for (const entry of sample) {
    const frozen = assembleOracleV2(entry);
    const canonical = assembleOracleV2Canonical(entry);
    for (const headId of STAGE2L19_HEAD_IDS) {
      if (STAGE2L20_AFFECTED_HEADS.includes(headId)) continue;
      assert.equal(canonical.heads[headId].semanticOutput, frozen.heads[headId].semanticOutput, `${entry.caseId}/${headId}`);
      assert.equal(canonical.heads[headId].outputDigest, frozen.heads[headId].outputDigest, `${entry.caseId}/${headId}`);
    }
  }
});

test('timeToThreshold improves and persistence does not, which is the finding', () => {
  const before = certification.blindBefore.heads.find((head) => head.headId === 'timeToThreshold');
  const after = certification.blindAfter.heads.find((head) => head.headId === 'timeToThreshold');
  assert.ok(after.accuracy > before.accuracy);
  const pBefore = certification.blindBefore.heads.find((head) => head.headId === 'persistence');
  const pAfter = certification.blindAfter.heads.find((head) => head.headId === 'persistence');
  assert.equal(pAfter.accuracy, pBefore.accuracy);
});

/* --- Phase 8: identifiability method fidelity ------------------------------ */

test('the reimplemented identifiability method reproduces Stage 2L.19 exactly', () => {
  assert.equal(certification.faithfulness.methodologyFaithful, true);
  assert.equal(certification.faithfulness.faithfulHeadCount, certification.faithfulness.totalHeads);
  for (const head of certification.faithfulness.heads) assert.deepEqual(head.mismatchedFields, []);
});

test('the null is search-space matched and multiplicity is still corrected', () => {
  for (const head of certification.identifiability) {
    assert.equal(head.searchSpaceMatchedNull, true);
    assert.equal(head.multiplicityAccountedFor, true);
    assert.equal(head.headsSearched, STAGE2L19_HEAD_IDS.length);
  }
});

test('a head with no wrong cases is still not called non-identifiable', () => {
  const ttt = certification.identifiability.find((head) => head.headId === 'timeToThreshold');
  assert.equal(ttt.identifiabilityStatus, 'NOT_MEASURABLE_NO_ERROR_VARIANCE');
  assert.notEqual(ttt.identifiabilityStatus, 'MEASURED_NON_IDENTIFIABLE');
});

/* --- Phase 9: diagnostic utility, no fabricated action value --------------- */

test('diagnostic classes are label-only and never claim Prime-relative utility', () => {
  const text = JSON.stringify(certification.diagnostics) + JSON.stringify(certification.interpretation);
  assert.ok(!text.includes('POSITIVE_SPECIALIST_UTILITY'));
  assert.ok(!/delegat/i.test(JSON.stringify(certification.diagnostics)));
});

test('a head below its trivial baseline is classified negative, not weak', () => {
  assert.equal(classifyStage2L20Diagnostic({ cases: 100, distinctPredictions: ['A', 'B'], liftOverTrivialBaseline: -0.16 }), 'NEGATIVE_DIAGNOSTIC');
  assert.equal(classifyStage2L20Diagnostic({ cases: 100, distinctPredictions: ['A'], liftOverTrivialBaseline: 0.9 }), 'REDUNDANT');
  assert.equal(classifyStage2L20Diagnostic({ cases: 0, distinctPredictions: [], liftOverTrivialBaseline: 0 }), 'INCONCLUSIVE');
});

/* --- Phase 10/11/12: boundaries that must not move ------------------------ */

test('no action path is added and the Arbiter Oracle schema is not widened', () => {
  const paths = measureStage2L20ActionPaths();
  assert.deepEqual(paths.actionPathsBefore, paths.actionPathsAfter);
  assert.deepEqual(paths.actionPathsBefore, ['direction']);
  assert.equal(paths.unchanged, true);
  assert.equal(paths.arbiterOracleSchemaWidened, false);
  assert.deepEqual(paths.forbiddenActionFieldsPresent, []);
});

test('the canonical assembly emits no action field on any head', () => {
  const probe = assembleOracleV2Canonical(buildStage2L19StressCorpus()[0]);
  for (const field of ['recommendedAction', 'selectedAction', 'actionAdjustment', 'actionBias', 'dispatchAction']) {
    assert.ok(!Object.hasOwn(probe, field));
    for (const head of Object.values(probe.heads)) assert.ok(!Object.hasOwn(head, field));
  }
});

test('the reliability floor and the R0 boundary are untouched', () => {
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.nexusBehaviorChanged, false);
});

test('no frozen Oracle producer was edited', () => {
  assert.equal(certification.freeze.oracleProducerChanged, false);
  assert.equal(certification.freeze.oracleAlgorithmChanged, false);
  assert.equal(certification.freeze.repairShape, 'SUPERSEDING_CANONICAL_VIEW_PLUS_SCOPED_CORPUS_REGENERATION');
});

/* --- The residual finding --------------------------------------------------*/

test('the deeper persistence defect is named, owned, and explicitly not patched', () => {
  const residual = certification.residual;
  assert.equal(residual.renameAccuracyDeltaOnStressCorpus, 0);
  assert.equal(residual.renameAccuracyDeltaOnInheritedCorpus, 0);
  assert.equal(residual.accuracyCeilingExplainedByVocabulary, false);
  assert.equal(residual.deeperDefectClass, 'ABSTENTION_SEMANTICS_DIVERGENCE');
  assert.ok(residual.deeperDefectOwner.includes('stage2i3'));
  assert.equal(residual.remediatedInThisStage, false);
});

test('the outcome reflects the deeper defect rather than the repaired contracts alone', () => {
  assert.equal(certification.bothContractsRepaired, true);
  assert.equal(certification.oracleVocabularyOutcome, 'E_DEEPER_HEAD_SEMANTICS_DEFECT');
});

test('the abstention divergence claim is true of the actual frozen heads', () => {
  /* A pure alternating series: the original head answers, the remediated one abstains. */
  const values = Array.from({ length: 28 }, (unused, i) => 0.5 + (i % 2 ? 0.04 : -0.04));
  const entry = { caseId: 'test-alternating', observationHistory: values.map((value, tick) => ({ tick, channels: { alpha: value } })) };
  assert.equal(evaluateStage2I2Head('PERSISTENCE_HEAD', entry).semanticOutput, 'NOT_PERSISTENT');
  assert.equal(assembleOracleV2Canonical(entry).heads.persistence.semanticOutput, 'INSUFFICIENT_EVIDENCE');
});

/* --- Certification --------------------------------------------------------- */

test('the certification reproduces byte-identically from a fresh evaluation', async () => {
  const { buildStage2L20Evaluation, certifyStage2L20 } = await import('../src/lab/stage2l20-oracle-vocabulary-alignment.js');
  const prior = JSON.parse(readFileSync('artifacts/stage2l19-oracle-multi-head-qualification/stage2l19-certification-result.json', 'utf8'));
  const recomputed = certifyStage2L20({ evaluation: buildStage2L20Evaluation({ stage2l19Identifiability: prior.identifiability }) });
  assert.equal(recomputed.certificationHash, certification.certificationHash);
  assert.equal(recomputed.evidenceDigest, certification.evidenceDigest);
});

test('the portability limitation is recorded unchanged, not remediated', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l20-portability-report.json`, 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the stage certifies and every gate it claims is actually true', () => {
  assert.equal(certification.status, 'PASS');
  assert.equal(certification.stage2l20Certified, true);
  for (const gate of ['contractOwnerAuditComplete', 'vocabularyBijectionValid', 'persistenceDefectResolved',
    'timeToThresholdDefectResolved', 'allCanonicalLabelsReachable', 'oracleActionPathsUnchanged',
    'unrelatedHeadsPreserved', 'securityRegressionPass']) {
    assert.equal(certification[gate], true, gate);
  }
  assert.equal(certification.labelLeakageDetected, false);
});
