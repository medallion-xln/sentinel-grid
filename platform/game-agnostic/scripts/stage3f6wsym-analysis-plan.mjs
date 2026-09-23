#!/usr/bin/env node
/* STAGE_3F_6_W_SYM — analysis plan for the RISK-STATE SYMMETRIC REQUALIFICATION.
 *
 * Written, hashed and committed with the DEV/CAL open-phase report and all evaluation code BEFORE any partition from
 * this stage's sealed seeds exists. It fixes the seed plan, the historical Stage 3F.6-W feature inventory and the
 * validity rules, every risk target, model, metric, materiality bar, router comparison, shortcut and observability
 * test, historical-claim rule and conclusion rule. Requalification only: no router, Nexus or spatial redesign.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { DECISION_RISK_STATE_CONTRACT_HASH, RISK_STATE_FIELDS } from '../src/stage3f/decision-risk-state-v1.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DeployableProfile, DEPLOYABLE_PROFILES } from '../src/stage3f/deployable-feature-contract-v1.js';
import { PRIVILEGED_RELATIONS } from '../src/stage3f/free-action-sufficiency-v1.js';
import { POLICY_SET_HASH, ROUTED_POLICIES, STAGE3F6T_METHODOLOGY } from '../src/stage3f/policy-router-v1.js';
import { STAGE3F6P1SYM_SEED_PLAN } from './stage3f6p1sym-analysis-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------ sealed seeds */
/** P.1-SYM declared HOLDOUT 3021-3023 / OOD 3031-3033 for sealed use and consumed only 3021 / 3031. */
export const STAGE3F6WSYM_SEED_PLAN = deepFreeze({
  seedPlanId: 'STAGE3F6WSYM_SEALED_SEED_PLAN_V1',
  declared: { HOLDOUT: [3022, 3023], OOD: [3032, 3033] },
  provenance: 'declared for sealed use by the P.1-SYM seed plan (5571364b…) and never generated; the same precedent as 3F.6-T-SYM and P.1A-SYM using P.1D-declared sealed spares',
  use: 'the first seed of each list in canonical combination order; the second only if the first cannot fill 6000 admitted rows',
  levels: STAGE3F6P1SYM_SEED_PLAN.levels, sizes: STAGE3F6P1SYM_SEED_PLAN.sizes,
  priorSeeds: [...STAGE3F6P1SYM_SEED_PLAN.priorSeeds, 3021, 3031].sort((a, b) => a - b),
  priorSources: ['every seed P.1-SYM enumerated as prior (P.1D priorConsumed and the P.1D lineage 2001-2033)', 'P.1-SYM consumed 3021 (HOLDOUT) and 3031 (OOD)'],
  exclusion: 'a candidate whose record, world or topology hash is claimed anywhere in the P.1D corpus or the T-SYM, P.1A-SYM or P.1-SYM fresh partitions (56000 rows), or earlier in this set, is rejected',
});
export const STAGE3F6WSYM_SEED_PLAN_HASH = sha256(STAGE3F6WSYM_SEED_PLAN);

/* ------------------------------------------------------------ historical W inventory */
export const HISTORICAL_W = deepFreeze({
  certification: '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6',
  riskContractHash: DECISION_RISK_STATE_CONTRACT_HASH, riskFields: RISK_STATE_FIELDS.map((f) => f.fieldId),
  diagnosticGroups: { OBJECTIVE: ['objective.shortfall', 'objective.criticalEntityCount'], SPATIAL: ['spatial.actorX', 'spatial.actorY'],
    TEMPORAL: ['temporal.historyLength', 'temporal.primaryNetChange', 'temporal.primaryRecentChange', 'temporal.primaryMeanAbsChange'] },
  accepted: ['risk.retreatOptionCount'], enrichedContract: 'SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1_1 (CORE + risk.retreatOptionCount; candidate only)',
  router: 'none trained: W measured information with a binary logistic model (NEXUS-best vs RESOURCE-best) and a diagnostic multinomial; its enriched contract is the only routing artefact',
  certifiedSourceHashes: { 'src/stage3f/decision-risk-state-v1.js': '97e6f73b312e2d5428ccdee6e4a3c3853d1f38ff1922a2126ded398907af0792',
    'scripts/generate-stage3f6w-risk-evidence.mjs': '659b37746ad06d4c64a18d7f4f1a01a829c26cbd73e3e350fcd7dce7383a5e5f' },
  measured: { split: 'CAL (3F.6-C lineage)', coreAuroc: 0.7878, acceptedDelta: [0.0103, 0.0045, 0.0161], allUsableDelta: [0.0064, 0.0002, 0.0131], spatialDelta: [0.0061, 0.0018, 0.0098],
    objectiveDelta: [-0.0002, -0.0016, 0.001], temporal: 'not usable without imputation', result: 'B_CURRENT_RISK_SIGNALS_INSUFFICIENT',
    structuralRejections: { 'risk.hostileAliveCount': 'identical to relational.hostileEntityCount', 'risk.coveredThreatCount': 'identical to threatened - uncovered',
      'risk.threatenedCivilianCount': 'identical to relational.unresolvedDependencyCount', 'risk.threatCoverageRatio': 'not usable without imputation' },
    routerErrorRatios: { HIGH_HOSTILE: 2.0358, UNCOVERED_THREAT: 1.8817, BOTTLENECK: 2.05 } },
});
export const HISTORICAL_W_HASH = sha256(HISTORICAL_W);

/* -------------------------------------------------------------------- plan */
export const CORE_IDS = deepFreeze([...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort());
export const STAGE3F6WSYM_PLAN = deepFreeze({
  stage: 'STAGE_3F_6_W_SYM_RISK_STATE_SYMMETRIC_REQUALIFICATION',
  question: 'Did Stage 3F.6-W\'s risk-state enrichment provide genuine decision-time information, or did its value depend on the historical benchmark, shortcut behaviour, the weak policy set or non-deployable signals?',
  role: 'REQUALIFICATION_ONLY: no router redesign, no Nexus redesign, no spatial state, no Stage 3G',
  predecessors: {
    stage3f6p1cCertification: '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d', stage3f6p1dCertification: 'afd0d6e6057f497e9e1d3666cf553518e134b0c4d09f783601b393c081ae7073',
    stage3f6p1eCertification: '11dcf65b79679ae8748eed0f5f9f3fdef38223524308aaa353c5b482eed8a031', stage3f6tsymCertification: 'edd46e40fc2c6ddc611f9f78a432f723f0ae4e66facc1b2ca84183fa4d896f4e',
    stage3f6p1asymCertification: '84770670baeb1502142e12d24a12d03763c0a97c22e80acc53013ecb98871fbb', stage3f6p1symCertification: 'afcdceb18df34b05bb60613e302a762c3de196d764b34dfbe50e1978d3f80cf8',
    corpusContentHash: '4de383eb0c6e9836706e87c6626de53ccb54853fb527f368cfaf599617e6c75e',
    freshLineage: { TSYM: '2921adb7e933c274ed692d0f38ccc58a6d1553a60194d01d14b75105c92ff6e8', P1ASYM: '8fde1f1245849e88b941044788d3a7cebe6b930837dce2e7b074a1c461c63840',
      P1SYM: 'fee73d23f3cf55d89d9ba9c6c11c9bc86012db497e783f35235de88badbd8523' },
    deployableFeatureContractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
  },
  seedPlanHash: STAGE3F6WSYM_SEED_PLAN_HASH, historicalWHash: HISTORICAL_W_HASH,
  policySet: { headline: ROUTED_POLICIES, aliases: { NEXUS_SELECTOR: 'NEXUS_SELECTOR_V1' }, stage3f6tPolicySetHash: POLICY_SET_HASH,
    excluded: 'NEXUS_SELECTOR_V2_CANDIDATE is not in the headline set (SHORTCUT_DEPENDENT, P.1E/P.1-SYM); W itself used the historical routed set with V1',
    unchanged: 'policy sources must match the P.1-SYM plan\'s sourceSha256 and HEAD' },
  evidence: {
    surface: 'the symmetric decision surface the policies saw (P.1E policySurface) on the world rebuilt from the row combination; world hash must match',
    risk: 'Stage 3F.6-W extractDecisionRiskState({ observation, legalActions }) unchanged; non-AVAILABLE statuses are kept, never imputed',
    diagnostic: 'Stage 3F.6-W diagnosticEvidence(observation) unchanged (objective, absolute spatial, temporal)',
    privileged: `diagnostic, unavailable: change in nearest kernel distance to ${PRIVILEGED_RELATIONS.join('/')} for the RESOURCE choice (priv.resourceMove.*) and the minimum over candidates (priv.bestApproach.*)`,
    invariance: 'risk recomputed on the reversed, identity-relabelled surface; risk and diagnostic evidence recomputed on every D4 twin of the stored equivariance sample',
    policyEvidence: 'the certified P.1E evidenceFor (identity-permuted, identity-reversed and D4-twin policy choices)',
  },
  featureValidity: {
    classes: ['DEPLOYABLE', 'NON_DEPLOYABLE', 'ORACLE_ONLY', 'ROLLOUT_REQUIRED', 'FUTURE_STATE_REQUIRED', 'LEAKED', 'REDUNDANT', 'SHORTCUT_CORRELATED', 'UNAVAILABLE', 'DIVERGENT'],
    rules: {
      NON_DEPLOYABLE: 'the risk contract marks the field not decision-time only or reading split metadata', ORACLE_ONLY: 'the contract marks regret or optimal-label use',
      ROLLOUT_REQUIRED: 'contract usesRollout', FUTURE_STATE_REQUIRED: 'contract usesFutureOutcome or usesTransition',
      LEAKED: 'single-field DEV separability max(AUROC, 1 - AUROC) >= 0.99 for any target',
      UNAVAILABLE: 'status is not AVAILABLE (diagnostic fields: not a finite number) on every DEV and CAL row (historical rule: no imputation)',
      DIVERGENT: 'the value differs when recomputed on a reversed, identity-relabelled surface',
      SHORTCUT_CORRELATED: 'the value differs on a D4 twin of the same world (orientation-dependent), so any value it carries can be absolute-frame shortcut',
      REDUNDANT: 'constant on DEV, or identical to a CORE feature on DEV/CAL, or to the CORE identity threatened - uncovered (historical structural rule)',
      DEPLOYABLE: 'none of the above',
    },
    precedence: ['NON_DEPLOYABLE', 'ORACLE_ONLY', 'ROLLOUT_REQUIRED', 'FUTURE_STATE_REQUIRED', 'LEAKED', 'UNAVAILABLE', 'DIVERGENT', 'SHORTCUT_CORRELATED', 'REDUNDANT', 'DEPLOYABLE'],
    appliesTo: 'all 12 historical risk fields and the historical OBJECTIVE / SPATIAL / TEMPORAL diagnostic fields (outside the risk contract: contract flags do not apply)',
    validSet: 'VALID_DEPLOYABLE_W_FEATURE_SET = risk-contract fields classified DEPLOYABLE on DEV/CAL; fixed in the open-phase report before any sealed row exists',
    acceptedValid: 'historically accepted fields that are in the valid set',
  },
  partitions: { DEV: 'fit every model; validity audit', CAL: 'thresholds (F1 on a 0.01 grid) and the historical router threshold rule',
    FRESH_HOLDOUT: 'PRIMARY confirmatory, WSYM_HOLDOUT from seed 3022', FRESH_OOD: 'PRIMARY robustness, WSYM_OOD from seed 3032 (levels 6-7)',
    SEED_FAMILY_SAMPLES: 'diagnostic: the first 1000 HOLDOUT-level rows of seeds 2021 (P.1D HOLDOUT), 2022 (T-SYM), 2023 (P.1A-SYM) and 3021 (P.1-SYM), compared with 3022; exposed before, never confirmatory' },
  riskTargets: {
    T0_HISTORICAL: 'NEXUS V1 uniquely best (1) vs RESOURCE uniquely best (0) among the headline set; other rows excluded (the exact historical W target)',
    T1_CATASTROPHIC_ERROR: 'RESOURCE (best single) raw regret >= 100 (Stage 3F.6 contract)', T2_HIGH_REGRET: 'RESOURCE normalized regret >= 0.5',
    T3_POLICY_DISAGREEMENT: 'the available headline policies attain more than one distinct regret (selection matters)', T4_RESOURCE_FAILURE: 'RESOURCE is not optimal',
    T5_NEXUS_V1_USEFUL: 'on rows where V1 and RESOURCE both propose, V1 regret < RESOURCE regret', T6_COSTLY_ACTION_OPTIMAL: 'no optimal action has declared cost 0',
    oracleOnly: 'targets are labels, never inputs', minPositives: 50,
    evaluable: 'at least 50 positives and 50 negatives on DEV, CAL and the evaluated partition; otherwise the target is INSUFFICIENT_EVIDENCE there',
  },
  models: {
    family: 'binary logistic regression, router-value-v1 fitBinaryLogistic (DEV standardisation, zeros init, lr 0.1, l2 1e-3 excl. bias, 2000 full-batch iterations); the same optimiser as the historical W diagnostic model',
    threshold: 'CAL F1 threshold on a 0.01 grid', fittedOn: 'DEV only',
    featureSets: {
      CORE: 'the 30 DEPLOYABLE_CORE features', CORE_PLUS_ACCEPTED: 'CORE + accepted-valid fields (the V1_1 candidate contract)',
      CORE_PLUS_VALID_RISK: 'CORE + VALID_DEPLOYABLE_W_FEATURE_SET', VALID_RISK_ONLY: 'VALID_DEPLOYABLE_W_FEATURE_SET alone',
      CORE_PLUS_SPATIAL_ABS: 'diagnostic: CORE + historical absolute actor position', CORE_PLUS_OBJECTIVE: 'diagnostic: CORE + historical objective group',
      CORE_PLUS_TEMPORAL: 'diagnostic: only if every temporal field is AVAILABLE on every DEV/CAL row (historical rule), else NOT_EVALUATED',
      CORE_PLUS_PRIV_GEOMETRY: 'diagnostic, unavailable: CORE + priv.resourceMove.* + priv.bestApproach.*',
      CORE_PLUS_PRIV_GEOMETRY_PLUS_VALID_RISK: 'diagnostic: the proxy test', SINGLE_FIELD: 'CORE + one valid threat-structure field (claim W2)',
      unavailableSets: 'a set with no valid field is NOT_EVALUATED',
    },
    historicalSelectionReplay: 'the historical W DEV field-selection rule (2 folds by record-hash parity, mean delta >= 0.005) replayed on symmetric DEV, reported only',
  },
  metrics: {
    perTargetModel: ['n', 'positives', 'base rate', 'AUROC', 'AUPRC', 'Brier', 'Brier skill vs DEV base rate', 'ECE (10 bins)', 'precision / recall / F1 at the CAL F1 threshold'],
    increments: 'paired AUROC difference B - A; 1000 resamples of whole rows from bootstrapPlan(n, STAGE3F6WSYM:<partition>:<target>), shared by every increment of that target; percentile 95% CI',
    incrementSet: ['ACCEPTED_vs_CORE', 'VALID_RISK_vs_CORE', 'VALID_RISK_vs_ACCEPTED', 'SPATIAL_vs_CORE', 'OBJECTIVE_vs_CORE', 'TEMPORAL_vs_CORE', 'PRIV_vs_CORE', 'PRIV_RISK_vs_PRIV', '<threat field>_vs_CORE'],
    materiality: 'SIGNIFICANT = CI lower > 0; MATERIAL = SIGNIFICANT and delta AUROC >= 0.02 (the historical W bar)', informative: 'standalone AUROC >= 0.65',
    calibrated: 'ECE <= 0.05', oodStable: 'the increment keeps CI lower > 0 on FRESH_OOD and an informative standalone AUROC falls by at most 0.05',
    byLevel: 'AUROC of CORE and CORE_PLUS_VALID_RISK per curriculum level for T0, T1 and T4 (descriptive)',
  },
  routers: {
    methodology: STAGE3F6T_METHODOLOGY, implementation: 'src/stage3f/policy-router-v1.js fitPolicyRouter / routeEpisode, unmodified; threshold and best single by the historical CAL rules',
    BASE_ROUTER: 'CORE (the historical 3F.6-T methodology; the T-SYM router)', W_ROUTER: 'CORE_PLUS_ACCEPTED (the V1_1 candidate contract)', W_ROUTER_ALL: 'CORE_PLUS_VALID_RISK',
    baselines: ['ALWAYS_RESOURCE', 'BEST_SINGLE_POLICY (DEV+CAL minimum mean regret, the T-SYM rule)', 'FIXED_PRIORITY_CASCADE_HEADLINE (read from the committed T-SYM open report)', 'PERFECT_POLICY_SELECTOR'],
    comparisons: ['W_ROUTER vs BASE_ROUTER', 'W_ROUTER_ALL vs BASE_ROUTER', 'W_ROUTER vs BEST_SINGLE', 'W_ROUTER_ALL vs BEST_SINGLE', 'BASE_ROUTER vs BEST_SINGLE', 'W_ROUTER vs CASCADE', 'W_ROUTER_ALL vs CASCADE'],
    identity: 'BASE_ROUTER must reproduce the T-SYM router hash and CAL threshold exactly (same rows, features and methodology)',
    matchedThresholdDiagnostic: 'every router is also evaluated at threshold 0 (full coverage); W_ROUTER(_ALL)_FULL_COVERAGE vs BASE_ROUTER_FULL_COVERAGE separates the feature contribution from the CAL threshold choice (diagnostic, not a headline rule)',
    unavailable: 'when no historically accepted field is DEPLOYABLE, W_ROUTER is NOT_EVALUATED and W_ROUTER_ALL stands in for W claims',
    metrics: ['accuracy', 'regret', 'normalized regret', 'catastrophic rate', 'false-selection harm (historical)', 'abstention (routed share)', 'selection distribution', 'headroom captured',
      'soft-target cross-entropy (the historical W multinomial diagnostic)', 'error concentration by the historical W conditions', 'latency (console only, not hashed)'],
    materiality: 'the Stage 3F.6-T-SYM rule unchanged: accuracy >= 0.02 (CI lower > 0) or normalized regret >= 0.02 (CI upper < 0), the other metric not significantly worse',
  },
  observability: {
    hiddenVariables: ['orientation (8 levels, eta)', 'priv.resourceMove.OBJECTIVE / MATERIAL / HOSTILE', 'RESOURCE chose a MOVE EAST', 'lowest-identity MOVE is EAST'],
    correlation: 'Pearson r (eta for orientation) of every valid risk field with each hidden variable on each fresh partition',
    proxyRule: 'PROXY_OF_HIDDEN_GEOMETRY for a target when VALID_RISK_vs_CORE is SIGNIFICANT on FRESH_HOLDOUT but PRIV_RISK_vs_PRIV is not',
  },
  shortcutAudit: {
    RISK_SCORE_EQUIVARIANCE: 'share of D4 twin pairs on which every valid risk field is identical', ROUTER_INPUT_EQUIVARIANCE: 'share of twin pairs on which every router input is identical',
    AVAILABILITY_EQUIVARIANCE: 'share of twin pairs on which the headline policies propose on the same slots',
    ROUTED_ACTION_EQUIVARIANCE: 'share of twin pairs on which the routed policy\'s twin action maps back to the same action',
    ORIENTATION_GAP: 'P.1E factorGap of router action accuracy over the 8 hidden orientations',
    ID_PERMUTATION_DELTA: 'P.1E pairedFlag of router accuracy minus the mean accuracy of the selected policy\'s identity-permuted choices (8 seeds, P.1E evidence)',
    candidateOrder: 'risk fields recomputed on a reversed, relabelled action surface must be identical', seedFamily: 'T0, T1 and T4 AUROC of CORE, CORE_PLUS_VALID_RISK and VALID_RISK_ONLY per seed family',
    level: 'AUROC per curriculum level', appliesTo: 'every fitted router (BASE, W, W_ALL)',
  },
  historicalClaims: {
    rule: 'every verdict on FRESH_HOLDOUT; INSUFFICIENT_EVIDENCE when the claim\'s target is not evaluable; claimVerdict from nexus-requalification-v1',
    W1_ROUTER_ERRORS_CONCENTRATE_IN_THREAT_STATES: 'BASE_ROUTER error ratio >= 1.25 (n >= 200 inside and outside) in >= 2 of HIGH_HOSTILE, UNCOVERED_THREAT, BOTTLENECK: SURVIVES; 1: PARTIALLY; 0: INVALIDATED',
    W2_THREAT_STRUCTURE_ALREADY_IN_CORE: 'SURVIVES if no valid threat-structure field (threatRelationCount, maxThreatPressure, threatenedCriticalCount, threatenedDependencyCount) has a SIGNIFICANT single-field T0 increment',
    W3_RETREAT_OPTION_REAL_BUT_NOT_MATERIAL: 'SURVIVES if ACCEPTED_vs_CORE on T0 is SIGNIFICANT and not MATERIAL; otherwise INVALIDATED (absent, not deployable, or material)',
    W4_MINIMALITY_ALL_NOT_BETTER: 'SURVIVES if VALID_RISK_vs_ACCEPTED on T0 is not SIGNIFICANT; NOT_RETESTABLE if no accepted field is valid',
    W5_ACTOR_POSITION_SMALL_INCREMENT: 'SURVIVES if SPATIAL_vs_CORE on T0 is SIGNIFICANT (reported with its SHORTCUT_CORRELATED class); else INVALIDATED',
    W6_OBJECTIVE_NOT_A_GAP: 'SURVIVES if OBJECTIVE_vs_CORE on T0 is not SIGNIFICANT',
    W7_CORE_RANKS_NEXUS_VS_RESOURCE: 'SURVIVES if CORE T0 AUROC >= 0.75; PARTIALLY if >= 0.65; else INVALIDATED',
    W8_NEXUS_CAPTURE_FAILS_DESPITE_SIGNAL: 'SURVIVES if BASE_ROUTER selects NEXUS on < 0.5 of NEXUS-uniquely-best rows and CORE T0 AUROC >= 0.65; PARTIALLY if only the capture failure holds',
    W9_PRIMARY_B_INSUFFICIENT: 'SURVIVES if the historical W precedence (E, C, A, B, D) applied to FRESH_HOLDOUT T0 increments yields B',
    W10_STRUCTURAL_REJECTIONS_HOLD: 'SURVIVES if all four historical structural rejections hold on DEV/CAL (hostileAlive = hostileEntityCount, covered = threatened - uncovered, threatenedCivilian = unresolvedDependencyCount, coverage ratio unusable); PARTIALLY if some',
    W11_LEAK_FREE_DECISION_TIME: 'SURVIVES if the risk module is byte-identical to the W certificate, the contract hash is unchanged, every field is decision-time by contract and invariant to identity relabelling and candidate order',
    W12_NO_ROUTING_GAIN: 'SURVIVES if W_ROUTER (W_ROUTER_ALL when W_ROUTER is not evaluated) vs BASE_ROUTER is not MATERIAL',
    W13_FALSE_SELECTION_HARM_UNCHANGED: 'SURVIVES unless the enriched router lowers the false-selection rate by >= 0.02',
    W14_OOD: 'NOT_RETESTABLE as a historical claim (W made no OOD claim); OOD behaviour is measured and reported',
  },
  classification: {
    labels: ['INSUFFICIENT_EVIDENCE', 'GENUINE_RISK_SIGNAL', 'RISK_SIGNAL_WEAK', 'RISK_SIGNAL_REDUNDANT', 'RISK_SIGNAL_SHORTCUT_CORRELATED', 'RISK_SIGNAL_ABSENT',
      'RISK_SIGNAL_NOT_ROUTABLE', 'ROUTER_VALUE_NOT_MATERIAL', 'OOD_UNSTABLE', 'PROXY_OF_HIDDEN_GEOMETRY'],
    rules: {
      INSUFFICIENT_EVIDENCE: 'no target (T0-T6) is evaluable on FRESH_HOLDOUT',
      GENUINE_RISK_SIGNAL: 'for some decision target T1-T6: VALID_RISK_vs_CORE is MATERIAL on FRESH_HOLDOUT and SIGNIFICANT on FRESH_OOD, every valid field is D4-invariant on both, and the target is not PROXY_OF_HIDDEN_GEOMETRY',
      RISK_SIGNAL_WEAK: 'some target (T0-T6) has VALID_RISK_vs_CORE or ACCEPTED_vs_CORE SIGNIFICANT on FRESH_HOLDOUT and GENUINE_RISK_SIGNAL does not hold',
      RISK_SIGNAL_REDUNDANT: 'VALID_RISK_ONLY AUROC >= 0.65 for some target on FRESH_HOLDOUT but no risk increment is SIGNIFICANT',
      RISK_SIGNAL_SHORTCUT_CORRELATED: 'a historical W field is classified SHORTCUT_CORRELATED and SPATIAL_vs_CORE is SIGNIFICANT for some target on FRESH_HOLDOUT',
      RISK_SIGNAL_ABSENT: 'no other signal label holds',
      RISK_SIGNAL_NOT_ROUTABLE: 'neither W_ROUTER nor W_ROUTER_ALL is MATERIAL over BASE_ROUTER on FRESH_HOLDOUT',
      ROUTER_VALUE_NOT_MATERIAL: 'neither W_ROUTER nor W_ROUTER_ALL is MATERIAL over BEST_SINGLE on FRESH_HOLDOUT',
      OOD_UNSTABLE: 'a risk increment SIGNIFICANT on FRESH_HOLDOUT is not on FRESH_OOD, or an informative VALID_RISK_ONLY AUROC falls by more than 0.05',
      PROXY_OF_HIDDEN_GEOMETRY: 'the observability proxyRule holds for any target',
    },
    primaryPrecedence: ['INSUFFICIENT_EVIDENCE', 'GENUINE_RISK_SIGNAL', 'RISK_SIGNAL_WEAK', 'RISK_SIGNAL_REDUNDANT', 'RISK_SIGNAL_SHORTCUT_CORRELATED', 'RISK_SIGNAL_ABSENT'],
    secondary: 'every holding label',
  },
  roadmap: {
    W_REQUALIFIED: 'stage PASS', HISTORICAL_W_SURVIVES: 'true if every retestable claim SURVIVES, PARTIAL if some survive, else false',
    GENUINE_RISK_SIGNAL_MEASURED: 'GENUINE_RISK_SIGNAL holds',
    RISK_SIGNAL_DEPLOYABLE: 'the valid set is non-empty, every valid field is D4-invariant, identity/order invariant and leak-free (W11)',
    RISK_SIGNAL_CALIBRATED: 'CORE_PLUS_VALID_RISK ECE <= 0.05 on both fresh partitions for T0 and T1', RISK_SIGNAL_OOD_STABLE: 'OOD_UNSTABLE does not hold and some risk increment is SIGNIFICANT',
    RISK_SIGNAL_IMPROVES_DECISIONS: 'W_ROUTER or W_ROUTER_ALL is MATERIAL over BEST_SINGLE on FRESH_HOLDOUT and not significantly worse on FRESH_OOD',
    RISK_SIGNAL_IMPROVES_ROUTING: 'W_ROUTER or W_ROUTER_ALL is MATERIAL over BASE_ROUTER on FRESH_HOLDOUT and not significantly worse on FRESH_OOD',
    ROUTER_2_0_JUSTIFIED: 'false (3F.6-T-SYM; not reopened; useful risk detection is not evidence for Router 2.0)',
    RISK_STATE_USEFUL_FOR_3G: 'GENUINE_RISK_SIGNAL_MEASURED and RISK_SIGNAL_CALIBRATED (a failure-readout candidate; never an expert or router justification)',
    READY_FOR_STAGE3F6D_REQUALIFICATION: 'stage PASS', READY_FOR_3F_FREEZE: 'false (3F.6-D remains)', READY_FOR_STAGE3G: 'false by construction',
  },
  acceptance: { PASS: 'every integrity check holds; a negative result is a valid PASS', FAIL: ['seed overlap', 'sealed data before the freeze commit', 'lineage contamination', 'broken symmetry',
    'risk module or policy change', 'non-reproducibility', 'post-freeze rule change', 'authority violation'],
    predecessors: 'the certifier runs P.1-SYM --check (transitively P.1A-SYM, P.1C, P.1D, P.1E, 3F.6-T-SYM) concurrently with the evaluation' },
  preFreezeRevisions: [
    { id: 'PRE-FREEZE-001', change: 'added the matched-threshold (full-coverage) router diagnostic', reason: 'the DEV/CAL dry run selected CAL threshold 0.7 for W_ROUTER and W_ROUTER_ALL against 0.4 for BASE_ROUTER, so a headline W-vs-BASE difference mixes feature value with threshold choice',
      dataSeen: 'DEV/CAL only; no row from seeds 3022/3023/3032/3033 existed' },
  ],
  notChanged: ['router methodology', 'Nexus', 'every policy', 'the risk-state contract', 'the feature contract', 'FORGE_SYMMETRIC_V2', 'every prior corpus and certificate', 'authority'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const STAGE3F6WSYM_PLAN_HASH = sha256(STAGE3F6WSYM_PLAN);
export const STAGE3F6WSYM_OUT = 'artifacts/stage3f6wsym-risk-requalification';
export const STAGE3F6WSYM_PLAN_PATH = `${STAGE3F6WSYM_OUT}/stage3f6wsym-analysis-plan.json`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(path.join(root, STAGE3F6WSYM_OUT), { recursive: true });
  await writeFile(path.join(root, STAGE3F6WSYM_PLAN_PATH), `${JSON.stringify({ ...STAGE3F6WSYM_PLAN, planHash: STAGE3F6WSYM_PLAN_HASH,
    seedPlan: STAGE3F6WSYM_SEED_PLAN, historicalW: HISTORICAL_W }, null, 2)}\n`);
  console.log(JSON.stringify({ planHash: STAGE3F6WSYM_PLAN_HASH, seedPlanHash: STAGE3F6WSYM_SEED_PLAN_HASH, historicalWHash: HISTORICAL_W_HASH }));
}
