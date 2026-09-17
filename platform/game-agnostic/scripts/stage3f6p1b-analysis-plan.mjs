#!/usr/bin/env node
/* STAGE_3F_6_P_1B — analysis plan for the Forge directional symmetry audit.
 * Written and hashed BEFORE the symmetry evidence is generated; the evidence manifest and the certification bind this hash.
 * Written after the generator source audit and a 12-row smoke run of the transforms (disclosed). */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepFreeze, sha256 } from '../src/core/determinism.js';

export const STAGE3F6P1B_PLAN = deepFreeze({
  stage: 'STAGE_3F_6_P_1B_FORGE_DIRECTIONAL_SYMMETRY_AUDIT',
  data: { partition: 'DEV only', rows: 'all DEV rows of the Stage 3F.6-C corpus', distributions: 'Stage 3F.6-P.1A DEV spatial evidence, read-only and hash-verified',
    unused: ['CAL', 'HOLDOUT', 'OOD'] },
  transforms: ['IDENTITY (control: must reproduce the certified record)', 'ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y'],
  definitions: {
    TRANSFORMATION_VALID: 'transformWorld succeeds and the kernel validates T(W) (legalActions(T(W)) runs)',
    LEGAL_SURFACE_EQUIVARIANT: 'key set of legalActions(T(W)) equals the key set of T(legalActions(W))',
    OPTIMAL_SET_EQUIVARIANT: 'optimalSet(T(W)) equals T(optimalSet(W)) exactly, under the official oracle (GREEDY_CONTINUATION_V1, record horizon)',
    REGRET_EQUIVARIANT: 'for every action a legal in W whose image is legal in T(W): regret(T(a), T(W)) === regret(a, W) (integers, exact)',
    GREEDY_SAFE_EQUIVARIANT: 'GREEDY_SAFE(T(W)) === GREEDY_SAFE(W), GREEDY_SAFE = best-immediate action (key tie-break) in the horizon-optimal set',
    HORIZON_CLASS_EQUIVARIANT: 'classifyHorizonDependence class equal',
    POLICY_EQUIVARIANT: 'P(T(W)) === T(P(W)) as action identity (abstention equal to abstention)',
  },
  attribution: {
    method: 'for rows whose official optimal set is not equivariant, re-evaluate T(W) with a replica oracle whose continuation tie-break uses the W-frame identity of each action (inverse transform); the replica must reproduce the official oracle when given the official tie-break (fidelity checked on every 10th row, both frames)',
    TIE_BREAK_ARTIFACT: 'official not equivariant, frame-consistent replica equivariant',
    LEGAL_SURFACE_ARTIFACT: 'replica still not equivariant and the legal surface is not equivariant (kernel RETREAT prefers the x axis)',
    UNEXPLAINED: 'replica still not equivariant with an equivariant legal surface',
  },
  thresholds: {
    equivariant: 'rate >= 0.99', policyDirectionallyBiased: 'equivariance rate < 0.95',
    placementAsymmetric: 'group with >= 200 relative placements and |P(dx>0) - P(dx<0)| >= 0.05 or |P(dy>0) - P(dy<0)| >= 0.05',
    directionRotatesWithWorld: 'for T moving EAST: P(T(EAST) optimal in T(W) | EAST optimal in W) >= 0.9 and at least 0.3 above P(EAST optimal in T(W) | EAST optimal in W)',
  },
  classification: {
    A_INTENTIONAL_TASK_PROPERTY: 'the source audit locates a documented directional intent',
    B_ACCIDENTAL_SCENARIO_GENERATION_ASYMMETRY: 'a generator directional asymmetry is located in source AND a placement asymmetry is measured',
    C_ACTION_IDENTITY_ORDERING_ARTIFACT: 'lowest-identity MOVE = EAST is proven AND (TIE_BREAK_ARTIFACT share of axis-preserving transform rows > 0.01 OR an identity-tie-breaking policy is directionally biased)',
    D_TOPOLOGY_ORIENTATION_ARTIFACT: 'topology/structural, critical or dependency-hub placement is asymmetric',
    E_OBJECTIVE_RESOURCE_PLACEMENT_ARTIFACT: 'resource or objective placement is asymmetric AND EAST optimality rotates with the world',
    primary: 'F_MIXTURE when two or more components hold; the single component when exactly one holds; NONE_ESTABLISHED otherwise',
  },
  prohibited: ['modifying Forge generators, kernel, corpora or any historical evidence', 'modifying any policy', 'router training', 'new spatial features', 'Stage 3G'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const STAGE3F6P1B_PLAN_HASH = sha256(STAGE3F6P1B_PLAN);
export const STAGE3F6P1B_PLAN_PATH = 'artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-analysis-plan.json';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await mkdir(path.join(root, 'artifacts/stage3f6p1b-directional-symmetry'), { recursive: true });
  await writeFile(path.join(root, STAGE3F6P1B_PLAN_PATH), `${JSON.stringify({ ...STAGE3F6P1B_PLAN, planHash: STAGE3F6P1B_PLAN_HASH }, null, 2)}\n`);
  console.log(STAGE3F6P1B_PLAN_HASH);
}
