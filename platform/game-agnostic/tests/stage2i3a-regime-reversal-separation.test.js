import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2I3ASeparation,
  evaluateRegimeV3,
  FROZEN_PERSISTENCE_V2,
  REGIME_V3_SEARCH_SPACE,
  STAGE2I3A_GATE,
  STAGE2I3A_SEMANTICS,
} from '../src/lab/stage2i3a-regime-reversal-separation.js';

let cached;
const build = () => cached ??= buildStage2I3ASeparation();

test('Stage 2I.3 failure evidence is inherited exactly', () => {
  const baseline = build().baseline;
  assert.equal(baseline.stage2i3Status, 'FAIL');
  assert.equal(baseline.stage2i3CertificationHash, '75a9308cba3a16dcfafdef0214df607f2812f2052b5aaa1d76746e86f6e5573c');
  assert.equal(baseline.stage2i3EvidenceDigest, '1be4b3081d9b3350c433bb4718f0deb42603c63426fa45689cb426e30c21434b');
});

test('reversal and regime-change semantics are explicitly distinct', () => {
  assert.equal(STAGE2I3A_SEMANTICS.reversalImpliesRegimeChange, false);
  assert.equal(STAGE2I3A_SEMANTICS.regimeChangeMayIncludeReversal, true);
  assert.equal(STAGE2I3A_SEMANTICS.processDimensions.length, 6);
});

test('four-quadrant corpus is balanced above the 200-case floor', () => {
  const corpus = build().corpus;
  assert.equal(corpus.totalCases, 1080);
  assert.deepEqual(corpus.casesPerQuadrant, { REVERSAL_ONLY: 270, REGIME_ONLY: 270, REVERSAL_AND_REGIME: 270, NEITHER: 270 });
  assert.ok(corpus.effectiveSemanticGroups >= 800);
});

test('whole semantic families are disjoint across partitions', () => {
  const corpus = build().corpus;
  const families = [...corpus.development.families, ...corpus.validation.families, ...corpus.finalHoldout.families];
  assert.equal(new Set(families).size, families.length);
  assert.equal(corpus.semanticFamilyLeakage, false);
  assert.equal(corpus.finalHoldout.executedOnce, true);
});

test('search space and conservative quality gate are pre-registered', () => {
  const result = build();
  assert.deepEqual(result.search.space, REGIME_V3_SEARCH_SPACE);
  assert.equal(result.search.digest, sha256(REGIME_V3_SEARCH_SPACE));
  assert.equal(STAGE2I3A_GATE.minimumAccuracy, .85);
  assert.equal(STAGE2I3A_GATE.maximumReversalOnlyFalseRegimeRate, .1);
});

test('Regime V3 selection is frozen before holdout', () => {
  const selection = build().search.selection;
  assert.equal(selection.selectionFrozen, true);
  assert.equal(selection.frozenBeforeFinalHoldout, true);
  assert.ok(REGIME_V3_SEARCH_SPACE.some((candidate) => candidate.id === selection.selectedRegimeV3.id));
});

test('Regime V3 frozen holdout misses score accuracy and baseline gates', () => {
  const holdout = build().finalHoldout;
  assert.equal(holdout.regimeV3Score, 3);
  assert.ok(holdout.accuracy < .85);
  assert.ok(holdout.adversarialAccuracy >= .85);
  assert.equal(holdout.beatsSimpleBaseline, false);
  assert.ok(holdout.incrementalValue > 0);
  assert.equal(build().qualityGatePass, false);
});

test('Regime V3 suppresses reversal-only false positives but remains insufficiently distinct', () => {
  const holdout = build().finalHoldout;
  assert.ok(holdout.reversalOnlyFalseRegimeRate <= .1);
  assert.equal(holdout.distinctFromReversal, false);
  assert.ok(holdout.precision >= .9);
  assert.ok(holdout.specificity >= .9);
});

test('holdout localizes the remaining failures to regime-bearing quadrants', () => {
  const quadrants = build().finalHoldout.quadrantAccuracy;
  assert.equal(quadrants.REVERSAL_ONLY, 1);
  assert.equal(quadrants.NEITHER, .9555555555555556);
  assert.equal(quadrants.REGIME_ONLY, .3333333333333333);
  assert.equal(quadrants.REVERSAL_AND_REGIME, .6666666666666666);
});

test('holdout exposes missing and weak change-dimension coverage', () => {
  const labels = build().finalHoldout.labelAccuracy;
  assert.equal(labels.LEVEL_CHANGE, 1);
  assert.equal(labels.TREND_CHANGE, 0);
  assert.equal(labels.MULTIPLE_CHANGE, .6666666666666666);
  assert.equal(labels.VOLATILITY_CHANGE, null);
  assert.equal(labels.CYCLE_CHANGE, null);
});

test('temporary anomalies remain suppressed', () => {
  assert.ok(build().finalHoldout.temporaryAnomalyFalsePositiveRate <= .1);
});

test('Regime V3 signal changes are causally attributed', () => {
  assert.equal(build().finalHoldout.signalCausallyAttributed, true);
});

test('frozen Persistence V2 and all other successful heads are unchanged', () => {
  const frozen = build().frozenHeads;
  assert.equal(FROZEN_PERSISTENCE_V2.id, 'BOUNDED_INTERRUPTION_TOLERANCE');
  assert.equal(frozen.changed.persistenceV2, false);
  assert.equal(frozen.allOtherSuccessfulHeadsUnchanged, true);
  assert.ok(Object.values(frozen.changed).every((changed) => changed === false));
});

test('Regime V3 output is deterministic digest-carrying and reversal is non-decisive', () => {
  const result = build();
  const entry = { observationHistory: Array.from({ length: 28 }, (_, tick) => ({ tick, channels: { alpha: tick < 14 ? .4 : .6 } })) };
  const first = evaluateRegimeV3(entry, result.search.selection.selectedRegimeV3);
  const second = evaluateRegimeV3(entry, result.search.selection.selectedRegimeV3);
  assert.equal(first.outputDigest, second.outputDigest);
  assert.equal(first.reversalImpliesRegimeChange, false);
  assert.equal(first.advisoryOnly, true);
});

test('Oracle remains unassembled with Prime Nexus and R0 authority frozen', () => {
  const result = build();
  assert.equal(result.oracleV2Assembled, false);
  assert.equal(result.oracleProductionReplaced, false);
  assert.equal(result.primeChanged, false);
  assert.equal(result.nexusChanged, false);
  assert.equal(result.expertSelectionInfluence, 0);
  assert.equal(result.expertActionSelectionApproved, false);
  assert.deepEqual(result.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('Stage 2I.3A replay is deterministic', () => {
  assert.equal(sha256(buildStage2I3ASeparation()), sha256(buildStage2I3ASeparation()));
});
