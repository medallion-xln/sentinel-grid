#!/usr/bin/env node
/* STAGE_3F_6_P_1D — corpus plan for the FORGE_SYMMETRIC_V2 lineage.
 * Written and hashed BEFORE any corpus record is generated; the corpus manifest and the certification bind this hash.
 * Every split size, seed space, admission rule, OOD criterion, balance bar, equivariance gate, sealing rule and
 * reporting boundary below is fixed here, in advance. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';

export const STAGE3F6P1D_PLAN = deepFreeze({
  stage: 'STAGE_3F_6_P_1D_FORGE_SYMMETRIC_V2_CORPUS_LINEAGE',
  corpusId: 'FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1',
  benchmark: {
    BENCHMARK_ID: 'FORGE_SYMMETRIC_V2', GENERATOR_ID: 'FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1', ORACLE_ID: 'FORGE_COUNTERFACTUAL_SYMMETRIC_V1',
    SURFACE_ID: 'FORGE_ACTION_SURFACE_SYMMETRIC_V1', ORIENTATION_ID: 'FORGE_ORIENTATION_SYMMETRIC_V1', LABEL_ID: 'FORGE_GREEDY_SAFE_SYMMETRIC_V1',
    binding: 'the generator refuses to run unless every contract hash matches the Stage 3F.6-P.1C certification',
    stage3f6p1cCertification: '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d',
  },
  featureContract: { id: 'SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1', profile: 'DEPLOYABLE_CORE', featureCount: 30,
    missingSemantics: 'a CORE feature that is not AVAILABLE disqualifies the row; nothing is imputed and nothing is zero-filled' },
  seeds: {
    priorConsumed: [1, 2, 3, 11, 201, 202, 203, 211, 401, 402, 403, 411, 601, 602, 603, 611, 801, 802, 803, 811, 1001, 1002, 1003, 1011],
    DEV: [2001, 2002, 2003], CAL: [2011, 2012, 2013], HOLDOUT: [2021, 2022, 2023], OOD: [2031, 2032, 2033],
    disjointnessProof: 'every new seed is checked against the enumerated prior list and against the other partitions, not inferred from naming',
  },
  splits: { DEV: 4000, CAL: 4000, HOLDOUT: 6000, OOD: 6000, TOTAL: 20000,
    levels: { DEV: [0, 1, 2, 3, 4, 5], CAL: [0, 1, 2, 3, 4, 5], HOLDOUT: [0, 1, 2, 3, 4, 5], OOD: [6, 7] } },
  oodCriteria: {
    OOD_CRITERIA: 'curriculum levels 6 and 7 only, on their own seed space',
    boundTo: 'environment parameters fixed by the frozen curriculum: topologyNodes 28-32, gridSize 20-22, energy 20-16, hazardDensity 6-7, valueSpread 7-8, maxTicksBase 28-31',
    declaredBefore: 'generation; OOD is never defined by inspecting any policy or model behaviour',
  },
  admission: ['warm-up history valid and unclamped', 'validateScenarioV2 passes', 'at least one legal action',
    'every DEPLOYABLE_CORE feature AVAILABLE (no imputation)', 'record, world and topology hashes unused anywhere else in the lineage'],
  splitHygiene: { recordOverlap: 0, worldStateOverlap: 0, topologyOverlap: 0, seedOverlap: 0,
    method: 'candidates are admitted in one canonical order across the whole lineage; any candidate whose record, world or topology hash is already claimed is rejected and counted' },
  symmetryBalance: {
    orientationMaxDeviationFromUniform: 0.05, materialDirectionMaxShare: 0.40, optimalDirectionMaxDeviationFromMean: 0.15,
    note: 'exact uniformity is not required; grid edges and task structure differ per direction',
  },
  equivarianceGate: {
    sampling: 'every candidate whose combination index is divisible by 25, in every partition',
    targets: { LEGAL_SURFACE_EQUIVARIANCE: 1.0, OPTIMAL_SET_EQUIVARIANCE: 1.0, REGRET_EQUIVARIANCE: 1.0, LABEL_EQUIVARIANCE: 1.0 },
    transforms: ['ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y'],
    blocking: 'any failure blocks corpus certification',
  },
  orientationLeakage: {
    exactInvariance: 'the DEPLOYABLE_CORE vector of a world must be identical to that of every transformed twin (sampled rows)',
    tokenAudit: 'no CORE feature id or value, and no label field, may carry an orientation, rotation, reflection or transform token',
    statistical: 'per-orientation CORE feature means must stay within 0.25 standard deviations of the pooled mean',
  },
  labels: { report: 'GREEDY_SAFE prevalence with positive and negative counts per partition',
    prohibition: 'partition membership is never adjusted to equalise labels; comparison with Forge V1 is descriptive only' },
  policyEvidence: {
    stored: 'policy proposals, availability, action identity, per-action regret and optimal-set membership are stored for every partition so later stages can evaluate offline without regenerating',
    descriptiveReporting: 'descriptive policy performance is reported for DEV and CAL only',
    frozenIntegrityDiagnostics: 'these bounded checks are declared here and computed on all four partitions because they are corpus-integrity checks, not policy claims: P(zero-cost optimal exists), P(RESOURCE correct | zero-cost optimal), the four fixed-direction accuracies, lowest-identity MOVE accuracy and deterministic random MOVE accuracy',
    prohibition: 'no tuning, no training, no policy modification; this is not the Stage 3F.6-P rerun',
  },
  determinism: { generation: 'sharded workers over a canonical combination order', reproduction: 'a deterministic 1000-record slice (the first 250 admitted rows of each partition) regenerated single-worker must be byte-identical' },
  sealing: { DEV: 'development', CAL: 'calibration', HOLDOUT: 'sealed', OOD: 'sealed',
    rule: 'no policy performance is reported on HOLDOUT or OOD beyond the frozen integrity diagnostics above' },
  storage: 'generator, plan, manifest, content hash, tests and documentation are committed; the payload is a deterministic build product and is gitignored',
  requalificationDerivation: 'rerun only the stages Stage 3F.6-P.1C classified REQUIRES_RERUN, ordered so that a stage is rerun only after every stage whose output it consumes',
  prohibited: ['modifying FORGE_SYMMETRIC_V2 semantics', 'modifying Sentinel policies', 'router training', 'Stage 3G', 'replacing or reusing the Forge V1 corpus identity'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const STAGE3F6P1D_PLAN_HASH = sha256(STAGE3F6P1D_PLAN);
export const STAGE3F6P1D_PLAN_PATH = 'artifacts/stage3f6p1d-symmetric-corpus/stage3f6p1d-corpus-plan.json';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await mkdir(path.join(root, 'artifacts/stage3f6p1d-symmetric-corpus'), { recursive: true });
  await writeFile(path.join(root, STAGE3F6P1D_PLAN_PATH), `${JSON.stringify({ ...STAGE3F6P1D_PLAN, planHash: STAGE3F6P1D_PLAN_HASH }, null, 2)}\n`);
  console.log(STAGE3F6P1D_PLAN_HASH);
}
