import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import { recommend } from '../src/prime/root-puct.js';
import { stage2i0CapabilityAdapter } from '../src/lab/stage2i0-capability-adapter.js';
import { buildStage2J0PrimeCases, buildStage2J0PrimeDiagnostic, STAGE2J0_EXPECTED_STAGE2I0_CORPUS_DIGEST } from '../src/lab/stage2j0-prime-selection-diagnostic.js';

let cached;
const build = () => cached ??= buildStage2J0PrimeDiagnostic();

test('the exact frozen Stage 2I.0 Prime corpus is reconstructed', () => {
  assert.equal(sha256(buildStage2J0PrimeCases()), STAGE2J0_EXPECTED_STAGE2I0_CORPUS_DIGEST);
  assert.equal(build().inherited.corpusDigestReproduced, true);
});

test('the frozen 600-case Prime baseline reproduces exactly', () => {
  assert.equal(build().reproduction.reproduced, true);
  assert.equal(build().reproduction.top1, 0.21333333333333335);
  assert.equal(build().reproduction.top2, 0.4116666666666667);
  assert.equal(build().reproduction.valueOrdering, 0.8533333333333334);
  assert.equal(build().reproduction.illegalActionRate, 0);
  assert.equal(build().reproduction.replayRate, 1);
  assert.equal(build().reproduction.traceMatchesProduction, true);
});

test('legacy value ordering is identified as self-consistency rather than accuracy', () => {
  assert.equal(build().valueSelectionGap.valueOrderingGroundTruth, 'NONE_INTERNAL_SELF_CONSISTENCY_ONLY');
  assert.equal(build().valueSelectionGap.legacyMetricGroundTruthAccuracyClaimValid, false);
  assert.equal(build().valueSelectionGap.intendedStepRewardValueTop1Correct, 600);
  assert.equal(build().valueSelectionGap.intendedStepRewardValueTop1CorrectFinalSelectionWrong, 472);
});

test('uniform policy is measured independently and is not called informative', () => {
  assert.equal(build().policy.entropyMean, Math.log(5));
  assert.equal(build().policy.trueBestActionMeanProbability, .2);
  assert.equal(build().policy.primaryFailure, false);
});

test('terminal outcome destroys action identity after a correct step reward', () => {
  assert.equal(build().value.actualTerminalValue.allActionsReceiveSameMaximum, true);
  assert.equal(build().value.intendedStepReward.actionSensitive, true);
  assert.equal(build().value.intendedStepReward.top1, 1);
  assert.equal(build().binding.valueBindingDefect, true);
  assert.equal(build().binding.actionBindingDefect, false);
});

test('all baseline failures receive exactly one first-layer attribution', () => {
  assert.equal(build().failureAttribution.top1Failures, 472);
  assert.equal(build().failureAttribution.attributed, 472);
  assert.equal(build().failureAttribution.unattributed, 0);
  assert.equal(build().failureAttribution.counts.GROUND_TRUTH_CONTRACT_MISMATCH, 472);
  assert.equal(build().failureAttribution.perCase.length, 472);
});

test('action ordering and reward sign controls are clean', () => {
  const entry = buildStage2J0PrimeCases()[137];
  const reorderedAdapter = Object.freeze({
    ...stage2i0CapabilityAdapter,
    legalActions(state, observerId) {
      return [...stage2i0CapabilityAdapter.legalActions(state, observerId)].reverse();
    },
  });
  const options = { state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) };
  const canonical = recommend({ ...options, adapter: stage2i0CapabilityAdapter });
  const adversariallyReordered = recommend({ ...options, adapter: reorderedAdapter });
  assert.equal(adversariallyReordered.recommendationHash, canonical.recommendationHash);
  assert.equal(build().binding.actionReorderingInvariant, true);
  assert.equal(build().rewardSign.consistent, true);
  assert.equal(build().rewardSign.maximizationDirection, true);
});

test('more simulations do not materially repair erased action values', () => {
  assert.deepEqual(build().budget.curve.map((entry) => entry.simulations), [1, 4, 8, 16, 32, 64, 96, 128, 256, 512]);
  assert.equal(build().budget.moreSimulationsHelp, false);
});

test('the pre-registered cPuct sweep rejects exploration as primary cause', () => {
  assert.deepEqual(build().cPuct.sweep.map((entry) => entry.multiplier), [0, .25, .5, 1, 2, 4]);
  assert.equal(build().cPuct.verdict, 'NOT_PRIMARY');
});

test('bounded exhaustive depth reference proves a separate root-only limitation', () => {
  assert.equal(build().depth.deterministicExhaustiveReference, true);
  assert.equal(build().depth.metrics.ONE_STEP_OBVIOUS.depth1Accuracy, 1);
  assert.equal(build().depth.metrics.TWO_STEP_REQUIRED.depth1Accuracy, .2);
  assert.equal(build().depth.metrics.DECEPTIVE_IMMEDIATE_REWARD.depth1Accuracy, 0);
  assert.equal(build().depth.depth2Top1, 1);
});

test('candidate family is small separated and frozen before holdout', () => {
  const selection = build().remediation.candidateSelection;
  assert.equal(selection.family.length, 3);
  assert.equal(selection.semanticFamilyLeakage, false);
  assert.equal(selection.selectedPrimeCandidate, 'STEP_REWARD_MAX_Q');
  assert.equal(selection.selectionFrozen, true);
});

test('one-shot holdout measures the lab candidate without promotion', () => {
  assert.equal(build().finalHoldout.runCount, 1);
  assert.equal(build().finalHoldout.primeV1.top1, 0.21333333333333335);
  assert.equal(build().finalHoldout.candidate.top1, 1);
  assert.equal(build().finalHoldout.candidate.top2, 1);
  assert.equal(build().production.primeProductionReplaced, false);
  assert.equal(build().production.primeCandidatePromoted, false);
});

test('capability gate remains failed where the candidate only ties a simple oracle', () => {
  assert.equal(build().capability.candidateScore, 7);
  assert.equal(build().capability.prime7Of10GatePass, false);
  assert.equal(build().capability.gateChecks.beatsSimpleBaselines, false);
  assert.equal(build().capability.gateChecks.demonstratedTwoStepCorpus, false);
  assert.equal(build().capability.diagnosticPassCapabilityGateFail, true);
});

test('Oracle V2 Nexus expert influence production and R0 remain frozen', () => {
  assert.deepEqual(build().freezes, { primeChanged: false, oracleV2Changed: false, oracleV2SelectionInfluence: 0, nexusChanged: false, nexusSelectionInfluence: 0, expertSelectionInfluence: 0 });
  assert.deepEqual(build().safety.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
  assert.equal(build().safety.liveActionDispatches, 0);
  assert.equal(build().safety.worldMutations, 0);
});

test('the complete diagnostic replays byte-equivalently', () => {
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
});
