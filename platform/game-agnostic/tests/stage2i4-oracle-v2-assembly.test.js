import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout, buildStage2I4OracleV2Certification, ORACLE_V2_COMPOSITION_RULES } from '../src/lab/stage2i4-oracle-v2-assembly.js';

let cached;
const build = () => cached ??= buildStage2I4OracleV2Certification();

test('inherited capability and remediation evidence reproduces', () => {
  assert.equal(build().inherited.stage2i0Reproduced, true);
  assert.equal(build().inherited.stage2i2Reproduced, true);
  assert.equal(build().inherited.stage2i3bCertified, true);
  assert.equal(build().inherited.stage2i3cReproduced, true);
  assert.equal(build().inherited.oracleV1CapabilityScore, 3);
});

test('all eight frozen heads are assembled without behavioral mutation', () => {
  assert.equal(build().frozenHeads.allUnchanged, true);
  assert.deepEqual(build().frozenHeads.scores, { direction: 10, persistence: 7, reversal: 7, regimeChange: 9, volatility: 10, cycle: 7, timeToThreshold: 10, abstention: 10 });
  assert.ok(Object.values(build().frozenHeads.changed).every((changed) => changed === false));
  assert.ok(Object.values(build().frozenHeads.assembledRegression).every((regression) => regression === 0));
});

test('Oracle V2 is modular structured and has no action mapping', () => {
  const architecture = build().architecture;
  assert.equal(architecture.modular, true);
  assert.equal(architecture.singleScalarValue, false);
  assert.equal(architecture.actionMappingPresent, false);
  assert.equal(architecture.compositionRulesDigest, sha256(ORACLE_V2_COMPOSITION_RULES));
});

test('canonical assessment carries eight digest-bound head envelopes', () => {
  const sample = buildOracleV2Holdout()[0]; const assessment = assembleOracleV2(sample);
  assert.equal(Object.keys(assessment.heads).length, 8);
  assert.ok(Object.values(assessment.heads).every((head) => head.outputDigest.startsWith('sha256:')));
  assert.ok(assessment.assessmentDigest.startsWith('sha256:'));
  assert.equal(assessment.provenance.historyDigest.startsWith('sha256:'), true);
  assert.deepEqual(assessment.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('assessment recursively excludes every action-mapping field', () => {
  const assessment = assembleOracleV2(buildOracleV2Holdout()[0]); const serialized = JSON.stringify(assessment);
  for (const field of build().architecture.forbiddenFields) assert.equal(serialized.includes(`"${field}"`), false);
});

test('missing threshold semantics suppress effective threshold claims but preserve raw evidence', () => {
  const assessment = assembleOracleV2(buildOracleV2Holdout().find((entry) => entry.task === 'direction'));
  assert.equal(assessment.heads.timeToThreshold.semanticOutput, 'INSUFFICIENT_EVIDENCE');
  assert.equal(assessment.heads.timeToThreshold.supported, false);
  assert.ok(Object.hasOwn(assessment.heads.timeToThreshold, 'rawSemanticOutput'));
});

test('independent holdout exceeds scale and effective diversity floors', () => {
  assert.equal(build().corpus.finalHoldoutCases, 2400);
  assert.ok(build().corpus.effectiveSemanticGroups >= 1000);
  assert.equal(build().corpus.semanticFamilyLeakage, false);
  assert.equal(build().corpus.stage2i0OracleCorpusReproduced, true);
});

test('assembled task mean clears frozen 7 of 10 threshold', () => {
  assert.equal(build().tasks.taskMean, 0.8529166666666667);
  assert.ok(build().tasks.reversal.accuracy >= .8);
  assert.ok(build().tasks.regimeChange.accuracy >= .8);
});

test('Oracle V2 restores positive temporal incremental value', () => {
  const temporal = build().temporalValue;
  assert.equal(temporal.currentStateOnlyScore, 360);
  assert.equal(temporal.oracleV1ScoreRaw, 175);
  assert.equal(temporal.oracleV2ScoreRaw, 468);
  assert.equal(temporal.oracleV1TemporalIncrementalValue, -185);
  assert.equal(temporal.oracleV2TemporalIncrementalValue, 108);
});

test('Oracle V2 beats every frozen simple temporal baseline', () => {
  assert.equal(build().baselines.bestSimpleTemporalBaseline.name, 'CURRENT_STATE_ONLY');
  assert.equal(build().baselines.bestSimpleTemporalBaseline.netValue, 360);
  assert.equal(build().baselines.oracleV2VsBestSimpleBaseline, 108);
  assert.equal(build().baselines.beatsBestSimpleBaseline, true);
  assert.equal(build().baselines.beatsAllSimpleBaselines, true);
});

test('semantic consistency and output conflict audits are clean', () => {
  const semantic = build().semanticConsistency;
  assert.equal(semantic.cases, 40);
  assert.equal(semantic.passing, 40);
  assert.equal(semantic.contradictions, 0);
  assert.equal(semantic.outputConflictCases, 0);
  assert.equal(semantic.outputConflictRate, 0);
});

test('cross-head paired causality is valid', () => {
  assert.equal(build().crossHeadCausality.pairs.length, 3);
  assert.ok(build().crossHeadCausality.pairs.every((pair) => pair.valid));
  assert.equal(build().crossHeadCausality.valid, true);
});

test('adversarial corpus clears the 7 of 10 benchmark threshold', () => {
  assert.equal(build().adversarial.cases, 600);
  assert.equal(build().adversarial.accuracy, 1);
});

test('confidence limitations are measured rather than hidden', () => {
  assert.ok(Number.isFinite(build().confidence.correlation));
  assert.ok(build().confidence.falseHighConfidenceRate > 0);
  assert.equal(build().confidence.monotonicWithQuality, false);
});

test('bounded game-semantic fixtures are temporal-only and accurate', () => {
  assert.equal(build().gameSemantics.cases, 400);
  assert.equal(build().gameSemantics.accuracy, 1);
  assert.equal(build().gameSemantics.realZeknovaGameplayImprovementClaimed, false);
});

test('aggregate Oracle V2 certifies 7 of 10 but not 9 of 10', () => {
  assert.equal(build().capability.oracleV1Score, 3);
  assert.equal(build().capability.oracleV2Score, 7);
  assert.equal(build().capability.gate7Pass, true);
  assert.equal(build().capability.gate9Pass, false);
  assert.ok(build().capability.gate9RemainingGaps.includes('CALIBRATED_CONFIDENCE'));
});

test('production Prime Nexus action selection and authority remain frozen', () => {
  const result = build();
  assert.equal(result.production.oracleProductionReplaced, false);
  assert.equal(result.production.oracleV2ProductionPromoted, false);
  assert.equal(result.production.primeChanged, false);
  assert.equal(result.production.nexusChanged, false);
  assert.equal(result.safety.expertSelectionInfluence, 0);
  assert.equal(result.safety.expertActionSelectionApproved, false);
  assert.equal(result.safety.finalRecommendationOwner, 'PRIME');
});

test('Oracle V2 assessment and aggregate evidence replay identically', () => {
  const sample = buildOracleV2Holdout()[0];
  assert.equal(assembleOracleV2(sample).assessmentDigest, assembleOracleV2(sample).assessmentDigest);
  assert.equal(sha256(buildStage2I4OracleV2Certification()), sha256(buildStage2I4OracleV2Certification()));
});
