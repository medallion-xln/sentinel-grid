// STAGE3H_NATIVE_MENU_VALIDITY_V1 (proposed amendment O-6; requires owner approval). A deterministic, outcome-blind,
// pre-policy validity rule for native action menus. A policy-facing menu is INVALID when it is EMPTY or contains a
// DUPLICATE action id. An invalid world is rejected atomically with INVALID_REASON (no partial result, never scored,
// never replaced). The rule only reads action ids; it never repairs, deduplicates, reorders or substitutes an action,
// never reads truth, reward or any evaluator state, and never calls a policy. Any other menu anomaly (not a list, an
// entry without a non-empty string id) is not a rejection: it throws, and the replication aborts fail-closed.
export const NATIVE_MENU_VALIDITY_ID = 'STAGE3H_NATIVE_MENU_VALIDITY_V1';
export const INVALID_REASON = 'NATIVE_MENU_INVALID';
export const CAUSES = Object.freeze(['EMPTY_MENU', 'DUPLICATE_ACTION_ID']);
const ok = (v, m) => { if (!v) throw Error(m); };

/** Verdict for one menu given as its list of action ids, in presentation order. */
export function menuVerdict(ids) {
  ok(Array.isArray(ids), 'NATIVE_MENU_NOT_A_LIST');
  ok(ids.every((id) => typeof id === 'string' && id.length > 0), 'NATIVE_MENU_ENTRY_MALFORMED');
  if (ids.length === 0) return { valid: false, cause: 'EMPTY_MENU', size: 0, distinct: 0 };
  const distinct = new Set(ids).size;
  return distinct === ids.length ? { valid: true, cause: null, size: ids.length, distinct } : { valid: false, cause: 'DUPLICATE_ACTION_ID', size: ids.length, distinct };
}

/** Verdict for one public view (the surface a policy is shown). */
export function surfaceVerdict(view) {
  ok(view && Array.isArray(view.surface), 'NATIVE_MENU_NOT_A_LIST');
  return menuVerdict(view.surface.map((e) => e?.actionId));
}

/**
 * Validate every policy-facing view of one world, in a fixed order, before any policy is called. Every view is checked
 * (no short-circuit), so the verdict does not depend on view order; the reported cause is the first invalid view's.
 */
export function validatePolicyFacingViews(views) {
  ok(Array.isArray(views) && views.length > 0 && new Set(views.map((v) => v.label)).size === views.length, 'POLICY_FACING_VIEWS_INVALID');
  const perView = views.map(({ label, view }) => ({ label, ...surfaceVerdict(view) }));
  const invalid = perView.filter((v) => !v.valid);
  if (invalid.length === 0) return { valid: true, views: perView.length, invalidViews: 0 };
  return { valid: false, reason: INVALID_REASON, cause: invalid[0].cause, firstInvalidView: invalid[0].label, views: perView.length, invalidViews: invalid.length,
    causes: [...new Set(invalid.map((v) => v.cause))].sort() };
}

/**
 * Dynamic (multi-decision) contexts. A menu that only materializes after earlier decisions can be validated no earlier
 * than when it materializes; the earliest lawful point is immediately before the policy is called on it. On an invalid
 * menu the whole episode is rejected atomically: earlier decisions are discarded, never returned, scored or written.
 * Because such a rejection can depend on which decisions were taken, a caller running several arms must reject the world
 * for every arm and record it as arm-dependent. The registered single-decision Forge protocol has no such context.
 */
export function atomicDecisionEpisode({ start, menuOf, decide, advance, decisions }) {
  ok(Number.isInteger(decisions) && decisions > 0, 'INVALID_DECISION_COUNT');
  let state = start; const taken = [];
  for (let i = 0; i < decisions; i++) {
    const menu = menuOf(state, i), v = menuVerdict(menu);
    if (!v.valid) return { rejected: { reason: INVALID_REASON, cause: v.cause, atDecision: i, armDependent: i > 0 } };
    const choice = decide(state, menu, i);
    ok(menu.includes(choice), 'ILLEGAL_DECISION');
    taken.push(choice); state = advance(state, choice, i);
  }
  return { decisions: taken, state };
}
