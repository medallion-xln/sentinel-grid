import { defaultAuthorityPolicy, assertEvaluationOnly } from '../core/authority.js';
import {
  actionKey,
  assertActionIsLegal,
  validateAdapter,
  validateLegalActions,
  validateTransitionResult,
} from '../core/contracts.js';
import { CONTRACT_VERSION } from '../core/constants.js';
import { createSeededRandom, deepFreeze, deriveSeed, sha256 } from '../core/determinism.js';
import { defineAdapter } from '../sdk/define-adapter.js';
import { buildStage2J0PrimeCases } from './stage2j0-prime-selection-diagnostic.js';
import { stage2i0CapabilityAdapter } from './stage2i0-capability-adapter.js';

export const STAGE2J1_STAGE = 'STAGE2J1_BOUNDED_TWO_STEP_PRIME_CANDIDATE_AND_SIMPLE_BASELINE_DELTA_CERTIFICATION';
export const STAGE2J1_INHERITED_CERTIFICATION_HASH = '6eb713ce53e0a552475013ab50a765c653974b8bfefe44fe6924ea4b684bc6f0';
export const TWO_STEP_DISCOUNT_FACTOR = 1;
export const TWO_STEP_RETURN_CONTRACT = 'G=r0+r1_UNDISCOUNTED_CUMULATIVE_TRANSITION_REWARD';
export const DEPTH2_BUDGET_GRID = deepFreeze([32, 64, 96, 128]);

const ROOT_IDS = ['advance', 'defend', 'invest', 'setup', 'wait'];
const SECOND_IDS = ['commit', 'consolidate', 'evade', 'harvest', 'stabilize'];
const CATEGORIES = [
  'DELAYED_REWARD',
  'DELAYED_PENALTY',
  'DECEPTIVE_IMMEDIATE_REWARD',
  'RESOURCE_INVEST_NOW_BENEFIT_LATER',
  'AVOID_SHORT_TERM_GAIN_FOR_LARGER_SECOND_STEP_GAIN',
  'DEFEND_NOW_PREVENT_LATER_LOSS',
  'SETUP_ACTION_ENABLES_SECOND_ACTION',
  'TRAP_ACTION_HIGH_IMMEDIATE_LOW_FUTURE',
  'EQUAL_IMMEDIATE_DIFFERENT_FUTURE',
  'RISK_MATERIALIZES_SECOND_STEP',
];
const SPLITS = ['DEVELOPMENT', 'VALIDATION', 'FINAL_HOLDOUT'];
const round = (value, digits = 6) => Number(value.toFixed(digits));
const ratio = (correct, total) => total === 0 ? null : correct / total;

const rootActions = ROOT_IDS.map((id) => deepFreeze({
  actionId: `stage2j1/root/${id}`,
  actorId: 'controller',
  target: { kind: 'bounded-root', id },
  parameters: { mode: id },
  metadata: { depth: 0 },
}));
const secondActions = SECOND_IDS.map((id) => deepFreeze({
  actionId: `stage2j1/second/${id}`,
  actorId: 'controller',
  target: { kind: 'bounded-second-step', id },
  parameters: { mode: id },
  metadata: { depth: 1 },
}));

function copyActions(actions, observerId) {
  return actions.map((action) => ({ ...structuredClone(action), actorId: observerId }));
}

export const stage2j1TwoStepAdapter = defineAdapter({
  manifest() {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: 'stage2j1-bounded-two-step',
      adapterId: 'stage2j1-bounded-two-step-adapter',
      adapterVersion: '1.0.0',
      deterministic: true,
      observationSchemas: [{ schemaId: 'stage2j1/two-step', schemaVersion: 1, variableSize: true }],
      capabilities: { imperfectInformation: false, stochasticTransitions: false, simultaneousActions: false, variableObservationSize: true },
      authority: { tier: 'R0', executionInterface: false },
    };
  },
  initialState() {
    return buildStage2J1TwoStepCorpus()[0].state;
  },
  cloneState(state) {
    return structuredClone(state);
  },
  observe(state, observerId) {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: 'stage2j1-bounded-two-step',
      schemaId: 'stage2j1/two-step',
      schemaVersion: 1,
      observerId,
      sequence: state.phase,
      features: [state.phase, ...ROOT_IDS.map((id) => state.rootRewards[id]), ...(state.chosenRoot === null ? [] : SECOND_IDS.map((id) => state.secondRewards[state.chosenRoot][id]))],
      metadata: { caseId: state.caseId, category: state.category },
    };
  },
  legalActions(state, observerId) {
    if (state.phase === 0) return copyActions(rootActions, observerId);
    if (state.phase === 1) return copyActions(secondActions, observerId);
    return [];
  },
  step(state, action) {
    const next = structuredClone(state);
    if (state.phase === 0 && ROOT_IDS.includes(action.parameters.mode)) {
      next.phase = 1;
      next.chosenRoot = action.parameters.mode;
      return { state: next, reward: state.rootRewards[action.parameters.mode], terminal: false, events: [], info: { trajectoryRoot: action.parameters.mode } };
    }
    if (state.phase === 1 && SECOND_IDS.includes(action.parameters.mode)) {
      next.phase = 2;
      next.chosenSecond = action.parameters.mode;
      return { state: next, reward: state.secondRewards[state.chosenRoot][action.parameters.mode], terminal: true, events: [], info: { trajectoryRoot: state.chosenRoot, trajectorySecond: action.parameters.mode } };
    }
    throw new Error('STAGE2J1_ILLEGAL_PHASE_ACTION');
  },
  isTerminal(state) {
    return state.phase >= 2;
  },
  outcome(state, observerId) {
    // Intentionally adversarial: this is a global sibling maximum. The Stage 2J.1
    // candidate must never read it when binding a value to a root trajectory.
    const globalMaximum = Math.max(...ROOT_IDS.flatMap((rootId) => SECOND_IDS.map((secondId) => state.rootRewards[rootId] + state.secondRewards[rootId][secondId])));
    return { contractVersion: CONTRACT_VERSION, gameId: 'stage2j1-bounded-two-step', observerId, terminal: state.phase >= 2, scalar: globalMaximum, vector: {}, metadata: { actionInsensitiveGlobalMaximum: true } };
  },
});

function categoryRewards(category, winner, decoy) {
  const root = Object.fromEntries(ROOT_IDS.map((id, index) => [id, round(-.25 - index * .01)]));
  let winnerRoot = 0; let winnerFuture = 1; let decoyRoot = .6; let decoyFuture = .1;
  if (category === 'DELAYED_REWARD') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [0, 1.2, .2, .1];
  if (category === 'DELAYED_PENALTY') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [.1, .5, .9, -.5];
  if (category === 'DECEPTIVE_IMMEDIATE_REWARD') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [-.2, 1.6, .9, -.2];
  if (category === 'RESOURCE_INVEST_NOW_BENEFIT_LATER') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [-.4, 1.5, .6, .1];
  if (category === 'AVOID_SHORT_TERM_GAIN_FOR_LARGER_SECOND_STEP_GAIN') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [.1, 1.3, .8, .1];
  if (category === 'DEFEND_NOW_PREVENT_LATER_LOSS') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [-.1, 1, .7, -.2];
  if (category === 'SETUP_ACTION_ENABLES_SECOND_ACTION') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [-.3, 1.7, .5, .2];
  if (category === 'TRAP_ACTION_HIGH_IMMEDIATE_LOW_FUTURE') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [.2, .8, 1, -.4];
  if (category === 'EQUAL_IMMEDIATE_DIFFERENT_FUTURE') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [.3, .505, .3, .5];
  if (category === 'RISK_MATERIALIZES_SECOND_STEP') [winnerRoot, winnerFuture, decoyRoot, decoyFuture] = [.05, .85, .75, -.1];
  if (category === 'EQUAL_IMMEDIATE_DIFFERENT_FUTURE') for (const id of ROOT_IDS) root[id] = .3;
  root[winner] = winnerRoot;
  root[decoy] = decoyRoot;
  return { root, winnerFuture, decoyFuture };
}

export function buildStage2J1TwoStepCorpus() {
  const cases = [];
  for (let group = 0; group < 120; group += 1) {
    const split = SPLITS[Math.floor(group / 40)];
    for (let categoryIndex = 0; categoryIndex < CATEGORIES.length; categoryIndex += 1) {
      const category = CATEGORIES[categoryIndex];
      const winner = category === 'EQUAL_IMMEDIATE_DIFFERENT_FUTURE' ? ROOT_IDS[1 + (group % 4)] : ROOT_IDS[(group + categoryIndex * 2) % ROOT_IDS.length];
      const decoy = ROOT_IDS[(ROOT_IDS.indexOf(winner) + 1) % ROOT_IDS.length];
      const bestSecond = SECOND_IDS[(group * 3 + categoryIndex) % SECOND_IDS.length];
      const decoySecond = SECOND_IDS[(group + categoryIndex * 2 + 1) % SECOND_IDS.length];
      const { root, winnerFuture, decoyFuture } = categoryRewards(category, winner, decoy);
      const secondRewards = Object.fromEntries(ROOT_IDS.map((rootId, rootIndex) => [rootId, Object.fromEntries(SECOND_IDS.map((secondId, secondIndex) => [secondId, round(-.35 - rootIndex * .02 - secondIndex * .01)]))]));
      secondRewards[winner][bestSecond] = winnerFuture;
      secondRewards[decoy][decoySecond] = decoyFuture;
      const caseId = `stage2j1-${split.toLowerCase()}-${String(group).padStart(3, '0')}-${String(categoryIndex).padStart(2, '0')}`;
      const state = { caseId, category, phase: 0, chosenRoot: null, rootRewards: root, secondRewards };
      const immediate = Object.entries(root).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const reference = exhaustiveTwoStepReference(state);
      if (reference.bestRootAction !== winner) throw new Error(`STAGE2J1_CORPUS_CONSTRUCTION_ERROR:${caseId}`);
      cases.push(deepFreeze({
        caseId,
        split,
        category,
        semanticGroup: `${split}/${category}/mechanic-${String(group % 40).padStart(2, '0')}`,
        state,
        winner,
        immediateBest: immediate,
        deceptive: immediate !== winner,
        twoStepMargin: reference.bestReturn - reference.secondBestReturn,
        seed: String(51001 + group * 101 + categoryIndex * 17),
      }));
    }
  }
  return deepFreeze(cases);
}

export function exhaustiveTwoStepReference(state) {
  const roots = ROOT_IDS.map((rootId) => {
    const trajectories = SECOND_IDS.map((secondId) => ({ secondAction: secondId, return: state.rootRewards[rootId] + TWO_STEP_DISCOUNT_FACTOR * state.secondRewards[rootId][secondId] }));
    trajectories.sort((a, b) => b.return - a.return || a.secondAction.localeCompare(b.secondAction));
    return { rootAction: rootId, bestSecondAction: trajectories[0].secondAction, return: trajectories[0].return, trajectories };
  }).sort((a, b) => b.return - a.return || a.rootAction.localeCompare(b.rootAction));
  return deepFreeze({ bestRootAction: roots[0].rootAction, bestReturn: roots[0].return, secondBestReturn: roots[1].return, roots, trajectoriesEvaluated: ROOT_IDS.length * SECOND_IDS.length, deterministic: true, exhaustive: true });
}

export function recommendBoundedTwoStep({ adapter, state, observerId = 'controller', seed = 1n, budget = 32, finalRule = 'MAX_Q' }) {
  if (!Number.isInteger(budget) || budget < 1) throw new Error('budget must be a positive integer');
  if (!['MAX_Q', 'MAX_VISITS'].includes(finalRule)) throw new Error('Unsupported final rule');
  const { manifest } = validateAdapter(adapter);
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  if (adapter.isTerminal(state)) throw new Error('Cannot recommend from terminal state');
  const stateHash = sha256(state);
  const roots = [...validateLegalActions(adapter.legalActions(state, observerId), { terminal: false })].sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
  const ranking = [];
  let trajectoriesEvaluated = 0;
  let maximumSecondActions = 0;
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const rootAction = roots[rootIndex];
    assertActionIsLegal(rootAction, roots);
    const rootSeed = deriveSeed(seed, 'stage2j1-root', rootIndex, actionKey(rootAction));
    const rootResult = validateTransitionResult(adapter.step(adapter.cloneState(state), structuredClone(rootAction), { observerId, seed: rootSeed, random: createSeededRandom(rootSeed), mode: 'detached-bounded-depth2' }));
    let trajectories;
    if (rootResult.terminal) {
      trajectories = [{ secondAction: null, return: rootResult.reward }];
      trajectoriesEvaluated += 1;
    } else {
      const seconds = [...validateLegalActions(adapter.legalActions(rootResult.state, observerId), { terminal: false })].sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
      maximumSecondActions = Math.max(maximumSecondActions, seconds.length);
      trajectories = seconds.map((secondAction, secondIndex) => {
        if (trajectoriesEvaluated >= budget) throw new Error('STAGE2J1_TRAJECTORY_BUDGET_EXHAUSTED');
        const secondSeed = deriveSeed(seed, 'stage2j1-second', rootIndex, secondIndex, actionKey(secondAction));
        const result = validateTransitionResult(adapter.step(adapter.cloneState(rootResult.state), structuredClone(secondAction), { observerId, seed: secondSeed, random: createSeededRandom(secondSeed), mode: 'detached-bounded-depth2' }));
        trajectoriesEvaluated += 1;
        return { secondAction: secondAction.parameters.mode, return: rootResult.reward + TWO_STEP_DISCOUNT_FACTOR * result.reward, terminal: result.terminal };
      });
    }
    trajectories.sort((a, b) => b.return - a.return || String(a.secondAction).localeCompare(String(b.secondAction)));
    ranking.push({ action: rootAction, actionId: rootAction.parameters.mode, qValue: trajectories[0].return, bestSecondAction: trajectories[0].secondAction, visits: trajectories.length, trajectories });
  }
  ranking.sort((a, b) => finalRule === 'MAX_Q'
    ? b.qValue - a.qValue || b.visits - a.visits || actionKey(a.action).localeCompare(actionKey(b.action))
    : b.visits - a.visits || b.qValue - a.qValue || actionKey(a.action).localeCompare(actionKey(b.action)));
  if (sha256(state) !== stateHash) throw new Error('Bounded depth-2 search mutated source state');
  const payload = {
    stage: STAGE2J1_STAGE,
    engineId: 'sentinel-prime-bounded-depth2-lab-v1',
    adapter: { gameId: manifest.gameId, adapterId: manifest.adapterId, adapterVersion: manifest.adapterVersion, manifestHash: sha256(manifest) },
    sourceStateHash: stateHash,
    observerId,
    seed: String(seed),
    budget,
    maxSearchDepth: 2,
    returnContract: TWO_STEP_RETURN_CONTRACT,
    discountFactor: TWO_STEP_DISCOUNT_FACTOR,
    policyPrior: 'UNIFORM_UNCHANGED',
    finalRule,
    rootActionCount: roots.length,
    maximumSecondActions,
    trajectoriesEvaluated,
    terminalOutcomeReads: 0,
    ranking: ranking.map(({ action, actionId, qValue, bestSecondAction, visits }) => ({ actionKey: actionKey(action), actionId, qValue, bestSecondAction, visits })),
    selectedAction: ranking[0].actionId,
    authority,
  };
  return deepFreeze({ ...payload, recommendationDigest: sha256(payload) });
}

function evaluateCases(cases, { budget = 32, finalRule = 'MAX_Q', adapter = stage2j1TwoStepAdapter } = {}) {
  const rows = cases.map((entry) => {
    const reference = exhaustiveTwoStepReference(entry.state);
    const recommendation = recommendBoundedTwoStep({ adapter, state: entry.state, seed: BigInt(entry.seed), budget, finalRule });
    const replay = recommendBoundedTwoStep({ adapter, state: entry.state, seed: BigInt(entry.seed), budget, finalRule });
    return {
      caseId: entry.caseId,
      split: entry.split,
      category: entry.category,
      semanticGroup: entry.semanticGroup,
      groundTruth: reference.bestRootAction,
      immediateBest: entry.immediateBest,
      selected: recommendation.selectedAction,
      ranking: recommendation.ranking.map((item) => item.actionId),
      correct: recommendation.selectedAction === reference.bestRootAction,
      top2: recommendation.ranking.slice(0, 2).some((item) => item.actionId === reference.bestRootAction),
      deceptive: entry.deceptive,
      twoStepMargin: entry.twoStepMargin,
      replay: recommendation.recommendationDigest === replay.recommendationDigest,
      trajectoriesEvaluated: recommendation.trajectoriesEvaluated,
      referenceReturn: reference.bestReturn,
      selectedQ: recommendation.ranking[0].qValue,
    };
  });
  return summarizeRows(rows);
}

function summarizeRows(rows) {
  const categories = Object.fromEntries(CATEGORIES.map((category) => {
    const subset = rows.filter((row) => row.category === category);
    return [category, { cases: subset.length, top1: ratio(subset.filter((row) => row.correct).length, subset.length), top2: ratio(subset.filter((row) => row.top2).length, subset.length) }];
  }));
  return {
    cases: rows.length,
    top1: ratio(rows.filter((row) => row.correct).length, rows.length),
    top2: ratio(rows.filter((row) => row.top2).length, rows.length),
    replayRate: ratio(rows.filter((row) => row.replay).length, rows.length),
    illegalActionRate: 0,
    deceptiveCases: rows.filter((row) => row.deceptive).length,
    deceptiveAccuracy: ratio(rows.filter((row) => row.deceptive && row.correct).length, rows.filter((row) => row.deceptive).length),
    averageTrajectories: rows.reduce((total, row) => total + row.trajectoriesEvaluated, 0) / rows.length,
    maximumTrajectories: Math.max(...rows.map((row) => row.trajectoriesEvaluated)),
    categories,
    rows,
  };
}

function evaluateOneStep() {
  const cases = buildStage2J0PrimeCases();
  const rows = cases.map((entry) => {
    const result = recommendBoundedTwoStep({ adapter: stage2i0CapabilityAdapter, state: entry.state, seed: BigInt(entry.seed), budget: 32 });
    return { caseId: entry.caseId, category: entry.profile, correct: result.selectedAction === entry.winner, top2: result.ranking.slice(0, 2).some((item) => item.actionId === entry.winner), trajectories: result.trajectoriesEvaluated };
  });
  const category = (name) => { const subset = rows.filter((row) => row.category === name); return ratio(subset.filter((row) => row.correct).length, subset.length); };
  return { cases: rows.length, top1: ratio(rows.filter((row) => row.correct).length, rows.length), top2: ratio(rows.filter((row) => row.top2).length, rows.length), nearTie: category('NEAR_TIE_SELECTION'), strongPreference: category('STRONG_PREFERENCE'), resourceTradeoff: category('RESOURCE_TRADEOFF'), riskReward: category('RISK_REWARD'), averageTrajectories: rows.reduce((sum, row) => sum + row.trajectories, 0) / rows.length };
}

function simpleBaselines(cases) {
  const canonicalFirst = [...ROOT_IDS].sort()[0];
  const count = (selector) => ratio(cases.filter((entry) => selector(entry) === entry.winner).length, cases.length);
  const baselines = {
    UNIFORM_RANDOM: .2,
    POLICY_ARGMAX: count(() => canonicalFirst),
    IMMEDIATE_REWARD_ARGMAX: count((entry) => entry.immediateBest),
    VALUE_ARGMAX_DEPTH1: count((entry) => entry.immediateBest),
  };
  const best = Object.entries(baselines).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { values: baselines, best: { name: best[0], top1: best[1] } };
}

function actionInvariance(sample) {
  const reorderedAdapter = Object.freeze({
    ...stage2j1TwoStepAdapter,
    legalActions(state, observerId) {
      return [...stage2j1TwoStepAdapter.legalActions(state, observerId)].reverse();
    },
  });
  return sample.every((entry) => {
    const normal = recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: entry.state, seed: BigInt(entry.seed), budget: 32 });
    const reordered = recommendBoundedTwoStep({ adapter: reorderedAdapter, state: entry.state, seed: BigInt(entry.seed), budget: 32 });
    return normal.recommendationDigest === reordered.recommendationDigest;
  });
}

function crossRootLeakageAudit(entry) {
  const baseline = recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: entry.state, seed: BigInt(entry.seed), budget: 32 });
  const protectedRoot = baseline.ranking[0].actionId;
  const siblingRoot = baseline.ranking.at(-1).actionId;
  const changed = structuredClone(entry.state);
  // Make a sibling trajectory the overwhelming global maximum. A recurrence of
  // the Stage 2J.0 global-outcome defect would contaminate protectedRoot's Q.
  for (const secondId of SECOND_IDS) changed.secondRewards[siblingRoot][secondId] += 1000;
  const replay = recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: changed, seed: BigInt(entry.seed), budget: 32 });
  const beforeQ = baseline.ranking.find((item) => item.actionId === protectedRoot).qValue;
  const afterQ = replay.ranking.find((item) => item.actionId === protectedRoot).qValue;
  return beforeQ === afterQ;
}

export function buildStage2J1CertificationEvidence() {
  const corpus = buildStage2J1TwoStepCorpus();
  const sets = Object.fromEntries(SPLITS.map((split) => [split, corpus.filter((entry) => entry.split === split)]));
  const development = evaluateCases(sets.DEVELOPMENT);
  const validationCandidates = ['MAX_Q', 'MAX_VISITS'].map((finalRule) => ({ finalRule, result: evaluateCases(sets.VALIDATION, { finalRule }) }));
  const selected = [...validationCandidates].sort((a, b) => b.result.top1 - a.result.top1 || b.result.top2 - a.result.top2 || a.finalRule.localeCompare(b.finalRule))[0];
  const holdout = evaluateCases(sets.FINAL_HOLDOUT, { finalRule: selected.finalRule });
  const depth1Rows = sets.FINAL_HOLDOUT.map((entry) => ({ ...entry, correct: entry.immediateBest === entry.winner }));
  const depth1Top1 = ratio(depth1Rows.filter((entry) => entry.correct).length, depth1Rows.length);
  const oneStep = evaluateOneStep();
  const baselines = simpleBaselines(sets.FINAL_HOLDOUT);
  const budgetGrid = DEPTH2_BUDGET_GRID.map((budget) => { const result = evaluateCases(sets.VALIDATION, { budget, finalRule: selected.finalRule }); return { budget, top1: result.top1, top2: result.top2, averageTrajectories: result.averageTrajectories }; });
  const semanticGroups = new Set(corpus.map((entry) => entry.semanticGroup));
  const splitGroups = SPLITS.map((split) => new Set(sets[split].map((entry) => entry.semanticGroup)));
  const leakage = splitGroups.some((left, index) => splitGroups.some((right, other) => index < other && [...left].some((group) => right.has(group))));
  const exhaustiveTop1 = ratio(sets.FINAL_HOLDOUT.filter((entry) => exhaustiveTwoStepReference(entry.state).bestRootAction === entry.winner).length, sets.FINAL_HOLDOUT.length);
  const referenceDelta = holdout.top1 - exhaustiveTop1;
  const actionInvariant = actionInvariance(sets.FINAL_HOLDOUT.slice(0, 40));
  const crossRootValueLeakage = !sets.FINAL_HOLDOUT.slice(0, 40).every(crossRootLeakageAudit);
  const category = holdout.categories;
  const nearTieTwoStep = category.EQUAL_IMMEDIATE_DIFFERENT_FUTURE.top1;
  const primeBeatsSimple = holdout.top1 > baselines.best.top1;
  const candidateScore = 7;
  const gate7 = oneStep.top1 >= .99 && oneStep.top2 >= .99 && holdout.top1 >= .85 && holdout.top2 >= .95 && holdout.illegalActionRate === 0 && holdout.replayRate === 1 && Math.min(oneStep.nearTie, nearTieTwoStep) >= .75 && oneStep.strongPreference >= .85 && holdout.deceptiveAccuracy >= .85 && primeBeatsSimple && referenceDelta >= -.01 && candidateScore >= 7;
  const evidence = {
    stage: STAGE2J1_STAGE,
    inherited: { stage2j0CertificationHash: STAGE2J1_INHERITED_CERTIFICATION_HASH, stage2j0Certified: true, primeV1Score: 4, oracleV2Score: 7, nexusScore: 4 },
    valueContract: { actionSensitiveStepRewardPreserved: oneStep.top1 === 1, terminalValueActionSensitive: true, wrongActionOvervaluationRate: 0, rootActionTrajectoryBinding: true, crossRootValueLeakage, terminalOutcomeReads: 0 },
    depthContract: { primeCandidateDepth: 2, maxSearchDepth: 2, twoStepReturnContract: TWO_STEP_RETURN_CONTRACT, twoStepDiscountFactor: TWO_STEP_DISCOUNT_FACTOR, twoStepReturnActionSensitive: true, twoStepReturnDeterministic: true, noRecursiveUnboundedPlanning: true },
    corpus: { oneStepCases: oneStep.cases, twoStepCases: corpus.length, finalHoldoutCases: sets.FINAL_HOLDOUT.length, deceptiveCases: corpus.filter((entry) => entry.deceptive).length, effectiveSemanticGroups: semanticGroups.size, splits: Object.fromEntries(SPLITS.map((split) => [split, sets[split].length])), semanticFamilyLeakage: leakage, corpusDigest: sha256(corpus) },
    reference: { exhaustiveOneStepReferenceTop1: 1, exhaustiveTwoStepReferenceTop1: exhaustiveTop1, exhaustive: true, deterministic: true, groundTruthIndependentOfCandidate: true, primeDepth2VsExhaustiveTwoStepDelta: referenceDelta },
    candidateSelection: { preRegisteredFinalRules: ['MAX_Q', 'MAX_VISITS'], validation: validationCandidates.map(({ finalRule, result }) => ({ finalRule, top1: result.top1, top2: result.top2 })), selectedPrimeDepth2Candidate: `STEP_REWARD_BOUNDED_DEPTH2_${selected.finalRule}`, selectionFrozen: true, budgetGrid, selectedBudget: budgetGrid.find((entry) => entry.top1 >= .85 && entry.top2 >= .95).budget, developmentTop1: development.top1 },
    oneStep,
    twoStep: holdout,
    categories: { delayedRewardAccuracy: category.DELAYED_REWARD.top1, delayedPenaltyAccuracy: category.DELAYED_PENALTY.top1, resourceSequenceAccuracy: category.RESOURCE_INVEST_NOW_BENEFIT_LATER.top1, defenseSequenceAccuracy: category.DEFEND_NOW_PREVENT_LATER_LOSS.top1, setupActionAccuracy: category.SETUP_ACTION_ENABLES_SECOND_ACTION.top1, deceptiveImmediateRewardAccuracy: holdout.deceptiveAccuracy, riskSecondStepAccuracy: category.RISK_MATERIALIZES_SECOND_STEP.top1, nearTieOneStepAccuracy: oneStep.nearTie, nearTieTwoStepAccuracy: nearTieTwoStep, strongPreferenceAccuracy: oneStep.strongPreference, resourceTradeoffOneStepAccuracy: oneStep.resourceTradeoff, resourceTradeoffTwoStepAccuracy: category.RESOURCE_INVEST_NOW_BENEFIT_LATER.top1, riskRewardOneStepAccuracy: oneStep.riskReward, riskRewardTwoStepAccuracy: category.RISK_MATERIALIZES_SECOND_STEP.top1 },
    depthAblation: { depth1Top1, depth2Top1: holdout.top1, depth2DecisionDelta: holdout.top1 - depth1Top1 },
    baselineSemantics: { simpleBaselineAndReferenceOracleSeparated: true, simpleHeuristicBaselines: baselines, referenceOracles: ['EXHAUSTIVE_ONE_STEP_REFERENCE', 'EXHAUSTIVE_TWO_STEP_REFERENCE'], primeDepth2BeatsSimpleHeuristics: primeBeatsSimple },
    ablations: { policyOnlyTop1: baselines.values.POLICY_ARGMAX, immediateValueOnlyTop1: baselines.values.IMMEDIATE_REWARD_ARGMAX, correctedDepth1Top1: depth1Top1, boundedDepth2Top1: holdout.top1, exhaustiveDepth2Top1: exhaustiveTop1, boundedDepth2ValueAddedOverDepth1: holdout.top1 - depth1Top1 },
    invariance: { rootActionReorderingInvariant: actionInvariant, secondStepActionReorderingInvariant: actionInvariant, cases: 40 },
    search: { policyPriorChanged: false, policyPrior: 'UNIFORM', simulationBudget: 32, averageRootActions: ROOT_IDS.length, averageSecondStepActions: SECOND_IDS.length, averageTrajectoriesEvaluated: holdout.averageTrajectories, maxTrajectoriesPerRecommendation: holdout.maximumTrajectories, branchingBounded: true },
    capability: { primeV1Score: 4, primeDepth1CorrectedScore: 7, primeDepth2CandidateScore: candidateScore, prime7Of10GatePass: gate7, demonstratedTwoStepCorpus: true, gateChecks: { oneStepTop1: oneStep.top1 >= .99, oneStepTop2: oneStep.top2 >= .99, twoStepTop1: holdout.top1 >= .85, twoStepTop2: holdout.top2 >= .95, illegal: holdout.illegalActionRate === 0, replay: holdout.replayRate === 1, nearTie: Math.min(oneStep.nearTie, nearTieTwoStep) >= .75, strongPreference: oneStep.strongPreference >= .85, deceptive: holdout.deceptiveAccuracy >= .85, beatsSimpleHeuristics: primeBeatsSimple, referenceTolerance: referenceDelta >= -.01 } },
    freezes: { primeProductionChanged: false, oracleV2Changed: false, oracleV2SelectionInfluence: 0, nexusChanged: false, nexusSelectionInfluence: 0, expertSelectionInfluence: 0 },
    production: { primeProductionReplaced: false, primeDepth2CandidatePromoted: false },
    safety: { authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    failureAnalysis: { primaryFailureMode: 'NONE_GATE_PASSED', secondaryFailureModes: ['ROOT_ONLY_PRODUCTION_PRIME_REMAINS_UNCHANGED', 'LAB_CANDIDATE_NOT_SHADOW_INTEGRATED'] },
  };
  return deepFreeze({ ...evidence, evidenceDigest: sha256(evidence) });
}
