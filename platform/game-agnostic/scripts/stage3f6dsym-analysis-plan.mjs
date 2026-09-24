#!/usr/bin/env node
/* Stage 3F.6-D-SYM: immutable, pre-sealed decision-rule comparison contract. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';
import { STAGE3F6P1E_POLICY_SET_HASH, STAGE3F6P1E_POLICY_SOURCES } from './stage3f6p1e-analysis-plan.mjs';
import { STAGE3F6WSYM_SEED_PLAN_HASH } from './stage3f6wsym-analysis-plan.mjs';
import { STAGE3F6TSYM_FEATURE_SET_HASH } from './stage3f6tsym-analysis-plan.mjs';
import { STAGE3F6D_METHODOLOGY } from '../src/stage3f/decision-rule-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fileHash = (f) => createHash('sha256').update(readFileSync(path.join(root, f))).digest('hex');
export const OUT = 'artifacts/stage3f6dsym-decision-rule';
export const PLAN_PATH = `${OUT}/stage3f6dsym-analysis-plan.json`;
export const FREEZE_PATH = `${OUT}/stage3f6dsym-analysis-freeze.json`;
export const HEADLINE = deepFreeze(['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1']);
export const DIAGNOSTIC = deepFreeze([...HEADLINE, 'NEXUS_SELECTOR_V2_CANDIDATE']);
const policySources = Object.fromEntries(STAGE3F6P1E_POLICY_SOURCES.map((f) => [f, fileHash(f)]));
const headlineSources = Object.fromEntries(Object.entries(policySources).filter(([f]) => !f.endsWith('nexus-selector-v2-candidate.js')));
export const HEADLINE_POLICY_SET_HASH = sha256({ policies: HEADLINE, policySources: headlineSources });
export const DIAGNOSTIC_POLICY_SET_HASH = sha256({ policies: DIAGNOSTIC, policySources });
export const SEED_PLAN = deepFreeze({
  id: 'STAGE3F6DSYM_SEALED_SEEDS_V1', declared: { HOLDOUT: [3023], OOD: [3033] },
  provenance: 'P.1-SYM reserved 3021-3023 and 3031-3033; W-SYM re-declared 3022-3023 and 3032-3033 but consumed only 3022 and 3032',
  permittedBy: STAGE3F6WSYM_SEED_PLAN_HASH, sizes: { HOLDOUT: 6000, OOD: 6000 }, levels: { HOLDOUT: [0, 1, 2, 3, 4, 5], OOD: [6, 7] },
  priorSeedSpaces: [1,2,3,11,201,202,203,211,401,402,403,411,601,602,603,611,801,802,803,811,1001,1002,1003,1011,
    2001,2002,2003,2011,2012,2013,2021,2022,2023,2031,2032,2033,3021,3022,3031,3032],
  exclusion: 'reject any record, world, or topology hash claimed in P.1D, T-SYM, P.1A-SYM, P.1-SYM, W-SYM, or earlier D-SYM admissions',
  admission: 'P.1D benchmark-bound corpusRecord, canonical seed/level/horizon/objective/role/shape order; every 25th candidate has D4 evidence',
});
export const SEED_PLAN_HASH = sha256(SEED_PLAN);

export const PLAN = deepFreeze({
  stage: 'STAGE_3F_6_D_SYM_DECISION_RULE_SYMMETRIC_REQUALIFICATION', role: 'MEASUREMENT_ONLY',
  question: 'Does historical cost-sensitive decision selection add genuine action accuracy or regret value on the symmetric benchmark and current valid policy set?',
  predecessors: {
    P1C: '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d',
    P1D: 'afd0d6e6057f497e9e1d3666cf553518e134b0c4d09f783601b393c081ae7073',
    P1E: '11dcf65b79679ae8748eed0f5f9f3fdef38223524308aaa353c5b482eed8a031',
    TSYM: 'edd46e40fc2c6ddc611f9f78a432f723f0ae4e66facc1b2ca84183fa4d896f4e',
    P1ASYM: '84770670baeb1502142e12d24a12d03763c0a97c22e80acc53013ecb98871fbb',
    P1SYM: 'afcdceb18df34b05bb60613e302a762c3de196d764b34dfbe50e1978d3f80cf8',
    WSYM: '26e77c5d18c89774e3106295ec3868a2fcf2a83d251bab6173fc20510044f4b0',
    historicalD: 'f262c3477631a92007e1a40d4ba85bc03874fab6c1a68e78013378de2b909f3b',
    corpusContentHash: '4de383eb0c6e9836706e87c6626de53ccb54853fb527f368cfaf599617e6c75e',
  },
  policySet: { headline: HEADLINE, headlineHash: HEADLINE_POLICY_SET_HASH, diagnostic: DIAGNOSTIC, diagnosticHash: DIAGNOSTIC_POLICY_SET_HASH,
    P1EPolicySetHash: STAGE3F6P1E_POLICY_SET_HASH, alias: { NEXUS_SELECTOR: 'NEXUS_SELECTOR_V1' },
    V2: 'diagnostic only: shortcut-dependent under P.1E and P.1-SYM',
    RESOURCE: 'retained as the required best-single comparator and fallback despite its cost shortcut; selecting it more often is not attributed to genuine rule value unless the rule beats both it and the cascade and passes the nuisance audit' },
  featureSetHash: STAGE3F6TSYM_FEATURE_SET_HASH,
  seedPlanHash: SEED_PLAN_HASH,
  historicalInventory: {
    rules: ['A_ARGMAX_POLICY_PROBABILITY','B_CLASS_WEIGHTED_ARGMAX','C_EXPECTED_REGRET_MINIMIZATION','D_EXPECTED_VALUE_MAXIMIZATION','E_NEXUS_THRESHOLD_OVERRIDE'],
    methodology: STAGE3F6D_METHODOLOGY,
    thresholds: { temperature: 1, nexusOverride: 0.6, historicalAccuracyMaterial: 0.01, historicalRawRegretMaterial: 2 },
    claims: ['expected-regret slightly lowers HOLDOUT regret but is below materiality','class weighting increases specialist capture and harm',
      'expected-value headline selects RESOURCE 96.2% HOLDOUT and 98.8% OOD','NEXUS false selections offset much of capture value',
      'RESOURCE dominates as a simple baseline','OOD benefit vanishes as selection collapses'],
  },
  fitting: {
    router: 'frozen Stage 3F.6-T multinomial logistic methodology refitted on symmetric DEV only; no larger model',
    features: 'DEPLOYABLE_CORE, same audited 30 features as T-SYM',
    matrices: 'historical D cost, value, and inverse-prior class-weight formulas on DEV only; full matrices and hash fixed in analysis freeze',
    temperature: 'historical grid, CAL soft-target cross-entropy; tie lower temperature',
    nexusThreshold: 'historical grid, CAL minimum raw regret; tie higher accuracy then higher threshold',
    bestSingle: 'always-available headline policy with least DEV+CAL mean regret',
    cascade: 'T-SYM headline cascade CAL procedure: specialist CAL accuracy when proposing exceeds best single, descending accuracy, then best single',
    abstention: 'historical D rules select whenever any policy proposes; no confidence threshold is added; no available policy means ABSTAIN',
  },
  rules: {
    BEST_SINGLE_POLICY: 'CAL-selected single policy always', SIMPLE_CASCADE: 'CAL-selected fixed priority headline cascade',
    ARGMAX_ROUTER: 'historical A: argmax calibrated policy probability',
    EXPECTED_REGRET_ROUTER: 'historical C: minimum sum P(regime) * DEV mean regret for selected policy',
    CLASS_WEIGHTED_ROUTER: 'historical B: argmax P(policy) * inverse DEV soft-regime prior',
    EXPECTED_VALUE_ROUTER: 'historical D: maximum sum P(regime) * DEV mean action correctness (diagnostic comparison)',
    NEXUS_THRESHOLD_ROUTER: 'historical E: NEXUS override at CAL threshold, else argmax (diagnostic comparison)',
    W_ENRICHED_ROUTER: 'diagnostic only if W-SYM valid deployable risk set and committed W model can be scored on identical decision-time evidence; otherwise NOT_APPLICABLE with reason',
    PERFECT_SELECTOR_REFERENCE: 'oracle minimum regret among proposing headline policies, for headroom only',
  },
  metrics: {
    actionAccuracy: 'correct action / all episodes; abstention is incorrect', meanRegret: 'mean raw regret / all episodes; abstention has null regret and is separately counted',
    normalizedRegret: 'regret / maximum action regret for that episode, 0 if all actions optimal',
    catastrophic: 'raw regret >= 100, historical Stage 3F.6 threshold',
    falseSelection: 'per specialist relative to RESOURCE on episodes selected: savedCorrect=sum max(0,R-S) when specialist is in the minimum-regret best set; savedPartial=sum max(0,R-S) otherwise; addedFalse=sum max(0,S-R) when specialist is outside the best set; net=savedCorrect+savedPartial-addedFalse; false rate=outside best set',
    latency: 'wall-clock microseconds reported outside certification hash; no latency claim when host contention prevents stable measurement',
    paired: '1000 seeded bootstrap resamples; report accuracy, raw and normalized regret CI versus BEST_SINGLE and CASCADE',
  },
  decisionCriteria: {
    minN: 2000, accuracyGain: 0.02, normalizedRegretReduction: 0.02, rawRegretReductionHistoricalDiagnostic: 2,
    material: 'accuracy gain >= .02 with paired CI lower >0 and normalized regret not significantly worse, OR normalized regret reduction >= .02 with paired CI upper <0 and accuracy not significantly worse',
    mixedTradeoff: 'statistically better regret and statistically worse accuracy (or reverse) is TRADEOFF, never improvement',
    catastrophicGuard: 'catastrophic error may not increase with paired 95% CI lower >0',
    collapse: 'top policy share > .9; pathological when also > its best-set share + .05; never claim mixture value when collapsed',
    falseHarm: 'specialist net >=0, episodes worsened <= improved, and false-selection p95 added <= BEST_SINGLE p95 regret',
    ood: 'SURVIVES only if material HOLDOUT value persists on OOD with no significantly worse accuracy, normalized regret, or catastrophic rate; DEGRADES if benefit attenuates without significant reversal; COLLAPSES if top share > .9; REVERSES if significantly worse; else INSUFFICIENT_EVIDENCE',
    promotion: 'no future Router work unless one metric is material vs both BEST_SINGLE and CASCADE with no significant worsening of the other, OOD survives, harm acceptable, no collapse, and the perfect selector reaches >= .5 action accuracy on both fresh partitions',
  },
  historicalClaimRules: {
    expectedRegretAdvantage: 'SURVIVES if expected-regret is material vs BEST_SINGLE; PARTIALLY_SURVIVES if raw regret is merely lower; else INVALIDATED',
    classWeightingEffect: 'SURVIVES if class-weighted normalized regret is higher than BEST_SINGLE; else INVALIDATED',
    nexusCapture: 'SURVIVES if expected-regret selects NEXUS less often than argmax, as historical cost-sensitive D did; else INVALIDATED',
    falseSelectionHarm: 'SURVIVES if headline NEXUS false-selection added regret >= correctly selected savings; PARTIALLY_SURVIVES if nonzero but smaller; else INVALIDATED',
    resourceDominance: 'SURVIVES if RESOURCE is CAL best single and no headline rule is material vs it; else INVALIDATED',
    oodSurvival: 'SURVIVES only for the strict OOD criterion; PARTIALLY_SURVIVES for a collapsed but non-reversed rule; else INVALIDATED',
    materiality: 'SURVIVES when no headline rule meets the materiality, OOD, collapse, harm and nuisance gates; else INVALIDATED',
    collapse: 'SURVIVES when top share exceeds .9 on HOLDOUT or OOD; else INVALIDATED',
  },
  audits: { D4: 'rule choice maps on P.1D stored D4 twins where policies and CORE are invariant', ID: 'P.1E relabel evidence and fresh D-SYM mutation sample',
    candidateOrder: 'reverse candidate presentation with decision-time features and policy availability held equal',
    orientation: 'report per-orientation accuracy/regret and max gap', curriculum: 'report per-level accuracy/regret',
    nuisanceValue: 'headline rule must have exact decision-choice D4, ID, and candidate-order invariance on the predeclared first 64 equivariance rows per fresh partition; its mutation accuracy delta may differ from BEST_SINGLE by at most .02 for D4 and ID. Otherwise value is nuisance-dependent and excluded from materiality' },
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
  acceptance: 'PASS when all integrity, deterministic replay, predecessor, symmetry, and measurement checks pass, including a scientifically negative result',
});
export const PLAN_HASH = sha256(PLAN);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(path.join(root, OUT), { recursive: true });
  await writeFile(path.join(root, PLAN_PATH), `${JSON.stringify({ ...PLAN, planHash: PLAN_HASH, seedPlan: SEED_PLAN }, null, 2)}\n`);
  console.log(JSON.stringify({ planHash: PLAN_HASH, seedPlanHash: SEED_PLAN_HASH, headlinePolicySetHash: HEADLINE_POLICY_SET_HASH, diagnosticPolicySetHash: DIAGNOSTIC_POLICY_SET_HASH }));
}
