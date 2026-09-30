import { stableStringify } from '../../src/core/determinism.js';
import { deployableSearch } from '../../src/stage3g/deployable-action-model-v1.js';
import { buildObservableEntityState } from '../../src/stage3g/observable-entity-state-v1.js';
import { deriveActionSemantics } from '../../src/stage3g/action-semantics-v1.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, orientAction, orientWorld } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { searchValues } from '../stage3g4/evidence.mjs';
import { stage3gEvidence, observableView, renameObservation } from '../stage3g/evidence.mjs';
import { isEligible, rebuildWorld, TWIN_TRANSFORMS } from '../stage3f6p1asym-evidence.mjs';
import { boundedValues, effectAudit } from './privileged.mjs';
export { isEligible };
const k16 = k => k.slice(0,16);
function observableBlocks(v) {
  return v.semantics.map(s => [0,1,2,3].map(d => deployableSearch(v.state,v.visibleMap,s,d).features));
}
export function stage3g5Evidence(row, { integrity = row.equivariance !== null, privileged = true, depth3 = false } = {}) {
  const base = stage3gEvidence(row, { integrity });
  const world = rebuildWorld(row); const view = observableView(world); const size = world.grid.width;
  const descriptors = observableBlocks(view);
  const byKey = new Map(view.surface.map((e,i) => [k16(e.actionId),{ action:e.action, deployable:descriptors[i] }]));
  const D = depth3 ? 3 : 2;
  const candidates = base.candidates.map(c => {
    const b = byKey.get(c.key);
    return {...c, deployable:b.deployable, ...(privileged ? {
      known: searchValues(world,b.action,D), noEnv:boundedValues(world,b.action,D,'NO_ENV'),
      noHostile:boundedValues(world,b.action,D,'NO_HOSTILE'), noHazard:boundedValues(world,b.action,D,'NO_HAZARD'),
    } : {}) };
  });
  let d4 = null; let idOrder = null;
  if (integrity) {
    d4 = {};
    for (const t of TWIN_TRANSFORMS) {
      const o = TRANSFORM_EQUIVALENT[t]; const v = observableView(orientWorld(o,world)); const blocks = observableBlocks(v);
      const map = new Map(v.surface.map((e,i)=>[k16(canonicalActionKey('R0',orientAction(INVERSE_ORIENTATION[o],e.action,size),size)),blocks[i]]));
      d4[t] = candidates.every(c => stableStringify(map.get(c.key)) === stableStringify(c.deployable)) ? 1 : 0;
    }
    const names = new Map(view.visibleMap.entities.map((e,i) => [e.id,`opaque-${view.visibleMap.entities.length-i}`]));
    const rn = renameObservation(view,id=>names.get(id)); const surf = [...rn.surface].reverse().map((e,i)=>({...e,actionId:`renamed-${i}`}));
    const state = buildObservableEntityState({observation:rn.observation,visibleMap:rn.visibleMap});
    const semantics = deriveActionSemantics({state,visibleMap:rn.visibleMap,legalActions:surf});
    const blocks = observableBlocks({state,visibleMap:rn.visibleMap,semantics});
    idOrder = blocks.every((b,i) => stableStringify(b) === stableStringify(descriptors[descriptors.length-1-i])) ? 1 : 0;
  }
  return {...base,candidates,labelHorizon:row.horizon, deployableD4:d4, deployableIdOrder:idOrder,
    effects:privileged ? effectAudit(world,[...byKey.values()].map(x=>x.action)) : null,
    depth3, knownFidelity:privileged ? (candidates.every(c=>c.known[0]===c.i && (!integrity || stableStringify(c.known)===stableStringify(boundedValues(world,byKey.get(c.key).action,D))))?1:0) : null,
    UNKNOWN_PROPAGATION:view.semantics.every(s=> { const r=deployableSearch(view.state,view.visibleMap,s,3); return r.root.actualNext.legality==='UNKNOWN' && r.conditionalLegality==='UNKNOWN' && r.root.actualNext.actorHealth==='UNKNOWN'; }) ? 1 : 0 };
}
