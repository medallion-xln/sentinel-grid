import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256, stableStringify } from '../src/core/determinism.js';
import { forgeAdapterState, forgeWorldAdapter, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { createWorld, hashWorld } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import {
  FEATURE_CONTRACT_V2_HASH, INTEGRATED_LIVE_SHADOW_CONTRACT, INTEGRATED_LIVE_SHADOW_CONTRACT_HASH,
  INTEGRATED_LIVE_SHADOW_CONTRACT_ID, STAGE3E_ROUTER_HASH, beginIntegratedLiveShadowStep,
  completeIntegratedLiveShadowStep, createForgeIntegratedCalibration, evaluateIntegratedStage3ERouter,
  extractIntegratedStage3EFeatures, runIntegratedLiveShadowCampaign, summarizeTimings,
} from '../src/stage3f/integrated-live-shadow-v1.js';
import {
  ASCII_OBSERVATORY_CONTRACT, ASCII_OBSERVATORY_CONTRACT_HASH, ObservatoryView,
  createBoundedTelemetryProducer, createReadOnlyAsciiObservatory, renderAsciiObservatoryFrame,
} from '../src/stage3f/ascii-observatory-v1.js';
import { CalibrationDomain, evaluateCalibrationSufficiency } from '../src/stage3f/environment-calibration-v1.js';
import * as publicApi from '../src/index.js';

function fixture(seed = 3) {
  const config = generateScenario({ family: 'archimedes/repair_network', level: 0, seed });
  return forgeAdapterState(createWorld(seed, config));
}
function candidate(state) {
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const preliminary = extractIntegratedStage3EFeatures(state, observation, { actionId: 'unbound' });
  return { actionId: preliminary.greedy.actionId, producerId: 'TEST_V2B', producerVersion: '1' };
}
function run(options = {}) {
  const state = options.state ?? fixture();
  const started = beginIntegratedLiveShadowStep({ state, candidateRecommendation: candidate(state), ...options });
  return { started, completed: completeIntegratedLiveShadowStep(started, options.complete ?? {}) };
}

test('integrated contract is versioned', () => assert.equal(INTEGRATED_LIVE_SHADOW_CONTRACT_ID, 'SENTINEL_INTEGRATED_LIVE_SHADOW_V1'));
test('integrated contract hash is deterministic', () => assert.equal(INTEGRATED_LIVE_SHADOW_CONTRACT_HASH, sha256(INTEGRATED_LIVE_SHADOW_CONTRACT)));
test('integrated contract keeps R0 authority', () => assert.deepEqual(INTEGRATED_LIVE_SHADOW_CONTRACT.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true }));
test('integrated chain names all predecessor stages', () => assert.equal(INTEGRATED_LIVE_SHADOW_CONTRACT.chain.length, 10));
test('full Forge calibration is sufficient', () => assert.equal(evaluateCalibrationSufficiency(createForgeIntegratedCalibration(), [CalibrationDomain.ACTION_SEMANTICS]).sufficient, true));
test('insufficient calibration fails closed', () => assert.equal(evaluateCalibrationSufficiency(createForgeIntegratedCalibration({ insufficient: true }), [CalibrationDomain.ACTION_SEMANTICS]).sufficient, false));
test('feature extraction is deterministic', () => { const s = fixture(); const o = forgeWorldAdapter.observe(s, FORGE_OBSERVER_ID); const c = candidate(s); assert.equal(stableStringify(extractIntegratedStage3EFeatures(s, o, c)), stableStringify(extractIntegratedStage3EFeatures(s, o, c))); });
test('feature extraction does not mutate world', () => { const s = fixture(); const before = hashWorld(s.world); extractIntegratedStage3EFeatures(s, forgeWorldAdapter.observe(s, FORGE_OBSERVER_ID), candidate(s)); assert.equal(hashWorld(s.world), before); });
test('feature extraction produces all 51 Stage 3E inputs', () => { const s = fixture(); assert.equal(Object.keys(extractIntegratedStage3EFeatures(s, forgeWorldAdapter.observe(s, FORGE_OBSERVER_ID), candidate(s)).values).length, 51); });
test('router scoring is deterministic', () => { const s = fixture(); const f = extractIntegratedStage3EFeatures(s, forgeWorldAdapter.observe(s, FORGE_OBSERVER_ID), candidate(s)); assert.deepEqual(evaluateIntegratedStage3ERouter(f.values, candidate(s)), evaluateIntegratedStage3ERouter(f.values, candidate(s))); });
test('router requires candidate evidence', () => assert.throws(() => evaluateIntegratedStage3ERouter({}, null), /CANDIDATE_EVIDENCE_REQUIRED/));
test('missing genuine V2B fallback evidence abstains instead of synthesizing output', () => {
  const seed = 501; const state = forgeAdapterState(createWorld(seed,
    generateScenario({ family: 'prime/adversarial_choice', level: 1, seed })));
  const started = beginIntegratedLiveShadowStep({ state });
  const recommendation = started.trace.decisionTimeEvent.decisionTimeEvidence.recommendation;
  assert.equal(started.router.selectedRoute, 'LEARNED_NEXUS_V2B');
  assert.equal(recommendation.abstained, true);
  assert.equal(recommendation.proposedAction, null);
});
test('router binds frozen Stage 3E hash', () => assert.equal(run().started.router.routerHash, STAGE3E_ROUTER_HASH));
test('trace binds Feature Contract v2 hash', () => assert.equal(run().started.trace.decisionTimeEvent.decisionTimeEvidence.featureDerivation.featureContract.hash, FEATURE_CONTRACT_V2_HASH));
test('begin executes exactly one incumbent transition', () => { const { started } = run(); assert.equal(started.nextState.sequence, started.stateBefore.sequence + 1); });
test('world-state instrumentation failure cannot stop incumbent', () => { const s = fixture(); const legal = forgeWorldAdapter.legalActions(s, FORGE_OBSERVER_ID)[0]; const baseline = forgeWorldAdapter.step(s, legal, { observerId: FORGE_OBSERVER_ID }); const started = beginIntegratedLiveShadowStep({ state: s, incumbentAction: legal, candidateRecommendation: candidate(s), failureInjection: ['WORLD_STATE'] }); assert.equal(started.transition.info.worldHash, baseline.info.worldHash); });
test('calibration instrumentation failure cannot stop incumbent', () => { const s = fixture(); const started = beginIntegratedLiveShadowStep({ state: s, candidateRecommendation: candidate(s), failureInjection: ['CALIBRATION'] }); assert.equal(started.nextState.sequence, 1); });
test('decision trace binds observation to world state', () => { const t = run().started.trace; assert.equal(t.decisionTimeEvent.decisionTimeEvidence.featureDerivation.worldStateSnapshotId, t.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot.snapshotId); });
test('world-state and trace calibration bindings are materialized', () => { const b = run().started.calibrationBindings; assert.ok(b.worldState.worldStateCalibrationBindingId); assert.ok(b.trace.causalTraceCalibrationBindingId); });
test('recommendation remains R0', () => assert.equal(run().started.trace.decisionTimeEvent.decisionTimeEvidence.recommendation.authority.tier, 'R0'));
test('recommendation cannot dispatch', () => assert.equal(run().started.trace.decisionTimeEvent.decisionTimeEvidence.recommendation.dispatchPermitted, false));
test('incumbent action is separately attached', () => assert.equal(run().started.trace.projection.incumbentActions[0].actor, 'INCUMBENT'));
test('missing outcome remains explicitly unknown', () => assert.equal(run().started.trace.projection.outcomeStatus, 'UNKNOWN'));
test('outcome attaches later', () => assert.equal(run().completed.trace.projection.outcomeStatus, 'BOUND'));
test('delayed outcome preserves logical delay', () => { const { started } = run(); const done = completeIntegratedLiveShadowStep(started, { outcomeDelay: 5 }); assert.equal(done.outcomeTime - done.logicalTime, 6); });
test('actual outcome is OBSERVED, not PREDICTED', () => assert.equal(run().completed.trace.projection.outcomes[0].epistemicCategory, 'OBSERVED'));
test('ledger binds selected incumbent action', () => assert.equal(run().started.ledger.projection.selectedActions.length, 1));
test('ledger contains decision-time counterfactual', () => assert.equal(run().started.ledger.projection.counterfactuals[0].timing, 'DECISION_TIME'));
test('agreement does not imply correctness', () => assert.equal(run().started.ledger.projection.selectedActions[0].correctnessStatus, 'UNKNOWN'));
test('counterfactual remains non-executed', () => assert.equal(run().started.ledger.projection.counterfactuals[0].executed, false));
test('ledger does not assign automatic reward', () => assert.equal(run().completed.ledger.projection.evaluations[0].automaticRewardAssignment, false));
test('veto does not assign negative reward', () => assert.equal(run({ humanOverride: true }).started.ledger.projection.vetoes[0].negativeRewardAssigned, false));
test('complete experience validates', () => assert.equal(run().completed.experience.projection.validations.at(-1).status, 'VALIDATED'));
test('calibrated router-analysis experience is eligible', () => assert.equal(run().completed.experience.projection.eligibilityByPurpose.ROUTER_ANALYSIS.status, 'ELIGIBLE'));
test('completed experience is appended to a deterministic buffer', () => assert.equal(run().completed.experienceBuffer.projection.experiences.length, 1));
test('uncalibrated experience is ineligible', () => { const s = fixture(); const started = beginIntegratedLiveShadowStep({ state: s, candidateRecommendation: candidate(s), calibration: createForgeIntegratedCalibration({ insufficient: true }) }); assert.equal(completeIntegratedLiveShadowStep(started).experience.projection.eligibilityByPurpose.ROUTER_ANALYSIS.status, 'INELIGIBLE'); });
test('human override is recorded without changing executor', () => { const r = run({ humanOverride: true }).started; assert.equal(r.ledger.projection.vetoes[0].actor.type, 'HUMAN'); assert.equal(r.ledger.projection.selectedActions[0].executedBy.type, 'INCUMBENT'); });
test('campaign replay hash is deterministic', () => assert.equal(runIntegratedLiveShadowCampaign().campaignHash, runIntegratedLiveShadowCampaign().campaignHash));
const campaign = runIntegratedLiveShadowCampaign();
test('campaign is bounded to eight episodes', () => assert.equal(campaign.episodes.length, 8));
test('campaign exercises agreement', () => assert.equal(campaign.episodes.find((e) => e.id === 'AGREEMENT').actionMatch, 'MATCH'));
test('campaign exercises disagreement', () => assert.equal(campaign.episodes.find((e) => e.id === 'DISAGREEMENT').actionMatch, 'DIFFERENT_ACTION'));
test('campaign exercises delayed outcome', () => assert.equal(campaign.episodes.find((e) => e.id === 'DELAYED_OUTCOME').outcomeStatus, 'BOUND'));
test('campaign exercises unknown outcome', () => assert.equal(campaign.episodes.find((e) => e.id === 'UNKNOWN_OUTCOME').outcomeStatus, 'UNKNOWN'));
test('campaign exercises invalid or ineligible experience', () => assert.equal(campaign.episodes.find((e) => e.id === 'INVALID_INELIGIBLE').eligibilityStatus, 'INELIGIBLE'));
test('campaign exercises instrumentation failure', () => assert.equal(campaign.episodes.find((e) => e.id === 'CALIBRATION_FAILURE').status, 'PARTIAL_EVIDENCE'));
test('campaign exercises counterfactual evidence', () => assert.ok(campaign.episodes.find((e) => e.id === 'COUNTERFACTUAL').counterfactualCount > 0));
test('campaign exercises human override', () => assert.equal(campaign.episodes.find((e) => e.id === 'HUMAN_OVERRIDE').humanOverride, true));
test('campaign identity excludes performance', () => assert.equal(campaign.visualizationExcludedFromIdentity, true));
test('campaign performs no model training', () => assert.equal(campaign.modelTrainingPerformed, false));
test('observatory contract is deterministic', () => assert.equal(ASCII_OBSERVATORY_CONTRACT_HASH, sha256(ASCII_OBSERVATORY_CONTRACT)));
test('observatory exposes all seven required views', () => assert.equal(Object.keys(ObservatoryView).length, 7));
test('bounded telemetry drops oldest frame without blocking', () => { const p = createBoundedTelemetryProducer({ capacity: 1 }); p.offer({ n: 1 }); p.offer({ n: 2 }); assert.deepEqual(p.snapshot().stats, { capacity: 1, size: 1, offered: 2, dropped: 1, rejected: 0, connected: true }); });
test('disconnected telemetry drops instead of blocking', () => { const p = createBoundedTelemetryProducer(); p.disconnect(); assert.equal(p.offer({ n: 1 }), false); assert.equal(p.snapshot().stats.dropped, 1); });
test('malformed telemetry is rejected', () => { const p = createBoundedTelemetryProducer(); assert.equal(p.offer({ bad: () => true }), false); assert.equal(p.snapshot().stats.rejected, 1); });
test('read-only observatory has no prohibited method surface', () => { const o = createReadOnlyAsciiObservatory(createBoundedTelemetryProducer()); for (const key of ASCII_OBSERVATORY_CONTRACT.prohibitedCapabilities) assert.equal(key in o, false); });
for (const view of Object.values(ObservatoryView)) test(`observatory renders ${view}`, () => { const p = createBoundedTelemetryProducer(); const { completed } = run({ telemetrySink: p }); p.offer({ ...p.snapshot().frames.at(-1), degradation: completed.degradation }); assert.match(createReadOnlyAsciiObservatory(p).render({ view }), /SENTINEL ASCII OBSERVATORY/); });
test('full-id mode does not truncate trace identity', () => { const p = createBoundedTelemetryProducer(); run({ telemetrySink: p }); const id = p.snapshot().frames.at(-1).trace.traceId; assert.ok(createReadOnlyAsciiObservatory(p).render({ view: 'TRACE', fullIds: true }).includes(id)); });
test('rendering telemetry cannot mutate governed frame', () => { const p = createBoundedTelemetryProducer(); run({ telemetrySink: p }); const before = stableStringify(p.snapshot()); createReadOnlyAsciiObservatory(p).render({ view: 'WORLD' }); assert.equal(stableStringify(p.snapshot()), before); });
test('conflicted health is visibly rendered', () => assert.match(renderAsciiObservatoryFrame({ logicalTime: 1, degradation: { status: 'CONFLICTED', failures: [] }, authority: {} }, { view: 'METRICS' }), /CONFLICTED/));
test('observatory injection failure cannot stop incumbent', () => { const s = fixture(); const p = createBoundedTelemetryProducer(); const started = beginIntegratedLiveShadowStep({ state: s, candidateRecommendation: candidate(s), telemetrySink: p, failureInjection: ['OBSERVATORY'] }); assert.equal(started.nextState.sequence, 1); });
test('ledger failure cannot stop incumbent', () => { const s = fixture(); const started = beginIntegratedLiveShadowStep({ state: s, candidateRecommendation: candidate(s), failureInjection: ['LEDGER'] }); assert.equal(started.nextState.sequence, 1); assert.equal(started.ledger, null); });
test('experience failure cannot stop incumbent', () => { const s = fixture(); const started = beginIntegratedLiveShadowStep({ state: s, candidateRecommendation: candidate(s), failureInjection: ['EXPERIENCE'] }); assert.equal(started.nextState.sequence, 1); assert.equal(started.experience, null); });
test('performance summaries provide mean p95 and p99', () => assert.deepEqual(summarizeTimings([{ x: 1 }, { x: 3 }]).x, { meanMs: 2, p95Ms: 3, p99Ms: 3 }));
test('campaign reports required performance stages', () => { for (const key of ['worldState', 'trace', 'calibration', 'ledger', 'experience', 'total']) assert.ok(campaign.performance[key]); });
test('public API exports integrated contract', () => assert.equal(publicApi.INTEGRATED_LIVE_SHADOW_CONTRACT_HASH, INTEGRATED_LIVE_SHADOW_CONTRACT_HASH));
test('public API exports observatory contract', () => assert.equal(publicApi.ASCII_OBSERVATORY_CONTRACT_HASH, ASCII_OBSERVATORY_CONTRACT_HASH));
