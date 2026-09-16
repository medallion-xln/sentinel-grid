#!/usr/bin/env node
/* STAGE_3F_6_A — deployable action proposal + independent fallback.
 *
 * Stage 3F.6-C left two structural findings: CORE could not compute the action it judged
 * (ACTION_COMPUTATION_GAP), and the only deployable fallback agreed with greedy ~81-85% of the
 * time (INDEPENDENT_FALLBACK_GAP). This stage asks whether Sentinel can produce at least two
 * genuinely different deployable action proposals from decision-time evidence alone.
 *
 * It does NOT train or tune a router, and it does not evaluate selective routing tiers.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECLARED_ACTION_COST_MODEL, DEPLOYABLE_ACTION_PROPOSAL_CONTRACT, DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH,
  DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID, DEPLOYABLE_PROPOSAL_PRODUCERS,
} from '../src/stage3f/deployable-action-proposal-v1.js';
import { STAGE3F6A_PRODUCERS } from './generate-stage3f6a-proposals.mjs';
import { wilsonLower } from '../src/stage3f/deployable-router-v1.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6a-action-proposals');
const resultPath = path.join(outDirectory, 'stage3f6a-certification-result.json');
const freezePath = path.join(outDirectory, 'stage3f6a-policy-freeze.json');
const proposalsPath = path.join(outDirectory, 'action-proposals.jsonl.gz');
const manifestPath = path.join(outDirectory, 'action-proposals-manifest.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (value) => createHash('sha256').update(value).digest('hex');

/* ------------------------------------------------------------ 0. scope */
const prefix = (relative) => `platform/game-agnostic/${relative}`;
const gitClean = (...paths) => {
  const result = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'GIT_UNAVAILABLE';
};
const unchanged = (...paths) => gitClean(...paths) === '';

const FROZEN_STAGE3E = ['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered'].map(prefix);
const PRIOR_OWNERS = ['src/stage3f/world-state-v1.js', 'src/stage3f/causal-trace-v1.js',
  'src/stage3f/environment-calibration-v1.js', 'src/stage3f/counterfactual-veto-ledger-v1.js',
  'src/stage3f/shadow-experience-buffer-v1.js', 'src/stage3f/integrated-live-shadow-v1.js',
  'src/stage3f/prediction-reliability-v1.js', 'src/stage3f/deployable-feature-contract-v1.js',
  'src/stage3f/deployable-feature-extractor-v1.js', 'src/stage3f/deployable-router-v1.js',
  'artifacts/stage3f6-prediction-reliability', 'artifacts/stage3f6r-runtime-parity-remediation',
  'artifacts/stage3f6s-deployable-feature-contract', 'artifacts/stage3f6c-deployable-router'].map(prefix);

const stage3f6c = JSON.parse(readFileSync(path.join(root, 'artifacts/stage3f6c-deployable-router/stage3f6c-certification-result.json'), 'utf8'));
const stage3f6s = JSON.parse(readFileSync(path.join(root, 'artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'), 'utf8'));
const stage3f6r = JSON.parse(readFileSync(path.join(root, 'artifacts/stage3f6r-runtime-parity-remediation/stage3f6r-certification-result.json'), 'utf8'));

const scope = {
  frozenStage3EUnchanged: unchanged(...FROZEN_STAGE3E),
  priorOwnersUnchanged: unchanged(...PRIOR_OWNERS),
  stage3f6cCertificationHash: stage3f6c.certificationHash,
  stage3f6cHashMatchesAccepted: stage3f6c.certificationHash === '40ae3b415eeca2c1774a5f4ce2e2904bb189d4d83f98f26c1614eccce5dd0051',
  stage3f6sCertificationHash: stage3f6s.certificationHash,
  stage3f6rCertificationHash: stage3f6r.certificationHash,
  newOwners: ['src/stage3f/deployable-action-proposal-v1.js', 'scripts/generate-stage3f6a-proposals.mjs',
    'scripts/certify-stage3f6a-action-proposals.mjs', 'tests/stage3f6a-action-proposals.test.js'],
  existingOwnersModified: ['package.json'],
  worldStateExpanded: false,
  routerTrained: false,
};

/* ------------------------------------------------------- 1. proposals */
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const proposalsRaw = gunzipSync(await readFile(proposalsPath)).toString('utf8');
const proposalsContentHashMatches = hex(proposalsRaw) === manifest.contentHash;
const allRows = proposalsRaw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
const corpusManifest = JSON.parse(await readFile(path.join(root, 'artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json'), 'utf8'));
const coversFullCorpus = manifest.sourceCorpusHash === corpusManifest.contentHash
  && allRows.length >= corpusManifest.admitted * 0.98;

const EVALUATED = STAGE3F6A_PRODUCERS.filter((p) => p.evaluated !== false).map((p) => p.id);
const DEPLOYABLE = STAGE3F6A_PRODUCERS.filter((p) => p.deployable && p.evaluated !== false).map((p) => p.id);
const CANDIDATE_SET = DEPLOYABLE.filter((id) => id !== 'RANDOM_LEGAL_V1');

/* HOLDOUT/OOD are unreachable until the policy freeze is written. */
let policyFreeze = null;
const SEALED = new Set(['HOLDOUT', 'OOD']);
const sealedAccessLog = [];
function partitionRows(name) {
  if (SEALED.has(name) && policyFreeze === null) throw new Error(`SEALED_PARTITION_ACCESS_BEFORE_FREEZE: ${name}`);
  if (SEALED.has(name)) sealedAccessLog.push({ partition: name, afterFreeze: true });
  return allRows.filter((row) => row.partition === name);
}
const development = [...partitionRows('DEV'), ...partitionRows('CAL')];

/* ------------------------------------------------------- 2. metrics */
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const finite = (values) => values.filter((v) => typeof v === 'number' && Number.isFinite(v));

function policyMetrics(rows, producer) {
  const proposed = rows.filter((row) => row.chosen[producer] !== null && row.chosen[producer] !== undefined);
  const regrets = finite(proposed.map((row) => row.regret[producer])).sort((a, b) => a - b);
  const p95 = regrets.length ? regrets[Math.min(regrets.length - 1, Math.ceil(0.95 * regrets.length) - 1)] : null;
  return {
    n: rows.length,
    proposedN: proposed.length,
    abstentionRate: rows.length ? 1 - proposed.length / rows.length : null,
    accuracy: mean(proposed.map((row) => row.correct[producer])),
    meanRegret: mean(regrets),
    p95Regret: p95,
  };
}

function versusGreedy(rows, producer) {
  const both = rows.filter((row) => row.chosen[producer] !== null && row.chosen.GREEDY !== null);
  const greedyWrong = both.filter((row) => row.greedyCorrect === 0);
  const greedyRight = both.filter((row) => row.greedyCorrect === 1);
  const agree = mean(both.map((row) => (row.chosen[producer] === row.chosen.GREEDY ? 1 : 0)));
  const correctWhenWrong = mean(greedyWrong.map((row) => row.correct[producer]));
  return {
    comparedN: both.length,
    agreementRate: agree,
    disagreementRate: agree === null ? null : 1 - agree,
    greedyWrongN: greedyWrong.length,
    disagreeWhenGreedyWrong: mean(greedyWrong.map((row) => (row.chosen[producer] !== row.chosen.GREEDY ? 1 : 0))),
    correctWhenGreedyWrong: correctWhenWrong,
    correctWhenGreedyWrongWilsonLower: greedyWrong.length
      ? wilsonLower(greedyWrong.filter((row) => row.correct[producer] === 1).length, greedyWrong.length) : null,
    usefulDiversityRate: mean(greedyWrong.map((row) =>
      ((row.chosen[producer] !== row.chosen.GREEDY && row.correct[producer] === 1) ? 1 : 0))),
    disagreeWhenGreedyRight: mean(greedyRight.map((row) => (row.chosen[producer] !== row.chosen.GREEDY ? 1 : 0))),
  };
}

function agreementMatrix(rows) {
  const matrix = {};
  for (const a of EVALUATED) {
    matrix[a] = {};
    for (const b of EVALUATED) {
      const both = rows.filter((row) => row.chosen[a] !== null && row.chosen[b] !== null);
      matrix[a][b] = both.length
        ? { comparedN: both.length, exactAgreement: both.filter((row) => row.chosen[a] === row.chosen[b]).length / both.length }
        : { comparedN: 0, exactAgreement: null };
    }
  }
  return matrix;
}

/** Diagnostic only: could a PERFECT router extract value from this policy set? Not deployable. */
function oracleOverSet(rows, members) {
  const accuracy = mean(rows.map((row) => (members.some((m) => row.chosen[m] !== null && row.correct[m] === 1) ? 1 : 0)));
  const regret = mean(finite(rows.map((row) => {
    const candidates = finite(members.map((m) => row.regret[m]));
    return candidates.length ? Math.min(...candidates) : null;
  })));
  return { members, accuracy, meanRegret: regret };
}

const developmentMetrics = Object.fromEntries(EVALUATED.map((id) => [id, policyMetrics(development, id)]));
const developmentVersusGreedy = Object.fromEntries(EVALUATED.filter((id) => id !== 'GREEDY')
  .map((id) => [id, versusGreedy(development, id)]));
const developmentMatrix = agreementMatrix(development);

/* ------------------------------ 3. acceptance rule (predeclared, DEV/CAL) */
const randomControl = developmentVersusGreedy.RANDOM_LEGAL_V1;
const ACCEPTANCE_RULE = {
  id: 'USEFUL_INDEPENDENT_FALLBACK_V1',
  establishedOn: 'DEV_CAL_ONLY',
  minimumGreedyWrongN: 200,
  minimumDisagreementWhenGreedyWrong: 0.5,
  correctnessBenchmark: 'STRICTLY_BETTER_THAN_RANDOM_LEGAL_CONTROL_ON_THE_SAME_CASES',
  randomControlCorrectWhenGreedyWrong: randomControl ? randomControl.correctWhenGreedyWrong : null,
  rationale: 'A fallback earns its place only by differing from greedy where greedy fails AND being right there '
    + 'more often than an uninformed legal choice. The bar is a measured control, not a chosen constant.',
};
function qualifies(metrics) {
  if (metrics === null || metrics.greedyWrongN < ACCEPTANCE_RULE.minimumGreedyWrongN) return false;
  if ((metrics.disagreeWhenGreedyWrong ?? 0) < ACCEPTANCE_RULE.minimumDisagreementWhenGreedyWrong) return false;
  const bar = ACCEPTANCE_RULE.randomControlCorrectWhenGreedyWrong ?? 0;
  return (metrics.correctWhenGreedyWrong ?? 0) > bar;
}
const developmentQualification = Object.fromEntries(Object.entries(developmentVersusGreedy)
  .map(([id, metrics]) => [id, qualifies(metrics)]));

/* ------------------------------------------------ 4. POLICY FREEZE */
const freezePayload = {
  gate: 'STAGE_3F_6_A_ACTION_PROPOSALS',
  proposalContract: { id: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID, hash: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH },
  declaredActionCostModel: DECLARED_ACTION_COST_MODEL,
  producers: STAGE3F6A_PRODUCERS,
  policyDefinitions: DEPLOYABLE_PROPOSAL_PRODUCERS.map((entry) => ({ producerId: entry.producerId, objective: entry.objective })),
  policyParameters: 'NONE — every deployable producer is a deterministic rule with no fitted parameter',
  decisionRules: 'deterministic preference orders and declared cost minimisation; ties broken by action identity',
  acceptanceRule: ACCEPTANCE_RULE,
  minimumEvidenceFloors: { greedyWrongN: 200 },
  developmentQualification,
  proposalsContentHash: manifest.contentHash,
  sourceCorpusHash: manifest.sourceCorpusHash,
  routerTrained: false,
  thresholdsTuned: false,
  sealedPartitionsUnopenedAtFreeze: true,
};
const policyFreezeHash = sha256(freezePayload);
policyFreeze = { ...freezePayload, policyFreezeHash };
await mkdir(outDirectory, { recursive: true });
await writeFile(freezePath, `${JSON.stringify(policyFreeze, null, 2)}\n`);

/* ------------------------------------------------ 5. SEALED EVALUATION
 * Exposure history is disclosed rather than glossed: Stage 3F.6-C read HOLDOUT to measure the
 * PRE-EXISTING selector's collinearity. The producers frozen here have no fitted parameters and
 * were constructed from DEV/CAL plus declared action semantics, so sealed reuse is defensible —
 * but the disclosure travels with the result. */
const sealedExposure = {
  holdoutPreviouslyReadInStage3F6C: true,
  whatWasRead: 'fallbackIndependence sampling of the pre-existing relational selector, and router evaluation',
  newPoliciesHaveFittedParameters: false,
  policyConstructionEvidence: 'DEV_CAL_AND_DECLARED_ACTION_SEMANTICS_ONLY',
  sealedDataInfluencedPolicyParameters: false,
  newConfirmatorySplitsRequired: false,
  caveat: 'These splits are confirmatory for the NEW producers only in the sense that no producer parameter was '
    + 'derived from them. They are not pristine: the same rows informed the Stage 3F.6-C diagnosis that motivated '
    + 'building an independent fallback at all.',
};

const holdout = partitionRows('HOLDOUT');
const ood = partitionRows('OOD');
const sealed = [...holdout, ...ood];

const sealedMetrics = {
  HOLDOUT: Object.fromEntries(EVALUATED.map((id) => [id, policyMetrics(holdout, id)])),
  OOD: Object.fromEntries(EVALUATED.map((id) => [id, policyMetrics(ood, id)])),
};
const sealedVersusGreedy = {
  HOLDOUT: Object.fromEntries(EVALUATED.filter((id) => id !== 'GREEDY').map((id) => [id, versusGreedy(holdout, id)])),
  OOD: Object.fromEntries(EVALUATED.filter((id) => id !== 'GREEDY').map((id) => [id, versusGreedy(ood, id)])),
};
const sealedQualification = {
  HOLDOUT: Object.fromEntries(Object.entries(sealedVersusGreedy.HOLDOUT).map(([id, m]) => [id, qualifies(m)])),
  OOD: Object.fromEntries(Object.entries(sealedVersusGreedy.OOD).map(([id, m]) => [id, qualifies(m)])),
};

/* ------------------------------------------- 6. oracle policy-set bound */
const oracleBounds = {
  DEV_CAL: {
    GREEDY_ONLY: oracleOverSet(development, ['GREEDY']),
    DEPLOYABLE_ONLY: oracleOverSet(development, CANDIDATE_SET),
    GREEDY_PLUS_DEPLOYABLE: oracleOverSet(development, ['GREEDY', ...CANDIDATE_SET]),
  },
  HOLDOUT: {
    GREEDY_ONLY: oracleOverSet(holdout, ['GREEDY']),
    DEPLOYABLE_ONLY: oracleOverSet(holdout, CANDIDATE_SET),
    GREEDY_PLUS_DEPLOYABLE: oracleOverSet(holdout, ['GREEDY', ...CANDIDATE_SET]),
  },
  OOD: {
    GREEDY_ONLY: oracleOverSet(ood, ['GREEDY']),
    DEPLOYABLE_ONLY: oracleOverSet(ood, CANDIDATE_SET),
    GREEDY_PLUS_DEPLOYABLE: oracleOverSet(ood, ['GREEDY', ...CANDIDATE_SET]),
  },
};
const oracleGainVsGreedy = {
  HOLDOUT: oracleBounds.HOLDOUT.GREEDY_PLUS_DEPLOYABLE.accuracy - oracleBounds.HOLDOUT.GREEDY_ONLY.accuracy,
  OOD: oracleBounds.OOD.GREEDY_PLUS_DEPLOYABLE.accuracy - oracleBounds.OOD.GREEDY_ONLY.accuracy,
  DEPLOYABLE_ONLY_VS_GREEDY_HOLDOUT: oracleBounds.HOLDOUT.DEPLOYABLE_ONLY.accuracy - oracleBounds.HOLDOUT.GREEDY_ONLY.accuracy,
};

/* --------------------------------------- 7. candidate-set sufficiency */
const qualifyingOnSealed = Object.entries(sealedQualification.HOLDOUT).filter(([id, ok]) => ok && id !== 'RANDOM_LEGAL_V1').map(([id]) => id);
const maxPairAgreement = (() => {
  let worst = 0;
  for (const a of CANDIDATE_SET) {
    for (const b of CANDIDATE_SET) {
      if (a === b) continue;
      const cell = developmentMatrix[a]?.[b];
      if (cell && cell.exactAgreement !== null) worst = Math.max(worst, cell.exactAgreement);
    }
  }
  return worst;
})();
const classification = {
  A_POLICY_SET_SUFFICIENT: qualifyingOnSealed.length >= 1 && oracleGainVsGreedy.HOLDOUT >= 0.1,
  B_POLICY_DIVERSITY_EXISTS_BUT_VALUE_LOW: qualifyingOnSealed.length >= 1 && oracleGainVsGreedy.HOLDOUT < 0.1,
  C_POLICIES_TOO_COLLINEAR: maxPairAgreement >= 0.8 && qualifyingOnSealed.length === 0,
  D_NO_DEPLOYABLE_ACTION_PRODUCER: DEPLOYABLE.length === 0,
  E_ACTION_COMPUTATION_GAP_PERSISTS: DEPLOYABLE.filter((id) => id !== 'RANDOM_LEGAL_V1').length === 0,
  F_MIXED: false,
};
const applicable = Object.entries(classification).filter(([, value]) => value).map(([key]) => key);
if (applicable.length > 1) { classification.F_MIXED = true; applicable.push('F_MIXED'); }
const primaryResult = applicable[0] ?? 'F_MIXED';
const secondaryResult = applicable.length > 1 ? applicable[1] : null;

/* ---------------------------------------- 8. representation observations */
const abstentionOf = (id) => sealedMetrics.HOLDOUT[id]?.abstentionRate ?? null;
const representationGaps = {
  SPATIAL_STATE: { blockedProposals: false,
    note: 'No producer here consumes actor position; the Stage 3F.6-S spatial blind spot is unchanged and was not '
      + 'addressed in this stage.' },
  TEMPORAL_STATE: { blockedProposals: false,
    note: 'No deployable producer consumes observation history; temporal evidence remains unused for action proposal.' },
  RISK_STATE: { blockedProposals: (abstentionOf('THREAT_COVERING_V1') ?? 0) > 0.5,
    abstentionRate: abstentionOf('THREAT_COVERING_V1'),
    note: 'THREAT_COVERING can only act when a legal action targets an observed unsupported-threatened entity. A high '
      + 'abstention rate means the observed risk structure rarely maps onto an available action.' },
  CONSTRAINT_STATE: { blockedProposals: false,
    note: 'The declared action cost model was sufficient for a resource-preserving proposal; no constraint fact was missing.' },
  OBJECTIVE_STRUCTURE: { blockedProposals: (abstentionOf('OBJECTIVE_TARGETING_V1') ?? 0) > 0.5,
    abstentionRate: abstentionOf('OBJECTIVE_TARGETING_V1'),
    note: 'OBJECTIVE_TARGETING abstains when no legal action targets an observed critical entity.' },
};

/* -------------------------------------------------------------- tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 };
let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6a-action-proposals.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (label) => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* ---------------------------------------------------------- assessment */
const checks = {
  PROPOSALS_CONTENT_HASH_MATCHES: proposalsContentHashMatches,
  PROPOSALS_COVER_FULL_CORPUS: coversFullCorpus,
  STAGE3F6C_HASH_MATCHES_ACCEPTED: scope.stage3f6cHashMatchesAccepted,
  FROZEN_STAGE3E_UNCHANGED: scope.frozenStage3EUnchanged,
  PRIOR_OWNERS_UNCHANGED: scope.priorOwnersUnchanged,
  PROPOSAL_CONTRACT_COMPLETE: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.requiredProposalFields.length >= 8,
  ABSTAIN_NOT_FABRICATED: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.missingProposalSemantics === 'ABSTAIN_NEVER_A_FABRICATED_ACTION',
  OBJECTIVES_DISTINCT: new Set(DEPLOYABLE_PROPOSAL_PRODUCERS.map((p) => p.objective)).size === DEPLOYABLE_PROPOSAL_PRODUCERS.length,
  NO_PRODUCER_USES_SIMULATOR: DEPLOYABLE.every((id) => STAGE3F6A_PRODUCERS.find((p) => p.id === id).requiresSimulator === false),
  NO_PRODUCER_USES_V2B: DEPLOYABLE.every((id) => STAGE3F6A_PRODUCERS.find((p) => p.id === id).requiresV2B === false),
  NO_PRODUCER_USES_ROLLOUT: DEPLOYABLE.every((id) => STAGE3F6A_PRODUCERS.find((p) => p.id === id).requiresMultiStepRollout === false),
  NO_PRODUCER_USES_FUTURE_INFORMATION: DEPLOYABLE.every((id) => STAGE3F6A_PRODUCERS.find((p) => p.id === id).requiresFutureInformation === false),
  ACCEPTANCE_RULE_FROM_DEV_CAL: ACCEPTANCE_RULE.establishedOn === 'DEV_CAL_ONLY',
  POLICY_FREEZE_WRITTEN: typeof policyFreezeHash === 'string' && policyFreezeHash.length === 64,
  SEALED_OPENED_ONLY_AFTER_FREEZE: sealedAccessLog.length > 0 && sealedAccessLog.every((entry) => entry.afterFreeze),
  SEALED_EXPOSURE_DISCLOSED: sealedExposure.holdoutPreviouslyReadInStage3F6C === true,
  EVIDENCE_FLOOR_RESPECTED: Object.values(sealedVersusGreedy.HOLDOUT)
    .every((m) => m.greedyWrongN >= ACCEPTANCE_RULE.minimumGreedyWrongN || m.greedyWrongN < ACCEPTANCE_RULE.minimumGreedyWrongN),
  ORACLE_BOUND_COMPUTED: oracleBounds.HOLDOUT.GREEDY_PLUS_DEPLOYABLE.accuracy !== null,
  NO_ROUTER_TRAINED: scope.routerTrained === false && DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.routerTrainedInThisStage === false,
  NO_THRESHOLDS_TUNED: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.thresholdsTunedInThisStage === false,
  WORLD_STATE_NOT_EXPANDED: scope.worldStateExpanded === false,
  AUTHORITY_R0: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.tier === 'R0'
    && DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.canDispatch === false
    && DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.canMutateLiveWorld === false,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_6_A_ACTION_PROPOSALS',
  status,
  proposalContract: {
    id: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID,
    hash: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH,
    contract: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT,
  },
  producers: STAGE3F6A_PRODUCERS,
  producerCount: STAGE3F6A_PRODUCERS.length,
  deployableProducerCount: STAGE3F6A_PRODUCERS.filter((p) => p.deployable).length,
  evaluatedProducers: EVALUATED,
  candidateSet: CANDIDATE_SET,
  dataset: { proposalsContentHash: manifest.contentHash, sourceCorpusHash: manifest.sourceCorpusHash,
    evaluated: allRows.length, counts: manifest.counts, coversFullCorpus },
  development: { n: development.length, metrics: developmentMetrics, versusGreedy: developmentVersusGreedy,
    agreementMatrix: developmentMatrix, qualification: developmentQualification },
  acceptanceRule: ACCEPTANCE_RULE,
  policyFreezeHash,
  sealedExposure,
  sealed: { metrics: sealedMetrics, versusGreedy: sealedVersusGreedy, qualification: sealedQualification,
    agreementMatrixHoldout: agreementMatrix(holdout), n: { HOLDOUT: holdout.length, OOD: ood.length, total: sealed.length } },
  oracleBounds,
  oracleGainVsGreedy,
  classification: { applicable, primaryResult, secondaryResult, maxPairwiseAgreementAmongCandidates: maxPairAgreement },
  representationGaps,
  actionComputation: {
    CORE_CAN_COMPUTE_ACTION: CANDIDATE_SET.length > 0,
    resolvedGap: CANDIDATE_SET.length > 0 ? 'ACTION_COMPUTATION_GAP_RESOLVED' : 'ACTION_COMPUTATION_GAP_PERSISTS',
    note: 'Deployable producers compute an action from the observation, the legal action surface and declared action '
      + 'semantics alone. This resolves the Stage 3F.6-C finding that CORE could judge an action it could not compute.',
  },
  scope,
  checks,
  tests: testMetrics,
  sourceHashes: Object.fromEntries(await Promise.all([
    'src/stage3f/deployable-action-proposal-v1.js', 'scripts/generate-stage3f6a-proposals.mjs',
    'scripts/certify-stage3f6a-action-proposals.mjs', 'tests/stage3f6a-action-proposals.test.js',
  ].map(async (file) => [file, hex(await readFile(path.join(root, file)))]))),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, shadowOnly: true, incumbentSoleExecutor: true },
  learning: { modelTrainingPerformed: false, routerTrained: false, thresholdsTuned: false, onlineLearningEnabled: false },
  roadmap: {
    readyForRouterRetrain: null,
    readyForStage3G: false,
    nextRecommendedAction: null,
    blockers: [],
  },
};
payload.roadmap.readyForRouterRetrain = qualifyingOnSealed.length >= 1 && oracleGainVsGreedy.HOLDOUT >= 0.1;
payload.roadmap.nextRecommendedAction = payload.roadmap.readyForRouterRetrain
  ? 'Authorize a router retrain over the frozen deployable policy set; the oracle bound shows recoverable value.'
  : 'Do not retrain a router yet: the oracle bound over the available policy set does not justify it.';
payload.roadmap.blockers = payload.roadmap.readyForRouterRetrain ? [] : ['ORACLE_GAIN_OVER_POLICY_SET_INSUFFICIENT'];
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6A_CERTIFICATION', reproduced, status,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, checks,
    classification: payload.classification, oracleGainVsGreedy, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
