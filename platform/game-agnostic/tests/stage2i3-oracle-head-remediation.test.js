import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2I3Remediation,
  evaluatePersistenceV2,
  evaluateRegimeV2,
  PERSISTENCE_V2_SEARCH_SPACE,
  REGIME_V2_SEARCH_SPACE,
  STAGE2I3_STAGE2I2_OWNER_SHA256,
} from '../src/lab/stage2i3-oracle-head-remediation.js';

let cached;
const build = () => cached ??= buildStage2I3Remediation();

test('Stage 2I.2 certification and frozen owner are inherited exactly', () => {
  const result = build();
  assert.equal(result.baseline.stage2i2Certified, true);
  assert.equal(result.baseline.stage2i2CertificationHash, '5c481283d006a82115fcd1c8be8422282eb813f97ad696264d9fdda96406fb6c');
  assert.equal(result.frozenHeads.ownerSha256, STAGE2I3_STAGE2I2_OWNER_SHA256);
});

test('persistence score audit reproduces the below-baseline cap without a defect', () => {
  const audit = build().scoreAudit.persistence;
  assert.equal(audit.rawAccuracy, .8);
  assert.ok(Math.abs(audit.baselineDelta - (-.085)) < 1e-12);
  assert.equal(audit.scoreBefore, 3);
  assert.equal(audit.scoreDerivation, 'RAW_0.800000=>RUBRIC_6;BELOW_BASELINE_0.885000=>CAP_3');
  assert.equal(audit.scoreDefectDetected, false);
});

test('regime score audit reproduces the threshold-derived six without a defect', () => {
  const audit = build().scoreAudit.regime;
  assert.ok(Math.abs(audit.rawAccuracy - .8181818181818182) < 1e-12);
  assert.ok(audit.baselineDelta > .36);
  assert.equal(audit.scoreBefore, 6);
  assert.equal(audit.scoreDefectDetected, false);
});

test('all successful Stage 2I.2 heads stay frozen with evidence identities', () => {
  const frozen = build().frozenHeads;
  assert.equal(frozen.allFrozenSuccessfulHeadsUnchanged, true);
  assert.deepEqual(Object.keys(frozen.changed), ['direction', 'reversal', 'volatility', 'cycle', 'timeToThreshold', 'abstention']);
  assert.ok(Object.values(frozen.evidenceIdentities).every((digest) => /^[a-f0-9]{64}$/.test(digest)));
  assert.ok(Object.values(frozen.changed).every((changed) => changed === false));
});

test('persistence families are partitioned without leakage and have effective scale', () => {
  const corpus = build().corpus.persistence;
  const families = [...corpus.families.development, ...corpus.families.validation, ...corpus.families.finalHoldout];
  assert.equal(new Set(families).size, families.length);
  assert.ok(corpus.cases >= 800);
  assert.ok(corpus.effectiveSemanticGroups >= 500);
  assert.equal(build().corpus.semanticFamilyLeakage, false);
});

test('regime families are partitioned without leakage and have effective scale', () => {
  const corpus = build().corpus.regime;
  const families = [...corpus.families.development, ...corpus.families.validation, ...corpus.families.finalHoldout];
  assert.equal(new Set(families).size, families.length);
  assert.ok(corpus.cases >= 800);
  assert.ok(corpus.effectiveSemanticGroups >= 500);
});

test('small deterministic search spaces and their digests are frozen', () => {
  const search = build().search;
  assert.deepEqual(search.persistence.space, PERSISTENCE_V2_SEARCH_SPACE);
  assert.deepEqual(search.regime.space, REGIME_V2_SEARCH_SPACE);
  assert.equal(search.persistence.digest, sha256(PERSISTENCE_V2_SEARCH_SPACE));
  assert.equal(search.regime.digest, sha256(REGIME_V2_SEARCH_SPACE));
});

test('both candidate selections freeze before the one-shot holdout', () => {
  const result = build();
  assert.equal(result.search.selection.persistenceSelectionFrozen, true);
  assert.equal(result.search.selection.regimeSelectionFrozen, true);
  assert.equal(result.search.selection.frozenBeforeFinalHoldout, true);
  assert.equal(result.corpus.finalHoldoutExecutedOnce, true);
});

test('Persistence V2 clears score accuracy adversarial and baseline gates', () => {
  const persistence = build().finalHoldout.persistence;
  assert.ok(persistence.v2Score >= 7);
  assert.ok(persistence.accuracy >= .85);
  assert.ok(persistence.adversarialAccuracy >= .8);
  assert.equal(persistence.beatsSimpleBaseline, true);
  assert.equal(persistence.gatePass, true);
});

test('Regime V2 measured holdout result remains below the frozen score gate', () => {
  const regime = build().finalHoldout.regime;
  assert.equal(regime.v2Score, 6);
  assert.equal(regime.accuracy, .8);
  assert.equal(regime.adversarialAccuracy, .8);
  assert.equal(regime.beatsSimpleBaseline, true);
  assert.equal(regime.gatePass, false);
  assert.equal(build().qualityGatePass, false);
});

test('regime holdout exposes ordinary-reversal false positives', () => {
  const confusion = build().finalHoldout.regimeVsReversal;
  assert.ok(confusion.truePositive > 0);
  assert.ok(confusion.trueNegative > 0);
  assert.equal(confusion.falsePositive, 30);
  assert.equal(confusion.distinctFromReversal, false);
});

test('both remediated heads are deterministic digest-carrying and causal', () => {
  const result = build();
  const history = Array.from({ length: 24 }, (_, tick) => ({ tick, channels: { alpha: tick < 12 ? .3 : .7 } }));
  const persistence = evaluatePersistenceV2({ observationHistory: history }, result.search.selection.selectedPersistenceV2);
  const regime = evaluateRegimeV2({ observationHistory: history }, result.search.selection.selectedRegimeV2);
  assert.match(persistence.outputDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(regime.outputDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.finalHoldout.persistence.signalCausallyAttributed, true);
  assert.equal(result.finalHoldout.regime.signalCausallyAttributed, true);
});

test('projected Oracle remains non-certifiable and unassembled', () => {
  const result = build();
  assert.equal(result.projectedOracleV2.capabilityScore, 'NOT_CERTIFIABLE_UNTIL_ASSEMBLY');
  assert.equal(result.oracleV2Assembled, false);
  assert.equal(result.oracleProductionReplaced, false);
});

test('Prime Nexus action selection and R0 authority remain isolated', () => {
  const result = build();
  assert.equal(result.primeChanged, false);
  assert.equal(result.nexusChanged, false);
  assert.equal(result.expertSelectionInfluence, 0);
  assert.equal(result.expertActionSelectionApproved, false);
  assert.equal(result.finalRecommendationOwner, 'PRIME');
  assert.deepEqual(result.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('Stage 2I.3 replay is deterministic', () => {
  assert.equal(sha256(buildStage2I3Remediation()), sha256(buildStage2I3Remediation()));
});
