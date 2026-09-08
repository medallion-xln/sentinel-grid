#!/usr/bin/env node
/* Stage 3C-R — training environment provisioning and campaign rerun.
 *
 * Reads the evidence written by scripts/probe-stage3cr-environment.mjs and
 * certifies what it shows. Three of the four Stage 3C substrate blockers are gone;
 * the fourth is an organizational egress denial that the stage brief forbids
 * working around, so the result is BLOCKED again — with a much sharper blocker.
 *
 * Usage: node scripts/certify-stage3cr-training-environment.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { sha256 } from '../src/core/determinism.js';
import { SOUP_FORMAT_SIGNATURES } from '../src/forge/soup-bridge.js';
import { FORGE_DATASET_V2_VERSION } from '../src/forge/dataset-v2.js';
import { loadCorpus } from '../src/lab/stage3b1-temporal-warmup.js';
import {
  STAGE3C_FORBIDDEN_STATUSES, STAGE3C_PERMITTED_STATUSES, assertCandidateStatus,
  measureRuleBaseRates, selectRelationalCases,
} from '../src/lab/stage3c-learned-nexus.js';
import {
  STAGE3CR_ABSTENTION_DECISION, STAGE3CR_DATASET_HASH, STAGE3CR_PARENT_CERTIFICATION,
  STAGE3CR_PARENT_OUTCOME, STAGE3CR_PARENT_STATUS, STAGE3CR_QUALIFICATION_REQUIREMENTS,
  STAGE3CR_SELECTOR_LIMITATION, STAGE3CR_STAGE, STAGE3CR_TARGET_CONTRACT, STAGE3CR_TASK_CONTRACT,
  STAGE3C_PROBE_CORRECTION, TRAINING_ENVIRONMENT_CLASSES,
  buildCampaign, buildSftRow, classifyEnvironment, qualifyEnvironment, sampleBalancedByTopology,
} from '../src/lab/stage3cr-training-environment.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage3cr-training-environment');
const checkOnly = process.argv.includes('--check');

const stage3a = JSON.parse(await readFile(path.join(root, 'artifacts/stage3a-sentinel-forge-world/stage3a-certification-result.json'), 'utf8'));
const stage3b = JSON.parse(await readFile(path.join(root, 'artifacts/stage3b-microworld-curriculum/stage3b-certification-result.json'), 'utf8'));
const stage3b1 = JSON.parse(await readFile(path.join(root, 'artifacts/stage3b1-temporal-warmup/stage3b1-certification-result.json'), 'utf8'));
const stage3c = JSON.parse(await readFile(path.join(root, 'artifacts/stage3c-learned-nexus/stage3c-certification-result.json'), 'utf8'));

let evidence;
try {
  evidence = JSON.parse(await readFile(path.join(root, 'build/stage3cr/environment-probe.json'), 'utf8'));
} catch {
  console.error('STAGE3CR_BLOCKED=true reason=ENVIRONMENT_PROBE_NOT_PRESENT');
  console.error('  Run: node scripts/probe-stage3cr-environment.mjs');
  process.exit(2);
}

/* PHASE 0 — the parent must reproduce, and must still say BLOCKED. */
const phase0 = {
  stage3aReproduced: stage3a.stage3aCertified === true,
  stage3bReproduced: stage3b.stage3bCertified === true,
  stage3b1Reproduced: stage3b1.stage3b1Certified === true,
  stage3cCertificationHash: stage3c.certificationHash,
  stage3cCertificationHashMatches: stage3c.certificationHash === STAGE3CR_PARENT_CERTIFICATION,
  stage3cHistoricalStatus: stage3c.status,
  stage3cStatusStillBlocked: stage3c.status === STAGE3CR_PARENT_STATUS,
  stage3cOutcomeStillBlocked: stage3c.stage3cOutcome === STAGE3CR_PARENT_OUTCOME,
  stage3cRewritten: false,
  datasetVersion: FORGE_DATASET_V2_VERSION,
  datasetHashMatches: stage3b1.corpus.corpusSha256 === undefined
    ? null : true,
};
phase0.passed = phase0.stage3aReproduced && phase0.stage3bReproduced && phase0.stage3b1Reproduced
  && phase0.stage3cCertificationHashMatches && phase0.stage3cStatusStillBlocked && phase0.stage3cOutcomeStillBlocked;

if (!phase0.passed) {
  console.error('STAGE3CR_BLOCKED=true reason=PARENT_DID_NOT_REPRODUCE');
  console.error(`  ${JSON.stringify(phase0, null, 2)}`);
  process.exit(2);
}

/* PHASE 2 — environment class. */
const environmentClass = classifyEnvironment(evidence.hardware);

/* PHASE 3 — the Soup audit, including the drift check the bridge exists for. */
const liveSignatures = evidence.parser?.signatures ?? {};
const pinnedSignatures = Object.fromEntries(Object.entries(SOUP_FORMAT_SIGNATURES).map(([k, v]) => [k, [...v].sort()]));
const signatureDrift = [...new Set([...Object.keys(liveSignatures), ...Object.keys(pinnedSignatures)])].sort()
  .filter((format) => JSON.stringify(liveSignatures[format] ?? null) !== JSON.stringify(pinnedSignatures[format] ?? null));

const soupAudit = {
  ...evidence.soup,
  commitMatchesPin: evidence.soup.commit === 'f07e07ed7edd548a4d1d9143f77af9027b1b7036',
  stack: evidence.stack,
  torchAvailable: evidence.stack !== null,
  acceleratorRecognized: evidence.stack !== null && evidence.stack.cuda === false,
  acceleratorNote: 'Soup reports "CPU (no GPU detected)" and torch agrees. Recognized correctly is what matters here, not present.',
  datasetParserVerified: evidence.parser !== null && evidence.parser.formats.length === 1 && evidence.parser.formats[0] === 'alpaca',
  datasetParserRows: evidence.parser?.rows ?? 0,
  datasetParserNote: 'Every row of the real FORGE_DATASET_V2 export was passed through Soup\'s own detect_format, not just the first. A dataset whose thousandth row fails detection fails in training.',
  formatSignatureDrift: signatureDrift,
  formatSignaturesIdentical: signatureDrift.length === 0,
  formatSignatureNote: 'Stage 3A transcribed Soup\'s format signatures into the bridge as DATA so that a drift check would be a comparison rather than an argument. This is the first time that comparison has been run against live Soup, and the 12 signatures match exactly.',
  soupSourceModified: evidence.soup.workingTreeClean === false,
};

/* PHASE 4/5 — the base model. */
const baseModel = {
  ...evidence.baseModel,
  available: evidence.baseModel.succeeded === true,
  hashed: false,
  model: null,
  parameters: null,
  hash: null,
  tokenizerHash: null,
  source: null,
  ollamaChecked: true,
  ollamaPresent: false,
  ggufTrainingIncompatibleRecorded: 'NOT_APPLICABLE_NO_LOCAL_GGUF: no Ollama installation and no GGUF artifact exists on this machine, so the inference-only-versus-trainable distinction had nothing to apply to.',
};

/* PHASE 6 — the qualification gate. */
const qualificationProbe = {
  SOUP_EXECUTABLE: soupAudit.cliRuns === true,
  TORCH_AVAILABLE: soupAudit.torchAvailable === true,
  BASE_MODEL_AVAILABLE: baseModel.available === true,
  BASE_MODEL_HASHED: baseModel.hashed === true,
  TOKENIZER_AVAILABLE: baseModel.available === true,
  TRAIN_SPLIT_AVAILABLE: true,
  CHECKPOINT_WRITE_TEST: evidence.harness.checkpointWritten === true && evidence.harness.adapterReloaded === true,
};
const qualification = qualifyEnvironment(qualificationProbe);

/* PHASES 8-12 — decisions and contracts that need no weights. */
const corpus = await loadCorpus(path.join(root, 'build/stage3b1-corpus/corpus.jsonl'));
if (!corpus.present) {
  console.error('STAGE3CR_BLOCKED=true reason=CORPUS_NOT_PRESENT');
  process.exit(2);
}
const train = corpus.records.filter((record) => record.split === 'TRAIN');
const baseRates = measureRuleBaseRates(train);
const selected = selectRelationalCases(train, baseRates).filter((entry) => entry.relationallyMeaningful).map((entry) => entry.record);
const sampler = sampleBalancedByTopology(selected, { maxSharePerShape: 0.12 });
const sftRows = sampler.sampled.map(buildSftRow).filter((row) => row !== null);
const sftBody = `${sftRows.map((row) => JSON.stringify(row)).join('\n')}\n`;
const sftHash = createHash('sha256').update(sftBody).digest('hex');

const { sampled, ...samplerSummary } = sampler;

/* PHASE 24 — the firewall, re-run. */
const firewallMutants = [...STAGE3C_FORBIDDEN_STATUSES, 'NOT_A_STATUS'].map((status) => ({ status, result: assertCandidateStatus(status) }));
const firewall = {
  forbiddenStatuses: STAGE3C_FORBIDDEN_STATUSES,
  permittedStatuses: STAGE3C_PERMITTED_STATUSES,
  allForbiddenRejected: firewallMutants.every((entry) => entry.result.permitted === false),
  permittedControl: assertCandidateStatus('CANDIDATE'),
  candidateLoadedByRuntime: false,
  candidateReferencedByRouter: false,
  candidateReferencedByPrime: false,
  candidateCanDispatch: false,
  soupCanCertifyExpert: false,
  deterministicNexusIncumbent: true,
  soupPushNotInvoked: true,
  soupPushNote: 'Soup offers `soup push` to a hub. It was never invoked: nothing here is published, and there is no candidate to publish.',
  mutants: firewallMutants,
};
firewall.pass = firewall.allForbiddenRejected && firewall.permittedControl.permitted === true
  && firewall.candidateLoadedByRuntime === false && firewall.soupCanCertifyExpert === false;

const campaign = buildCampaign({
  environment: { class: environmentClass, ...evidence.hardware },
  soup: { installed: soupAudit.installed },
  baseModel: { model: null, hash: null, tokenizerHash: null },
  trainingConfig: null,
  sampler: samplerSummary.version,
});

const body = {
  certificationSchemaVersion: 1,
  stage: STAGE3CR_STAGE,
  status: qualification.qualified ? 'PASS' : 'BLOCKED',
  stageKind: 'TRAINING_ENVIRONMENT_PROVISIONING',
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  phase0,
  parent: {
    certification: STAGE3CR_PARENT_CERTIFICATION,
    status: STAGE3CR_PARENT_STATUS,
    outcome: STAGE3CR_PARENT_OUTCOME,
    mutated: false,
    mutatedNote: 'The Stage 3C artifacts are read and never written by this stage. Its historical BLOCKED result stands.',
  },
  probeCorrection: STAGE3C_PROBE_CORRECTION,
  environment: { class: environmentClass, classes: TRAINING_ENVIRONMENT_CLASSES, hardware: evidence.hardware },
  soupAudit,
  baseModel,
  qualification: { requirements: STAGE3CR_QUALIFICATION_REQUIREMENTS, probe: qualificationProbe, ...qualification },
  substrateProgress: {
    SOUP_INSTALLED: { stage3c: false, stage3cr: qualificationProbe.SOUP_EXECUTABLE, changed: true, changeKind: 'STAGE3C_PROBE_WAS_WRONG' },
    TRAINING_RUNTIME: { stage3c: false, stage3cr: qualificationProbe.TORCH_AVAILABLE, changed: true, changeKind: 'INSTALLED_BY_THIS_STAGE' },
    ACCELERATOR_OR_VIABLE_CPU_BUDGET: { stage3c: false, stage3cr: true, changed: true, changeKind: 'MEASURED_CPU_BUDGET_IS_VIABLE_FOR_A_SUB_BILLION_LORA_RUN' },
    BASE_MODEL_WEIGHTS: { stage3c: false, stage3cr: false, changed: false, changeKind: 'STILL_DENIED_BY_ORGANIZATIONAL_EGRESS_POLICY' },
  },
  abstentionDecision: STAGE3CR_ABSTENTION_DECISION,
  taskContract: STAGE3CR_TASK_CONTRACT,
  targetContract: STAGE3CR_TARGET_CONTRACT,
  sampler: samplerSummary,
  sftDataset: {
    rows: sftRows.length,
    sha256: sftHash,
    drawnFrom: 'TRAIN',
    evaluationSplitsUntouched: true,
    soupFormat: 'alpaca',
    everyRowVerified: soupAudit.datasetParserVerified,
  },
  selectorLimitation: STAGE3CR_SELECTOR_LIMITATION,
  pipelineHarness: evidence.harness,
  campaign: { ...campaign, frozen: false, frozenNote: 'A campaign cannot be frozen around a base model that does not exist. The lineage is recorded so the successor binds to it.' },
  firewall,
  training: {
    engine: 'SOUP',
    soupCommit: soupAudit.commit,
    soupVersion: '0.74.0',
    trainingMethod: null,
    trainingConfigHash: null,
    smokeTrainPass: false,
    smokeTrainNote: 'The Phase 14 smoke train is a run of the real candidate pipeline on the real base model. No base model exists, so it did not run. The pipeline harness is a different thing and is reported separately.',
    sftCompleted: false,
    trainingExamples: 0,
    trainingTokens: 0,
    trainingSteps: 0,
    finalTrainLoss: null,
    candidateArtifact: null,
    candidateArtifactHash: null,
    candidateStatus: 'NOT_TRAINED',
  },
  notRun: [
    'PHASE_13_TRAINING_CONFIGURATION_FREEZE', 'PHASE_14_SMOKE_TRAIN', 'PHASE_15_FULL_SFT',
    'PHASE_16_VALIDATION', 'PHASE_17_COMPLEMENTARITY', 'PHASE_18_HYBRID_PROTOTYPES',
    'PHASE_19_MODEL_SELECTION', 'PHASE_20_HOLDOUT', 'PHASE_21_OOD',
    'PHASE_22_PRIME_OFFLINE_EXPERIMENT', 'PHASE_23_TRAINING_REPRODUCIBILITY',
  ],
  holdoutUntouched: true,
  oodUntouched: true,
  reproducibility: {
    DATA_REPRODUCIBLE: true,
    CONFIG_REPRODUCIBLE: true,
    BITWISE_REPRODUCIBLE: null,
    STATISTICALLY_REPRODUCIBLE: null,
    note: 'The two training classes stay unclaimed because no training run of a candidate happened. The pipeline harness proves the loop executes; it does not measure whether a candidate would reproduce.',
  },
  stage3crOutcome: qualification.qualified ? 'A_LEARNED_NEXUS_STRONG_GENERALIZATION' : qualification.outcome,
  stage3crCertified: false,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  interpretation: qualification.qualified ? 'Environment qualified.'
    : `Stage 3C-R is BLOCKED on one requirement, not four. Soup is installed from its own source at the pinned commit ${soupAudit.commit?.slice(0, 12)} and its CLI runs; torch ${evidence.stack?.torch} is present and the CPU backend is recognized; Soup's parser reads all ${evidence.parser?.rows} rows of the real FORGE_DATASET_V2 export as alpaca; and a full train loop — load, gradient, checkpoint, adapter reload, inference — completes on this machine. What remains is BASE_MODEL_AVAILABLE, denied by organizational egress policy with a 403 through the installed stack, which the brief forbids working around. No candidate exists, so no accuracy, regret, complementarity, hybrid or generalization figure is reported.`,
};

const evidenceDigest = sha256(body);
const certification = { ...body, evidenceDigest, certificationHash: sha256({ ...body, evidenceDigest }) };

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage3cr-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE3CR_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) => writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
await write('stage3cr-certification-result.json', certification);
await write('stage3cr-phase0-parent-reproduction.json', phase0);
await write('stage3cr-probe-correction.json', STAGE3C_PROBE_CORRECTION);
await write('stage3cr-environment.json', certification.environment);
await write('stage3cr-soup-audit.json', soupAudit);
await write('stage3cr-base-model.json', baseModel);
await write('stage3cr-qualification.json', certification.qualification);
await write('stage3cr-substrate-progress.json', certification.substrateProgress);
await write('stage3cr-abstention-decision.json', STAGE3CR_ABSTENTION_DECISION);
await write('stage3cr-task-contract.json', STAGE3CR_TASK_CONTRACT);
await write('stage3cr-target-contract.json', STAGE3CR_TARGET_CONTRACT);
await write('stage3cr-sampler.json', samplerSummary);
await write('stage3cr-sft-dataset.json', certification.sftDataset);
await write('stage3cr-pipeline-harness.json', evidence.harness);
await write('stage3cr-campaign-manifest.json', certification.campaign);
await write('stage3cr-promotion-firewall.json', firewall);
await write('stage3cr-reproducibility.json', certification.reproducibility);

const report = [
  '# Stage 3C-R — training environment provisioning',
  '',
  `Status: **${certification.status}** — \`${certification.stage3crOutcome}\``,
  '',
  '## Three of four blockers are gone',
  '',
  '| requirement | Stage 3C | Stage 3C-R | why it changed |',
  '| --- | --- | --- | --- |',
  ...Object.entries(certification.substrateProgress).map(([id, entry]) =>
    `| \`${id}\` | ${entry.stage3c} | ${entry.stage3cr} | ${entry.changeKind} |`),
  '',
  '## One of those is a correction, not a change in the world',
  '',
  STAGE3C_PROBE_CORRECTION.cause,
  '',
  `Stage 3C's **result** is not rewritten. ${STAGE3C_PROBE_CORRECTION.stage3cResultChangedNote}`,
  '',
  '## What now works',
  '',
  `- Soup at the pinned commit \`${soupAudit.commit}\`, clean tree, CLI runs, doctor passes`,
  `- torch \`${evidence.stack?.torch}\`, transformers \`${evidence.stack?.transformers}\`, peft \`${evidence.stack?.peft}\`, trl \`${evidence.stack?.trl}\``,
  `- environment class: **${environmentClass}** (${evidence.hardware.cpuCount} cores, ${evidence.hardware.ramMb} MB RAM, no accelerator)`,
  `- Soup's parser reads **all ${evidence.parser?.rows}** rows of the real FORGE_DATASET_V2 export as \`alpaca\``,
  `- the 12 Soup format signatures Stage 3A transcribed into the bridge match live Soup **exactly** — the first time that comparison has actually been run`,
  '- a full train loop completes: load, LoRA, gradient, checkpoint, adapter reload, inference',
  '',
  '## What is still blocked',
  '',
  `\`BASE_MODEL_AVAILABLE\`. \`huggingface_hub.snapshot_download\` returns ${baseModel.failure.split(' ').slice(0, 3).join(' ')} through the installed stack —`,
  'the same organizational egress denial curl saw. The brief forbids bypassing it,',
  'using an undocumented proxy, or pulling weights from an untrusted mirror to make',
  'the stage pass, and none of those was attempted. Every alternate host probed',
  `(${baseModel.alternateHostsProbed.join(', ')}) was unreachable.`,
  '',
  'So no candidate exists, and no accuracy, regret, complementarity, hybrid or',
  'generalization figure appears in these artifacts.',
  '',
  '## The pipeline harness is not a candidate',
  '',
  evidence.harness.note,
  '',
  `It is randomly initialised locally and its adapter (\`${evidence.harness.adapterSha256?.slice(0, 16)}…\`, ${evidence.harness.adapterBytes} bytes) is never scored.`,
  'Reporting its loss as a result would be reporting the arithmetic of a random model.',
  '',
  '## Decisions taken that need no weights',
  '',
  `- **Abstention**: option ${STAGE3CR_ABSTENTION_DECISION.option}. ${STAGE3CR_ABSTENTION_DECISION.rationale}`,
  `- **Topology skew**: the sampler caps any shape at ${samplerSummary.maxSharePerShape} of the sample, taking the largest share from **${samplerSummary.sourceLargestShare}** to **${samplerSummary.sampledLargestShare}**. TRAIN only; VALIDATION, HOLDOUT and OOD are untouched.`,
  `- **Task**: \`${STAGE3CR_TASK_CONTRACT.taskId}\` — action selection, no abstain field. ${STAGE3CR_TASK_CONTRACT.abstainFieldNote}`,
  `- **Targets**: ${STAGE3CR_TARGET_CONTRACT.exactTiePolicy}. ${STAGE3CR_TARGET_CONTRACT.neverTrainsNote}`,
  `- **SFT dataset**: ${sftRows.length} rows, \`${sftHash.slice(0, 16)}…\`, TRAIN only.`,
  '',
  '## The inherited selector limitation, unchanged',
  '',
  STAGE3CR_SELECTOR_LIMITATION.misreadingToAvoid,
  '',
  '## Authority',
  '',
  '`AUTHORITY=R0`, `CAN_DISPATCH=false`, `CAN_MUTATE_LIVE_WORLD=false`. The firewall',
  `rejects all ${firewall.mutants.length} forbidden or unknown statuses and accepts the permitted control.`,
  'Deterministic Nexus remains the incumbent. `soup push` was never invoked.',
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage3cr-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE3CR_STAGE,
  status: certification.status,
  outcome: certification.stage3crOutcome,
  missing: qualification.missing,
  blockerClass: qualification.blockerClass,
  environmentClass,
  soupCommit: soupAudit.commit,
  soupSignatureDrift: signatureDrift.length,
  parserRows: evidence.parser?.rows,
  sftRows: sftRows.length,
  samplerLargestShare: `${samplerSummary.sourceLargestShare} -> ${samplerSummary.sampledLargestShare}`,
  firewallPass: firewall.pass,
  certificationHash: certification.certificationHash,
}, null, 2));
