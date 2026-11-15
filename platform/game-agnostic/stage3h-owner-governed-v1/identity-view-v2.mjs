// Proposed correction O-2R.1 (NOT approved). identity-view.mjs (bound by candidate e70625d1) applied the V3 IDENTITY
// transform verbatim; on native views that left the original action handles in semantics[].ACTION_ID
// (evidence/o2r-gate-diagnosis.json), so twin handles were not opaque. O-2R.1 = the same transform, then every string
// value equal to an original action handle, anywhere in the view, is replaced by its opaque handle, exactly as entity
// ids are replaced everywhere. Public view only: no world, no kernel, no evaluator.
import { identityViewTwin } from './identity-view.mjs';
export const IDENTITY_VIEW_V2_ID = 'STAGE3H_IDENTITY_OBSERVATION_ONLY_O2R1_V1';
export function identityViewTwinV2(publicView) {
  const t = identityViewTwin(publicView), map = t.actionMap;
  const remap = (x) => (typeof x === 'string' ? (Object.hasOwn(map, x) ? map[x] : x) : Array.isArray(x) ? x.map(remap) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, remap(v)])) : x);
  return { view: remap(t.view), actionMap: map, entityMap: t.entityMap };
}
