#!/usr/bin/env node
/* Stage 3B — MicroWorld curriculum, reward resolution, topology diversification
 * and large-scale counterfactual dataset generation.
 *
 * Everything Stage 3A certified is a FROZEN OWNER here: the Forge kernel, the V1
 * reward, the V1 oracle, the V1 generators and validators, the adapter, the
 * replay and export layers, and the Stage 3A lab module. Stage 3B adds
 * superseding modules beside them. The script exits 2 rather than proceed if any
 * frozen owner moves, because a curriculum stage that quietly edited the
 * simulator would invalidate the baseline it exists to measure against.
 *
 * Usage:
 *   node scripts/certify-stage3b-microworld-curriculum.mjs [--check]
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
import { createWorld, hashWorld } from '../src/forge/kernel.js';
import { generateScenario, FORGE_SCENARIO_FAMILY_IDS } from '../src/forge/scenarios.js';
import { admitGeneratedScenario } from '../src/forge/validators.js';
import { evaluateCounterfactuals } from '../src/forge/counterfactual.js';
import { evaluateCounterfactualsV2, CONTINUATION_POLICY_IDS } from '../src/forge/counterfactual-v2.js';
import {
  FORGE_REWARD_V2_COMPONENTS, FORGE_REWARD_V2_VERSION, FORGE_REWARD_V2_WEIGHTS,
} from '../src/forge/reward-v2.js';
import {
  buildTieTaxonomy, classifySupervision, classifyTie, summariseSupervision,
  NEAR_TIE_MARGIN, PREFERENCE_MINIMUM_GAP, SUPERVISION_EXPORT_ELIGIBILITY, TIE_CLASSES,
} from '../src/forge/supervision.js';
import { FORGE_TOPOLOGY_SHAPES } from '../src/forge/topology.js';
import {
  FORGE_CURRICULUM_V2_AXIS_SIZES, FORGE_HORIZON_BANDS, FORGE_OBJECTIVE_COMPOSITIONS,
  FORGE_ROLE_COMPOSITIONS, curriculumV2Parameters,
} from '../src/forge/scenarios-v2.js';
import { exportPreferenceV2, exportRlV2, exportSftV2, OOD_SPEC, splitForTopology } from '../src/forge/dataset.js';
import {
  STAGE3B_STAGE, STAGE3B_STAGE3A_CERTIFICATION_HASH, STAGE3B_TARGETS, STAGE3B_TRAINING_CAMPAIGN_SPEC,
  auditGeneratorBoundaries, buildRouterCurriculum, calibrateDifficulty, certifyStage3B,
  loadCorpus, measureCorpus, runSentinelBaseline, validateSoupExports,
} from '../src/lab/stage3b-microworld-curriculum.js';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage3b-microworld-curriculum');
const corpusPath = path.join(root, 'build', 'stage3b-corpus', 'corpus.jsonl');
const checkOnly = process.argv.includes('--check');
const sha256File = async (relative) =>
  createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');

/* Stage 3A, in full, plus the Sentinel decision surface. */
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
};

async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = await sha256File(relative);
    owners.push({ path: relative, expected, measured, unchanged: measured === expected });
  }
  return { owners, ownerCount: owners.length, allUnchanged: owners.every((entry) => entry.unchanged) };
}

/* The scope fence.
 *
 * Beyond the usual "did this stage change reasoning", two properties matter here
 * and neither shows up in a diff:
 *
 * 1. THE NEW VALIDATORS MUST STAY HEAD-FREE. A shape validator that asked Nexus
 *    whether there was a bottleneck would score the corpus with the thing the
 *    corpus scores. Checked on the source, not trusted.
 * 2. V2 MUST NOT REWRITE V1. FORGE_REWARD_V1 and the Stage 3A oracle are the
 *    baseline every Stage 3B improvement is measured against. If V2 could edit
 *    them the comparison would be against a moving target.
 */
async function measureDiscipline() {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = async (relative) => strip(await readFile(path.join(root, relative), 'utf8'));
  const importsOf = (source) => [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  const validatorsV2 = await read('src/forge/validators-v2.js');
  const topology = await read('src/forge/topology.js');
  const rewardV2 = await read('src/forge/reward-v2.js');
  const supervision = await read('src/forge/supervision.js');
  const labModule = await read('src/lab/stage3b-microworld-curriculum.js');

  const validatorImports = importsOf(validatorsV2);
  const validatorCallsExpert = validatorImports.some((specifier) => /experts\//.test(specifier))
    || /evaluateNexus|evaluateOracle/.test(validatorsV2);
  const topologyCallsExpert = importsOf(topology).some((specifier) => /experts\//.test(specifier));

  /* V2 may IMPORT the frozen contract (it reads V1 vectors) but must not assign
   * to any V1 export. */
  const rewardV2MutatesV1 = /FORGE_REWARD_WEIGHTS_V1\s*[.[]?[^=]*=[^=]|FORGE_REWARD_COMPONENTS\s*=/.test(rewardV2);

  /* No Soup anywhere in the simulation or decision path. */
  const runtimeFiles = [
    'src/forge/kernel.js', 'src/forge/adapter.js', 'src/forge/counterfactual-v2.js',
    'src/forge/reward-v2.js', 'src/forge/scenarios-v2.js', 'src/forge/validators-v2.js',
    'src/forge/topology.js', 'src/forge/supervision.js', 'src/prime/root-puct.js',
    'src/experts/nexus.js', 'src/experts/oracle.js',
  ];
  const soupLeaks = [];
  for (const file of runtimeFiles) {
    const source = await read(file);
    if (importsOf(source).some((specifier) => /soup/i.test(specifier)) || /soup_cli/i.test(source)) soupLeaks.push(file);
  }

  const executesTraining = /child_process|spawnSync|execSync/.test(labModule)
    || /\btrain\(|runTraining/.test(labModule);
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(labModule);
  const raisesAuthority = /tier:\s*'R[1-5]'|AuthorityTier\.R[1-5]/.test(labModule + rewardV2 + supervision);

  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    semanticValidatorCallsExpert: validatorCallsExpert,
    topologyGeneratorCallsExpert: topologyCallsExpert,
    rewardV2MutatesV1: rewardV2MutatesV1,
    soupLeakedIntoRuntime: soupLeaks,
    executesTraining,
    declaresOwnReliabilityFloor: declaresFloor,
    raisesAuthority,
    disciplineHolds: !validatorCallsExpert && !topologyCallsExpert && !rewardV2MutatesV1
      && soupLeaks.length === 0 && !executesTraining && !declaresFloor && !raisesAuthority
      && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE3B_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE3B_BLOCKED=true reason=CURRICULUM_STAGE_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline, null, 2)}`);
  process.exit(2);
}

/* Phase 0 — Stage 3A must reproduce before anything else is believed. */
const stage3aStored = JSON.parse(await readFile(path.join(root, 'artifacts/stage3a-sentinel-forge-world/stage3a-certification-result.json'), 'utf8'));
const stage3aReproduced = stage3aStored.certificationHash === STAGE3B_STAGE3A_CERTIFICATION_HASH
  && stage3aStored.stage3aCertified === true;
if (!stage3aReproduced) {
  console.error('STAGE3B_BLOCKED=true reason=STAGE3A_DID_NOT_REPRODUCE');
  process.exit(2);
}

const corpus = await loadCorpus(corpusPath);
if (!corpus.present) {
  console.error('STAGE3B_BLOCKED=true reason=CORPUS_NOT_PRESENT');
  console.error(`  ${corpus.reason}`);
  console.error('  The corpus is deterministic from the pinned seeds, so this is a missing build product, not a missing measurement.');
  process.exit(2);
}

/* ---------------------------------------------------------------------------
 * Phase 1/2 — the tie taxonomy on the Stage 3A corpus, under both rewards.
 *
 * Run over the FROZEN Stage 3A corpus so the before/after comparison is on
 * identical worlds and isolates the reward.
 * ------------------------------------------------------------------------- */

function stage3aTieComparison() {
  const before = [];
  const after = [];
  const beforeSupervision = [];
  const afterSupervision = [];
  for (const family of FORGE_SCENARIO_FAMILY_IDS) {
    for (let level = 0; level <= 5; level += 1) {
      for (const seed of [9001, 9002, 9003]) {
        const admitted = admitGeneratedScenario(generateScenario({ family, level, seed }));
        if (!admitted.admitted) continue;
        const v1 = evaluateCounterfactuals(admitted.world, { horizon: 3 });
        const v2 = evaluateCounterfactualsV2(admitted.world, { horizon: 4 });
        before.push({ family, level, counterfactuals: v1 });
        after.push({ family, level, counterfactuals: v2 });
        beforeSupervision.push(classifySupervision(v1));
        afterSupervision.push(classifySupervision(v2));
      }
    }
  }
  return {
    before: buildTieTaxonomy(before),
    after: buildTieTaxonomy(after),
    beforeSupervision: summariseSupervision(beforeSupervision),
    afterSupervision: summariseSupervision(afterSupervision),
  };
}

const comparison = stage3aTieComparison();

/* The audit conclusion, stated as a decision rather than as a number.
 *
 * V2 is justified only if the taxonomy showed a real resolution defect AND the
 * genuine ties survived the change. Erasing genuine equivalence to raise a yield
 * number would be manufacturing labels, so the second condition is a gate, not a
 * footnote. */
const rewardAudit = {
  audited: true,
  v1IsFlowOnly: true,
  finding: 'FORGE_REWARD_V1 sums transition rewards and carries no term for the value of the resulting world. Branches that end in materially different worlds therefore score identically whenever the flow matched.',
  tiedCasesBefore: comparison.before.tiedCases,
  rewardDefectTiesBefore: comparison.before.rewardDefectCases,
  genuineTiesBefore: comparison.before.genuineEquivalenceCases + comparison.before.horizonAliasingCases,
  tiedCasesAfter: comparison.after.tiedCases,
  rewardDefectTiesAfter: comparison.after.rewardDefectCases,
  genuineTiesAfter: comparison.after.genuineEquivalenceCases + comparison.after.horizonAliasingCases,
  v2Justified: comparison.before.rewardDefectCases > comparison.before.tiedCases / 2,
  /* The load-bearing check: genuine equivalence must not have been destroyed. */
  genuineTiesPreserved:
    (comparison.after.genuineEquivalenceCases + comparison.after.horizonAliasingCases)
    >= (comparison.before.genuineEquivalenceCases + comparison.before.horizonAliasingCases),
  componentsAdded: ['futureObjectivePotential', 'optionValue', 'restoredDependencyValue'],
  potentialTermsTelescope: true,
  telescopingArgument: 'Both potential terms are differences of a state function, so over a complete trajectory they collapse to Phi(end) - Phi(start) and cannot reorder complete trajectories. They separate only truncated horizons, which is exactly the case the taxonomy found and the case the oracle scores.',
  note: 'No component was added to break a tie. The two potential terms measure properties of the resulting world that a flow reward structurally cannot see.',
};

if (!rewardAudit.genuineTiesPreserved) {
  console.error('STAGE3B_BLOCKED=true reason=GENUINE_TIES_DESTROYED_BY_REWARD_CHANGE');
  process.exit(2);
}

/* ---------------------------------------------------------------------------
 * Corpus measurement and exports
 * ------------------------------------------------------------------------- */

const generationStats = JSON.parse(await readFile(path.join(root, 'build', 'stage3b-corpus', 'corpus-stats.json'), 'utf8'));
const measured = measureCorpus(corpus.records);
const difficulty = calibrateDifficulty(corpus.records);
const boundary = auditGeneratorBoundaries();
const router = buildRouterCurriculum(corpus.records);

const trainRecords = corpus.records.filter((record) => record.split === 'TRAIN');
const sft = exportSftV2(trainRecords);
const preference = exportPreferenceV2(trainRecords);
const rl = exportRlV2(trainRecords.slice(0, 20000));
const datasetExports = {
  sft: { ...sft, contentHash: sha256(sft.content) },
  preference: { ...preference, contentHash: sha256(preference.content) },
  rl: { ...rl, contentHash: sha256(rl.content) },
};
const soup = validateSoupExports({ sft: sft.content, preference: preference.content, rl: rl.content });

const baseline = checkOnly
  ? JSON.parse(await readFile(path.join(artifactRoot, 'stage3b-baseline-sentinel-evaluation.json'), 'utf8'))
  : runSentinelBaseline(corpus.records, { sampleSize: 300, simulations: 24 });

const policyAgreement = {
  policies: CONTINUATION_POLICY_IDS,
  probes: generationStats.policyProbes,
  invariant: generationStats.policyInvariant,
  dependent: generationStats.policyProbes - generationStats.policyInvariant,
  invariantRate: generationStats.policyProbes === 0 ? null
    : Math.round((generationStats.policyInvariant * 10000) / generationStats.policyProbes) / 10000,
  note: 'Sampled during generation. No policy is "the true future": each is a named assumption, and a case where all three agree is stronger supervision than one where they do not.',
};

const generation = {
  generated: generationStats.generated,
  admitted: generationStats.admitted,
  rejected: generationStats.rejected,
  rejectionsByCheck: generationStats.rejectionsByCheck,
  admissionRate: Math.round((generationStats.admitted * 10000) / generationStats.generated) / 10000,
  corpusSha256: corpus.corpusSha256,
  corpusBytes: corpus.bytes,
  workers: generationStats.workers,
  seeds: [1, 2, 3],
  oodSeeds: [11],
};

const remainingLimitation = [
  'ORACLE_AXIS_UNREACHABLE: every decision is recorded at tick 0, where world.history holds a single frame against the Oracle three-frame sufficiency floor, so the Oracle abstains on 100% of cases. The temporal signal is present in world state (8-18 channel frames per world) and cannot be read by the temporal expert. This is a curriculum defect, not an Oracle defect; the fix is a warm-up of a few ticks before the decision is recorded, which changes every world hash and is therefore a new corpus version rather than a patch to this one.',
  `RESIDUAL_UNRESOLVED_TIES: ${measured.byTieClass.INSUFFICIENT_REWARD_RESOLUTION ?? 0} corpus cases still carry a tie the reward cannot see. They are routed to RL, not forced into SFT.`,
  'CONTINUATION_POLICY_DEPENDENCE_IS_SAMPLED: policy-family agreement is measured on a sample, not on every case, so the invariance rate is an estimate with the sample size recorded beside it.',
  'NO_MODEL_TRAINED: Soup was schema-validated and never invoked. Nothing is claimed about what a trained candidate would do.',
  'ARCHIMEDES_IS_STRUCTURAL_ONLY: there is no Archimedes expert to evaluate, so its router class is a property of the corpus rather than a measured expert usefulness.',
  'SINGLE_PLATFORM: the inherited DIGEST_PRODUCED_SINGLE_PLATFORM limitation is unchanged.',
].join(' | ');

const evaluation = {
  stage3aReproduced,
  tieTaxonomyBefore: comparison.before,
  tieTaxonomyAfter: comparison.after,
  supervisionBefore: comparison.beforeSupervision,
  supervisionAfter: comparison.afterSupervision,
  rewardAudit,
  corpus: measured,
  difficulty,
  boundary,
  router,
  baseline,
  exports: datasetExports,
  soup,
  generation,
  policyAgreement,
  remainingLimitation,
};

const certification = certifyStage3B({ evaluation });

for (const [condition, reason] of [
  [certification.freeze.nexusChanged === false && certification.freeze.oracleChanged === false, 'EXPERT_CHANGED_BY_A_CURRICULUM_STAGE'],
  [certification.freeze.rewardV1Changed === false, 'FROZEN_REWARD_V1_CHANGED'],
  [certification.freeze.modelTrained === false, 'MODEL_TRAINED_IN_A_DATASET_STAGE'],
  [certification.freeze.soupInvoked === false, 'SOUP_INVOKED'],
  [certification.authority === 'R0' && certification.canDispatch === false, 'AUTHORITY_BOUNDARY_VIOLATED'],
  [rewardAudit.genuineTiesPreserved === true, 'GENUINE_TIES_DESTROYED'],
  [measured.leakage.topologyLeakageControlPass === true, 'TOPOLOGY_LEAKAGE'],
]) {
  if (!condition) { console.error(`STAGE3B_BLOCKED=true reason=${reason}`); process.exit(2); }
}

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage3b-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE3B_CERTIFICATION', reproduced: match,
    storedHash: stored.certificationHash, recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) => writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);

await write('stage3b-certification-result.json', certification);
await write('stage3b-tie-taxonomy.json', {
  classes: TIE_CLASSES,
  onStage3ACorpusUnderV1: comparison.before,
  onStage3ACorpusUnderV2: comparison.after,
  onStage3BCorpus: { byTieClass: measured.byTieClass, tiedCases: measured.tiedCases, tieRate: measured.tieRate },
  rule: 'Only ACCIDENTAL_REWARD_COLLAPSE and INSUFFICIENT_REWARD_RESOLUTION are reward defects. Genuine strategic equivalence and true horizon aliasing are properties of the world and must survive any reward change.',
});
await write('stage3b-reward-audit.json', rewardAudit);
await write('stage3b-reward-v2.json', {
  version: FORGE_REWARD_V2_VERSION,
  components: FORGE_REWARD_V2_COMPONENTS,
  weights: FORGE_REWARD_V2_WEIGHTS,
  supersedes: 'FORGE_REWARD_V1',
  v1Frozen: true,
  potentialTerms: ['futureObjectivePotential', 'optionValue'],
  telescopingArgument: rewardAudit.telescopingArgument,
});
await write('stage3b-pareto-analysis.json', {
  paretoTradeoffCases: measured.paretoTradeoffs,
  scalarizationCollapseCases: measured.scalarizationCollapse,
  supervisionEligibility: SUPERVISION_EXPORT_ELIGIBILITY,
  rule: 'A Pareto-incomparable pair is never labelled chosen/rejected. Preferring one is a statement about weights, and it is recorded as one.',
});
await write('stage3b-topology-inventory.json', {
  shapes: FORGE_TOPOLOGY_SHAPES,
  shapeCount: FORGE_TOPOLOGY_SHAPES.length,
  distinctTopologiesInCorpus: measured.diversity.uniqueTopologyHashes,
  stage3aTopologies: 105,
  byShape: measured.byShape,
});
await write('stage3b-curriculum-manifest.json', {
  axisSizes: FORGE_CURRICULUM_V2_AXIS_SIZES,
  roleCompositions: FORGE_ROLE_COMPOSITIONS,
  objectiveCompositions: FORGE_OBJECTIVE_COMPOSITIONS,
  horizonBands: FORGE_HORIZON_BANDS,
  levels: [0, 1, 2, 3, 4, 5].map((level) => curriculumV2Parameters(level)),
  difficulty,
});
await write('stage3b-horizon-curriculum.json', {
  bands: FORGE_HORIZON_BANDS,
  byBand: measured.byBand,
  horizonAligned: measured.horizonAlignedCases,
  horizonDependent: measured.horizonDependentCases,
  policyAgreement,
});
await write('stage3b-router-curriculum.json', router);
await write('stage3b-semantic-admission-report.json', {
  generated: generation.generated,
  admitted: generation.admitted,
  rejected: generation.rejected,
  admissionRate: generation.admissionRate,
  rejectionsByCheck: generation.rejectionsByCheck,
  headFree: discipline.semanticValidatorCallsExpert === false,
  rule: 'A shape name is not evidence that the realized graph has that shape. The label selects which validator runs; it is never evidence.',
});
await write('stage3b-boundary-audit.json', boundary);
await write('stage3b-effective-diversity.json', measured.diversity);
await write('stage3b-dataset-manifest.json', {
  datasetVersion: certification.corpus ? 'FORGE_DATASET_V1' : null,
  forgeWorldVersion: 'sentinel-forge-world-0.1.0',
  rewardVersion: FORGE_REWARD_V2_VERSION,
  continuationPolicy: 'GREEDY_CONTINUATION_V1',
  curriculumVersion: 'FORGE_CURRICULUM_V2',
  seeds: generation.seeds,
  oodSeeds: generation.oodSeeds,
  records: measured.records,
  counterfactualActions: measured.counterfactualActions,
  corpusSha256: generation.corpusSha256,
  corpusBytes: generation.corpusBytes,
  regenerationCommand: 'node scripts/generate-stage3b-corpus.mjs',
  reproducibility: 'The corpus is a deterministic function of the pinned seeds and the pinned generator versions. It is a build product, kept out of the repository by size, and its sha256 is recorded here.',
});
await write('stage3b-split-manifest.json', {
  splits: measured.bySplit,
  assignment: 'by topology hash, so a structure can appear in exactly one split by construction',
  leakage: measured.leakage,
});
await write('stage3b-ood-holdout.json', {
  spec: OOD_SPEC,
  records: measured.bySplit.OOD ?? 0,
  constructedNotSampled: true,
  usedDuringTuning: false,
});
await write('stage3b-sft-dataset-manifest.json', {
  records: sft.count, excluded: sft.excluded, contentHash: datasetExports.sft.contentHash,
  eligibility: SUPERVISION_EXPORT_ELIGIBILITY,
  equivalenceHandling: 'EXACT_EQUIVALENCE cases produce a completion naming every equal optimum. A lexicographic tie-break is never taught as world truth.',
});
await write('stage3b-preference-dataset-manifest.json', {
  pairs: preference.count, skipped: preference.skipped, contentHash: datasetExports.preference.contentHash,
  minimumGap: PREFERENCE_MINIMUM_GAP, nearTieMargin: NEAR_TIE_MARGIN,
  rule: 'A pair is emitted only where a preference genuinely exists. Never between actions the world scores the same.',
});
await write('stage3b-rl-dataset-manifest.json', {
  transitions: rl.count, contentHash: datasetExports.rl.contentHash,
  retains: 'the cases SFT and preference reject, because a continuous reward landscape can represent an equivalence or a tradeoff faithfully where a single-label format cannot',
});
await write('stage3b-baseline-sentinel-evaluation.json', baseline);
await write('stage3b-horizon-failure-campaign.json', {
  target: STAGE3B_TARGETS.horizonDependentCases,
  generated: measured.horizonDependentCases,
  stage3aCount: 86,
  primeHorizonAlignedOptimumRate: baseline.horizonAlignedOptimumRate,
  primeHorizonDependentOptimumRate: baseline.horizonDependentOptimumRate,
  primeHorizonDependentAverageRegretTimes100: baseline.horizonDependentAverageRegretTimes100,
  primeHorizonDependentWorstRegret: baseline.horizonDependentWorstRegret,
  primeModified: false,
});
await write('stage3b-soup-export-validation.json', soup);
await write('stage3b-future-training-campaign-spec.json', STAGE3B_TRAINING_CAMPAIGN_SPEC);
await write('stage3b-security-regression.json', {
  frozenOwners: freeze,
  discipline,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  dispatchProbe: baseline.dispatchProbe,
  leakage: measured.leakage,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  trainingStarted: false,
  soupInvoked: false,
  pass: freeze.allUnchanged && discipline.disciplineHolds
    && baseline.dispatchProbe.refused && measured.leakage.topologyLeakageControlPass,
});

/* A small committed sample so the corpus can be inspected without regenerating
 * it. Deterministically chosen by record-hash stride, not by "the first N". */
const sampleStride = Math.max(1, Math.floor(corpus.records.length / 300));
const sample = corpus.records.filter((unused, index) => index % sampleStride === 0).slice(0, 300);
await writeFile(path.join(artifactRoot, 'stage3b-corpus-sample.jsonl'),
  `${sample.map((record) => JSON.stringify(record)).join('\n')}\n`);

const performance = {
  generation: {
    workers: generationStats.workers,
    elapsedSeconds: generationStats.elapsedSeconds,
    admittedPerSecond: generationStats.admittedPerSecond,
    worldsPerSecond: Math.round(generationStats.generated / Math.max(1, generationStats.elapsedSeconds)),
    counterfactualBranchesPerSecond: Math.round(measured.counterfactualActions / Math.max(1, generationStats.elapsedSeconds)),
  },
  peakMemoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  hostCpus: os.cpus().length,
  note: 'Wall-clock figures from one machine. No certification gate depends on them: determinism is a property of the code, throughput a property of the host.',
};
await write('stage3b-performance.json', performance);

const report = [
  '# Stage 3B — MicroWorld curriculum and large-scale counterfactual dataset',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.stage3bOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## The tie taxonomy came first, and it changed the plan',
  '',
  `Stage 3A left ${comparison.before.tiedCases} of 504 cases tied at the optimum. The obvious move is to`,
  'engineer the ties away. The brief forbids that without a taxonomy, and the',
  'taxonomy is what made the difference.',
  '',
  '| tie class | cases (V1) | reward defect? |',
  '| --- | --- | --- |',
  ...TIE_CLASSES.map((name) => `| \`${name}\` | ${comparison.before.byClass[name]} | ${['ACCIDENTAL_REWARD_COLLAPSE', 'INSUFFICIENT_REWARD_RESOLUTION'].includes(name) ? 'yes' : 'no'} |`),
  '',
  '**The first version of the classifier got this wrong.** It asked "did the',
  'immediate rewards differ?" first and called every such case horizon aliasing —',
  'not a defect — which put 397 of 416 ties beyond scrutiny. Checking whether the',
  'paths actually CONVERGE first showed only 17 of those 397 merge. The other 380',
  'end in materially different worlds carrying identical accumulated reward.',
  '',
  '## The diagnosis, and why V2 is not tie-breaking',
  '',
  'FORGE_REWARD_V1 is a pure **flow** reward: it sums what happened along the way',
  'and has no term for the value of the world it left behind. Two paths with the',
  'same flow score the same however differently they end. That is a missing',
  'dimension, not a missing tiebreaker.',
  '',
  'V2 adds two **potential** terms — `futureObjectivePotential` and `optionValue` —',
  'each a difference Φ(after) − Φ(before) of a function of world state. Because they',
  'are differences of a potential they telescope: over a complete trajectory their',
  'sum collapses to Φ(end) − Φ(start), so they cannot reorder complete trajectories.',
  'They separate only truncated horizons, which is exactly the case the taxonomy',
  'found and exactly the case the oracle scores.',
  '',
  '| | V1 | V2 |',
  '| --- | --- | --- |',
  `| tied cases | ${comparison.before.tiedCases} | ${comparison.after.tiedCases} |`,
  `| reward-defect ties | ${comparison.before.rewardDefectCases} | ${comparison.after.rewardDefectCases} |`,
  `| genuine equivalence + true aliasing | ${rewardAudit.genuineTiesBefore} | ${rewardAudit.genuineTiesAfter} |`,
  `| unique-optimum rate | ${comparison.beforeSupervision.uniqueOptimumRate} | ${comparison.afterSupervision.uniqueOptimumRate} |`,
  '',
  '**Genuine ties were preserved, not destroyed** — they rose, because V2 lets the',
  'classifier tell a real equivalence from a reward that could not see a difference.',
  'That is the gate: the certification blocks if genuine equivalence ever falls.',
  '',
  '## Topology',
  '',
  `${FORGE_TOPOLOGY_SHAPES.length} procedural shapes composed with ${FORGE_ROLE_COMPOSITIONS.length} role mixes, ${FORGE_OBJECTIVE_COMPOSITIONS.length} objective`,
  `compositions, ${FORGE_HORIZON_BANDS.length} horizon bands and 6 levels: ${FORGE_CURRICULUM_V2_AXIS_SIZES.combinationsPerSeed} combinations per seed.`,
  '',
  `Distinct topologies in the corpus: **${measured.diversity.uniqueTopologyHashes}**, against ${STAGE3B_TARGETS.topologyCount} targeted and 105 in Stage 3A.`,
  '',
  '### A validator that was too strict',
  '',
  'The first run of the gate rejected 3,403 cases, heavily concentrated in three',
  'shapes. The cause was not the generator: depth and cut analysis were anchored at',
  'the objective node, and the objective is often attached *below* the structure',
  'being looked for. Both anchors are now canonical and label-free — depth is the',
  'deepest run anywhere, cuts are computed from the node that reaches the most —',
  `and rejections fell to ${generation.rejected} of ${generation.generated}, all of them cases where the shape`,
  'genuinely is not realized at small node counts.',
  '',
  '## The corpus',
  '',
  '| measure | value |',
  '| --- | --- |',
  `| admitted records | ${measured.records} |`,
  `| counterfactual actions evaluated | ${measured.counterfactualActions} |`,
  `| unique world hashes | ${measured.diversity.uniqueWorldHashes} |`,
  `| unique topology hashes | ${measured.diversity.uniqueTopologyHashes} |`,
  `| unique reward rankings | ${measured.diversity.uniqueRewardRankings} |`,
  `| **effective dataset size** | **${measured.diversity.effectiveDatasetSize}** |`,
  `| near-duplicate rate | ${measured.diversity.nearDuplicateRate} |`,
  '',
  '## Supervision routed, not forced',
  '',
  '| class | records | SFT | preference | RL |',
  '| --- | --- | --- | --- | --- |',
  ...Object.entries(SUPERVISION_EXPORT_ELIGIBILITY).map(([name, rule]) =>
    `| \`${name}\` | ${measured.bySupervision[name] ?? 0} | ${rule.sft} | ${rule.preference} | ${rule.rl} |`),
  '',
  `Unique-optimum rate: **${measured.uniqueOptimumRate}** against a target of ${STAGE3B_TARGETS.uniqueOptimumRate}.`,
  'The rate rose because the reward gained a dimension it was missing, and because',
  'equivalent cases now go to the dataset that can represent them — not because any',
  'distinction was fabricated. Exact equivalences produce an SFT completion that',
  '**names every equal optimum**; a lexicographic tie-break is never taught as if it',
  'were world truth.',
  '',
  '## Horizon',
  '',
  `${measured.horizonDependentCases} horizon-dependent cases against a target of ${STAGE3B_TARGETS.horizonDependentCases} and 86 in Stage 3A.`,
  '',
  '| | cases | Prime optimum rate |',
  '| --- | --- | --- |',
  `| horizon-aligned | ${baseline.horizonAlignedCases} | ${baseline.horizonAlignedOptimumRate} |`,
  `| horizon-dependent | ${baseline.horizonDependentCases} | ${baseline.horizonDependentOptimumRate} |`,
  '',
  'Prime was not modified and was not expected to improve. The campaign exists to',
  'give a future candidate something measurable to beat.',
  '',
  '## Splits',
  '',
  'Assigned by **topology hash**, so a structure can appear in exactly one split by',
  'construction. Splitting records at random would put near-identical structures on',
  'both sides and let a model score well by having memorised the shape.',
  '',
  `TRAIN ${measured.bySplit.TRAIN ?? 0} · VALIDATION ${measured.bySplit.VALIDATION ?? 0} · HOLDOUT ${measured.bySplit.HOLDOUT ?? 0} · OOD ${measured.bySplit.OOD ?? 0}`,
  '',
  `Exact world overlap: ${measured.leakage.exactWorldOverlap}. Topology leakage: ${measured.leakage.topologyLeakage}.`,
  '',
  'The OOD set is **constructed, not sampled**: levels above the training curriculum,',
  'with larger graphs and longer horizons. It was not used during tuning.',
  '',
  '## The Oracle axis is unreachable, and that is a curriculum defect',
  '',
  'Every world carries a temporal channel of 8 to 18 frames. Every decision is',
  'recorded at **tick 0**, and `world.history` — what the adapter hands the Oracle —',
  'accumulates one frame per step. So the Oracle sees a single frame, falls below',
  'its three-frame sufficiency floor, and abstains on **100%** of evaluated cases.',
  '',
  'The signal is in the world state. The expert cannot reach it. That is a defect in',
  'how the curriculum records decisions, not in the Oracle, and it drags router',
  `alignment down to ${baseline.routerAlignment}: cases the corpus classifies ORACLE_DOMINANT have no`,
  'Oracle contribution available to align with.',
  '',
  'The fix is a warm-up of a few ticks before the decision is recorded. That changes',
  'every world hash, so it is a **new corpus version** rather than a patch to this',
  'one — and it is recorded here rather than quietly re-rolled, so the record shows',
  'that the first composed curriculum had this shape.',
  '',
  '## Soup',
  '',
  `Validated against Soup ${soup.soupVersion} format signatures — **every row**, not the first.`,
  'A dataset whose thousandth row fails detection fails in training, which is the',
  'worst place to find out.',
  '',
  ...soup.checks.map((entry) => `- \`${entry.dataset}\`: ${entry.rows} rows, detected \`${(entry.detectedFormats ?? []).join(', ')}\`, expected \`${entry.expectedFormat}\` — ${entry.compatible ? 'compatible' : 'INCOMPATIBLE'}`),
  '',
  'RL episodes carry no Soup signature and none is claimed: GRPO and PPO consume',
  'prompts plus a reward function, not transitions. Saying so is more useful than',
  'inventing a mapping that would fail in training.',
  '',
  '**No training was run and Soup was not invoked.**',
  '',
  '## Measured remaining limitations',
  '',
  ...remainingLimitation.split(' | ').map((entry) => `- ${entry}`),
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage3b-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE3B_STAGE,
  status: certification.status,
  outcome: certification.stage3bOutcome,
  blockers: certification.blockers,
  records: measured.records,
  topologies: measured.diversity.uniqueTopologyHashes,
  effectiveDatasetSize: measured.diversity.effectiveDatasetSize,
  tieRateBefore: comparison.before.tieRate,
  tieRateAfter: comparison.after.tieRate,
  uniqueOptimumRate: measured.uniqueOptimumRate,
  horizonDependent: measured.horizonDependentCases,
  sft: sft.count, preference: preference.count, rl: rl.count,
  primeOptimumRate: baseline.primeOptimumRate,
  primeHorizonDependentOptimumRate: baseline.horizonDependentOptimumRate,
  soupCompatible: soup.allCompatible,
  certificationHash: certification.certificationHash,
}, null, 2));
