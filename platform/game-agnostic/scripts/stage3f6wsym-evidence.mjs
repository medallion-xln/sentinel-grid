/* STAGE_3F_6_W_SYM — per-row risk evidence (in-process; nothing is written).
 *
 * For one stored corpus row: rebuilds the world (hash must match), presents the symmetric decision surface the
 * policies saw, and records
 *   risk        the unmodified Stage 3F.6-W risk extractor on { observation, legalActions } (decision-time only)
 *   diagnostic  the unmodified Stage 3F.6-W objective / absolute-spatial / temporal diagnostic evidence
 *   priv        DIAGNOSTIC, UNAVAILABLE at decision time: kernel-position movement geometry of the RESOURCE choice and
 *               of the best-approaching candidate (the hidden-geometry proxy test)
 *   relabel     the risk vector recomputed on a reversed, identity-relabelled surface (must be identical)
 *   twins       on the stored equivariance sample, risk and diagnostic evidence of every D4 twin (compared, not kept)
 * plus the certified Stage 3F.6-P.1E policy evidence (identity-permuted and D4-twin policy choices).
 */
import { hashWorld } from '../src/forge/kernel.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { TRANSFORM_EQUIVALENT, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { extractDecisionRiskState } from '../src/stage3f/decision-risk-state-v1.js';
import { PRIVILEGED_RELATIONS, privilegedRelations } from '../src/stage3f/free-action-sufficiency-v1.js';
import { RISK_FIELD_IDS, compactRisk } from '../src/stage3f/risk-requalification-v1.js';
import { diagnosticEvidence } from './generate-stage3f6w-risk-evidence.mjs';
import { evidenceFor, policySurface } from './generate-stage3f6p1e-policy-evidence.mjs';
import { rebuildWorld } from './stage3f6p1asym-evidence.mjs';

const K16 = (k) => k.slice(0, 16);
export const TWIN_TRANSFORMS = Object.freeze(['ROTATE_90', 'ROTATE_180', 'ROTATE_270', 'REFLECT_X', 'REFLECT_Y']);
export const PRIV_FEATURES = Object.freeze([...PRIVILEGED_RELATIONS.map((r) => `priv.resourceMove.${r}`), ...PRIVILEGED_RELATIONS.map((r) => `priv.bestApproach.${r}`)]);
const observe = (world) => forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);
const legalOf = (surface) => surface.map((e) => ({ actionId: e.actionId, actionType: e.actionType, targetEntityId: e.targetEntityId, parameters: e.action.parameters ?? {} }));
const same = (a, b) => (JSON.stringify(a) === JSON.stringify(b) ? 1 : 0);

function riskAndDiagnostic(world) {
  const surface = policySurface(world);
  const observation = observe(world);
  const legal = legalOf(surface);
  return { surface, legal, risk: compactRisk(extractDecisionRiskState({ observation, legalActions: legal })), diagnostic: diagnosticEvidence(observation) };
}

export function riskEvidence(row) {
  const policy = evidenceFor(row);
  const world = rebuildWorld(row);
  const { surface, legal, risk, diagnostic } = riskAndDiagnostic(world);

  /* identity relabelling + candidate order: reversed surface, opaque identities */
  const relabelled = [...legal].reverse().map((a, i) => ({ ...a, actionId: `z${String(i).padStart(4, '0')}` }));
  const risk2 = compactRisk(extractDecisionRiskState({ observation: observe(world), legalActions: relabelled }));

  /* privileged movement geometry (diagnostic only) */
  const byKey = new Map(); for (const e of surface) if (!byKey.has(K16(e.actionId))) byKey.set(K16(e.actionId), e.action);
  const deltas = privilegedRelations(world, [...byKey]);
  const resKey = row.policies.RESOURCE_PRESERVING_V1;
  const resMove = resKey !== null && deltas.has(resKey) ? deltas.get(resKey) : PRIVILEGED_RELATIONS.map(() => 0);
  const approach = PRIVILEGED_RELATIONS.map((_, j) => Math.min(...[...deltas.values()].map((d) => d[j])));
  const priv = Object.fromEntries(PRIV_FEATURES.map((k, i) => [k, i < PRIVILEGED_RELATIONS.length ? resMove[i] : approach[i - PRIVILEGED_RELATIONS.length]]));

  let twins = null;
  if (row.equivariance !== null) {
    twins = {};
    for (const transform of TWIN_TRANSFORMS) {
      const t = riskAndDiagnostic(orientWorld(TRANSFORM_EQUIVALENT[transform], world));
      twins[transform] = { risk: Object.fromEntries(RISK_FIELD_IDS.map((id) => [id, same(t.risk.value[id], risk.value[id]) && t.risk.status[id] === risk.status[id] ? 1 : 0])),
        objective: same(t.diagnostic.objective, diagnostic.objective), spatial: same(t.diagnostic.spatial, diagnostic.spatial), temporal: same(t.diagnostic.temporal, diagnostic.temporal) };
    }
  }
  return {
    recordHash: row.recordHash,
    fidelity: { ...policy.fidelity, world: hashWorld(world) === row.worldHash ? 1 : 0,
      relabel: RISK_FIELD_IDS.every((id) => risk2.value[id] === risk.value[id] && risk2.status[id] === risk.status[id]) ? 1 : 0 },
    risk: risk.value, status: risk.status, diagnostic, priv, twins,
    policy: { idReversed: policy.idReversed, idPermuted: policy.idPermuted, twins: policy.twins },
  };
}
