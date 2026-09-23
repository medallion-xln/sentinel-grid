#!/usr/bin/env node
/* STAGE_3F_6_P_1_SYM — analysis plan for the NEXUS REMEDIATION SYMMETRIC REQUALIFICATION.
 *
 * Written, hashed and committed with the DEV/CAL open-phase report and all evaluation code BEFORE any new sealed
 * partition exists. It declares a NEW sealed seed space (the P.1D-declared HOLDOUT/OOD seeds are exhausted), the
 * policy versions and their hashes, the candidate representation, every metric, regime, shortcut test, relational-value
 * criterion, historical-claim rule, materiality bar and conclusion rule. Requalification only: Nexus is not redesigned.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { NEXUS_V2_CANDIDATE_HASH } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { MATERIAL_TOP1_GAIN } from '../src/stage3f/free-action-sufficiency-v1.js';
import { CANDIDATE_SCHEMA, CANDIDATE_SCHEMA_HASH, DEPLOYABLE_BLOCKS } from '../src/stage3f/nexus-requalification-v1.js';
import { STAGE3F6P1D_PLAN } from './stage3f6p1d-corpus-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileHash = (r) => createHash('sha256').update(readFileSync(path.join(root, r))).digest('hex');

/* ------------------------------------------------------------ sealed seeds */
/** Every seed any prior Forge stage declared or consumed, enumerated (P.1D priorConsumed plus the P.1D lineage). */
export const PRIOR_SEEDS = deepFreeze([...new Set([...STAGE3F6P1D_PLAN.seeds.priorConsumed, ...STAGE3F6P1D_PLAN.seeds.DEV, ...STAGE3F6P1D_PLAN.seeds.CAL,
  ...STAGE3F6P1D_PLAN.seeds.HOLDOUT, ...STAGE3F6P1D_PLAN.seeds.OOD])].sort((a, b) => a - b));
export const STAGE3F6P1SYM_SEED_PLAN = deepFreeze({
  seedPlanId: 'STAGE3F6P1SYM_SEALED_SEED_DECLARATION_V1',
  declared: { HOLDOUT: [3021, 3022, 3023], OOD: [3031, 3032, 3033] },
  use: 'the first declared seed of each space, in canonical combination order; later seeds only if the first cannot fill 6000 admitted rows',
  levels: { HOLDOUT: STAGE3F6P1D_PLAN.splits.levels.HOLDOUT, OOD: STAGE3F6P1D_PLAN.splits.levels.OOD },
  sizes: { HOLDOUT: 6000, OOD: 6000 },
  priorSeeds: PRIOR_SEEDS,
  priorSources: ['P.1D corpus plan priorConsumed (Stages 3B, 3F.6-C/-R/-T/-D, P.1C)', 'P.1D declared DEV 2001-2003, CAL 2011-2013, HOLDOUT 2021-2023, OOD 2031-2033 (HOLDOUT/OOD all consumed by P.1D, 3F.6-T-SYM and P.1A-SYM)'],
  spareDevCalSeeds: 'P.1D DEV/CAL spares (2002, 2003, 2012, 2013) are DEV/CAL seeds and are not used as sealed seeds',
  declaredBefore: 'any partition from these seeds exists; chosen as the next unused decade block, not from any outcome',
  exclusion: 'a candidate whose record, world or topology hash is claimed anywhere in the P.1D corpus, the 3F.6-T-SYM fresh partitions or the P.1A-SYM fresh partitions, or earlier in this set, is rejected',
});
export const STAGE3F6P1SYM_SEED_PLAN_HASH = sha256(STAGE3F6P1SYM_SEED_PLAN);

/* ------------------------------------------------------------ policies */
export const POLICY_SOURCES = deepFreeze(['src/lab/stage3c-learned-nexus.js', 'src/experts/nexus.js', 'src/stage3f/nexus-selector-v2-candidate.js',
  'src/stage3f/deployable-action-proposal-v1.js']);
export const STAGE3F6P1SYM_POLICIES = deepFreeze({
  baseline: { id: 'NEXUS_SELECTOR_V1', source: 'src/lab/stage3c-learned-nexus.js#nexusRelationalSelector', diagnosis: 'src/experts/nexus.js#evaluateNexus' },
  remediated: { id: 'NEXUS_SELECTOR_V2_CANDIDATE', source: 'src/stage3f/nexus-selector-v2-candidate.js', candidateHash: NEXUS_V2_CANDIDATE_HASH,
    historicalCandidateHash: '8c658bfa41c5e84137bd78de6f70a6f802c3754936ffbc995ce866da9e22a900', historicalSourceHash: '965cb36f003045a5f80e0e9860c03b99db0d427bdd1768d5fc33ec72e2581577' },
  controls: ['RESOURCE_PRESERVING_V1', 'RANDOM_LEGAL_V1', 'UNIFORM_LEGAL_EXPECTATION'],
  references: ['OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'GREEDY (simulator reference)', 'PERFECT_SELECTOR over {RESOURCE, NEXUS, OBJECTIVE, THREAT} with V1 or V2 in the NEXUS slot'],
  sourceSha256: Object.fromEntries(POLICY_SOURCES.map((f) => [f, fileHash(f)])),
  historicalStage3f6p1Certification: '48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4',
});
export const STAGE3F6P1SYM_POLICY_HASH = sha256(STAGE3F6P1SYM_POLICIES);

/* ------------------------------------------------------------ diagnostic scorers */
export const SCORERS = deepFreeze({
  NX_RELATIONAL_ONLY: { blocks: DEPLOYABLE_BLOCKS.filter((b) => b !== 'GEOMETRY'), class: 'DEPLOYABLE', question: 'can Nexus\'s own relational inputs (no actor geometry) support a better decision than Nexus\'s fixed rule? (the Nexus-scope repair test)' },
  NX_DEPLOYABLE: { blocks: DEPLOYABLE_BLOCKS, class: 'DEPLOYABLE', question: 'what can every deployable input, including the P.1A-SYM actor geometry Nexus never reads, support? (deployable ceiling)' },
  NX_PRIVILEGED: { blocks: [...DEPLOYABLE_BLOCKS, 'PRIV_MOVEMENT', 'PRIV_TARGET'], class: 'DIAGNOSTIC_UNAVAILABLE', question: 'does kernel entity geometry unlock the decision?' },
  NX_PRIV_MOVEMENT_ONLY: { blocks: [...DEPLOYABLE_BLOCKS, 'PRIV_MOVEMENT'], class: 'DIAGNOSTIC_UNAVAILABLE', question: 'is the gain in where movement leads (action semantics relative to entities)?' },
  NX_PRIV_TARGET_ONLY: { blocks: [...DEPLOYABLE_BLOCKS, 'PRIV_TARGET'], class: 'DIAGNOSTIC_UNAVAILABLE', question: 'is the gain in where targeted entities are (relational spatial context)?' },
  NX_DEPLOYABLE_ONESTEP: { blocks: [...DEPLOYABLE_BLOCKS, 'ONESTEP'], class: 'DIAGNOSTIC_FUTURE_STATE', question: 'does a one-step successor reward suffice?' },
  NX_PRIVILEGED_ONESTEP: { blocks: [...DEPLOYABLE_BLOCKS, 'PRIV_MOVEMENT', 'PRIV_TARGET', 'ONESTEP'], class: 'DIAGNOSTIC_FUTURE_STATE', question: 'does one-step information add to entity geometry?' },
});

/* -------------------------------------------------------------------- plan */
export const STAGE3F6P1SYM_PLAN = deepFreeze({
  stage: 'STAGE_3F_6_P_1_SYM_NEXUS_REMEDIATION_SYMMETRIC_REQUALIFICATION',
  questions: ['Does the historical Nexus remediation retain genuine relational competence?', 'Did it improve Nexus for the reason originally claimed?',
    'Which gains were caused by nuisance direction / action-ID behaviour?', 'Is Nexus limited by policy logic, missing relational/spatial state, or both?',
    'Is any existing Nexus remediation worth preserving?'],
  role: 'REQUALIFICATION_ONLY: no Nexus redesign, no policy training, no deployable use of privileged features',
  predecessors: {
    stage3f6p1cCertification: '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d', stage3f6p1dCertification: 'afd0d6e6057f497e9e1d3666cf553518e134b0c4d09f783601b393c081ae7073',
    stage3f6p1eCertification: '11dcf65b79679ae8748eed0f5f9f3fdef38223524308aaa353c5b482eed8a031', stage3f6tsymCertification: 'edd46e40fc2c6ddc611f9f78a432f723f0ae4e66facc1b2ca84183fa4d896f4e',
    stage3f6p1asymCertification: '84770670baeb1502142e12d24a12d03763c0a97c22e80acc53013ecb98871fbb', corpusContentHash: '4de383eb0c6e9836706e87c6626de53ccb54853fb527f368cfaf599617e6c75e',
    tsymFreshContentHash: '2921adb7e933c274ed692d0f38ccc58a6d1553a60194d01d14b75105c92ff6e8', p1asymFreshContentHash: '8fde1f1245849e88b941044788d3a7cebe6b930837dce2e7b074a1c461c63840',
  },
  seedPlanHash: STAGE3F6P1SYM_SEED_PLAN_HASH,
  policyHash: STAGE3F6P1SYM_POLICY_HASH,
  candidateSchemaHash: CANDIDATE_SCHEMA_HASH, candidateSchema: CANDIDATE_SCHEMA,
  partitions: {
    DEV: 'P.1D DEV: fits the diagnostic scorers and fixes the regime cut points (medians)', CAL: 'P.1D CAL: descriptive only (no selection is needed: every scorer specification is fixed here)',
    FRESH_HOLDOUT: 'PRIMARY confirmatory: 6000 rows from the newly declared HOLDOUT seed space', FRESH_OOD: 'PRIMARY robustness: 6000 rows from the newly declared OOD seed space (levels 6-7)',
    generation: 'only after this plan, the open-phase report and every evaluation file are committed unchanged at HEAD',
  },
  scorers: { specs: SCORERS, model: 'Stage 3F.6-P.1A-SYM conditional logit (fitCandidateLogit, unchanged): set-valued optimal target, DEV standardisation, lr 0.1, l2 1e-3, 2000 iterations; candidates = every distinct legal action',
    choice: 'highest score; ties uniform', roleOfPrivileged: 'upper-bound diagnostics only; never a deployable result' },
  metrics: {
    perStrategy: ['coverage / abstention', 'top-1 accuracy (chosen action in the optimal set; uniform over score ties)', 'mean regret', 'mean normalized regret', 'catastrophic rate (regret >= 100, raw-scale caveat)',
      'action-type distribution', 'target-kind distribution', 'chosen MOVE direction share', 'accuracy by hidden orientation', 'type accuracy (chosen type is an optimal type)',
      'target accuracy (chosen action optimal given its type is an optimal type)', 'PROTECT selection rate, PROTECT precision, PROTECT-optimal rate', 'RETREAT selection rate and precision',
      'confidence calibration where the policy emits non-constant confidence; scorer Brier / ECE'],
    comparisons: 'paired on identical episodes (policy-proposing rows for policy comparisons): top-1 and normalized-regret differences with 1000-resample bootstrap 95% CIs',
    materiality: `MATERIAL = top-1 gain >= ${MATERIAL_TOP1_GAIN} with CI lower > 0 and normalized regret not significantly worse (P.1A-SYM materialGain, unchanged)`,
  },
  regimes: {
    observed: {
      HOSTILE_PRESENT: 'relational.hostileEntityCount > 0', UNSUPPORTED_THREAT: 'relational.unsupportedThreatenedCount > 0',
      DEPENDENCY: 'relational.criticalDependencyCount > 0 or relational.unresolvedDependencyCount > 0', MULTI_ENTITY_DEPENDENCY: 'relational.maxDependents >= 2',
      DENSE_RELATIONAL: 'relational.graphDensity > DEV median', SPARSE_RELATIONAL: 'relational.graphDensity <= DEV median',
      OBJECTIVE_RELATION: 'a legal action targets an observed critical entity', RESOURCE_RELATION: 'a legal action targets an observed RESOURCE-kind entity',
      PROTECT_LEGAL: 'a PROTECT action is legal', THREAT_DRIVEN: 'the observed Nexus diagnosis is threat-driven',
    },
    oracleDiagnostic: { COSTLY_ACTION_OPTIMAL: 'no optimal action has declared cost 0', PROTECT_OPTIMAL: 'a PROTECT action is optimal', TARGETED_ACTION_OPTIMAL: 'an entity-targeted action is optimal' },
    minN: 200,
  },
  relationalValue: {
    rule: 'GENUINE_RELATIONAL_VALUE for a Nexus policy when, in at least one OBSERVED regime with >= 200 proposing rows on FRESH_HOLDOUT, its top-1 exceeds BOTH the uniform-legal expectation and RESOURCE by a MATERIAL margin, the same comparison has CI lower > 0 on FRESH_OOD, and the policy has no replicated nuisance dependence',
    oracleRegimes: 'reported as conditional competence (where Nexus is right when the oracle says a relational action is optimal); never sufficient on their own, because they are not observable',
  },
  shortcutAudit: {
    tests: ['D4 twins (choice and target equivariance)', 'action-ID permutation (8 seeds) and reversal (P.1E evidence, unchanged)', 'candidate-order shuffle', 'accuracy by hidden orientation',
      'chosen MOVE direction share and accuracy by chosen direction', 'zero-cost preference', 'PROTECT over-selection', 'target-ID ordering (targeted choices changed by identity relabelling)'],
    flags: 'P.1E factorGap (orientation, direction) and pairedFlag (ID order vs permuted mean, D4 twin); NUISANCE_DEPENDENCE requires the flag on BOTH FRESH_HOLDOUT and FRESH_OOD',
    candidateShuffle: 'any choice change under a pure order shuffle is an ordering defect and is reported',
  },
  historicalClaims: {
    C1_PROTECT_BIAS_MAIN_CAUSE: 'SURVIVES if V1 PROTECT selection share >= 0.8 AND PROTECT carries >= 0.8 of V1 regret on FRESH_HOLDOUT; PARTIALLY if one holds; else INVALIDATED',
    C2_TARGET_NOT_MAIN_DEFECT: 'SURVIVES if P(V1 choice optimal | chosen type is an optimal type) >= 0.9; PARTIALLY if >= 0.7; else INVALIDATED',
    C3_V2_STANDALONE_MATERIAL_IMPROVEMENT: 'SURVIVES if V2 - V1 is MATERIAL on FRESH_HOLDOUT and FRESH_OOD both raw AND with both policies tie-randomised (ID-permuted means); PARTIALLY if material raw on FRESH_HOLDOUT but not tie-randomised or not on OOD; else INVALIDATED',
    C4_V2_GAIN_FROM_MOVE_RESOURCE_COLLINEAR: 'SURVIVES if V2 MOVE share >= 0.5 AND V2 agreement with RESOURCE >= 0.5 on FRESH_HOLDOUT; PARTIALLY if one; else INVALIDATED',
    C5_V2_REDUCES_POLICY_SET_VALUE: 'SURVIVES if oracle{RES,V2,OBJ,THR} top-1 < oracle{RES,V1,OBJ,THR} top-1 with paired CI upper < 0 on FRESH_HOLDOUT; else INVALIDATED',
    C6_V2_WORSE_WHERE_V1_BEST: 'SURVIVES if on rows where V1 is in the best set of {RES,V1,OBJ,THR}, V2 top-1 < V1 top-1 with CI upper < 0 on FRESH_HOLDOUT; else INVALIDATED',
    C7_V1_VALUE_FROM_GREEDY_COLLINEARITY: 'SURVIVES if V1 agreement with GREEDY >= 0.5 on FRESH_HOLDOUT; PARTIALLY if >= 0.25; else INVALIDATED',
    C8_REMEDIATION_REQUIRES_MISSING_REPRESENTATION: 'SURVIVES if NX_PRIVILEGED - NX_DEPLOYABLE is MATERIAL on FRESH_HOLDOUT and FRESH_OOD; PARTIALLY if on one; else INVALIDATED',
    C9_V1_THREAT_REGIME_INSENSITIVE: 'SURVIVES if the V1 top-1 gap between HOSTILE_PRESENT and not does not flag (factorGap) on FRESH_HOLDOUT; else INVALIDATED',
    C10_ENTITY_TARGETED_ORACLE_NOT_MATERIAL: 'SURVIVES if, on rows with any legal entity-targeted action, the best entity-targeted action minus V1 is not MATERIAL on FRESH_HOLDOUT; else INVALIDATED',
    C11_V2_SIMULATOR_FREE: 'SURVIVES if the V2 source and candidate hashes equal the historically certified ones (static re-verification; the dynamic poison probe is not re-run)',
    C12_V1_PRESERVED: 'SURVIVES if the V1 source is unchanged and reproduces every stored choice (fidelity 1.0)',
  },
  classification: {
    labels: ['INSUFFICIENT_EVIDENCE (proposing n < 200)', 'SHORTCUT_DEPENDENT (replicated nuisance dependence)', 'GENUINE_RELATIONAL_COMPETENCE (relationalValue rule)',
      'REPRESENTATION_BLOCKED (NX_PRIVILEGED - NX_DEPLOYABLE MATERIAL on both fresh partitions)', 'POLICY_LOGIC_LIMITED (NX_RELATIONAL_ONLY - policy MATERIAL on both fresh partitions, policy-proposing rows)',
      'REDESIGN_CANDIDATE (marginal oracle top-1 gain >= 0.02 and top-1 when best-available < 0.5; P.1E rule)', 'WEAK_BUT_DISTINCT (marginal oracle top-1 gain >= 0.02)',
      'REDUNDANT (marginal oracle top-1 gain < 0.02)'],
    marginalSet: '{RESOURCE, OBJECTIVE, THREAT} plus the policy, on FRESH_HOLDOUT',
    primary: 'first holding label in the order above; every holding label is reported',
    appliedTo: ['NEXUS_SELECTOR_V1 (the routed Nexus; headline)', 'NEXUS_SELECTOR_V2_CANDIDATE'],
  },
  architecture: {
    rule: 'OBSERVATION_INFRASTRUCTURE when REPRESENTATION_BLOCKED (the missing inputs are kernel observations no interface exposes); NEXUS co-owns when NX_PRIV_TARGET_ONLY - NX_DEPLOYABLE is MATERIAL (relational spatial context of targets); ACTION_SEMANTICS_INFRASTRUCTURE when NX_PRIV_MOVEMENT_ONLY - NX_DEPLOYABLE is MATERIAL (what an action does relative to entities); ARCHIMEDES when NX_PRIVILEGED_ONESTEP - NX_PRIVILEGED is MATERIAL (mechanistic effect); ORACLE is not assessed (no temporal diagnostic)',
    expert10: 'not considered unless an orthogonal capability fits no existing boundary; nine experts assumed',
  },
  roadmap: {
    NEXUS_REQUALIFIED: 'stage PASS',
    HISTORICAL_P1_SURVIVES: 'true if every testable claim SURVIVES, false if none does, else PARTIAL',
    GENUINE_RELATIONAL_VALUE_MEASURED: 'relationalValue holds for V1 or V2',
    NEXUS_POLICY_REPAIR_JUSTIFIED: 'NX_RELATIONAL_ONLY is MATERIAL over V1 on both fresh partitions AND MATERIAL over RESOURCE on both (a repair within Nexus\'s relational inputs exists); neither a privileged gain nor a gain that needs actor geometry sets this',
    NEXUS_REPRESENTATION_BLOCKED: 'V1 REPRESENTATION_BLOCKED', SPATIAL_STATE_REQUIRED: 'NX_PRIVILEGED - NX_DEPLOYABLE MATERIAL on both fresh partitions',
    ACTION_SEMANTICS_REQUIRED: 'NX_PRIV_MOVEMENT_ONLY - NX_DEPLOYABLE MATERIAL on FRESH_HOLDOUT, or carried true from P.1A-SYM',
    TRANSITION_PREDICTION_REQUIRED: 'NX_PRIVILEGED_ONESTEP - NX_PRIVILEGED MATERIAL on both fresh partitions, or NX_DEPLOYABLE_ONESTEP - NX_DEPLOYABLE MATERIAL on both',
    ROUTER_2_0_JUSTIFIED: 'false (Stage 3F.6-T-SYM; not reopened)',
    READY_FOR_STAGE3F6W_REQUALIFICATION: 'stage PASS (W consumes 3F.6-T, which is requalified)', READY_FOR_STAGE3F6D_REQUALIFICATION: 'false until 3F.6-W is requalified',
    READY_FOR_3F_FREEZE: 'false (W and D remain)', READY_FOR_STAGE3G: 'false by construction',
  },
  preFreezeRevisions: [{
    id: 'P1SYM-PRE-FREEZE-001', when: 'after a dry run of the confirmatory code on CAL rows standing in for sealed data; no fresh row existed',
    observed: 'on CAL, NX_DEPLOYABLE (which includes the P.1A-SYM actor geometry) beat V1 and RESOURCE, which would have set NEXUS_POLICY_REPAIR_JUSTIFIED',
    problem: 'actor geometry is not a Nexus input and is not relational; a repair that needs it would make Nexus a movement policy, which is the role loss historical P.1 identified',
    change: 'added the deployable NX_RELATIONAL_ONLY scorer (Nexus relational inputs only) and based POLICY_LOGIC_LIMITED and NEXUS_POLICY_REPAIR_JUSTIFIED on it; NX_DEPLOYABLE is reported as the deployable ceiling including actor geometry',
    effect: 'makes the repair verdict stricter and closer to the question; no threshold changed',
  }],
  acceptance: { PASS: 'every integrity check holds; a negative Nexus result is a valid PASS', FAIL: ['seed overlap', 'sealed data before the freeze commit', 'lineage contamination', 'broken symmetry',
    'policy source change', 'non-reproducibility', 'post-freeze rule change', 'authority violation'] },
  notChanged: ['Nexus V1', 'Nexus V2 candidate', 'every other policy', 'FORGE_SYMMETRIC_V2', 'every prior corpus and certificate', 'router (not reopened)', 'authority', 'Stage 3G (not begun)'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const STAGE3F6P1SYM_PLAN_HASH = sha256(STAGE3F6P1SYM_PLAN);
export const STAGE3F6P1SYM_OUT = 'artifacts/stage3f6p1sym-nexus-requalification';
export const STAGE3F6P1SYM_PLAN_PATH = `${STAGE3F6P1SYM_OUT}/stage3f6p1sym-analysis-plan.json`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(path.join(root, STAGE3F6P1SYM_OUT), { recursive: true });
  await writeFile(path.join(root, STAGE3F6P1SYM_PLAN_PATH), `${JSON.stringify({ ...STAGE3F6P1SYM_PLAN, planHash: STAGE3F6P1SYM_PLAN_HASH,
    seedPlan: STAGE3F6P1SYM_SEED_PLAN, policies: STAGE3F6P1SYM_POLICIES }, null, 2)}\n`);
  console.log(JSON.stringify({ planHash: STAGE3F6P1SYM_PLAN_HASH, seedPlanHash: STAGE3F6P1SYM_SEED_PLAN_HASH, policyHash: STAGE3F6P1SYM_POLICY_HASH, candidateSchemaHash: CANDIDATE_SCHEMA_HASH }));
}
