import { deepFreeze, sha256 } from '../../src/core/determinism.js';
import { ACTION_MODEL_SCHEMA, ACTION_MODEL_SCHEMA_HASH } from '../../src/stage3g/deployable-action-model-v1.js';
import { SCORERS } from '../stage3g3/plan.mjs';
import { STAGE3G3_INHERITANCE, PLAN as G4PLAN } from '../stage3g4/plan.mjs';
export const OUT = 'artifacts/stage3g5-observable-model-search';
export const PLAN_PATH = `${OUT}/stage3g5-analysis-plan.json`;
export const OPEN_REPORT_PATH = `${OUT}/stage3g5-open-phase-report.json`;
export const FIT_PATH = `${OUT}/fit-set.jsonl.gz`;
export const FIT_MANIFEST_PATH = `${OUT}/fit-set-manifest.json`;
export const SEALED_PATH = `${OUT}/sealed-partitions.jsonl.gz`;
export const SEALED_MANIFEST_PATH = `${OUT}/sealed-partitions-manifest.json`;
export const RESULT_PATH = `${OUT}/stage3g5-certification-result.json`;
export const SPEC_PATH = 'docs/STAGE3G5_SPECIFICATION.md';
export const LEVELS = deepFreeze([0,1,2,3,4,5,6,7]);
export const HORIZON_BANDS = deepFreeze(['H0','H1','H2','H3','H4']);
export const BANDS = deepFreeze({ LOW:[0,1,2], MID:[3,4,5], HIGH:[6,7] });
export const SEED_PLAN = deepFreeze({ families: { A:7021, B:7031 }, fit:6012, stillReserved:{ stage3g3:[5023,5033] },
  priorSeedSpaces:[...G4PLAN.seeds.plan.priorSeedSpaces,5022,5032,6011], quotas:{ fitPerLevelBand:60, sealedPerFamilyLevelBand:190 },
  admission:'Unmodified corpusRecord; canonical objectives > roles > shape order, 190 admitted per (family, level, H0-H4) cell; every 25th candidate D4 audited. Exclude record/world/topology hashes of all prior stages and open fits.',
  ood:'B is independent seed-family OOD crossed with all levels; known compositions. No claim of unseen-mechanism/structural OOD.' });
export const SEED_PLAN_HASH = sha256(SEED_PLAN);
export const SPECS = deepFreeze({ linear:SCORERS.NEW_LINEAR.spec, interaction:SCORERS.NEW_INTERACTION.spec });
export const RULES = deepFreeze({
  material:'Paired optimal-set-hit gain >= 0.05; deterministic 2000-resample bootstrap 95% lower CI > 0; normalised regret not worse (frozen materialGain).',
  primary:'LEVEL_BALANCED_LINEAR; interaction is a fixed capacity diagnostic, no selection on sealed data, no nonlinear fit/promotion.',
  matched:'Each d comparison uses label horizon h with h+1 > d+1. D2 primary on PARTIAL_3; D3 secondary on PARTIAL_4; ALL unguarded results descriptive only. Depths 0-2 on all eligible rows; matched depth3 on every 16th eligible row per family/open fit, fixed before sealing.',
  horizonDependent:'PARTIAL_3 rows with at least one optimal candidate absent from immediate scalar top set; audit label only.',
  highGap:'LB - frozen material in HIGH in each family AND no material KNOWN_D2 - LB on guarded HIGH in either family.',
  primaryReplicated:'LB - frozen material in HIGH in both families with significant normalised-regret decrease.',
  sufficient:'no material KNOWN_D2 - DEPLOYABLE_D2 in ALL, MID, HIGH or RETREAT in either independent family; requires at least 100 guarded retreat rows/family, otherwise NOT_TESTABLE.',
  environmentMaterial:'KNOWN_D2 - DEPLOYABLE_D2 material in same ALL/MID/HIGH/RETREAT stratum in A and B AND KNOWN_D2 - NO_ENV_D2 (same known scorer, only dynamics changed) material in same stratum in both families with >=20% relative regret reduction, normalised regret CI upper <0 and n>=100 per family. Raw deployable/known gap alone is an upper bound, not causal attribution.',
  ood:'environmentMaterial gate replicates in seed-family B; does not demonstrate unseen-mechanism OOD.',
  retreatClassification:'Coverage flag: LB-frozen material on RETREAT both families. Action-model flag: NO_ENV_D2-DEPLOYABLE_D2 material both (private action/value/surface residual; attribution-qualified). Environment flag: matched dynamics gate on RETREAT both. One flag -> named limitation; multiple -> RETREAT_MIXED; none -> INSUFFICIENT_EVIDENCE. No retreat repair.',
  transition:'environmentMaterial and OOD_STABLE and deployable sufficient !== true and all integrity tests pass.',
  worldModel:'transition gate AND deterministic observable/action-search alternatives ruled out AND meaningful matched regret reduction in both families AND genuinely unavailable mechanisms. Navigation-only search cannot rule out all deterministic target-action alternatives; this final gate remains false.',
  deterministicAlternatives:'The conditional navigation-only continuation does not exhaust every deterministic target-action planner. Therefore learned-world-model need is NOT_ESTABLISHED in this stage even if the forecasting gate passes; run a full E1 action-surface sufficiency audit before a world-model claim.',
  oracle:'Temporal capability required only when transition gate passes; no evidence about existing Oracle expert fitness or architectural placement.',
  retreatSpecialist:'Environment value concentrated in retreat only if retreat gate passes AND NON_RETREAT has no replicated dynamics gap AND >=80% of positive paired raw regret reduction lies on retreat-optimal rows.',
  attribution:'HOSTILE_ATTACK and HAZARD_DAMAGE: leave-one-mechanism-out interventions at all steps, paired decisions/regret with fixed known scorer. SERVICE_REVERSAL/ENTITY_STATE_CHANGE/RESOURCE_STATE_CHANGE/OTHER: observational root event strata, co-occurring and non-additive; never causal credit. G5 audit is offline only.',
});
export const PLAN = deepFreeze({stage:'STAGE_3G_5_LEVEL_COVERAGE_AND_OBSERVABLE_MODEL_SEARCH', specification:SPEC_PATH,
  inheritance:{...G4PLAN.inheritance,stage3g4:{ CERTIFICATE_FILE:'artifacts/stage3g4-level-replication/stage3g4-certification-result.json', CERTIFICATION_HASH:'259195ba9c2d223010d8302579c665c67fd20b666f43b35c9ae539e6e70cb4c8', CERTIFICATION_COMMIT:'78de734' }},
  hypotheses:{H1_LEVEL_COVERAGE:'Full-curriculum fitting closes the high-level gap without future information.', H2_DEPLOYABLE_SEARCH:'Certified deterministic action effects capture most known-search value.', H3_ENVIRONMENT_DYNAMICS_VALUE:'The known/deployable gap bounds environment decision value; matched ablations isolate attribution.', H4_RETREAT_SPECIALIST:'Dynamics value is primarily retreat-optimal.', H5_NO_WORLD_MODEL_NEED:'If observable fitting/search closes residual, learned world-model work remains unjustified.'},
  seeds:SEED_PLAN, specs:SPECS, actionModel:ACTION_MODEL_SCHEMA, actionModelSchemaHash:ACTION_MODEL_SCHEMA_HASH,
  depths:[0,1,2,3], knownUpperBound:'Stage 3G.4 searchValues, unchanged; KNOWN_D2/D3 are level-balanced linear root features + relative privileged cumulative scalar; raw argmax planners also reported. Depth3 is every 16th eligible row; paired comparisons use exactly this same subsample.',
  deployableSearch:'Linear root features + bounded certified action-effect envelope. Unknown futures retained; conditional paths are not E1 successor-world facts.', rules:RULES,
  fitting:'Frozen Stage3G3_LINEAR refit on original DEV, hash must match; LB and every depth fit on fresh OPEN seed6012 L0-L7 with fixed logit settings (2000 iterations, lr.1, l2.001). No CAL tuning.',
  evaluationContract:{ FPE:'NOT_MEASURED: no environment predictor', CAD:'Weighted residual fraction where known D2 scalar strictly separates optimal from chosen incorrect candidates, privileged', CR:'paired raw/normalised regret and relative reduction', DDV:'Deployable scorer/search measured against LB; known-search comparisons PRIVILEGED_UPPER_BOUND', TCA:'NOT_MEASURED: no trust gate', key:'ENVIRONMENT_DYNAMICS_DECISION_VALUE' },
  freeze:'All evaluation source, schema, specification, tests, package scripts, plan, open report and fit manifest committed before sealed generation. Refuse second sealed generation/evaluation except read-only reproduction.',
  reproducibility:'Canonical numerics, full repository suites, all inherited checks, 2 x --check, fresh-clone fit+sealed payload rebuild and certificate check; no tracked writes in --check.',
  authority:{tier:'R0',canDispatch:false,canMutateLiveWorld:false,onlineLearningEnabled:false,promotedToLiveRuntime:false},
  scope:{worldModelTrained:false,stage3IStarted:false,oracleRedesigned:false,routerRedesigned:false,expert10Added:false,earlierConclusionsModified:false,retreatRepaired:false},
});
export const PLAN_HASH = sha256(PLAN);
