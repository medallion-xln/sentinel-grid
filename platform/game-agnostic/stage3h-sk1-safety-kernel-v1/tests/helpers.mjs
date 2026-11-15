// Test helpers: a hand-built, asymmetric Forge public projection with canonical evidence, and a toy risk model.
// Synthetic by construction — no population world, seed or outcome is involved.
import { makeForgeFeaturizer, forgeRequest, FORGE_OBSERVATION_CONTRACT } from '../adapters/forge/features.mjs';
import { EVIDENCE_CONTRACT } from '../adapters/forge/evidence.mjs';
import { sha256 } from '../kernel/contract.mjs';

const F0 = { hostile: false, critical: false, resource: false, objective: false, inService: true, threatened: false, hub: false };
export const node = (kind, dx, dy, flags = {}, obj = []) => ({ kind, rel: { dx, dy }, dist: { manhattan: Math.abs(dx) + Math.abs(dy), path: Math.abs(dx) + Math.abs(dy) }, dir: { sx: Math.sign(dx), sy: Math.sign(dy) }, flags: { ...F0, ...flags }, rels: [], obj });
export const act = (type, extra = {}) => ({ type, params: {}, target: null, dependent: null, disp: null, toRel: null, cost: 1, pre: ['NOT_TERMINAL:IMPLIED_BY_LEGALITY', 'ENERGY_AT_LEAST_COST:SATISFIED_OBSERVED'], eff: ['ENERGY_DELTA:E1', 'TICK_ADVANCE:E1'], energyAfter: 39, destTerrain: null, ...extra });
export function syntheticProjection() {
  return { version: 'HW1_PUBLIC_PROJECTION_V1', tick: 5, grid: { width: 10, height: 10 }, actor: { energy: 40, health: 100, carried: 0, ticksRemaining: 15, terrain: 'TRAVERSABLE', borderDistance: 3 }, history: { n: 6, channels: [['primary', 50, 40, 50]] }, terrainCounts: { TRAVERSABLE: 100 },
    nodes: [node('HOSTILE', 2, 1, { hostile: true }), node('DEPOT', -1, 3, { objective: true, critical: true }, [[5, 2]]), node('REPAIR_TARGET', 0, -2, { inService: false, threatened: true })],
    menu: [act('WAIT', { cost: 0, energyAfter: 40 }), act('MOVE', { params: { direction: 'EAST' }, disp: { dx: 1, dy: 0 }, destTerrain: 'TRAVERSABLE', eff: ['ACTOR_DISPLACEMENT:E1', 'ENERGY_DELTA:E1', 'TICK_ADVANCE:E1'] }),
      act('MOVE', { params: { direction: 'NORTH' }, disp: { dx: 0, dy: -1 }, destTerrain: 'TRAVERSABLE', eff: ['ACTOR_DISPLACEMENT:E1', 'ENERGY_DELTA:E1', 'TICK_ADVANCE:E1'] }), act('PROTECT', { target: 1, cost: 2, energyAfter: 38, eff: ['TARGET_PROTECTED:E1', 'TICK_ADVANCE:E1'] }),
      act('REPAIR', { target: 2, cost: 3, energyAfter: 37, eff: ['TARGET_HEALTH_INCREASES:EU', 'TICK_ADVANCE:E1'] })], frame: 'R0' };
}
export const syntheticEvidence = () => ({ contract: EVIDENCE_CONTRACT, experts: { S0: { kind: 'PUBLIC_SCORE', scores: [0.1, 0.5, 0.2, 0.9, 0.3], topSet: [3] }, NEXUS: { kind: 'RECOMMENDATION_PROJECTION', abstain: false, recommendedType: 'PROTECT', rationaleCodes: ['NEXUS_BOTTLENECK'], reason: 'THREAT_DRIVEN_PREFERENCE' } } });
export const VOCAB = { nexusCodes: ['NEXUS_BOTTLENECK'], nexusReasons: ['THREAT_DRIVEN_PREFERENCE'] };

/** A toy model for the featurizer schema: MOVE is scored riskier; being in the S0 top set lowers predicted regret. */
export function toyModel(overrides = {}) {
  const feat = makeForgeFeaturizer({ useEvidence: overrides.useEvidence !== false, ...VOCAB }), names = feat.schema.names, col = (n) => { const i = names.indexOf(n); if (i < 0) throw Error('no feature ' + n); return i; };
  const leaf = (v) => ({ f: [-1], t: [0], l: [-1], r: [-1], v: [v] }), split = (name, left, right) => ({ f: [col(name), -1, -1], t: [0.5, 0, 0], l: [1, -1, -1], r: [2, -1, -1], v: [0, left, right] });
  const logit = (p) => Math.log(p / (1 - p)), useEv = overrides.useEvidence !== false;
  const model = { modelId: 'SK1_TOY_TEST_MODEL', kernelId: 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1', observationContract: FORGE_OBSERVATION_CONTRACT, evidenceContract: feat.evidenceContract, featurizer: feat.config, schema: { id: feat.schema.id, names: [...names] },
    uncertainty: { method: 'TOY' }, envelope: { min: names.map(() => -1e9), max: names.map(() => 1e9) }, novelty: { columns: feat.categoricalColumns, seen: feat.categoricalColumns.map(() => 1) },
    heads: { risk: { link: 'logit', bags: [{ base: logit(0.10), trees: [split('type.MOVE', 0, 1.5)] }, { base: logit(0.12), trees: [split('type.MOVE', 0, 1.7)] }] },
      regret: { link: 'identity', bags: [{ base: 0.5, trees: [useEv ? split('ev.s0.inTop', 0, -0.3) : split('type.PROTECT', 0, -0.3), split('type.WAIT', 0, 0.2)] }] } },
    ranking: { contract: 'SK1_TIERED_RISK_THEN_REGRET_V1', z: 1, tierWidth: 0.1, tau: 0.5, oodPenalty: 0.05, requireEvidence: useEv, ...(overrides.ranking ?? {}) },
    calibration: { bins: [] }, qualification: { status: 'NOT_QUALIFIED', statement: 'toy test model' }, training: {} };
  if (overrides.mutate) overrides.mutate(model, col);
  model.modelHash = sha256(JSON.stringify(model)); return { model, feat };
}
export { forgeRequest };
