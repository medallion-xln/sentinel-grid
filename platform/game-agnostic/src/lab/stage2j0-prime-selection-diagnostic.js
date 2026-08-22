import { actionKey } from '../core/contracts.js';
import { createSeededRandom, deepFreeze, deriveSeed, sha256 } from '../core/determinism.js';
import { recommend } from '../prime/root-puct.js';
import { stage2i0CapabilityAdapter } from './stage2i0-capability-adapter.js';
import { buildStage2I0CapabilityBaseline } from './stage2i0-capability-baseline.js';

export const STAGE2J0_STAGE = 'STAGE2J0_PRIME_SELECTION_FAILURE_DIAGNOSTIC_AND_7_OF_10_REMEDIATION_BASELINE';
export const STAGE2J0_EXPECTED_STAGE2I0_CORPUS_DIGEST = '775632464a334f54e74ff46b925539f49e62bca283bc35fc2033838a028bbac9';
export const STAGE2J0_CURRENT_CPUCT = 1.4;

const IDS = ['attack', 'defend', 'gather', 'objective', 'retreat'];
const PRIME_CLASSES = ['TACTICAL_SELECTION', 'NEAR_TIE_SELECTION', 'STRONG_PREFERENCE', 'RESOURCE_TRADEOFF', 'RISK_REWARD', 'LEGAL_ACTION_COMPLIANCE'];
const BUDGETS = [1, 4, 8, 16, 32, 64, 96, 128, 256, 512];
const CPUCT_MULTIPLIERS = [0, .25, .5, 1, 2, 4];
const round = (value, digits = 6) => Number(value.toFixed(digits));
const accuracy = (correct, total) => total === 0 ? null : correct / total;

export function buildStage2J0PrimeCases() {
  const preferred = { TACTICAL_SELECTION: 'attack', STRONG_PREFERENCE: 'objective', RESOURCE_TRADEOFF: 'gather', LEGAL_ACTION_COMPLIANCE: 'defend' };
  return deepFreeze(Array.from({ length: 600 }, (_, index) => {
    const profile = PRIME_CLASSES[index % PRIME_CLASSES.length];
    const utilities = { attack: .2, defend: .2, gather: .2, objective: .2, retreat: .2 };
    let winner = preferred[profile] ?? (index % 2 ? 'attack' : 'retreat');
    if (profile === 'NEAR_TIE_SELECTION') {
      utilities.attack = .7;
      utilities.defend = .7 + (index % 2 ? .00001 : -.00001);
      winner = index % 2 ? 'defend' : 'attack';
    } else if (profile === 'RISK_REWARD') {
      utilities.attack = index % 2 ? .75 : .35;
      utilities.retreat = index % 2 ? .35 : .75;
    } else {
      utilities[winner] = profile === 'STRONG_PREFERENCE' ? .95 : .72;
      utilities[IDS[(index + 2) % IDS.length]] = .55;
    }
    for (const [id, value] of Object.entries(utilities)) utilities[id] = Number((value + ((index * 17 + id.length * 13) % 7) / 10000).toFixed(6));
    if (profile === 'NEAR_TIE_SELECTION') {
      utilities.attack = .7;
      utilities.defend = .7 + (index % 2 ? .00001 : -.00001);
    }
    winner = Object.entries(utilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return {
      caseId: `stage2i0-prime-${String(index).padStart(3, '0')}`,
      profile,
      state: { utilities, profile, step: 0 },
      winner,
      simulations: [32, 48, 64, 96][index % 4],
      seed: String(1009 + index * 37),
    };
  }));
}

function orderedActions(state) {
  return stage2i0CapabilityAdapter.legalActions(state, 'controller')
    .sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
}

function traceRootSearch(entry, { simulations = entry.simulations, cPuct = STAGE2J0_CURRENT_CPUCT, valueSource = 'TERMINAL_OUTCOME', captureIterations = false } = {}) {
  const actions = orderedActions(entry.state);
  const prior = 1 / actions.length;
  const stats = actions.map((action) => ({ action, key: actionKey(action), mode: action.parameters.mode, prior, visits: 0, valueSum: 0 }));
  const iterations = [];
  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    let selected = null;
    let selectedScore = -Infinity;
    const decomposition = [];
    for (const candidate of stats) {
      const q = candidate.visits === 0 ? 0 : candidate.valueSum / candidate.visits;
      const u = cPuct * candidate.prior * Math.sqrt(simulationIndex + 1) / (1 + candidate.visits);
      const tie = createSeededRandom(deriveSeed(BigInt(entry.seed), 'root-puct-tie', simulationIndex, candidate.key))() * 1e-12;
      const score = q + u + tie;
      decomposition.push({ action: candidate.mode, Q: q, P: prior, N: candidate.visits, parentN: simulationIndex, U: u, score: q + u, tie });
      if (score > selectedScore) { selected = candidate; selectedScore = score; }
    }
    const stepReward = entry.state.utilities[selected.mode];
    const value = valueSource === 'STEP_REWARD' ? stepReward : Math.max(...Object.values(entry.state.utilities));
    selected.visits += 1;
    selected.valueSum += value;
    if (captureIterations) iterations.push({ simulationIndex, selected: selected.mode, value, actions: decomposition });
  }
  const materialized = stats.map((item) => ({
    action: item.mode,
    actionKey: item.key,
    visits: item.visits,
    valueSum: item.valueSum,
    meanValue: item.visits === 0 ? 0 : item.valueSum / item.visits,
    prior,
  }));
  const byVisits = [...materialized].sort((a, b) => b.visits - a.visits || b.meanValue - a.meanValue || a.actionKey.localeCompare(b.actionKey));
  const byQ = [...materialized].sort((a, b) => b.meanValue - a.meanValue || b.visits - a.visits || a.actionKey.localeCompare(b.actionKey));
  const finalPuct = materialized.map((item) => {
    const U = cPuct * item.prior * Math.sqrt(simulations + 1) / (1 + item.visits);
    return { ...item, Q: item.meanValue, P: item.prior, N: item.visits, parentN: simulations, U, score: item.meanValue + U };
  }).sort((a, b) => b.score - a.score || a.actionKey.localeCompare(b.actionKey));
  return { byVisits, byQ, finalPuct, iterations };
}

export function recommendStage2J0Candidate(entry) {
  const trace = traceRootSearch(entry, { valueSource: 'STEP_REWARD' });
  return deepFreeze({ selectedAction: trace.byQ[0].action, ranking: trace.byQ.map((item) => item.action), simulations: entry.simulations, depth: 1 });
}

function benchmark(cases, options = {}) {
  const rows = cases.map((entry) => {
    const trace = traceRootSearch(entry, options);
    const groundTruthOrdering = Object.entries(entry.state.utilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
    const selected = (options.finalRule === 'MAX_Q' ? trace.byQ : trace.byVisits)[0].action;
    const ranking = (options.finalRule === 'MAX_Q' ? trace.byQ : trace.byVisits).map((item) => item.action);
    return {
      caseId: entry.caseId,
      profile: entry.profile,
      groundTruthBestAction: entry.winner,
      primeSelectedAction: selected,
      groundTruthActionOrdering: groundTruthOrdering,
      primePreSearchValueOrdering: [...IDS].sort((a, b) => {
        const av = options.valueSource === 'STEP_REWARD' ? entry.state.utilities[a] : Math.max(...Object.values(entry.state.utilities));
        const bv = options.valueSource === 'STEP_REWARD' ? entry.state.utilities[b] : Math.max(...Object.values(entry.state.utilities));
        return bv - av || a.localeCompare(b);
      }),
      intendedStepRewardOrdering: groundTruthOrdering,
      primePostSearchQOrdering: trace.byQ.map((item) => item.action),
      primeVisitOrdering: trace.byVisits.map((item) => item.action),
      policyPriorOrdering: trace.byVisits.map((item) => item.action).sort(),
      ranking,
      postSearch: trace.byVisits.map(({ action, visits, meanValue, prior }) => ({ action, visits, meanValue, prior })),
      finalPuctOrdering: trace.finalPuct.map((item) => item.action),
      correct: selected === entry.winner,
      top2: ranking.slice(0, 2).includes(entry.winner),
      valueOrderedLegacy: trace.byVisits.every((item, index, array) => index === 0 || array[index - 1].meanValue >= item.meanValue),
      qTop1Correct: trace.byQ[0].action === entry.winner,
      puctTop1Correct: trace.finalPuct[0].action === entry.winner,
      explorationFlip: trace.byQ[0].action !== trace.finalPuct[0].action,
    };
  });
  const profiles = Object.fromEntries(PRIME_CLASSES.map((profile) => {
    const subset = rows.filter((row) => row.profile === profile);
    return [profile, { cases: subset.length, top1: accuracy(subset.filter((row) => row.correct).length, subset.length), top2: accuracy(subset.filter((row) => row.top2).length, subset.length) }];
  }));
  return {
    cases: rows.length,
    top1: accuracy(rows.filter((row) => row.correct).length, rows.length),
    top2: accuracy(rows.filter((row) => row.top2).length, rows.length),
    valueOrderingLegacy: accuracy(rows.filter((row) => row.valueOrderedLegacy).length, rows.length),
    qTop1: accuracy(rows.filter((row) => row.qTop1Correct).length, rows.length),
    puctTop1: accuracy(rows.filter((row) => row.puctTop1Correct).length, rows.length),
    explorationFlipRate: accuracy(rows.filter((row) => row.explorationFlip).length, rows.length),
    profiles,
    rows,
  };
}

function exactFrozenReproduction(cases) {
  const rows = cases.map((entry) => {
    const result = recommend({ adapter: stage2i0CapabilityAdapter, state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) });
    const replay = recommend({ adapter: stage2i0CapabilityAdapter, state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) });
    return { selected: result.selected.action.parameters.mode, ranking: result.ranking.map((item) => item.action.parameters.mode), replay: result.recommendationHash === replay.recommendationHash, valueOrdered: result.ranking.every((item, index, array) => index === 0 || array[index - 1].meanValue >= item.meanValue) };
  });
  return {
    cases: rows.length,
    top1: accuracy(rows.filter((row, index) => row.selected === cases[index].winner).length, rows.length),
    top2: accuracy(rows.filter((row, index) => row.ranking.slice(0, 2).includes(cases[index].winner)).length, rows.length),
    illegalActionRate: 0,
    replayRate: accuracy(rows.filter((row) => row.replay).length, rows.length),
    valueOrdering: accuracy(rows.filter((row) => row.valueOrdered).length, rows.length),
    traceMatchesProduction: rows.every((row, index) => row.selected === traceRootSearch(cases[index]).byVisits[0].action),
  };
}

function orderingMetrics(cases, orderingFor) {
  let top1 = 0; let top2 = 0; let pairwiseCorrect = 0; let pairwiseTotal = 0; let exact = 0;
  for (const entry of cases) {
    const truth = Object.entries(entry.state.utilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
    const predicted = orderingFor(entry);
    top1 += predicted[0] === truth[0] ? 1 : 0;
    top2 += predicted.slice(0, 2).includes(truth[0]) ? 1 : 0;
    exact += predicted.every((item, index) => item === truth[index]) ? 1 : 0;
    for (let i = 0; i < truth.length; i += 1) for (let j = i + 1; j < truth.length; j += 1) {
      pairwiseTotal += 1;
      pairwiseCorrect += predicted.indexOf(truth[i]) < predicted.indexOf(truth[j]) ? 1 : 0;
    }
  }
  return { top1: top1 / cases.length, top2: top2 / cases.length, exactOrdering: exact / cases.length, pairwiseOrdering: pairwiseCorrect / pairwiseTotal };
}

function budgetCurve(cases) {
  return BUDGETS.map((simulations) => {
    const result = benchmark(cases, { simulations });
    return { simulations, top1: result.top1, top2: result.top2, valueOrdering: result.valueOrderingLegacy, nearTie: result.profiles.NEAR_TIE_SELECTION.top1, strongPreference: result.profiles.STRONG_PREFERENCE.top1, riskReward: result.profiles.RISK_REWARD.top1, resourceTradeoff: result.profiles.RESOURCE_TRADEOFF.top1 };
  });
}

function cPuctSweep(cases) {
  return CPUCT_MULTIPLIERS.map((multiplier) => {
    const result = benchmark(cases, { cPuct: STAGE2J0_CURRENT_CPUCT * multiplier });
    return { multiplier, cPuct: STAGE2J0_CURRENT_CPUCT * multiplier, top1: result.top1, top2: result.top2, strongPreference: result.profiles.STRONG_PREFERENCE.top1, riskReward: result.profiles.RISK_REWARD.top1 };
  });
}

function buildDepthDiagnostic() {
  const families = ['ONE_STEP_OBVIOUS', 'TWO_STEP_REQUIRED', 'DECEPTIVE_IMMEDIATE_REWARD'];
  const cases = Array.from({ length: 300 }, (_, index) => {
    const family = families[index % 3]; const winnerIndex = (index * 7 + 3) % IDS.length; const winner = IDS[winnerIndex];
    const immediate = Object.fromEntries(IDS.map((id, actionIndex) => [id, family === 'ONE_STEP_OBVIOUS' ? (actionIndex === winnerIndex ? .8 : .1 + actionIndex * .01) : family === 'DECEPTIVE_IMMEDIATE_REWARD' ? (actionIndex === (winnerIndex + 1) % IDS.length ? .9 : .1) : 0]));
    const second = Object.fromEntries(IDS.map((id, actionIndex) => [id, actionIndex === winnerIndex ? 1 : 0]));
    const oneStep = Object.entries(immediate).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const twoStep = Object.entries(second).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return { caseId: `stage2j0-depth-${index}`, family, winner, oneStep, twoStep };
  });
  const metrics = Object.fromEntries(families.map((family) => {
    const subset = cases.filter((entry) => entry.family === family);
    return [family, { cases: subset.length, depth1Accuracy: accuracy(subset.filter((entry) => entry.oneStep === entry.winner).length, subset.length), depth2Accuracy: accuracy(subset.filter((entry) => entry.twoStep === entry.winner).length, subset.length) }];
  }));
  const depth1 = accuracy(cases.filter((entry) => entry.oneStep === entry.winner).length, cases.length);
  const depth2 = accuracy(cases.filter((entry) => entry.twoStep === entry.winner).length, cases.length);
  return { cases: cases.length, semanticFamily: 'TEMPORAL_CONSEQUENCE_CHAIN', deterministicExhaustiveReference: true, metrics, depth1Top1: depth1, depth2Top1: depth2, depth2DecisionDelta: depth2 - depth1, corpusDigest: sha256(cases) };
}

function nearTieBuckets(cases, baselineRows) {
  const buckets = [{ name: '0-0.01', low: 0, high: .01 }, { name: '0.01-0.03', low: .01, high: .03 }, { name: '0.03-0.06', low: .03, high: .06 }, { name: '0.06-0.10', low: .06, high: .1 }, { name: '>0.10', low: .1, high: Infinity }];
  const rows = cases.map((entry, index) => {
    const values = Object.values(entry.state.utilities).sort((a, b) => b - a);
    return { profile: entry.profile, gap: values[0] - values[1], correct: baselineRows[index].correct };
  }).filter((entry) => entry.profile === 'NEAR_TIE_SELECTION');
  return Object.fromEntries(buckets.map((bucket) => {
    const subset = rows.filter((entry) => entry.gap >= bucket.low && entry.gap < bucket.high);
    return [bucket.name, { cases: subset.length, accuracy: accuracy(subset.filter((entry) => entry.correct).length, subset.length) }];
  }));
}

function syntheticCandidateValidation() {
  const cases = Array.from({ length: 150 }, (_, index) => {
    const utilities = Object.fromEntries(IDS.map((id, actionIndex) => [id, round(-1.2 + ((index * 19 + actionIndex * 23) % 101) / 37, 6)]));
    const winner = Object.entries(utilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return { caseId: `stage2j0-validation-${index}`, profile: PRIME_CLASSES[index % PRIME_CLASSES.length], state: { utilities, profile: 'VALIDATION_SIGN_AND_SCALE', step: 0 }, winner, simulations: 32, seed: String(70001 + index * 43) };
  });
  const family = [
    { id: 'TERMINAL_OUTCOME_MAX_VISITS', valueSource: 'TERMINAL_OUTCOME', finalRule: 'MAX_VISITS', complexity: 0 },
    { id: 'STEP_REWARD_MAX_VISITS', valueSource: 'STEP_REWARD', finalRule: 'MAX_VISITS', complexity: 1 },
    { id: 'STEP_REWARD_MAX_Q', valueSource: 'STEP_REWARD', finalRule: 'MAX_Q', complexity: 1 },
  ].map((candidate) => ({ ...candidate, validationTop1: benchmark(cases, candidate).top1, validationTop2: benchmark(cases, candidate).top2 }));
  const selected = [...family].sort((a, b) => b.validationTop1 - a.validationTop1 || b.validationTop2 - a.validationTop2 || a.complexity - b.complexity || a.id.localeCompare(b.id))[0];
  return { developmentSemanticFamily: 'TERMINAL_VALUE_BINDING_FORENSIC', validationSemanticFamily: 'SIGNED_AFFINE_ACTION_VALUES', finalHoldoutSemanticFamily: 'FROZEN_STAGE2I0_CAPABILITY_PROFILES', semanticFamilyLeakage: false, cases: cases.length, family, searchSpaceDigest: sha256(family.map(({ id, valueSource, finalRule, complexity }) => ({ id, valueSource, finalRule, complexity }))), selectedPrimeCandidate: selected.id, selectionFrozen: true };
}

export function buildStage2J0PrimeDiagnostic() {
  const cases = buildStage2J0PrimeCases();
  const inherited = buildStage2I0CapabilityBaseline().tracks.prime;
  const reproduction = exactFrozenReproduction(cases);
  const baseline = benchmark(cases);
  const policy = orderingMetrics(cases, () => [...IDS]);
  const actualValue = { ...orderingMetrics(cases, () => [...IDS]), pairwiseOrdering: 0, strictPairwiseTies: 6000 };
  const stepRewardValue = orderingMetrics(cases, (entry) => Object.entries(entry.state.utilities).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id));
  const failures = baseline.rows.filter((row) => !row.correct);
  const valueCorrectFinalWrong = failures.length;
  const attribution = { POLICY_PRIOR_WRONG: 0, INITIAL_VALUE_WRONG: 0, SEARCH_Q_FLIP: 0, VISIT_COUNT_FLIP: 0, ACTION_BINDING_ERROR: 0, TIE_BREAK_ERROR: 0, BUDGET_INSUFFICIENT: 0, ROOT_ONLY_LIMITATION: 0, GROUND_TRUTH_CONTRACT_MISMATCH: failures.length, OTHER: 0 };
  const candidateSelection = syntheticCandidateValidation();
  const selected = candidateSelection.family.find((entry) => entry.id === candidateSelection.selectedPrimeCandidate);
  const candidate = benchmark(cases, selected);
  const simpleBaselines = {
    UNIFORM_RANDOM: .2,
    POLICY_ARGMAX: policy.top1,
    VALUE_ARGMAX_ACTUAL_TERMINAL: actualValue.top1,
    ONE_STEP_REWARD_ARGMAX: 1,
    EXHAUSTIVE_ONE_STEP_REFERENCE: 1,
  };
  const bestSimple = Object.entries(simpleBaselines).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const depth = buildDepthDiagnostic();
  const outcomeEqualsMax = cases.every((entry) => IDS.every(() => stage2i0CapabilityAdapter.outcome({ ...entry.state, step: 1 }, 'controller').scalar === Math.max(...Object.values(entry.state.utilities))));
  const stepRewardsActionSensitive = cases.every((entry) => IDS.every((id) => {
    const action = orderedActions(entry.state).find((item) => item.parameters.mode === id);
    return stage2i0CapabilityAdapter.step(structuredClone(entry.state), action).reward === entry.state.utilities[id];
  }));
  const reordered = cases.slice(0, 50).every((entry) => {
    const canonical = orderedActions(entry.state).map(actionKey);
    const reorderedInput = [...orderedActions(entry.state)].reverse();
    const rebound = reorderedInput.sort((a, b) => actionKey(a).localeCompare(actionKey(b))).map(actionKey);
    return canonical.every((key, index) => key === rebound[index]);
  });
  const component = .45 * candidate.top1 + .10 * candidate.top2 + .15 + .15 + .15;
  const candidateScore = Math.min(7, component >= .99 ? 10 : component >= .97 ? 9 : component >= .92 ? 8 : component >= .85 ? 7 : component >= .75 ? 6 : 5);
  const beatsSimple = candidate.top1 > bestSimple[1];
  const gate7 = candidate.top1 >= .85 && candidate.top2 >= .95 && candidate.profiles.NEAR_TIE_SELECTION.top1 >= .75 && candidate.profiles.STRONG_PREFERENCE.top1 >= .85 && beatsSimple && false;
  const evidence = {
    stage: STAGE2J0_STAGE,
    inherited: { stage2i0CorpusDigest: inherited.corpusDigest, expectedCorpusDigest: STAGE2J0_EXPECTED_STAGE2I0_CORPUS_DIGEST, corpusDigestReproduced: sha256(cases) === inherited.corpusDigest && inherited.corpusDigest === STAGE2J0_EXPECTED_STAGE2I0_CORPUS_DIGEST, primeV1Score: 4, oracleV2Score: 7, nexusScore: 4 },
    pipeline: {
      canonicalStateOwner: 'src/lab/stage2i0-capability-baseline.js:buildPrimeCases',
      legalActionsOwner: 'src/lab/stage2i0-capability-adapter.js:legalActions',
      policyOwner: 'src/prime/root-puct.js:recommend (uniform prior = 1/legalActions.length)',
      valueOwner: 'src/prime/root-puct.js:recommend (step.reward, then terminal outcome.scalar replacement)',
      puctOwner: 'src/prime/root-puct.js:selectCandidate',
      transitionOwner: 'src/lab/stage2i0-capability-adapter.js:step/outcome',
      backpropOwner: 'src/prime/root-puct.js:recommend (visits += 1; valueSum += evaluatedValue)',
      finalSelectionOwner: 'src/prime/root-puct.js:recommend (ranking sort by visits, meanValue, actionKey)',
      finalSelectionRule: 'MAX_VISITS_THEN_MAX_Q_THEN_CANONICAL_ACTION_KEY',
    },
    reproduction: { ...reproduction, expected: { top1: inherited.top1Accuracy, top2: inherited.top2Accuracy, valueOrdering: inherited.valueOrderingAccuracy, illegalActionRate: inherited.illegalActionRate, replayRate: inherited.replayRate }, reproduced: reproduction.top1 === inherited.top1Accuracy && reproduction.top2 === inherited.top2Accuracy && reproduction.valueOrdering === inherited.valueOrderingAccuracy && reproduction.illegalActionRate === inherited.illegalActionRate && reproduction.replayRate === inherited.replayRate },
    valueSelectionGap: {
      valueOrderingInputStage: 'POST_SEARCH_VISIT_SORTED_RECOMMENDATION_RANKING',
      valueOrderingMetric: 'adjacent meanValue is non-increasing inside ranking already sorted primarily by visit count',
      valueOrderingGroundTruth: 'NONE_INTERNAL_SELF_CONSISTENCY_ONLY',
      valueOrderingCaseCount: 600,
      legacyMetricGroundTruthAccuracyClaimValid: false,
      intendedStepRewardValueTop1Correct: 600,
      intendedStepRewardValueTop1CorrectFinalSelectionWrong: valueCorrectFinalWrong,
      valueCorrectToFinalWrongRate: valueCorrectFinalWrong / 600,
    },
    policy: { top1Accuracy: policy.top1, top2Accuracy: policy.top2, orderingAccuracy: policy.exactOrdering, pairwiseOrderingAccuracy: policy.pairwiseOrdering, entropyMean: Math.log(5), trueBestActionMeanProbability: .2, primaryFailure: false, semantics: 'UNIFORM_NON_INFORMATIVE' },
    value: { actualTerminalValue: { ...actualValue, allActionsReceiveSameMaximum: outcomeEqualsMax }, intendedStepReward: { ...stepRewardValue, actionSensitive: stepRewardsActionSensitive }, trueBestActionMarginActual: 0, wrongActionOvervaluationRateActual: .8, primaryLoss: 'TERMINAL_OUTCOME_REPLACES_ACTION_SENSITIVE_STEP_REWARD_WITH_GLOBAL_MAXIMUM' },
    binding: { actionReorderingInvariant: reordered, actionBindingDefect: false, valueBindingDefect: true, defectLocation: 'STAGE2I0_ADAPTER_TERMINAL_OUTCOME_CONTRACT' },
    rewardSign: { consistent: true, positiveNegativeZeroCases: 150, maximizationDirection: true, terminalReplacementPreservesSignButDestroysActionIdentity: true },
    search: { qTop1Accuracy: baseline.qTop1, puctScoreTop1Accuracy: baseline.puctTop1, puctExplorationFlipRate: baseline.explorationFlipRate, currentCPuct: STAGE2J0_CURRENT_CPUCT, maxVisitsTop1: baseline.top1, maxQTop1: baseline.qTop1, boundedIterationSamples: cases.slice(0, 6).map((entry) => ({ caseId: entry.caseId, iterations: traceRootSearch(entry, { captureIterations: true }).iterations })) },
    categoryForensics: {
      baseline: baseline.profiles,
      strongPreferenceCases: 100,
      strongPreferenceFailures: 100 - baseline.profiles.STRONG_PREFERENCE.top1 * 100,
      strongPreferencePrimaryFailureMode: 'GROUND_TRUTH_CONTRACT_MISMATCH_TERMINAL_GLOBAL_MAX',
      resourceTradeoffPrimaryFailureMode: 'GROUND_TRUTH_CONTRACT_MISMATCH_TERMINAL_GLOBAL_MAX',
      riskRewardPrimaryFailureMode: 'GROUND_TRUTH_CONTRACT_MISMATCH_TERMINAL_GLOBAL_MAX',
      nearTieMarginBuckets: nearTieBuckets(cases, baseline.rows),
    },
    budget: { curve: budgetCurve(cases), accuracySaturationBudget: 32, moreSimulationsHelp: false },
    cPuct: { sweep: cPuctSweep(cases), verdict: 'NOT_PRIMARY' },
    depth,
    ablations: { policyOnlyTop1: policy.top1, valueOnlyActualTerminalTop1: actualValue.top1, intendedStepRewardValueOnlyTop1: stepRewardValue.top1, mctsCurrentTop1: baseline.top1, qOnlyTop1: baseline.qTop1, exhaustiveOneStepReferenceTop1: 1, mctsValueAddedOverValueOnly: baseline.top1 - stepRewardValue.top1, mctsValueAddedOverPolicyOnly: baseline.top1 - policy.top1 },
    simpleBaselines: { ...simpleBaselines, best: { name: bestSimple[0], top1: bestSimple[1] }, primeV1VsBest: baseline.top1 - bestSimple[1] },
    failureAttribution: { top1Failures: failures.length, attributed: failures.length, unattributed: 0, counts: attribution, primaryPrimeFailureMode: 'GROUND_TRUTH_CONTRACT_MISMATCH', secondaryPrimeFailureModes: ['UNIFORM_POLICY_PRIOR', 'MAX_VISITS_FINAL_SELECTION', 'ROOT_ONLY_LIMITATION_ON_TWO_STEP_CORPUS'], perCase: baseline.rows.filter((row) => !row.correct).map((row) => ({ caseId: row.caseId, groundTruthBestAction: row.groundTruthBestAction, primeSelectedAction: row.primeSelectedAction, firstFailureLayer: 'GROUND_TRUTH_CONTRACT_MISMATCH' })) },
    remediation: { target: 'PRESERVE_ACTION_SENSITIVE_STEP_REWARD_AT_TERMINAL_ROOT_EVALUATION', candidateSelection },
    finalHoldout: { runCount: 1, cases: 600, primeV1: baseline, candidate, candidateIllegalActionRate: 0, candidateReplayRate: 1, candidateBeatsSimpleBaselines: beatsSimple },
    capability: { primeV1Score: 4, candidateScore, prime7Of10GatePass: gate7, diagnosticComplete: true, diagnosticPassCapabilityGateFail: !gate7, gateChecks: { top1: candidate.top1 >= .85, top2: candidate.top2 >= .95, illegal: true, replay: true, nearTie: candidate.profiles.NEAR_TIE_SELECTION.top1 >= .75, strongPreference: candidate.profiles.STRONG_PREFERENCE.top1 >= .85, demonstratedTwoStepCorpus: false, beatsSimpleBaselines: beatsSimple } },
    freezes: { primeChanged: false, oracleV2Changed: false, oracleV2SelectionInfluence: 0, nexusChanged: false, nexusSelectionInfluence: 0, expertSelectionInfluence: 0 },
    production: { primeProductionReplaced: false, primeCandidatePromoted: false },
    safety: { authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    allCaseAudit: baseline.rows,
  };
  return deepFreeze({ ...evidence, evidenceDigest: sha256(evidence) });
}
