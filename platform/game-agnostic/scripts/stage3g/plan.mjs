/* STAGE_3G_1/3G_2 — the pre-registered analysis plan (constants only; scripts/stage3g-plan.mjs writes and checks it).
 *
 * Fixed and committed with the open-phase report BEFORE any sealed row exists: the inherited Stage 3F boundary, the three
 * Stage 3G schemas, the OLD and NEW representations, every model, control and diagnostic, the metrics, the materiality
 * threshold, the conclusion rules, the sealed seeds and the exclusion lineage.
 */
import { deepFreeze, sha256 } from '../../src/core/determinism.js';
import { EPISTEMIC_SCHEMA_HASH, EPISTEMIC_SCHEMA_ID, PROMOTION_RULES, CONTAMINATION_FLAGS, EPISTEMIC_CLASSES } from '../../src/stage3g/epistemic-provenance-v1.js';
import { OBSERVABLE_ENTITY_STATE_ID, OBSERVABLE_ENTITY_STATE_SCHEMA_HASH } from '../../src/stage3g/observable-entity-state-v1.js';
import { ACTION_SEMANTICS_ID, ACTION_SEMANTICS_SCHEMA_HASH, ENTITY_BLOCK_COLUMNS } from '../../src/stage3g/action-semantics-v1.js';
import { FREE_ACTION_REPRESENTATION_HASH, MATERIAL_TOP1_GAIN, SUFFICIENT_TOP1 } from '../../src/stage3f/free-action-sufficiency-v1.js';
import { MODEL_SPECS as P1ASYM_MODEL_SPECS, STAGE3F6P1ASYM_PLAN_HASH, STAGE3F6P1ASYM_STATE_FEATURES_HASH } from '../stage3f6p1asym-analysis-plan.mjs';

export const OUT = 'artifacts/stage3g-predictive-integrity';
export const PLAN_PATH = `${OUT}/stage3g-analysis-plan.json`;
export const OPEN_REPORT_PATH = `${OUT}/stage3g-open-phase-report.json`;
export const SEALED_PATH = `${OUT}/sealed-partitions.jsonl.gz`;
export const SEALED_MANIFEST_PATH = `${OUT}/sealed-partitions-manifest.json`;
export const RESULT_PATH = `${OUT}/stage3g-certification-result.json`;

/** The immutable Stage 3F inheritance (verified against the committed freeze and its certificate; never modified). */
export const STAGE3F_INHERITANCE = deepFreeze({
  STAGE3F_STATUS: 'FROZEN',
  FREEZE_FILE: 'artifacts/stage3f-freeze/stage3f-freeze.json',
  CERTIFICATE_FILE: 'artifacts/stage3f-freeze/stage3f-freeze-certification-result.json',
  STAGE3F_FREEZE_HASH: '41748ff68ff16e6a137b53b72eb7203cb62aa0e761bf15c19f7a13b73d4b79a9',
  STAGE3F_CERTIFICATION_HASH: '0fe5d3e24f71015b76f5997771f2474712d2764bc049fc2e90e0144f8d2a08ce',
  IMMUTABLE_FACTS_HASH: 'ab4d7f315f1de1b2a3fce7b6196880bddaf11444ed72274ae7b695e886e91a5b',
  FREEZE_COMMIT: 'b68a46f3d03e16a8caf7dceb611111cf10fbdce2',
  FREEZE_CERTIFICATION_COMMIT: '7600e1fe9e5ff9a69f2070bd4d931e816b52922f',
  FACTS: {
    RESOURCE_SHORTCUT_DEPENDENT: true, NEXUS_V1_REPRESENTATION_BLOCKED: true, NEXUS_V1_POLICY_LIMITED: true, NEXUS_V2_SHORTCUT_DEPENDENT: true,
    GENUINE_RELATIONAL_VALUE_MEASURED: false, EXPERT_COMPLEMENTARITY_EXISTS: true, EXPERT_COMPLEMENTARITY_ROUTABLE: false, ROUTER_VALUE_MATERIAL: false,
    ROUTER_2_0_JUSTIFIED: false, RISK_SIGNAL_VALUE_MATERIAL: false, DECISION_RULE_VALUE_MATERIAL: false, STATE_REPRESENTATION_SUFFICIENT: false,
    SPATIAL_STATE_REQUIRED: true, ACTION_SEMANTICS_REQUIRED: true, TRANSITION_PREDICTION_REQUIRED: false, POLICY_QUALITY_PRIMARY_BOTTLENECK: true,
    FALSE_SELECTION_HARM_ACCEPTABLE: false, AUTHORITY: 'R0',
  },
  rule: 'Stage 3G reads these; it never rewrites a Stage 3F artifact, certificate, hash, fact, the Decision Evaluation Contract, authority or the expert roster. A Stage 3G result that bears on a frozen fact is reported as new Stage 3G evidence, never as an edit of the fact.',
});

/** P.1A-SYM certified bindings the OLD representation must reproduce exactly. */
export const OLD_BINDING = deepFreeze({
  certificationHash: '84770670baeb1502142e12d24a12d03763c0a97c22e80acc53013ecb98871fbb', planHash: STAGE3F6P1ASYM_PLAN_HASH,
  representationHash: FREE_ACTION_REPRESENTATION_HASH, stateFeaturesHash: STAGE3F6P1ASYM_STATE_FEATURES_HASH,
  headline: 'SC_GEOMETRY_MAIN', modelHash: 'db686ef85afc2be57f21eb3ebca088517b2a16e6f3bf6cee7dbc00faa842374d',
  privilegedModelHash: '206857de49aba3bef982c886283f37cd99f88d862135daad81688dbde8748de6',
  freshContentHash: '8fde1f1245849e88b941044788d3a7cebe6b930837dce2e7b074a1c461c63840',
  certifiedTop1: { FRESH_HOLDOUT: 0.375648, FRESH_OOD: 0.294442 }, certifiedPrivilegedTop1: { FRESH_HOLDOUT: 0.805795, FRESH_OOD: 0.915498 },
});

/** Representation blocks. TYPE/CANDIDATE/GEOMETRY/PRIV/ABS/HIDDEN/ONESTEP are the Stage 3F.6-P.1A-SYM blocks, unchanged. */
export const BLOCKS = deepFreeze({
  TYPE: 'P.1A-SYM deployable: declared action type', CANDIDATE: 'P.1A-SYM deployable: RETREAT alignment and local traversability',
  GEOMETRY: 'P.1A-SYM deployable: destination vs grid centre/border',
  GM: `Stage 3G observable entity block, Manhattan geometry: ${ENTITY_BLOCK_COLUMNS.join(', ')}`,
  GP: `Stage 3G observable entity block, observed-terrain path geometry: ${ENTITY_BLOCK_COLUMNS.join(', ')}`,
  PRIV: 'P.1A-SYM privileged kernel relations (UNAVAILABLE diagnostic)', ONESTEP: 'simulated one-step immediate scalar (FUTURE_STATE diagnostic)',
  ABS: 'presented absolute direction (NON_EQUIVARIANT control)', HIDDEN: 'hidden base-frame direction (ORACLE_ONLY control)',
});
export const OLD_SPEC = P1ASYM_MODEL_SPECS.SC_GEOMETRY_MAIN;
/** NEW variants; CAL selects one (highest CAL top-1; ties within 1e-9 -> fewer columns). */
export const NEW_SPECS = deepFreeze({
  G_MANHATTAN_MAIN: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GM'], interact: ['TYPE'], role: 'NEW_VARIANT' },
  G_PATH_MAIN: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GP'], interact: ['TYPE'], role: 'NEW_VARIANT' },
  G_PATH_INTERACT: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GP'], interact: ['TYPE', 'GP'], role: 'NEW_VARIANT' },
});
/** Reference models on OLD: the Stage 3F privileged and one-step diagnostics, re-fitted identically. */
export const OLD_REFERENCE_SPECS = deepFreeze({
  OLD_PRIVILEGED: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'PRIV'], interact: ['TYPE'], class: 'UNAVAILABLE', role: 'GAP_REFERENCE (Stage 3F D_PRIVILEGED_RELATIONS)' },
  OLD_ONE_STEP: { main: ['TYPE', 'CANDIDATE', 'GEOMETRY', 'ONESTEP'], interact: ['TYPE'], class: 'FUTURE_STATE_REQUIRED', role: 'Stage 3F D_ONE_STEP' },
});
/** Diagnostics: the CAL-selected NEW spec plus these main-effect blocks. Never headline. */
export const NEW_DIAGNOSTICS = deepFreeze({
  D_NEW_PLUS_PRIVILEGED: { add: ['PRIV'], class: 'UNAVAILABLE', question: 'does privileged kernel geometry still add anything once the observable entity state is present?' },
  D_NEW_PLUS_ONE_STEP: { add: ['ONESTEP'], class: 'FUTURE_STATE_REQUIRED', question: 'would a one-step successor prediction add material value on top of the new representation (transition prediction)?' },
  D_NEW_PLUS_PRIVILEGED_ONE_STEP: { add: ['PRIV', 'ONESTEP'], class: 'UNAVAILABLE+FUTURE_STATE_REQUIRED', question: 'both' },
  D_NEW_PLUS_ABSOLUTE_DIRECTION: { add: ['ABS'], class: 'NON_EQUIVARIANT', question: 'orientation shortcut control' },
  D_NEW_PLUS_HIDDEN_ORIENTATION: { add: ['HIDDEN'], class: 'ORACLE_ONLY', question: 'how much does the hidden generator orientation still buy?' },
});

export const SEED_PLAN = deepFreeze({
  id: 'STAGE3G_SEALED_SEEDS_V1',
  declared: { HOLDOUT: [4021], OOD: [4031] },
  reservedForLaterStage3G: { HOLDOUT: [4022, 4023], OOD: [4032, 4033] },
  sizes: { HOLDOUT: 6000, OOD: 6000 }, levels: { HOLDOUT: [0, 1, 2, 3, 4, 5], OOD: [6, 7] },
  priorSeedSpaces: [1, 2, 3, 11, 201, 202, 203, 211, 401, 402, 403, 411, 601, 602, 603, 611, 801, 802, 803, 811, 1001, 1002, 1003, 1011,
    2001, 2002, 2003, 2011, 2012, 2013, 2021, 2022, 2023, 2031, 2032, 2033, 3021, 3022, 3023, 3031, 3032, 3033],
  provenance: 'every Stage 3F declared seed is consumed (D-SYM used the last, 3023/3033); Stage 3G declares a new, disjoint seed space',
  exclusion: 'reject any record, world or topology hash claimed by P.1D, T-SYM, P.1A-SYM, P.1-SYM, W-SYM, D-SYM (80,000 rows) or earlier Stage 3G admissions',
  admission: 'P.1D benchmark-bound corpusRecord, canonical seed > level > horizon > objectives > roles > shape order; every 25th candidate carries D4 evidence',
});
export const SEED_PLAN_HASH = sha256(SEED_PLAN);

export const THRESHOLDS = deepFreeze({
  MATERIAL_TOP1_GAIN,
  MATERIAL_RULE: 'difference >= MATERIAL_TOP1_GAIN, bootstrap 95% CI lower bound > 0, and normalised regret not worse (CI lower bound of the nreg difference not > 0): the frozen Stage 3F.6-P.1A-SYM materialGain rule, unchanged',
  SUFFICIENT_TOP1,
  GAP_RECOVERY_CLOSED: 0.8,
  GAP_RECOVERY_DEFINITION: '(NEW - OLD) / (OLD_PRIVILEGED - OLD) top-1 on the same partition: the share of the Stage 3F privileged-geometry gap the observable representation recovers',
  TEMPORAL_RESIDUAL_SHARE: 0.5,
});

export const CONCLUSION_RULES = deepFreeze({
  REPRESENTATION_MATERIALLY_IMPROVED: 'NEW - OLD is MATERIAL on STAGE3G_HOLDOUT and on STAGE3G_OOD, and INTEGRITY holds',
  INTEGRITY: 'NEW feature D4 equivariance = 1, NEW prediction D4 equivariance = 1, identity-renaming invariance = 1, candidate-order invariance = 1, privileged-key scan clean, poisoning probe = 1, E1 effect fidelity = 1, the NEW gain over UNIFORM is positive in every hidden orientation and at least half the overall gain (orientation stability), and D_NEW_PLUS_ABSOLUTE_DIRECTION - NEW is not MATERIAL (no orientation shortcut available to exploit)',
  REPRESENTATION_GAP_CLOSED: 'REPRESENTATION_MATERIALLY_IMPROVED and GAP_RECOVERY >= 0.8 on both partitions and D_NEW_PLUS_PRIVILEGED - NEW not MATERIAL on both and NEW top-1 >= 0.5 on both and NEW MATERIAL vs UNIFORM and vs RESOURCE on both',
  REPRESENTATION_GAP_PARTIALLY_CLOSED: 'REPRESENTATION_MATERIALLY_IMPROVED and not REPRESENTATION_GAP_CLOSED',
  REPRESENTATION_GAP_REMAINS: 'not REPRESENTATION_GAP_CLOSED (some of the Stage 3F gap is still open, whether or not the improvement is material)',
  TRANSITION_PREDICTION_NOW_JUSTIFIED: '(REPRESENTATION_GAP_CLOSED or REPRESENTATION_GAP_PARTIALLY_CLOSED) and ( D_NEW_PLUS_ONE_STEP - NEW is MATERIAL on both partitions, or the MECHANISTIC + TEMPORAL primary share of NEW residual errors is >= 0.5 on both partitions ). Never true merely because Stage 3G exists.',
  POLICY_QUALITY_RESIDUAL: 'reported: the REPRESENTED_BUT_MISRANKED primary share of NEW residual errors (information present at decision time, ranking failed)',
});
export const RESIDUAL_TAXONOMY = deepFreeze({
  order: ['REPRESENTED_BUT_MISRANKED', 'PRIVILEGED_ONLY', 'MECHANISTIC', 'TEMPORAL', 'INDISTINGUISHABLE', 'UNKNOWN'],
  REPRESENTED_BUT_MISRANKED: 'a single NEW deployable column strictly separates the optimal candidates from the wrongly preferred ones: the information is present and the linear ranking failed (policy quality)',
  PRIVILEGED_ONLY: 'no NEW deployable column separates, a privileged kernel relation does (residual representation gap)',
  MECHANISTIC: 'only the simulated one-step immediate scalar separates (a one-step transition model could help)',
  TEMPORAL: 'nothing above separates and the oracle label is HORIZON_DEPENDENT (multi-step consequences)',
  INDISTINGUISHABLE: 'optimal and chosen candidates identical in every view (deployable, privileged, one-step)',
  UNKNOWN: 'none of the above',
  weighting: 'each residual error weighted by 1 - expected hit (uniform ties); multi-label incidence reported alongside',
});

export const PLAN = deepFreeze({
  stage: 'STAGE_3G_1_3G_2_EPISTEMIC_INTEGRITY_AND_OBSERVABLE_ENTITY_STATE',
  question: 'Can Sentinel construct a trustworthy current world state, represent actions relative to that world, distinguish observed fact from inference, and prepare for decision-relevant prediction without contaminating authoritative state?',
  role: 'STATE_AND_REPRESENTATION_CONTRACTS_PLUS_MEASUREMENT',
  notInScope: ['world model training', 'JEPA', 'Router 2.0', 'Expert #10', 'authority change', 'expert redesign or retraining (Nexus, RESOURCE)', 'counterfactual prediction'],
  inheritance: STAGE3F_INHERITANCE,
  schemas: {
    epistemic: { id: EPISTEMIC_SCHEMA_ID, hash: EPISTEMIC_SCHEMA_HASH, classes: Object.keys(EPISTEMIC_CLASSES), promotionRules: PROMOTION_RULES.map((r) => r.id), contaminationFlags: Object.keys(CONTAMINATION_FLAGS) },
    observableEntityState: { id: OBSERVABLE_ENTITY_STATE_ID, hash: OBSERVABLE_ENTITY_STATE_SCHEMA_HASH },
    actionSemantics: { id: ACTION_SEMANTICS_ID, hash: ACTION_SEMANTICS_SCHEMA_HASH },
  },
  recheck: {
    methodology: 'the frozen Stage 3F.6-P.1A-SYM free-action decision-sufficiency method: same eligibility (a zero-cost action is legal and optimal), same candidates (legal zero-cost actions of the symmetric surface), same conditional-logit scorer, optimiser, DEV fit, CAL selection, uniform ties, bootstrap plan and materialGain rule. Only the representation changes. No expert or policy is changed.',
    old: { name: 'OLD_STAGE3F_DEPLOYABLE_REPRESENTATION', spec: OLD_SPEC, binding: OLD_BINDING },
    new: { name: 'NEW_STAGE3G_OBSERVABLE_REPRESENTATION', variants: NEW_SPECS, source: 'SENTINEL_OBSERVABLE_ENTITY_STATE_V1 + ACTION_SEMANTICS_V1 from the ObservationPacket and the visible map only' },
    oldReferences: OLD_REFERENCE_SPECS, diagnostics: NEW_DIAGNOSTICS, blocks: BLOCKS,
    controls: ['UNIFORM_AMONG_ZERO_COST', 'LOWEST_ACTION_ID', 'FIXED_DIRECTION_EAST', 'HIDDEN_BASE_EAST (oracle-only)', 'RESOURCE_PRESERVING_V1 (stored frozen choice)', 'ONE_STEP_ZERO_COST (future-state reference)'],
    metrics: {
      FREE_ACTION_TOP1: 'expected probability that the chosen zero-cost candidate is oracle-optimal (uniform over tied top scores)',
      OPTIMAL_SET_HIT_RATE: 'softmax probability mass the scorer places on the optimal set, P(optimal set)',
      REGRET: 'expected oracle regret of the choice', NORMALIZED_REGRET: 'regret / max regret of the state',
      D4_EQUIVARIANCE: 'NEW feature vectors identical on every D4 twin of the stored equivariance sample, and the selected model\'s choice maps to the same candidates',
      ID_PERMUTATION_INVARIANCE: 'NEW vectors identical when every entity handle and action id is replaced and the legal list reversed',
      CANDIDATE_ORDER_INVARIANCE: 'the selected model chooses the same candidates when the candidate list is reversed',
      OOD: 'STAGE3G_OOD, curriculum levels 6-7, never used for fitting or selection',
      MATERIALITY: 'THRESHOLDS.MATERIAL_RULE',
    },
    calSelection: 'the NEW variant with the highest CAL top-1; ties within 1e-9 -> fewer columns',
    partitions: {
      DEV: 'P.1D DEV: fit', CAL: 'P.1D CAL: NEW variant selection',
      STAGE3G_HOLDOUT: 'PRIMARY sealed: 6000 new records, seed 4021, levels 0-5 in canonical order',
      STAGE3G_OOD: 'PRIMARY sealed: 6000 new records, seed 4031, levels 6-7 in canonical order',
      P1ASYM_HOLDOUT: 'SECONDARY replication and binding: the Stage 3F.6-P.1A-SYM fresh HOLDOUT (seed 2023); OLD must reproduce its certified top-1 exactly; NEW was never scored there',
      P1ASYM_OOD: 'SECONDARY replication and binding: the P.1A-SYM fresh OOD (seed 2033), likewise',
    },
    thresholds: THRESHOLDS, conclusionRules: CONCLUSION_RULES, residualTaxonomy: RESIDUAL_TAXONOMY,
    notPermitted: ['post-sealed tuning', 'deep network', 'world model', 'rollout search', 'reading any sealed row before the freeze commit'],
  },
  seeds: { plan: SEED_PLAN, hash: SEED_PLAN_HASH },
  decisionEvaluationContract: {
    contract: 'SENTINEL_DECISION_EVALUATION_CONTRACT_V1 (frozen by Stage 3F; unchanged)',
    rankingHere: 'none: no world model is ranked in Stage 3G.1/3G.2',
    supportForFutureMetrics: {
      FPE: 'E3 records carry targetTime and the provisional lane resolves them CONFIRMED/REFUTED against later E0 observations: factual prediction error is computable per path',
      CAD: 'E4 records are per candidate action (source kind COUNTERFACTUAL_MODEL) over ACTION_SEMANTICS_V1 candidates with stable semantic identity: candidate futures can be compared for distinguishability',
      CR: 'the action-relative state names every legal candidate with its declared cost and deterministic effects; counterfactual regret can be scored on the same candidate sets used here',
      DDV: 'decisions are made on the observable state; the same eligibility, candidates and sealed partitions give downstream decision value',
      TCA: 'confidence, verification status and contamination flags are recorded per record, so a trust gate can condition on them',
    },
  },
  reproducibility: {
    numerics: 'SENTINEL_CANONICAL_NUMERICS_V1 (the frozen Stage 3F reproducibility contract): every phase runs through scripts/reproducibility/run-canonical.mjs and the certifier refuses to certify otherwise',
    checkMode: 'CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE: every stage3g --check / --verify installs scripts/certification/check-mode-guard.mjs',
    reproductions: 'at least two --check reproductions in the working tree, and a fresh-clone reproduction with the gitignored payloads copied in and verified by manifest content hash',
  },
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const PLAN_HASH = sha256(PLAN);
