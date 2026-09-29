/* STAGE_3G_3 — pre-registered plan: prediction lifecycle and multi-step residual attribution (constants only).
 *
 * Fixed and committed with the open-phase report BEFORE any sealed row exists. The Stage 3G.3 scripts live under
 * scripts/stage3g3/ because the frozen Stage 3G.1/3G.2 test suite enumerates the top-level stage3g scripts exactly; every
 * Stage 3G.3 CLI installs the read-only check-mode guard, and the Stage 3G.3 tests enforce it.
 */
import { deepFreeze, sha256 } from '../../src/core/determinism.js';
import { MATERIAL_TOP1_GAIN } from '../../src/stage3f/free-action-sufficiency-v1.js';
import { PREDICTION_LIFECYCLE_ID, PREDICTION_LIFECYCLE_SCHEMA_HASH, INVALIDATION_RULES, STALE_RULES } from '../../src/stage3g/prediction-lifecycle-v1.js';
import { NEW_SPECS as G12_NEW_SPECS, STAGE3F_INHERITANCE, SEED_PLAN as G12_SEED_PLAN } from '../stage3g/plan.mjs';
import { MLP_GRID, MLP_SETTINGS } from './scorers.mjs';
import { CONTINUATION_STEPS, OPTION_COLUMNS, TEMPORAL_COLUMNS } from './evidence.mjs';

export const OUT = 'artifacts/stage3g3-temporal-attribution';
export const PLAN_PATH = `${OUT}/stage3g3-analysis-plan.json`;
export const OPEN_REPORT_PATH = `${OUT}/stage3g3-open-phase-report.json`;
export const SEALED_PATH = `${OUT}/sealed-partitions.jsonl.gz`;
export const SEALED_MANIFEST_PATH = `${OUT}/sealed-partitions-manifest.json`;
export const RESULT_PATH = `${OUT}/stage3g3-certification-result.json`;

export const STAGE3G12_INHERITANCE = deepFreeze({
  CERTIFICATE_FILE: 'artifacts/stage3g-predictive-integrity/stage3g-certification-result.json',
  CERTIFICATION_HASH: '7f39253507a4219dac0a0c4a83cfe7d14b2d37fa1498ebb2767560bdea695100',
  CERTIFICATION_COMMIT: '46d6d2d9b86ee227ad18c19c243fd4fce2a52b26', FREEZE_COMMIT: 'dac250187f2f459c3ed691d3a8ff22ef8a313647',
  REPRESENTATION_GAP_CLOSED: true, TRANSITION_PREDICTION_NOW_JUSTIFIED: false,
  NEW_SELECTED: 'G_PATH_MAIN', NEW_MODEL_HASH: '2e868e3acbe4594a1f82a01956d64f27c3e30dab3942335078901634103189dd',
  certifiedTop1: { STAGE3G_HOLDOUT: 0.812844, STAGE3G_OOD: 0.911552 },
  PROTECTED_PATHS: ['artifacts/stage3g-predictive-integrity/**', 'docs/STAGE3G_*', 'scripts/stage3g/**', 'scripts/stage3g-plan.mjs', 'scripts/generate-stage3g-sealed.mjs',
    'scripts/certify-stage3g-predictive-integrity.mjs', 'src/stage3g/epistemic-provenance-v1.js', 'src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js',
    'tests/stage3g-epistemic-integrity.test.js', 'tests/stage3g-observable-state.test.js'],
});

export const HYPOTHESES = deepFreeze({
  H1_MULTI_STEP_TEMPORAL: 'residual error is materially reduced by legitimate multi-step future-state information',
  H2_RANKING_OR_UTILITY: 'the representation carries sufficient information but the linear diagnostic ranking is too weak',
  H3_OPTION_PRESERVATION: 'the missing signal is preservation of future choices / maneuverability / survivability, not raw future-state prediction',
  H4_RETREAT_SPECIFIC: 'the persistent retreat residual is a specific action-semantics or decision-rule exception',
  H5_MULTIPLE_OPTIMAL_LABEL_STRUCTURE: 'a material portion of apparent error comes from exact top-1 evaluation in states with several equally optimal actions',
  H6_MIXED: 'more than one mechanism is independently material',
  negativeResult: 'a negative temporal result is a valid PASS',
});

export const HORIZONS = deepFreeze({
  labelDepth: 'the oracle scores a candidate by its immediate FORGE_REWARD_V2 scalar plus GREEDY_CONTINUATION_V1 for the row\'s label horizon h in {1,3,5,8} continuation steps',
  truncatedReturn: 'T_k = immediate + the first k-1 continuation rewards of the same oracle branch (vector-accumulated, then scalarised, exactly as the oracle); T_1 is the one-step successor; T_{h+1} equals the label total',
  diagnostics: { ONE_STEP: 'T_1', MULTI_STEP_ORACLE_H2: 'T_2', MULTI_STEP_ORACLE_H3: 'T_3', MULTI_STEP_ORACLE_H4: 'T_4' },
  labelLeakGuard: 'for a row with label horizon h, T_k with k >= h+1 IS the label; the primary temporal test therefore uses only PARTIAL_k rows (h+1 > k), where the future supplied is strictly shorter than the label depth. Full-population values are reported only as PRIVILEGED_UPPER_BOUND with the label-complete share disclosed.',
  consequenceDepth: 'd = the smallest number of continuation steps (0..4) whose truncated return T_{d+1} ranks only optimal zero-cost candidates at the top; none within 4 -> 5',
  strata: { H0: 'd = 0: the immediate outcome already identifies an optimal action', H1: 'd = 1: one-step consequence', H2: 'd = 2: two-step consequence', H3: 'd = 3-4', H4: 'd > 4: longer / persistent consequence' },
  status: 'diagnostic only; the strategic H0-H4 benchmark of the future roadmap is not frozen here',
  continuationStepsComputed: CONTINUATION_STEPS,
});

export const BLOCKS = deepFreeze({
  NEW: 'Stage 3G.2 observable representation, G_PATH_MAIN (TYPE, CANDIDATE, GEOMETRY, GP main; TYPE x 30 state features)',
  PAIRS: 'all pairwise products of the 20 candidate-level NEW columns (TYPE, CANDIDATE, GEOMETRY, GP)',
  ONESTEP: 'T_1 - max, T_1 - mean over the state\'s candidates (PRIVILEGED)',
  H2: 'T_2 relative (PRIVILEGED)', H3: 'T_3 relative (PRIVILEGED)', H4: 'T_4 relative (PRIVILEGED)',
  OPTION: `option preservation along the oracle branch (PRIVILEGED): ${OPTION_COLUMNS.join(', ')}`,
  TEMPORAL: `decision-relevant temporal quantities over four continuation steps (PRIVILEGED): ${TEMPORAL_COLUMNS.join(', ')}`,
  PRIV: 'Stage 3F.6-P.1A-SYM privileged kernel relations (PRIVILEGED; action-semantics probe for the retreat classification)',
});
export const SCORERS = deepFreeze({
  NEW_LINEAR: { spec: G12_NEW_SPECS.G_PATH_MAIN, role: 'LINEAR_BASELINE (must reproduce the Stage 3G.1/3G.2 model hash)' },
  NEW_INTERACTION: { spec: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GP', 'PAIRS'], interact: ['TYPE'] }, role: 'INTERACTION_AUGMENTED_LINEAR' },
  NEW_NONLINEAR: { spec: { mlpInputs: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GP', 'STATE'] }, grid: MLP_GRID, settings: MLP_SETTINGS, role: 'SMALL_NONLINEAR_CONTROL (hidden width chosen on CAL)' },
  BEST_CAPACITY: 'whichever of NEW_INTERACTION / NEW_NONLINEAR has the higher CAL top-1 (ties within 1e-9 -> NEW_INTERACTION); the capacity-controlled comparator',
  deployable: 'all three read only the Stage 3G.2 observable representation; they remain diagnostics and are never promoted',
});
const add = (blocks) => ({ main: [...G12_NEW_SPECS.G_PATH_MAIN.main, ...blocks], interact: G12_NEW_SPECS.G_PATH_MAIN.interact });
export const DIAGNOSTICS = deepFreeze({
  D_ONE_STEP: { spec: add(['ONESTEP']), fitRows: 'DEV all', class: 'PRIVILEGED_UPPER_BOUND' },
  D_H2: { spec: add(['H2']), k: 2, fitRows: 'DEV PARTIAL_2', class: 'PRIVILEGED_UPPER_BOUND' },
  D_H3: { spec: add(['H3']), k: 3, fitRows: 'DEV PARTIAL_3', class: 'PRIVILEGED_UPPER_BOUND' },
  D_H4: { spec: add(['H4']), k: 4, fitRows: 'DEV PARTIAL_4', class: 'PRIVILEGED_UPPER_BOUND' },
  D_OPTION: { spec: add(['OPTION']), fitRows: 'DEV all', class: 'PRIVILEGED_UPPER_BOUND' },
  D_TEMPORAL_FEATURES: { spec: add(['TEMPORAL']), fitRows: 'DEV all', class: 'PRIVILEGED_UPPER_BOUND' },
  D_PRIVILEGED_RELATIONS: { spec: add(['PRIV']), fitRows: 'DEV all', class: 'PRIVILEGED_UPPER_BOUND' },
});

export const SEED_PLAN = deepFreeze({
  id: 'STAGE3G3_SEALED_SEEDS_V1', declared: { HOLDOUT: [5021], OOD: [5031] }, reservedForLaterStage3G: { HOLDOUT: [5022, 5023], OOD: [5032, 5033] },
  sizes: { HOLDOUT: 6000, OOD: 6000 }, levels: { HOLDOUT: [0, 1, 2, 3, 4, 5], OOD: [6, 7] },
  priorSeedSpaces: [...G12_SEED_PLAN.priorSeedSpaces, ...G12_SEED_PLAN.declared.HOLDOUT, ...G12_SEED_PLAN.declared.OOD, ...G12_SEED_PLAN.reservedForLaterStage3G.HOLDOUT, ...G12_SEED_PLAN.reservedForLaterStage3G.OOD],
  exclusion: 'reject any record, world or topology hash claimed by the 80,000-row Stage 3F lineage, the 12,000 Stage 3G.1/3G.2 sealed rows, or earlier Stage 3G.3 admissions',
  admission: 'P.1D benchmark-bound corpusRecord, canonical seed > level > horizon > objectives > roles > shape order; every 25th candidate carries D4 evidence',
});
export const SEED_PLAN_HASH = sha256(SEED_PLAN);

export const MATERIALITY = deepFreeze({
  MATERIAL_TOP1_GAIN,
  rule: 'difference >= MATERIAL_TOP1_GAIN, bootstrap 95% CI lower bound > 0, and normalised regret not worse: the frozen Stage 3F.6-P.1A-SYM / Stage 3G materialGain rule',
  bothPartitions: 'every hypothesis needs materiality on STAGE3G3_HOLDOUT AND STAGE3G3_OOD; a HOLDOUT-only effect never justifies transition prediction',
  integrity: 'NEW feature and prediction D4 equivariance = 1, identity-renaming invariance = 1, candidate-order invariance = 1 for every scorer and diagnostic, temporal-feature D4 equivariance = 1, rollout fidelity = 1, one-step fidelity = 1, privileged-key scan clean, poisoning probe = 1',
  NEAR_TIE_NREG: 0.05,
  LABEL_STRUCTURE_SHARE: 0.5,
});

export const DECISION_RULES = deepFreeze({
  H1_MULTI_STEP_TEMPORAL_MATERIAL: 'exists k in {2,3,4}: on PARTIAL_k rows of HOLDOUT and of OOD, D_Hk - NEW_LINEAR is MATERIAL and D_Hk - BEST_CAPACITY is MATERIAL, and D_Hk - NEW_LINEAR has CI lower bound > 0 on the UNIQUE_OPTIMAL PARTIAL_k rows (multiple-optimal control)',
  MULTI_STEP_TEMPORAL_VALUE_OOD_STABLE: 'some k material on HOLDOUT (the H1 criteria) is also material on OOD',
  H2_RANKING_CAPACITY_MATERIAL: 'BEST_CAPACITY - NEW_LINEAR MATERIAL on HOLDOUT and OOD',
  H3_OPTION_PRESERVATION_MATERIAL: 'D_OPTION - NEW_LINEAR MATERIAL on HOLDOUT and OOD',
  H3_OPTION_OVER_RAW_NEXT_STATE: 'reported: D_OPTION - D_ONE_STEP',
  H4_RETREAT_SPECIFIC_SUPPORTED: 'the retreat classification includes ACTION_SEMANTICS_LIMITED or RANKING_LIMITED',
  RETREAT_CLASSIFICATION: 'on RETREAT_OPTIMAL rows (both partitions): RANKING_LIMITED if BEST_CAPACITY - NEW_LINEAR MATERIAL; TEMPORAL_LIMITED if some D_Hk - NEW_LINEAR MATERIAL on its PARTIAL_k rows; OPTION_PRESERVATION_LIMITED if D_OPTION - NEW_LINEAR MATERIAL; ACTION_SEMANTICS_LIMITED if D_PRIVILEGED_RELATIONS - NEW_LINEAR MATERIAL; LABEL_STRUCTURE_LIMITED if >= LABEL_STRUCTURE_SHARE of NEW_LINEAR residual weight is near-tie (normalised regret <= NEAR_TIE_NREG); one class -> that class, several -> MIXED, none -> UNRESOLVED',
  H5_MULTIPLE_OPTIMAL_MATERIAL: 'OPTIMAL_SET_HIT - TOP1_EXACT of NEW_LINEAR >= MATERIAL_TOP1_GAIN on HOLDOUT and OOD (exact-action evaluation would count harmless tie choices as failures). Reported alongside: Stage 3G.1/3G.2 measured optimal-set hit, so its residual is not inflated by label ties',
  H6_MIXED: 'two or more of H1-H5 supported',
  TRANSITION_PREDICTION_NOW_JUSTIFIED: 'H1_MULTI_STEP_TEMPORAL_MATERIAL (which already requires HOLDOUT and OOD, the ranking-capacity control and the multiple-optimal control)',
  WORLD_MODEL_WORK_NOW_JUSTIFIED: 'TRANSITION_PREDICTION_NOW_JUSTIFIED and, for a material k, D_Hk - D_OPTION and D_Hk - D_TEMPORAL_FEATURES are both MATERIAL on PARTIAL_k rows of HOLDOUT and OOD (the value is not captured by deterministic horizon features or option-preservation state)',
  READY_FOR_3G_COUNTERFACTUAL_PREDICTION: 'TRANSITION_PREDICTION_NOW_JUSTIFIED',
  RESIDUAL_ATTRIBUTION: 'for each model X: RESOLVED = sum over rows of max(0, hit_X - hit_NEW) / NEW residual weight, BROKEN = sum max(0, hit_NEW - hit_X) / the same, NET = RESOLVED - BROKEN. Replaces the Stage 3G.1/3G.2 single-column separation taxonomy, which was permissive (it counted any differing column as "represented")',
});

export const DECISION_EVALUATION = deepFreeze({
  contract: 'SENTINEL_DECISION_EVALUATION_CONTRACT_V1 (frozen by Stage 3F; unchanged); no world model is ranked',
  CAD_DIAGNOSTIC: 'share of NEW_LINEAR residual weight where T_k strictly ranks every optimal candidate above every wrongly chosen one (k = 1..5), on all rows and on PARTIAL_k rows',
  CR_DIAGNOSTIC: 'NEW_LINEAR regret - D_Hk regret on PARTIAL_k rows (absolute and relative)',
  DDV_DIAGNOSTIC: 'D_Hk - NEW_LINEAR top-1 on PARTIAL_k rows and on all rows, labelled PRIVILEGED_UPPER_BOUND; never deployable DDV',
  FPE: 'not measured: no predictor is evaluated; the lifecycle provides RESOLVED_CONFIRMED / RESOLVED_REFUTED for future FPE accounting',
  TCA: 'not measured: no trust gate exists yet; lifecycle status and confidence are the future inputs',
});

export const METRICS = deepFreeze({
  OPTIMAL_SET_HIT: 'expected probability the chosen zero-cost candidate is in the oracle optimal set (uniform over tied top scores) - the Stage 3G FREE_ACTION_TOP1',
  TOP1_EXACT: 'expected probability the chosen candidate is the oracle representative (the optimal zero-cost candidate with the smallest canonical-frame identity)',
  REGRET: 'expected oracle regret', NORMALIZED_REGRET: 'regret / max regret of the state', MULTI_OPTIMAL_RATE: 'share of rows with two or more optimal zero-cost candidates',
  NEAR_TIE_SHARE: 'share of residual weight whose normalised regret <= NEAR_TIE_NREG',
});

export const PLAN = deepFreeze({
  stage: 'STAGE_3G_3_PREDICTION_LIFECYCLE_AND_MULTI_STEP_RESIDUAL_ATTRIBUTION',
  question: 'Are the remaining free-action errors caused by missing multi-step temporal information, or by ranking / utility / option-preservation / retreat-specific logic / label structure?',
  role: 'LIFECYCLE_CONTRACT_PLUS_DIAGNOSTIC_MEASUREMENT',
  notInScope: ['world-model tournament', 'learned world model', 'JEPA', 'Router redesign', 'Nexus redesign', 'Expert #10', 'authority change', 'retreat repair', 'counterfactual prediction', 'Stage 3F or Stage 3G.1/3G.2 changes'],
  inheritance: { stage3f: STAGE3F_INHERITANCE, stage3g12: STAGE3G12_INHERITANCE },
  lifecycle: { id: PREDICTION_LIFECYCLE_ID, hash: PREDICTION_LIFECYCLE_SCHEMA_HASH, staleRules: STALE_RULES, invalidationRules: INVALIDATION_RULES },
  hypotheses: HYPOTHESES, horizons: HORIZONS, blocks: BLOCKS, scorers: SCORERS, diagnostics: DIAGNOSTICS,
  eligibility: 'unchanged Stage 3F.6-P.1A-SYM / Stage 3G: a zero-cost action is legal and optimal; candidates are the legal zero-cost actions of the symmetric surface',
  partitions: { DEV: 'P.1D DEV: every fit', CAL: 'P.1D CAL: MLP width and BEST_CAPACITY selection only', STAGE3G3_HOLDOUT: 'PRIMARY sealed, seed 5021, levels 0-5 canonical order', STAGE3G3_OOD: 'PRIMARY sealed, seed 5031, levels 6-7' },
  groups: {
    retreat: ['MOVE_ONLY', 'RETREAT_ONLY', 'MOVE_PLUS_RETREAT_AVAILABLE', 'RETREAT_OPTIMAL', 'RETREAT_SUBOPTIMAL', 'OPTIMAL_TYPES_MOVE_PLUS_RETREAT'],
    labelStructure: ['UNIQUE_OPTIMAL', 'MULTIPLE_OPTIMAL'], horizon: ['HORIZON_ALIGNED', 'HORIZON_DEPENDENT', 'labelHorizon 1/3/5/8', 'stratum H0-H4'],
  },
  metrics: METRICS, materiality: MATERIALITY, decisionRules: DECISION_RULES, decisionEvaluation: DECISION_EVALUATION,
  seeds: { plan: SEED_PLAN, hash: SEED_PLAN_HASH },
  notPermitted: ['post-sealed tuning', 'architecture selection on sealed data', 'presenting any PRIVILEGED_UPPER_BOUND as deployable', 'exposing simulator futures to a runtime-facing contract'],
  reproducibility: { numerics: 'SENTINEL_CANONICAL_NUMERICS_V1 via scripts/reproducibility/run-canonical.mjs', checkMode: 'CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE', reproductions: '2 x --check and a fresh-clone reproduction' },
  amendmentProcess: 'a harness-only defect found after the sealed run is fixed by a disclosed amendment binding the before/after bytes of the changed file and requiring the scientific sections to equal the preserved first run exactly',
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const PLAN_HASH = sha256(PLAN);
