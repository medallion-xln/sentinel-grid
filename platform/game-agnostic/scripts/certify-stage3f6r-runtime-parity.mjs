#!/usr/bin/env node
/* STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION — remediation gate certification.
 *
 * A bounded correctness gate, not a new architectural stage and not a reliability study.
 * It proves: frozen-router equation binding parity on frozen fixtures, reference feature parity (diagnostic mode only),
 * abstention evidence preservation, and predecessor reproducibility without ephemeral scratch state.
 * It makes no new statistical reliability claim; same-split fixture replay is used only for exact parity.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import { forgeAdapterState, forgeWorldAdapter, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { createWorld } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import {
  INTEGRATED_LIVE_SHADOW_CONTRACT, INTEGRATED_RUNTIME_REMEDIATION, beginIntegratedLiveShadowStep,
  completeIntegratedLiveShadowStep, evaluateIntegratedStage3ERouter, extractIntegratedStage3EFeatures,
  runIntegratedLiveShadowCampaign,
} from '../src/stage3f/integrated-live-shadow-v1.js';
import * as H from './stage3f6r-reference-parity-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6r-runtime-parity-remediation');
const resultPath = path.join(outDirectory, 'stage3f6r-certification-result.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = async (relative) => hex(await readFile(path.join(root, relative)));
const log = (message) => process.stderr.write(`[stage3f6r] ${message}\n`);
const STAGE3F5_CERTIFICATION_HASH = 'eda3d2d67334dd904a24ff574f4e839e52fb67ec26fb01112b8f21c973b4fbe5';
const STAGE3F6_CERTIFICATION_HASH = '399f71c9cc0b2758e610133454e2f137436339a04a2117a1323a0a0bc3616a84';

const gitClean = (...paths) => {
  const result = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'GIT_UNAVAILABLE';
};
const unchanged = (...paths) => gitClean(...paths) === '';
const prefix = (relative) => `platform/game-agnostic/${relative}`;

/* ------------------------------------------------------------------ scope */
const FROZEN_STAGE3E = ['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered',
  'artifacts/stage3de-recovery-canonicalization', 'training/stage3cr3/identity'].map(prefix);
const STAGE3F0_TO_3F4_OWNERS = [
  'src/stage3f/world-state-v1.js', 'src/stage3f/causal-trace-v1.js', 'src/stage3f/environment-calibration-v1.js',
  'src/stage3f/counterfactual-veto-ledger-v1.js', 'src/stage3f/shadow-experience-buffer-v1.js',
  'tests/stage3f-world-state-v1.test.js', 'tests/stage3f1-causal-trace-v1.test.js', 'tests/stage3f2-environment-calibration-v1.test.js',
  'tests/stage3f3-counterfactual-veto-ledger-v1.test.js', 'tests/stage3f4-shadow-experience-buffer-v1.test.js',
  'scripts/certify-stage3f0-world-state-contract.mjs', 'scripts/certify-stage3f1-causal-trace.mjs',
  'scripts/certify-stage3f2-environment-calibration.mjs', 'scripts/certify-stage3f3-counterfactual-veto-ledger.mjs',
  'scripts/certify-stage3f4-shadow-experience-buffer.mjs', 'artifacts/stage3f0-world-state-contract',
  'artifacts/stage3f1-causal-trace', 'artifacts/stage3f2-environment-calibration', 'artifacts/stage3f3-counterfactual-veto-ledger',
  'artifacts/stage3f4-shadow-experience-buffer'].map(prefix);
const STAGE3F5_HISTORICAL = ['artifacts/stage3f5-integrated-live-shadow', 'tests/stage3f5-integrated-live-shadow-v1.test.js',
  'scripts/certify-stage3f5-integrated-live-shadow.mjs', 'scripts/sentinel-observatory.mjs', 'src/stage3f/ascii-observatory-v1.js'].map(prefix);

const stage3f5Certificate = JSON.parse(await readFile(path.join(root, 'artifacts', 'stage3f5-integrated-live-shadow', 'stage3f5-certification-result.json'), 'utf8'));
const stage3f6Path = path.join(root, 'artifacts', 'stage3f6-prediction-reliability', 'stage3f6-certification-result.json');
const stage3f6Certificate = existsSync(stage3f6Path) ? JSON.parse(readFileSync(stage3f6Path, 'utf8')) : null;
const scope = {
  frozenStage3EArtifactsUnchanged: unchanged(...FROZEN_STAGE3E),
  stage3f0To3f4OwnerFilesUnchanged: unchanged(...STAGE3F0_TO_3F4_OWNERS),
  historicalStage3F5FilesUnchanged: unchanged(...STAGE3F5_HISTORICAL),
  historicalStage3F5CertificationHash: stage3f5Certificate.certificationHash === STAGE3F5_CERTIFICATION_HASH,
  stage3f6PartialCertificatePresent: stage3f6Certificate !== null,
  stage3f6PartialCertificateUnchanged: stage3f6Certificate === null
    || (stage3f6Certificate.certificationHash === STAGE3F6_CERTIFICATION_HASH && stage3f6Certificate.status === 'PARTIAL'),
};

/* ------------------------------------------------------------------ predecessors */
log('predecessor reproducibility');
const recovery = await certifyRecoveredStage3DE();
function predecessor(script) {
  const result = spawnSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  try { return result.status === 0 && JSON.parse(result.stdout).reproduced === true; } catch { return false; }
}
const replays = skipPredecessors ? { skipped: true } : {
  STAGE3E: recovery.status === 'PASS',
  STAGE3F0: predecessor('scripts/certify-stage3f0-world-state-contract.mjs'),
  STAGE3F1: predecessor('scripts/certify-stage3f1-causal-trace.mjs'),
  STAGE3F2: predecessor('scripts/certify-stage3f2-environment-calibration.mjs'),
  STAGE3F3: predecessor('scripts/certify-stage3f3-counterfactual-veto-ledger.mjs'),
  STAGE3F4: predecessor('scripts/certify-stage3f4-shadow-experience-buffer.mjs'),
};
const recoverySource = await readFile(path.join(root, 'src', 'lab', 'stage3de-recovery-canonicalization.js'), 'utf8');
// Comments are stripped before the check: the remediation documents what canonical certification no longer consults.
const recoveryCode = recoverySource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const predecessorReproducibility = {
  ephemeralCertificationDependencyRemoved: !/recoveredSourcePath/.test(recoveryCode) && !/\/private\/tmp\//.test(recoveryCode),
  canonicalManifestBound: recovery.adapter.manifestCompositeHash === recovery.hashes.stage3dV2bCandidate,
  optionalArchiveCheckNonGating: recovery.adapter.gating === false,
  archiveVerification: recovery.adapter.status,
  recoveryStatus: recovery.status, recoveryFailures: recovery.failures.map((entry) => entry.name),
  replays,
};

/* ------------------------------------------------------------------ router parity */
log('router binding and fixture parity');
const fixtures = H.loadFrozenFixtures();
const binding = H.routerBindingProbe(fixtures.model);
const fixtureParity = H.routerFixtureParity(fixtures);
const routerParity = {
  binding,
  CAL: { measured: fixtureParity.CAL.measured, expected: fixtureParity.CAL.expected, parity: fixtureParity.CAL.parity },
  HOLDOUT: { measured: fixtureParity.HOLDOUT.measured, expected: fixtureParity.HOLDOUT.expected, parity: fixtureParity.HOLDOUT.parity },
  OOD: { measured: fixtureParity.OOD.measured, expected: fixtureParity.OOD.expected, parity: fixtureParity.OOD.parity },
  holdoutRouteSignature: fixtureParity.holdoutRouteSignature, frozenRouteSignature: fixtureParity.frozenRouteSignature,
  routeSignatureParity: fixtureParity.routeSignatureParity, referenceRouterParity: fixtureParity.referenceRouterParity,
  sameSplitReplayUsedOnlyForExactParity: true,
};

/* ------------------------------------------------------------------ feature parity (diagnostic reference mode) */
log('reference feature parity harness');
const featureParity = await H.referenceFeatureParity({ fixtures, perPartitionQuota: 25 });

/* ------------------------------------------------------------------ abstention evidence */
log('abstention evidence');
function stepEvidence({ family, level, seed }) {
  const state = forgeAdapterState(createWorld(seed, generateScenario({ family, level, seed })));
  const direct = forgeWorldAdapter.step(state, forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID)[0], { observerId: FORGE_OBSERVER_ID });
  const started = beginIntegratedLiveShadowStep({ state });
  const completed = completeIntegratedLiveShadowStep(started);
  const experience = completed.experience;
  const eligibility = experience?.projection?.eligibilityByPurpose ?? {};
  return {
    routerRoute: started.router?.selectedRoute ?? null, routerScore: started.router?.score ?? null,
    traceExists: completed.trace !== null,
    recommendationAbstained: completed.trace?.decisionTimeEvent?.decisionTimeEvidence?.recommendation?.abstained ?? null,
    ledgerCreated: completed.ledger !== null,
    selectedActionComparison: completed.ledger?.projection?.selectedActions?.[0]?.comparisonStatus ?? null,
    counterfactualCount: completed.ledger?.projection?.counterfactuals?.length ?? null,
    ledgerEvaluationStatus: completed.ledger?.projection?.evaluations?.at(-1)?.status ?? null,
    experienceCreated: experience !== null, predictionCount: experience?.projection?.predictions?.length ?? null,
    validationStatus: experience?.projection?.validations?.at(-1)?.status ?? null,
    eligibility: Object.fromEntries(Object.entries(eligibility).map(([purpose, entry]) => [purpose,
      entry === null ? null : { status: entry.status, reasons: entry.reasons }])),
    predictionErrorStatus: experience?.projection?.predictionErrors?.at(-1)?.status ?? null,
    experienceBuffered: completed.experienceBuffer?.projection?.experiences?.length ?? 0,
    degradationStatus: completed.degradation.status, failures: completed.degradation.failures,
    incumbentTransitionUnchanged: started.transition.info.worldHash === direct.info.worldHash,
  };
}
const abstention = stepEvidence({ family: 'prime/adversarial_choice', level: 1, seed: 501 });
const proposing = stepEvidence({ family: 'archimedes/repair_network', level: 0, seed: 3 });
const abstentionEvidence = {
  abstained: abstention, proposing,
  abstentionLedgerCreated: abstention.ledgerCreated && abstention.selectedActionComparison === 'NO_SENTINEL_PROPOSAL' && abstention.counterfactualCount === 0,
  abstentionExperienceCreated: abstention.experienceCreated && abstention.validationStatus === 'VALIDATED' && abstention.experienceBuffered === 1,
  abstentionEvidenceChainComplete: abstention.traceExists && abstention.ledgerCreated && abstention.experienceCreated
    && abstention.eligibility.ROUTER_ANALYSIS?.status === 'ELIGIBLE'
    && ['PREDICTION_CALIBRATION', 'COUNTERFACTUAL_EVALUATION'].every((purpose) =>
      abstention.eligibility[purpose]?.status === 'INELIGIBLE' && abstention.eligibility[purpose].reasons.includes('DECISION_TIME_PREDICTION_REQUIRED')),
  abstentionTreatedAsInstrumentationFailure: abstention.degradationStatus !== 'HEALTHY' || abstention.failures.length > 0,
  proposingEvidenceIntact: proposing.counterfactualCount === 1 && proposing.predictionCount === 1 && proposing.degradationStatus === 'HEALTHY',
};

/* ------------------------------------------------------------------ campaign */
const campaign = runIntegratedLiveShadowCampaign();
const campaignReplay = runIntegratedLiveShadowCampaign();
function correctedRoute(family, level, seed) {
  const state = forgeWorldAdapter.cloneState({ ...forgeWorldAdapter.initialState(seed), world: createWorld(seed, generateScenario({ family, level, seed })), sequence: 0 });
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const preliminary = extractIntegratedStage3EFeatures(state, observation, null);
  const output = preliminary.selector.abstain ? preliminary.greedy : preliminary.selector;
  const candidate = { actionId: output.actionId, producerId: 'STAGE3F6R_ROUTE_PROBE', producerVersion: '1' };
  const evaluation = evaluateIntegratedStage3ERouter(extractIntegratedStage3EFeatures(state, observation, candidate).values, candidate);
  return { score: evaluation.score, selectedRoute: evaluation.selectedRoute };
}
const disagreement = campaign.episodes.find((entry) => entry.id === 'DISAGREEMENT');
const campaignEvidence = {
  deterministicReplay: campaign.campaignHash === campaignReplay.campaignHash, campaignHash: campaign.campaignHash,
  episodeCount: campaign.episodes.length,
  disagreementEpisode: { seed: disagreement.seed, actionMatch: disagreement.actionMatch, status: disagreement.status },
  originalDisagreementSeed11: correctedRoute('prime/adversarial_choice', 1, 11),
  replacementSeed12: correctedRoute('prime/adversarial_choice', 1, 12),
  disagreementPreserved: disagreement.actionMatch === 'DIFFERENT_ACTION',
};

/* ------------------------------------------------------------------ errata */
const errataFiles = {
  stage3f5: 'artifacts/stage3f6r-runtime-parity-remediation/erratum-stage3f5-integrated-live-shadow.json',
  stage3e: 'artifacts/stage3f6r-runtime-parity-remediation/erratum-stage3e-routability-intelligence.json',
};
const stage3f5Erratum = JSON.parse(await readFile(path.join(root, errataFiles.stage3f5), 'utf8'));
const stage3eErratum = JSON.parse(await readFile(path.join(root, errataFiles.stage3e), 'utf8'));
const errata = {
  stage3f5: { path: errataFiles.stage3f5, sha256: await fileHash(errataFiles.stage3f5),
    statusAfterErratum: stage3f5Erratum.statusAfterErratum, historicalArtifactModified: stage3f5Erratum.historicalArtifactModified,
    findings: stage3f5Erratum.findings.map((entry) => entry.id).sort(), guarantees: [...stage3f5Erratum.guaranteesRemainingValid].sort() },
  stage3e: { path: errataFiles.stage3e, sha256: await fileHash(errataFiles.stage3e),
    historicalArtifactsModified: stage3eErratum.historicalArtifactsModified, findings: stage3eErratum.findings.map((entry) => entry.id).sort() },
  valid: stage3f5Erratum.statusAfterErratum === 'SUPERSEDED' && stage3f5Erratum.historicalArtifactModified === false
    && stage3f5Erratum.findings.length === 4 && stage3f5Erratum.guaranteesRemainingValid.length === 5
    && stage3eErratum.historicalArtifactsModified === false && stage3eErratum.findings.length === 4,
};

/* ------------------------------------------------------------------ Stage 3F.6 diagnostic wording */
const stage3f6DocPath = path.join(root, 'docs', 'STAGE3F6_PREDICTION_RELIABILITY_BASELINE_V1.md');
const stage3f6Doc = existsSync(stage3f6DocPath) ? readFileSync(stage3f6DocPath, 'utf8') : '';
const stage3f6 = {
  originalPartialCertificateUnchanged: scope.stage3f6PartialCertificateUnchanged,
  currentDiagnosis: {
    PRIMARY_DIAGNOSIS: 'G_MIXED_LIMITATION_RUNTIME_PARITY_CONFOUNDED',
    ROUTER_VS_REPRESENTATION_DIAGNOSIS: 'H_INSUFFICIENT_EVIDENCE',
    CAPABILITY_GAP: 'NO_NON_PRIVILEGED_CONSEQUENCE_PREDICTOR',
    WORLD_STATE_RESULT: 'NO_MEASURED_IMPROVEMENT',
    WORLD_STATE_CANNOT_HELP: 'NOT_ESTABLISHED',
  },
  documentationWordingCorrected: ['G_MIXED_LIMITATION_RUNTIME_PARITY_CONFOUNDED', 'H_INSUFFICIENT_EVIDENCE',
    'NO_NON_PRIVILEGED_CONSEQUENCE_PREDICTOR', 'NO_MEASURED_IMPROVEMENT', 'WORLD_STATE_CANNOT_HELP=NOT_ESTABLISHED']
    .every((token) => stage3f6Doc.includes(token)),
  confirmatoryRerunRequired: true,
  confirmatoryRequirements: { NEW_HOLDOUT_SPLIT: true, NEW_OOD_SPLIT: true, TOPOLOGY_DISJOINT_BY_CONSTRUCTION: true, DISJOINT_SEED_SPACE: true },
  newStatisticalReliabilityClaimsInThisGate: false,
  splitsGeneratedInThisGate: false,
};

/* ------------------------------------------------------------------ tests */
let testMetrics = { total: -1, pass: -1, fail: -1, skip: -1 }; let testsStatus = null;
if (!skipTests) {
  log('parity tests');
  const tests = spawnSync(process.execPath, ['--test', 'tests/stage3f6r-runtime-parity.test.js'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const output = `${tests.stdout ?? ''}\n${tests.stderr ?? ''}`;
  const metric = (name) => Number(output.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
  testMetrics = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') };
  testsStatus = tests.status;
}

/* ------------------------------------------------------------------ certification */
const stage3f5Superseded = stage3f5Certificate.sourceHashes['src/stage3f/integrated-live-shadow-v1.js']
  !== await fileHash('src/stage3f/integrated-live-shadow-v1.js');
const checks = {
  SCOPE_FROZEN_STAGE3E_UNCHANGED: scope.frozenStage3EArtifactsUnchanged,
  SCOPE_STAGE3F0_TO_3F4_OWNERS_UNCHANGED: scope.stage3f0To3f4OwnerFilesUnchanged,
  SCOPE_HISTORICAL_STAGE3F5_UNCHANGED: scope.historicalStage3F5FilesUnchanged && scope.historicalStage3F5CertificationHash,
  SCOPE_STAGE3F6_PARTIAL_PRESERVED: scope.stage3f6PartialCertificateUnchanged,
  ROUTER_WEIGHT_COUNT: binding.weightCountCorrect,
  ROUTER_BIAS_BINDING: binding.biasBindingCorrect,
  ROUTER_WEIGHT_BINDING: binding.weightBindingCorrect,
  ROUTER_FAILS_CLOSED: binding.incompleteInputFailsClosed && binding.nonFiniteInputFailsClosed,
  ROUTER_FIXTURE_PARITY: routerParity.referenceRouterParity,
  REFERENCE_FEATURE_PARITY: featureParity.summary.referenceFeatureParity,
  FEATURE_DEPENDENCY_COUNTS: featureParity.summary.multiStepFrozenFeatureCount === 7
    && featureParity.summary.simulatorDependentFeatureCount === 20 && featureParity.summary.v2bDependentFeatureCount === 5,
  DEPLOYABLE_MODE_NOT_SILENTLY_ADOPTED: INTEGRATED_RUNTIME_REMEDIATION.deployableStage3EFeatureParity === false
    && INTEGRATED_RUNTIME_REMEDIATION.deployableRuntimeFeatureContractRequiresRedesign === true
    && H.STAGE3F6R_FEATURE_MODES.REFERENCE_PARITY_MODE.oneStepRuntimeSafe === false
    && H.STAGE3F6R_FEATURE_MODES.REFERENCE_PARITY_MODE.simulatorFree === false,
  ABSTENTION_LEDGER_CREATED: abstentionEvidence.abstentionLedgerCreated,
  ABSTENTION_EXPERIENCE_CREATED: abstentionEvidence.abstentionExperienceCreated,
  ABSTENTION_EVIDENCE_CHAIN_COMPLETE: abstentionEvidence.abstentionEvidenceChainComplete,
  ABSTENTION_NOT_INSTRUMENTATION_FAILURE: abstentionEvidence.abstentionTreatedAsInstrumentationFailure === false,
  ABSTENTION_DOES_NOT_ALTER_INCUMBENT: abstention.incumbentTransitionUnchanged && proposing.incumbentTransitionUnchanged,
  PROPOSING_EVIDENCE_INTACT: abstentionEvidence.proposingEvidenceIntact,
  CAMPAIGN_DETERMINISTIC: campaignEvidence.deterministicReplay && campaignEvidence.disagreementPreserved,
  EPHEMERAL_DEPENDENCY_REMOVED: predecessorReproducibility.ephemeralCertificationDependencyRemoved,
  CANONICAL_MANIFEST_BOUND: predecessorReproducibility.canonicalManifestBound,
  OPTIONAL_ARCHIVE_CHECK_NON_GATING: predecessorReproducibility.optionalArchiveCheckNonGating,
  PREDECESSOR_REPLAYS: !skipPredecessors && Object.values(replays).every(Boolean),
  STAGE3F5_SUPERSEDED_RECORDED: stage3f5Superseded && errata.stage3f5.statusAfterErratum === 'SUPERSEDED',
  ERRATA_ADDITIVE_AND_COMPLETE: errata.valid,
  STAGE3F6_DIAGNOSIS_WORDING: stage3f6.documentationWordingCorrected,
  TESTS_PASS: !skipTests && testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0,
  AUTHORITY_R0: INTEGRATED_LIVE_SHADOW_CONTRACT.authority.tier === 'R0'
    && INTEGRATED_LIVE_SHADOW_CONTRACT.authority.canDispatch === false
    && INTEGRATED_LIVE_SHADOW_CONTRACT.authority.canMutateLiveWorld === false,
  NO_TRAINING: INTEGRATED_LIVE_SHADOW_CONTRACT.modelTrainingPerformed === false
    && INTEGRATED_LIVE_SHADOW_CONTRACT.onlineLearningEnabled === false,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = {
  schemaVersion: 1, gate: 'STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION', status,
  remediation: INTEGRATED_RUNTIME_REMEDIATION,
  scope, predecessorReproducibility, routerParity,
  featureParity: { modes: featureParity.modes, sampleSource: featureParity.sampleSource, sampleSize: featureParity.sampleSize,
    frozenExtractorSourceSha256: featureParity.frozenExtractorSourceSha256, summary: featureParity.summary, perFeature: featureParity.perFeature },
  abstentionEvidence, campaign: campaignEvidence, errata,
  stage3f5: { historicalCertificationHash: STAGE3F5_CERTIFICATION_HASH, historicalArtifactUnchanged: scope.historicalStage3F5FilesUnchanged,
    status: 'SUPERSEDED', supersededConfirmed: stage3f5Superseded, remediatedIntegratedRuntimeCertified: status === 'PASS',
    scopeOfRemediatedCertification: ['ROUTER_EQUATION_BINDING_PARITY', 'ABSTENTION_EVIDENCE_PRESERVATION', 'AUTHORITY_AND_LEARNING_BOUNDARY', 'DETERMINISTIC_CAMPAIGN_REPLAY'],
    notCertified: ['DEPLOYABLE_STAGE3E_FEATURE_PARITY', 'PREDICTION_RELIABILITY', 'STATISTICAL_CLAIMS'] },
  stage3f6, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(await Promise.all([
    'src/stage3f/integrated-live-shadow-v1.js', 'src/lab/stage3de-recovery-canonicalization.js',
    'scripts/stage3f6r-reference-parity-harness.mjs', 'scripts/certify-stage3f6r-runtime-parity.mjs',
    'tests/stage3f6r-runtime-parity.test.js',
  ].map(async (file) => [file, await fileHash(file)]))),
  authority: INTEGRATED_LIVE_SHADOW_CONTRACT.authority,
  learning: { modelTrainingPerformed: false, weightsUpdated: false, routerRetrained: false, onlineLearningEnabled: false, newPredictiveModelCreated: false },
  roadmap: {
    readyForConfirmatoryStage3F6: false,
    readyForStage3G: false,
    blockers: ['CONFIRMATORY_STAGE3F6_REQUIRES_NEW_TOPOLOGY_DISJOINT_HOLDOUT_AND_OOD_SPLITS',
      'DEPLOYABLE_RUNTIME_FEATURE_CONTRACT_REQUIRES_REDESIGN_DECISION'],
    nextRecommendedAction: 'Decide the deployable runtime feature-contract research scope, then authorize generation of fresh topology-disjoint, disjoint-seed HOLDOUT/OOD splits for a confirmatory Stage 3F.6.',
  },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6R_CERTIFICATION', reproduced, status,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(outDirectory, { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, checks, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
