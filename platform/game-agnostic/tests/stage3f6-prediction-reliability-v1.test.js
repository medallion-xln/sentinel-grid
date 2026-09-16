import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { sha256, stableStringify } from '../src/core/determinism.js';
import { forgeAdapterState, forgeWorldAdapter, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { createWorld, hashWorld } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import {
  createForgeIntegratedCalibration, extractIntegratedStage3EFeatures, projectIntegratedTelemetry,
} from '../src/stage3f/integrated-live-shadow-v1.js';
import { CalibrationDomain } from '../src/stage3f/environment-calibration-v1.js';
import { CounterfactualTiming } from '../src/stage3f/counterfactual-veto-ledger-v1.js';
import { ObservatoryView, createBoundedTelemetryProducer, createReadOnlyAsciiObservatory } from '../src/stage3f/ascii-observatory-v1.js';
import {
  PREDICTION_OBSERVATORY_CONTRACT, PredictionObservatoryView, createPredictionObservatory, renderPredictionFrame,
} from '../src/stage3f/prediction-observatory-v1.js';
import * as P from '../src/stage3f/prediction-reliability-v1.js';
import * as E from '../src/stage3f/prediction-reliability-episode-v1.js';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const calibration = createForgeIntegratedCalibration();
const insufficient = createForgeIntegratedCalibration({ insufficient: true });
const ENV = 'sentinel-forge-world';
const world = (seed = 3) => createWorld(seed, generateScenario({ family: 'archimedes/repair_network', level: 0, seed }));
const prediction = (overrides = {}) => ({ classId: 'TEST_CLASS', domain: 'resources', value: 10, confidence: 0.7,
  timing: CounterfactualTiming.DECISION_TIME, generatedLogicalTime: 0, environmentIdentity: ENV, ...overrides });
const outcome = (overrides = {}) => ({ value: 10, logicalTime: 2, environmentIdentity: ENV, status: 'OBSERVED', ...overrides });
const bind = (p, o, extra = {}) => P.bindPredictionToOutcome({ prediction: p, outcome: o, environmentIdentity: ENV,
  calibrationSufficient: true, decisionLogicalTime: 0, ...extra });
let cached = null;
function episode() {
  if (!cached) { const run = E.runStage3F6Episode({ world: world(), calibration }); cached = { run, evidence: E.evaluateStage3F6Episode({ run, calibration, novelty: 'FAMILIAR' }) }; }
  return cached;
}
const fullVector = (overrides = {}) => ({ ...Object.fromEntries(Object.keys(P.ONE_STEP_COMPONENT_DOMAIN).map((key) => [key, 0])), ...overrides });
const guard = (overrides = {}) => ({ environmentIdentity: ENV, decisionLogicalTime: 0, generatedLogicalTime: 0, outcomeLogicalTime: 1, outcomeStatus: 'OBSERVED', ...overrides });

/* ---------------- contract ---------------- */
test('contract is versioned', () => assert.equal(P.PREDICTION_RELIABILITY_CONTRACT_ID, 'SENTINEL_PREDICTION_RELIABILITY_BASELINE_V1'));
test('contract hash is deterministic', () => assert.equal(P.PREDICTION_RELIABILITY_CONTRACT_HASH, sha256(P.PREDICTION_RELIABILITY_CONTRACT)));
test('methodology hash is bound into the contract', () => assert.equal(P.PREDICTION_RELIABILITY_CONTRACT.methodologyHash, sha256(P.STAGE3F6_METHODOLOGY)));
test('authority stays R0 and non-dispatching', () => assert.deepEqual(P.PREDICTION_RELIABILITY_CONTRACT.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true }));
test('no training, weights, router retraining, or online learning', () => {
  for (const key of ['modelTrainingPerformed', 'weightsUpdated', 'routerRetrained', 'onlineLearningEnabled']) {
    assert.equal(P.PREDICTION_RELIABILITY_CONTRACT[key], false); assert.equal(P.STAGE3F6_METHODOLOGY.learning[key], false);
  }
});
test('reliability tiers and evidence floor are predeclared', () => {
  assert.deepEqual(P.STAGE3F6_METHODOLOGY.reliabilityTiers, [0.8, 0.9, 0.95, 0.975, 0.99]);
  assert.equal(P.STAGE3F6_METHODOLOGY.evidenceFloor.minTierN, 200);
});
test('good outcome, wrong reason, and predicted/observed invariants are declared', () => {
  assert.equal(P.PREDICTION_RELIABILITY_CONTRACT.goodFinalOutcomeImpliesGoodWorldModel, false);
  assert.equal(P.PREDICTION_RELIABILITY_CONTRACT.correctForWrongReasonCountsAsReliable, false);
  assert.equal(P.PREDICTION_RELIABILITY_CONTRACT.predictedEqualsObserved, false);
  assert.equal(P.STAGE3F6_METHODOLOGY.predictionQuality.approximateCountsAsExact, false);
});

/* ---------------- statistics ---------------- */
test('Wilson lower bound at 200/200 matches the Stage 3E evidence floor', () => assert.equal(P.wilsonInterval(200, 200).lower.toFixed(4), '0.9812'));
test('Wilson with n=0 is maximally uncertain', () => assert.deepEqual({ ...P.wilsonInterval(0, 0) }, { k: 0, n: 0, p: null, lower: 0, upper: 1 }));
test('Wilson rejects k > n', () => assert.throws(() => P.wilsonInterval(3, 2)));
test('distribution reports tail percentiles, not just the mean', () => {
  const summary = P.summarizeDistribution(Array.from({ length: 100 }, (_, i) => i + 1));
  assert.equal(summary.median, 50); assert.equal(summary.p95, 95); assert.equal(summary.p99, 99); assert.equal(summary.worst, 100);
});
test('Brier and ECE are exact on a known example', () => {
  const pairs = [...Array(4).fill({ semanticClass: 'C', confidence: 0.8, correct: true }), { semanticClass: 'C', confidence: 0.8, correct: false }];
  const report = P.calibrationReport(pairs);
  assert.equal(report.brierScore, 0.16); assert.equal(report.ece, 0);
});
test('calibration refuses to mix semantically incompatible prediction classes', () => {
  assert.throws(() => P.calibrationReport([{ semanticClass: 'A', confidence: 0.5, correct: true }, { semanticClass: 'B', confidence: 0.5, correct: true }]), /incompatible/);
});
test('missing and invalid confidences are counted, never scored', () => {
  const report = P.calibrationReport([{ semanticClass: 'C', confidence: null, correct: true }, { semanticClass: 'C', confidence: 1.5, correct: true }, { semanticClass: 'C', confidence: 0.9, correct: true }]);
  assert.equal(report.n, 1); assert.equal(report.missingConfidence, 1); assert.equal(report.invalidConfidence, 1);
});
test('high-confidence wrong is tracked per threshold with an evidence flag', () => {
  const pairs = [...Array(9).fill({ confidence: 0.95, correct: true }), { confidence: 0.95, correct: false }];
  const result = P.highConfidenceWrong(pairs);
  assert.equal(result['0.9'].n, 10); assert.equal(result['0.9'].wrong, 1); assert.equal(result['0.9'].evidenced, false); assert.equal(result['0.99'].n, 0);
});
test('Kendall tau-b handles agreement, reversal, and degenerate input', () => {
  assert.equal(P.kendallTauB([1, 2, 3], [4, 5, 6]), 1); assert.equal(P.kendallTauB([1, 2, 3], [6, 5, 4]), -1); assert.equal(P.kendallTauB([1, 1, 1], [1, 1, 1]), null);
});

/* ---------------- prediction quality ---------------- */
test('EXACT requires zero error', () => assert.equal(P.classifyNumericPrediction({ predicted: 40, actual: 40 }).quality, 'EXACT'));
test('APPROXIMATELY_CORRECT is distinct from EXACT', () => assert.equal(P.classifyNumericPrediction({ predicted: 39, actual: 40 }).quality, 'APPROXIMATELY_CORRECT'));
test('DIRECTIONALLY_CORRECT uses change relative to the decision-time reference', () => {
  assert.equal(P.classifyNumericPrediction({ predicted: 30, actual: 20, reference: 40 }).quality, 'DIRECTIONALLY_CORRECT');
});
test('WRONG when direction and magnitude both fail', () => assert.equal(P.classifyNumericPrediction({ predicted: 50, actual: 20, reference: 40 }).quality, 'WRONG'));
test('identity facts are INCOMPARABLE, never UNKNOWN or EXACT', () => {
  assert.equal(P.classifyNumericPrediction({ predicted: null, actual: 'abc', identity: true }).quality, 'INCOMPARABLE');
});
test('approximate predictions do not count toward exact accuracy', () => {
  assert.equal(P.qualityCounts([{ quality: 'EXACT' }, { quality: 'APPROXIMATELY_CORRECT' }]).exactAccuracy, 0.5);
});

/* ---------------- required failure cases ---------------- */
test('missing prediction fails safely as UNKNOWN', () => { const v = bind(null, outcome()); assert.equal(v.quality, 'UNKNOWN'); assert.equal(v.reason, 'PREDICTION_MISSING'); assert.equal(v.scored, false); });
test('malformed prediction record fails safely', () => assert.equal(bind({ classId: 'X', value: 1 }, outcome()).reason, 'PREDICTION_MALFORMED'));
test('malformed prediction value is INCOMPARABLE', () => { const v = bind(prediction({ value: 'ten' }), outcome()); assert.equal(v.quality, 'INCOMPARABLE'); assert.equal(v.reason, 'PREDICTION_MALFORMED'); });
test('missing confidence keeps accuracy scoring but marks confidence MISSING', () => { const v = bind(prediction({ confidence: undefined }), outcome()); assert.equal(v.scored, true); assert.equal(v.confidence.status, 'MISSING'); });
test('invalid confidence is rejected', () => assert.equal(bind(prediction({ confidence: Number.NaN }), outcome()).confidence.status, 'INVALID'));
test('missing actual outcome fails safely as UNKNOWN', () => assert.equal(bind(prediction(), outcome({ status: 'UNKNOWN', value: null })).reason, 'ACTUAL_OUTCOME_MISSING'));
test('prediction/outcome environment mismatch is INCOMPARABLE', () => assert.equal(bind(prediction(), outcome({ environmentIdentity: 'other-world' })).reason, 'ENVIRONMENT_MISMATCH'));
test('prediction generated after the outcome is not scored', () => {
  const v = bind(prediction({ generatedLogicalTime: 3 }), outcome({ logicalTime: 2 }), { decisionLogicalTime: 5 });
  assert.equal(v.reason, 'PREDICTION_GENERATED_AFTER_DECISION_OR_OUTCOME'); assert.equal(v.scored, false);
});
test('prediction generated after the decision is not scored', () => assert.equal(bind(prediction({ generatedLogicalTime: 1 }), outcome()).quality, 'INCOMPARABLE'));
test('post-hoc predictions are not treated as decision-time evidence', () => assert.equal(bind(prediction({ timing: CounterfactualTiming.POST_HOC_ANALYSIS }), outcome()).reason, 'NOT_DECISION_TIME_PREDICTION'));
test('calibration insufficiency makes a comparison INCOMPARABLE', () => assert.equal(bind(prediction(), outcome(), { calibrationSufficient: false }).reason, 'CALIBRATION_INSUFFICIENT'));
test('conflicted outcome is not scored', () => assert.equal(bind(prediction(), outcome({ status: 'CONFLICTED' })).reason, 'OUTCOME_CONFLICTED'));

/* ---------------- calibration conditions ---------------- */
const BASELINE_DOMAINS = [CalibrationDomain.TEMPORAL_SEMANTICS, CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.RESOURCE_SEMANTICS];
test('certified Forge calibration is CALIBRATED for the baseline domains', () => assert.equal(P.classifyCalibrationCondition(calibration, BASELINE_DOMAINS), 'CALIBRATED'));
test('partial calibration variant is PARTIALLY_CALIBRATED', () => {
  assert.equal(P.classifyCalibrationCondition(P.createCalibrationVariant(calibration, 'PARTIALLY_CALIBRATED'), [CalibrationDomain.RESOURCE_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS]), 'PARTIALLY_CALIBRATED');
});
test('insufficient calibration variant is INSUFFICIENT', () => {
  const variant = P.createCalibrationVariant(calibration, 'INSUFFICIENT', { insufficientCalibration: insufficient });
  assert.equal(P.classifyCalibrationCondition(variant, BASELINE_DOMAINS), 'INSUFFICIENT');
});
test('conflicted calibration variant is CONFLICTED', () => {
  const variant = P.createCalibrationVariant(calibration, 'CONFLICTED');
  assert.equal(variant.overallStatus, 'CONFLICTED'); assert.equal(P.classifyCalibrationCondition(variant, [CalibrationDomain.RESOURCE_SEMANTICS]), 'CONFLICTED');
});
test('insufficient variant requires the certified insufficient calibration', () => assert.throws(() => P.createCalibrationVariant(calibration, 'INSUFFICIENT'), /requires/));

/* ---------------- reference World State baseline ---------------- */
test('baseline predicts from declared semantics only and is not a Sentinel capability', () => {
  const facts = P.worldStateFactMap(episode().run.pending.worldState);
  const result = P.predictWorldStateBaseline({ facts, actionType: 'REPAIR', calibration });
  const byPath = Object.fromEntries(result.predictions.map((entry) => [entry.path, entry]));
  assert.equal(result.sentinelCapability, false); assert.equal(result.confidence, null);
  assert.equal(byPath['temporalState.tick'].value, facts['temporalState.tick'].value + 1);
  assert.equal(byPath['resources.actorEnergy'].value, facts['resources.actorEnergy'].value);
  assert.equal(byPath['resources.actorEnergy'].basis, 'NO_DECLARED_RESOURCE_COST_PERSISTENCE');
  assert.equal(byPath['constraints.worldHash'].abstained, true);
});
test('baseline abstains when a critical fact is missing', () => {
  const facts = P.degradeWorldStateFacts(P.worldStateFactMap(episode().run.pending.worldState), 'REMOVE_RESOURCE_SIGNALS');
  const energy = P.predictWorldStateBaseline({ facts, actionType: 'WAIT', calibration }).predictions.find((entry) => entry.path === 'resources.actorEnergy');
  assert.equal(energy.value, null); assert.equal(energy.abstained, true);
});
test('baseline abstains when calibration is insufficient', () => {
  const facts = P.worldStateFactMap(episode().run.pending.worldState);
  const result = P.predictWorldStateBaseline({ facts, actionType: 'WAIT', calibration: insufficient });
  assert.equal(result.predictions.find((entry) => entry.path === 'temporalState.tick').value, null);
  assert.equal(result.predictions.find((entry) => entry.path === 'resources.actorEnergy').value, null);
});
test('stale-input errors are attributed to OBSERVATION_ERROR', () => {
  const facts = P.degradeWorldStateFacts(P.worldStateFactMap(episode().run.pending.worldState), 'STALE_OBSERVATION');
  const tick = P.predictWorldStateBaseline({ facts, actionType: 'WAIT', calibration }).predictions.find((entry) => entry.path === 'temporalState.tick');
  assert.equal(P.attributeBaselineError({ verdict: { quality: 'WRONG' }, prediction: tick, calibration }), 'OBSERVATION_ERROR');
});
test('energy errors without declared resource costs are CALIBRATION_ERROR', () => {
  const energy = { path: 'resources.actorEnergy', staleInput: false };
  assert.equal(P.attributeBaselineError({ verdict: { quality: 'APPROXIMATELY_CORRECT' }, prediction: energy, calibration }), 'CALIBRATION_ERROR');
});

/* ---------------- degraded observations ---------------- */
function observation() { return forgeWorldAdapter.observe(forgeAdapterState(world(7)), FORGE_OBSERVER_ID); }
test('degradation never mutates the authoritative observation', () => {
  const source = observation(); const before = stableStringify(source);
  for (const id of Object.values(P.ObservationDegradation).filter((entry) => entry !== 'STALE_OBSERVATION')) P.degradeObservation(source, id);
  assert.equal(stableStringify(source), before);
});
test('threat removal clears hostile flags and threat relationships', () => {
  const degraded = P.degradeObservation(observation(), 'REMOVE_THREAT_INFORMATION');
  assert.ok(degraded.metadata.canonicalState.entities.every((entity) => entity.hostile === false));
  assert.ok(degraded.metadata.canonicalState.relationships.every((relation) => relation.kind !== 'threatens'));
});
test('entity-subset drop keeps the actor and consistent relationships', () => {
  const degraded = P.degradeObservation(observation(), 'DROP_ENTITY_SUBSET');
  const ids = new Set(degraded.metadata.canonicalState.entities.map((entity) => entity.id));
  assert.ok(degraded.metadata.canonicalState.entities.some((entity) => entity.kind === 'ACTOR'));
  assert.ok(degraded.metadata.canonicalState.relationships.every((relation) => ids.has(relation.from) && ids.has(relation.to)));
});
test('relationship hiding removes all relationships', () => assert.equal(P.degradeObservation(observation(), 'HIDE_RELATIONSHIPS').metadata.canonicalState.relationships.length, 0));
test('stale observation is not a single-observation transform', () => assert.throws(() => P.degradeObservation(observation(), 'STALE_OBSERVATION')));
test('stale World State facts are marked and shifted without mutating input', () => {
  const facts = P.worldStateFactMap(episode().run.pending.worldState); const before = stableStringify(facts);
  const stale = P.degradeWorldStateFacts(facts, 'STALE_OBSERVATION');
  assert.equal(stable(facts), before); assert.equal(stale['temporalState.tick'].value, facts['temporalState.tick'].value - 1); assert.equal(stale['temporalState.tick'].stale, true);
  function stable(value) { return stableStringify(value); }
});
test('runtime World State v1 is partial: spatial, risk, and constraint content are missing', () => {
  const coverage = P.worldStateDomainCoverage(P.worldStateFactMap(episode().run.pending.worldState));
  assert.equal(coverage.complete, false); assert.deepEqual(coverage.missing, ['spatialState', 'constraints', 'risk']);
});
test('removing resource signals from the observation leaves every runtime feature unchanged (privileged state read)', () => {
  const state = forgeAdapterState(world(7)); const source = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const base = extractIntegratedStage3EFeatures(state, source, null).values;
  const degraded = extractIntegratedStage3EFeatures(state, P.degradeObservation(source, 'REMOVE_RESOURCE_SIGNALS'), null).values;
  assert.equal(stableStringify(degraded), stableStringify(base));
});
test('observation degradation cannot change one-step branch consequences', () => {
  const state = forgeAdapterState(world(7)); const source = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const base = extractIntegratedStage3EFeatures(state, source, null);
  const degraded = extractIntegratedStage3EFeatures(state, P.degradeObservation(source, 'DROP_ENTITY_SUBSET'), null);
  assert.equal(stableStringify(degraded.branches), stableStringify(base.branches));
  assert.equal(degraded.values.energy, base.values.energy); assert.equal(degraded.values.immediateMargin, base.values.immediateMargin);
});

/* ---------------- one-step consequence evidence ---------------- */
const branches = (vector, scalar = -3) => [{ actionKey: 'k', rewardVector: vector, immediateScalar: scalar }];
test('one-step consequence is EXACT when branch evidence matches the executed transition', () => {
  const vector = fullVector({ resourceCost: 2, timeCost: 1 });
  const result = P.evaluateOneStepConsequence({ branches: branches(vector), executedActionKey: 'k', actualRewardVector: vector, actualScalarReward: -3, calibration, guard: guard() });
  assert.equal(result.scalar.quality, 'EXACT'); assert.equal(result.privilegedSimulatorAccess, true); assert.equal(result.confidence, null);
  assert.equal(result.components.find((entry) => entry.component === 'resourceCost').quality, 'EXACT');
});
test('missing executed-action branch makes every component UNKNOWN', () => {
  const result = P.evaluateOneStepConsequence({ branches: branches(fullVector()), executedActionKey: 'other', actualRewardVector: fullVector(), actualScalarReward: 0, calibration, guard: guard() });
  assert.equal(result.predictionPresent, false); assert.ok(result.components.every((entry) => entry.quality === 'UNKNOWN'));
});
test('one-step environment mismatch is INCOMPARABLE', () => {
  const result = P.evaluateOneStepConsequence({ branches: branches(fullVector()), executedActionKey: 'k', actualRewardVector: fullVector(), actualScalarReward: -3, calibration,
    guard: guard({ predictionEnvironmentIdentity: 'elsewhere' }) });
  assert.equal(result.scalar.quality, 'INCOMPARABLE');
});
test('exact scalar with a wrong component is correct for the wrong reason', () => {
  const result = P.evaluateOneStepConsequence({ branches: branches(fullVector({ resourceCost: 2 })), executedActionKey: 'k',
    actualRewardVector: fullVector({ resourceCost: 9 }), actualScalarReward: -3, calibration, guard: guard() });
  assert.equal(result.correctForWrongReason, true); assert.equal(result.errorCompensation, false);
});
test('exact scalar with two wrong components is error compensation', () => {
  const result = P.evaluateOneStepConsequence({ branches: branches(fullVector({ resourceCost: 2, infrastructureHealth: 30 })), executedActionKey: 'k',
    actualRewardVector: fullVector({ resourceCost: 9, infrastructureHealth: 60 }), actualScalarReward: -3, calibration, guard: guard() });
  assert.equal(result.errorCompensation, true);
});
test('constraint components are INCOMPARABLE when constraint semantics are uncalibrated', () => {
  const vector = fullVector();
  const result = P.evaluateOneStepConsequence({ branches: branches(vector), executedActionKey: 'k', actualRewardVector: vector, actualScalarReward: -3, calibration, guard: guard() });
  assert.equal(result.components.find((entry) => entry.component === 'illegalActionPenalty').quality, 'INCOMPARABLE');
});

/* ---------------- router evidence ---------------- */
const tinyModel = { keys: ['x'], mu: [0], sd: [1], w: [1, 1] };
test('canonical Stage 3E equation uses the last weight as bias', () => {
  const model = { keys: ['x'], mu: [0], sd: [1], w: [2, -1] };
  assert.equal(P.scoreStage3ERouter({ x: 1 }, model, P.RouterEquation.STAGE3E_CANONICAL), 1 / (1 + Math.exp(-1)));
  assert.equal(P.scoreStage3ERouter({ x: 1 }, model, P.RouterEquation.STAGE3F5_RUNTIME), 1 / (1 + Math.exp(-1)));
  assert.notEqual(P.scoreStage3ERouter({ x: 2 }, model, P.RouterEquation.STAGE3E_CANONICAL), P.scoreStage3ERouter({ x: 2 }, model, P.RouterEquation.STAGE3F5_RUNTIME));
});
test('remediated runtime router score equals the canonical Stage 3E equation exactly', () => {
  const model = JSON.parse(readFileSync(file('artifacts/stage3e-routability-intelligence/lr-model.json'), 'utf8'));
  const { run } = episode();
  assert.equal(P.scoreStage3ERouter(run.pending.features.values, model, P.RouterEquation.STAGE3E_CANONICAL), run.pending.router.score);
});
test('missing feature produces no score rather than a silent default', () => assert.equal(P.scoreStage3ERouter({}, tinyModel), null));
function routerFixture() {
  const entry = { recordHash: 'r1', partition: 'HOLDOUT', contractGreedyKey: 'g-contract', runtimeGreedyKey: 'g-runtime',
    runtimeCandidate: { actionKey: 'g-runtime' }, runtimeFeatureDiff: { x: 3 },
    branches: [['g-contract', 'MOVE', 5, 0, 5], ['g-runtime', 'WAIT', 1, 5, 0]] };
  return P.evaluateRouterCase(entry, { y: 0, f: { x: 0 } }, tinyModel);
}
test('route decomposition separates feature, equation, and action-binding errors', () => {
  const c = routerFixture();
  assert.equal(c.routeContract, false); assert.equal(c.routeRuntime, true);
  assert.equal(c.featureRouteError, true); assert.equal(c.equationRouteError, false); assert.equal(c.actionBindingError, true);
});
test('correct runtime decision with intermediate errors is correct for the wrong reason', () => {
  const c = routerFixture(); assert.equal(c.correctRuntime, true); assert.equal(c.correctForWrongReason, true);
});
test('cancelling feature and binding errors are detected as error compensation', () => assert.equal(routerFixture().errorCompensation, true));
test('runtime equation divergence is attributed to ROUTER_ERROR', () => {
  const a = P.attributeRuntimeFalseSafe({ routeRuntime: true, routeRuntimeFeaturesCanonical: false, routeContract: false });
  assert.deepEqual({ ...a }, { category: 'ROUTER_ERROR', basis: 'RUNTIME_ROUTER_EQUATION_DIVERGENCE' });
});
test('runtime feature divergence is attributed to FEATURE_DERIVATION_ERROR', () => {
  assert.equal(P.attributeRuntimeFalseSafe({ routeRuntime: true, routeRuntimeFeaturesCanonical: true, routeContract: false, routeDerivationOnly: true }).category, 'FEATURE_DERIVATION_ERROR');
});
test('labeled-greedy mismatch is attributed to ACTION_BINDING_ERROR', () => {
  assert.equal(P.attributeRuntimeFalseSafe({ routeRuntime: true, routeRuntimeFeaturesCanonical: true, routeContract: true, actionBindingError: true, contractGreedyOptimal: true }).category, 'ACTION_BINDING_ERROR');
});
test('identical representation with opposite labels is STATE_REPRESENTATION_ERROR', () => {
  assert.equal(P.attributeContractFalseSafe({ signatureClass: { n: 3, positive: 1 } }).category, 'STATE_REPRESENTATION_ERROR');
});
test('unseparable contract errors remain UNKNOWN rather than forced', () => assert.equal(P.attributeContractFalseSafe({ signatureClass: { n: 1, positive: 0 } }).category, 'UNKNOWN'));
test('identical full state with opposite outcomes is INHERENT_STOCHASTICITY', () => assert.equal(P.attributeContractFalseSafe({ stochasticDuplicate: true }).category, 'INHERENT_STOCHASTICITY'));
test('proxy fidelity is HIGH, LOW, or UNKNOWN deterministically and excludes the greedy branch', () => {
  const base = { contractGreedyKey: 'g' };
  assert.equal(P.proxyFidelity({ ...base, branches: [['g', 'M', 0, 0, 0], ['a', 'M', 1, 1, 0], ['b', 'M', 2, 2, 0], ['c', 'M', 3, 3, 0]] }).bucket, 'HIGH');
  assert.equal(P.proxyFidelity({ ...base, branches: [['g', 'M', 0, 9, 0], ['a', 'M', 1, 3, 0], ['b', 'M', 2, 2, 0], ['c', 'M', 3, 1, 0]] }).bucket, 'LOW');
  assert.equal(P.proxyFidelity({ ...base, branches: [['g', 'M', 0, 0, 0], ['a', 'M', 1, 1, 0]] }).bucket, 'UNKNOWN');
});
test('representation ambiguity is an in-sample bound with class evidence reported', () => {
  const result = P.representationAmbiguity([{ signature: 'a', y: 1 }, { signature: 'a', y: 0 }, { signature: 'b', y: 1 }], { coverage: 0.3 });
  assert.equal(result.ambiguousCaseRate, 0.666667); assert.equal(result.selectiveCeilingPrecision, 1); assert.equal(result.ceilingIsInSampleUpperBound, true);
});

/* ---------------- partitions, freeze, sealed access ---------------- */
const partitions = () => ({
  DEV: [{ recordHash: 'd1', worldHash: 'wd1', topologyHash: 'td1' }], CAL: [{ recordHash: 'c1', worldHash: 'wc1', topologyHash: 'tc1' }],
  HOLDOUT: [{ recordHash: 'h1', worldHash: 'wh1', topologyHash: 'th1' }], OOD: [{ recordHash: 'o1', worldHash: 'wo1', topologyHash: 'to1' }],
});
const freezeFor = (access) => P.createEvaluationFreeze({ corpusDigest: 'sha256:x', snapshotManifest: { snapshotId: 'sha256:s', snapshotDigest: 'sha256:d' },
  partitionIdentities: access.identities, designDerived: {}, inventory: [] });
test('leakage check is zero for disjoint partitions', () => {
  const result = P.checkPartitionLeakage(partitions());
  assert.equal(result.episodeOverlap + result.stateIdOverlap + result.derivedVariantLeakage, 0);
});
test('leakage check detects episode, state, and derived-variant overlap', () => {
  const leaky = partitions(); leaky.HOLDOUT.push({ recordHash: 'd1', worldHash: 'wd1', topologyHash: 'td1' });
  const result = P.checkPartitionLeakage(leaky);
  assert.equal(result.episodeOverlap, 1); assert.equal(result.stateIdOverlap, 1); assert.equal(result.derivedVariantLeakage, 1);
});
test('derived-variant quarantine removes later-partition cases sharing an earlier topology', () => {
  const leaky = partitions(); leaky.HOLDOUT.push({ recordHash: 'h2', worldHash: 'wh2', topologyHash: 'td1' });
  const { partitions: kept, quarantined } = P.quarantineDerivedVariants(leaky);
  assert.equal(quarantined.HOLDOUT, 1); assert.equal(kept.HOLDOUT.length, 1);
  const result = P.checkPartitionLeakage(kept);
  assert.equal(result.episodeOverlap + result.stateIdOverlap + result.derivedVariantLeakage, 0);
});
test('namespaced partition access binds its own identities into the freeze', () => {
  const access = P.createPartitionAccess(partitions(), { namespace: 'FULL' });
  assert.ok(Object.keys(access.identities).every((key) => key.startsWith('FULL/')));
  assert.equal(access.sealed('HOLDOUT', freezeFor(access)).length, 1);
});
test('temporal and future-to-past leakage are detected', () => {
  const result = P.temporalLeakage([{ decisionLogicalTime: 5, outcomeLogicalTime: 5, predictionGeneratedLogicalTime: 6 }]);
  assert.equal(result.temporalLeakage, 1); assert.equal(result.futureToPastLeakage, 1);
});
test('sealed partition access before the freeze is refused', () => {
  const access = P.createPartitionAccess(partitions());
  assert.throws(() => access.sealed('HOLDOUT', null), /SEALED_PARTITION_ACCESS_BEFORE_FREEZE/);
});
test('design and sealed accessors refuse each other’s partitions', () => {
  const access = P.createPartitionAccess(partitions());
  assert.throws(() => access.design('HOLDOUT')); assert.throws(() => access.sealed('CAL', freezeFor(access)));
});
test('verified freeze unlocks sealed partitions and is logged', () => {
  const access = P.createPartitionAccess(partitions()); const freeze = freezeFor(access);
  assert.equal(access.sealed('OOD', freeze).length, 1);
  assert.equal(access.accessLog().at(-1).freezeHash, freeze.freezeHash);
});
test('tampered freeze is rejected', () => {
  const access = P.createPartitionAccess(partitions()); const freeze = structuredClone(freezeFor(access)); freeze.designDerived = { tau: 0.5 };
  assert.throws(() => access.sealed('HOLDOUT', freeze), /hash mismatch/);
});
test('freeze naming different partition membership is rejected', () => {
  const other = P.createPartitionAccess({ ...partitions(), HOLDOUT: [{ recordHash: 'h2', worldHash: 'x', topologyHash: 'y' }] });
  const access = P.createPartitionAccess(partitions());
  assert.throws(() => access.sealed('HOLDOUT', freezeFor(other)), /identity differs/);
});

/* ---------------- novelty and tiers ---------------- */
test('novelty thresholds come from CAL distance quantiles and bucket deterministically', () => {
  const thresholds = P.deriveNoveltyThresholds(Array.from({ length: 100 }, (_, i) => i / 100));
  assert.equal(P.noveltyBucket(0.1, thresholds), 'FAMILIAR'); assert.equal(P.noveltyBucket(0.9, thresholds), 'NEAR_NOVEL');
  assert.equal(P.noveltyBucket(5, thresholds), 'STRONGLY_NOVEL'); assert.equal(P.noveltyBucket(Number.NaN, thresholds), 'UNKNOWN');
});
test('nearest-reference distance is exact on a small example', () => {
  const model = { keys: ['a', 'b'], mu: [0, 0], sd: [1, 1] };
  const distances = P.nearestReferenceDistances(P.standardizedMatrix([{ a: 3, b: 4 }], model), P.standardizedMatrix([{ a: 0, b: 0 }, { a: 3, b: 5 }], model));
  assert.equal(distances[0], Math.sqrt(1 / 2));
});
test('tier selection requires the evidence floor and never claims 0.99 from 250 perfect cases', () => {
  const points = P.selectTierOperatingPoints(Array.from({ length: 250 }, () => ({ score: 0.95, correct: true })));
  assert.equal(points['0.99'].tau, null); assert.equal(points['0.975'].tau, 0.5);
});
test('tier evaluation is NOT_ACHIEVABLE below the floor and ACHIEVABLE when evidenced', () => {
  const small = Array.from({ length: 50 }, () => ({ score: 0.95, correct: true }));
  assert.equal(P.evaluateTier(small, { tau: 0.9 }, 0.8).status, 'NOT_ACHIEVABLE');
  const large = Array.from({ length: 400 }, () => ({ score: 0.95, correct: true }));
  assert.equal(P.evaluateTier(large, { tau: 0.9 }, 0.95).status, 'ACHIEVABLE');
  assert.equal(P.evaluateTier(large, { tau: null }, 0.95).reason, 'NO_CAL_OPERATING_POINT_MEETS_TIER_AT_EVIDENCE_FLOOR');
});

/* ---------------- diagnosis ---------------- */
const diagnosisInput = (overrides = {}) => ({ contractFalseSafeByFidelity: { HIGH: 10, MEDIUM: 30, LOW: 40, UNKNOWN: 0 },
  runtimeFalseSafeAttribution: { ROUTER_ERROR: 5, UNKNOWN: 5 }, routeDisagreementRate: 0, holdoutEce: 0.01,
  holdoutHcw090: { n: 300, rate: 0.05 }, horizonFalseSafe: { early: { routed: 50, falseSafe: 5 }, late: { routed: 50, falseSafe: 5 } },
  multistepPredictionAvailable: false, calibrationSensitivity: 0, ...overrides });
test('diagnosis reports insufficient evidence below the floor', () => {
  assert.equal(P.diagnoseLimitations(diagnosisInput({ contractFalseSafeByFidelity: { HIGH: 2, LOW: 3 } })).primary, 'H_INSUFFICIENT_EVIDENCE');
});
test('diagnosis names prediction limitation primary when low-fidelity errors dominate', () => {
  const result = P.diagnoseLimitations(diagnosisInput()); assert.equal(result.primary, 'C_PREDICTION_LIMITED');
});
test('diagnosis reports mixed limitation when several are supported', () => {
  const result = P.diagnoseLimitations(diagnosisInput({ contractFalseSafeByFidelity: { HIGH: 40, LOW: 40 }, routeDisagreementRate: 0.3 }));
  assert.ok(result.categories.includes('G_MIXED_LIMITATION'));
});

/* ---------------- governed runtime episode ---------------- */
test('episode executes the incumbent exactly once through the Forge adapter', () => {
  const { run } = episode(); assert.equal(run.pending.nextState.sequence, run.pending.stateBefore.sequence + 1);
});
test('episode one-step consequence evidence is decision-time, privileged, and exact', () => {
  const { evidence } = episode();
  assert.equal(evidence.oneStep.privilegedSimulatorAccess, true); assert.equal(evidence.oneStep.scalar.quality, 'EXACT');
  assert.ok(evidence.predictionGeneratedLogicalTime <= evidence.decisionLogicalTime && evidence.decisionLogicalTime < evidence.outcomeLogicalTime);
});
test('counterfactual predictions are never scored as executed', () => {
  const { evidence } = episode(); assert.equal(evidence.counterfactual.scoredAsExecuted, false); assert.equal(evidence.counterfactual.predictedContentPresent, false);
});
test('episode without an actual outcome leaves World State predictions UNKNOWN', () => {
  const run = E.runStage3F6Episode({ world: world(), calibration, skipOutcome: true });
  const evidence = E.evaluateStage3F6Episode({ run, calibration });
  assert.ok(evidence.worldState.filter((entry) => entry.path !== 'constraints.worldHash').every((entry) => entry.quality === 'UNKNOWN'));
});
test('novel-state label is carried into episode evidence', () => {
  const run = episode().run; assert.equal(E.evaluateStage3F6Episode({ run, calibration, novelty: 'STRONGLY_NOVEL' }).novelty, 'STRONGLY_NOVEL');
});
test('degraded decision facts lower baseline coverage and keep authority R0', () => {
  const { run } = episode();
  const degraded = E.evaluateStage3F6Episode({ run, calibration, decisionFacts: P.degradeWorldStateFacts(P.worldStateFactMap(run.pending.worldState), 'REMOVE_RESOURCE_SIGNALS') });
  assert.equal(degraded.worldState.find((entry) => entry.path === 'resources.actorEnergy').quality, 'UNKNOWN');
  assert.deepEqual(degraded.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true });
});
test('episode evaluation does not mutate the executed world', () => {
  const run = E.runStage3F6Episode({ world: world(), calibration }); const before = hashWorld(run.pending.nextState.world);
  E.evaluateStage3F6Episode({ run, calibration }); assert.equal(hashWorld(run.pending.nextState.world), before);
});

/* ---------------- observatory ---------------- */
function frames() {
  const { run, evidence } = episode(); const legacy = projectIntegratedTelemetry(run.result);
  return { legacy, prediction: { ...legacy, prediction: E.projectPredictionTelemetry(evidence, { oneStepExactAccuracy: 1 }) } };
}
test('prediction observatory adds PREDICTION and keeps the seven certified views', () => {
  const observatory = createPredictionObservatory(createBoundedTelemetryProducer());
  assert.equal(observatory.views.length, 8); assert.ok(Object.values(ObservatoryView).every((view) => observatory.views.includes(view)));
});
test('prediction observatory exposes no write, dispatch, or model surface', () => {
  const observatory = createPredictionObservatory(createBoundedTelemetryProducer());
  assert.equal(PREDICTION_OBSERVATORY_CONTRACT.readOnly, true);
  assert.ok(PREDICTION_OBSERVATORY_CONTRACT.prohibitedCapabilities.every((name) => !(name in observatory)));
});
test('legacy views render byte-identically to the certified v1 observatory', () => {
  const producer = createBoundedTelemetryProducer(); producer.offer(frames().legacy);
  const v1 = createReadOnlyAsciiObservatory(producer); const v2 = createPredictionObservatory(producer);
  for (const view of Object.values(ObservatoryView)) assert.equal(v2.render({ view }), v1.render({ view }));
});
test('PREDICTION view shows predicted vs actual, confidence, abstention, novelty, calibration, and attribution', () => {
  const producer = createBoundedTelemetryProducer(); const { legacy, prediction: frame } = frames(); producer.offer(legacy); producer.offer(frame);
  const text = createPredictionObservatory(producer).render({ view: PredictionObservatoryView.PREDICTION });
  for (const token of ['WORLD STATE', 'ONE-STEP CONSEQUENCE', 'router confidence', 'reliability bin', 'router abstained', 'state novelty', 'calibration (baseline)', 'error attribution']) {
    assert.ok(text.includes(token), token);
  }
});
test('frame without prediction evidence renders UNKNOWN, not fabricated values', () => assert.match(renderPredictionFrame({ logicalTime: 0 }), /PREDICTION EVIDENCE UNKNOWN/));
test('unsupported observatory view is rejected', () => assert.throws(() => createPredictionObservatory(createBoundedTelemetryProducer()).render({ view: 'EXECUTE' })));
test('observatory disconnect drops frames without affecting the runtime transition', () => {
  const producer = createBoundedTelemetryProducer({ capacity: 2 }); producer.disconnect();
  const run = E.runStage3F6Episode({ world: world(), calibration, telemetrySink: producer });
  assert.ok(producer.snapshot().stats.dropped > 0);
  assert.equal(run.pending.transition.info.worldHash, episode().run.pending.transition.info.worldHash);
});

/* ---------------- predecessor immutability and corpus ---------------- */
test('certified Stage 3F.5 observatory sources are unchanged; its runtime is superseded by the remediation gate', () => {
  const certificate = JSON.parse(readFileSync(file('artifacts/stage3f5-integrated-live-shadow/stage3f5-certification-result.json'), 'utf8'));
  const digest = (relative) => createHash('sha256').update(readFileSync(file(relative))).digest('hex');
  assert.equal(certificate.certificationHash, 'eda3d2d67334dd904a24ff574f4e839e52fb67ec26fb01112b8f21c973b4fbe5');
  for (const relative of ['src/stage3f/ascii-observatory-v1.js', 'scripts/sentinel-observatory.mjs', 'tests/stage3f5-integrated-live-shadow-v1.test.js']) {
    assert.equal(digest(relative), certificate.sourceHashes[relative], relative);
  }
  assert.notEqual(digest('src/stage3f/integrated-live-shadow-v1.js'), certificate.sourceHashes['src/stage3f/integrated-live-shadow-v1.js']);
});
test('evaluation corpus, when present, matches its manifest digest and contains no labels', { skip: !existsSync(file('artifacts/stage3f6-prediction-reliability/evaluation-corpus.jsonl.gz')) }, () => {
  const manifest = JSON.parse(readFileSync(file('artifacts/stage3f6-prediction-reliability/evaluation-corpus-manifest.json'), 'utf8'));
  const text = gunzipSync(readFileSync(file('artifacts/stage3f6-prediction-reliability/evaluation-corpus.jsonl.gz'))).toString('utf8');
  assert.equal(`sha256:${createHash('sha256').update(text).digest('hex')}`, manifest.corpusDigest);
  const first = JSON.parse(text.slice(0, text.indexOf('\n')));
  assert.equal('y' in first, false); assert.equal('greedyOk' in first, false);
});
