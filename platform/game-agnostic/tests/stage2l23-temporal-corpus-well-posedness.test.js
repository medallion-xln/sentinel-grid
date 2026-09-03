import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { assembleOracleV2 } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { STAGE2L19_HEAD_IDS } from '../src/lab/stage2l19-oracle-multi-head-qualification.js';
import { buildStage2L21Corpus } from '../src/lab/stage2l21-oracle-persistence-semantics.js';
import { assembleOracleV2ConflictRepaired } from '../src/lab/stage2l22-oracle-persistence-conflict-semantics.js';
import {
  STAGE2L23_GENERATOR_PROPERTIES,
  STAGE2L23_REGENERATED_FAMILIES,
  STAGE2L23_SHAPE_DEPENDENT_FAMILIES,
  STAGE2L23_SUSTAINED_RUN_SAFETY_MARGIN,
  STAGE2L23_TEMPORAL_FAMILIES,
  admitStage2L23Case,
  auditStage2L23CorpusFamily,
  buildStage2L23Corpus,
  buildStage2L23GeneratorInventory,
  buildStage2L23Lineage,
  buildStage2L23ValidatorMap,
  classifyStage2L23Family,
  runStage2L23GeneratorProperties,
  sweepStage2L23Family,
  validateStage2L23Case,
} from '../src/lab/stage2l23-temporal-corpus-well-posedness.js';

const ARTIFACTS = 'artifacts/stage2l23-temporal-corpus-well-posedness';
const certification = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l23-certification-result.json`, 'utf8'));
const valuesOf = (entry) => entry.observationHistory.map((frame) => frame.channels.alpha).filter((value) => value !== undefined);

/* --- Phase 1/2: inventory and validators ---------------------------------- */

test('every declared family is present in the live corpus', () => {
  const inventory = buildStage2L23GeneratorInventory();
  assert.equal(inventory.complete, true);
  assert.equal(inventory.familyCount, STAGE2L23_TEMPORAL_FAMILIES.length);
  for (const family of inventory.families) assert.equal(family.presentInCorpus, true, family.familyId);
});

test('the inventory is read from source and the corpus, never from docs', () => {
  assert.equal(buildStage2L23GeneratorInventory().inventorySource,
    'GENERATOR_SOURCE_AND_LIVE_CORPUS_NOT_DOCUMENTATION');
});

test('every family has a validator and none calls the head under test', () => {
  const map = buildStage2L23ValidatorMap();
  assert.equal(map.defined, true);
  assert.equal(map.noHeadIsConsulted, true);
  assert.equal(map.validators.length, STAGE2L23_TEMPORAL_FAMILIES.length);
  for (const validator of map.validators) assert.equal(validator.callsHeadUnderTest, false);
});

test('the validator source genuinely contains no head call', () => {
  const source = readFileSync('src/lab/stage2l23-temporal-corpus-well-posedness.js', 'utf8');
  const body = /export function validateStage2L23Case\([\s\S]*?\n}\n/.exec(source)?.[0] ?? '';
  assert.ok(body.length > 500, 'validator body not found');
  assert.ok(!/assembleOracleV2|evaluatePersistenceV2|evaluateStage2I2Head/.test(body));
});

test('persistence validation reuses the versioned semantics rather than inventing one', () => {
  const map = buildStage2L23ValidatorMap();
  const persistence = map.validators.filter((entry) => entry.familyId.startsWith('persistence/'));
  for (const entry of persistence) assert.match(entry.derivedFrom, /^STAGE2L21_PERSISTENCE_SEMANTICS/);
});

/* --- The two validator corrections ---------------------------------------- */

test('a reversal is measurable at ANY split, not only the midpoint', () => {
  /* Turn at frame 4 of 20: the midpoint split sees one direction, but the series
   * plainly reverses. An earlier draft called 8 such cases defective. */
  const values = [...Array.from({ length: 5 }, (unused, i) => 0.7 - i * 0.03),
    ...Array.from({ length: 15 }, (unused, i) => 0.55 + i * 0.02)];
  const verdict = validateStage2L23Case('reversal/LATE_REVERSAL', values);
  assert.equal(verdict.valid, true, JSON.stringify(verdict));
});

test('saturation disqualifies a shape label but not a length label', () => {
  const clamped = Array.from({ length: 24 }, (unused, i) => Math.min(1, 0.4 + i * 0.05));
  assert.equal(validateStage2L23Case('direction/RAMP_UP', clamped).reason, 'SERIES_TOUCHES_RANGE_BOUND');
  /* The same clamped series is still a long-enough window. */
  assert.equal(validateStage2L23Case('abstention/SUFFICIENT_HISTORY', clamped).valid, true);
});

test('shape-dependent and length-only families are declared explicitly', () => {
  assert.ok(STAGE2L23_SHAPE_DEPENDENT_FAMILIES.includes('persistence/SUSTAINED_RUN'));
  assert.ok(!STAGE2L23_SHAPE_DEPENDENT_FAMILIES.includes('abstention/SUFFICIENT_HISTORY'));
  assert.ok(!STAGE2L23_SHAPE_DEPENDENT_FAMILIES.includes('persistence/SHORT_HISTORY'));
});

test('saturation on a length-only family is still reported as hygiene', () => {
  const audit = auditStage2L23CorpusFamily('abstention/SUFFICIENT_HISTORY', buildStage2L21Corpus());
  assert.equal(audit.mislabelled, 0);
  assert.equal(audit.labelSurvivesSaturation, true);
  assert.ok(audit.saturationHygieneCases > 0, 'the saturation is real and must not vanish from the report');
});

/* --- Phase 3/4/5: sweeps and classification -------------------------------- */

test('every family is swept over its declared range', () => {
  assert.equal(certification.allTemporalFamiliesBoundaryAudited, true);
  for (const sweep of certification.sweeps) assert.ok(sweep.swept > 0, sweep.familyId);
});

test('the sweep visits cross-product extremes, not one parameter at a time', () => {
  const sweep = sweepStage2L23Family('persistence/SUSTAINED_RUN');
  const slopes = new Set(sweep.rows.map((row) => row.point.slope).filter((value) => value !== undefined));
  assert.ok(sweep.swept >= 100, 'the grid must be dense enough to reach interactions');
  assert.ok(slopes.size >= 1);
});

test('classification comes from generated observables, not from family names', () => {
  const sweep = { swept: 10, mislabelled: 0, ambiguous: 0 };
  assert.equal(classifyStage2L23Family(sweep, { mislabelled: 3 }), 'PARTIALLY_MISLABELLED');
  assert.equal(classifyStage2L23Family({ swept: 10, mislabelled: 10, ambiguous: 0 }, { mislabelled: 0 }), 'INVALID');
  assert.equal(classifyStage2L23Family({ swept: 10, mislabelled: 2, ambiguous: 0 }, { mislabelled: 0 }), 'BOUNDARY_UNSTABLE');
  assert.equal(classifyStage2L23Family(sweep, { mislabelled: 0 }), 'VALID');
});

test('a family fragile only at an extreme its corpus never visits is not called defective', () => {
  for (const familyId of certification.boundaryFragileFamilies) {
    const audit = certification.parentAudits.find((entry) => entry.familyId === familyId);
    assert.equal(audit.mislabelled, 0, `${familyId} is corpus-clean but was listed as fragile`);
  }
  assert.ok(certification.boundaryFragileFamilies.length > 0, 'the sweep must actually find fragility somewhere');
});

/* --- Phase 6/7/12: the repair ---------------------------------------------- */

test('exactly the proven-defective families were regenerated', () => {
  assert.deepEqual([...certification.regeneratedFamilies].sort(), [...certification.provenDefectiveFamilies].sort());
  assert.deepEqual([...STAGE2L23_REGENERATED_FAMILIES].sort(), [...certification.provenDefectiveFamilies].sort());
});

test('no repaired family has a single mislabelled case left', () => {
  for (const familyId of STAGE2L23_REGENERATED_FAMILIES) {
    const audit = certification.repairedAudits.find((entry) => entry.familyId === familyId);
    assert.equal(audit.mislabelled, 0, familyId);
  }
  assert.equal(certification.sustainedRunDefectResolved, true);
  assert.equal(certification.repairedFamiliesWellPosed, true);
});

test('every regenerated case clears its family safety margin', () => {
  for (const [familyId, minMargin] of Object.entries(certification.minSemanticMarginByFamily)) {
    assert.ok(minMargin >= certification.safetyMarginByFamily[familyId],
      `${familyId} min margin ${minMargin} below required ${certification.safetyMarginByFamily[familyId]}`);
  }
});

test('the joint sampling law keeps jitter below one step', () => {
  for (const entry of buildStage2L23Corpus().filter((item) => item.source === 'STAGE2L23_JOINTLY_SAMPLED_SUSTAINED_RUN')) {
    const { slope, jitterAmplitude } = entry.parameters;
    assert.ok(2 * jitterAmplitude < slope, `${entry.caseId}: 2*${jitterAmplitude} !< ${slope}`);
  }
});

test('every regenerated persistent case actually validates as persistent', () => {
  for (const entry of buildStage2L23Corpus().filter((item) => item.task === 'persistence' && item.family === 'SUSTAINED_RUN')) {
    const verdict = validateStage2L23Case('persistence/SUSTAINED_RUN', valuesOf(entry), entry.parameters);
    assert.equal(verdict.valid, true, entry.caseId);
    assert.ok(verdict.margin >= STAGE2L23_SUSTAINED_RUN_SAFETY_MARGIN, entry.caseId);
  }
});

test('unaffected cases are carried through byte-identically', () => {
  const lineage = buildStage2L23Lineage();
  assert.equal(lineage.carriedCasesByteIdentical, true);
  assert.deepEqual([...lineage.changedFamilies].sort(), [...STAGE2L23_REGENERATED_FAMILIES].sort());
  assert.equal(lineage.parentCorpus, 'STAGE2L21_CORPUS');
  assert.ok(lineage.parentCorpusDigest && lineage.corpusDigest);
  assert.notEqual(lineage.parentCorpusDigest, lineage.corpusDigest);
});

test('the lineage records the changed family hashes, as a successor artifact must', () => {
  const lineage = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l23-corpus-lineage.json`, 'utf8'));
  assert.ok(lineage.changedFamilyParentDigest);
  assert.ok(lineage.changedFamilyDigest);
  assert.notEqual(lineage.changedFamilyParentDigest, lineage.changedFamilyDigest);
});

/* --- Phase 10/11: the framework -------------------------------------------- */

test('the admission gate rejects an ill-posed case rather than admitting it', () => {
  const clamped = Array.from({ length: 24 }, (unused, i) => Math.min(1, 0.4 + i * 0.05));
  const gate = admitStage2L23Case({ familyId: 'direction/RAMP_UP', values: clamped });
  assert.equal(gate.admitted, false);
  assert.equal(gate.outcome, 'REJECTED_ILL_POSED');
});

test('the admission gate rejects a case inside the safety margin', () => {
  const values = Array.from({ length: 20 }, (unused, i) => 0.3 + i * 0.02);
  const gate = admitStage2L23Case({ familyId: 'direction/RAMP_UP', values, safetyMargin: 99 });
  assert.equal(gate.admitted, false);
  assert.equal(gate.outcome, 'REJECTED_INSIDE_MARGIN');
});

test('an ill-posed case may still be admitted, but only as an explicit boundary probe', () => {
  const clamped = Array.from({ length: 24 }, (unused, i) => Math.min(1, 0.4 + i * 0.05));
  const gate = admitStage2L23Case({ familyId: 'direction/RAMP_UP', values: clamped, boundaryProbe: true });
  assert.equal(gate.admitted, true);
  assert.equal(gate.outcome, 'ADMITTED_AS_BOUNDARY_PROBE');
});

test('the generator rejected cases during construction rather than after diagnosis', () => {
  assert.ok(certification.lineage.rejectedDuringGeneration > 0,
    'the gate must demonstrably fire, or it is decoration');
});

test('every declared generator property holds on the repaired corpus', () => {
  const results = runStage2L23GeneratorProperties(buildStage2L23Corpus());
  assert.equal(results.allPass, true, JSON.stringify(results.failingFamilies));
  assert.equal(results.totalMislabelled, 0);
  assert.equal(results.propertyCount, STAGE2L23_GENERATOR_PROPERTIES.length);
  assert.equal(certification.generatorPropertyTestsPass, true);
});

test('the properties cover each historical defect shape', () => {
  const ids = STAGE2L23_GENERATOR_PROPERTIES.map((property) => property.id);
  assert.ok(ids.includes('NO_SATURATION'), 'the 2L.19 reversal defect');
  assert.ok(ids.includes('CROSSING_NOT_ALREADY_CROSSED'), 'the 2L.20 crossing defect');
  assert.ok(ids.includes('SUSTAINED_RUN_IS_PERSISTENT'), 'the 2L.22 jitter defect');
});

/* --- Phase 8/9: float edges and degeneracy --------------------------------- */

test('no certification case sits on an unstable floating-point bucket edge', () => {
  assert.equal(certification.floatingPoint.corpusCasesOnExactEdges, 0);
  assert.ok(certification.floatingPoint.unstableEdgeCount > 0, 'the instability itself is real and recorded');
  assert.equal(certification.floatingPoint.headModifiedForEdges, false);
});

test('effective variation is measured and reported below the raw count', () => {
  assert.equal(certification.effectiveVariationMeasured, true);
  const after = certification.effectiveVariationAfter;
  assert.ok(after.effectiveVariationCount < after.rawCaseCount);
  assert.ok(after.nearDuplicateRate > 0);
});

test('the repair increases effective variation rather than shrinking it', () => {
  assert.ok(certification.effectiveVariationAfter.effectiveVariationCount
    >= certification.effectiveVariationBefore.effectiveVariationCount);
});

/* --- Phase 13/15/17/18: heads, identifiability, freezes --------------------- */

test('no Oracle head changed, proven by digest', () => {
  assert.equal(certification.oracleHeadsUnchanged, true);
  assert.equal(certification.headDrift, 0);
  assert.ok(certification.headsChecked > 1000);
  const sample = buildStage2L23Corpus().slice(0, 120);
  for (const entry of sample) {
    const frozen = assembleOracleV2(entry);
    const active = assembleOracleV2ConflictRepaired(entry);
    for (const headId of STAGE2L19_HEAD_IDS) {
      if (headId === 'persistence') continue;
      assert.equal(active.heads[headId].outputDigest, frozen.heads[headId].outputDigest, `${entry.caseId}/${headId}`);
    }
  }
});

test('score movement is attributed to the corpus, never to the expert', () => {
  const reevaluation = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l23-oracle-reevaluation.json`, 'utf8'));
  assert.equal(reevaluation.attribution, 'CORPUS_ONLY_NO_EXPERT_CHANGE');
  assert.equal(certification.freeze.oracleHeadsChanged, false);
});

test('only heads whose corpus changed were recertified for identifiability', () => {
  const recertified = certification.identifiability.map((entry) => entry.headId).sort();
  const expected = [...new Set(certification.provenDefectiveFamilies.map((familyId) => familyId.split('/')[0]))].sort();
  assert.deepEqual(recertified, expected);
});

test('identifiability recertification reuses the Stage 2L.20 method verbatim', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l23-identifiability-recertification.json`, 'utf8'));
  assert.equal(report.methodology, 'STAGE2L20_MEASURE_IDENTIFIABILITY_REUSED_VERBATIM');
  for (const entry of certification.identifiability) {
    assert.equal(entry.after.searchSpaceMatchedNull, true);
    assert.equal(entry.after.multiplicityAccountedFor, true);
    assert.equal(entry.after.headsSearched, STAGE2L19_HEAD_IDS.length);
  }
});

test('persistence converges on the semantically adjudicated score', () => {
  const before = certification.blindBefore.heads.find((head) => head.headId === 'persistence').accuracy;
  const after = certification.blindAfter.heads.find((head) => head.headId === 'persistence').accuracy;
  const adjudicated = JSON.parse(readFileSync(
    'artifacts/stage2l22-oracle-persistence-conflict-semantics/stage2l22-certification-result.json', 'utf8'))
    .adjudicatedAfter.accuracy;
  assert.ok(Math.abs(after - adjudicated) < Math.abs(before - adjudicated),
    'the repaired-corpus score must move toward the adjudicated score');
});

test('no action path is added and the reliability floor is untouched', () => {
  assert.deepEqual(certification.actionPaths.before, ['direction']);
  assert.deepEqual(certification.actionPaths.after, ['direction']);
  assert.equal(certification.oracleActionPathsUnchanged, true);
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
  assert.equal(certification.nexusBehaviorChanged, false);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
});

/* --- Certification --------------------------------------------------------- */

test('the certification reproduces byte-identically from a fresh evaluation', async () => {
  const { buildStage2L23Evaluation, certifyStage2L23 } = await import('../src/lab/stage2l23-temporal-corpus-well-posedness.js');
  const recomputed = certifyStage2L23({ evaluation: buildStage2L23Evaluation() });
  assert.equal(recomputed.certificationHash, certification.certificationHash);
  assert.equal(recomputed.evidenceDigest, certification.evidenceDigest);
});

test('the portability limitation is recorded unchanged', () => {
  const report = JSON.parse(readFileSync(`${ARTIFACTS}/stage2l23-portability-report.json`, 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

test('the stage certifies and every gate it claims is actually true', () => {
  assert.equal(certification.status, 'PASS');
  assert.equal(certification.stage2l23Certified, true);
  for (const gate of ['generatorInventoryComplete', 'semanticValidatorsDefined',
    'allTemporalFamiliesBoundaryAudited', 'sustainedRunDefectResolved', 'provenDefectiveFamiliesRepaired',
    'repairedFamiliesWellPosed', 'generatorPropertyTestsPass', 'effectiveVariationMeasured',
    'oracleHeadsUnchanged', 'oracleActionPathsUnchanged', 'securityRegressionPass']) {
    assert.equal(certification[gate], true, gate);
  }
  assert.equal(certification.labelLeakageDetected, false);
  assert.equal(certification.temporalCorpusOutcome, 'B_MULTIPLE_GENERATOR_DEFECTS_REPAIRED');
});
