#!/usr/bin/env node
/* STAGE 3F.6 — Prediction Reliability Baseline certification.
 *
 * Measurement only. Order is enforced, not conventional:
 *   predecessors -> corpus integrity -> partitions/leakage -> Layer B runtime episodes + frozen snapshot
 *   -> DEV/CAL design -> EVALUATION FREEZE (written) -> sealed HOLDOUT/OOD evaluation -> diagnosis -> artifact.
 * Nothing trains, fits, updates weights, retrains the router, dispatches, or mutates a world.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { sha256 } from '../src/core/determinism.js';
import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { FORGE_OBSERVER_ID, forgeWorldAdapter } from '../src/forge/adapter.js';
import {
  INTEGRATED_LIVE_SHADOW_CONTRACT, createForgeIntegratedCalibration, evaluateIntegratedStage3ERouter,
  extractIntegratedStage3EFeatures, projectIntegratedTelemetry,
} from '../src/stage3f/integrated-live-shadow-v1.js';
import {
  ExperiencePurpose, SHADOW_EXPERIENCE_CONTRACT_HASH, appendExperienceToBuffer, createShadowExperienceBuffer,
  evaluateExperienceEligibility, freezeExperienceSnapshot, verifyFrozenExperienceSnapshot,
} from '../src/stage3f/shadow-experience-buffer-v1.js';
import { ObservatoryView, createBoundedTelemetryProducer, createReadOnlyAsciiObservatory } from '../src/stage3f/ascii-observatory-v1.js';
import {
  PREDICTION_OBSERVATORY_CONTRACT, PREDICTION_OBSERVATORY_CONTRACT_HASH, PredictionObservatoryView, createPredictionObservatory,
} from '../src/stage3f/prediction-observatory-v1.js';
import * as P from '../src/stage3f/prediction-reliability-v1.js';
import * as E from '../src/stage3f/prediction-reliability-episode-v1.js';
import { buildCorpusCase } from './generate-stage3f6-evaluation-corpus.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const outDir = path.join(root, 'artifacts', 'stage3f6-prediction-reliability');
const files = {
  result: path.join(outDir, 'stage3f6-certification-result.json'), freeze: path.join(outDir, 'stage3f6-evaluation-freeze.json'),
  manifest: path.join(outDir, 'evaluation-corpus-manifest.json'), corpus: path.join(outDir, 'evaluation-corpus.jsonl.gz'),
};
const stage3eDir = path.join(root, 'artifacts', 'stage3e-routability-intelligence');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const M = P.STAGE3F6_METHODOLOGY; const TAU = M.stage3eFrozenTau; const FLOOR = M.evidenceFloor;
const hex = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = async (relative) => hex(await readFile(path.join(root, relative)));
const r4 = (value) => (value === null || value === undefined || Number.isNaN(value) ? null : Number(Number(value).toFixed(4)));
const ratio = (k, n) => (n === 0 ? null : r4(k / n));
const mean = (values) => { const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const log = (message) => process.stderr.write(`[stage3f6] ${message}\n`);
const countBy = (items, key) => sortedObject(items.reduce((acc, item) => { const k = key(item); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {}));
function sortedObject(object) { return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b))); }
const orderedBy = (prefix, list) => list.map((entry) => [hex(`${prefix}${entry.recordHash}`), entry]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, entry]) => entry);
const provenance = (calibration, sourceId, evidenceId) => ({ environmentId: calibration.environmentIdentity.environmentId,
  environmentVersion: calibration.environmentIdentity.environmentVersion, sourceId, evidenceId });

let stored = null; let storedFreeze = null;
if (checkOnly) { stored = JSON.parse(await readFile(files.result, 'utf8')); storedFreeze = JSON.parse(await readFile(files.freeze, 'utf8')); }

/* ------------------------------------------------------------------ 1. predecessors */
log('predecessor integrity');
const recovery = await certifyRecoveredStage3DE();
function predecessor(script) {
  const result = spawnSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  try { return result.status === 0 && JSON.parse(result.stdout).reproduced === true; } catch { return false; }
}
const predecessorChecks = skipPredecessors ? { skipped: true } : {
  stage3e: recovery.status === 'PASS',
  stage3f0: predecessor('scripts/certify-stage3f0-world-state-contract.mjs'),
  stage3f1: predecessor('scripts/certify-stage3f1-causal-trace.mjs'),
  stage3f2: predecessor('scripts/certify-stage3f2-environment-calibration.mjs'),
  stage3f3: predecessor('scripts/certify-stage3f3-counterfactual-veto-ledger.mjs'),
  stage3f4: predecessor('scripts/certify-stage3f4-shadow-experience-buffer.mjs'),
  stage3f5: predecessor('scripts/certify-stage3f5-integrated-live-shadow.mjs'),
};
const predecessorsIntact = !skipPredecessors && Object.values(predecessorChecks).every((value) => value === true);
const recoveryFailures = recovery.failures.map((entry) => entry.name).sort();
/* Canonical source policy: certification reads in-repo evidence only. Candidate identity comes from the committed
 * manifest; adapter-byte verification is opt-in and non-gating. The historical drift diagnosis that motivated this
 * rule is preserved inside the frozen Stage 3F.6 PARTIAL artifact and is never recomputed from a session path. */
const environmentDiagnosis = {
  canonicalSourcePolicy: 'REPOSITORY_ONLY', ephemeralPathConsulted: false,
  candidateIdentitySource: 'training/stage3cr3/identity/candidate-manifest-v2b.json',
  canonicalManifestBound: recovery.adapter.manifestCompositeHash === recovery.hashes.stage3dV2bCandidate,
  adapterByteVerification: recovery.adapter.status, adapterVerificationGating: recovery.adapter.gating,
  recoveryStatus: recovery.status, recoveryFailures,
  inRepoCanonicalPayloadByteIdentical: recovery.preservation?.canonicalPayloadByteIdentical ?? null,
  diagnosis: recovery.status === 'PASS' ? 'NO_ENVIRONMENT_DRIFT' : 'PREDECESSOR_FAILURE_SEE_RECOVERY_FAILURES',
};

/* ------------------------------------------------------------------ 2. corpus + frozen Stage 3E labels */
log('corpus integrity');
const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
const corpusText = gunzipSync(await readFile(files.corpus)).toString('utf8');
const corpusDigest = `sha256:${hex(corpusText)}`;
const entries = corpusText.trim().split('\n').map((line) => JSON.parse(line));
const splitSpec = JSON.parse(await readFile(path.join(stage3eDir, 'split-spec.json'), 'utf8'));
const stage3eFreeze = JSON.parse(await readFile(path.join(stage3eDir, 'freeze-3e.json'), 'utf8')).STAGE3E_ROUTER;
const model = JSON.parse(await readFile(path.join(stage3eDir, 'lr-model.json'), 'utf8'));
const labels = new Map(); const matrixIndex = new Map();
for (const split of P.STAGE3E_SPLITS) {
  for (const row of JSON.parse(await readFile(path.join(stage3eDir, 'replay-fixtures', `matrix-${split}.json`), 'utf8'))) {
    labels.set(row.recordHash, row); matrixIndex.set(row.recordHash, { split, f: row.f });
  }
}
const replaySample = Object.values(P.Stage3F6Partition).flatMap((partition) => orderedBy('STAGE3F6_REPLAY:', entries.filter((entry) => entry.partition === partition)).slice(0, 8));
const replayMismatches = replaySample.filter((entry) => {
  const rebuilt = buildCorpusCase({ combination: { ...entry.combination, seed: Number(entry.combination.seed) }, ood: entry.ood }, matrixIndex);
  return rebuilt.status !== 'MATCHED' || P.stableStringify(rebuilt.entry) !== P.stableStringify(entry);
}).map((entry) => entry.recordHash);
const recordV2Source = await readFile(path.join(root, 'src', 'forge', 'record-v2.js'), 'utf8');
const featuresV2Source = await readFile(path.join(root, 'training', 'stage3e-recovered', 'features-v2.mjs'), 'utf8');
const corpusChecks = {
  digestMatchesManifest: corpusDigest === manifest.corpusDigest,
  everyStage3ESplitCaseRecovered: entries.length === labels.size && entries.every((entry) => labels.has(entry.recordHash)),
  perSplitCountsMatchStage3E: P.STAGE3E_SPLITS.every((split) => entries.filter((entry) => entry.split === split).length === splitSpec.splits[split].n),
  admittedCountMatchesStage3ECorpus: manifest.counts.generated - manifest.counts.REJECTED === splitSpec.totalCases,
  generatorSourceBound: manifest.generatorSourceSha256 === await fileHash('scripts/generate-stage3f6-evaluation-corpus.mjs'),
  corpusModuleSourceBound: manifest.corpusModuleSourceSha256 === await fileHash('src/stage3f/prediction-reliability-corpus-v1.js'),
  deterministicReplaySample: replayMismatches.length === 0, replaySampleN: replaySample.length,
  labelsNotInCorpus: manifest.labelsIncluded === false,
};
const structuralFindings = {
  contractGreedyRewardFeaturesReadHorizonTotals: /rewardVector:\s*branch\.totalRewardVector/.test(recordV2Source)
    && /const rv=gB\?\.rewardVector\?\?\{\}/.test(featuresV2Source),
  contractGreedyRewardFeatureKeys: ['greedyOptionValue', 'greedyRiskExposure', 'greedyFuturePotential', 'greedyTerminalOutcome', 'greedyTimeCost', 'greedyResourceCost', 'greedyInfraHealth'],
  runtimeGreedyRewardFeaturesReadOneStepV1Vector: true,
  runtimeRouterEquation: P.RouterEquation.STAGE3F5_RUNTIME, stage3eModelEquation: P.RouterEquation.STAGE3E_CANONICAL,
};

/* ------------------------------------------------------------------ 3. partitions + leakage (identities only) */
const stage3eSplits = Object.fromEntries(Object.values(P.Stage3F6Partition).map((name) => [name, entries.filter((entry) => entry.partition === name)]));
const inheritedStage3ELeakage = P.checkPartitionLeakage(stage3eSplits);
const quarantine = P.quarantineDerivedVariants(stage3eSplits);
const partitions = quarantine.partitions;
const access = P.createPartitionAccess(partitions);
const stage3eAccess = P.createPartitionAccess(stage3eSplits, { namespace: 'STAGE3E_FULL_SPLIT_REPLAY' });
const identityLeakage = P.checkPartitionLeakage(partitions);

/* ------------------------------------------------------------------ 4. Layer B runtime episodes + frozen snapshot */
log('Layer B integrated-runtime episodes');
const calibration = createForgeIntegratedCalibration();
const layerB = Object.entries(M.layerB.quotas).flatMap(([name, quota]) => orderedBy('STAGE3F6_LAYER_B:', partitions[name]).slice(0, quota));
const runs = new Map(); const shards = []; let buffer = null; let inShard = 0; const integratedTotals = [];
for (const [index, entry] of layerB.entries()) {
  const built = buildRecordV2({ ...entry.combination, seed: Number(entry.combination.seed) }, entry.ood);
  if (!built.admitted || built.record.recordHash !== entry.recordHash) throw new Error(`LAYER_B_REBUILD_MISMATCH ${entry.recordHash}`);
  const run = E.runStage3F6Episode({ world: built.world, calibration });
  let experience = run.result?.experience ?? null;
  if (experience) {
    experience = evaluateExperienceEligibility(experience, { purpose: ExperiencePurpose.PREDICTION_CALIBRATION, calibration,
      logicalTime: run.result.outcomeTime, provenance: provenance(calibration, 'stage3f6-eligibility', `prediction-calibration-${experience.experienceId}`) });
  }
  buffer ??= createShadowExperienceBuffer({ bufferVersion: '3F.6.1' });
  if (experience) buffer = appendExperienceToBuffer(buffer, experience);
  runs.set(entry.recordHash, { entry, run: { pending: run.pending, result: run.result, incumbent: run.incumbent }, experienceId: experience?.experienceId ?? null,
    route: run.pending.router?.selectedRoute ?? 'UNKNOWN',
    eligibility: experience?.projection?.eligibilityByPurpose?.PREDICTION_CALIBRATION?.status ?? 'NO_EXPERIENCE',
    eligibilityReasons: experience?.projection?.eligibilityByPurpose?.PREDICTION_CALIBRATION?.reasons ?? ['NO_EXPERIENCE'] });
  integratedTotals.push(run.result?.metrics?.total ?? null);
  inShard += 1;
  if (inShard === M.layerB.shardSize || index === layerB.length - 1) {
    const snapshot = freezeExperienceSnapshot({ buffer, purpose: ExperiencePurpose.PREDICTION_CALIBRATION,
      calibrationConstraints: [{ environmentId: calibration.environmentIdentity.environmentId, calibrationId: calibration.calibrationId }],
      snapshotVersion: `3F.6.1-shard-${String(shards.length).padStart(2, '0')}` });
    verifyFrozenExperienceSnapshot(snapshot);
    shards.push({ snapshotId: snapshot.snapshotId, snapshotDigest: snapshot.snapshotDigest, experienceIds: snapshot.experienceIds,
      sourceBufferId: buffer.bufferId, sourceBufferDigest: buffer.bufferDigest, offered: inShard });
    buffer = null; inShard = 0;
  }
  if (index % 100 === 0) log(`  episode ${index}/${layerB.length}`);
}
const snapshotExperienceIds = new Set(shards.flatMap((shard) => shard.experienceIds));
const snapshotBody = {
  recordType: 'SENTINEL_STAGE3F6_EVALUATION_SNAPSHOT_V1', eligibilityProfile: ExperiencePurpose.PREDICTION_CALIBRATION,
  stage3f4ContractHash: SHADOW_EXPERIENCE_CONTRACT_HASH, shardSize: M.layerB.shardSize,
  shards: shards.map(({ experienceIds, ...rest }) => ({ ...rest, experienceN: experienceIds.length, experienceIdsDigest: `sha256:${hex(experienceIds.join('\n'))}` })),
  experienceN: snapshotExperienceIds.size, offeredN: layerB.length, sourceBufferId: shards[0].sourceBufferId,
  environmentIds: [calibration.environmentIdentity.environmentId], calibrationIds: [calibration.calibrationId],
  caseRecordHashesDigest: `sha256:${hex(layerB.map((entry) => entry.recordHash).sort().join('\n'))}`,
  modelTrainingPerformed: false,
};
const snapshotId = `sha256:${sha256(snapshotBody)}`;
const snapshotManifest = { ...snapshotBody, snapshotId, snapshotDigest: `sha256:${sha256({ ...snapshotBody, snapshotId })}` };
const includedRuns = [...runs.values()].filter((item) => snapshotExperienceIds.has(item.experienceId));

/* ------------------------------------------------------------------ 5. DEV/CAL design */
log('DEV/CAL design');
const dev = access.design('DEV'); const cal = access.design('CAL');
const devReference = P.standardizedMatrix(dev.map((entry) => labels.get(entry.recordHash).f), model);
const distances = new Map();
const calDistances = P.nearestReferenceDistances(P.standardizedMatrix(cal.map((entry) => labels.get(entry.recordHash).f), model), devReference);
cal.forEach((entry, index) => distances.set(entry.recordHash, calDistances[index]));
const noveltyThresholds = P.deriveNoveltyThresholds([...calDistances]);
const calEvals = cal.map((entry) => P.evaluateRouterCase(entry, labels.get(entry.recordHash), model));
const calPairs = {
  contract: calEvals.map((c) => ({ score: c.scoreContract, correct: c.y === 1 })),
  runtime: calEvals.map((c) => ({ score: c.scoreRuntime, correct: c.runtimeGreedyOptimal === true })),
};
const tierPoints = { contract: P.selectTierOperatingPoints(calPairs.contract), runtime: P.selectTierOperatingPoints(calPairs.runtime) };
const calStage3EReplay = P.selectiveReliability(stage3eAccess.design('CAL').map((entry) => ({ score: P.scoreStage3ERouter(labels.get(entry.recordHash).f, model), correct: labels.get(entry.recordHash).y === 1 })), TAU);
const runtimeEquationParitySample = calEvals.slice(0, 64).map((c, index) => {
  const values = { ...labels.get(cal[index].recordHash).f, ...(cal[index].runtimeFeatureDiff ?? {}) };
  return evaluateIntegratedStage3ERouter(values, { actionId: 'stage3f6-parity' }).score === c.scoreRuntime;
});
const inventory = [
  { classId: 'ROUTER_P_GREEDY_SAFE', category: 'expert safety / success', availability: 'AVAILABLE', producer: 'STAGE3E_ROUTER frozen logistic over 51 features',
    inputEvidence: 'Stage 3E Feature Contract v2 values', decisionTime: 'integrated logicalTime (state.sequence*10) before incumbent execution',
    confidence: 'AVAILABLE', uncertainty: 'NOT_AVAILABLE (MODEL_SCORE_NOT_CAUSAL_CERTAINTY)', outcomeBinding: 'GREEDY_SAFE: greedy action in authoritative Forge counterfactual horizon-optimal set',
    calibrationDomain: ['ACTION_SEMANTICS'], sampleCount: entries.length },
  { classId: 'DECISION_TIME_ONE_STEP_CONSEQUENCE', category: 'action consequence; resource change; risk; objective progress; temporal consequence', availability: 'AVAILABLE',
    producer: 'STAGE3F5_EXACT_STAGE3E_FEATURE_ADAPTER branch lookahead (forgeWorldAdapter.step on decision-state copies)', privilegedSimulatorAccess: true,
    inputEvidence: 'authoritative decision state, not the observation', decisionTime: 'feature derivation before execution',
    confidence: 'NOT_AVAILABLE', uncertainty: 'NOT_AVAILABLE', outcomeBinding: 'executed transition reward vector', calibrationDomain: P.DOMAIN_CALIBRATION_REQUIREMENT, sampleCount: layerB.length },
  { classId: 'CANDIDATE_ACTION_RECOMMENDATION', category: 'expert success', availability: 'AVAILABLE', producer: 'NEXUS_RELATIONAL_SELECTOR_V1 else HEURISTIC_GREEDY_IMMEDIATE',
    confidence: 'DEGENERATE_CONSTANT_0.5', uncertainty: 'UNQUANTIFIED', outcomeBinding: 'candidate action in horizon-optimal set', calibrationDomain: ['ACTION_SEMANTICS'], sampleCount: entries.length },
  { classId: 'SENTINEL_RECOMMENDATION', category: 'routing recommendation', availability: 'AVAILABLE', producer: 'sentinel-shadow recommendation evidence',
    confidence: 'router score; null when abstained', abstention: 'abstains when router selects V2B without genuine V2B evidence', sampleCount: layerB.length },
  { classId: 'NEXT_WORLD_STATE', category: 'next-state prediction', availability: 'NOT_AVAILABLE', reason: 'counterfactual predictedStateRef=UNRESOLVED_PREDICTED_STATE; lookahead states are discarded, not retained as evidence' },
  { classId: 'FAILURE_PROBABILITY', category: 'failure probability', availability: 'NOT_AVAILABLE', reason: 'no probabilistic producer; only the deterministic one-step terminalFailure component' },
  { classId: 'TRANSITION_RESULT_STATE_IDENTITY', category: 'transition result', availability: 'NOT_AVAILABLE', reason: 'resulting state identity not retained in runtime branch evidence' },
  { classId: 'COUNTERFACTUAL_OUTCOME_VALUE_RISK', category: 'counterfactual consequence', availability: 'NOT_AVAILABLE', reason: 'ledger predictedValue=null, predictedRisk=null, predictedOutcome=PREDICTED_NOT_OBSERVED' },
  { classId: 'MULTISTEP_PREDICTION', category: 'temporal consequence H>=2', availability: 'NOT_AVAILABLE', reason: 'no H2+ producer in the integrated runtime' },
  { classId: 'NEXUS_STRUCTURAL_CONFIDENCE', category: 'expert confidence', availability: 'INSUFFICIENT_EVIDENCE', reason: 'measures observed structure, not correctness; semantically incompatible with success calibration' },
  { classId: 'LEARNED_NEXUS_V2B_OUTPUT', category: 'expert success', availability: 'NOT_AVAILABLE', reason: 'no genuine V2B evidence at runtime; recommendation abstains' },
  { classId: 'REFERENCE_WORLD_STATE_BASELINE', category: 'next-state reference (not Sentinel)', availability: 'AVAILABLE', sentinelCapability: false, producer: M.worldStateBaseline.id, confidence: 'NOT_AVAILABLE', sampleCount: layerB.length },
];
const designDerived = {
  noveltyThresholds,
  tierOperatingPoints: Object.fromEntries(Object.entries(tierPoints).map(([pathName, points]) => [pathName,
    Object.fromEntries(Object.entries(points).map(([tier, point]) => [tier, { tau: point.tau, calN: point.cal?.n ?? null, calObserved: point.cal?.observed ?? null,
      calLower: point.cal?.lower ?? null, bestEvidencedCalPoint: point.bestEvidencedCalPoint }]))])),
  calStage3EReplay: { routedN: calStage3EReplay.n, precision: calStage3EReplay.observed, wilsonLower: calStage3EReplay.lower,
    matchesStage3EFreeze: calStage3EReplay.n === stage3eFreeze.calRoutedN && r4(calStage3EReplay.observed) === stage3eFreeze.calPrecision
      && r4(calStage3EReplay.lower) === stage3eFreeze.calWilsonLower },
  calRuntimeEquation: (() => { const point = P.selectiveReliability(calEvals.map((c) => ({ score: c.scoreEquationOnly, correct: c.y === 1 })), TAU);
    return { routedN: point.n, precision: point.observed, wilsonLower: point.lower }; })(),
  runtimeEquationParityWithStage3F5Evaluator: runtimeEquationParitySample.every(Boolean),
  identityLeakage,
};
const sealedExposureDisclosures = [
  { id: 'STAGE3E_PUBLISHED_SEALED_RESULTS', description: 'Stage 3E HOLDOUT/OOD router results are published Stage 3E artifacts and were read during inventory.', thresholdsOrMetricsChanged: false },
  { id: 'ROUTER_EQUATION_CONVENTION_VERIFICATION', description: 'While verifying the Stage 3F.5 runtime logistic equation against the frozen Stage 3E bias convention, routed n and precision at tau=0.9 were computed on CAL, HOLDOUT and OOD for both conventions before this freeze.',
    thresholdsOrMetricsChanged: false, designAddition: 'router-equation decomposition and RUNTIME_ROUTER_EQUATION_DIVERGENCE attribution basis', justificationPartition: 'CAL' },
  { id: 'DEVELOPMENT_RUN_INVALIDATED_AND_RESTARTED', invalidatedFreezeHash: '157ffde40f160488f19d348372b3a81fc4284c952384eb9a25dcff93126396b3',
    description: 'A development certification run evaluated HOLDOUT/OOD and exposed nonzero derived-variant (topologyHash) leakage inherited from the frozen Stage 3E splits. That run is invalidated. The restart adds only (1) topology quarantine of partition membership and (2) a report-only conditional false-safe concentration check beside the unchanged share-based diagnosis rule.',
    thresholdsOrMetricsChanged: false, diagnosisRuleChanged: false, exposedObservation: 'contract false-safe rate was higher in HIGH than in LOW proxy-fidelity states while the share rule selected C_PREDICTION_LIMITED' },
];

/* ------------------------------------------------------------------ 6. evaluation freeze */
const freeze = P.createEvaluationFreeze({ corpusDigest, snapshotManifest, partitionIdentities: { ...access.identities, ...stage3eAccess.identities },
  designDerived: { ...designDerived, quarantine: quarantine.quarantined, inheritedStage3ELeakage }, inventory, sealedExposureDisclosures });
const freezeReproduced = checkOnly ? storedFreeze.freezeHash === freeze.freezeHash : true;
if (!checkOnly) { await mkdir(outDir, { recursive: true }); await writeFile(files.freeze, `${JSON.stringify(freeze, null, 2)}\n`); }
log(`freeze ${freeze.freezeHash}`);

/* ------------------------------------------------------------------ 7. sealed evaluation */
const holdout = access.sealed('HOLDOUT', freeze); const ood = access.sealed('OOD', freeze);
log('sealed Layer A');
for (const list of [holdout, ood]) {
  const found = P.nearestReferenceDistances(P.standardizedMatrix(list.map((entry) => labels.get(entry.recordHash).f), model), devReference);
  list.forEach((entry, index) => distances.set(entry.recordHash, found[index]));
}
const allLabeled = [...dev, ...cal, ...holdout, ...ood];
const featureClasses = new Map(); const fullStateClasses = new Map();
for (const entry of allLabeled) {
  const label = labels.get(entry.recordHash);
  for (const [classes, key] of [[featureClasses, P.featureSignature(label.f, model)], [fullStateClasses, entry.worldHash]]) {
    const value = classes.get(key) ?? { n: 0, positive: 0 }; value.n += 1; value.positive += label.y === 1 ? 1 : 0; classes.set(key, value);
  }
}
const stochastic = (entry) => { const value = fullStateClasses.get(entry.worldHash); return value.positive > 0 && value.positive < value.n; };
const wsFacts = (entry) => ({
  'temporalState.tick': { value: entry.worldState.tick, category: 'OBSERVED' }, 'resources.actorEnergy': { value: entry.worldState.energy, category: 'OBSERVED' },
  'entities.count': { value: entry.worldState.entities, category: 'OBSERVED' }, 'relationships.count': { value: entry.worldState.relations, category: 'OBSERVED' },
  'objectives.count': { value: entry.worldState.objectives, category: 'OBSERVED' }, 'constraints.worldHash': { value: entry.worldHash, category: 'OBSERVED' },
});

function analyzeLayerA(name, list) {
  const items = list.map((entry) => { const label = labels.get(entry.recordHash); return { entry, label, c: P.evaluateRouterCase(entry, label, model) }; });
  const n = items.length;
  const pairs = {
    contract: items.map(({ c }) => ({ semanticClass: 'ROUTER_P_GREEDY_SAFE_CONTRACT', confidence: c.scoreContract, score: c.scoreContract, correct: c.y === 1 })),
    runtime: items.map(({ c }) => ({ semanticClass: 'ROUTER_P_GREEDY_SAFE_STAGE3F5_RUNTIME', confidence: c.scoreRuntime, score: c.scoreRuntime, correct: c.runtimeGreedyOptimal === true })),
    predictor: items.map(({ c }) => ({ semanticClass: 'PREDICTOR_EVIDENCE_CONSTANT_CONFIDENCE', confidence: 0.5, correct: c.candidateOptimal === true })),
  };
  const novelty = ({ entry }) => (name === 'DEV' ? 'REFERENCE' : P.noveltyBucket(distances.get(entry.recordHash), noveltyThresholds));
  const routedFalseSafe = (subset, pathName) => {
    const routed = subset.filter(({ c }) => (pathName === 'contract' ? c.routeContract : c.routeRuntime));
    const falseSafe = routed.filter(({ c }) => (pathName === 'contract' ? c.y === 0 : c.runtimeGreedyOptimal !== true)).length;
    const interval = P.wilsonInterval(routed.length - falseSafe, routed.length);
    return { n: subset.length, routed: routed.length, falseSafe, falseSafeRate: ratio(falseSafe, routed.length), reliability: interval.p, lower: interval.lower,
      evidenced: routed.length >= FLOOR.minBucketN, tierEvidenced: routed.length >= FLOOR.minTierN,
      meanConfidence: r4(mean(subset.map(({ c }) => (pathName === 'contract' ? c.scoreContract : c.scoreRuntime)))),
      abstentionRate: ratio(subset.length - routed.length, subset.length),
      misrouteRate: ratio(subset.filter(({ c }) => (pathName === 'contract' ? c.correctContract : c.correctRuntime) !== true).length, subset.length) };
  };
  const buckets = (key) => sortedObject(Object.fromEntries(Object.entries(items.reduce((acc, item) => { (acc[key(item)] ??= []).push(item); return acc; }, {}))
    .map(([bucket, subset]) => [bucket, { prevalence: ratio(subset.filter(({ c }) => c.y === 1).length, subset.length),
      brierContract: r4(mean(subset.map(({ c }) => (c.scoreContract - c.y) ** 2))),
      contract: routedFalseSafe(subset, 'contract'), runtime: routedFalseSafe(subset, 'runtime') }])));
  const reliable = ({ c }) => c.proxy.bucket === 'HIGH';
  const unreliable = ({ c }) => c.proxy.bucket === 'MEDIUM' || c.proxy.bucket === 'LOW';
  const complete = ({ entry }) => P.worldStateDomainCoverage(wsFacts(entry)).complete;
  const runtimeErrors = items.filter(({ c }) => c.routeRuntime && c.runtimeGreedyOptimal !== true);
  const runtimeAttribution = runtimeErrors.map(({ entry, label, c }) => P.attributeRuntimeFalseSafe(c, { unscorable: c.runtimeGreedyRegret === null,
    stochasticDuplicate: stochastic(entry), signatureClass: featureClasses.get(P.featureSignature(label.f, model)) }));
  const contractErrors = items.filter(({ c }) => c.contractFalseSafe);
  const contractAttribution = contractErrors.map(({ entry, label }) => P.attributeContractFalseSafe({ stochasticDuplicate: stochastic(entry),
    signatureClass: featureClasses.get(P.featureSignature(label.f, model)) }));
  const attributionTable = (list2, population) => {
    const counts = Object.fromEntries(Object.values(P.ErrorAttribution).map((category) => [category, 0]));
    for (const entry of list2) counts[entry.category] += 1;
    return { population, counts, rates: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, ratio(value, population)])),
      bases: countBy(list2, (entry) => `${entry.category}:${entry.basis}`) };
  };
  const runtimeCorrect = items.filter(({ c }) => c.correctRuntime === true);
  const routedRuntimeCorrect = items.filter(({ c }) => c.routeRuntime && c.correctRuntime === true);
  const ceilingCoverage = stage3eFreeze.calCoverage;
  return {
    partition: name, n, prevalence: ratio(items.filter(({ c }) => c.y === 1).length, n),
    calibration: { contract: P.calibrationReport(pairs.contract), runtime: P.calibrationReport(pairs.runtime), predictorConstant: P.calibrationReport(pairs.predictor) },
    highConfidenceWrong: { contract: P.highConfidenceWrong(pairs.contract), runtime: P.highConfidenceWrong(pairs.runtime) },
    selective: { contract: P.selectiveReliability(pairs.contract, TAU), runtime: P.selectiveReliability(pairs.runtime, TAU),
      noAbstentionContract: ratio(items.filter(({ c }) => c.y === 1).length, n), noAbstentionRuntime: ratio(items.filter(({ c }) => c.runtimeGreedyOptimal === true).length, n) },
    tiers: name === 'CAL' || name === 'DEV' ? null : Object.fromEntries(Object.entries(tierPoints).map(([pathName, points]) => [pathName,
      Object.fromEntries(M.reliabilityTiers.map((tier) => [String(tier), P.evaluateTier(pairs[pathName], points[String(tier)], tier)]))])),
    byNovelty: buckets(novelty), byProxyFidelity: buckets(({ c }) => c.proxy.bucket), byHorizonBand: buckets(({ entry }) => entry.combination.horizonBand),
    byStateCompleteness: buckets((item) => (complete(item) ? 'COMPLETE' : 'PARTIAL')),
    routerRelationship: {
      quadrants: {
        correctRouteReliablePrediction: items.filter((item) => item.c.correctContract === true && reliable(item)).length,
        correctRouteUnreliablePrediction: items.filter((item) => item.c.correctContract === true && unreliable(item)).length,
        wrongRouteReliablePrediction: items.filter((item) => item.c.correctContract !== true && reliable(item)).length,
        wrongRouteUnreliablePrediction: items.filter((item) => item.c.correctContract !== true && unreliable(item)).length,
        unknownPredictionReliability: items.filter(({ c }) => c.proxy.bucket === 'UNKNOWN').length,
      },
      contract: { givenHighPredictionReliability: routedFalseSafe(items.filter(reliable), 'contract'), givenLowPredictionReliability: routedFalseSafe(items.filter(unreliable), 'contract'),
        givenCompleteState: routedFalseSafe(items.filter(complete), 'contract'), givenPartialState: routedFalseSafe(items.filter((item) => !complete(item)), 'contract') },
      runtime: { givenHighPredictionReliability: routedFalseSafe(items.filter(reliable), 'runtime'), givenLowPredictionReliability: routedFalseSafe(items.filter(unreliable), 'runtime'),
        givenCompleteState: routedFalseSafe(items.filter(complete), 'runtime'), givenPartialState: routedFalseSafe(items.filter((item) => !complete(item)), 'runtime') },
    },
    representation: {
      worldStateV1: P.representationAmbiguity(items.map(({ entry, c }) => ({ signature: P.worldStateSignature(entry), y: c.y })), { coverage: ceilingCoverage }),
      stage3eFeatures: P.representationAmbiguity(items.map(({ label, c }) => ({ signature: P.featureSignature(label.f, model), y: c.y })), { coverage: ceilingCoverage }),
      fullWorldState: P.representationAmbiguity(items.map(({ entry, c }) => ({ signature: entry.worldHash, y: c.y })), { coverage: ceilingCoverage }),
      worldStateV1InformationSubsetOfFeaturesRate: ratio(items.filter(({ entry, label }) => entry.worldState.energy === label.f.energy
        && entry.worldState.entities === label.f.entityCount && entry.worldState.relations === label.f.relationCount
        && entry.worldState.objectives === label.f.objectiveCount && entry.maxTicks - entry.worldState.tick === label.f.decisionHorizonRemaining).length, n),
    },
    attribution: { runtimeRouterErrors: attributionTable(runtimeAttribution, runtimeErrors.length), contractRouterFalseSafe: attributionTable(contractAttribution, contractErrors.length) },
    reasoning: {
      runtimeCorrectN: runtimeCorrect.length, correctForWrongReason: runtimeCorrect.filter(({ c }) => c.correctForWrongReason).length,
      correctForWrongReasonRate: ratio(runtimeCorrect.filter(({ c }) => c.correctForWrongReason).length, runtimeCorrect.length),
      routedCorrectN: routedRuntimeCorrect.length, routedCorrectForWrongReasonRate: ratio(routedRuntimeCorrect.filter(({ c }) => c.correctForWrongReason).length, routedRuntimeCorrect.length),
      errorCompensation: runtimeCorrect.filter(({ c }) => c.errorCompensation).length,
      errorCompensationRate: ratio(runtimeCorrect.filter(({ c }) => c.errorCompensation).length, runtimeCorrect.length),
      intermediateErrorRates: { featureRoute: ratio(items.filter(({ c }) => c.featureRouteError).length, n), equationRoute: ratio(items.filter(({ c }) => c.equationRouteError).length, n),
        actionBinding: ratio(items.filter(({ c }) => c.actionBindingError).length, n) },
    },
    errorDistribution: {
      brierPerCaseContract: P.summarizeDistribution(items.map(({ c }) => (c.scoreContract - c.y) ** 2)),
      brierPerCaseRuntime: P.summarizeDistribution(items.filter(({ c }) => c.runtimeGreedyOptimal !== null).map(({ c }) => (c.scoreRuntime - (c.runtimeGreedyOptimal ? 1 : 0)) ** 2)),
      contractFalseSafeRegret: P.summarizeDistribution(contractErrors.map(({ c }) => c.contractGreedyRegret)),
      runtimeFalseSafeRegret: P.summarizeDistribution(runtimeErrors.map(({ c }) => c.runtimeGreedyRegret)),
      catastrophicTail: { threshold: M.catastrophicRegret, contract: contractErrors.filter(({ c }) => c.contractGreedyRegret >= M.catastrophicRegret).length,
        runtime: runtimeErrors.filter(({ c }) => (c.runtimeGreedyRegret ?? 0) >= M.catastrophicRegret).length },
    },
    runtimeParity: {
      featureDerivationParityRate: ratio(items.filter(({ c }) => c.featureParity).length, n),
      derivationDiffKeyFrequency: countBy(items.flatMap(({ c }) => c.derivationDiffKeys), (key) => key),
      candidateDiffKeyFrequency: countBy(items.flatMap(({ c }) => c.candidateDiffKeys), (key) => key),
      routeDisagreementContractVsRuntime: ratio(items.filter(({ c }) => c.routeContract !== c.routeRuntime).length, n),
      routeDisagreementFromRuntimeFeatures: ratio(items.filter(({ c }) => c.routeContract !== c.routeRuntimeFeaturesCanonical).length, n),
      routeDisagreementFromRuntimeEquation: ratio(items.filter(({ c }) => c.routeContract !== c.routeEquationOnly).length, n),
      actionBindingMismatchRate: ratio(items.filter(({ c }) => c.actionBindingError).length, n),
      meanAbsoluteScoreDelta: r4(mean(items.map(({ c }) => Math.abs(c.scoreRuntime - c.scoreContract)))),
      canonicalEquationOnRuntimeFeatures: P.selectiveReliability(items.map(({ c }) => ({ score: c.scoreRuntimeFeaturesCanonical, correct: c.runtimeGreedyOptimal === true })), TAU),
    },
    distribution: { levelMix: countBy(items, ({ entry }) => `L${entry.combination.level}`), horizonBandMix: countBy(items, ({ entry }) => entry.combination.horizonBand),
      proxyFidelityMix: countBy(items, ({ c }) => c.proxy.bucket), noveltyMix: countBy(items, novelty),
      meanLegalActions: r4(mean(items.map(({ entry }) => entry.branches.length))), supervisionClassMix: countBy(items, ({ entry }) => entry.supervisionClass) },
  };
}
const layerA = { DEV: analyzeLayerA('DEV', dev), CAL: analyzeLayerA('CAL', cal), HOLDOUT: analyzeLayerA('HOLDOUT', holdout), OOD: analyzeLayerA('OOD', ood) };
const stage3eSealedReplay = Object.fromEntries(['HOLDOUT', 'OOD'].map((name) => {
  const published = JSON.parse(readFileSync(path.join(stage3eDir, `final-ROUTABILITY_${name}.json`), 'utf8'));
  const selective = P.selectiveReliability(stage3eAccess.sealed(name, freeze).map((entry) => ({
    score: P.scoreStage3ERouter(labels.get(entry.recordHash).f, model), correct: labels.get(entry.recordHash).y === 1 })), TAU);
  return [name, { routedN: selective.n, precision: r4(selective.observed), wilsonLower: r4(selective.lower),
    publishedRoutedN: published.router.routedN, publishedPrecision: published.router.precision, publishedWilsonLower: published.router.wilsonLower,
    matches: selective.n === published.router.routedN && r4(selective.observed) === published.router.precision && r4(selective.lower) === published.router.wilsonLower }];
}));

log('sealed Layer B');
const episodes = includedRuns.map((item) => {
  if (P.SEALED_PARTITIONS.includes(item.entry.partition) && !access.accessLog().some((entry) => entry.partition === item.entry.partition && entry.access === 'SEALED')) {
    throw new Error('SEALED_LAYER_B_BEFORE_FREEZE');
  }
  const novelty = item.entry.partition === 'DEV' ? 'REFERENCE' : P.noveltyBucket(distances.get(item.entry.recordHash), noveltyThresholds);
  return { item, evidence: E.evaluateStage3F6Episode({ run: item.run, calibration, novelty }) };
});
const NON_EXACT = ['WRONG', 'APPROXIMATELY_CORRECT', 'DIRECTIONALLY_CORRECT'];
function layerBSummary(list) {
  const components = list.flatMap(({ evidence }) => evidence.oneStep.components);
  const baseline = list.flatMap(({ evidence }) => evidence.worldState);
  return {
    episodes: list.length,
    oneStep: { privilegedSimulatorAccess: true, overall: P.qualityCounts(components),
      byDomain: Object.fromEntries(P.PREDICTION_DOMAINS.map((domain) => [domain, P.qualityCounts(components.filter((entry) => entry.domain === domain))])),
      scalar: P.qualityCounts(list.map(({ evidence }) => evidence.oneStep.scalar)),
      absoluteError: P.summarizeDistribution(components.filter((entry) => entry.absoluteError !== null).map((entry) => entry.absoluteError)),
      correctForWrongReason: list.filter(({ evidence }) => evidence.oneStep.correctForWrongReason).length,
      errorCompensation: list.filter(({ evidence }) => evidence.oneStep.errorCompensation).length,
      attributions: countBy(components.filter((entry) => entry.attribution), (entry) => entry.attribution) },
    worldStateBaseline: { sentinelCapability: false,
      byPath: Object.fromEntries(Object.keys(P.RUNTIME_WORLD_STATE_FACTS).map((factPath) => [factPath, P.qualityCounts(baseline.filter((entry) => entry.path === factPath))])),
      overallNonIdentity: P.qualityCounts(baseline.filter((entry) => !P.RUNTIME_WORLD_STATE_FACTS[entry.path].identity)),
      energyAbsoluteError: P.summarizeDistribution(baseline.filter((entry) => entry.path === 'resources.actorEnergy' && entry.absoluteError !== null).map((entry) => entry.absoluteError)),
      attributions: countBy(baseline.filter((entry) => entry.attribution), (entry) => entry.attribution),
      abstentions: baseline.filter((entry) => entry.abstained && !P.RUNTIME_WORLD_STATE_FACTS[entry.path].identity).length },
    counterfactuals: { kinds: countBy(list, ({ evidence }) => evidence.counterfactual.kind),
      withPredictedContent: list.filter(({ evidence }) => evidence.counterfactual.predictedContentPresent).length, reliability: 'UNRESOLVED' },
    routerAbstentionRate: ratio(list.filter(({ evidence }) => evidence.router?.selectedRoute !== 'GREEDY').length, list.length),
    recommendationAbstentionRate: ratio(list.filter(({ evidence }) => evidence.recommendation?.abstained === true).length, list.length),
    calibrationConditions: countBy(list, ({ evidence }) => `oneStep=${evidence.calibration.oneStepCondition};baseline=${evidence.calibration.baselineCondition}`),
    degradationStatuses: countBy(list, ({ evidence }) => evidence.degradation.status),
    domainCoverageComplete: list.filter(({ evidence }) => evidence.domainCoverage.complete).length,
  };
}
const layerB2 = {
  byPartition: Object.fromEntries(Object.values(P.Stage3F6Partition).map((name) => [name, layerBSummary(episodes.filter(({ item }) => item.entry.partition === name))])),
  sealed: layerBSummary(episodes.filter(({ item }) => P.SEALED_PARTITIONS.includes(item.entry.partition))),
  sealedByNovelty: Object.fromEntries(Object.values(P.NoveltyBucket).map((bucket) => [bucket,
    layerBSummary(episodes.filter(({ item, evidence }) => P.SEALED_PARTITIONS.includes(item.entry.partition) && evidence.novelty === bucket)).oneStep.overall])),
  leakage: P.temporalLeakage(episodes.map(({ evidence }) => ({ decisionLogicalTime: evidence.decisionLogicalTime,
    outcomeLogicalTime: evidence.outcomeLogicalTime, predictionGeneratedLogicalTime: evidence.predictionGeneratedLogicalTime }))),
};

/* ------------------------------------------------------------------ 8. degraded observations (HOLDOUT Layer B, evaluation copies) */
log('degraded-observation campaign');
const OBSERVATION_DEGRADATIONS = Object.values(P.ObservationDegradation).filter((id) => id !== P.ObservationDegradation.STALE_OBSERVATION);
function routerProbe(state, observation) {
  const preliminary = extractIntegratedStage3EFeatures(state, observation, null);
  const output = preliminary.selector.abstain ? preliminary.greedy : preliminary.selector;
  const features = extractIntegratedStage3EFeatures(state, observation, { actionId: output.actionId,
    producerId: preliminary.selector.abstain ? 'HEURISTIC_GREEDY_IMMEDIATE' : 'NEXUS_RELATIONAL_SELECTOR_V1', producerVersion: '1' });
  return { values: features.values, runtime: P.scoreStage3ERouter(features.values, model, P.RouterEquation.STAGE3F5_RUNTIME),
    canonical: P.scoreStage3ERouter(features.values, model, P.RouterEquation.STAGE3E_CANONICAL), greedyKey: features.greedy.actionId.slice(0, 16) };
}
const degradationItems = includedRuns.filter((item) => item.entry.partition === 'HOLDOUT').slice(0, M.layerB.degradationQuota);
const decisionCorrect = (entry, score, key) => { const regret = P.branchRegret(entry, key); if (regret === null || score === null) return null;
  return score >= TAU ? regret === 0 : regret !== 0; };
const degradationRows = Object.fromEntries([...OBSERVATION_DEGRADATIONS, 'COMPLETE'].map((id) => [id, []]));
const staleRows = []; const baselineDegradation = Object.fromEntries([...Object.values(P.ObservationDegradation), 'COMPLETE'].map((id) => [id, []]));
for (const item of degradationItems) {
  const state = item.run.pending.stateBefore; const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const base = routerProbe(state, observation);
  const row = (probe) => ({ runtime: probe.runtime, canonical: probe.canonical, routedRuntime: probe.runtime !== null && probe.runtime >= TAU,
    routedCanonical: probe.canonical !== null && probe.canonical >= TAU, correctRuntime: decisionCorrect(item.entry, probe.runtime, probe.greedyKey),
    correctCanonical: decisionCorrect(item.entry, probe.canonical, probe.greedyKey), featuresChanged: Object.keys(base.values).filter((key) => base.values[key] !== probe.values[key]).length,
    baseRuntime: base.runtime, baseCanonical: base.canonical, baseCorrectRuntime: decisionCorrect(item.entry, base.runtime, base.greedyKey),
    baseCorrectCanonical: decisionCorrect(item.entry, base.canonical, base.greedyKey), baseRoutedRuntime: base.runtime >= TAU, baseRoutedCanonical: base.canonical >= TAU });
  degradationRows.COMPLETE.push(row(base));
  for (const id of OBSERVATION_DEGRADATIONS) degradationRows[id].push(row(routerProbe(state, P.degradeObservation(observation, id))));
  const next = item.run.pending.nextState;
  if (!forgeWorldAdapter.isTerminal(next) && forgeWorldAdapter.legalActions(next, FORGE_OBSERVER_ID).length > 0) {
    const fresh = routerProbe(next, forgeWorldAdapter.observe(next, FORGE_OBSERVER_ID)); const stale = routerProbe(next, observation);
    staleRows.push({ runtimeDelta: stale.runtime - fresh.runtime, canonicalDelta: stale.canonical - fresh.canonical,
      routeChangeRuntime: (stale.runtime >= TAU) !== (fresh.runtime >= TAU), routeChangeCanonical: (stale.canonical >= TAU) !== (fresh.canonical >= TAU),
      featuresChanged: Object.keys(fresh.values).filter((key) => fresh.values[key] !== stale.values[key]).length });
  }
  const facts = P.worldStateFactMap(item.run.pending.worldState);
  for (const id of ['COMPLETE', ...Object.values(P.ObservationDegradation)]) {
    const degradedFacts = id === 'COMPLETE' ? facts : P.degradeWorldStateFacts(facts, id);
    baselineDegradation[id].push(E.evaluateStage3F6Episode({ run: item.run, calibration, decisionFacts: degradedFacts }).worldState
      .filter((entry) => !P.RUNTIME_WORLD_STATE_FACTS[entry.path].identity));
  }
}
function summarizeDegradation(rows) {
  const pathStats = (key) => {
    const routed = rows.map((entry) => (key === 'runtime' ? entry.routedRuntime : entry.routedCanonical));
    const baseRouted = rows.map((entry) => (key === 'runtime' ? entry.baseRoutedRuntime : entry.baseRoutedCanonical));
    const correct = rows.map((entry) => (key === 'runtime' ? entry.correctRuntime : entry.correctCanonical));
    const baseCorrect = rows.map((entry) => (key === 'runtime' ? entry.baseCorrectRuntime : entry.baseCorrectCanonical));
    const confidenceDelta = mean(rows.map((entry) => entry[key] - entry[key === 'runtime' ? 'baseRuntime' : 'baseCanonical']));
    const routedFs = (flags, corr) => { const idx = flags.map((flag, i) => (flag ? i : -1)).filter((i) => i >= 0);
      const fs = idx.filter((i) => corr[i] === false).length; return { routed: idx.length, falseSafe: fs, rate: ratio(fs, idx.length) }; };
    return { confidenceDelta: r4(confidenceDelta), absoluteConfidenceDelta: r4(mean(rows.map((entry) => Math.abs(entry[key] - entry[key === 'runtime' ? 'baseRuntime' : 'baseCanonical'])))),
      errorDelta: r4((correct.filter((value) => value === false).length - baseCorrect.filter((value) => value === false).length) / rows.length),
      abstentionDelta: r4((routed.filter((value) => !value).length - baseRouted.filter((value) => !value).length) / rows.length),
      routeChangeRate: ratio(routed.filter((value, index) => value !== baseRouted[index]).length, rows.length),
      routerErrorGivenObservation: routedFs(routed, correct), routerErrorGivenCompleteObservation: routedFs(baseRouted, baseCorrect),
      uncertaintyResponse: confidenceDelta === null ? 'UNKNOWN' : confidenceDelta < -0.01 ? 'CONFIDENCE_DECREASES' : confidenceDelta > 0.01 ? 'CONFIDENCE_INCREASES' : 'INSENSITIVE' };
  };
  return { n: rows.length, meanFeaturesChanged: r4(mean(rows.map((entry) => entry.featuresChanged))), runtime: pathStats('runtime'), canonicalEquation: pathStats('canonical') };
}
const baselineSummaryFor = (rows) => { const flat = rows.flat(); const counts = P.qualityCounts(flat);
  return { ...counts, abstentions: flat.filter((entry) => entry.abstained).length, observationErrors: flat.filter((entry) => entry.attribution === 'OBSERVATION_ERROR').length }; };
const degradation = {
  n: degradationItems.length, partition: 'HOLDOUT',
  router: Object.fromEntries(Object.entries(degradationRows).map(([id, rows]) => [id, summarizeDegradation(rows)])),
  staleObservationRouter: { n: staleRows.length, labeled: false, runtimeConfidenceDelta: r4(mean(staleRows.map((entry) => entry.runtimeDelta))),
    canonicalConfidenceDelta: r4(mean(staleRows.map((entry) => entry.canonicalDelta))), runtimeRouteChangeRate: ratio(staleRows.filter((entry) => entry.routeChangeRuntime).length, staleRows.length),
    canonicalRouteChangeRate: ratio(staleRows.filter((entry) => entry.routeChangeCanonical).length, staleRows.length), meanFeaturesChanged: r4(mean(staleRows.map((entry) => entry.featuresChanged))) },
  worldStateBaseline: Object.fromEntries(Object.entries(baselineDegradation).map(([id, rows]) => [id, baselineSummaryFor(rows)])),
  oneStepConsequenceReadsObservation: false,
};

/* ------------------------------------------------------------------ 9. calibration status relationship */
log('calibration-variant sensitivity');
const variants = {
  CALIBRATED: calibration,
  PARTIALLY_CALIBRATED: P.createCalibrationVariant(calibration, P.CalibrationCondition.PARTIALLY_CALIBRATED),
  INSUFFICIENT: P.createCalibrationVariant(calibration, P.CalibrationCondition.INSUFFICIENT, { insufficientCalibration: createForgeIntegratedCalibration({ insufficient: true }) }),
  CONFLICTED: P.createCalibrationVariant(calibration, P.CalibrationCondition.CONFLICTED),
};
const sensitivityItems = includedRuns.filter((item) => item.entry.partition === 'HOLDOUT').slice(0, M.layerB.calibrationSensitivityQuota);
const variantRows = Object.fromEntries(Object.keys(variants).map((id) => [id, []])); let calibrationSensitivity = 0;
for (const item of sensitivityItems) {
  const baseline = item.run;
  for (const [id, variant] of Object.entries(variants)) {
    const run = id === 'CALIBRATED' ? baseline : E.runStage3F6Episode({ world: item.run.pending.stateBefore.world, calibration: variant });
    const evidence = E.evaluateStage3F6Episode({ run, calibration: variant });
    const outputsIdentical = run.pending.router?.score === baseline.pending.router?.score
      && P.stableStringify(run.pending.features?.values ?? null) === P.stableStringify(baseline.pending.features?.values ?? null)
      && P.stableStringify(run.pending.trace?.decisionTimeEvent?.decisionTimeEvidence?.recommendation?.proposedAction ?? null)
        === P.stableStringify(baseline.pending.trace?.decisionTimeEvent?.decisionTimeEvidence?.recommendation?.proposedAction ?? null)
      && run.pending.transition.info.worldHash === baseline.pending.transition.info.worldHash;
    if (!outputsIdentical) calibrationSensitivity += 1;
    variantRows[id].push({ evidence, outputsIdentical, eligibility: run.result?.experience?.projection?.eligibilityByPurpose?.ROUTER_ANALYSIS?.status ?? 'UNRESOLVED',
      predictionErrorStatus: run.result?.experience?.projection?.predictionErrors?.at(-1)?.status ?? 'UNKNOWN', status: run.result?.degradation?.status ?? 'PARTIAL_EVIDENCE' });
  }
}
const calibrationRelationship = {
  n: sensitivityItems.length, predictionOutputsChangedAcrossVariants: calibrationSensitivity,
  variants: Object.fromEntries(Object.entries(variantRows).map(([id, rows]) => [id, {
    overallStatus: variants[id].overallStatus,
    oneStepCondition: countBy(rows, (row) => row.evidence.calibration.oneStepCondition),
    oneStep: P.qualityCounts(rows.flatMap((row) => row.evidence.oneStep.components)),
    worldStateBaseline: P.qualityCounts(rows.flatMap((row) => row.evidence.worldState.filter((entry) => !P.RUNTIME_WORLD_STATE_FACTS[entry.path].identity))),
    routerOutputsIdentical: rows.every((row) => row.outputsIdentical),
    routerAnalysisEligibility: countBy(rows, (row) => row.eligibility), predictionErrorStatus: countBy(rows, (row) => row.predictionErrorStatus),
    integratedStatus: countBy(rows, (row) => row.status),
  }])),
  interpretation: calibrationSensitivity === 0
    ? 'NO_PREDICTOR_CONSUMES_CALIBRATION: calibration status gates comparability and eligibility only; identical reliability under INSUFFICIENT is explained, not evidence that calibration is unnecessary'
    : 'PREDICTION_OUTPUTS_DEPEND_ON_CALIBRATION',
};

/* ------------------------------------------------------------------ 10. uncertainty behavior table */
const deg = degradation.router;
const pooled = (ids, key) => r4(mean(ids.map((id) => deg[id].runtime[key])));
const sealedNovelty = analyzeLayerA('SEALED_NOVELTY', [...holdout, ...ood]).byNovelty;
const noveltyDelta = (pathName, key) => (sealedNovelty.STRONGLY_NOVEL && sealedNovelty.FAMILIAR
  ? r4(sealedNovelty.STRONGLY_NOVEL[pathName][key] - sealedNovelty.FAMILIAR[pathName][key]) : null);
const uncertainty = {
  COMPLETE_OBSERVATIONS: { confidenceDelta: 0, errorDelta: 0, abstentionDelta: 0, n: degradation.n },
  PARTIAL_OBSERVATIONS: { ...pick(deg.DROP_ENTITY_SUBSET.runtime), source: 'DROP_ENTITY_SUBSET (runtime)' },
  DEGRADED_OBSERVATIONS: { confidenceDelta: pooled(['REMOVE_THREAT_INFORMATION', 'REMOVE_OBJECTIVE_INFORMATION', 'HIDE_RELATIONSHIPS'], 'confidenceDelta'),
    errorDelta: pooled(['REMOVE_THREAT_INFORMATION', 'REMOVE_OBJECTIVE_INFORMATION', 'HIDE_RELATIONSHIPS'], 'errorDelta'),
    abstentionDelta: pooled(['REMOVE_THREAT_INFORMATION', 'REMOVE_OBJECTIVE_INFORMATION', 'HIDE_RELATIONSHIPS'], 'abstentionDelta'), source: 'mean of threat/objective/relationship removal (runtime)' },
  UNKNOWN_FIELDS: { confidenceDelta: pooled(['REMOVE_RESOURCE_SIGNALS', 'HIDE_SPATIAL_INFORMATION'], 'confidenceDelta'),
    errorDelta: pooled(['REMOVE_RESOURCE_SIGNALS', 'HIDE_SPATIAL_INFORMATION'], 'errorDelta'),
    abstentionDelta: pooled(['REMOVE_RESOURCE_SIGNALS', 'HIDE_SPATIAL_INFORMATION'], 'abstentionDelta'), source: 'resource and spatial observation fields zeroed (runtime)' },
  STALE_OBSERVATIONS: { confidenceDelta: degradation.staleObservationRouter.runtimeConfidenceDelta, errorDelta: 'UNLABELED', abstentionDelta: null,
    routeChangeRate: degradation.staleObservationRouter.runtimeRouteChangeRate, source: 'decision at t+1 using observation from t (runtime)' },
  PARTIAL_CALIBRATION: { confidenceDelta: calibrationRelationship.variants.PARTIALLY_CALIBRATED.routerOutputsIdentical ? 0 : null, errorDelta: 0, abstentionDelta: 0,
    comparableCoverageDelta: r4((calibrationRelationship.variants.PARTIALLY_CALIBRATED.oneStep.comparableCoverage ?? 0) - (calibrationRelationship.variants.CALIBRATED.oneStep.comparableCoverage ?? 0)) },
  NOVEL_STATE: { confidenceDelta: noveltyDelta('contract', 'meanConfidence'), errorDelta: noveltyDelta('contract', 'falseSafeRate'), abstentionDelta: noveltyDelta('contract', 'abstentionRate'),
    runtimeConfidenceDelta: noveltyDelta('runtime', 'meanConfidence'), source: 'STRONGLY_NOVEL minus FAMILIAR over HOLDOUT+OOD (contract path)' },
  OOD_STATE: { confidenceDelta: r4(layerA.OOD.calibration.contract.meanConfidence - layerA.HOLDOUT.calibration.contract.meanConfidence),
    runtimeConfidenceDelta: r4(layerA.OOD.calibration.runtime.meanConfidence - layerA.HOLDOUT.calibration.runtime.meanConfidence),
    errorDelta: r4((1 - layerA.OOD.selective.contract.observed) - (1 - layerA.HOLDOUT.selective.contract.observed)),
    abstentionDelta: r4(layerA.OOD.selective.contract.abstentionRate - layerA.HOLDOUT.selective.contract.abstentionRate), source: 'OOD minus HOLDOUT (contract path)' },
};
function pick(stats) { return { confidenceDelta: stats.confidenceDelta, errorDelta: stats.errorDelta, abstentionDelta: stats.abstentionDelta, response: stats.uncertaintyResponse }; }

/* ------------------------------------------------------------------ 11. diagnosis */
const H = layerA.HOLDOUT;
const falseSafeByFidelity = Object.fromEntries(Object.entries(H.byProxyFidelity).map(([bucket, stats]) => [bucket, stats.contract.falseSafe]));
const horizonGroup = (bands) => bands.reduce((acc, band) => ({ routed: acc.routed + (H.byHorizonBand[band]?.contract.routed ?? 0),
  falseSafe: acc.falseSafe + (H.byHorizonBand[band]?.contract.falseSafe ?? 0) }), { routed: 0, falseSafe: 0 });
const diagnosis = P.diagnoseLimitations({
  contractFalseSafeByFidelity: falseSafeByFidelity, runtimeFalseSafeAttribution: H.attribution.runtimeRouterErrors.counts,
  routeDisagreementRate: H.runtimeParity.routeDisagreementContractVsRuntime, holdoutEce: H.calibration.contract.ece,
  holdoutHcw090: H.highConfidenceWrong.contract['0.9'], horizonFalseSafe: { early: horizonGroup(['H0', 'H1']), late: horizonGroup(['H3', 'H4']) },
  multistepPredictionAvailable: false, calibrationSensitivity,
});
// Report-only (disclosed restart addition): conditional false-safe rates, which the share rule does not consider.
const concentration = (name) => {
  const rel = layerA[name].routerRelationship.contract;
  return { falseSafeRateGivenHighPredictionReliability: rel.givenHighPredictionReliability.falseSafeRate, routedHigh: rel.givenHighPredictionReliability.routed,
    falseSafeRateGivenLowPredictionReliability: rel.givenLowPredictionReliability.falseSafeRate, routedLow: rel.givenLowPredictionReliability.routed,
    errorsConcentratedInLowReliabilityStates: (rel.givenLowPredictionReliability.falseSafeRate ?? 0) > (rel.givenHighPredictionReliability.falseSafeRate ?? 0) };
};
const diagnosisSupplement = { reportOnly: true, HOLDOUT: concentration('HOLDOUT'), OOD: concentration('OOD'),
  shareRuleCaveat: 'shares scale with bucket prevalence; a C share without higher conditional error in low-fidelity states is not evidence that errors concentrate where one-step evidence is unreliable' };

/* ------------------------------------------------------------------ 12. observatory */
log('observatory');
const sample = episodes.find(({ item }) => item.entry.partition === 'HOLDOUT');
const observatoryAggregate = {
  oneStepExactAccuracy: layerB2.sealed.oneStep.overall.exactAccuracy, highConfidenceWrong090: H.highConfidenceWrong.contract['0.9'].rate,
  coverage: H.selective.contract.coverage, ece: H.calibration.contract.ece, errorP95: H.errorDistribution.brierPerCaseContract.p95,
};
const legacyProducer = createBoundedTelemetryProducer({ capacity: 8 }); const mixedProducer = createBoundedTelemetryProducer({ capacity: 8 });
const legacyFrame = projectIntegratedTelemetry(sample.item.run.result);
legacyProducer.offer(legacyFrame); mixedProducer.offer(legacyFrame);
mixedProducer.offer({ ...legacyFrame, prediction: E.projectPredictionTelemetry(sample.evidence, observatoryAggregate) });
const v1 = createReadOnlyAsciiObservatory(legacyProducer); const v2 = createPredictionObservatory(mixedProducer);
const predictionRender = v2.render({ view: PredictionObservatoryView.PREDICTION });
const disconnected = createBoundedTelemetryProducer({ capacity: 4 }); disconnected.disconnect();
const worldForIsolation = buildRecordV2({ ...sample.item.entry.combination, seed: Number(sample.item.entry.combination.seed) }, sample.item.entry.ood).world;
const isolatedRun = E.runStage3F6Episode({ world: worldForIsolation, calibration, telemetrySink: disconnected });
const tiny = createBoundedTelemetryProducer({ capacity: 1 });
const backpressureRun = E.runStage3F6Episode({ world: worldForIsolation, calibration, telemetrySink: tiny });
const observatoryChecks = {
  predictionViewAvailable: v2.views.includes('PREDICTION') && predictionRender.includes('SENTINEL ASCII OBSERVATORY :: PREDICTION'),
  predictionViewShowsRequiredFields: ['WORLD STATE', 'ONE-STEP CONSEQUENCE', 'router confidence', 'reliability bin', 'router abstained', 'state novelty',
    'calibration (one-step)', 'error attribution', 'one-step exact', 'router ECE', 'prediction error p95'].every((token) => predictionRender.includes(token)),
  legacySevenViewsIntact: Object.values(ObservatoryView).length === 7 && Object.values(ObservatoryView).every((view) => v2.views.includes(view)),
  legacyRenderByteIdentical: Object.values(ObservatoryView).filter((view) => view !== 'METRICS').every((view) => v1.render({ view }) === v2.render({ view })),
  viewCount: v2.views.length,
  readOnly: PREDICTION_OBSERVATORY_CONTRACT.readOnly === true && PREDICTION_OBSERVATORY_CONTRACT.prohibitedCapabilities.every((name) => !(name in v2)),
  failureIsolated: disconnected.snapshot().stats.dropped > 0 && isolatedRun.pending.transition.info.worldHash === sample.item.run.pending.transition.info.worldHash
    && isolatedRun.result.degradation.status === sample.item.run.result.degradation.status,
  backpressureIsolated: tiny.snapshot().stats.dropped > 0 && backpressureRun.pending.transition.info.worldHash === sample.item.run.pending.transition.info.worldHash,
  command: 'npm run observatory -- --view PREDICTION',
};

/* ------------------------------------------------------------------ 13. tests */
let testMetrics = { total: -1, pass: -1, fail: -1, skip: -1 }; let testsStatus = null;
if (!skipTests) {
  log('Stage 3F.6 tests');
  const tests = spawnSync(process.execPath, ['--test', 'tests/stage3f6-prediction-reliability-v1.test.js'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const output = `${tests.stdout ?? ''}\n${tests.stderr ?? ''}`;
  const metric = (name) => Number(output.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
  testMetrics = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') }; testsStatus = tests.status;
}

/* ------------------------------------------------------------------ 14. payload */
const evaluationMs = episodes.map(({ evidence }) => evidence.evaluationMs);
const performance = {
  stage3f5BaselineTotalMeanMs: 38.560068, stage3f5BaselineTotalP95Ms: 64.191209,
  stage3f6EvaluationPerEpisode: P.summarizeDistribution(evaluationMs),
  integratedInstrumentationThisCampaign: P.summarizeDistribution(integratedTotals),
};
const storedPerformance = stored?.performance ?? performance;
const tierEvidenceGrounded = ['HOLDOUT', 'OOD'].every((name) => ['contract', 'runtime'].every((pathName) => Object.values(layerA[name].tiers[pathName])
  .every((row) => typeof row.n === 'number' && (row.status !== 'ACHIEVABLE' || (row.n >= FLOOR.minTierN && row.lower >= row.tier)))));
const splitLeakageCount = identityLeakage.episodeOverlap + identityLeakage.stateIdOverlap + identityLeakage.derivedVariantLeakage
  + layerB2.leakage.temporalLeakage + layerB2.leakage.futureToPastLeakage;
const runtimeBindingDefects = {
  routerEquationMisaligned: designDerived.calRuntimeEquation.routedN !== designDerived.calStage3EReplay.routedN,
  featureDerivationDiverges: H.runtimeParity.featureDerivationParityRate !== 1,
  actionBindingDiverges: H.runtimeParity.actionBindingMismatchRate > 0,
  // An abstained recommendation (router selects V2B without evidence) makes the ledger throw; the episode then loses its
  // counterfactual ledger and experience, and can never enter prediction-calibration evidence.
  abstainedRecommendationDropsLedgerAndExperience: [...runs.values()].filter((item) => (item.run.result?.degradation?.failures ?? [])
    .some((failure) => failure.stage === 'LEDGER' && /candidateAction must be an object/.test(failure.reason))).length,
};
const exitCriteria = {
  FROZEN_EVALUATION_SNAPSHOT: snapshotManifest.experienceN > 0 && shards.length > 0,
  DEV_CAL_HOLDOUT_OOD_SEPARATED: Object.values(partitions).every((list) => list.length > 0)
    && access.accessLog().filter((entry) => entry.access === 'SEALED').every((entry) => entry.freezeHash === freeze.freezeHash),
  SPLIT_LEAKAGE_ZERO: splitLeakageCount === 0,
  ONE_STEP_RELIABILITY_MEASURED: layerB2.sealed.oneStep.overall.comparable > 0,
  UNCERTAINTY_CALIBRATION_MEASURED: H.calibration.contract.n > 0 && H.calibration.runtime.n > 0,
  ABSTENTION_RELIABILITY_MEASURED: H.selective.contract.n > 0,
  DEGRADED_OBSERVATION_RELIABILITY_MEASURED: degradation.n > 0,
  NOVEL_STATE_RELIABILITY_MEASURED: Object.keys(sealedNovelty).length >= 2,
  ERROR_ATTRIBUTION_MEASURED: H.attribution.runtimeRouterErrors.population > 0,
  CORRECT_FOR_WRONG_REASON_TRACKED: H.reasoning.runtimeCorrectN > 0,
  ERROR_COMPENSATION_TRACKED: typeof H.reasoning.errorCompensation === 'number',
  ROUTER_PREDICTION_RELATIONSHIP_MEASURED: H.routerRelationship.contract.givenHighPredictionReliability.n > 0,
  RELIABILITY_TIERS_EVIDENCE_GROUNDED: tierEvidenceGrounded, SAMPLE_SIZE_DISCIPLINE: tierEvidenceGrounded && FLOOR.minTierN === 200,
  STAGE3E_CONTRACT_REPLAY_EXACT: designDerived.calStage3EReplay.matchesStage3EFreeze && stage3eSealedReplay.HOLDOUT.matches && stage3eSealedReplay.OOD.matches,
  RUNTIME_EQUATION_PARITY_WITH_STAGE3F5: designDerived.runtimeEquationParityWithStage3F5Evaluator,
  CORPUS_INTEGRITY: Object.entries(corpusChecks).filter(([key]) => key !== 'replaySampleN').every(([, value]) => value === true),
  FREEZE_REPRODUCED: freezeReproduced,
  OBSERVATORY: Object.entries(observatoryChecks).filter(([key]) => !['viewCount', 'command'].includes(key)).every(([, value]) => value === true),
  TESTS_PASS: !skipTests && testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0,
  MODEL_TRAINING_PERFORMED_FALSE: P.PREDICTION_RELIABILITY_CONTRACT.modelTrainingPerformed === false,
  WEIGHTS_UPDATED_FALSE: P.PREDICTION_RELIABILITY_CONTRACT.weightsUpdated === false,
  ROUTER_RETRAINED_FALSE: P.PREDICTION_RELIABILITY_CONTRACT.routerRetrained === false,
  ONLINE_LEARNING_ENABLED_FALSE: P.PREDICTION_RELIABILITY_CONTRACT.onlineLearningEnabled === false,
  AUTHORITY_R0: INTEGRATED_LIVE_SHADOW_CONTRACT.authority.tier === 'R0' && P.PREDICTION_RELIABILITY_CONTRACT.authority.tier === 'R0',
  CANNOT_DISPATCH: P.PREDICTION_RELIABILITY_CONTRACT.authority.canDispatch === false,
  CANNOT_MUTATE_LIVE_WORLD: P.PREDICTION_RELIABILITY_CONTRACT.authority.canMutateLiveWorld === false,
  PREDECESSORS_INTACT: predecessorsIntact,
};
const nonPredecessor = Object.entries(exitCriteria).filter(([key]) => key !== 'PREDECESSORS_INTACT').every(([, value]) => value === true);
const status = nonPredecessor && predecessorsIntact ? 'PASS' : nonPredecessor ? 'PARTIAL' : 'FAIL';
const tierStatus = (name, pathName) => Object.fromEntries(Object.entries(layerA[name].tiers[pathName]).map(([tier, row]) =>
  [tier, `${row.status} n=${row.n} coverage=${row.coverage} observed=${row.observed} lower=${row.lower}${row.tau === null ? ' (no CAL operating point; reference tau=0.9)' : ` tau=${row.tau}`}`]));
const blockers = [
  ...(predecessorsIntact ? [] : [`PREDECESSOR_CHECKS_NOT_REPRODUCIBLE_IN_CURRENT_ENVIRONMENT:${environmentDiagnosis.diagnosis}`]),
  ...(runtimeBindingDefects.routerEquationMisaligned ? ['STAGE3F5_RUNTIME_ROUTER_EQUATION_MISALIGNED_WITH_FROZEN_STAGE3E_MODEL'] : []),
  ...(runtimeBindingDefects.featureDerivationDiverges ? ['STAGE3F5_RUNTIME_FEATURES_DIVERGE_FROM_STAGE3E_CONTRACT'] : []),
  ...(runtimeBindingDefects.actionBindingDiverges ? ['STAGE3F5_RUNTIME_GREEDY_ACTION_DIFFERS_FROM_LABELED_GREEDY_ACTION'] : []),
  ...(runtimeBindingDefects.abstainedRecommendationDropsLedgerAndExperience > 0 ? ['STAGE3F5_ABSTAINED_RECOMMENDATION_DROPS_LEDGER_AND_EXPERIENCE'] : []),
  'NO_NON_PRIVILEGED_NEXT_STATE_OR_MULTISTEP_PREDICTOR',
  ...(Object.values(layerA.HOLDOUT.tiers.contract).every((row) => row.status !== 'ACHIEVABLE') ? ['NO_EVIDENCED_RELIABILITY_TIER_ON_HOLDOUT'] : []),
];
const readyForStage3G = status === 'PASS' && !Object.values(runtimeBindingDefects).some(Boolean)
  && layerA.HOLDOUT.tiers.runtime['0.8'].status === 'ACHIEVABLE';
const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_6_PREDICTION_RELIABILITY_BASELINE', status,
  contract: { id: P.PREDICTION_RELIABILITY_CONTRACT_ID, hash: P.PREDICTION_RELIABILITY_CONTRACT_HASH, methodologyHash: freeze.methodologyHash },
  inherited: { stage3f5CertificationHash: 'eda3d2d67334dd904a24ff574f4e839e52fb67ec26fb01112b8f21c973b4fbe5', stage3f5CampaignHash: 'sha256:d56ae56d1be12dbd2924c88d8645b6ff4f25c3f80a3db6bc2d126644f1d355a1',
    stage3eRouterFreezeHash: recovery.hashes.stage3eRouterFreeze, predecessorChecks, environmentDiagnosis },
  corpus: { corpusDigest, caseCount: entries.length, manifestCounts: manifest.counts, checks: corpusChecks, replayMismatches },
  evaluationSnapshot: snapshotManifest,
  snapshotSelection: {
    offered: runs.size, included: includedRuns.length,
    eligibilityByRoute: countBy([...runs.values()], (item) => `${item.route}:${item.eligibility}`),
    ineligibilityReasons: countBy([...runs.values()].filter((item) => item.eligibility !== 'ELIGIBLE').flatMap((item) => item.eligibilityReasons), (reason) => reason),
    selectionBias: 'PREDICTION_CALIBRATION eligibility is decided by the certified Stage 3F.4 profile; excluded episodes are reported, never silently dropped',
  },
  partitions: Object.fromEntries(Object.entries(partitions).map(([name, list]) => [name, { n: list.length, stage3eSplitN: stage3eSplits[name].length,
    quarantinedDerivedVariants: quarantine.quarantined[name], identity: access.identities[name],
    layerB: episodes.filter(({ item }) => item.entry.partition === name).length }])),
  leakage: { ...identityLeakage, ...layerB2.leakage, splitLeakageCount, inheritedStage3ESplitLeakage: inheritedStage3ELeakage },
  diagnosisSupplement,
  freeze: { freezeHash: freeze.freezeHash, reproduced: freezeReproduced, sealedAccessLog: access.accessLog(), sealedExposureDisclosures },
  predictionInventory: inventory, structuralFindings, runtimeBindingDefects,
  designDerived: { ...designDerived, identityLeakage: undefined },
  stage3eSealedReplay, layerA, layerB: layerB2, degradation, calibrationRelationship, uncertainty,
  sealedNovelty, diagnosis, observatory: { contract: PREDICTION_OBSERVATORY_CONTRACT.contractId, hash: PREDICTION_OBSERVATORY_CONTRACT_HASH, checks: observatoryChecks },
  observatoryAggregate, performance: storedPerformance, tests: testMetrics, exitCriteria,
  sourceHashes: Object.fromEntries(await Promise.all([
    'src/stage3f/prediction-reliability-v1.js', 'src/stage3f/prediction-reliability-corpus-v1.js', 'src/stage3f/prediction-reliability-episode-v1.js',
    'src/stage3f/prediction-observatory-v1.js', 'scripts/certify-stage3f6-prediction-reliability.mjs', 'scripts/generate-stage3f6-evaluation-corpus.mjs',
    'scripts/sentinel-observatory-v2.mjs', 'tests/stage3f6-prediction-reliability-v1.test.js',
    'src/stage3f/integrated-live-shadow-v1.js', 'src/stage3f/ascii-observatory-v1.js', 'scripts/sentinel-observatory.mjs',
  ].map(async (file) => [file, existsSync(path.join(root, file)) ? await fileHash(file) : null]))),
  authority: INTEGRATED_LIVE_SHADOW_CONTRACT.authority,
  learning: { modelTrainingPerformed: false, weightsUpdated: false, routerRetrained: false, onlineLearningEnabled: false },
  roadmap: { readyForStage3G, nextStage: readyForStage3G ? 'STAGE_3G_STRATEGIC_COMPETENCE' : 'STAGE_3F_7_RUNTIME_PREDICTION_BINDING_REMEDIATION', blockers },
  report: {
    tiersContractHoldout: tierStatus('HOLDOUT', 'contract'), tiersRuntimeHoldout: tierStatus('HOLDOUT', 'runtime'),
    tiersContractOod: tierStatus('OOD', 'contract'),
  },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash,
    freezeReproduced, tests: testMetrics }, null, 2));
  if (!reproduced || status === 'FAIL') process.exitCode = 1;
} else {
  await writeFile(files.result, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, freezeHash: freeze.freezeHash, exitCriteria, blockers, diagnosis: { primary: diagnosis.primary, secondary: diagnosis.secondary } }, null, 2));
  if (status === 'FAIL') process.exitCode = 1;
}
