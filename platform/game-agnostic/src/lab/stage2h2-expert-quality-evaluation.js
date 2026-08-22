import { actionKey } from '../core/contracts.js';
import { createSeededRandom, deepFreeze, deriveSeed, sha256 } from '../core/determinism.js';
import { referenceGameAdapter } from '../adapters/reference-game/index.js';
import { recommend } from '../prime/root-puct.js';
import { buildStage2FQualificationIdentity } from './zeknova-stage2f-identity.js';
import { buildArmContext, STAGE2H1_FIXTURES } from './stage2h1-action-context-certification.js';
import { stage2h1NearTieAdapter } from './stage2h1-near-tie-adapter.js';
import { STAGE2H2_QUALITY_GATE, STAGE2H2_QUALITY_GATE_DIGEST } from './stage2h2-quality-gate.js';

export const STAGE2H2_STAGE = 'STAGE2H2_EXPERT_CONTEXT_QUALITY_EVALUATION';
export const STAGE2H2_ARMS = deepFreeze(['prime-only', 'prime+oracle', 'prime+nexus', 'prime+oracle+nexus']);
const ADAPTERS = { 'near-tie': stage2h1NearTieAdapter, 'reference-game': referenceGameAdapter };
const CONFIDENCE_BUCKETS = [[0, 200000], [200000, 400000], [400000, 600000], [600000, 800000], [800000, 1000001]];
const MARGIN_BUCKETS = [[0, .01], [.01, .03], [.03, .06], [.06, .10], [.10, Infinity]];

function summarize(result) {
  return {
    selectedAction: result.selected.actionKey,
    actionRanking: result.ranking.map((entry) => entry.actionKey),
    valueEstimate: result.ranking[0].meanValue,
    visitDistribution: result.ranking.map((entry) => ({ actionKey: entry.actionKey, visits: entry.visits })),
    meanValues: Object.fromEntries(result.ranking.map((entry) => [entry.actionKey, entry.meanValue])),
    recommendationDigest: result.recommendationHash,
  };
}

function run(fixture, context) {
  const adapter = ADAPTERS[fixture.adapterId];
  return summarize(recommend({ adapter, state: adapter.initialState(BigInt(fixture.stateSeed)), observerId: fixture.observerId, simulations: fixture.simulations, seed: BigInt(fixture.seed), ...(context ? { expertContext: context } : {}) }));
}

function groundTruth(fixture) {
  const adapter = ADAPTERS[fixture.adapterId];
  const state = adapter.initialState(BigInt(fixture.stateSeed));
  const actions = adapter.legalActions(state, fixture.observerId);
  const outcomes = actions.map((action, index) => {
    const seed = deriveSeed(BigInt(fixture.seed), 'stage2h2-ground-truth', index, actionKey(action));
    const result = adapter.step(structuredClone(state), structuredClone(action), { observerId: fixture.observerId, seed, random: createSeededRandom(seed) });
    return { action: actionKey(action), reward: result.reward };
  }).sort((a, b) => b.reward - a.reward || a.action.localeCompare(b.action));
  return { action: outcomes[0].action, value: outcomes[0].reward, outcomes };
}

function effect(baseline, assisted, truth) {
  const before = baseline.selectedAction === truth.action;
  const after = assisted.selectedAction === truth.action;
  if (!before && after) return 'BENEFICIAL_SELECTION_CHANGE';
  if (before && !after) return 'HARMFUL_SELECTION_CHANGE';
  if (before) return 'UNCHANGED_CORRECT';
  return 'UNCHANGED_WRONG';
}

function correctMargin(result, truthAction) {
  const correct = result.meanValues[truthAction] ?? -Infinity;
  const competitor = Math.max(...Object.entries(result.meanValues).filter(([key]) => key !== truthAction).map(([, value]) => value));
  return correct - competitor;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((percentileValue / 100) * sorted.length) - 1];
}

function aggregate(cases, arm = 'prime+oracle+nexus') {
  const relevant = cases;
  const primeCorrect = relevant.filter((entry) => entry.arms['prime-only'].correct).length;
  const assistedCorrect = relevant.filter((entry) => entry.arms[arm].correct).length;
  const beneficial = relevant.filter((entry) => entry.arms[arm].effect === 'BENEFICIAL_SELECTION_CHANGE').length;
  const harmful = relevant.filter((entry) => entry.arms[arm].effect === 'HARMFUL_SELECTION_CHANGE').length;
  const changes = relevant.filter((entry) => entry.arms[arm].selectedAction !== entry.arms['prime-only'].selectedAction).length;
  return { cases: relevant.length, primeAccuracy: relevant.length ? primeCorrect / relevant.length : 0, assistedAccuracy: relevant.length ? assistedCorrect / relevant.length : 0, accuracyDelta: relevant.length ? (assistedCorrect - primeCorrect) / relevant.length : 0, selectionChanges: changes, beneficialChanges: beneficial, harmfulChanges: harmful };
}

export function buildStage2H2Evaluation({ campaignManifest, fixtures: fixtureOverride = null }) {
  const qualificationIdentity = buildStage2FQualificationIdentity({ campaignManifest, sessionId: 'stage2h2-quality-evaluation', samplingIdentity: sha256({ stage: STAGE2H2_STAGE, campaign: campaignManifest.stage2fCampaignId }) });
  const fixtures = fixtureOverride ?? STAGE2H1_FIXTURES.filter((fixture) => !fixture.noContext);
  const cases = fixtures.map((fixture) => {
    const adapter = ADAPTERS[fixture.adapterId];
    const state = adapter.initialState(BigInt(fixture.stateSeed));
    const legalActions = adapter.legalActions(state, fixture.observerId);
    const truth = groundTruth(fixture);
    const contexts = Object.fromEntries(STAGE2H2_ARMS.filter((arm) => arm !== 'prime-only').map((arm) => [arm, buildArmContext({ qualificationIdentity, fixture, arm })]));
    const baseline = run(fixture, null);
    const arms = { 'prime-only': { ...baseline, correct: baseline.selectedAction === truth.action, effect: baseline.selectedAction === truth.action ? 'UNCHANGED_CORRECT' : 'UNCHANGED_WRONG' } };
    for (const arm of STAGE2H2_ARMS.filter((name) => name !== 'prime-only')) {
      const result = run(fixture, contexts[arm]);
      arms[arm] = { ...result, correct: result.selectedAction === truth.action, effect: effect(baseline, result, truth), correctMarginDelta: correctMargin(result, truth.action) - correctMargin(baseline, truth.action) };
    }
    const fullContext = contexts['prime+oracle+nexus'];
    const actionEntries = Object.entries(fullContext.actions);
    const oracleFavored = [...actionEntries].sort((a, b) => b[1].oracleAdjustmentMicro - a[1].oracleAdjustmentMicro || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const nexusFavored = [...actionEntries].sort((a, b) => b[1].nexusAdjustmentMicro - a[1].nexusAdjustmentMicro || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    const oracleRange = Math.max(...actionEntries.map(([, value]) => value.oracleAdjustmentMicro)) - Math.min(...actionEntries.map(([, value]) => value.oracleAdjustmentMicro));
    const nexusRange = Math.max(...actionEntries.map(([, value]) => value.nexusAdjustmentMicro)) - Math.min(...actionEntries.map(([, value]) => value.nexusAdjustmentMicro));
    const combinedRange = Math.max(...actionEntries.map(([, value]) => value.combinedAdjustmentMicro)) - Math.min(...actionEntries.map(([, value]) => value.combinedAdjustmentMicro));
    const temporal = oracleRange > 0;
    const relational = nexusRange > 0;
    return {
      caseId: `stage2h2-${fixture.fixtureId}`,
      population: fixture.adapterId === 'reference-game' ? 'REFERENCE_ADAPTER' : 'SYNTHETIC_CONTROLLED',
      experimentClass: fixture.experimentClass,
      runtimeIdentity: campaignManifest.sentinelRuntimeId,
      campaignId: campaignManifest.stage2fCampaignId,
      stateDigest: sha256(state), legalActionDigest: sha256(legalActions), seed: fixture.seed, simulationCount: fixture.simulations,
      groundTruthAction: truth.action, groundTruthValue: truth.value, groundTruthMethod: 'EXHAUSTIVE_DETERMINISTIC_ONE_STEP_TRANSITION_REWARD',
      oracleInputDigest: fullContext.oracleInputDigest, oracleOutputDigest: fullContext.oracleOutputDigest,
      nexusInputDigest: fullContext.nexusInputDigest, nexusOutputDigest: fullContext.nexusOutputDigest,
      expertActionContextDigest: fullContext.actionContextDigest,
      oracleConfidence: fullContext.global.oracle.confidence, nexusConfidence: fullContext.global.nexus.confidence,
      oracleFavored, nexusFavored, oracleNonNeutral: oracleRange > 0, nexusNonNeutral: nexusRange > 0,
      oracleCorrect: oracleRange > 0 && oracleFavored === truth.action, nexusCorrect: nexusRange > 0 && nexusFavored === truth.action,
      signalRegime: temporal && relational ? 'BOTH_SIGNALS' : temporal ? 'TEMPORAL_ONLY' : relational ? 'RELATIONAL_ONLY' : 'NO_SIGNAL',
      agreementRegime: oracleRange === 0 && nexusRange === 0 ? 'BOTH_NEUTRAL' : oracleRange > 0 && nexusRange === 0 ? 'ORACLE_ONLY_NON_NEUTRAL' : nexusRange > 0 && oracleRange === 0 ? 'NEXUS_ONLY_NON_NEUTRAL' : oracleFavored === nexusFavored ? 'ORACLE_NEXUS_AGREE' : 'ORACLE_NEXUS_DISAGREE',
      primeMargin: Math.abs((baseline.meanValues[baseline.actionRanking[0]] ?? 0) - (baseline.meanValues[baseline.actionRanking[1]] ?? 0)),
      interActionDifferential: combinedRange / 1000000,
      contributions: Object.fromEntries(actionEntries.map(([key, value]) => [key, { oracle: value.oracleAdjustmentMicro / 1000000, nexus: value.nexusAdjustmentMicro / 1000000, combined: value.combinedAdjustmentMicro / 1000000 }])),
      arms,
    };
  });
  const corpusBindings = cases.map(({ arms, contributions, ...binding }) => binding);
  const corpusDigest = sha256(corpusBindings);
  const accuracy = Object.fromEntries(STAGE2H2_ARMS.map((arm) => [arm, cases.filter((entry) => entry.arms[arm].correct).length / cases.length]));
  const effects = { oracle: aggregate(cases, 'prime+oracle'), nexus: aggregate(cases, 'prime+nexus'), combined: aggregate(cases) };
  const populations = Object.fromEntries(['REFERENCE_ADAPTER', 'SYNTHETIC_CONTROLLED'].map((population) => [population, aggregate(cases.filter((entry) => entry.population === population))]));
  const signalRegimes = Object.fromEntries(['TEMPORAL_ONLY', 'RELATIONAL_ONLY', 'BOTH_SIGNALS', 'NO_SIGNAL'].map((regime) => [regime, aggregate(cases.filter((entry) => entry.signalRegime === regime))]));
  const agreement = Object.fromEntries(['ORACLE_NEXUS_AGREE', 'ORACLE_NEXUS_DISAGREE', 'ORACLE_ONLY_NON_NEUTRAL', 'NEXUS_ONLY_NON_NEUTRAL', 'BOTH_NEUTRAL'].map((regime) => [regime, aggregate(cases.filter((entry) => entry.agreementRegime === regime))]));
  const confidence = Object.fromEntries(['oracle', 'nexus'].map((expert) => [expert, CONFIDENCE_BUCKETS.map(([min, max]) => {
    const subset = cases.filter((entry) => entry[`${expert}Confidence`] >= min && entry[`${expert}Confidence`] < max);
    const result = aggregate(subset, expert === 'oracle' ? 'prime+oracle' : 'prime+nexus');
    return { bucket: `${min}-${max - 1}`, ...result, expertCorrect: subset.filter((entry) => entry[`${expert}Correct`]).length, expertWrong: subset.filter((entry) => !entry[`${expert}Correct`]).length };
  })]));
  const margins = MARGIN_BUCKETS.map(([min, max]) => ({ bucket: `${min}-${max}`, ...aggregate(cases.filter((entry) => entry.primeMargin >= min && entry.primeMargin < max)) }));
  const harmfulCases = cases.filter((entry) => entry.arms['prime+oracle+nexus'].effect === 'HARMFUL_SELECTION_CHANGE').map((entry) => ({ caseId: entry.caseId, population: entry.population, primeAction: entry.arms['prime-only'].selectedAction, expertAssistedAction: entry.arms['prime+oracle+nexus'].selectedAction, groundTruthAction: entry.groundTruthAction, primeBaselineGap: entry.primeMargin, oracleContribution: entry.contributions[entry.arms['prime+oracle+nexus'].selectedAction]?.oracle ?? 0, nexusContribution: entry.contributions[entry.arms['prime+oracle+nexus'].selectedAction]?.nexus ?? 0, combinedDifferential: entry.interActionDifferential, oracleConfidence: entry.oracleConfidence / 1000000, nexusConfidence: entry.nexusConfidence / 1000000, causeClassification: entry.oracleNonNeutral && entry.nexusNonNeutral && !entry.oracleCorrect && !entry.nexusCorrect ? 'BOTH_EXPERTS_WRONG' : entry.oracleNonNeutral && !entry.oracleCorrect ? 'ORACLE_WRONG' : entry.nexusNonNeutral && !entry.nexusCorrect ? 'NEXUS_WRONG' : entry.primeMargin > .10 ? 'EXPERT_OVERRIDES_STRONGER_PRIME' : 'EXPERT_INTERFERENCE' }));
  const unchanged = cases.filter((entry) => entry.arms['prime+oracle+nexus'].selectedAction === entry.arms['prime-only'].selectedAction);
  const valueWithoutSelection = { improved: unchanged.filter((entry) => entry.arms['prime+oracle+nexus'].correctMarginDelta > 0).length, regressed: unchanged.filter((entry) => entry.arms['prime+oracle+nexus'].correctMarginDelta < 0).length, noEffect: unchanged.filter((entry) => entry.arms['prime+oracle+nexus'].correctMarginDelta === 0).length };
  const differentials = cases.map((entry) => entry.interActionDifferential);
  const combinedHarmRate = effects.combined.harmfulChanges / cases.length;
  const noSignal = signalRegimes.NO_SIGNAL;
  const strong = aggregate(cases.filter((entry) => entry.primeMargin > .10));
  const targetPositive = signalRegimes.TEMPORAL_ONLY.accuracyDelta > 0 || signalRegimes.RELATIONAL_ONLY.accuracyDelta > 0 || signalRegimes.BOTH_SIGNALS.accuracyDelta > 0 || valueWithoutSelection.improved > valueWithoutSelection.regressed;
  const qualityGatePass = combinedHarmRate <= STAGE2H2_QUALITY_GATE.maximumCombinedHarmfulSelectionChangeRate && (effects.combined.accuracyDelta > 0 || targetPositive) && (noSignal.cases ? noSignal.harmfulChanges / noSignal.cases : 0) <= STAGE2H2_QUALITY_GATE.maximumNoSignalRegressionRate && (strong.cases ? strong.harmfulChanges / strong.cases : 0) <= STAGE2H2_QUALITY_GATE.maximumStrongPrimePreferenceHarmRate;
  const boundSensitivity = [0, .005, .01, .02, .03].map((bound) => {
    let correct = 0; let beneficialChanges = 0; let harmfulChanges = 0; let selectionChanges = 0;
    for (const entry of cases) {
      const baseline = entry.arms['prime-only'];
      const factor = bound / .03;
      const selected = Object.keys(baseline.meanValues).map((key) => ({ key, score: baseline.meanValues[key] + (entry.contributions[key]?.combined ?? 0) * factor })).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))[0].key;
      const before = baseline.selectedAction === entry.groundTruthAction;
      const after = selected === entry.groundTruthAction;
      if (after) correct += 1;
      if (selected !== baseline.selectedAction) selectionChanges += 1;
      if (!before && after) beneficialChanges += 1;
      if (before && !after) harmfulChanges += 1;
    }
    return { bound, accuracy: correct / cases.length, beneficialChanges, harmfulChanges, selectionChanges, status: bound === 0 ? 'PRIME_ONLY_CONTROL' : 'OFFLINE_LINEAR_COUNTERFACTUAL', productionChanged: false };
  });
  const evidence = { stage: STAGE2H2_STAGE, qualityGate: STAGE2H2_QUALITY_GATE, qualityGateDigest: STAGE2H2_QUALITY_GATE_DIGEST, groundTruth: { owner: 'ADAPTER_STEP_TRANSITION_REWARD', method: 'EXHAUSTIVE_DETERMINISTIC_ONE_STEP_TRANSITION_REWARD', deterministic: true, independentOfOracleNexus: true }, corpusDigest, cases, accuracy, effects, populations, signalRegimes, agreement, confidence, margins, boundSensitivity, differential: { maximum: Math.max(...differentials), p50: percentile(differentials, 50), p95: percentile(differentials, 95), p99: percentile(differentials, 99) }, harmfulCases, allHarmfulChangesExplained: harmfulCases.every((entry) => entry.causeClassification), valueWithoutSelection, metrics: { combinedHarmfulSelectionChangeRate: combinedHarmRate, noSignalRegressionRate: noSignal.cases ? noSignal.harmfulChanges / noSignal.cases : 0, strongPrimePreferenceHarmRate: strong.cases ? strong.harmfulChanges / strong.cases : 0, targetSignalRegimePositiveValue: targetPositive }, qualityGatePass, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 };
  return deepFreeze({ ...evidence, evidenceDigest: sha256(evidence) });
}
