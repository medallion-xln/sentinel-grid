// Component A — Native Action Semantics.
// Inspects EVERY action of the complete lawful menu. It applies only constraints that an adapter declares as
// publicly established and deterministic. It never removes a lawful action because of an assumption about a hidden
// outcome: an action is excluded only when a HARD constraint is VIOLATED on public, deterministic grounds.
// Everything else (unknown preconditions, uncertain effects, public hazards) is carried forward as an annotation.
import { KernelRejection, REASON } from './contract.mjs';

const STATUS = new Set(['SATISFIED', 'VIOLATED', 'UNKNOWN']);

/** featurized: the adapter's output. Returns one semantics entry per menu action, in menu order. */
export function assessSemantics(featurized, menuSize) {
  const { keys, signatures, selectable, constraints, annotations } = featurized;
  for (const [name, arr] of Object.entries({ keys, signatures, selectable, constraints, annotations }))
    if (!Array.isArray(arr) || arr.length !== menuSize) throw new KernelRejection('ADAPTER_OUTPUT_INCOMPLETE', name); // the whole menu or nothing
  const anyFixed = selectable.some(Boolean);
  return keys.map((key, i) => {
    if (typeof key !== 'string' || !key || typeof signatures[i] !== 'string') throw new KernelRejection('ACTION_KEY_MISSING', String(i));
    const cs = constraints[i].map((c) => { if (!c || typeof c.code !== 'string' || !STATUS.has(c.status)) throw new KernelRejection('MALFORMED_CONSTRAINT', String(i)); return { code: c.code, status: c.status, basis: c.basis ?? 'UNSPECIFIED', hard: c.hard === true }; });
    const violated = cs.filter((c) => c.hard && c.status === 'VIOLATED' && c.basis === 'PUBLIC_DETERMINISTIC').map((c) => c.code);
    const excluded = violated.length > 0;
    // deterministic-equivariance rule: when the public state has a non-trivial symmetry, only actions fixed by it can be
    // named without an arbitrary choice; if no action is fixed, every action stays selectable.
    const notSelectable = anyFixed && !selectable[i];
    return { index: i, key, signature: signatures[i], constraints: cs, violatedHardConstraints: violated, excluded, selectable: !excluded && !notSelectable,
      unknownConstraints: cs.filter((c) => c.status === 'UNKNOWN').map((c) => c.code), annotations: [...annotations[i]],
      reasons: [...(excluded ? [REASON.EXCLUDED_BY_PUBLIC_CONSTRAINT] : []), ...(notSelectable ? [REASON.NOT_SELECTABLE_SYMMETRIC_ORBIT] : [])] };
  });
}
