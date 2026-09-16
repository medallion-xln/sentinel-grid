import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';

import {
  STAGE3F6C_METHODOLOGY, auroc, evaluatePartition, fitLogisticRegression, highConfidenceWrong,
  routerHash, scoreMatrix, selectTiers, wilsonLower,
} from '../src/stage3f/deployable-router-v1.js';
import {
  DEPLOYABLE_FEATURES, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile, FeatureValueStatus,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { CANDIDATE_ROUTER_OBSERVATORY_CONTRACT, renderCandidateRouterFrame } from '../src/stage3f/deployable-router-observatory-v1.js';
import { ObservationDegradation, degradeObservation } from '../src/stage3f/prediction-reliability-v1.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { sha256 } from '../src/core/determinism.js';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const hex = (value) => createHash('sha256').update(value).digest('hex');
const CORPUS = 'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz';
const MANIFEST = 'artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json';

const corpusReady = existsSync(file(CORPUS)) && existsSync(file(MANIFEST));
const manifest = corpusReady ? JSON.parse(readFileSync(file(MANIFEST), 'utf8')) : null;
const rows = corpusReady ? gunzipSync(readFileSync(file(CORPUS))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const rowsOf = (name) => rows.filter((row) => row.partition === name);

const CORE_KEYS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
const matrixOf = (subset, keys, field) => subset.map((row) => keys.map((key) => row[field][key]));
const labelsOf = (subset) => subset.map((row) => row.y);

const stage3f6s = JSON.parse(readFileSync(file('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'), 'utf8'));
const stage3f6r = JSON.parse(readFileSync(file('artifacts/stage3f6r-runtime-parity-remediation/stage3f6r-certification-result.json'), 'utf8'));
const certifierSource = readFileSync(file('scripts/certify-stage3f6c-deployable-router.mjs'), 'utf8');
const generatorSource = readFileSync(file('scripts/generate-stage3f6c-corpus.mjs'), 'utf8');

/* ---------------- A. fresh dataset integrity ---------------- */

test('1. fresh split topology overlap is zero', () => {
  assert.ok(corpusReady, 'confirmatory corpus must be generated first (npm run stage3f6c:generate)');
  for (const [pair, value] of Object.entries(manifest.topologyOverlap)) assert.equal(value, 0, pair);
  const topologyToPartition = new Map();
  for (const row of rows) {
    const bound = topologyToPartition.get(row.topologyHash);
    if (bound !== undefined) assert.equal(bound, row.partition, `topology ${row.topologyHash} spans partitions`);
    topologyToPartition.set(row.topologyHash, row.partition);
  }
});

test('2. record overlap is zero', () => {
  assert.equal(manifest.recordOverlap, 0);
  assert.equal(new Set(rows.map((row) => row.recordHash)).size, rows.length);
});

test('3. state overlap is zero', () => {
  assert.equal(manifest.stateOverlap, 0);
  assert.equal(new Set(rows.map((row) => row.worldHash)).size, rows.length);
});

test('3b. fresh seed space is disjoint from every prior stage', () => {
  const prior = [1, 2, 3, 11, 201, 202, 203, 211];
  for (const seed of [...manifest.spec.seeds, ...manifest.spec.oodSeeds]) {
    assert.equal(prior.includes(seed), false, `seed ${seed} was already used by a prior stage`);
  }
});

test('3c. corpus content hash matches the manifest', () => {
  const content = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  assert.equal(hex(content), manifest.contentHash);
});

test('3d. action identity binds correctly: no valid selector action fails as UNKNOWN_ACTION_ID', () => {
  // Regression guard for the defect that invalidated the first evaluation: the 64-character runtime
  // action key was scored against records that store a 16-character prefix, so every non-abstaining
  // selector answer was rejected and silently counted as wrong.
  const proposing = rows.filter((row) => row.selectorAbstained === 0);
  const unscored = proposing.filter((row) => row.fallbackScored === 0);
  assert.ok(proposing.length > 0, 'the selector never proposed an action; this guard would be vacuous');
  assert.equal(unscored.length, 0,
    `${unscored.length} of ${proposing.length} valid selector actions failed to score (UNKNOWN_ACTION_ID)`);
  for (const row of rows) {
    if (row.fallbackScored === 1) assert.notEqual(row.fallbackRegret, null, row.recordHash);
  }
});

test('3e. the simulator profile stores the satisfiable subset and names what is excluded', () => {
  const declared = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_SIMULATOR].featureIds;
  assert.equal(declared.length, 46);
  const sample = rows[0];
  assert.ok(sample.simulator, 'simulator features were dropped entirely instead of stored as a subset');
  const stored = Object.keys(sample.simulator).sort();
  const excluded = declared.filter((id) => !stored.includes(id)).sort();
  assert.equal(stored.length, 43);
  assert.deepEqual(excluded, [
    'oneStep.bestActionObjectiveProgressDelta',
    'oneStep.bestActionOptionValueDelta',
    'oneStep.bestActionTerminalOutcome',
  ]);
  // Excluded features are named, never zero-filled.
  for (const id of excluded) assert.equal(Object.hasOwn(sample.simulator, id), false, id);
  assert.deepEqual([...sample.simulatorMissing].sort(), excluded);
  // Every row must agree on the satisfiable subset, or the ablation would train on a ragged matrix.
  for (const row of rows.slice(0, 200)) assert.equal(Object.keys(row.simulator).length, 43, row.recordHash);
});

/* ---------------- B. feature contract binding ---------------- */

test('4. feature contract hash matches Stage 3F.6-S', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT_HASH, stage3f6s.contract.hash);
  assert.equal(manifest.deployableContractHash, DEPLOYABLE_FEATURE_CONTRACT_HASH);
});

test('5. CORE uses exactly the certified CORE features', () => {
  assert.equal(CORE_KEYS.length, 30);
  for (const row of rows.slice(0, 50)) {
    assert.deepEqual(Object.keys(row.core).sort(), CORE_KEYS, `row ${row.recordHash} carries a different CORE feature set`);
  }
  const model = fitLogisticRegression(matrixOf(rowsOf('DEV').slice(0, 200), CORE_KEYS, 'core'),
    labelsOf(rowsOf('DEV').slice(0, 200)), CORE_KEYS);
  assert.deepEqual(model.keys, CORE_KEYS);
});

test('6. no multi-step rollout feature is present in any profile', () => {
  for (const entry of DEPLOYABLE_FEATURES) assert.equal(entry.multiStepRollout, false, entry.featureId);
  for (const featureId of CORE_KEYS) {
    const definition = DEPLOYABLE_FEATURES.find((entry) => entry.featureId === featureId);
    assert.equal(definition.multiStepRollout, false, featureId);
  }
});

test('7. no V2B feature appears in CORE', () => {
  for (const featureId of CORE_KEYS) {
    const definition = DEPLOYABLE_FEATURES.find((entry) => entry.featureId === featureId);
    assert.equal(definition.requiredCapabilities.includes('EXPERT_V2B'), false, featureId);
  }
});

test('8. no simulator feature appears in CORE', () => {
  for (const featureId of CORE_KEYS) {
    const definition = DEPLOYABLE_FEATURES.find((entry) => entry.featureId === featureId);
    assert.equal(definition.requiredCapabilities.includes('SIMULATOR_ONE_STEP'), false, featureId);
  }
});

/* ---------------- C. training discipline ---------------- */

test('9. training data never intersects HOLDOUT or OOD', () => {
  const trainingHashes = new Set([...rowsOf('DEV'), ...rowsOf('CAL')].map((row) => row.recordHash));
  for (const row of [...rowsOf('HOLDOUT'), ...rowsOf('OOD')]) {
    assert.equal(trainingHashes.has(row.recordHash), false, `sealed record ${row.recordHash} appears in training`);
  }
  const trainingTopologies = new Set([...rowsOf('DEV'), ...rowsOf('CAL')].map((row) => row.topologyHash));
  for (const row of [...rowsOf('HOLDOUT'), ...rowsOf('OOD')]) {
    assert.equal(trainingTopologies.has(row.topologyHash), false, 'a sealed topology appears in training');
  }
});

test('10. the threshold is selected on CAL only', () => {
  assert.equal(STAGE3F6C_METHODOLOGY.thresholdSelectedOn, 'CAL_ONLY');
  assert.match(certifierSource, /const calTiers = selectTiers\(calScores, calLabels\)/);
  assert.match(certifierSource, /chooseOperatingPoint\(calTiers\)/);
  // The tier rule may not be relaxed to manufacture achievability.
  const scores = new Array(400).fill(0.95);
  const labels = scores.map((unused, i) => (i % 4 === 0 ? 0 : 1));
  assert.equal(selectTiers(scores, labels)['0.99'].achievable, false);
});

test('11+12. sealed partitions are unreachable until the evaluation freeze exists', () => {
  assert.match(certifierSource, /SEALED_PARTITION_ACCESS_BEFORE_FREEZE/);
  assert.match(certifierSource, /if \(SEALED\.has\(name\) && evaluationFreeze === null\)/);
  const freezeIndex = certifierSource.indexOf('evaluationFreeze = { ...freezePayload');
  const holdoutIndex = certifierSource.indexOf("partitionRows('HOLDOUT')");
  const oodIndex = certifierSource.indexOf("partitionRows('OOD')");
  assert.ok(freezeIndex > 0 && holdoutIndex > freezeIndex, 'HOLDOUT is opened before the freeze is written');
  assert.ok(oodIndex > freezeIndex, 'OOD is opened before the freeze is written');
});

test('13. training replay is deterministic', () => {
  const dev = rowsOf('DEV').slice(0, 300);
  const matrix = matrixOf(dev, CORE_KEYS, 'core');
  const labels = labelsOf(dev);
  const a = fitLogisticRegression(matrix, labels, CORE_KEYS);
  const b = fitLogisticRegression(matrix, labels, CORE_KEYS);
  assert.deepEqual(a.w, b.w);
  assert.equal(routerHash(a), routerHash(b));
  assert.equal(scoreMatrix(a, matrix)[0], scoreMatrix(b, matrix)[0]);
});

test('14. the candidate hash is deterministic and content-addressed', () => {
  const dev = rowsOf('DEV').slice(0, 300);
  const model = fitLogisticRegression(matrixOf(dev, CORE_KEYS, 'core'), labelsOf(dev), CORE_KEYS);
  const candidate = { profile: DeployableProfile.DEPLOYABLE_CORE, routerHash: routerHash(model), threshold: 0.9 };
  assert.equal(sha256(candidate), sha256({ threshold: 0.9, routerHash: routerHash(model), profile: DeployableProfile.DEPLOYABLE_CORE }));
  const altered = sha256({ ...candidate, threshold: 0.91 });
  assert.notEqual(sha256(candidate), altered);
});

/* ---------------- D. behaviour under degradation ---------------- */

const sampleDecisions = (count) => {
  const out = [];
  for (const row of rowsOf('HOLDOUT').slice(0, count * 3)) {
    if (out.length >= count) break;
    const built = buildRecordV2({ shape: row.combination.shape, roles: row.combination.roles,
      objectives: row.combination.objectives, horizonBand: row.combination.horizonBand,
      level: row.combination.level, seed: row.combination.seed }, row.combination.ood);
    if (!built.admitted) continue;
    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const legalActions = forgeLegalActions(state.world).map((action, index) => ({
      actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
      parameters: action.parameters, descriptorIndex: index,
    }));
    out.push({ row, observation, legalActions });
  }
  return out;
};
const coreValues = (observation, legalActions) => {
  const extracted = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  if (CORE_KEYS.some((key) => extracted.features[key].status !== FeatureValueStatus.AVAILABLE)) return null;
  return CORE_KEYS.map((key) => {
    const value = extracted.features[key].value;
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
  });
};

test('15. degradation changes the CORE router score measurably', () => {
  const dev = rowsOf('DEV');
  const model = fitLogisticRegression(matrixOf(dev, CORE_KEYS, 'core'), labelsOf(dev), CORE_KEYS);
  const decisions = sampleDecisions(4);
  assert.ok(decisions.length > 0, 'no decision could be rebuilt');
  let moved = 0;
  for (const decision of decisions) {
    const base = coreValues(decision.observation, decision.legalActions);
    const degraded = coreValues(degradeObservation(decision.observation, ObservationDegradation.REMOVE_RESOURCE_SIGNALS),
      decision.legalActions);
    if (base === null || degraded === null) continue;
    if (scoreMatrix(model, [base])[0] !== scoreMatrix(model, [degraded])[0]) moved += 1;
  }
  assert.ok(moved > 0, 'removing resource signals moved no CORE router score');
});

test('16. the spatial blind spot is still reported, not silently fixed', () => {
  const decisions = sampleDecisions(4);
  for (const decision of decisions) {
    const base = coreValues(decision.observation, decision.legalActions);
    const degraded = coreValues(degradeObservation(decision.observation, ObservationDegradation.HIDE_SPATIAL_INFORMATION),
      decision.legalActions);
    if (base === null || degraded === null) continue;
    assert.deepEqual(degraded, base, 'spatial degradation changed a CORE feature; the declared blind spot is stale');
  }
  const spatial = stage3f6s.worldStateCoverageAudit.spatial;
  assert.equal(spatial.REQUIRED_FOR_DEPLOYABLE_FEATURES, false);
});

/* ---------------- E. reliability accounting ---------------- */

test('17. high-confidence-wrong is tracked at 0.90, 0.95 and 0.99', () => {
  const tracked = highConfidenceWrong([0.99, 0.96, 0.91, 0.5], [0, 1, 0, 1]);
  assert.deepEqual(Object.keys(tracked), ['0.9', '0.95', '0.99']);
  assert.equal(tracked['0.99'].n, 1);
  assert.equal(tracked['0.99'].wrong, 1);
  assert.equal(tracked['0.9'].n, 3);
  assert.match(certifierSource, /highConfidenceWrong\(scores, labels\)/);
});

test('18. false-safe harm is tracked separately and compared to the fallback', () => {
  const evaluated = evaluatePartition({
    scores: [0.99, 0.99, 0.2], labels: [0, 1, 0], tau: 0.9,
    greedyOk: [0, 1, 0], greedyRegret: [40, 0, 10],
    fallbackOk: [1, 0, 1], fallbackRegret: [5, 20, 0],
  });
  assert.equal(evaluated.routedN, 2);
  assert.equal(evaluated.falseSafe, 1);
  assert.equal(evaluated.falseSafeHarm.n, 1);
  assert.equal(evaluated.falseSafeHarm.meanRegret, 40);
  assert.equal(evaluated.falseSafeHarm.worst, 40);
  assert.equal(evaluated.falseSafeHarm.fallbackWouldHaveRegret, 5);
  assert.equal(evaluated.falseSafeHarm.harmVersusFallback, 35);
  assert.equal(evaluated.precision, 0.5);
  assert.ok(Math.abs(evaluated.wilsonLower - wilsonLower(1, 2)) < 1e-12);
});

test('18b. AUROC and Wilson agree with independently known values', () => {
  assert.equal(auroc([0.1, 0.2, 0.3, 0.4], [0, 0, 1, 1]), 1);
  assert.equal(auroc([0.5, 0.5], [0, 1]), 0.5);
  assert.equal(+wilsonLower(200, 200).toFixed(4), 0.9812);
  assert.equal(wilsonLower(0, 0), 0);
});

/* ---------------- F. predecessors, authority, promotion ---------------- */

test('19. Stage 3F.6-S remains intact', () => {
  assert.equal(stage3f6s.status, 'PASS');
  assert.equal(stage3f6s.contract.hash, DEPLOYABLE_FEATURE_CONTRACT_HASH);
  assert.equal(stage3f6s.contract.featureCount, 51);
  assert.equal(DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureCount, 30);
});

test('20. Stage 3F.6-R remains intact', () => {
  assert.equal(stage3f6r.status, 'PASS');
  assert.equal(stage3f6r.featureParity.summary.multiStepFrozenFeatureCount, 7);
  assert.equal(stage3f6r.featureParity.summary.v2bDependentFeatureCount, 5);
});

test('21. authority stays R0 and non-dispatching', () => {
  assert.equal(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.authority.tier, 'R0');
  assert.equal(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.authority.canDispatch, false);
  assert.equal(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.authority.canMutateLiveWorld, false);
  assert.match(certifierSource, /canDispatch: false/);
  assert.match(certifierSource, /canMutateLiveWorld: false/);
});

test('22. no online learning is enabled anywhere in this stage', () => {
  assert.match(certifierSource, /onlineLearningEnabled: false/);
  assert.equal(/onlineLearningEnabled:\s*true/.test(certifierSource), false);
  assert.equal(/onlineLearningEnabled:\s*true/.test(generatorSource), false);
});

test('23. the candidate router is never promoted to the live runtime', () => {
  assert.equal(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.promotedToLiveRuntime, false);
  assert.equal(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.replacesIncumbentRouter, false);
  assert.equal(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.shadowOnly, true);
  assert.match(certifierSource, /promotedToLiveRuntime: false/);
  assert.equal(/promotedToLiveRuntime:\s*true/.test(certifierSource), false);
  const frame = renderCandidateRouterFrame({ profile: DeployableProfile.DEPLOYABLE_CORE, candidateHash: 'a'.repeat(64),
    contractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH, featureCount: 30, score: 0.95, threshold: 0.9, profileSatisfied: true });
  assert.match(frame, /shadow only\s+true/);
  assert.match(frame, /promoted to runtime\s+false/);
  assert.match(frame, /INCUMBENT SOLE EXECUTOR/);
});

test('23b. the V2B profile is reported unavailable rather than substituted', () => {
  assert.match(certifierSource, /result: 'NOT_AVAILABLE'/);
  assert.match(certifierSource, /No other model was substituted for V2B/);
});
