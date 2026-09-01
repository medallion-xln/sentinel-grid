import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { sha256 } from '../src/core/determinism.js';
import {
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
  remediatedDeterministicArbiter,
} from '../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';
import {
  STAGE2L10_ADVERSARIAL_CONTROLS,
  STAGE2L10_ARBITER_RULE_DIGEST,
  STAGE2L10_ATTESTATION_CONTRACT,
  STAGE2L10_ATTESTATION_CONTROLS,
  STAGE2L10_CONTROL_GROUPS,
  STAGE2L10_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L10_FORBIDDEN_RUNTIME_KEYS,
  STAGE2L10_FROZEN_CALIBRATION,
  STAGE2L10_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L10_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L10_MIN_BUCKET_RELIABILITY,
  STAGE2L10_MIN_BUCKET_SAMPLES,
  STAGE2L10_MIN_HOLDOUT_CASES,
  STAGE2L10_NEXUS_BUCKETS,
  STAGE2L10_ORACLE_BUCKETS,
  STAGE2L10_ORACLE_REGIMES,
  STAGE2L10_STAGE,
  STAGE2L10_STAGE2L7_OWNER_SHA256,
  STAGE2L10_STAGE2L8_OWNER_SHA256,
  STAGE2L10_STAGE2L9_OWNER_SHA256,
  STAGE2L10_STRUCTURALLY_INELIGIBLE_BUCKETS,
  buildAdversarialCase,
  buildAttestationAttackCase,
  buildControlCase,
  buildNexusOnlyCase,
  buildOracleOnlyCase,
  buildStage2L10Evaluation,
  buildStage2L10Input,
  buildStage2L10PortabilityDigest,
  calibratedSelectiveDelegationArbiter,
  certifyStage2L10,
  createCorrectnessAttestation,
  deriveStage2L10Calibration,
  freezeCalibration,
  nexusUncertaintyBucket,
  oracleUncertaintyBucket,
  runStage2L10,
  runStage2L10FailureIsolation,
  runStage2L10Invariance,
} from '../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';

const evaluation = buildStage2L10Evaluation();
const certification = certifyStage2L10({ evaluation });
const oracleParams = STAGE2L10_FROZEN_CALIBRATION.oracle.parameters;

/* Rebuild a case's input with a replacement attestation set, leaving the
 * Stage 2L.7 evidence untouched. */
function reattest(record, attestations) {
  return buildStage2L10Input({
    decisionContext: record.context,
    prime: {
      selectedAction: record.input.boundArbiterInput.prime.selectedAction,
      ranking: record.input.boundArbiterInput.prime.rankedLegalActions,
    },
    expertEvidence: record.input.boundArbiterInput.expertEvidence,
    attestations,
  });
}

function oracleSignals(overrides = {}) {
  return {
    kind: 'ORACLE_DIRECTION_SLOPE_COHERENCE_V1',
    head: 'direction',
    supported: true,
    claim: 'UP',
    confidence: 750000,
    fullSlopeMicro: 30000,
    recentSlopeMicro: 30000,
    samples: 14,
    historySufficiency: 'ENOUGH_EVIDENCE',
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------
 * Freeze and inheritance
 * ------------------------------------------------------------------------- */

test('Stage 2L.7, 2L.8 and 2L.9 owners remain byte-for-byte frozen', async () => {
  const owners = {
    'stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js': STAGE2L10_STAGE2L7_OWNER_SHA256,
    'stage2l8-remediated-arbiter-independent-red-team-replication.js': STAGE2L10_STAGE2L8_OWNER_SHA256,
    'stage2l9-single-expert-delegation-precision-bound.js': STAGE2L10_STAGE2L9_OWNER_SHA256,
  };
  for (const [file, expected] of Object.entries(owners)) {
    const source = await readFile(new URL(`../src/lab/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), expected, `${file} must not change`);
  }
});

test('the inherited Arbiter rule table and fail-closed matrix are unchanged', () => {
  assert.equal(STAGE2L10_ARBITER_RULE_DIGEST, STAGE2L7_ARBITER_RULE_DIGEST);
  assert.equal(STAGE2L10_FAIL_CLOSED_MATRIX_DIGEST, STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST);
  assert.equal(certification.freeze.inheritedArbiterRuleTableUnchanged, true);
  assert.equal(certification.freeze.inheritedFailClosedMatrixUnchanged, true);
  assert.equal(certification.freeze.primeAmbiguityThreshold, STAGE2L7_PRIME_AMBIGUITY_THRESHOLD);
});

test('Stage 2L.10 delegations are a strict subset of the inherited Arbiter delegations', () => {
  assert.equal(evaluation.bounds.delegationsNotAuthorisedByInheritedArbiter, 0);
  assert.equal(evaluation.bounds.strictRefinementOfInheritedArbiter, true);
  for (const row of evaluation.rows) {
    if (row.changed) assert.equal(row.baseDelegated, true, `${row.caseId} delegated without inherited authorisation`);
  }
});

test('an inherited Prime decision is never overridden into a delegation', () => {
  const record = buildAdversarialCase('HOLDOUT', 'SE_STALE_EVIDENCE', 3);
  const base = remediatedDeterministicArbiter(record.input.boundArbiterInput);
  assert.equal(base.decisionChanged, false);
  const result = calibratedSelectiveDelegationArbiter(record.input);
  assert.equal(result.counterfactualFinalRecommendation, record.primeAction);
  assert.equal(result.disposition, 'PRIME_RETAINED');
});

/* ---------------------------------------------------------------------------
 * Calibration integrity and the no-leakage requirement
 * ------------------------------------------------------------------------- */

test('the frozen calibration is exactly reproduced by re-deriving from the calibration corpus', () => {
  const rederived = freezeCalibration(deriveStage2L10Calibration());
  assert.deepEqual(rederived, STAGE2L10_FROZEN_CALIBRATION);
  assert.equal(evaluation.calibration.frozenReproducedFromCalibrationCorpus, true);
});

test('deriving calibration from holdout rows is refused', () => {
  const holdoutRows = evaluation.rows.filter((row) => row.split === 'HOLDOUT').slice(0, 5);
  assert.throws(() => deriveStage2L10Calibration(holdoutRows), /STAGE2L10_CALIBRATION_SPLIT_VIOLATION/);
});

test('calibration and holdout corpora are disjoint and the holdout is large enough', () => {
  assert.equal(evaluation.corpus.corpusOverlap, 0);
  assert.equal(evaluation.corpus.calibrationHoldoutSeparate, true);
  assert.equal(evaluation.corpus.semanticFamilyLeakage, false);
  assert.ok(evaluation.corpus.holdoutCases >= STAGE2L10_MIN_HOLDOUT_CASES);
});

test('no outcome label reaches the runtime decision path', () => {
  assert.equal(evaluation.labelLeakage.labelLeakageDetected, false);
  assert.deepEqual(evaluation.labelLeakage.forbiddenKeysPresent, []);
  assert.deepEqual(evaluation.labelLeakage.correctnessSensitiveGroups, []);
  assert.ok(STAGE2L10_FORBIDDEN_RUNTIME_KEYS.includes('truthAction'));
  assert.ok(STAGE2L10_FORBIDDEN_RUNTIME_KEYS.includes('expertCorrect'));
});

test('the disposition is a function of bucket, band and inherited delegation alone', () => {
  const groups = new Map();
  for (const row of evaluation.rows) {
    const key = `${row.uncertaintyBucket}|${row.band}|${row.baseDelegated}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(row.disposition);
  }
  for (const [key, dispositions] of groups) {
    assert.equal(dispositions.size, 1, `group ${key} split into ${[...dispositions].join(',')}`);
  }
});

test('a bucket only delegates when it is structurally eligible and clears the calibrated floor', () => {
  for (const side of ['oracle', 'nexus']) {
    for (const [bucket, entry] of Object.entries(STAGE2L10_FROZEN_CALIBRATION[side].buckets)) {
      if (!entry.delegates) continue;
      assert.equal(entry.structurallyEligible, true, `${bucket} delegates while structurally ineligible`);
      assert.equal(entry.calibrated, true, `${bucket} delegates while uncalibrated`);
      assert.ok(entry.reliability >= STAGE2L10_MIN_BUCKET_RELIABILITY, `${bucket} delegates below the reliability floor`);
      assert.ok(entry.opportunities >= STAGE2L10_MIN_BUCKET_SAMPLES);
    }
  }
});

test('a structurally ineligible bucket never delegates even at measured reliability 1.0', () => {
  const unsupported = STAGE2L10_FROZEN_CALIBRATION.oracle.buckets.ORACLE_UNSUPPORTED_HEAD;
  assert.equal(unsupported.reliability, 1);
  assert.equal(unsupported.structurallyEligible, false);
  assert.equal(unsupported.delegates, false);
  for (const bucket of STAGE2L10_STRUCTURALLY_INELIGIBLE_BUCKETS) {
    const entry = STAGE2L10_FROZEN_CALIBRATION.oracle.buckets[bucket] ?? STAGE2L10_FROZEN_CALIBRATION.nexus.buckets[bucket];
    assert.equal(entry.delegates, false, `${bucket} must never delegate`);
  }
});

/* ---------------------------------------------------------------------------
 * Bucket derivation, including exact threshold equality
 * ------------------------------------------------------------------------- */

test('Oracle buckets partition the signal space deterministically', () => {
  assert.equal(oracleUncertaintyBucket(oracleSignals(), oracleParams), 'ORACLE_DIRECTIONAL_COHERENT');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ supported: false }), oracleParams), 'ORACLE_UNSUPPORTED_HEAD');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ historySufficiency: 'INSUFFICIENT_EVIDENCE' }), oracleParams), 'ORACLE_UNSUPPORTED_HEAD');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ claim: 'STABLE', fullSlopeMicro: 0, recentSlopeMicro: 0 }), oracleParams), 'ORACLE_STABLE_EXACT');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ claim: 'STABLE', fullSlopeMicro: 10, recentSlopeMicro: 0 }), oracleParams), 'ORACLE_STABLE_UNSTEADY');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ fullSlopeMicro: 0 }), oracleParams), 'ORACLE_DIRECTIONAL_FULL_WINDOW_FLAT');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ recentSlopeMicro: -30000 }), oracleParams), 'ORACLE_DIRECTIONAL_CONTRADICTED');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ claim: 'DOWN', fullSlopeMicro: -30000, recentSlopeMicro: -30000 }), oracleParams), 'ORACLE_DIRECTIONAL_COHERENT');
  assert.equal(oracleUncertaintyBucket({ kind: 'SOMETHING_ELSE' }, oracleParams), null);
});

test('the recent-window dominance boundary is exact at equality and one micro-unit beyond', () => {
  const { ratioNumerator, ratioDenominator } = oracleParams;
  const full = 10000;
  // |recent| * denominator === |full| * numerator is INSIDE the coherent bucket.
  const atBoundary = (full * ratioNumerator) / ratioDenominator;
  assert.ok(Number.isInteger(atBoundary));
  assert.equal(
    oracleUncertaintyBucket(oracleSignals({ fullSlopeMicro: full, recentSlopeMicro: atBoundary }), oracleParams),
    'ORACLE_DIRECTIONAL_COHERENT',
  );
  assert.equal(
    oracleUncertaintyBucket(oracleSignals({ fullSlopeMicro: full, recentSlopeMicro: atBoundary + 1 }), oracleParams),
    'ORACLE_DIRECTIONAL_RECENT_DOMINATED',
  );
});

test('the full-window slope floor is exact at equality and one micro-unit below', () => {
  const floor = oracleParams.minFullSlopeMicro;
  assert.ok(floor > 0);
  assert.equal(oracleUncertaintyBucket(oracleSignals({ fullSlopeMicro: floor, recentSlopeMicro: floor }), oracleParams), 'ORACLE_DIRECTIONAL_COHERENT');
  assert.equal(oracleUncertaintyBucket(oracleSignals({ fullSlopeMicro: floor - 1, recentSlopeMicro: floor - 1 }), oracleParams), 'ORACLE_DIRECTIONAL_FULL_WINDOW_FLAT');
});

test('Nexus buckets partition the structural space deterministically', () => {
  const params = STAGE2L10_FROZEN_CALIBRATION.nexus.parameters;
  const base = {
    kind: 'NEXUS_STRUCTURAL_DETERMINACY_V1',
    candidateIsSpof: true, spofNodeCount: 1, spofEdgeCount: 2, criticalCount: 1, bottleneckCount: 1,
    componentCount: 1, entityCount: 4, edgeCount: 3,
    redundantPathPresent: false, reachableWithoutCandidate: false, semanticOptimalityCertified: false,
  };
  assert.equal(nexusUncertaintyBucket(base, params), 'NEXUS_SOLE_CRITICAL_NODE');
  assert.equal(nexusUncertaintyBucket({ ...base, candidateIsSpof: false }, params), 'NEXUS_NO_STRUCTURAL_CRITICALITY');
  assert.equal(nexusUncertaintyBucket({ ...base, redundantPathPresent: true }, params), 'NEXUS_REDUNDANT_PATH');
  assert.equal(nexusUncertaintyBucket({ ...base, spofNodeCount: 2 }, params), 'NEXUS_MULTIPLE_CRITICAL_NODES');
  assert.equal(nexusUncertaintyBucket({ ...base, entityCount: params.minWideFanEntityCount }, params), 'NEXUS_WIDE_FAN_CRITICAL');
  assert.equal(nexusUncertaintyBucket({ kind: 'SOMETHING_ELSE' }, params), null);
});

/* ---------------------------------------------------------------------------
 * The four behaviours the stage exists to produce
 * ------------------------------------------------------------------------- */

test('a correct, coherent Oracle is delegated to', () => {
  const rows = evaluation.rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT'
    && row.uncertaintyBucket === 'ORACLE_DIRECTIONAL_COHERENT' && row.baseDelegated);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.changed), 'every coherent inherited delegation must be delegated');
  assert.ok(rows.every((row) => row.expertCorrect), 'the coherent bucket must not contain a wrong Oracle on holdout');
});

test('a wrong Oracle is abstained from', () => {
  const wrong = evaluation.rows.filter((row) => row.stratum === 'ORACLE_ONLY_RELEVANT' && row.baseDelegated && !row.expertCorrect);
  assert.ok(wrong.length > 0, 'the holdout must contain inherited delegations to a wrong Oracle');
  assert.ok(wrong.every((row) => !row.changed), 'no wrong Oracle may be delegated to');
  assert.equal(evaluation.discrimination.oracle.expertWrongDelegated, 0);
});

test('Nexus abstains everywhere because no bucket establishes its correctness', () => {
  assert.deepEqual(STAGE2L10_FROZEN_CALIBRATION.nexus.delegatingBuckets, []);
  const nexusRows = evaluation.rows.filter((row) => row.stratum === 'NEXUS_ONLY_RELEVANT');
  assert.ok(nexusRows.some((row) => row.baseDelegated), 'the inherited Arbiter must want to delegate to Nexus');
  assert.ok(nexusRows.every((row) => !row.changed));
  // Every measured Nexus bucket fell short of the floor. That is the finding.
  for (const bucket of STAGE2L10_NEXUS_BUCKETS) {
    const entry = STAGE2L10_FROZEN_CALIBRATION.nexus.buckets[bucket];
    assert.ok(entry.reliability === null || entry.reliability < STAGE2L10_MIN_BUCKET_RELIABILITY);
  }
});

test('a correct Prime is protected: no correct-Prime break anywhere on holdout', () => {
  assert.equal(evaluation.overall.correctPrimeBreaks, 0);
  assert.ok(evaluation.overall.correctPrimeBreakRate <= STAGE2L10_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(evaluation.rows.filter((row) => row.breaksCorrectPrime).length, 0);
});

test('the Prime protection margin never exceeds the inherited ambiguity threshold', () => {
  for (const side of ['oracle', 'nexus']) {
    assert.ok(STAGE2L10_FROZEN_CALIBRATION[side].parameters.primeProtectionMarginMicro <= Math.round(STAGE2L7_PRIME_AMBIGUITY_THRESHOLD * 1000000));
  }
});

test('insufficient confidence abstains rather than defaulting to trust', () => {
  const record = buildAttestationAttackCase('HOLDOUT', 'AT_MISSING_ATTESTATION', 2);
  const result = calibratedSelectiveDelegationArbiter(record.input);
  assert.equal(result.disposition, 'ABSTAIN_FROM_DELEGATION');
  assert.equal(result.counterfactualFinalRecommendation, record.primeAction);
  assert.equal(result.inheritedDecisionChanged, true, 'the inherited Arbiter must have wanted to delegate');
});

test('contradictory slope evidence abstains', () => {
  const record = buildAttestationAttackCase('HOLDOUT', 'AT_MISSING_ATTESTATION', 4);
  const contradicted = reattest(record, [createCorrectnessAttestation({
    expert: 'ORACLE',
    decisionContext: record.context,
    evidencePacketDigest: record.input.boundArbiterInput.expertEvidence.find((entry) => entry.expert === 'ORACLE').packetDigest,
    signals: oracleSignals({ recentSlopeMicro: -30000 }),
  })]);
  const result = calibratedSelectiveDelegationArbiter(contradicted);
  assert.equal(result.disposition, 'ABSTAIN_FROM_DELEGATION');
  assert.equal(result.correctnessGate.uncertaintyBucket, 'ORACLE_DIRECTIONAL_CONTRADICTED');
  assert.equal(result.delegationReason, 'oracle_temporal_support_insufficient');
});

test('a delegation carries an auditable, component-level reason', () => {
  const delegated = evaluation.rows.find((row) => row.changed);
  assert.ok(delegated);
  assert.match(delegated.delegationReason, /reliability_above_threshold$/);
  assert.ok(STAGE2L10_ORACLE_BUCKETS.includes(delegated.uncertaintyBucket));
  assert.equal(delegated.calibratedReliability, 1);
});

/* ---------------------------------------------------------------------------
 * Attacks on the new attestation surface
 * ------------------------------------------------------------------------- */

test('every attestation attack fails closed to Prime while the inherited Arbiter wanted to delegate', () => {
  for (const control of STAGE2L10_ATTESTATION_CONTROLS) {
    const report = evaluation.attestationControls[control];
    assert.ok(report.cases > 0, `${control} produced no cases`);
    assert.equal(report.inheritedDelegations, report.cases, `${control} must be a live delegation before the gate`);
    assert.equal(report.selectionChanges, 0, `${control} produced a delegation`);
    assert.equal(report.failClosed, true);
    assert.ok(typeof report.abstentionReason === 'string' && report.abstentionReason.length > 0);
  }
  assert.equal(evaluation.bounds.attestationAttackDelegations, 0);
  assert.ok(evaluation.bounds.attestationAttackInheritedDelegations > 0);
});

test('a stale or cross-runtime attestation is rejected by the same binding Stage 2L.7 uses', () => {
  for (const control of ['AT_STALE_ATTESTATION', 'AT_CROSS_RUNTIME_ATTESTATION']) {
    const record = buildAttestationAttackCase('HOLDOUT', control, 7);
    const result = calibratedSelectiveDelegationArbiter(record.input);
    assert.equal(result.disposition, 'ABSTAIN_FROM_DELEGATION');
    assert.equal(result.delegationReason, 'delegation_abstained_attestation_decision_binding_mismatch');
  }
});

test('an attestation bound to a different evidence packet is rejected', () => {
  const record = buildAttestationAttackCase('HOLDOUT', 'AT_UNBOUND_EVIDENCE_DIGEST', 7);
  const result = calibratedSelectiveDelegationArbiter(record.input);
  assert.equal(result.delegationReason, 'delegation_abstained_attestation_not_bound_to_accepted_evidence');
});

test('rewriting attested signals without resealing is detected', () => {
  const record = buildAttestationAttackCase('HOLDOUT', 'AT_FORGED_SIGNALS', 7);
  const result = calibratedSelectiveDelegationArbiter(record.input);
  assert.equal(result.delegationReason, 'delegation_abstained_attestation_digest_invalid');
});

test('an unknown signal kind is denied rather than ignored', () => {
  const record = buildAttestationAttackCase('HOLDOUT', 'AT_UNKNOWN_SIGNAL_KIND', 7);
  const result = calibratedSelectiveDelegationArbiter(record.input);
  assert.equal(result.delegationReason, 'delegation_abstained_oracle_signal_kind_unknown');
});

test('a tampered input digest is denied', () => {
  const record = buildOracleOnlyCase('HOLDOUT', 21);
  const tampered = Object.freeze({ ...record.input, inputDigest: sha256({ tampered: true }) });
  const result = calibratedSelectiveDelegationArbiter(tampered);
  assert.equal(result.counterfactualFinalRecommendation, record.primeAction);
  if (result.disposition === 'ABSTAIN_FROM_DELEGATION') {
    assert.equal(result.delegationReason, 'delegation_abstained_input_digest_invalid');
  }
});

/* ---------------------------------------------------------------------------
 * Inherited evidence protections
 * ------------------------------------------------------------------------- */

test('all inherited evidence attacks still fail closed', () => {
  for (const control of STAGE2L10_ADVERSARIAL_CONTROLS) {
    const report = evaluation.adversarial[control];
    assert.equal(report.evidenceAccepted, 0, `${control} accepted evidence`);
    assert.equal(report.selectionChanges, 0, `${control} changed the selection`);
    assert.equal(report.failClosed, report.cases);
  }
});

test('stale, cross-runtime, malformed, illegal, unknown-schema and duplicate evidence are all rejected', () => {
  const bounds = evaluation.bounds;
  assert.equal(bounds.staleOracleEvidenceAccepted, 0);
  assert.equal(bounds.crossRuntimeExpertEvidenceAccepted, 0);
  assert.equal(bounds.crossObservationExpertEvidenceAccepted, 0);
  assert.equal(bounds.crossCampaignExpertEvidenceAccepted, 0);
  assert.equal(bounds.malformedEvidenceAccepted, 0);
  assert.equal(bounds.missingEvidenceAccepted, 0);
  assert.equal(bounds.illegalExpertSupportedActionAccepted, 0);
  assert.equal(bounds.unknownExpertSchemaAccepted, 0);
  assert.equal(bounds.unknownRuleStateAccepted, 0);
  assert.equal(bounds.conflictingDuplicateAccepted, 0);
  assert.equal(bounds.ambiguousActionBindingAccepted, 0);
  assert.equal(bounds.ambiguousOracleChannelBindingAccepted, 0);
  assert.equal(bounds.ambiguousNexusEntityBindingAccepted, 0);
});

test('no-expert and irrelevant-expert controls never move Prime', () => {
  for (const group of ['PRIME_ONLY_CONTROL', 'NO_EXPERT_INFORMATION_CONTROL', 'ORACLE_IRRELEVANT_CONTROL', 'NEXUS_IRRELEVANT_CONTROL']) {
    assert.equal(evaluation.controls[group].selectionChanges, 0, `${group} moved Prime`);
  }
  assert.equal(evaluation.bounds.trueButIrrelevantOracleSelectionChanges, 0);
  assert.equal(evaluation.bounds.trueButIrrelevantNexusSelectionChanges, 0);
});

test('two valid experts never combine into authority', () => {
  assert.equal(evaluation.controls.BOTH_WRONG_CONTROL.selectionChanges, 0);
  assert.equal(evaluation.bounds.unresolvedExpertDisagreementReturnsPrime, true);
  assert.equal(evaluation.bounds.bothWrongHarmfulChanges, 0);
  assert.equal(evaluation.bounds.oracleSelectionInfluenceFromNexus, 0);
  assert.equal(evaluation.bounds.nexusSelectionInfluenceFromOracle, 0);
});

test('Prime outside the ambiguity region is never moved', () => {
  assert.equal(evaluation.bounds.nonAmbiguousPrimeCasesChanged, 0);
});

/* ---------------------------------------------------------------------------
 * Determinism, ordering, isolation
 * ------------------------------------------------------------------------- */

test('replay is byte-equivalent', () => {
  assert.equal(evaluation.replay.replayEquivalent, true);
  assert.equal(evaluation.replay.rowDigest, evaluation.replay.replayDigest);
});

test('the same case decided twice produces the same decision digest', () => {
  for (const record of [buildOracleOnlyCase('HOLDOUT', 33), buildNexusOnlyCase('HOLDOUT', 33), buildControlCase('HOLDOUT', 'BOTH_WRONG_CONTROL', 3)]) {
    assert.equal(
      calibratedSelectiveDelegationArbiter(record.input).decisionDigest,
      calibratedSelectiveDelegationArbiter(record.input).decisionDigest,
    );
  }
});

test('evidence order, attestation order and legal-action order are all invariant', () => {
  const invariance = runStage2L10Invariance();
  assert.equal(invariance.expertEvidenceOrderInvariant, true);
  assert.equal(invariance.attestationOrderInvariant, true);
  assert.equal(invariance.legalActionOrderInvariant, true);
  assert.equal(invariance.duplicateEvidenceDoesNotAmplifySupport, true);
  assert.equal(invariance.duplicateAttestationFailsClosed, true);
  assert.equal(invariance.conflictingDuplicateFailsClosed, true);
});

test('failures anywhere in the gate isolate to Prime and authorise nothing', () => {
  const isolation = runStage2L10FailureIsolation();
  assert.equal(isolation.arbiterFailureReturnsPrime, true);
  assert.equal(isolation.calibrationFailureReturnsPrime, true);
  assert.equal(isolation.attestationFailureReturnsPrime, true);
  assert.equal(isolation.oracleFailureSafe, true);
  assert.equal(isolation.noExpertAuthorizedAction, true);
});

/* ---------------------------------------------------------------------------
 * Corpus honesty
 * ------------------------------------------------------------------------- */

test('the holdout contains stress regimes built to defeat the coherence signal', () => {
  const names = STAGE2L10_ORACLE_REGIMES.map((regime) => regime.name);
  for (const stress of ['LATE_REVERSAL_NET_RISE', 'MEAN_REVERTING_LATE_DISPLACEMENT', 'STEP_LEVEL_SHIFT', 'MICRO_DRIFT_UP', 'NOISY_STRONG_RISE']) {
    assert.ok(names.includes(stress), `${stress} must be in the corpus`);
    assert.ok(evaluation.regimeBreakdown[stress].cases > 0, `${stress} produced no holdout cases`);
  }
  // A regime where Oracle is right but the gate abstains: the utility cost, paid visibly.
  const reversal = evaluation.regimeBreakdown.LATE_REVERSAL_NET_RISE;
  assert.ok(reversal.expertCorrect > 0);
  assert.equal(reversal.delegated, 0);
});

test('the Oracle corpus still contains the Stage 2L.9 failure regime and it is now suppressed', () => {
  const oscillation = evaluation.regimeBreakdown.ZERO_DRIFT_OSCILLATION;
  assert.ok(oscillation.cases > 0);
  assert.equal(oscillation.expertCorrect, 0, 'Oracle must still be wrong on every oscillation case');
  assert.equal(oscillation.delegated, 0, 'the Stage 2L.9 harm source must be fully abstained from');
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

test('safety bounds hold at the inherited ceilings', () => {
  assert.ok(certification.overall.harmfulChangeRate <= STAGE2L10_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(certification.overall.correctPrimeBreakRate <= STAGE2L10_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(certification.harmCeiling, 0.01);
  assert.equal(certification.harmCeilingPass, true);
  assert.equal(certification.boundsPass, true);
});

test('utility is real: a never-delegate implementation would fail', () => {
  assert.ok(certification.overall.delegations > 0);
  assert.ok(certification.overall.arbiterTop1 > certification.overall.primeOnlyTop1);
  assert.ok(certification.overall.beneficialChanges > certification.overall.harmfulChanges);
  assert.equal(certification.utilityPass, true);
});

test('correctness discrimination is positive on holdout and beats the Stage 2L.9 baseline', () => {
  assert.ok(certification.discrimination.oracleCorrectnessDiscrimination > 0);
  assert.ok(certification.discrimination.combinedCorrectnessDiscrimination > 0);
  assert.ok(certification.discrimination.nexusCorrectnessDiscrimination >= 0);
  assert.ok(certification.discrimination.oracleCorrectnessDiscrimination > certification.discrimination.stage2l9OracleCorrectnessDiscrimination);
  assert.equal(certification.correctnessDiscriminationPass, true);
});

test('the correctness confusion matrix is complete and consistent', () => {
  for (const side of ['oracle', 'nexus']) {
    const matrix = certification.discrimination[side];
    assert.equal(
      matrix.expertCorrectDelegated + matrix.expertCorrectAbstained + matrix.expertWrongDelegated + matrix.expertWrongAbstained,
      matrix.delegationOpportunities,
    );
  }
});

test('authority stays R0 and nothing is dispatched or mutated', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.arbiterShadowOnly, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  const result = calibratedSelectiveDelegationArbiter(buildOracleOnlyCase('HOLDOUT', 2).input);
  assert.deepEqual(result.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false });
  assert.equal(result.actionGenerated, false);
  assert.equal(result.dispatch, false);
  assert.equal(result.worldMutation, false);
  assert.equal(result.learnedRouting, false);
});

test('no live ZekNova decision delta is claimed', () => {
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
});

test('the certification is self-consistent and reproducible', () => {
  const { certificationHash, ...body } = certification;
  assert.equal(sha256(body), certificationHash);
  assert.equal(certification.stage, STAGE2L10_STAGE);
  assert.equal(certification.status, certification.stage2l10Certified ? 'PASS' : 'FAIL');
  const portability = buildStage2L10PortabilityDigest(certification);
  assert.equal(portability.digest, buildStage2L10PortabilityDigest(certification).digest);
});

test('the stored certification artifact reproduces the recomputed certification', async () => {
  const stored = JSON.parse(await readFile(new URL('../artifacts/stage2l10-arbiter-correctness-calibration-and-selective-delegation/stage2l10-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(stored.certificationHash, certification.certificationHash);
  assert.equal(stored.status, 'PASS');
});

test('the attestation contract is versioned and advisory only', () => {
  const record = buildOracleOnlyCase('HOLDOUT', 9);
  const [attestation] = record.input.correctnessAttestations;
  assert.equal(attestation.contract, STAGE2L10_ATTESTATION_CONTRACT);
  assert.equal(attestation.schemaVersion, 1);
  assert.equal(attestation.advisoryOnly, true);
  assert.equal(attestation.actionGeneration, false);
  const { attestationDigest, ...body } = attestation;
  assert.equal(sha256(body), attestationDigest);
});

test('every control group is measured', () => {
  for (const group of STAGE2L10_CONTROL_GROUPS) {
    assert.ok(evaluation.controls[group].totalCases > 0, `${group} produced no cases`);
  }
});

test('running the full corpus twice yields identical rows', () => {
  const sample = [buildOracleOnlyCase('HOLDOUT', 41), buildNexusOnlyCase('HOLDOUT', 41), buildAttestationAttackCase('HOLDOUT', 'AT_DUPLICATE_ATTESTATION', 2)];
  const first = runStage2L10(sample);
  const second = runStage2L10(sample);
  assert.deepEqual(first.map((row) => row.decisionDigest), second.map((row) => row.decisionDigest));
});
