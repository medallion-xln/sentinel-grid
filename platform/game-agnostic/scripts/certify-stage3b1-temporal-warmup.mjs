#!/usr/bin/env node
/* Stage 3B.1 — Forge World temporal warm-up, Oracle reachability, router
 * ground-truth restoration and corpus V2 recertification.
 *
 * Everything Stage 3A and Stage 3B own is a FROZEN OWNER here, and so is every
 * Sentinel expert this stage measures. The script exits 2 rather than proceed if
 * any of them moves: a stage that repaired a corpus defect by quietly editing the
 * expert that surfaced it would have proved nothing.
 *
 * Usage:
 *   node scripts/certify-stage3b1-temporal-warmup.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { FORGE_ROLE_COMPOSITION_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_HORIZON_BAND_IDS } from '../src/forge/scenarios-v2.js';
import { FORGE_TOPOLOGY_SHAPE_IDS } from '../src/forge/topology.js';
import { FORGE_REWARD_V2_VERSION } from '../src/forge/reward-v2.js';
import { TIE_CLASSES } from '../src/forge/supervision.js';
import { FORGE_TEMPORAL_WARMUP_V1, ORACLE_HEAD_IDS, WARMUP_DECISION_STATES } from '../src/forge/warmup.js';
import { FORGE_ORACLE_CHANNEL_MAPPING } from '../src/forge/oracle-surface.js';
import { FORGE_TEMPORAL_FAMILY_IDS } from '../src/forge/scenarios-v3.js';
import { FORGE_DATASET_V2_LINEAGE, FORGE_DATASET_V2_VERSION, OOD_SPEC } from '../src/forge/dataset-v2.js';
import {
  STAGE3B1_PILOT_BOUNDS, STAGE3B1_STAGE, STAGE3B1_STAGE3A_CERTIFICATION_HASH,
  STAGE3B1_STAGE3B_CERTIFICATION_HASH, STAGE3B1_TARGETS, STAGE3B1_TRAINING_CAMPAIGN_SPEC,
  auditGeneratorBoundaries, auditOracleTemporalContract, auditTemporalFamilies, auditWarmupPolicy,
  calibrateDifficulty, certifyStage3B1, compareLineages, evaluateOracleHeads, loadCorpus,
  measureCorpus, measurePreservation, measureRouterUsefulness, reproduceStage3BBaseline, runSentinelBaselineV2,
  verifyShardIndependence,
  tagV2, validateSoupExports, verifyWarmupDeterminism,
  exportPreferenceV2, exportRlV2, exportSftV2,
} from '../src/lab/stage3b1-temporal-warmup.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage3b1-temporal-warmup');
const buildDir = path.join(root, 'build', 'stage3b1-corpus');
const checkOnly = process.argv.includes('--check');
const sha256File = async (relative) =>
  createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');

/* Stage 3A and Stage 3B in full, plus every expert this stage measures. */
const FROZEN_OWNERS = {
  'src/forge/kernel.js': 'f9c807ebed80ff1c2e2a47115b62525f9dac94b6c41af9d66e1903c3b7b209b7',
  'src/forge/contract.js': '07b4bc10a6daca7509b39e4cad1cbc39ef2d10031cf08d1b91d31234bae801d6',
  'src/forge/counterfactual.js': 'e90af5e76cf48315aae0f64f337c809991906864034facb229508d1bd92a46d7',
  'src/forge/scenarios.js': 'e5549cad32da129dcd37bdd8d9fd5226029a9f0b165220227b3307061e481e5f',
  'src/forge/validators.js': 'bb388403ea8e8b873788a15a9e85b3b419237c197e8acd2aa68f47392174a6db',
  'src/forge/adapter.js': '9185c56147357435a46d4df77eefe969bc3753a97f73b5490dd9689bf53b3ba0',
  'src/forge/replay.js': '7ddd38d0b93c0f91c8f87acdae6408f3f7b611e0c4f624524c72097bb3f91158',
  'src/forge/export.js': 'c4f0d6277f367c5f309a67a68eb277c57ed596c915ccfa5a2950ca80da460180',
  'src/forge/render.js': '823318dc6abbfa867a32582805d3f5eac6b28c67660d0fea9e67022c2604df4e',
  'src/lab/stage3a-sentinel-forge-world.js': '80225a88addf62566974bca9ded5da0f309171755c19ef973d43294296b2a08b',
  'src/experts/oracle.js': 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  'src/prime/root-puct.js': '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  'src/core/authority.js': 'fa622b39e80fd8808aefa41b4f4525d28bc778f7c3c19db046ee72648e1f2ee8',
  'src/core/contracts.js': '1215a623f553c7c155d60978387a5f9cf42c450733afb9c4dce44b7180df001a',
  'src/core/determinism.js': '06bba4bb8c1018097a684961921eea1c8ed0d7e011252d55fb2705eb3f503bc5',
  /* Stage 3B's own superseding modules. Pinned at the state Stage 3B certified —
   * `npm run forge:stage3b:check` reproduces 61a8ab8d... against exactly these
   * files — because this stage measures AGAINST that baseline and must not be able
   * to adjust the thing it is comparing to. */
  'src/forge/scenarios-v2.js': 'c50c380eae9c37c0ee8d1a00e5e9736ae2f5dfaab814e1e8ec0d048d4e0c314a',
  'src/forge/validators-v2.js': '8dfb8c507887a3f3b996b8aca23c23248aaba0a2d8467c3bc0097d4639b747d9',
  'src/forge/reward-v2.js': '8e31eb360c51837868132827b9c02e512ddd6ac1c892612242b1ed383feb74c0',
  'src/forge/supervision.js': '0a21ecf9eb757f26c1c7932c4c38494561b2f6db1f3a3e9c2e58dca55a07025d',
  'src/forge/counterfactual-v2.js': '3eb25964dd1088ce8c67e116176221eae9d438ded20db608ffe6a5121b0a0b1e',
  'src/forge/topology.js': '364c07720d9393abdc530bce5b97a3014f8c27aa5813188268cb4ea1176af311',
  'src/forge/dataset.js': '0769d596f9a4b3fd44a9ab6af2d172894a2bff4c1c518e8014d9d7a19cc52e49',
  'src/lab/stage3b-microworld-curriculum.js': 'cd05d2624755d2db1a1a6ff22988e035eba541c9fe940bc182764a120824c95a',
  /* The eight-head assembly and every head implementation it composes. This stage
   * measures those heads; a stage that could edit them would be marking its own
   * exam. */
  'src/lab/stage2i4-oracle-v2-assembly.js': '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  'src/lab/stage2i2-oracle-task-head-diagnostic.js': 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf',
  'src/lab/stage2i3-oracle-head-remediation.js': 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9',
  'src/lab/stage2i3c-dimension-aware-regime-composition.js': 'cd166af78e7c6172ec64af9ba0646329e5b5d9dcc9184bac18104c20d227c7ae',
};

/* Every owner is pinned here explicitly. An earlier draft tried to inherit the
 * Stage 3B pins from that stage's certification artifact; the artifact records
 * whether each subsystem CHANGED but carries no per-file hash list, so inheriting
 * would have left Stage 3B's own modules unpinned while reporting a clean freeze —
 * a freeze check that cannot fail is not a freeze check. */
async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = await sha256File(relative);
    owners.push({ path: relative, expected, measured, unchanged: measured === expected });
  }
  return {
    owners,
    ownerCount: owners.length,
    unpinnedCount: 0,
    allUnchanged: owners.every((entry) => entry.unchanged),
  };
}

/* The scope fence.
 *
 * Three properties matter here that no diff shows:
 *
 * 1. THE WARM-UP MUST NOT CONSULT A SENTINEL EXPERT. If it did, a recommendation
 *    would be shaping the world the recommendation is later scored in — the exact
 *    pathway from Sentinel advice to simulator authority the stage forbids.
 * 2. THE WARM-UP MUST NOT WRITE HISTORY. `history.push` outside the frozen kernel
 *    would be fabrication no matter how the frames were computed.
 * 3. V3 MUST NOT REWRITE V2. Stage 3B is the baseline; an editable baseline is
 *    not a baseline.
 */
async function measureDiscipline() {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = async (relative) => strip(await readFile(path.join(root, relative), 'utf8'));
  const importsOf = (source) => [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  const warmup = await read('src/forge/warmup.js');
  const scenariosV3 = await read('src/forge/scenarios-v3.js');
  const oracleSurface = await read('src/forge/oracle-surface.js');
  const datasetV2 = await read('src/forge/dataset-v2.js');
  const labModule = await read('src/lab/stage3b1-temporal-warmup.js');
  const recordBuilder = await read('src/forge/record-v2.js');
  /* The record-building logic moved out of the generator script into a shared
   * module so the certification could rebuild records through the same code the
   * workers ran. The fence has to follow it: checking the runner script for a
   * recommendation-to-simulator pathway would now be checking a file that no
   * longer decides anything. Both are read. */
  const generator = `${await read('scripts/generate-stage3b1-corpus.mjs')}\n${recordBuilder}`;

  const warmupImports = importsOf(warmup);
  const warmupConsultsExpert = warmupImports.some((specifier) => /experts\/|prime\//.test(specifier))
    || /evaluateNexus|evaluateOracle|recommend\(/.test(warmup);
  const warmupWritesHistory = /history\s*\.\s*push|history\s*=\s*\[/.test(warmup + scenariosV3 + recordBuilder);
  const warmupMutatesWorldOutsideStep = /world\.(entities|relations|objectives|constraints|tick|channels)\s*=/.test(warmup + recordBuilder);

  /* The generator may read a Sentinel expert to RECORD its output; it may not let
   * that output choose an action or alter the world. */
  const generatorFeedsRecommendationBack = /recommend\([^)]*\)[\s\S]{0,200}step\(/.test(generator);

  const v3MutatesV2 = /generateScenarioV2\s*\.|FORGE_CURRICULUM_V2_VERSION\s*=|FORGE_SCENARIO_V2_VERSION\s*=/.test(scenariosV3);
  const v2DatasetMutatesV1 = /FORGE_DATASET_VERSION\s*=\s*'/.test(datasetV2);
  const oracleSurfaceModifiesHeads = /evaluateStage2I2Head\s*=|assembleOracleV2\s*=/.test(oracleSurface);

  const runtimeFiles = [
    'src/forge/warmup.js', 'src/forge/scenarios-v3.js', 'src/forge/oracle-surface.js',
    'src/forge/dataset-v2.js', 'src/forge/record-v2.js',
  ];
  const soupLeaks = [];
  for (const file of runtimeFiles) {
    const source = await read(file);
    if (importsOf(source).some((specifier) => /soup/i.test(specifier)) || /soup_cli/i.test(source)) soupLeaks.push(file);
  }

  const executesTraining = /child_process|spawnSync|execSync/.test(labModule) || /\btrain\(|runTraining/.test(labModule);
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(labModule);
  const raisesAuthority = /tier:\s*'R[1-5]'|AuthorityTier\.R[1-5]/.test(labModule + warmup + scenariosV3);

  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    warmupConsultsExpert,
    warmupWritesHistory,
    warmupMutatesWorldOutsideStep,
    generatorFeedsRecommendationBack,
    v3MutatesV2,
    v2DatasetMutatesV1,
    oracleSurfaceModifiesHeads,
    soupLeakedIntoRuntime: soupLeaks,
    executesTraining,
    declaresOwnReliabilityFloor: declaresFloor,
    raisesAuthority,
    disciplineHolds: !warmupConsultsExpert && !warmupWritesHistory && !warmupMutatesWorldOutsideStep
      && !generatorFeedsRecommendationBack && !v3MutatesV2 && !v2DatasetMutatesV1
      && !oracleSurfaceModifiesHeads && soupLeaks.length === 0 && !executesTraining
      && !declaresFloor && !raisesAuthority && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

/* ------------------------------------------------------------------------- */

const stage3aStored = JSON.parse(await readFile(path.join(root, 'artifacts/stage3a-sentinel-forge-world/stage3a-certification-result.json'), 'utf8'));
const stage3bStored = JSON.parse(await readFile(path.join(root, 'artifacts/stage3b-microworld-curriculum/stage3b-certification-result.json'), 'utf8'));

const freeze = await measureFreeze();
const discipline = await measureDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE3B1_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE3B1_BLOCKED=true reason=STAGE_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline, null, 2)}`);
  process.exit(2);
}

/* PHASE 0 — the inherited baseline must reproduce before anything is believed. */
const baselineReproduction = reproduceStage3BBaseline(stage3bStored);
const stage3aReproduced = stage3aStored.certificationHash === STAGE3B1_STAGE3A_CERTIFICATION_HASH
  && stage3aStored.stage3aCertified === true;
if (!stage3aReproduced || !baselineReproduction.reproduced) {
  console.error('STAGE3B1_BLOCKED=true reason=BASELINE_NOT_REPRODUCED');
  console.error(`  stage3a reproduced: ${stage3aReproduced}`);
  console.error(`  ${JSON.stringify(baselineReproduction.checks.filter((check) => !check.matches), null, 2)}`);
  process.exit(2);
}

const corpus = await loadCorpus(path.join(buildDir, 'corpus.jsonl'));
if (!corpus.present) {
  console.error('STAGE3B1_BLOCKED=true reason=CORPUS_NOT_PRESENT');
  console.error(`  ${corpus.reason.replace('generate-stage3b-corpus', 'generate-stage3b1-corpus')}`);
  process.exit(2);
}
const pilotCorpus = await loadCorpus(path.join(buildDir, 'pilot.jsonl'));
if (!pilotCorpus.present) {
  console.error('STAGE3B1_BLOCKED=true reason=PILOT_NOT_PRESENT');
  console.error('  Run: node scripts/generate-stage3b1-corpus.mjs --pilot');
  process.exit(2);
}

const generationStats = JSON.parse(await readFile(path.join(buildDir, 'corpus-stats.json'), 'utf8'));
const pilotStats = JSON.parse(await readFile(path.join(buildDir, 'pilot-stats.json'), 'utf8'));

/* A deterministic probe set: every shape once, cycling the other axes, so the
 * warm-up audit covers the curriculum rather than a corner of it. */
const probeCombinations = FORGE_TOPOLOGY_SHAPE_IDS.flatMap((shape, index) =>
  [0, 3, 6].map((level, offset) => ({
    shape,
    roles: FORGE_ROLE_COMPOSITION_IDS[(index + offset) % FORGE_ROLE_COMPOSITION_IDS.length],
    objectives: FORGE_OBJECTIVE_COMPOSITION_IDS[(index + offset * 2) % FORGE_OBJECTIVE_COMPOSITION_IDS.length],
    horizonBand: FORGE_HORIZON_BAND_IDS[(index + offset) % FORGE_HORIZON_BAND_IDS.length],
    level,
    seed: 1,
  })));

const oracleContract = auditOracleTemporalContract();
const warmupAudit = auditWarmupPolicy(probeCombinations);
const determinism = verifyWarmupDeterminism(probeCombinations.filter((unused, index) => index % 3 === 0));
const familyAudit = auditTemporalFamilies(corpus.records);
const oracleHeads = evaluateOracleHeads(corpus.records);
const router = measureRouterUsefulness(corpus.records);

const measured = measureCorpus(corpus.records);
measured.rejected = generationStats.rejected;
measured.generated = generationStats.generated;
measured.rewardVersion = FORGE_REWARD_V2_VERSION;
measured.decisionStages = generationStats.stoppedAt;

const preservation = measurePreservation(stage3bStored.corpus, measured);
const shardIndependence = verifyShardIndependence(corpus.records);
const difficulty = calibrateDifficulty(corpus.records);
const boundary = auditGeneratorBoundaries();

const pilotHeads = evaluateOracleHeads(pilotCorpus.records);
const pilot = {
  records: pilotCorpus.records.length,
  bounds: STAGE3B1_PILOT_BOUNDS,
  withinBounds: pilotCorpus.records.length >= STAGE3B1_PILOT_BOUNDS.minimum
    && pilotCorpus.records.length <= STAGE3B1_PILOT_BOUNDS.maximum,
  admitted: pilotStats.admitted,
  rejected: pilotStats.rejected,
  decisionStages: pilotStats.stoppedAt,
  genericOracleSufficientRate: pilotHeads.genericOracleSufficientRate,
  headsReachable: pilotHeads.headsReachable,
  oracleReachable: pilotHeads.allHeadsReachable && pilotHeads.genericOracleSufficientRate > 0,
  scaleDecision: 'SCALED',
  scaleRule: 'The pilot gates the full run: if the Oracle had still been unreachable at pilot scale, generating seventy thousand more records of the same defect would have been the wrong answer.',
};

const baseline = runSentinelBaselineV2(corpus.records);
const comparison = compareLineages(stage3bStored.baseline, baseline);

/* Training data comes from the TRAIN split and nowhere else.
 *
 * An earlier draft exported the whole corpus, which produced larger and entirely
 * useless files: an SFT set containing HOLDOUT and OOD rows is a leak by
 * construction, and the leakage measurement two blocks up would still have
 * reported zero because the SPLITS do not overlap — it is the export that would
 * have crossed them. Stage 3B scoped its exports the same way, and the RL cap is
 * carried over with it so the two lineages' dataset manifests stay comparable. */
const trainRecords = corpus.records.filter((record) => record.split === 'TRAIN');
const sft = tagV2(exportSftV2(trainRecords));
const preference = tagV2(exportPreferenceV2(trainRecords));
const rl = tagV2(exportRlV2(trainRecords.slice(0, 20000)));
const soupValidation = validateSoupExports({ sft: sft.content, preference: preference.content, rl: rl.content });
const soup = { ...soupValidation, invokedForTraining: false };

const allRowsTaggedV2 = [sft, preference, rl].every((exported) => {
  const lines = exported.content === '' ? [] : exported.content.split('\n');
  return lines.length > 0 && lines.every((line) => JSON.parse(line).forge_metadata?.datasetVersion === FORGE_DATASET_V2_VERSION);
});

const datasetExport = {
  datasetVersion: FORGE_DATASET_V2_VERSION,
  exportedFrom: 'TRAIN',
  exportedRecords: trainRecords.length,
  rlRecordCap: 20000,
  parentDatasetVersion: FORGE_DATASET_V2_LINEAGE.parent,
  sft: { rows: sft.count, excluded: sft.excluded },
  preference: { rows: preference.count, skipped: preference.skipped },
  rl: { rows: rl.count },
  allRowsTaggedV2,
  ood: OOD_SPEC,
};

const security = {
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  expertsModified: false,
  routerModified: false,
  rewardSemanticsChanged: false,
  recommendationInfluencesSimulator: discipline.generatorFeedsRecommendationBack,
  warmupConsultsExpert: discipline.warmupConsultsExpert,
  warmupWritesHistory: discipline.warmupWritesHistory,
  historyOwnedByFrozenKernel: !discipline.warmupWritesHistory,
  dispatchProbe: baseline.dispatchProbe,
  frozenOwners: freeze.ownerCount,
  frozenOwnersUnchanged: freeze.allUnchanged,
};

const regression = {
  stage3aReproduced,
  stage3aCertificationHash: stage3aStored.certificationHash,
  stage3bReproduced: stage3bStored.certificationHash === STAGE3B1_STAGE3B_CERTIFICATION_HASH && stage3bStored.stage3bCertified === true,
  stage3bCertificationHash: stage3bStored.certificationHash,
  predecessorArtifactsModified: false,
  note: 'Both predecessor certifications are read, not recomputed here; each has its own --check mode that reproduces it byte-identically, and neither artifact was written by this stage.',
};

const certification = certifyStage3B1({
  evaluation: {
    baselineReproduction, oracleContract, warmupAudit, familyAudit,
    corpus: measured, preservation, shardIndependence, oracleHeads, router, determinism, baseline, comparison,
    datasetExport, soup, security, regression, pilot,
  },
});

for (const [condition, reason] of [
  [freeze.allUnchanged, 'FROZEN_OWNER_MUTATION_DETECTED'],
  [discipline.disciplineHolds, 'STAGE_EXCEEDED_ITS_SCOPE'],
  [baseline.dispatchProbe.refused === true, 'DISPATCH_PROBE_NOT_REFUSED'],
  [measured.leakage.topologyLeakageControlPass === true, 'TOPOLOGY_LEAKAGE_CONTROL'],
  [security.warmupWritesHistory === false, 'WARMUP_WRITES_HISTORY'],
  [security.warmupConsultsExpert === false, 'WARMUP_CONSULTS_EXPERT'],
]) {
  if (!condition) { console.error(`STAGE3B1_BLOCKED=true reason=${reason}`); process.exit(2); }
}

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage3b1-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE3B1_CERTIFICATION', reproduced: match,
    storedHash: stored.certificationHash, recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) => writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);

await write('stage3b1-certification-result.json', certification);
await write('stage3b1-baseline-reproduction.json', { ...baselineReproduction, stage3aReproduced, stage3aCertificationHash: stage3aStored.certificationHash });
await write('stage3b1-oracle-temporal-contract.json', oracleContract);
await write('stage3b1-warmup-specification.json', { contract: FORGE_TEMPORAL_WARMUP_V1, decisionStates: WARMUP_DECISION_STATES, channelMapping: FORGE_ORACLE_CHANNEL_MAPPING });
await write('stage3b1-warmup-policy-audit.json', warmupAudit);
await write('stage3b1-temporal-family-validation.json', { families: FORGE_TEMPORAL_FAMILY_IDS, ...familyAudit });
await write('stage3b1-decision-point-contract.json', { states: WARMUP_DECISION_STATES, corpusStages: measured.decisionStages, pilotStages: pilot.decisionStages });
await write('stage3b1-replay-determinism.json', { ...determinism, shardIndependence });
await write('stage3b1-dataset-v2-lineage.json', FORGE_DATASET_V2_LINEAGE);
await write('stage3b1-pilot-report.json', pilot);
await write('stage3b1-oracle-head-evaluation.json', oracleHeads);
await write('stage3b1-router-usefulness.json', router);
await write('stage3b1-preservation.json', preservation);
await write('stage3b1-corpus-v2-manifest.json', { ...measured, corpusSha256: corpus.corpusSha256, bytes: corpus.bytes, difficulty, boundary });
await write('stage3b1-split-manifest.json', { splits: measured.bySplit, leakage: measured.leakage, ood: OOD_SPEC });
await write('stage3b1-dataset-export-manifest.json', datasetExport);
await write('stage3b1-soup-export-validation.json', soup);
await write('stage3b1-baseline-sentinel-evaluation.json', baseline);
await write('stage3b1-v1-v2-comparison.json', comparison);
await write('stage3b1-security-regression.json', { ...security, ...regression, discipline });
await write('stage3b1-training-campaign-spec.json', STAGE3B1_TRAINING_CAMPAIGN_SPEC);

const sampleStride = Math.max(1, Math.floor(corpus.records.length / 300));
await writeFile(path.join(artifactRoot, 'stage3b1-corpus-v2-sample.jsonl'),
  `${corpus.records.filter((unused, index) => index % sampleStride === 0).slice(0, 300).map((record) => JSON.stringify(record)).join('\n')}\n`);

await write('stage3b1-performance.json', {
  generation: {
    workers: generationStats.workers,
    elapsedSeconds: generationStats.elapsedSeconds,
    admittedPerSecond: generationStats.admittedPerSecond,
    worldsPerSecond: Math.round(generationStats.generated / Math.max(1, generationStats.elapsedSeconds)),
    warmupTicksTotal: corpus.records.reduce((total, record) => total + record.warmupTicks, 0),
  },
  peakMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  hostCpus: os.cpus().length,
  note: 'Wall-clock numbers live here and are deliberately NOT part of the certified body: a certification that hashed a timing would stop reproducing on a different machine.',
});

const headRows = ORACLE_HEAD_IDS.map((headId) => {
  const head = oracleHeads.heads[headId];
  const contract = oracleContract.heads.find((entry) => entry.headId === headId);
  return `| \`${headId}\` | ${contract.requiredFrames} | ${contract.measurableAtFrames} | ${head.guardClearedRate} | ${head.supportedRate} | ${head.distinctSubstantiveOutputs} |`;
});

const report = [
  '# Stage 3B.1 — Forge World temporal warm-up and Oracle reachability',
  '',
  `Status: **${certification.status}** — \`${certification.stage3b1Outcome}\``,
  '',
  '## The defect, and what it was not',
  '',
  'Stage 3B recorded `ORACLE_AXIS_UNREACHABLE`: decisions were captured at tick 0,',
  'where `world.history` holds exactly one frame, against an Oracle that needs three.',
  `Every Oracle case abstained and router usefulness alignment fell to **${stage3bStored.baseline.routerAlignment}**.`,
  '',
  'That was never an Oracle deficiency. The signal was in the world state — a',
  'channel of 8 to 22 samples — and the expert could not reach it. Repairing it',
  'means evolving the world before recording the decision, which changes every',
  'world hash, which is why this is a new lineage rather than a patch.',
  '',
  'A second defect surfaced while repairing the first, and it would have hidden the',
  'repair: the eight-head assembly reads `frame.channels.alpha` and nothing else,',
  'while Forge declares `primary`. Every head computed over an empty series and',
  'abstained regardless of history length. The remedy is a declared channel mapping',
  'at the adapter layer — `ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED` — and no head',
  'was modified.',
  '',
  '## Why 24 ticks, and not 18',
  '',
  `The longest guard in the head contract opens at **${oracleContract.minimumClearingAllGuards}** frames.`,
  `The warm-up targets **${oracleContract.chosenWarmupTicks}**.`,
  '',
  oracleContract.chosenBecause,
  '',
  '## The warm-up does not change the task',
  '',
  `Probed across ${warmupAudit.probes} scenarios spanning every topology shape:`,
  '',
  `- task preserved: **${warmupAudit.taskPreserved}/${warmupAudit.probes}**`,
  `- decision horizon preserved exactly: **${warmupAudit.horizonPreservedExactly}/${warmupAudit.probes}**`,
  `- channel clamped (flat history): **${warmupAudit.channelClamped}**`,
  `- resources consumed: **${warmupAudit.consumedResources}**, actors moved: **${warmupAudit.movedActors}**, entities killed: **${warmupAudit.killedEntities}**`,
  `- objectives completed: **${warmupAudit.completedObjectives}**, legal actions changed: **${warmupAudit.changedLegalActions}**, structure changed: **${warmupAudit.changedStructure}**`,
  `- reached the full ${oracleContract.chosenWarmupTicks}-tick target: **${warmupAudit.reachedFullTarget}**, shortened: **${warmupAudit.truncated}** (${Object.entries(warmupAudit.truncationCauses).map(([cause, count]) => `${cause} ${count}`).join(', ') || 'none'})`,
  '',
  warmupAudit.truncationMechanism,
  '',
  warmupAudit.reachabilityConfound,
  '',
  '## The Oracle axis, per head',
  '',
  'Never collapsed into one number.',
  '',
  '| head | guard opens at | measurable at | guard cleared | positive claim | distinct outputs |',
  '| --- | --- | --- | --- | --- | --- |',
  ...headRows,
  '',
  `Generic Oracle sufficiency: **${oracleHeads.genericOracleSufficientRate}** of ${oracleHeads.records} records`,
  `(Stage 3B: **${stage3bStored.baseline.oracleSufficientRate}**).`,
  '',
  `\`${oracleHeads.knownHeadProperty.code}\`: ${oracleHeads.knownHeadProperty.finding}`,
  '',
  '## V1 versus V2 — a corpus effect, not a model claim',
  '',
  comparison.attributionNote,
  '',
  '| metric | V1 | V2 |',
  '| --- | --- | --- |',
  ...comparison.rows.map((row) => `| ${row.metric} | ${row.v1} | ${row.v2} |`),
  '',
  '## Corpus V2',
  '',
  `- admitted: **${measured.records}** of ${measured.generated} generated, **${measured.rejected}** rejected`,
  `- unique topologies: **${measured.diversity.uniqueTopologyHashes}**`,
  `- effective dataset size: **${measured.diversity.effectiveDatasetSize}** (the least-varied dimension, never the raw count)`,
  `- splits: ${Object.entries(measured.bySplit).map(([split, count]) => `${split} ${count}`).join(', ')}`,
  `- cross-split world overlap: **${measured.leakage.exactWorldOverlap}**, topology leakage: **${measured.leakage.topologyLeakage}**`,
  `- temporal families realised on the observed history: **${familyAudit.realisationRate}**`,
  '',
  familyAudit.unrealisedCause,
  '',
  '## Determinism',
  '',
  `Replay compares **every warm-up frame**, not just the decision state: ${determinism.framesCompared} frames across ${determinism.probes} probes, all identical.`,
  '',
  `Shard independence is checked, not assumed: ${shardIndependence.sampled} records rebuilt in a single process`,
  `through the same builder the four workers used, **${shardIndependence.recordHashesIdentical}** matching by record hash.`,
  '',
  '## Authority',
  '',
  '`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. The dispatch',
  `probe was **attempted** and refused (\`${baseline.dispatchProbe.errorName}\`) — a zero that was never`,
  'attempted would prove nothing. The warm-up never consults a Sentinel expert and',
  'never writes to `world.history`; the frozen kernel owns every frame.',
  '',
  '**No model was trained. No expert was modified. Soup was not invoked.**',
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage3b1-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE3B1_STAGE,
  status: certification.status,
  outcome: certification.stage3b1Outcome,
  blockers: certification.blockers,
  records: measured.records,
  topologies: measured.diversity.uniqueTopologyHashes,
  warmupTarget: oracleContract.chosenWarmupTicks,
  taskPreservationRate: warmupAudit.taskPreservationRate,
  oracleSufficientRateV1: stage3bStored.baseline.oracleSufficientRate,
  oracleSufficientRateV2: baseline.oracleSufficientRate,
  routerAlignmentV1: stage3bStored.baseline.routerAlignment,
  routerAlignmentV2: baseline.routerAlignment,
  headsReachable: `${oracleHeads.headsReachable}/${oracleHeads.headCount}`,
  certificationHash: certification.certificationHash,
}, null, 2));
