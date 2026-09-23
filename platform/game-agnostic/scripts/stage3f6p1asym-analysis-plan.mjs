#!/usr/bin/env node
/* STAGE_3F_6_P_1A_SYM — analysis plan for the FREE-ACTION DECISION SUFFICIENCY AUDIT.
 *
 * Written, hashed and committed with the DEV/CAL open-phase report BEFORE the fresh confirmatory partitions exist and
 * before any candidate model is scored on a HOLDOUT or OOD row. It fixes eligibility, candidates, the feature
 * inventory and representation tiers, every model, control and baseline, metrics, the CAL selection rule, materiality,
 * equivariance tests, the error taxonomy and every conclusion rule. Measurement only: no policy is changed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DeployableProfile, DEPLOYABLE_PROFILES } from '../src/stage3f/deployable-feature-contract-v1.js';
import { FREE_ACTION_REPRESENTATION_CONTRACT, FREE_ACTION_REPRESENTATION_HASH, MATERIAL_TOP1_GAIN, SUFFICIENT_TOP1 } from '../src/stage3f/free-action-sufficiency-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const STAGE3F6P1ASYM_STATE_FEATURES = deepFreeze({
  featureSetId: 'STAGE3F6P1ASYM_STATE_CORE_V1',
  contractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH, profile: DeployableProfile.DEPLOYABLE_CORE,
  featureIds: [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort(),
  audit: 'all 30 certified DEPLOYABLE by Stage 3F.6-T-SYM (edd46e40); D4-invariant on every twin (P.1D gate)',
});
export const STAGE3F6P1ASYM_STATE_FEATURES_HASH = sha256(STAGE3F6P1ASYM_STATE_FEATURES);

/** Model specifications: `main` blocks enter as columns; `interact` blocks also enter multiplied by each state feature. */
export const MODEL_SPECS = deepFreeze({
  STATE_ONLY: { main: ['TYPE'], interact: ['TYPE'], role: 'HEADLINE_STATE_ONLY' },
  SC_CANDIDATE_MAIN: { main: ['TYPE', 'CANDIDATE'], interact: ['TYPE'], role: 'HEADLINE_CANDIDATE_VARIANT' },
  SC_CANDIDATE_INTERACT: { main: ['TYPE', 'CANDIDATE'], interact: ['TYPE', 'CANDIDATE'], role: 'HEADLINE_CANDIDATE_VARIANT' },
  SC_GEOMETRY_MAIN: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY'], interact: ['TYPE'], role: 'HEADLINE_CANDIDATE_VARIANT' },
  SC_GEOMETRY_INTERACT: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY'], interact: ['TYPE', 'CANDIDATE', 'GEOMETRY'], role: 'HEADLINE_CANDIDATE_VARIANT' },
});
/** Diagnostics: the CAL-selected candidate model's spec plus these main-effect blocks. Never headline. */
export const DIAGNOSTIC_SPECS = deepFreeze({
  D_ABSOLUTE_DIRECTION: { add: ['ABS'], class: 'NON_EQUIVARIANT', question: 'how much does the presented absolute direction buy (orientation shortcut)?' },
  D_CANONICAL_FRAME: { add: ['CANON'], class: 'LEAKED', question: 'how much does the privileged canonical-frame direction buy?' },
  D_HIDDEN_ORIENTATION: { add: ['HIDDEN'], class: 'ORACLE_ONLY', question: 'how much does the hidden base-frame direction (generator bias) buy?' },
  D_PRIVILEGED_RELATIONS: { add: ['PRIV'], class: 'UNAVAILABLE', question: 'would observing where task entities are (action semantics relative to entities) suffice?' },
  D_ONE_STEP: { add: ['ONESTEP'], class: 'FUTURE_STATE_REQUIRED', question: 'would a one-step successor prediction suffice?' },
  D_PRIVILEGED_ONE_STEP: { add: ['PRIV', 'ONESTEP'], class: 'UNAVAILABLE+FUTURE_STATE_REQUIRED', question: 'both together' },
});

export const STAGE3F6P1ASYM_PLAN = deepFreeze({
  stage: 'STAGE_3F_6_P_1A_SYM_FREE_ACTION_DECISION_SUFFICIENCY',
  question: 'Can the currently deployable decision-time representation distinguish the optimal zero-cost action from the other zero-cost candidates on FORGE_SYMMETRIC_V2?',
  hypotheses: { H1: 'POLICY_IMPLEMENTATION_LIMITATION: the deployable state already carries the information; current policies do not use it',
    H2: 'REPRESENTATION_LIMITATION: the deployable state does not carry enough action-conditioned information' },
  role: 'EVALUATION_ONLY',
  predecessors: {
    stage3f6tsymCertification: 'edd46e40fc2c6ddc611f9f78a432f723f0ae4e66facc1b2ca84183fa4d896f4e',
    stage3f6p1eCertification: '11dcf65b79679ae8748eed0f5f9f3fdef38223524308aaa353c5b482eed8a031',
    stage3f6p1dCertification: 'afd0d6e6057f497e9e1d3666cf553518e134b0c4d09f783601b393c081ae7073',
    stage3f6p1cCertification: '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d',
    stage3f6p1aHistoricalCertification: 'c4029ff96e617341b448ae5d4f1853f6d21186134a64ce6162acc755394f40be',
    corpusContentHash: '4de383eb0c6e9836706e87c6626de53ccb54853fb527f368cfaf599617e6c75e',
    tsymFreshContentHash: '2921adb7e933c274ed692d0f38ccc58a6d1553a60194d01d14b75105c92ff6e8',
  },
  eligibility: {
    rule: FREE_ACTION_REPRESENTATION_CONTRACT.eligibility,
    candidates: FREE_ACTION_REPRESENTATION_CONTRACT.candidates,
    target: 'binary optimal-set membership of each candidate (oracle); the decision is correct when the chosen candidate is in the optimal set',
    subpopulations: ['UNIQUE_OPTIMAL_ZERO_COST (exactly one optimal zero-cost candidate)', 'MULTIPLE_OPTIMAL_ZERO_COST (two or more)',
      'MIXED_OPTIMAL_SET (optimal set also contains a costly action)', 'zero-cost candidate count', 'optimal-type composition', 'hidden orientation',
      'curriculum level', 'topology shape', 'horizon class'],
  },
  representation: { contract: FREE_ACTION_REPRESENTATION_CONTRACT, contractHash: FREE_ACTION_REPRESENTATION_HASH,
    stateFeatures: STAGE3F6P1ASYM_STATE_FEATURES, stateFeaturesHash: STAGE3F6P1ASYM_STATE_FEATURES_HASH,
    audit: {
      declared: 'every inventory entry carries its declared class; only DEPLOYABLE entries may be headline columns',
      empirical: ['NON_EQUIVARIANT if the deployable vector of any candidate differs on any D4 twin (every 25th row, 5 transforms) of any evaluated partition',
        'NON_EQUIVARIANT if replaying with identities replaced and the legal list reversed changes any vector',
        'LEAKED if any single deployable column separates optimal from non-optimal candidates with pooled candidate AUROC (max of a, 1 - a) >= 0.99 on DEV',
        'UNAVAILABLE if any deployable value is non-finite'],
      downgradeRule: 'a failing column is reported and dropped from the headline; nothing is silently replaced',
    } },
  models: {
    family: 'CONDITIONAL_LOGIT_CANDIDATE_SOFTMAX (linear candidate scorer, softmax within state, set-valued target: maximise log P(optimal set))',
    optimiser: 'DEV standardisation of every column, zeros init, no bias, l2 1e-3, learning rate 0.1, 2000 full-batch iterations (the Stage 3F.6-T settings)',
    interactions: 'an `interact` block is also entered as block x each of the 30 state features (raw product, then standardised)',
    headline: MODEL_SPECS,
    stateOnly: 'STATE_ONLY: candidate identity is reduced to its declared type (the minimum that names a candidate); every MOVE is identical, so it chooses uniformly among MOVEs',
    calSelection: 'the headline STATE+CANDIDATE model is the SC_* variant with the highest CAL top-1 accuracy; ties within 1e-9 -> fewer columns',
    diagnostics: DIAGNOSTIC_SPECS,
    notPermitted: ['deep network', 'JEPA', 'world model', 'sequence model', 'rollout search', 'tree model (not predeclared)', 'post-HOLDOUT tuning'],
    tieRule: FREE_ACTION_REPRESENTATION_CONTRACT.tieRule,
  },
  baselines: {
    controls: {
      UNIFORM_AMONG_ZERO_COST: 'exact expectation of a uniform choice among the zero-cost candidates',
      LOWEST_ACTION_ID: 'zero-cost candidate with the lowest identity (control: identity order)',
      HIGHEST_ACTION_ID: 'zero-cost candidate with the highest identity (control: identity order)',
      FIXED_DIRECTION_EAST: 'MOVE EAST in the presented frame if legal, else uniform (control: absolute direction); likewise NORTH, SOUTH, WEST',
      HIDDEN_BASE_EAST: 'the MOVE whose generator base-frame direction is EAST if legal, else uniform (ORACLE_ONLY control: hidden orientation)',
    },
    policies: {
      RESOURCE_PRESERVING_V1: 'the stored frozen choice', RESOURCE_ID_REVERSED: 'RESOURCE re-run with identities reversed, mapped back',
      NEXUS_SELECTOR_V1: 'the stored choice on eligible rows where it proposes (coverage reported; may be costly)',
    },
    references: {
      GREEDY: 'the stored simulator one-step greedy choice over all legal actions (non-deployable reference)',
      ONE_STEP_ZERO_COST: 'argmax one-step immediate scalar among zero-cost candidates, uniform ties (FUTURE_STATE_REQUIRED reference)',
    },
    heuristics: {
      NON_WAIT_UNIFORM: 'uniform among zero-cost candidates that are not WAIT (deployable type heuristic)',
      RETREAT_ALIGNED: 'if a RETREAT is legal: uniform over the RETREAT and the MOVE aligned with it; else uniform over MOVEs (deployable, P.1A fields)',
      TOWARD_CENTRE: 'uniform among MOVE/RETREAT candidates that reduce centre distance, else uniform among zero-cost (deployable, GEOMETRY fields)',
    },
  },
  partitions: {
    DEV: 'fit (all models, standardisation)', CAL: 'selection (headline SC_* variant); calibration reported',
    FRESH_HOLDOUT: 'PRIMARY confirmatory: 6000 new records from the declared, unused P.1D HOLDOUT seed 2023 (levels 0-5, canonical order)',
    FRESH_OOD: 'PRIMARY robustness: 6000 new records from the declared, unused P.1D OOD seed 2033 (levels 6-7, canonical order)',
    TSYM_HOLDOUT: 'SECONDARY replication: the Stage 3F.6-T-SYM fresh HOLDOUT (seed 2022); policy-level outcomes were evaluated there, candidate models never',
    TSYM_OOD: 'SECONDARY replication: the Stage 3F.6-T-SYM fresh OOD (seed 2032), likewise',
    excluded: 'the P.1D/P.1E HOLDOUT and OOD (RESOURCE shortcut was diagnosed on them)',
    freshAdmission: 'P.1D corpusRecord (unchanged) in canonical order; reject any record, world or topology hash already claimed by the 20000-row lineage, the T-SYM fresh 12000, or earlier in the new set; equivariance sampled every 25th combination',
    freshGeneration: 'only after this plan, the open-phase report and all evaluation code are committed unchanged at HEAD',
  },
  metrics: {
    perDecision: ['TOP1_ACTION_ACCURACY (= OPTIMAL_SET_HIT_RATE of the chosen candidate, expectation over uniform ties)', 'P_OPTIMAL_SET (model probability mass on the optimal set)',
      'REGRET', 'NORMALIZED_REGRET (regret / max regret over all legal actions)', 'CATASTROPHIC_ERROR_RATE (regret >= 100)', 'CROSS_ENTROPY (-log P(optimal set))',
      'BRIER (top-1 confidence vs top-1 correctness)', 'ECE (10 bins, top-1 confidence)', 'ABSTENTION: not supported (every scorer always chooses)'],
    breakdowns: ['zero-cost candidate count', 'hidden orientation', 'optimal-type composition', 'cost structure (unique / multiple / mixed)', 'horizon class', 'curriculum level', 'topology shape'],
    bootstrap: 'paired over eligible rows, 1000 resamples, mulberry32 seeded by sha256(label) (Stage 3F.6-P.1E bootstrapPlan)',
  },
  equivariance: {
    featureEquivariance: 'share of (twin, candidate) pairs whose deployable vector equals the base vector after mapping back; required 1',
    predictionEquivariance: 'share of twins whose top-scoring candidate set, mapped back, equals the base top set; required 1 for headline models',
    idPermutation: 'share of rows whose deployable vectors are unchanged when identities are replaced and the list reversed; required 1',
    orientationStability: 'on FRESH_HOLDOUT the headline model gain over UNIFORM in every hidden orientation >= 0.5 x its overall gain (only when the overall gain > 0)',
    shortcutDetection: 'the D_ABSOLUTE_DIRECTION diagnostic is scored on twins with transformed directions; its prediction equivariance is reported (expected < 1, proving the test can fail)',
  },
  materiality: {
    MATERIAL: `top-1 gain >= ${MATERIAL_TOP1_GAIN} with paired 95% CI lower bound > 0, and normalized regret not significantly worse (CI lower bound of the difference <= 0)`,
    comparators: ['UNIFORM_AMONG_ZERO_COST', 'RESOURCE_PRESERVING_V1'],
    mustSurvive: ['FRESH_HOLDOUT', 'FRESH_OOD', 'feature, prediction and identity equivariance = 1', 'orientation stability'],
    sufficientBar: `REPRESENTATION_SUFFICIENT additionally requires FRESH_HOLDOUT top-1 >= ${SUFFICIENT_TOP1} (a majority of dominant free decisions correct)`,
    statisticalOnly: 'statistical significance below the gain bar is reported, never called sufficient',
  },
  errorAttribution: {
    population: 'residual errors of the headline STATE+CANDIDATE model on FRESH_HOLDOUT and FRESH_OOD, each row weighted by 1 - its expected hit',
    sets: 'O = optimal zero-cost candidates; W = non-optimal members of the top-scoring set',
    precedence: [
      'OBJECTIVE / RESOURCE / THREAT / RELATIONAL (PARTIAL_OBSERVABILITY): the first privileged relation group (objective entity; material or resources; hostiles or threatened; critical or dependency hubs) whose nearest-distance change strictly separates O from W',
      'MECHANISTIC: the one-step immediate scalar strictly separates O from W (visible in a one-step transition)',
      'TEMPORAL: the row is HORIZON_DEPENDENT and nothing above separates',
      'ACTION_ID_AMBIGUITY: not horizon-dependent and O and W are identical in deployable, privileged and one-step fields (only identity differs)',
      'UNKNOWN: otherwise',
    ],
    multiLabel: 'every separating relation group, MECHANISTIC, and DEPLOYABLY_DISTINGUISHABLE (the deployable vectors of O and W differ at all) are also counted (multi-label incidence); DEPLOYABLY_DISTINGUISHABLE is never a primary class because a difference in deployable fields does not show that they carry the answer',
    role: 'diagnostic only; it names which Stage 3G capability the data calls for and never creates an expert',
  },
  conclusions: {
    categories: ['REPRESENTATION_SUFFICIENT_POLICY_WEAK', 'REPRESENTATION_PARTIALLY_SUFFICIENT', 'SHORTCUT_ONLY_GAIN', 'REPRESENTATION_INSUFFICIENT', 'INSUFFICIENT_EVIDENCE'],
    precedence: [
      'INSUFFICIENT_EVIDENCE if eligible FRESH_HOLDOUT < 1000 or FRESH_OOD < 500',
      'REPRESENTATION_SUFFICIENT_POLICY_WEAK if MATERIAL vs both comparators on FRESH_HOLDOUT and FRESH_OOD, equivariant and stable, and FRESH_HOLDOUT top-1 >= 0.5',
      'REPRESENTATION_PARTIALLY_SUFFICIENT if the same holds with top-1 < 0.5',
      'SHORTCUT_ONLY_GAIN if MATERIAL on FRESH_HOLDOUT but not equivariant/stable, or not MATERIAL while a decision-time shortcut (D_ABSOLUTE_DIRECTION, LOWEST/HIGHEST_ACTION_ID, FIXED_DIRECTION_*) is MATERIAL vs UNIFORM and vs the evaluated model on FRESH_HOLDOUT (D_ABSOLUTE_DIRECTION extends the headline candidate spec and is compared with that model only); ORACLE_ONLY and LEAKED diagnostics are reported, not counted',
      'REPRESENTATION_INSUFFICIENT otherwise',
    ],
    secondary: 'every other category whose condition holds is listed, plus OOD_UNSTABLE when material on FRESH_HOLDOUT but not FRESH_OOD',
    preFreezeRevisions: [
      'The two rules below were revised BEFORE the freeze commit, after a dry run of the confirmatory code on CAL rows standing in for the sealed partitions (DEV/CAL only; no fresh row existed): (1) SHORTCUT_ONLY_GAIN originally counted ORACLE_ONLY/LEAKED diagnostics, which always beat UNIFORM, so every non-material model would have read as shortcut-only; (2) the error taxonomy originally had a REPRESENTED_BUT_MISRANKED primary class that fired whenever deployable vectors differed at all (95% of CAL residuals), which would have been misread as evidence for H1.',
      'The dry run also added a guard (a comparison over zero rows is never material) and restricted D_ABSOLUTE_DIRECTION to the model it extends (compared with STATE_ONLY it credited the geometry columns, not the shortcut).',
    ],
    appliedTo: ['STATE_ONLY', 'the CAL-selected STATE+CANDIDATE model'],
  },
  roadmap: {
    FREE_ACTION_DECISION_MEASURED: 'stage PASS',
    CURRENT_POLICY_SHORTCUT_CONFIRMED: 'FRESH_HOLDOUT: RESOURCE minus RESOURCE_ID_REVERSED top-1 CI lower > 0 AND RESOURCE top-1 in hidden orientations that keep EAST as EAST minus the others >= 0.15 with CI lower > 0',
    DEPLOYABLE_STATE_SUFFICIENT: 'STATE_ONLY category is REPRESENTATION_SUFFICIENT_POLICY_WEAK',
    DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT: 'headline STATE+CANDIDATE category is REPRESENTATION_SUFFICIENT_POLICY_WEAK',
    POLICY_REPAIR_JUSTIFIED: 'headline STATE+CANDIDATE category is SUFFICIENT or PARTIALLY_SUFFICIENT (a deployable scorer materially beats the current policy, equivariantly and OOD-stably)',
    ACTION_SEMANTICS_REQUIRED: `not DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT and D_PRIVILEGED_RELATIONS minus the headline model >= ${MATERIAL_TOP1_GAIN} top-1 with CI lower > 0 on FRESH_HOLDOUT`,
    TRANSITION_PREDICTION_REQUIRED: `not DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT and D_ONE_STEP minus the headline model >= ${MATERIAL_TOP1_GAIN} top-1 with CI lower > 0 on FRESH_HOLDOUT`,
    PREDICTIVE_REPRESENTATION_REQUIRED: 'not DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT and (ACTION_SEMANTICS_REQUIRED or TRANSITION_PREDICTION_REQUIRED or TEMPORAL >= 0.25 of weighted FRESH_HOLDOUT residual error)',
    ROUTER_2_0_JUSTIFIED: 'false (Stage 3F.6-T-SYM; not re-opened)',
    READY_FOR_3F_FREEZE: 'false: 3F.6-P.1, W and D requalifications remain',
    READY_FOR_STAGE3G: 'false by construction',
  },
  notChanged: ['policies', 'experts', 'Nexus', 'RESOURCE', 'router', 'FORGE_SYMMETRIC_V2 semantics', 'the 20000-row corpus', 'the deployable feature contract', 'authority', 'Stage 3G (not begun)'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const STAGE3F6P1ASYM_PLAN_HASH = sha256(STAGE3F6P1ASYM_PLAN);
export const STAGE3F6P1ASYM_OUT = 'artifacts/stage3f6p1asym-free-action';
export const STAGE3F6P1ASYM_PLAN_PATH = `${STAGE3F6P1ASYM_OUT}/stage3f6p1asym-analysis-plan.json`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(path.join(root, STAGE3F6P1ASYM_OUT), { recursive: true });
  await writeFile(path.join(root, STAGE3F6P1ASYM_PLAN_PATH), `${JSON.stringify({ ...STAGE3F6P1ASYM_PLAN, planHash: STAGE3F6P1ASYM_PLAN_HASH,
    representationHash: FREE_ACTION_REPRESENTATION_HASH, stateFeaturesHash: STAGE3F6P1ASYM_STATE_FEATURES_HASH }, null, 2)}\n`);
  console.log(JSON.stringify({ planHash: STAGE3F6P1ASYM_PLAN_HASH, representationHash: FREE_ACTION_REPRESENTATION_HASH, stateFeaturesHash: STAGE3F6P1ASYM_STATE_FEATURES_HASH }));
}
