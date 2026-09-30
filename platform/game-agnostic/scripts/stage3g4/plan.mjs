/* STAGE_3G_4 — pre-registered plan: level-stratified temporal replication (constants only; plan-cli.mjs writes/checks it).
 * Implements docs/STAGE3G4_SPECIFICATION.md. Fixed and committed with the open-phase report and the open fit-set manifest
 * BEFORE any sealed row exists.
 */
import { deepFreeze, sha256 } from '../../src/core/determinism.js';
import { MATERIAL_TOP1_GAIN } from '../../src/stage3f/free-action-sufficiency-v1.js';
import { OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH, OBS_OPTION_COLUMNS } from '../../src/stage3g/observable-option-features-v1.js';
import { PREDICTION_LIFECYCLE_SCHEMA_HASH } from '../../src/stage3g/prediction-lifecycle-v1.js';
import { NEW_SPECS as G12_NEW_SPECS, STAGE3F_INHERITANCE } from '../stage3g/plan.mjs';
import { DIAGNOSTICS as G3_DIAGNOSTICS, SCORERS as G3_SCORERS, SEED_PLAN as G3_SEED_PLAN, STAGE3G12_INHERITANCE } from '../stage3g3/plan.mjs';
import { SEARCH_DEPTHS_ALL, SEARCH_DEPTH_SUBSAMPLE } from './evidence.mjs';

export const OUT = 'artifacts/stage3g4-level-replication';
export const PLAN_PATH = `${OUT}/stage3g4-analysis-plan.json`;
export const OPEN_REPORT_PATH = `${OUT}/stage3g4-open-phase-report.json`;
export const FIT_PATH = `${OUT}/fit-set.jsonl.gz`;
export const FIT_MANIFEST_PATH = `${OUT}/fit-set-manifest.json`;
export const SEALED_PATH = `${OUT}/sealed-partitions.jsonl.gz`;
export const SEALED_MANIFEST_PATH = `${OUT}/sealed-partitions-manifest.json`;
export const RESULT_PATH = `${OUT}/stage3g4-certification-result.json`;
export const SPEC_PATH = 'docs/STAGE3G4_SPECIFICATION.md';

export const STAGE3G3_INHERITANCE = deepFreeze({
  CERTIFICATE_FILE: 'artifacts/stage3g3-temporal-attribution/stage3g3-certification-result.json',
  OPEN_REPORT_FILE: 'artifacts/stage3g3-temporal-attribution/stage3g3-open-phase-report.json',
  CERTIFICATION_HASH: '6f58040133deae625e61c636f881b9283da62458581387b0dbe9afee6b4a8c69',
  CERTIFICATION_COMMIT: '3a878c1', FREEZE_COMMIT: '20e8bba', AMENDMENT_COMMIT: 'f606f80',
  PREDICTION_LIFECYCLE_IMPLEMENTED: true, TRANSITION_PREDICTION_NOW_JUSTIFIED: false, WORLD_MODEL_WORK_NOW_JUSTIFIED: false,
  LIFECYCLE_SCHEMA_HASH: PREDICTION_LIFECYCLE_SCHEMA_HASH,
  PROTECTED_PATHS: ['artifacts/stage3g3-temporal-attribution/**', 'docs/STAGE3G3_*', 'scripts/stage3g3/**', 'src/stage3g/prediction-lifecycle-v1.js', 'tests/stage3g3-*'],
});

export const LEVELS = deepFreeze([0, 1, 2, 3, 4, 5, 6, 7]);
export const BANDS = deepFreeze({ LOW: [0, 1, 2], MID: [3, 4, 5], HIGH: [6, 7] });
export const HORIZON_BANDS = deepFreeze(['H0', 'H1', 'H2', 'H3', 'H4']);
export const SEED_PLAN = deepFreeze({
  id: 'STAGE3G4_LEVEL_BALANCED_SEEDS_V1',
  families: { A: 5022, B: 5032 },
  fit: 6011,
  stillReserved: { stage3g3: [5023, 5033] },
  provenance: 'Stage 3G.3 reserved 5022-5023 (HOLDOUT) and 5032-5033 (OOD) "for later Stage 3G"; Stage 3G.4 re-declares 5022 and 5032 as seed families covering every level, so partition identity = seed family, crossed with level. 6011 is a new open fit seed.',
  quotas: { sealedPerFamilyLevelBand: 190, fitPerLevelBand: 60 },
  levels: LEVELS, horizonBands: HORIZON_BANDS,
  priorSeedSpaces: [...G3_SEED_PLAN.priorSeedSpaces, ...G3_SEED_PLAN.declared.HOLDOUT, ...G3_SEED_PLAN.declared.OOD],
  exclusion: 'reject any record, world or topology hash claimed by the 80,000-row Stage 3F lineage, the 12,000 Stage 3G.1/3G.2 sealed rows, the 12,000 Stage 3G.3 sealed rows, the fit set (for sealed rows), or earlier admissions',
  admission: 'P.1D benchmark-bound corpusRecord; for each (seed, level, horizon band) cell, combinations in canonical objectives > roles > shape order until the quota is admitted; every 25th candidate carries D4 evidence',
  depth3Subsample: 'every 16th eligible row of each sealed partition (in stored order)',
});
export const SEED_PLAN_HASH = sha256(SEED_PLAN);

const add = (blocks) => ({ main: [...G12_NEW_SPECS.G_PATH_MAIN.main, ...blocks], interact: G12_NEW_SPECS.G_PATH_MAIN.interact });
export const PRIMARY_MODELS = deepFreeze({
  reused: {
    NEW_LINEAR: G3_SCORERS.NEW_LINEAR.spec, NEW_INTERACTION: G3_SCORERS.NEW_INTERACTION.spec,
    D_ONE_STEP: G3_DIAGNOSTICS.D_ONE_STEP, D_H2: G3_DIAGNOSTICS.D_H2, D_H3: G3_DIAGNOSTICS.D_H3, D_H4: G3_DIAGNOSTICS.D_H4, D_OPTION: G3_DIAGNOSTICS.D_OPTION,
    rule: 'refitted deterministically on the Stage 3G.3 DEV rows; each must reproduce its Stage 3G.3 model hash (the Stage 3G.3 fitted models, byte for byte)',
  },
  new: {
    D_OBS_OPTION: { spec: add(['OBS_OPTION']), fitRows: 'Stage 3G.3 DEV (all)', class: 'DEPLOYABLE (E1 observable option features)' },
    D_SEARCH_D1: { spec: add(['SEARCH1']), fitRows: 'Stage 3G.3 DEV PARTIAL_2', class: 'PRIVILEGED (known-model bounded search, depth 1)' },
    D_SEARCH_D2: { spec: add(['SEARCH2']), fitRows: 'Stage 3G.3 DEV PARTIAL_3', class: 'PRIVILEGED (known-model bounded search, depth 2)' },
  },
  planners: {
    PLANNER_D0: 'argmax over candidates of search[0] (immediate scalar), uniform over ties; no fitting',
    PLANNER_D1: 'argmax of search[1]', PLANNER_D2: 'argmax of search[2]', PLANNER_D3: 'argmax of search[3], depth-3 subsample only',
  },
  primaryHorizon: 'H3 (the best Stage 3G.3 horizon); H2 and H4 reported and eligible for the transition rule',
});
export const SECONDARY_MODELS = deepFreeze({
  NEW_LINEAR_LB: { spec: G12_NEW_SPECS.G_PATH_MAIN, fitRows: 'fit set (seed 6011, levels 0-7) all' },
  D_H3_LB: { spec: G3_DIAGNOSTICS.D_H3.spec, fitRows: 'fit set PARTIAL_3' },
  D_OBS_OPTION_LB: { spec: add(['OBS_OPTION']), fitRows: 'fit set all' },
  role: 'SECONDARY: separates level scaling from level-0/1 extrapolation; never decides a primary conclusion',
});

export const RULES = deepFreeze({
  MATERIAL: `difference >= ${MATERIAL_TOP1_GAIN}, bootstrap 95% CI lower bound > 0, normalised regret not worse (the frozen materialGain rule)`,
  PARTIAL: 'a D_Hk / D_SEARCH / PLANNER comparison at total depth k uses only rows with label horizon h where h + 1 > k (Stage 3G.3 label-leak guard)',
  PER_LEVEL: 'descriptive, independent bootstrap CIs per level per family and pooled',
  SLOPE: 'primary trend statistic: n-weighted least-squares slope over levels 0-7 of the pooled (both families) per-level gain D_H3 - NEW_LINEAR on PARTIAL_3 rows; 95% CI from 2000 deterministic bootstrap resamples drawn within each level',
  SCALING: {
    MONOTONICALLY_INCREASES: 'slope CI lower bound > 0 and pooled band gains LOW <= MID <= HIGH',
    HAS_THRESHOLD: 'some band is MATERIAL in both families while every lower band is not; THRESHOLD = the lowest such band',
    IS_NON_MONOTONIC: 'some band is MATERIAL in both families while a higher band is not, or the pooled band gains are not ordered and the slope CI contains 0',
    IS_LEVEL_INDEPENDENT: 'slope CI contains 0 and the pooled band gains lie within 0.02 of each other',
    INSUFFICIENT_EVIDENCE: 'none of the above',
    order: ['MONOTONICALLY_INCREASES', 'HAS_THRESHOLD', 'IS_NON_MONOTONIC', 'IS_LEVEL_INDEPENDENT', 'INSUFFICIENT_EVIDENCE'],
  },
  PARTITION_EFFECT: 'family A - family B difference in the primary gain (unpaired bootstrap CI), per level, at HIGH, and pooled over levels; MATERIAL if |difference| >= 0.05 and the CI excludes 0. LEVEL_EFFECT_MEASURED = slope estimated with a CI; PARTITION_EFFECT_MEASURED = the family difference estimated at every level (the design crosses family with level, so both are identified)',
  H1_LEVEL_SCALING: 'SCALING includes MONOTONICALLY_INCREASES',
  H2_THRESHOLD_EFFECT: 'SCALING includes HAS_THRESHOLD',
  H3_PARTITION_ARTIFACT: 'the HIGH-band gain is MATERIAL in family B and not in family A, or the pooled / HIGH partition effect is MATERIAL',
  H4_RETREAT_LEVEL_INTERACTION: 'the bootstrap slope over levels of the retreat-optimal temporal gain (D_H3 - NEW_LINEAR on retreat-optimal PARTIAL_3 rows) or of the retreat-optimal privileged option gain has a CI lower bound > 0',
  H5_NO_STABLE_TEMPORAL_EFFECT: 'no band has D_H3 - NEW_LINEAR MATERIAL in both families',
  TRANSITION_PREDICTION_NOW_JUSTIFIED: 'exists k in {2,3,4} with ALL of: (1) D_Hk - NEW_LINEAR MATERIAL on PARTIAL_k rows in MID and HIGH (2) in both families (3) partition effect of D_Hk not MATERIAL at HIGH nor pooled (4) every integrity check = 1 (5) D_Hk - D_OBS_OPTION MATERIAL in MID and HIGH in both families (6) relative regret reduction >= 0.20 with normalised-regret difference CI upper bound < 0, in MID and HIGH in both families',
  OBSERVABLE_OPTION_FEATURES_SUFFICIENT: 'in every (MID/HIGH, family) cell where some D_Hk - NEW_LINEAR is MATERIAL, D_Hk - D_OBS_OPTION is not MATERIAL; false if D_OBS_OPTION captures none of them; NOT_TESTABLE when no such cell exists',
  DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT: 'in every (MID/HIGH, family) cell where D_H2 or D_H3 - NEW_LINEAR is MATERIAL, D_H2 - D_SEARCH_D1 (resp. D_H3 - D_SEARCH_D2) is not MATERIAL; NOT_TESTABLE when no such cell exists. PLANNER_D0..D3 reported alongside (D3 on the subsample)',
  WORLD_MODEL_WORK_NOW_JUSTIFIED: 'TRANSITION_PREDICTION_NOW_JUSTIFIED and OBSERVABLE_OPTION_FEATURES_SUFFICIENT is not true and DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT is not true',
  READY_FOR_3G_COUNTERFACTUAL_PREDICTION: 'TRANSITION_PREDICTION_NOW_JUSTIFIED',
  TEMPORAL_VALUE_MATERIAL_MID_LEVEL: 'some k: D_Hk - NEW_LINEAR MATERIAL on PARTIAL_k MID rows in both families', TEMPORAL_VALUE_MATERIAL_HIGH_LEVEL: 'likewise for HIGH',
  TEMPORAL_VALUE_REPLICATED: 'some band has D_H3 - NEW_LINEAR MATERIAL in both families',
  PARTITION_CONFOUND_RESOLVED: 'LEVEL_EFFECT_MEASURED and PARTITION_EFFECT_MEASURED (identification, whatever the sign)',
  ORACLE_CRITICAL_PATH: 'answered as: does the evidence put temporal modelling on the critical path? true only if TRANSITION_PREDICTION_NOW_JUSTIFIED',
});

export const PLAN = deepFreeze({
  stage: 'STAGE_3G_4_LEVEL_STRATIFIED_TEMPORAL_REPLICATION', specification: SPEC_PATH,
  question: 'Does decision-relevant temporal value increase with curriculum level, independent of partition identity?',
  role: 'REPLICATION_AND_STRATIFICATION_ONLY',
  notInScope: ['learned world model', 'world-model tournament', 'Router / Nexus / Oracle / Prime redesign', 'Expert #10', 'authority change', 'retreat repair', 'changes to Stage 3F, 3G.1/3G.2 or 3G.3'],
  inheritance: { stage3f: STAGE3F_INHERITANCE, stage3g12: STAGE3G12_INHERITANCE, stage3g3: STAGE3G3_INHERITANCE },
  hypotheses: {
    H1_LEVEL_SCALING: 'multi-step temporal value increases with curriculum level', H2_THRESHOLD_EFFECT: 'temporal value becomes material only above a complexity threshold',
    H3_PARTITION_ARTIFACT: 'the Stage 3G.3 OOD gain is partition-specific, not a level effect', H4_RETREAT_LEVEL_INTERACTION: 'the retreat residual becomes more temporal / option-dependent at higher levels',
    H5_NO_STABLE_TEMPORAL_EFFECT: 'temporal gains do not replicate after level balancing' },
  frozenDiagnostics: 'ONE_STEP, H2, H3, H4, privileged OPTION and BEST_CAPACITY exactly as Stage 3G.3 (definitions, rollout semantics, scalarisation, materiality, label-leak guard, fitted weights)',
  observableOptionFeatures: { schemaHash: OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH, columns: OBS_OPTION_COLUMNS },
  boundedSearch: { definition: 'exhaustive known-model search: candidate immediate scalar + max cumulative FORGE_REWARD_V2 scalar over all sequences of d further legal symmetric-surface actions; PRIVILEGED', depthsAll: SEARCH_DEPTHS_ALL, depthSubsample: SEARCH_DEPTH_SUBSAMPLE },
  models: { primary: PRIMARY_MODELS, secondary: SECONDARY_MODELS },
  seeds: { plan: SEED_PLAN, hash: SEED_PLAN_HASH }, levels: LEVELS, bands: BANDS, rules: RULES,
  dryRun: 'certify.mjs --dry-run --out=<path outside the repository> runs every code path with the open fit rows standing in for the sealed families (alternate rows -> A / B, so every level is exercised in both); no sealed row is read; required before the sealed run; never writes a tracked file',
  amendmentProcess: 'a harness-only defect after the sealed run is fixed by a disclosed amendment binding the certifier\'s before/after bytes; if the first run produced a certificate its scientific sections must be reproduced exactly',
  reproducibility: { numerics: 'SENTINEL_CANONICAL_NUMERICS_V1 via scripts/reproducibility/run-canonical.mjs', checkMode: 'CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE', reproductions: '2 x --check and a fresh-clone reproduction' },
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const PLAN_HASH = sha256(PLAN);
