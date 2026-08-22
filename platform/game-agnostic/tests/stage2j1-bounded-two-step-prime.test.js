import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2J1CertificationEvidence,
  buildStage2J1TwoStepCorpus,
  DEPTH2_BUDGET_GRID,
  exhaustiveTwoStepReference,
  recommendBoundedTwoStep,
  stage2j1TwoStepAdapter,
  STAGE2J1_INHERITED_CERTIFICATION_HASH,
  TWO_STEP_DISCOUNT_FACTOR,
  TWO_STEP_RETURN_CONTRACT,
} from '../src/lab/stage2j1-bounded-two-step-prime.js';

let cached;
const build = () => cached ??= buildStage2J1CertificationEvidence();

test('Stage 2J.1 binds the exact inherited Stage 2J.0 certification', () => {
  assert.equal(STAGE2J1_INHERITED_CERTIFICATION_HASH, '6eb713ce53e0a552475013ab50a765c653974b8bfefe44fe6924ea4b684bc6f0');
  assert.equal(build().inherited.stage2j0Certified, true);
});

test('the corpus exceeds scale and semantic separation requirements', () => {
  const corpus = buildStage2J1TwoStepCorpus();
  assert.equal(corpus.length, 1200);
  assert.deepEqual(build().corpus.splits, { DEVELOPMENT: 400, VALIDATION: 400, FINAL_HOLDOUT: 400 });
  assert.equal(build().corpus.effectiveSemanticGroups, 1200);
  assert.equal(build().corpus.semanticFamilyLeakage, false);
});

test('the return contract is deterministic bounded and undiscounted', () => {
  assert.equal(TWO_STEP_RETURN_CONTRACT, 'G=r0+r1_UNDISCOUNTED_CUMULATIVE_TRANSITION_REWARD');
  assert.equal(TWO_STEP_DISCOUNT_FACTOR, 1);
  assert.equal(build().depthContract.primeCandidateDepth, 2);
  assert.equal(build().depthContract.twoStepReturnActionSensitive, true);
  assert.equal(build().depthContract.twoStepReturnDeterministic, true);
});

test('the independent exhaustive reference enumerates every bounded trajectory', () => {
  const sample = buildStage2J1TwoStepCorpus()[777];
  const first = exhaustiveTwoStepReference(sample.state);
  const replay = exhaustiveTwoStepReference(sample.state);
  assert.equal(first.trajectoriesEvaluated, 25);
  assert.equal(first.bestRootAction, sample.winner);
  assert.equal(sha256(first), sha256(replay));
  assert.equal(build().reference.exhaustive, true);
  assert.equal(build().reference.deterministic, true);
});

test('action-sensitive step reward preserves the solved one-step corpus', () => {
  assert.equal(build().valueContract.actionSensitiveStepRewardPreserved, true);
  assert.equal(build().valueContract.terminalValueActionSensitive, true);
  assert.equal(build().valueContract.wrongActionOvervaluationRate, 0);
  assert.equal(build().oneStep.top1, 1);
  assert.equal(build().oneStep.top2, 1);
});

test('the frozen depth-2 holdout matches its exact reference', () => {
  assert.equal(build().twoStep.cases, 400);
  assert.equal(build().twoStep.top1, 1);
  assert.equal(build().twoStep.top2, 1);
  assert.equal(build().reference.exhaustiveTwoStepReferenceTop1, 1);
  assert.equal(build().reference.primeDepth2VsExhaustiveTwoStepDelta, 0);
});

test('every required two-step category clears the quality gate', () => {
  for (const [name, value] of Object.entries(build().categories)) {
    assert.equal(value, 1, `${name} should be exact`);
  }
});

test('all two-step cases are deceptive to immediate reward and depth-2 solves them', () => {
  assert.equal(build().corpus.deceptiveCases, 1200);
  assert.equal(build().twoStep.deceptiveCases, 400);
  assert.equal(build().twoStep.deceptiveAccuracy, 1);
  assert.equal(build().baselineSemantics.simpleHeuristicBaselines.values.IMMEDIATE_REWARD_ARGMAX, 0);
});

test('depth ablation establishes positive future-consequence value', () => {
  assert.equal(build().depthAblation.depth1Top1, 0);
  assert.equal(build().depthAblation.depth2Top1, 1);
  assert.equal(build().depthAblation.depth2DecisionDelta, 1);
  assert.ok(build().ablations.boundedDepth2ValueAddedOverDepth1 > 0);
});

test('simple heuristics and exact references are separate baseline classes', () => {
  assert.equal(build().baselineSemantics.simpleBaselineAndReferenceOracleSeparated, true);
  assert.equal(build().baselineSemantics.simpleHeuristicBaselines.best.name, 'UNIFORM_RANDOM');
  assert.equal(build().baselineSemantics.simpleHeuristicBaselines.best.top1, .2);
  assert.equal(build().baselineSemantics.primeDepth2BeatsSimpleHeuristics, true);
});

test('root and second-step legal-action reordering is invariant', () => {
  assert.equal(build().invariance.rootActionReorderingInvariant, true);
  assert.equal(build().invariance.secondStepActionReorderingInvariant, true);
});

test('a huge sibling terminal maximum cannot contaminate another root Q', () => {
  assert.equal(build().valueContract.rootActionTrajectoryBinding, true);
  assert.equal(build().valueContract.crossRootValueLeakage, false);
  assert.equal(build().valueContract.terminalOutcomeReads, 0);
});

test('the budget and branching factor are explicitly bounded', () => {
  assert.deepEqual(DEPTH2_BUDGET_GRID, [32, 64, 96, 128]);
  assert.equal(build().candidateSelection.selectedBudget, 32);
  assert.equal(build().search.averageRootActions, 5);
  assert.equal(build().search.averageSecondStepActions, 5);
  assert.equal(build().search.averageTrajectoriesEvaluated, 25);
  assert.equal(build().search.maxTrajectoriesPerRecommendation, 25);
});

test('MAX_Q and MAX_VISITS are the only pre-registered selection rules', () => {
  assert.deepEqual(build().candidateSelection.preRegisteredFinalRules, ['MAX_Q', 'MAX_VISITS']);
  assert.equal(build().candidateSelection.selectedPrimeDepth2Candidate, 'STEP_REWARD_BOUNDED_DEPTH2_MAX_Q');
  assert.equal(build().candidateSelection.selectionFrozen, true);
  assert.equal(build().search.policyPriorChanged, false);
});

test('the full frozen 7 of 10 gate passes without production or expert influence', () => {
  assert.equal(build().capability.primeDepth2CandidateScore, 7);
  assert.equal(build().capability.prime7Of10GatePass, true);
  assert.ok(Object.values(build().capability.gateChecks).every(Boolean));
  assert.equal(build().freezes.oracleV2SelectionInfluence, 0);
  assert.equal(build().freezes.nexusSelectionInfluence, 0);
  assert.equal(build().production.primeProductionReplaced, false);
  assert.equal(build().production.primeDepth2CandidatePromoted, false);
  assert.deepEqual(build().safety.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('recommendations and aggregate certification replay deterministically', () => {
  const sample = buildStage2J1TwoStepCorpus()[1199];
  const options = { adapter: stage2j1TwoStepAdapter, state: sample.state, seed: BigInt(sample.seed), budget: 32 };
  assert.equal(recommendBoundedTwoStep(options).recommendationDigest, recommendBoundedTwoStep(options).recommendationDigest);
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
});
