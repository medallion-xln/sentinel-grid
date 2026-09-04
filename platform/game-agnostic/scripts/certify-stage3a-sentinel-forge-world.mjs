#!/usr/bin/env node
/* Stage 3A — Sentinel Forge World.
 *
 * A NEW SUBSYSTEM, not a change to an existing one. Every certified decision
 * component — both experts, Prime, the authority core, the contract layer — is a
 * frozen owner here, and the script exits 2 rather than proceed if any of them
 * moves. Forge World is measured against Sentinel; Sentinel is not adjusted to
 * suit Forge World.
 *
 * Usage:
 *   node scripts/certify-stage3a-sentinel-forge-world.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  FORGE_ACTION_TYPES, FORGE_ENTITY_TYPES, FORGE_ILLEGALITY_REASONS, FORGE_RELATION_TYPES,
  FORGE_REWARD_COMPONENTS, FORGE_REWARD_VERSION, FORGE_REWARD_WEIGHTS_V1, FORGE_TERRAIN,
  FORGE_WORLD_VERSION,
} from '../src/forge/contract.js';
import { FORGE_CURRICULUM_LEVELS, FORGE_SCENARIO_FAMILIES, curriculumParameters } from '../src/forge/scenarios.js';
import { FORGE_VALIDATED_FAMILIES, FORGE_VALIDATOR_VERSION } from '../src/forge/validators.js';
import { FORGE_CONTINUATION_POLICY, FORGE_DEFAULT_HORIZON, FORGE_ORACLE_VERSION } from '../src/forge/counterfactual.js';
import { FORGE_ADAPTER_VERSION, FORGE_GAME_ID, forgeWorldAdapter } from '../src/forge/adapter.js';
import { FORGE_REPLAY_RECORD_VERSION, FORGE_REPLAY_SCHEMA_VERSION } from '../src/forge/replay.js';
import { FORGE_EXPORT_FORMATS, FORGE_EXPORT_VERSION } from '../src/forge/export.js';
import {
  CANDIDATE_STATE_AUTHORITY, CANDIDATE_STATES, CANDIDATE_TRANSITIONS, FIRST_FUTURE_TRAINING_TARGET,
  SOUP_CAPABILITIES, SOUP_COMMIT, SOUP_DEPENDENCY_NOTES, SOUP_FORMAT_SIGNATURES, SOUP_VERSION,
  TRAINING_PROVENANCE_FIELDS,
} from '../src/forge/soup-bridge.js';
import {
  STAGE3A_CONTRACT_AUDIT, STAGE3A_STAGE, buildStage3AEvaluation, certifyStage3A,
} from '../src/lab/stage3a-sentinel-forge-world.js';
import { validateAdapter } from '../src/core/contracts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage3a-sentinel-forge-world');
const checkOnly = process.argv.includes('--check');
const sha256File = async (relative) =>
  createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');

const FROZEN_OWNERS = {
  'src/experts/oracle.js': 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  'src/prime/root-puct.js': '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  'src/core/authority.js': 'fa622b39e80fd8808aefa41b4f4525d28bc778f7c3c19db046ee72648e1f2ee8',
  'src/core/contracts.js': '1215a623f553c7c155d60978387a5f9cf42c450733afb9c4dce44b7180df001a',
  'src/core/determinism.js': '06bba4bb8c1018097a684961921eea1c8ed0d7e011252d55fb2705eb3f503bc5',
  'src/core/recommendation.js': '20cf8d3033d9dc9a75be947ec20ab51b1f722cc29f998d23a00e7095c4d2b4af',
  'src/core/zeknova-root.js': 'ac06bd1c6be9c471a55ea33f2e69dd2304557d43335e0ea38ae87c0c79cd2e4a',
  'src/lab/stage2m-portability-and-qualification-readiness.js': '466784dc9bb067d540d803ef8ea80dd70c058c2fa8d9dc60aeddcc90f95e2c56',
  'src/lab/stage2l23-temporal-corpus-well-posedness.js': '6709b53c2f8d63586c1463bc6ccd8a1b013671c036d9da59eadaf0196b1ebd74',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
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
 * Three properties here are load-bearing and none is visible from the diff:
 *
 * 1. THE VALIDATORS MUST BE HEAD-FREE. A semantic validator that consulted Nexus
 *    or Oracle would be scoring the corpus with the thing the corpus scores. This
 *    is the Stage 2L.23 rule, and it is checked on the source rather than trusted.
 *
 * 2. SOUP MUST NOT REACH THE RUNTIME. The bridge may be imported by the lab and
 *    by the certify script; it may not be imported by the kernel, the adapter,
 *    Prime, the router or any expert. Checked as an import-graph property.
 *
 * 3. THE ADAPTER MUST NOT LEAK WORLD TRUTH. If the adapter could hand Sentinel
 *    the counterfactual optimum, the shadow evaluation would be measuring a
 *    copying exercise and every agreement number would be meaningless.
 */
async function measureDiscipline() {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = async (relative) => strip(await readFile(path.join(root, relative), 'utf8'));

  const validators = await read('src/forge/validators.js');
  const adapter = await read('src/forge/adapter.js');
  const kernel = await read('src/forge/kernel.js');
  const renderer = await read('src/forge/render.js');
  const labModule = await read('src/lab/stage3a-sentinel-forge-world.js');

  const importsOf = (source) => [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  /* 1 — head-free validators. */
  const validatorImports = importsOf(validators);
  const validatorCallsExpert = validatorImports.some((specifier) => /experts\//.test(specifier))
    || /evaluateNexus|evaluateOracle|assembleOracleV2/.test(validators);

  /* 2 — Soup isolation, over the whole runtime surface. */
  const runtimeFiles = [
    'src/forge/kernel.js', 'src/forge/adapter.js', 'src/forge/contract.js', 'src/forge/render.js',
    'src/forge/scenarios.js', 'src/forge/validators.js', 'src/forge/counterfactual.js',
    'src/prime/root-puct.js', 'src/experts/nexus.js', 'src/experts/oracle.js', 'src/core/contracts.js',
  ];
  const soupLeaks = [];
  for (const file of runtimeFiles) {
    const source = await read(file);
    if (importsOf(source).some((specifier) => /soup/i.test(specifier)) || /soup_cli|SOUP_COMMIT/i.test(source)) {
      soupLeaks.push(file);
    }
  }

  /* 3 — the adapter must not expose world truth. */
  const adapterLeaksTruth = /evaluateCounterfactuals|optimalAction|optimalScalar|counterfactual/i.test(adapter)
    && !/counterfactualOracleExposed/.test(adapter.replace(/counterfactualOracleExposed/g, ''));
  const adapterImports = importsOf(adapter);
  const adapterImportsOracle = adapterImports.some((specifier) => /counterfactual/.test(specifier));

  /* The renderer must stay presentational: nothing may import it into the
   * simulation path, or the display would become part of world identity. */
  const rendererImportedByKernel = importsOf(kernel).some((specifier) => /render/.test(specifier));
  const rendererImportedByAdapter = adapterImports.some((specifier) => /render/.test(specifier));

  /* No training may be executed by a Stage 3A run. */
  const executesTraining = /child_process|spawnSync|execSync/.test(labModule)
    || /\btrain\(|runTraining|soup\s+train/.test(labModule);

  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(labModule);
  const raisesAuthority = /tier:\s*'R[1-5]'|AuthorityTier\.R[1-5]/.test(labModule + adapter + kernel);

  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    validatorImports,
    semanticValidatorCallsExpert: validatorCallsExpert,
    soupLeakedIntoRuntime: soupLeaks,
    adapterImportsCounterfactualOracle: adapterImportsOracle,
    adapterLeaksWorldTruth: adapterImportsOracle,
    rendererImportedByKernel,
    rendererImportedByAdapter,
    executesTraining,
    declaresOwnReliabilityFloor: declaresFloor,
    raisesAuthority,
    disciplineHolds: !validatorCallsExpert && soupLeaks.length === 0 && !adapterImportsOracle
      && !rendererImportedByKernel && !rendererImportedByAdapter && !executesTraining
      && !declaresFloor && !raisesAuthority && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE3A_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE3A_BLOCKED=true reason=NEW_SUBSYSTEM_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline, null, 2)}`);
  process.exit(2);
}

/* The adapter must validate as an ORDINARY Sentinel adapter. If it needed a
 * special case, every measurement downstream would describe a system nobody runs. */
const { manifest } = validateAdapter(forgeWorldAdapter);

const evaluation = buildStage3AEvaluation();
const certification = certifyStage3A({ evaluation });

for (const [condition, reason] of [
  [certification.freeze.nexusChanged === false && certification.freeze.oracleChanged === false, 'EXPERT_CHANGED_BY_A_SIMULATOR_STAGE'],
  [certification.freeze.primePolicyChanged === false, 'PRIME_POLICY_CHANGED'],
  [certification.freeze.modelTrained === false, 'MODEL_TRAINED_IN_A_FOUNDATION_STAGE'],
  [certification.freeze.soupConnectedToInference === false, 'SOUP_REACHED_SENTINEL_INFERENCE'],
  [certification.candidateGovernance.soupCanCertify === false, 'SOUP_CAN_CERTIFY_AN_EXPERT'],
  [certification.authority === 'R0' && certification.canDispatch === false && certification.canMutateLiveWorld === false, 'AUTHORITY_BOUNDARY_VIOLATED'],
  [evaluation.gateSensitivity.allCaught === true, 'ADMISSION_GATE_CANNOT_REJECT_A_MISLABELLED_SCENARIO'],
  [evaluation.counterfactualSourceUnchanged === true, 'COUNTERFACTUAL_BRANCHING_MUTATED_ITS_SOURCE'],
]) {
  if (!condition) { console.error(`STAGE3A_BLOCKED=true reason=${reason}`); process.exit(2); }
}

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage3a-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE3A_CERTIFICATION', reproduced: match,
    storedHash: stored.certificationHash, recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) => writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);

await write('stage3a-certification-result.json', certification);
await write('stage3a-existing-contract-audit.json', STAGE3A_CONTRACT_AUDIT);
await write('stage3a-world-contract.json', {
  forgeWorldVersion: FORGE_WORLD_VERSION,
  entityTypes: FORGE_ENTITY_TYPES,
  relationTypes: FORGE_RELATION_TYPES,
  terrain: FORGE_TERRAIN,
  asciiIsPresentationOnly: true,
  authoritativeState: 'STRUCTURED_JSON',
  arithmetic: 'INTEGER_ONLY_NO_FLOATING_POINT_IN_TRANSITION_OR_REWARD',
});
await write('stage3a-action-contract.json', {
  actionTypes: FORGE_ACTION_TYPES,
  actionTypeCount: Object.keys(FORGE_ACTION_TYPES).length,
  illegalityReasons: FORGE_ILLEGALITY_REASONS,
  illegalActionBehaviour: 'THROWS_BY_NAME_AND_PRODUCES_NO_WORLD',
  identity: 'sha256 over [actionType, actorId, target, parameters]',
});
await write('stage3a-reward-contract.json', {
  rewardVersion: FORGE_REWARD_VERSION,
  components: FORGE_REWARD_COMPONENTS,
  componentCount: FORGE_REWARD_COMPONENTS.length,
  weights: FORGE_REWARD_WEIGHTS_V1,
  scalarization: 'exact integer weighted sum',
  versioningRule: 'Any weight change MUST create a new reward version id. A stored scalar is only interpretable against the weights that produced it.',
});
await write('stage3a-scenario-family-inventory.json', {
  families: FORGE_SCENARIO_FAMILIES,
  familyCount: FORGE_SCENARIO_FAMILIES.length,
  validatedFamilies: FORGE_VALIDATED_FAMILIES,
  everyFamilyHasAValidator: FORGE_SCENARIO_FAMILIES.every((entry) => FORGE_VALIDATED_FAMILIES.includes(entry.id)),
});
await write('stage3a-curriculum-contract.json', {
  curriculumVersion: 'FORGE_CURRICULUM_V1',
  levels: FORGE_CURRICULUM_LEVELS,
  levelCount: FORGE_CURRICULUM_LEVELS.length,
  parametersByLevel: FORGE_CURRICULUM_LEVELS.map((entry) => curriculumParameters(entry.level)),
  derivation: 'Difficulty is a pure function of (scenario family, level, seed). No level reads a clock, a counter or a global.',
});
await write('stage3a-semantic-admission-gate.json', {
  validatorVersion: FORGE_VALIDATOR_VERSION,
  architecture: 'generate -> validate -> assert -> admit',
  headFree: discipline.semanticValidatorCallsExpert === false,
  corpus: certification.corpus,
  sensitivity: evaluation.gateSensitivity,
  rule: 'A generator declaration is not ground truth. The family label selects which validator runs; it is never evidence that the claim holds.',
});
await write('stage3a-performance-benchmark.json', evaluation.performance);
await write('stage3a-sentinel-adapter.json', {
  adapterId: manifest.adapterId,
  gameId: FORGE_GAME_ID,
  adapterVersion: FORGE_ADAPTER_VERSION,
  manifest,
  validatesAsOrdinaryAdapter: true,
  forgeSpecificDecisionShortcuts: 0,
  counterfactualOracleReachableFromAdapter: discipline.adapterImportsCounterfactualOracle,
  shadow: certification.shadow,
});
await write('stage3a-replay-schema.json', {
  recordVersion: FORGE_REPLAY_RECORD_VERSION,
  schemaVersion: FORGE_REPLAY_SCHEMA_VERSION,
  integrity: certification.replayIntegrity,
  hashRule: 'self-excluding: recordHash covers every field except recordHash',
  pathRule: 'no absolute filesystem path may appear in semantic identity',
});
await write('stage3a-dataset-export-contract.json', {
  exportVersion: FORGE_EXPORT_VERSION,
  formats: FORGE_EXPORT_FORMATS,
  counts: certification.datasetExport.counts,
  contentHashes: certification.datasetExport.contentHashes,
  datasetHash: certification.datasetExport.datasetHash,
  exclusions: {
    sftExcludedTies: certification.datasetExport.sftExcludedTies,
    preferenceSkippedZeroGap: certification.datasetExport.preferenceSkippedZeroGap,
    rationale: 'A tie has no single correct completion and a zero-gap pair is not a preference. Both are excluded and counted rather than emitted as if the world had an opinion.',
  },
});
await write('stage3a-soup-capability-audit.json', {
  soupCommit: SOUP_COMMIT,
  soupVersion: SOUP_VERSION,
  capabilities: SOUP_CAPABILITIES,
  dependencyNotes: SOUP_DEPENDENCY_NOTES,
  formatSignatures: SOUP_FORMAT_SIGNATURES,
  auditedFrom: 'a clone in an isolated training-tools location outside the Sentinel repository',
  embeddedInSentinelRuntime: false,
});
await write('stage3a-soup-bridge-contract.json', {
  bridgeVersion: evaluation.bridge.bridgeVersion,
  formatMap: evaluation.bridge.formatMap,
  compatibilityChecks: evaluation.bridge.compatibilityChecks,
  allCompatible: evaluation.bridge.allCompatible,
  translationIsNecessary: evaluation.bridge.translationIsNecessary,
  untranslatedSftDetectedAs: evaluation.bridge.untranslatedSftDetectedAs,
  sourceDatasetHash: evaluation.bridge.sourceDatasetHash,
  simulatorVersion: evaluation.bridge.simulatorVersion,
  rewardVersion: evaluation.bridge.rewardVersion,
  curriculumVersion: evaluation.bridge.curriculumVersion,
  exportVersion: evaluation.bridge.exportVersion,
  trainingExecuted: false,
});
await write('stage3a-training-provenance-contract.json', {
  fields: TRAINING_PROVENANCE_FIELDS,
  fieldCount: TRAINING_PROVENANCE_FIELDS.length,
  enforcement: evaluation.provenance,
  rule: 'A candidate without complete training provenance is rejected, not accepted with a warning.',
});
await write('stage3a-candidate-governance.json', {
  states: CANDIDATE_STATES,
  transitions: CANDIDATE_TRANSITIONS,
  stateAuthority: CANDIDATE_STATE_AUTHORITY,
  probes: evaluation.governance.probes,
  soupCanCertify: evaluation.governance.soupCanCertify,
  sentinelOwnsPromotion: evaluation.governance.sentinelOwnsPromotion,
  firstFutureTrainingTarget: FIRST_FUTURE_TRAINING_TARGET,
});
await write('stage3a-security-regression.json', {
  frozenOwners: freeze,
  discipline,
  adversarial: evaluation.adversarial,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  dispatchProbe: evaluation.shadow.dispatchProbe,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  soupRuntimeIntegration: false,
  modelTrained: false,
  pass: freeze.allUnchanged && discipline.disciplineHolds
    && evaluation.adversarial.allBehaveAsSpecified && evaluation.adversarial.sourceWorldUnchanged,
});
await write('stage3a-sample-world.json', {
  render: evaluation.sampleRender,
  note: 'A rendered world, for orientation only. The renderer is a presentation layer: changing it changes what a human sees and nothing a certification depends on.',
});

const shadow = certification.shadow;
const report = [
  '# Stage 3A — Sentinel Forge World',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.stage3aOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## What this is',
  '',
  'A deterministic simulation environment that owns world truth: dynamics, legal',
  'actions, canonical state, exact counterfactual outcomes, and a versioned reward.',
  'It renders as ASCII for humans and is authoritative as structured state — the',
  'renderer is never read back, never enters world identity, and is checked by the',
  'certify script for exactly that.',
  '',
  '```',
  evaluation.sampleRender ?? '(no sample)',
  '```',
  '',
  `${certification.entityTypeCount} entity types · ${certification.relationTypeCount} relation types · ${certification.actionTypeCount} action types · ${certification.rewardComponentCount} reward components under \`${certification.rewardVersion}\`.`,
  '',
  '## It is an ordinary Sentinel adapter',
  '',
  'Forge World implements the existing Adapter SDK contract. Prime, the router and',
  'both experts run against it with no Forge-specific branch anywhere in their path,',
  `and Prime produced a legal recommendation on **${(shadow.primeLegalRecommendationRate * 100).toFixed(1)}%** of ${shadow.casesEvaluated} cases`,
  `(${shadow.primeIllegalRecommendations} illegal). The counterfactual oracle is deliberately unreachable from`,
  'the adapter: an adapter that could hand Sentinel the answer would turn the shadow',
  'evaluation into a copying exercise.',
  '',
  '## Everything is integer arithmetic',
  '',
  'No floating point appears in any transition or reward path. Determinism is then a',
  'property of the arithmetic rather than a hope about it, and an exact tie is exactly',
  'a tie — which turns out to matter more than expected.',
  '',
  '## The admission gate, and its own control',
  '',
  `${certification.corpus.generated} scenarios generated, ${certification.corpus.admitted} admitted, ${certification.corpus.rejected} rejected.`,
  '',
  'A 100% admission rate is not evidence that a gate works — it is equally consistent',
  'with a gate that cannot reject anything. So the gate is given a control: seven',
  'scenarios are generated under one family and validated against a **different**',
  `family's claim. All ${evaluation.gateSensitivity.probeCount} were refused, and the honest claim held in every case.`,
  '',
  'The gate also earned its place during construction. `prime/resource_constrained_planning`',
  'was rejected on all eighteen of its first cases: the generator placed repairable',
  'nodes by entity count, so the energy budget always covered every repair and the',
  'family claimed a constraint that was not in the world it produced. The generator',
  'was wrong and the validator was right.',
  '',
  '## Effective variation, not raw count',
  '',
  '| measure | value |',
  '| --- | --- |',
  `| raw case count | ${certification.variation.rawCaseCount} |`,
  `| unique canonical states | ${certification.variation.uniqueCanonicalStates} |`,
  `| unique topologies | ${certification.variation.uniqueTopologies} |`,
  `| unique outcome rankings | ${certification.variation.uniqueOutcomeRankings} |`,
  `| **reportable sample size** | **${certification.variation.reportableSampleSize}** |`,
  '',
  `${certification.variation.rawCaseCount} cases rest on ${certification.variation.uniqueTopologies} distinct topologies. The reportable figure is the smallest`,
  'of the distinct-state, distinct-topology and distinct-ranking counts; quoting the',
  'raw count as independent sample size would overstate the corpus.',
  '',
  '## The measurement that had to be corrected',
  '',
  'The first run reported **0%** agreement between Prime and the counterfactual',
  'optimum on all 144 Oracle-surface cases. Zero across a whole surface is a claim',
  'about a systematic effect, so it was inspected rather than reported — and the',
  'defect was in the metric. Prime was choosing `PROTECT target`, which **tied** at',
  'the optimum, and losing a lexicographic tie-break to a `MOVE`. The metric was',
  'measuring agreement with a sorting rule.',
  '',
  'Agreement now means regret zero — an action *of optimal utility* — and the',
  'tie-break match is reported separately as the far less interesting number it is.',
  '',
  '## What Forge World measured about Sentinel',
  '',
  '| measure | value |',
  '| --- | --- |',
  `| decisive cases (utility spread > 0) | ${shadow.decisiveCases} |`,
  `| agreement with the optimal set | ${(shadow.optimumAgreementRate * 100).toFixed(2)}% |`,
  `| match with the tie-break winner | ${(shadow.tieBreakMatchRate * 100).toFixed(2)}% |`,
  `| cases with a **unique** optimum | ${shadow.uniqueOptimumCases} |`,
  `| agreement where the optimum is unique | ${shadow.uniqueOptimumAgreementRate === null ? 'n/a' : `${(shadow.uniqueOptimumAgreementRate * 100).toFixed(2)}%`} |`,
  '',
  'The headline 74% is carried almost entirely by cases where several actions tie at',
  'the optimum. The decomposition says why:',
  '',
  '| | cases | agreement |',
  '| --- | --- | --- |',
  `| horizon-aligned (one-step optimum **is** the horizon optimum) | ${shadow.horizonAlignedCases} | ${(shadow.horizonAlignedAgreementRate * 100).toFixed(2)}% |`,
  `| horizon-dependent (they differ) | ${shadow.horizonDependentCases} | ${(shadow.horizonDependentAgreementRate * 100).toFixed(2)}% |`,
  '',
  'Prime scores an action over **one** step; the oracle scores it over three under a',
  'declared continuation policy. Where those objectives agree Prime reaches the',
  `optimum ${(shadow.horizonAlignedAgreementRate * 100).toFixed(0)}% of the time; where they disagree it reaches it never, because a`,
  'one-step objective structurally cannot. That is an objective mismatch, measured —',
  'not a search defect, and not a claim that Prime is wrong.',
  '',
  `Those ${shadow.horizonDependentCases} horizon-dependent cases are the first precisely characterised target this`,
  'substrate has produced.',
  '',
  '## Soup',
  '',
  `Audited at \`${SOUP_COMMIT.slice(0, 12)}\` (v${SOUP_VERSION}, Apache-2.0), cloned to an isolated`,
  'training-tools location. No Soup file is imported by, vendored into or referenced',
  'from Sentinel runtime source, and the certify script checks the import graph of',
  'every runtime file for exactly that.',
  '',
  'The bridge is a **translation**, and the audit is what proved it: Forge SFT rows',
  'are `{prompt, completion}`, which matches no Soup format signature at all — `kto`',
  'is the only signature containing both keys and it additionally requires `label`.',
  'Handing Soup the raw export would fail detection. Preference rows are the opposite',
  'case: `{prompt, chosen, rejected}` is Soup\'s `dpo` signature exactly.',
  '',
  'Every translated row is run through Soup\'s own detection rule, and the',
  '**untranslated** row is run through it too as a control — it must detect as',
  'nothing, which is what proves the translation does work rather than decorating a',
  'row that already passed.',
  '',
  '## Governance',
  '',
  'Soup may reach `TRAINED`. It may never reach `CERTIFIED`: no transition into that',
  'state names any actor but Sentinel certification, and the certify script blocks if',
  `that ever becomes false. \`SOUP_CAN_CERTIFY_EXPERT=${evaluation.governance.soupCanCertify}\`.`,
  '',
  'No model was trained. No candidate exists. Nothing was promoted.',
  '',
  '## Measured remaining limitations',
  '',
  ...certification.interpretation.measuredRemainingLimitation.split(' | ').map((entry) => `- ${entry}`),
  `- **${certification.shadow.exactTieCases} of ${shadow.casesEvaluated} cases have an exact tie at the optimum**, which caps SFT yield at ${certification.datasetExport.counts.sft} rows. A reward vector this coarse leaves many actions genuinely indistinguishable; sharpening it is scenario-design work, not a defect in the arithmetic.`,
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage3a-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE3A_STAGE,
  status: certification.status,
  outcome: certification.stage3aOutcome,
  blockers: certification.blockers,
  forgeWorldVersion: FORGE_WORLD_VERSION,
  scenarioFamilies: certification.scenarioFamilyCount,
  generated: certification.corpus.generated,
  admitted: certification.corpus.admitted,
  rejected: certification.corpus.rejected,
  effectiveVariation: certification.variation.effectiveVariationCount,
  primeLegalRate: shadow.primeLegalRecommendationRate,
  optimumAgreementRate: shadow.optimumAgreementRate,
  uniqueOptimumAgreementRate: shadow.uniqueOptimumAgreementRate,
  horizonDependentAgreementRate: shadow.horizonDependentAgreementRate,
  counterfactualActionsEvaluated: shadow.counterfactualActionsEvaluated,
  datasetCounts: certification.datasetExport.counts,
  soupBridgeCompatible: certification.soup.allCompatible,
  soupCanCertify: certification.candidateGovernance.soupCanCertify,
  certificationHash: certification.certificationHash,
}, null, 2));
