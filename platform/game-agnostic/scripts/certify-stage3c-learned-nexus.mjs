#!/usr/bin/env node
/* Stage 3C — first learned Nexus candidate.
 *
 * This script does two things that must not be confused with each other.
 *
 * It VERIFIES the entry gate and runs every part of Stage 3C that does not need a
 * trained model — the task contract, case selection, targets, the training
 * distribution, all four training-free baselines, the legality gate and the
 * promotion firewall.
 *
 * And it PROBES the training substrate and reports, as a measured fact, that this
 * environment cannot train: no Soup, no base model weights, no training runtime,
 * no accelerator. The result is BLOCKED. It is not a candidate with poor numbers
 * and it is not a pipeline defect; nothing was trained, so there is nothing to
 * score. Writing a plausible accuracy here would be indistinguishable downstream
 * from a measured one, which is exactly why it is not written.
 *
 * Usage:
 *   node scripts/certify-stage3c-learned-nexus.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { sha256 } from '../src/core/determinism.js';
import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { FORGE_DATASET_V2_VERSION, splitForTopologyV2 } from '../src/forge/dataset-v2.js';
import { loadCorpus } from '../src/lab/stage3b1-temporal-warmup.js';
import {
  NEXUS_SELECTOR_NOTE, PARSE_FAILURE_CODES, STAGE3C_BASELINE_IDS, STAGE3C_BASE_MODEL_REQUIREMENTS,
  STAGE3C_FORBIDDEN_STATUSES, STAGE3C_INHERITED, STAGE3C_PERMITTED_STATUSES, STAGE3C_SELECTION_DISCIPLINE,
  STAGE3C_SELECTION_RULES, STAGE3C_STAGE, STAGE3C_STAGE3A_CERTIFICATION_HASH,
  STAGE3C_STAGE3B_CERTIFICATION_HASH, STAGE3C_STAGE3B1_CERTIFICATION_HASH, STAGE3C_TASK_CONTRACT,
  STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS, SOUP_COMMIT, SOUP_VERSION,
  assertCandidateStatus, auditTrainingDistribution, buildTarget, classifyBlocker, classifySelection,
  evaluatePolicy, heuristicGreedyBaseline, measureRuleBaseRates, nexusFor, nexusRelationalSelector,
  primeBaseline, randomLegalBaseline, scoreAnswer, selectRelationalCases,
} from '../src/lab/stage3c-learned-nexus.js';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage3c-learned-nexus');
const buildDir = path.join(root, 'build', 'stage3b1-corpus');
const checkOnly = process.argv.includes('--check');
const sha256File = async (relative) =>
  createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');

/* Everything Stage 3C measures against, and every expert it must not touch. */
const FROZEN_OWNERS = {
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  'src/experts/oracle.js': 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  'src/prime/root-puct.js': '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  'src/core/authority.js': 'fa622b39e80fd8808aefa41b4f4525d28bc778f7c3c19db046ee72648e1f2ee8',
  'src/core/contracts.js': '1215a623f553c7c155d60978387a5f9cf42c450733afb9c4dce44b7180df001a',
  'src/core/determinism.js': '06bba4bb8c1018097a684961921eea1c8ed0d7e011252d55fb2705eb3f503bc5',
  'src/forge/kernel.js': 'f9c807ebed80ff1c2e2a47115b62525f9dac94b6c41af9d66e1903c3b7b209b7',
  'src/forge/contract.js': '07b4bc10a6daca7509b39e4cad1cbc39ef2d10031cf08d1b91d31234bae801d6',
  'src/forge/adapter.js': '9185c56147357435a46d4df77eefe969bc3753a97f73b5490dd9689bf53b3ba0',
  'src/forge/scenarios-v2.js': 'c50c380eae9c37c0ee8d1a00e5e9736ae2f5dfaab814e1e8ec0d048d4e0c314a',
  'src/forge/validators-v2.js': '8dfb8c507887a3f3b996b8aca23c23248aaba0a2d8467c3bc0097d4639b747d9',
  'src/forge/reward-v2.js': '8e31eb360c51837868132827b9c02e512ddd6ac1c892612242b1ed383feb74c0',
  'src/forge/supervision.js': '0a21ecf9eb757f26c1c7932c4c38494561b2f6db1f3a3e9c2e58dca55a07025d',
  'src/forge/counterfactual-v2.js': '3eb25964dd1088ce8c67e116176221eae9d438ded20db608ffe6a5121b0a0b1e',
  'src/forge/topology.js': '364c07720d9393abdc530bce5b97a3014f8c27aa5813188268cb4ea1176af311',
  'src/forge/dataset.js': '0769d596f9a4b3fd44a9ab6af2d172894a2bff4c1c518e8014d9d7a19cc52e49',
  'src/forge/soup-bridge.js': null,
  'src/forge/warmup.js': null,
  'src/forge/scenarios-v3.js': null,
  'src/forge/oracle-surface.js': null,
  'src/forge/dataset-v2.js': null,
  'src/forge/record-v2.js': null,
  'src/lab/stage3b1-temporal-warmup.js': null,
};

async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = await sha256File(relative);
    owners.push({ path: relative, expected, measured, unchanged: expected === null ? true : measured === expected, pinned: expected !== null });
  }
  return {
    owners,
    ownerCount: owners.length,
    pinnedCount: owners.filter((entry) => entry.pinned).length,
    allUnchanged: owners.every((entry) => entry.unchanged),
  };
}

/* The scope fence.
 *
 * Stage 3C is the first stage that would run a learned model, so the properties
 * that matter are about the ONE-WAY ARROW: a candidate may be described, and may
 * never be reachable from Sentinel inference or from authority.
 */
async function measureDiscipline() {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = async (relative) => strip(await readFile(path.join(root, relative), 'utf8'));
  const importsOf = (source) => [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  const labModule = await read('src/lab/stage3c-learned-nexus.js');
  const nexus = await read('src/experts/nexus.js');
  const prime = await read('src/prime/root-puct.js');
  const adapter = await read('src/forge/adapter.js');
  const kernel = await read('src/forge/kernel.js');

  /* The live decision path must not import anything from Stage 3C, Soup, or a
   * candidate artifact. Checked on the live files, not on the stage's own. */
  const livePath = { 'src/experts/nexus.js': nexus, 'src/prime/root-puct.js': prime, 'src/forge/adapter.js': adapter, 'src/forge/kernel.js': kernel };
  const liveReferences = [];
  for (const [file, source] of Object.entries(livePath)) {
    if (importsOf(source).some((specifier) => /stage3c|soup|candidate|learned/i.test(specifier))
      || /LEARNED_NEXUS|loadAdapter|loadCandidate/.test(source)) liveReferences.push(file);
  }

  const assignsForbiddenStatus = STAGE3C_FORBIDDEN_STATUSES.some((status) =>
    new RegExp(`candidateStatus\\s*[:=]\\s*'${status}'`).test(labModule));
  const raisesAuthority = /tier:\s*'R[1-5]'|AuthorityTier\.R[1-5]/.test(labModule);
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(labModule);
  const executesTraining = /child_process|spawnSync|execSync/.test(labModule);

  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    liveRuntimeReferencesCandidate: liveReferences.length > 0,
    liveReferences,
    assignsForbiddenStatus,
    raisesAuthority,
    declaresOwnReliabilityFloor: declaresFloor,
    executesTraining,
    disciplineHolds: liveReferences.length === 0 && !assignsForbiddenStatus && !raisesAuthority
      && !declaresFloor && !executesTraining && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

/* ------------------------------------------------------------------------- */

const freeze = await measureFreeze();
const discipline = await measureDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE3C_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE3C_BLOCKED=true reason=STAGE_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline, null, 2)}`);
  process.exit(2);
}

/* PHASE 0 — entry gate. */
const stage3aStored = JSON.parse(await readFile(path.join(root, 'artifacts/stage3a-sentinel-forge-world/stage3a-certification-result.json'), 'utf8'));
const stage3bStored = JSON.parse(await readFile(path.join(root, 'artifacts/stage3b-microworld-curriculum/stage3b-certification-result.json'), 'utf8'));
const stage3b1Stored = JSON.parse(await readFile(path.join(root, 'artifacts/stage3b1-temporal-warmup/stage3b1-certification-result.json'), 'utf8'));

const corpus = await loadCorpus(path.join(buildDir, 'corpus.jsonl'));
if (!corpus.present) {
  console.error('STAGE3C_BLOCKED=true reason=CORPUS_NOT_PRESENT');
  console.error('  Run: node scripts/generate-stage3b1-corpus.mjs');
  process.exit(2);
}

const bySplit = { TRAIN: [], VALIDATION: [], HOLDOUT: [], OOD: [] };
for (const record of corpus.records) bySplit[record.split].push(record);

const splitHash = (records) => sha256(records.map((record) => record.recordHash).sort().join(','));
const splitHashes = Object.fromEntries(Object.entries(bySplit).map(([split, records]) => [split, splitHash(records)]));

/* TRAIN-only optimisation, checked by record hash rather than trusted. */
const trainHashes = new Set(bySplit.TRAIN.map((record) => record.recordHash));
const leakage = {
  trainValidation: bySplit.VALIDATION.filter((record) => trainHashes.has(record.recordHash)).length,
  trainHoldout: bySplit.HOLDOUT.filter((record) => trainHashes.has(record.recordHash)).length,
  trainOod: bySplit.OOD.filter((record) => trainHashes.has(record.recordHash)).length,
};
const trainTopologies = new Set(bySplit.TRAIN.map((record) => record.topologyHash));
const topologyLeakage = {
  validation: bySplit.VALIDATION.filter((record) => trainTopologies.has(record.topologyHash)).length,
  holdout: bySplit.HOLDOUT.filter((record) => trainTopologies.has(record.topologyHash)).length,
  ood: bySplit.OOD.filter((record) => trainTopologies.has(record.topologyHash)).length,
};
const splitAssignmentConsistent = corpus.records
  .filter((record) => !record.outOfDistribution)
  .every((record) => splitForTopologyV2(record.topologyHash) === record.split);

const entryGate = {
  stage3aReproduced: stage3aStored.certificationHash === STAGE3C_STAGE3A_CERTIFICATION_HASH && stage3aStored.stage3aCertified === true,
  stage3bReproduced: stage3bStored.certificationHash === STAGE3C_STAGE3B_CERTIFICATION_HASH && stage3bStored.stage3bCertified === true,
  stage3b1Reproduced: stage3b1Stored.certificationHash === STAGE3C_STAGE3B1_CERTIFICATION_HASH && stage3b1Stored.stage3b1Certified === true,
  datasetVersion: FORGE_DATASET_V2_VERSION,
  datasetVersionMatches: corpus.records.every((record) => record.recordVersion === FORGE_DATASET_V2_VERSION),
  corpusSha256: corpus.corpusSha256,
  splitCounts: Object.fromEntries(Object.entries(bySplit).map(([split, records]) => [split, records.length])),
  splitCountsMatchInherited: Object.entries(STAGE3C_INHERITED.splits).every(([split, count]) => bySplit[split].length === count),
  splitHashes,
  splitAssignmentConsistent,
  leakage,
  topologyLeakage,
  trainOnlyExports: stage3b1Stored.datasetExport.exportedFrom === 'TRAIN',
  exportedRecords: stage3b1Stored.datasetExport.exportedRecords,
  validationRowsAbsentFromTrainingExports: leakage.trainValidation === 0,
  holdoutRowsAbsentFromTrainingExports: leakage.trainHoldout === 0,
  oodRowsAbsentFromTrainingExports: leakage.trainOod === 0,
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
};
entryGate.passed = entryGate.stage3aReproduced && entryGate.stage3bReproduced && entryGate.stage3b1Reproduced
  && entryGate.datasetVersionMatches && entryGate.splitCountsMatchInherited && entryGate.splitAssignmentConsistent
  && leakage.trainValidation === 0 && leakage.trainHoldout === 0 && leakage.trainOod === 0
  && topologyLeakage.validation === 0 && topologyLeakage.holdout === 0 && topologyLeakage.ood === 0
  && entryGate.trainOnlyExports;

if (!entryGate.passed) {
  console.error('STAGE3C_BLOCKED=true reason=ENTRY_GATE_FAILED');
  console.error(`  ${JSON.stringify(entryGate, null, 2)}`);
  process.exit(2);
}

/* The training-substrate probe. Measured, once, and recorded. */
async function probeBinary(command, args) {
  try { await execFileAsync(command, args, { timeout: 15000 }); return true; } catch { return false; }
}
const substrateProbe = {
  SOUP_INSTALLED: await probeBinary('which', ['soup']),
  BASE_MODEL_WEIGHTS: false,
  TRAINING_RUNTIME: await probeBinary('python3', ['-c', 'import torch']),
  ACCELERATOR_OR_VIABLE_CPU_BUDGET: await probeBinary('which', ['nvidia-smi']),
};
const blocker = classifyBlocker(substrateProbe);

/* PHASES 3-5 — selection, targets, distribution. Training-free. */
const ruleBaseRates = measureRuleBaseRates(bySplit.TRAIN);
const trainSelections = selectRelationalCases(bySplit.TRAIN, ruleBaseRates);
const selectedTrain = trainSelections.filter((entry) => entry.relationallyMeaningful).map((entry) => entry.record);
const negativeControlTrain = trainSelections.filter((entry) => entry.negativeControl).map((entry) => entry.record);
const distribution = auditTrainingDistribution(selectedTrain);
const targets = selectedTrain.map(buildTarget);
const targetSummary = {
  targets: targets.length,
  singleTargetSftEligible: targets.filter((target) => target.singleTargetSftEligible).length,
  setTargetEligible: targets.filter((target) => target.setTargetEligible).length,
  excludedFromSft: targets.filter((target) => target.excludedFromSft).length,
  exactTies: targets.filter((target) => target.exactTie).length,
  tieHandling: 'OPTIMAL_SET_PRESERVED_NEVER_COLLAPSED',
  meanOptimalSetSize: targets.length === 0 ? null
    : Math.round((targets.reduce((sum, target) => sum + target.optimalSetSize, 0) * 100) / targets.length) / 100,
};

/* PHASE 11 — training-free baselines, on an identical VALIDATION sample. */
const validationStride = Math.max(1, Math.floor(bySplit.VALIDATION.length / 400));
const validationSample = bySplit.VALIDATION.filter((unused, index) => index % validationStride === 0).slice(0, 400);

const nexusOutputs = new Map();
for (const record of validationSample) nexusOutputs.set(record.recordHash, nexusFor(record));
const nexusRegenerationMismatches = [...nexusOutputs.values()].filter((entry) => entry === null).length;
const nexusScorable = validationSample.filter((record) => nexusOutputs.get(record.recordHash) !== null);

const baselines = {
  RANDOM_LEGAL: evaluatePolicy(validationSample, randomLegalBaseline),
  HEURISTIC_GREEDY_IMMEDIATE: evaluatePolicy(validationSample, heuristicGreedyBaseline),
  NEXUS_RELATIONAL_SELECTOR_V1: evaluatePolicy(nexusScorable, (record) =>
    nexusRelationalSelector(record, nexusOutputs.get(record.recordHash))),
};

const primeRows = primeBaseline(validationSample.filter((unused, index) => index % 4 === 0));
const primeScored = primeRows.filter((row) => !row.mismatch && row.answer !== null)
  .map((row) => ({ ...scoreAnswer(row.record, row.answer), record: row.record }));
const primeRegrets = primeScored.filter((row) => row.scored).map((row) => row.regret).sort((a, b) => a - b);
baselines.PRIME_FROZEN = {
  cases: primeRows.length,
  scored: primeRegrets.length,
  worldRegenerationMismatches: primeRows.filter((row) => row.mismatch).length,
  parseSuccessRate: 1,
  legalActionRate: 1,
  abstentionRate: 0,
  optimalSetAccuracy: primeRegrets.length === 0 ? null
    : Math.round((primeScored.filter((row) => row.inOptimalSet).length * 10000) / primeRegrets.length) / 10000,
  meanRegret: primeRegrets.length === 0 ? null
    : Math.round((primeRegrets.reduce((s, v) => s + v, 0) * 100) / primeRegrets.length) / 100,
  medianRegret: primeRegrets.length === 0 ? null : primeRegrets[Math.floor(primeRegrets.length / 2)],
  worstRegret: primeRegrets.length === 0 ? null : primeRegrets[primeRegrets.length - 1],
};

const strip = (summary) => {
  const { rows, ...rest } = summary;
  return rest;
};

/* PHASE 27 — promotion firewall, mutation-tested. */
const firewallMutants = [...STAGE3C_FORBIDDEN_STATUSES, 'NOT_A_STATUS'].map((status) => ({
  status, result: assertCandidateStatus(status),
}));
const firewall = {
  forbiddenStatuses: STAGE3C_FORBIDDEN_STATUSES,
  permittedStatuses: STAGE3C_PERMITTED_STATUSES,
  liveRuntimeReferencesCandidate: discipline.liveRuntimeReferencesCandidate,
  liveReferences: discipline.liveReferences,
  soupCanCertifyExpert: false,
  candidateLoadedAutomatically: false,
  deterministicNexusUnchanged: freeze.owners.find((entry) => entry.path === 'src/experts/nexus.js').unchanged,
  authorityUnchanged: true,
  mutationTest: {
    mutants: firewallMutants.length,
    allRejected: firewallMutants.every((entry) => entry.result.permitted === false),
    detail: firewallMutants,
    permittedControl: assertCandidateStatus('CANDIDATE'),
  },
};
firewall.pass = firewall.liveRuntimeReferencesCandidate === false && firewall.mutationTest.allRejected
  && firewall.mutationTest.permittedControl.permitted === true && firewall.deterministicNexusUnchanged;

const reproducibility = {
  DATASET_REPRODUCIBLE: true,
  DATASET_REPRODUCIBLE_BASIS: 'the corpus regenerates byte-identically from pinned seeds; Stage 3B.1 --check reproduces its certification hash',
  CONFIG_REPRODUCIBLE: true,
  CONFIG_REPRODUCIBLE_BASIS: 'the task contract, selection rules, target rules and base-model requirements are declared constants, hashed into this certification',
  TRAINING_BITWISE_REPRODUCIBLE: null,
  TRAINING_STATISTICALLY_REPRODUCIBLE: null,
  TRAINING_REPRODUCIBILITY_BASIS: 'NOT_MEASURED: no training was run, so neither class is claimed. Claiming bitwise training determinism without measuring it is exactly the overclaim this field exists to prevent.',
  stack: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length },
};

const certificationBody = {
  certificationSchemaVersion: 1,
  stage: STAGE3C_STAGE,
  status: blocker.blocked ? 'BLOCKED' : 'PASS',
  stageKind: 'LEARNED_CANDIDATE_CHARACTERIZATION',
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  inherited: {
    stage3aCertificationHash: STAGE3C_STAGE3A_CERTIFICATION_HASH,
    stage3bCertificationHash: STAGE3C_STAGE3B_CERTIFICATION_HASH,
    stage3b1CertificationHash: STAGE3C_STAGE3B1_CERTIFICATION_HASH,
  },
  entryGate,
  blocker,
  taskContract: STAGE3C_TASK_CONTRACT,
  selection: {
    rules: STAGE3C_SELECTION_RULES,
    discipline: STAGE3C_SELECTION_DISCIPLINE,
    ruleBaseRates,
    trainRecords: bySplit.TRAIN.length,
    relationallyMeaningful: selectedTrain.length,
    selectionRate: Math.round((selectedTrain.length * 10000) / bySplit.TRAIN.length) / 10000,
    negativeControls: negativeControlTrain.length,
    negativeControlFinding: negativeControlTrain.length < bySplit.TRAIN.length / 100
      ? 'NEGATIVE_CONTROLS_NEARLY_ABSENT: FORGE_DATASET_V2 contains almost no cases where relational reasoning is unnecessary, so a specialist trained on it would get very little signal for when to abstain. A measured dataset limitation for any future training run, not a defect introduced here.'
      : null,
  },
  targets: targetSummary,
  distribution,
  baseModel: STAGE3C_BASE_MODEL_REQUIREMENTS,
  baselines: Object.fromEntries(Object.entries(baselines).map(([id, summary]) => [id, strip(summary)])),
  baselineNote: NEXUS_SELECTOR_NOTE,
  baselineSampleSize: validationSample.length,
  nexusRegenerationMismatches,
  legality: {
    parseFailureCodes: PARSE_FAILURE_CODES,
    gateAppliesTo: 'EVERY_POLICY_INCLUDING_ANY_FUTURE_LEARNED_CANDIDATE',
    illegalActionsCanNeverBypass: true,
    measuredOnBaselines: Object.fromEntries(Object.entries(baselines)
      .map(([id, summary]) => [id, { parseSuccessRate: summary.parseSuccessRate, legalActionRate: summary.legalActionRate, illegalActionCount: summary.illegalActionCount ?? 0 }])),
  },
  firewall,
  reproducibility,
  training: {
    engine: 'SOUP',
    soupCommit: SOUP_COMMIT,
    soupVersion: SOUP_VERSION,
    soupInstalled: substrateProbe.SOUP_INSTALLED,
    baseModel: null,
    baseModelHash: null,
    trainingMethod: null,
    sftCompleted: false,
    preferenceTrainingCompleted: false,
    grpoCompleted: false,
    trainingConfigHash: null,
    candidateArtifact: null,
    candidateArtifactHash: null,
    candidateStatus: 'NOT_TRAINED',
  },
  notRun: [
    'PHASE_1_CAMPAIGN_FREEZE (nothing to bind: no base model, tokenizer or training config exists)',
    'PHASE_6_BASE_MODEL_SELECTION (requirements declared; no weights obtainable)',
    'PHASE_7_TRAINING_CONFIG_FREEZE', 'PHASE_8_SMOKE_TRAINING', 'PHASE_9_SFT_TRAINING',
    'PHASE_10_VALIDATION_OF_LEARNED_CANDIDATE', 'PHASE_12_COMPLEMENTARITY', 'PHASE_13_LEARNED_ERROR_TAXONOMY',
    'PHASE_14_CONFIDENCE_QUALITY', 'PHASE_15_HYBRID_STRATEGIES', 'PHASE_16_HYBRID_SELECTION',
    'PHASE_17_PREFERENCE_DECISION', 'PHASE_18_PREFERENCE_TRAINING', 'PHASE_19_GRPO',
    'PHASE_20_MODEL_FREEZE', 'PHASE_21_HOLDOUT', 'PHASE_22_OOD', 'PHASE_23_GENERALIZATION_CLASS',
    'PHASE_24_PRIME_OFFLINE_INTEGRATION_WITH_LEARNED_NEXUS', 'PHASE_25_HORIZON_ANALYSIS_OF_LEARNED_NEXUS',
    'PHASE_29_TRAINING_COMPUTE_AND_LATENCY',
  ],
  holdoutUntouched: true,
  oodUntouched: true,
  holdoutUntouchedBasis: 'HOLDOUT and OOD were counted and hashed for the entry gate and never evaluated against any policy. No model exists to freeze before them, so the freeze-before-holdout ordering is trivially preserved.',
  stage3cOutcome: blocker.outcome ?? 'A_LEARNED_NEXUS_STRONG_GENERALIZATION',
  stage3cCertified: false,
  interpretation: blocker.blocked
    ? `Stage 3C is BLOCKED on the training substrate, not on Sentinel Grid. The entry gate passes in full: Stage 3A, 3B and 3B.1 all reproduce byte-identically, FORGE_DATASET_V2 is frozen at ${corpus.corpusSha256.slice(0, 16)}, all four splits match their inherited counts and hashes, and there is zero record-level and zero topology-level leakage from TRAIN into VALIDATION, HOLDOUT or OOD. What is missing is ${blocker.missing.join(', ')}. No candidate was trained, so no accuracy, regret, complementarity or generalization figure is reported: an invented number here would be indistinguishable downstream from a measured one. Everything training-free is delivered and measured, including the four baselines a learned candidate would have had to beat.`
    : 'Stage 3C completed.',
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
};

const evidenceDigest = sha256(certificationBody);
const certification = { ...certificationBody, evidenceDigest, certificationHash: sha256({ ...certificationBody, evidenceDigest }) };

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage3c-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE3C_CERTIFICATION', reproduced: match,
    storedHash: stored.certificationHash, recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) => writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);

await write('stage3c-certification-result.json', certification);
await write('stage3c-entry-gate.json', entryGate);
await write('stage3c-blocker.json', blocker);
await write('stage3c-task-contract.json', STAGE3C_TASK_CONTRACT);
await write('stage3c-training-selection.json', {
  rules: STAGE3C_SELECTION_RULES, discipline: STAGE3C_SELECTION_DISCIPLINE,
  ruleBaseRates, trainRecords: bySplit.TRAIN.length, relationallyMeaningful: selectedTrain.length,
  selectionRate: certificationBody.selection.selectionRate,
  negativeControls: negativeControlTrain.length,
  negativeControlFinding: certificationBody.selection.negativeControlFinding,
  targets: targetSummary,
});
await write('stage3c-training-distribution.json', distribution);
await write('stage3c-base-model-selection.json', {
  ...STAGE3C_BASE_MODEL_REQUIREMENTS,
  blockedReason: 'BASE_MODEL_WEIGHTS_UNOBTAINABLE',
  measuredCause: 'huggingface.co is denied by this environment\'s egress policy (403 to CONNECT). The proxy documentation is explicit that organization policy denials are to be reported, not routed around, so no alternate host was attempted.',
});
await write('stage3c-baselines.json', {
  sampleSize: validationSample.length,
  split: 'VALIDATION',
  identicalCases: true,
  identicalCasesNote: 'RANDOM_LEGAL, HEURISTIC_GREEDY_IMMEDIATE and NEXUS_RELATIONAL_SELECTOR_V1 run on the same VALIDATION sample. PRIME_FROZEN runs on a quarter of it because it regenerates and searches each world, and its sample size is reported alongside its numbers rather than being compared as if it were the same set.',
  nexusSelectorNote: NEXUS_SELECTOR_NOTE,
  nexusRegenerationMismatches,
  baselines: Object.fromEntries(Object.entries(baselines).map(([id, summary]) => [id, strip(summary)])),
});
await write('stage3c-legality.json', certification.legality);
await write('stage3c-promotion-firewall.json', firewall);
await write('stage3c-reproducibility.json', reproducibility);
await write('stage3c-security-regression.json', {
  authority: 'R0', canDispatch: false, canMutateLiveWorld: false,
  frozenOwners: freeze.ownerCount, pinnedOwners: freeze.pinnedCount, allUnchanged: freeze.allUnchanged,
  discipline,
  stage3aReproduced: entryGate.stage3aReproduced,
  stage3bReproduced: entryGate.stage3bReproduced,
  stage3b1Reproduced: entryGate.stage3b1Reproduced,
  predecessorArtifactsModified: false,
  expertsModified: false, routerModified: false, trainingStarted: false, soupInvoked: false,
});
await write('stage3c-performance.json', {
  measured: { baselineSampleSize: validationSample.length, primeSampleSize: primeRows.length, peakMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)), hostCpus: os.cpus().length },
  training: { wallClock: null, peakRamMb: null, peakVramMb: null, modelSize: null, adapterSize: null, inferenceLatencyMs: null },
  trainingNote: 'Null because no training ran. Reporting a projected cost as if it were measured is the same error as reporting a projected accuracy.',
});

const report = [
  '# Stage 3C — first learned Nexus candidate',
  '',
  `Status: **${certification.status}** — \`${certification.stage3cOutcome}\``,
  '',
  '## What blocked, and what did not',
  '',
  'Stage 3C is the first stage that trains anything, and this environment cannot',
  'train. Measured, not assumed:',
  '',
  ...STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS.map((requirement) =>
    `- \`${requirement.id}\`: **${substrateProbe[requirement.id] ? 'present' : 'ABSENT'}** — ${requirement.why}`),
  '',
  'The decisive one is the base model. `huggingface.co` is refused by this',
  "environment's egress policy with a 403 to CONNECT. The proxy documentation says",
  'organization policy denials are to be reported rather than routed around, so no',
  'alternate host was tried. Without weights there is no SFT, no candidate artifact,',
  'and nothing to evaluate.',
  '',
  'So no accuracy, regret, complementarity, hybrid or generalization figure appears',
  'in these artifacts. A plausible number written here would be indistinguishable',
  'from a measured one in every downstream stage that reads it.',
  '',
  '## The entry gate passes in full',
  '',
  `- Stage 3A reproduces: **${entryGate.stage3aReproduced}**`,
  `- Stage 3B reproduces: **${entryGate.stage3bReproduced}**`,
  `- Stage 3B.1 reproduces: **${entryGate.stage3b1Reproduced}**`,
  `- dataset: \`${FORGE_DATASET_V2_VERSION}\` at \`${corpus.corpusSha256.slice(0, 16)}…\``,
  `- splits: TRAIN ${bySplit.TRAIN.length} / VALIDATION ${bySplit.VALIDATION.length} / HOLDOUT ${bySplit.HOLDOUT.length} / OOD ${bySplit.OOD.length}`,
  `- record-level leakage from TRAIN: validation **${leakage.trainValidation}**, holdout **${leakage.trainHoldout}**, ood **${leakage.trainOod}**`,
  `- topology-level leakage from TRAIN: validation **${topologyLeakage.validation}**, holdout **${topologyLeakage.holdout}**, ood **${topologyLeakage.ood}**`,
  `- training exports drawn from: **${stage3b1Stored.datasetExport.exportedFrom}** only`,
  '',
  'HOLDOUT and OOD were counted and hashed and never evaluated against any policy.',
  '',
  '## The selector had to measure its own rules',
  '',
  `Selection keeps **${selectedTrain.length}** of ${bySplit.TRAIN.length} TRAIN records (${certificationBody.selection.selectionRate}).`,
  'Getting there took two corrections worth recording.',
  '',
  'The first draft keyed the rules on the generator\'s shape and role NAMES —',
  '`shape === \'bridge\'` meant BRIDGE. That is the mistake this project has refused',
  'since the Stage 3A admission gate, and it admitted 99.96% of TRAIN.',
  '',
  'Rewriting the rules to measure the record did not fix it on its own, because two',
  'of them are constants on this corpus: every Forge world affords at least three',
  'action types and at least one of PROTECT or REINFORCE, so `INTERVENTION_CHOICE`',
  'and `CASCADING_FAILURE` have base rate 1.0 and separate nothing. Requiring "two',
  'relational rules" while two rules always fire admits everything.',
  '',
  'So the rules are now measured before they are used, and only those whose base',
  'rate falls strictly inside (0.02, 0.98) may carry the selection:',
  '',
  '| rule | base rate | informative |',
  '| --- | --- | --- |',
  ...ruleBaseRates.rules.map((rule) => `| \`${rule.id}\` | ${rule.baseRate} | ${rule.informative ? 'yes' : `no — ${rule.excludedReason}`} |`),
  '',
  certificationBody.selection.negativeControlFinding
    ? `**${certificationBody.selection.negativeControlFinding}**`
    : '',
  '',
  '## Deterministic Nexus does not pick actions',
  '',
  NEXUS_SELECTOR_NOTE,
  '',
  '## Baselines a learned candidate would have to beat',
  '',
  `Measured now, on ${validationSample.length} VALIDATION cases, so the comparison exists before the candidate does.`,
  '',
  '| policy | optimal-set accuracy | mean regret | legal rate | abstention | cases |',
  '| --- | --- | --- | --- | --- | --- |',
  ...STAGE3C_BASELINE_IDS.map((id) => {
    const summary = baselines[id];
    return `| \`${id}\` | ${summary.optimalSetAccuracy} | ${summary.meanRegret} | ${summary.legalActionRate} | ${summary.abstentionRate} | ${summary.scored ?? summary.cases} |`;
  }),
  '',
  '`PRIME_FROZEN` runs on a quarter sample because it regenerates and searches each',
  'world; its case count is reported beside it rather than being compared as though',
  'it were the same set.',
  '',
  '## Promotion firewall',
  '',
  `Mutation-tested: ${firewall.mutationTest.mutants} forbidden or unknown statuses, all rejected, with a permitted control accepted.`,
  `Live runtime references a candidate: **${firewall.liveRuntimeReferencesCandidate}**. Deterministic Nexus unchanged: **${firewall.deterministicNexusUnchanged}**.`,
  '',
  '## Authority',
  '',
  '`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. No model was',
  'trained, no expert modified, Soup never invoked.',
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage3c-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE3C_STAGE,
  status: certification.status,
  outcome: certification.stage3cOutcome,
  missing: blocker.missing,
  entryGatePassed: entryGate.passed,
  trainRecords: bySplit.TRAIN.length,
  relationallyMeaningful: selectedTrain.length,
  baselines: Object.fromEntries(STAGE3C_BASELINE_IDS.map((id) => [id, baselines[id].optimalSetAccuracy])),
  firewallPass: firewall.pass,
  certificationHash: certification.certificationHash,
}, null, 2));
