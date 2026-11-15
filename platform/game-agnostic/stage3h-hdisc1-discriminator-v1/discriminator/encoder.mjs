// SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1 — Component A: public decision-state encoder (the game-agnostic part).
//
// An encoder turns ONE public decision state and its COMPLETE lawful menu into what the comparator may look at:
//   context      c         numbers shared by every action of the menu
//   descriptors  phi_i     numbers describing action i (identity-free, frame-invariant)
//   relations    rho_ij    numbers describing the ORDERED pair (i, j) (public, identity-free, frame-invariant)
// together with, per action: a canonical key and listing signature, the outcome of public deterministic constraints,
// and whether the action is SUPPORTED (every input present, finite and inside the encoder's vocabulary).
// An encoder never drops an action: an unsupported or excluded action stays in the menu and is reported as such.
// It never imputes: a missing public field makes the affected actions unsupported.
// Pure: no import, no file, clock, random or environment access.

export class EncoderRejection extends Error { constructor(code, detail = '') { super(detail ? `${code}:${detail}` : code); this.name = 'EncoderRejection'; this.code = code; this.detail = detail; } }
const reject = (code, detail) => { throw new EncoderRejection(code, detail); };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Sum that does not depend on the order of its terms (sort, then add): keeps every menu statistic permutation-invariant. */
export const stableSum = (xs) => { const s = [...xs].sort((a, b) => a - b); let t = 0; for (const x of s) t += x; return t; };
export const stableMean = (xs) => (xs.length ? stableSum(xs) / xs.length : 0);

/** Structural check of an encoding against the menu it was built from. Throws; never repairs. */
export function assertEncoding(enc, n) {
  if (!enc || typeof enc !== 'object') reject('ENCODING_NOT_AN_OBJECT'); const S = enc.schema;
  if (!S || typeof S.id !== 'string' || ![S.descriptor, S.relation, S.context].every((a) => Array.isArray(a) && a.every((x) => typeof x === 'string' && x))) reject('ENCODING_SCHEMA_MALFORMED');
  for (const f of ['keys', 'signatures', 'types', 'excluded', 'supported', 'unsupportedReasons', 'descriptors', 'constraints']) if (!Array.isArray(enc[f]) || enc[f].length !== n) reject('ENCODING_DOES_NOT_COVER_THE_WHOLE_MENU', f); // the whole menu or nothing
  if (!Array.isArray(enc.context) || enc.context.length !== S.context.length) reject('ENCODING_CONTEXT_WIDTH'); if (typeof enc.relation !== 'function') reject('ENCODING_RELATION_MISSING');
  for (let i = 0; i < n; i++) { if (typeof enc.keys[i] !== 'string' || !enc.keys[i] || typeof enc.signatures[i] !== 'string' || typeof enc.types[i] !== 'string' || !enc.types[i]) reject('ENCODING_ACTION_IDENTITY_MISSING', String(i));
    if (typeof enc.excluded[i] !== 'boolean' || typeof enc.supported[i] !== 'boolean' || !Array.isArray(enc.unsupportedReasons[i])) reject('ENCODING_FLAGS_MALFORMED', String(i));
    if (!Array.isArray(enc.descriptors[i]) || enc.descriptors[i].length !== S.descriptor.length) reject('ENCODING_DESCRIPTOR_WIDTH', String(i));
    const complete = enc.descriptors[i].every(finite); if (enc.supported[i] && !complete) reject('ENCODING_SUPPORTED_ACTION_WITH_MISSING_INPUT', String(i)); if (!enc.supported[i] && !enc.unsupportedReasons[i].length) reject('ENCODING_UNSUPPORTED_WITHOUT_A_REASON', String(i)); }
  if (enc.supported.some(Boolean) && !enc.context.every(finite)) reject('ENCODING_SUPPORTED_MENU_WITH_MISSING_CONTEXT');
  return true;
}
/** Select named columns of an encoding in the order a parameter set expects; null when a name is unknown to the encoder. */
export function project(enc, layout) {
  const pick = (have, want) => { const idx = want.map((nm) => have.indexOf(nm)); return idx.some((i) => i < 0) ? null : idx; };
  const di = pick(enc.schema.descriptor, layout.descriptor), ri = pick(enc.schema.relation, layout.relation), ci = pick(enc.schema.context, layout.context);
  if (!di || !ri || !ci) return null;
  return { descriptor: (i) => di.map((j) => enc.descriptors[i][j]), relation: (i, j) => { if (!ri.length) return []; const r = enc.relation(i, j); return r === null ? null : ri.map((q) => r[q]); }, context: ci.map((j) => enc.context[j]) };
}

/**
 * A declarative encoder for SYNTHETIC menus (contract tests, mathematical witnesses, the R0 demonstration).
 * Actions carry { key, type, descriptor: { name: number } }; the state may carry { context: { name: number } }.
 * relation entries are { name, of(da, db) } with `of` a pure function of the two actions' descriptors.
 * It knows nothing about any game and is never used on a native world.
 */
export function makeSyntheticEncoder({ id, descriptor, context = [], relation = [] }) {
  if (typeof id !== 'string' || !id.startsWith('SYNTHETIC_')) reject('SYNTHETIC_ENCODER_ID_MUST_SAY_SO', String(id));
  const schema = Object.freeze({ id, descriptor: Object.freeze([...descriptor]), relation: Object.freeze(relation.map((r) => r.name)), context: Object.freeze([...context]) });
  const encode = (state, legalActions) => {
    const n = legalActions.length, descriptors = legalActions.map((a) => descriptor.map((nm) => (finite(a.descriptor?.[nm]) ? a.descriptor[nm] : null))), ctx = context.map((nm) => (finite(state?.context?.[nm]) ? state.context[nm] : null));
    const ctxOk = ctx.every(finite), supported = legalActions.map((a, i) => a.supported !== false && ctxOk && descriptors[i].every(finite));
    return { schema, keys: legalActions.map((a) => a.key), signatures: legalActions.map((a) => (typeof a.signature === 'string' ? a.signature : a.key)), types: legalActions.map((a) => a.type), excluded: legalActions.map((a) => a.excluded === true), supported,
      unsupportedReasons: legalActions.map((a, i) => (supported[i] ? [] : [a.supported === false ? 'ACTION_DECLARED_UNSUPPORTED' : !ctxOk ? 'MISSING_PUBLIC_CONTEXT' : 'MISSING_PUBLIC_DESCRIPTOR'])),
      descriptors, context: ctx, constraints: legalActions.map((a) => (a.excluded === true ? [{ code: 'SYNTHETIC_HARD_CONSTRAINT', status: 'VIOLATED', basis: 'PUBLIC_DETERMINISTIC', hard: true }] : [])),
      relation: (i, j) => { const r = relation.map((q) => q.of(legalActions[i].descriptor ?? {}, legalActions[j].descriptor ?? {})); return r.every(finite) ? r : null; }, evidence: { status: 'NOT_USED_BY_THIS_ENCODER', issues: [] }, n };
  };
  return Object.assign(encode, { schema, encoderId: id, synthetic: true });
}
