// Proposed correction O-2R (NOT approved; NOT bound by candidate 18ff522c). An OBSERVATION-ONLY identity nuisance:
// the V3 IDENTITY transform (stage3h-final-review-handoff/amendments/v3/runner.mjs#transformSyntheticFixture, IDENTITY
// branch) applied verbatim to a native public view. The native world is never touched and native truth is never
// recomputed: the same world and the same actions are presented under renamed entity handles and opaque action handles.
export const IDENTITY_VIEW_ID = 'STAGE3H_IDENTITY_OBSERVATION_ONLY_O2R_V1';
export function identityViewTwin(publicView) {
  const v = structuredClone(publicView), originalMenu = v.surface.map((e) => e.actionId);
  const actionMap = Object.fromEntries(originalMenu.map((id, i) => [id, `opaque-${originalMenu.length - i}`]));
  const identities = new Set([v.state.actor.entityId, ...v.observation.metadata.canonicalState.entities.map((e) => e.id), ...v.observation.metadata.objectives.flatMap((o) => [o.id, o.entityId])]);
  const map = Object.fromEntries([...identities].sort().map((id, i) => [id, `entity-${identities.size - i}`]));
  const rename = (x) => (typeof x === 'string' ? (map[x] ?? x) : Array.isArray(x) ? x.map(rename) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, rename(val)])) : x);
  Object.assign(v, rename(v));
  v.surface = v.surface.map((e, i) => ({ ...e, actionId: actionMap[originalMenu[i]] }));
  return { view: v, actionMap, entityMap: map };
}
/** Paths whose value changed between two views (used to prove the twin differs only in identity-bearing fields). */
export function changedPaths(a, b, path = '$', out = []) {
  if (a === b) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changedPaths(a[k], b[k], path + (Array.isArray(a) ? '[]' : '.' + k), out);
    return out;
  }
  out.push(path); return out;
}
