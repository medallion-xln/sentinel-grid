#!/usr/bin/env node
/* STAGE_3F_6_P_1C — analysis plan for the Forge symmetry remediation.
 * Written and hashed BEFORE the fresh DEV diagnostic evaluation; the evidence manifest and the certification bind this hash.
 * Written after the symmetric modules existed and after a 24-world development smoke run (disclosed). */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';

export const STAGE3F6P1C_PLAN = deepFreeze({
  stage: 'STAGE_3F_6_P_1C_FORGE_SYMMETRY_REMEDIATION',
  benchmark: {
    id: 'FORGE_SYMMETRIC_V2',
    generator: 'FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1', surface: 'FORGE_ACTION_SURFACE_SYMMETRIC_V1',
    oracle: 'FORGE_COUNTERFACTUAL_SYMMETRIC_V1', label: 'FORGE_GREEDY_SAFE_SYMMETRIC_V1', orientation: 'FORGE_ORIENTATION_SYMMETRIC_V1',
    historicalUnchanged: ['scenarios-v2.js', 'scenarios-v3.js', 'kernel.js', 'counterfactual-v2.js', 'record-v2.js', 'reward-v2.js', 'warmup.js', 'topology.js'],
  },
  remediatedDefects: {
    DEFECT_1: 'material placement used a fixed EAST-first candidate order (scenarios-v2.js placeNear) — repaired by a seed-bound D4 orientation of the whole scenario after canonical generation',
    DEFECT_2: 'continuation tie-breaking used world-independent action-key ordering (counterfactual-v2.js) — repaired by tie-breaking on the action identity in the canonical frame of the root world',
    DEFECT_3: 'RETREAT resolved direction with a global x-before-y preference (kernel.js) — repaired by choosing the reachable neighbour furthest from the nearest live hostile, canonical-frame tie-break',
    DEFECT_4: 'GREEDY_SAFE and horizon labels inherited the above — repaired as a consequence, under a new label identity',
  },
  sample: { partition: 'fresh DEV diagnostic only', seedSpace: [1001, 1002, 1003, 1011], disjointFrom: 'every prior Forge seed space (1,2,3,11,201-211,401-411,601-611,801-811)',
    target: 1200, enumeration: 'deterministic sweep of shape x roles x objectives x horizonBand x level x seed, in canonical order, admitted worlds only',
    note: 'a bounded fresh DEV sample is sufficient for remediation certification; no confirmatory corpus is generated in this stage' },
  transformsTested: ['ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y'],
  equivarianceTargets: {
    LEGAL_SURFACE_EQUIVARIANCE: 1.0, OPTIMAL_SET_EQUIVARIANCE: 1.0, REGRET_EQUIVARIANCE: 1.0,
    LABEL_EQUIVARIANCE: 1.0, RETREAT_EQUIVARIANCE: 1.0, SYMMETRIC_GREEDY_SAFE_EQUIVARIANCE: 1.0,
  },
  declaredExceptionBeforeEvaluation: {
    id: 'DIHEDRAL_SELF_SYMMETRIC_WORLD',
    statement: 'a world whose geometry digest is identical under two distinct D4 elements has no unique canonical frame; the declared orientation order resolves it, and such a world may tie-break differently from its transformed twin',
    handling: 'counted and reported separately; rows flagged canonicalFrameDigestTied are excluded from the 1.0 targets and reported as a named exception, never as a lowered target',
  },
  directionBalance: {
    optimalGivenLegalMaxDeviation: 0.15, comment: 'no direction may exceed the four-direction mean by more than 0.15 absolute; exact uniformity is not required because grid edges and terrain differ per direction',
    materialPlacementMaxShare: 0.40, historicalMaterialShare: { EAST: 0.78, WEST: 0.17, SOUTH: 0.04, NORTH: 0.01 },
    fixedBaselineSpread: 0.15, lowestIdVersusRandomMax: 0.10,
  },
  policyDiagnostic: { policies: ['RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'GREEDY'],
    status: 'read-only diagnostic; no policy is trained, tuned or modified; this is not a new policy-quality claim',
    shortcutSeparation: 'resource-cost shortcut measured as P(a zero-declared-cost action is optimal) and P(RESOURCE correct | zero-cost optimal exists); directional shortcut measured as the fixed-direction baselines' },
  historicalImpactRules: {
    thresholds: { policyAccuracyDelta: 0.10, policyRegretDelta: 5.0 },
    UNAFFECTED: 'the stage claim is structural or contractual and does not depend on optimal-action labels or MOVE direction',
    MINOR_NUMERICAL_CONFOUND: 'the claim depends on labels carrying orientation noise, but no measured policy delta exceeds a threshold and the qualitative conclusion is unchanged',
    MATERIAL_CONFOUND: 'a measured policy delta exceeds a threshold and the stage reports those numbers, but the stage conclusion does not rest on comparing the affected policies',
    REQUIRES_RERUN: 'the stage headline is a comparison among policies whose measured deltas exceed a threshold, or it rests on MOVE-direction choice',
  },
  passConditions: ['historical Forge V1 byte-identical and historical certificates reproducible', 'new benchmark identities distinct and hashed',
    'direction-neutral placement established', 'tie-break equivariant', 'RETREAT equivariant', 'legal surface, optimal set, regret and labels equivariant at target',
    'no policy, router or Sentinel architecture modification'],
  prohibited: ['modifying historical Forge V1, corpora or certificates', 'modifying NEXUS, RESOURCE, router or any policy', 'training', 'generating the next full corpus', 'Stage 3G'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const STAGE3F6P1C_PLAN_HASH = sha256(STAGE3F6P1C_PLAN);
export const STAGE3F6P1C_PLAN_PATH = 'artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-analysis-plan.json';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await mkdir(path.join(root, 'artifacts/stage3f6p1c-symmetric-benchmark'), { recursive: true });
  await writeFile(path.join(root, STAGE3F6P1C_PLAN_PATH), `${JSON.stringify({ ...STAGE3F6P1C_PLAN, planHash: STAGE3F6P1C_PLAN_HASH }, null, 2)}\n`);
  console.log(STAGE3F6P1C_PLAN_HASH);
}
