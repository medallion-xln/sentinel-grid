// SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1 — the inference-side contracts, as implemented for H-DISC-1.
//
// This is the H-DISC-0 contract (stage3h-hdisc0-design-v1/contract/pairwise-contract.mjs) carried into the
// discriminator: the public-information boundary, the pairwise comparator contract, the menu ranking contract and the
// provenance check. Supported-input behavior retains the reference contract. Unsupported singleton handling is hardened;
// discriminator/conformance.test.mjs compares inherited behavior and boundary-regressions.test.mjs covers the repair.
// ONE THING IS DELIBERATELY ABSENT: the offline safety-LABEL contract. Label handling belongs to authorised offline
// training and evaluation and has no place in an inference closure, so no label code is reachable from the entry point.
// Pure: no file, network, clock, random or environment access. No import.

export const IDS = Object.freeze({ discriminator: 'SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1', pairContract: 'HDISC_PAIRWISE_COMPARATOR_CONTRACT_V1', labelContract: 'HDISC_SAFETY_LABEL_CONTRACT_V1', rankingContract: 'HDISC_MENU_RANKING_CONTRACT_V1',
  status: 'DESIGN_REFERENCE_NOT_A_TRAINED_MODEL', competence: 'NOT_A_COMPETENCE_DEMONSTRATION' });
export const AUTHORITY = Object.freeze({ state: 'R0', mode: 'OBSERVATION_AND_RECOMMENDATION_ONLY', canDispatch: false, canMutateLiveWorld: false, promotedToRuntime: false });
export const EPISTEMIC = Object.freeze({ status: 'RELATIVE_EMPIRICAL_ESTIMATE_NOT_A_GUARANTEE', statement: 'A pairwise value is an empirical estimate that one action is safer than another, learned from finite development data under one observation contract. It is not a guarantee about either action, and it says nothing about actions whose safety depends on state that is not publicly observable.' });

export class ContractRejection extends Error { constructor(code, detail = '') { super(detail ? `${code}:${detail}` : code); this.name = 'ContractRejection'; this.code = code; this.detail = detail; } }
const reject = (code, detail) => { throw new ContractRejection(code, detail); };

// ---------------------------------------------------------------- public-information boundary
// Keys are normalised (case and separators removed) and matched on stems, so variants are caught as well.
const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const PRIVILEGED_STEMS = ['truth', 'utilit', 'regret', 'nreg', 'catastroph', 'label', 'outcome', 'oracle', 'rollout', 'evaluator', 'seed', 'worldhash', 'sourcestatehash', 'hiddenvalue', 'hiddenhealth', 'hiddenstate', 'member', 'counterfactual', 'intros0', 'intronexus', 'introvs', 'introduc'];
const EXECUTION_STEMS = ['execut', 'dispatch', 'mutat', 'actuat', 'sendtoworld', 'commitaction', 'applyaction', 'perform', 'enact'];
const EXECUTION_EXACT = ['apply', 'commit', 'act', 'write', 'run'];
const IDENTIFIER_KEYS = ['id', 'handle', 'name', 'menuindex', 'menuposition', 'position', 'ordinal', 'slot'];
/** Rejects evaluator outputs, hidden quantities, execution requests and arbitrary identifiers anywhere in a request. */
export function assertPublicRequest(value, path = 'request', depth = 0) {
  if (depth > 12) reject('REQUEST_TOO_DEEP', path);
  if (Array.isArray(value)) { value.forEach((x, i) => assertPublicRequest(x, `${path}[${i}]`, depth + 1)); return; }
  if (value && typeof value === 'object') for (const k of Object.keys(value)) { const n = norm(k);
    if (PRIVILEGED_STEMS.some((s) => n.includes(s))) reject('PRIVILEGED_FIELD_IN_REQUEST', `${path}.${k}`);
    if (EXECUTION_STEMS.some((s) => n.includes(s)) || EXECUTION_EXACT.includes(n)) reject('EXECUTION_OR_MUTATION_REQUESTED', `${path}.${k}`);
    if ((path.includes('.descriptor') || path.includes('.legalActions')) && IDENTIFIER_KEYS.includes(n)) reject('ARBITRARY_IDENTIFIER_IN_DESCRIPTOR', `${path}.${k}`);
    assertPublicRequest(value[k], `${path}.${k}`, depth + 1); }
}
/** Advisory evidence: only the explicitly valid contract, experts and projection kinds. Anything else is refused, not ignored. */
export const EVIDENCE = Object.freeze({ contract: 'SK1_ADVISORY_EVIDENCE_V1', experts: Object.freeze({ S0: 'PUBLIC_SCORE', NEXUS: 'RECOMMENDATION_PROJECTION' }) });
export function assertSupportedEvidence(evidence) {
  if (evidence === null || evidence === undefined) return { status: 'ABSENT' };
  if (typeof evidence !== 'object' || Array.isArray(evidence)) reject('UNSUPPORTED_EXPERT_EVIDENCE', 'not an object');
  if (evidence.contract !== EVIDENCE.contract) reject('UNSUPPORTED_EXPERT_EVIDENCE', `contract=${String(evidence.contract)}`);
  if (!evidence.experts || typeof evidence.experts !== 'object') reject('UNSUPPORTED_EXPERT_EVIDENCE', 'experts missing');
  for (const [name, e] of Object.entries(evidence.experts)) { if (!(name in EVIDENCE.experts)) reject('UNSUPPORTED_EXPERT_EVIDENCE', `expert=${name}`); if (!e || e.kind !== EVIDENCE.experts[name]) reject('UNSUPPORTED_EXPERT_EVIDENCE', `${name}.kind=${String(e?.kind)}`); }
  return { status: 'VALID', experts: Object.keys(evidence.experts).sort() };
}
/** The menu: complete, lawful, identified only by canonical keys (identity-free), never by position or handle. */
export function assertMenu(actions) {
  if (!Array.isArray(actions)) reject('LEGAL_ACTIONS_NOT_AN_ARRAY'); if (actions.length === 0) reject('EMPTY_LEGAL_MENU'); if (actions.length > 4096) reject('LEGAL_MENU_TOO_LARGE');
  actions.forEach((a, i) => { if (!a || typeof a !== 'object' || Array.isArray(a)) reject('MALFORMED_ACTION', String(i)); if (typeof a.key !== 'string' || !a.key) reject('ACTION_KEY_MISSING', String(i)); if (typeof a.type !== 'string' || !a.type) reject('ACTION_TYPE_MISSING', String(i));
    if (a.descriptor === undefined || a.descriptor === null || typeof a.descriptor !== 'object') reject('ACTION_DESCRIPTOR_MISSING', String(i)); });
  return actions.length;
}

// ---------------------------------------------------------------- HDISC_PAIRWISE_COMPARATOR_CONTRACT_V1
// Semantics. For actions a and b of ONE decision state, with L(.) the offline unsafe indicator (union introduction):
//     p(a, b) = P( L(a) < L(b) ) + 1/2 * P( L(a) = L(b) )
// "the probability that a is safer than b, counting an indistinguishable pair as one half". Hence, exactly,
//     p(a, b) + p(b, a) = 1      and      p(a, a) = 1/2 .
// A comparator must satisfy this by construction, not approximately. antisymmetrize() gives any raw pair scorer that
// property; nothing gives it transitivity, which is why the ranking contract must handle cycles.
const sigmoid = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));
/** raw(da, db, context) -> any real number meaning "evidence that a is safer than b". Returns an antisymmetric probability. */
export function antisymmetrize(raw) {
  return (da, db, context) => { const f = raw(da, db, context), g = raw(db, da, context); if (typeof f !== 'number' || typeof g !== 'number' || !Number.isFinite(f) || !Number.isFinite(g)) return null; const l = (f - g) / 2; return l === 0 ? 0.5 : sigmoid(l); };
}
const TOL = 1e-12;
/** Structural check of a complete comparison matrix. P[i][j] = p(action i safer than action j); null = no supported comparison. */
export function assertComparisonMatrix(P, n) {
  if (!Array.isArray(P) || P.length !== n || P.some((row) => !Array.isArray(row) || row.length !== n)) reject('COMPARISON_MATRIX_SHAPE');
  for (let i = 0; i < n; i++) { if (P[i][i] !== 0.5) reject('COMPARISON_DIAGONAL_NOT_ONE_HALF', String(i));
    for (let j = i + 1; j < n; j++) { const a = P[i][j], b = P[j][i]; if (a === null && b === null) continue; if (a === null || b === null) reject('COMPARISON_SUPPORT_NOT_SYMMETRIC', `${i},${j}`);
      if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) reject('COMPARISON_NOT_FINITE', `${i},${j}`); if (a < 0 || a > 1 || b < 0 || b > 1) reject('COMPARISON_OUT_OF_RANGE', `${i},${j}`);
      if (Math.abs(a + b - 1) > TOL) reject('PAIRWISE_SCORES_INCONSISTENT', `${i},${j}:${a}+${b}`); } }
}
/** Evaluate a comparator on every ordered pair. BOTH directions are computed and must agree; a comparator is never trusted to be antisymmetric. */
export function compareAll(actions, comparator, context = null) {
  const n = assertMenu(actions), P = Array.from({ length: n }, () => Array(n).fill(null)), issues = [];
  for (let i = 0; i < n; i++) { P[i][i] = 0.5; for (let j = i + 1; j < n; j++) {
    const sup = actions[i].supported !== false && actions[j].supported !== false, a = sup ? comparator(actions[i].descriptor, actions[j].descriptor, context) : null, b = sup ? comparator(actions[j].descriptor, actions[i].descriptor, context) : null;
    const ok = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
    if (!sup) issues.push({ pair: [i, j], code: 'ACTION_WITHOUT_SUPPORTED_EVIDENCE' });
    else if (!ok(a) || !ok(b)) issues.push({ pair: [i, j], code: 'COMPARISON_MISSING_OR_INVALID' });
    else if (Math.abs(a + b - 1) > TOL) issues.push({ pair: [i, j], code: 'PAIRWISE_SCORES_INCONSISTENT' }); // reported and withheld; never averaged into shape
    else { P[i][j] = a; P[j][i] = b; } } }
  assertComparisonMatrix(P, n); return { P, issues };
}

// ---------------------------------------------------------------- HDISC_MENU_RANKING_CONTRACT_V1
// Order of precedence for the COMPLETE menu (lower is better at each step):
//   1. public deterministic constraints   an excluded action ranks last and is never in the top set (unchanged from SK1)
//   2. support                            an action with any unsupported comparison against a supported candidate ranks below
//   3. relative safety score              S(a) = mean over the other supported candidates b of p(a, b); higher is safer
//   4. worst-case comparison              R(a) = min over b of p(a, b); higher is safer
// Actions exactly equal on 1-4 are indistinguishable to the discriminator and are returned TOGETHER. No identifier,
// handle, menu position or lexical order prefers one of them: the canonical signature only orders how a set is LISTED.
// Cycles in the majority relation do not block the ranking (S is always a total preorder) but they are reported, and a
// top set that touches a cycle is flagged: the pairwise evidence does not support a strict order there.
/** Sum that does not depend on the order of the terms: sort, then add. Makes the ranking exactly permutation-invariant. */
const stableMean = (xs) => { const s = [...xs].sort((a, b) => a - b); let t = 0; for (const x of s) t += x; return t / s.length; };
function stronglyConnected(n, edge) { // Tarjan, iterative-free for small n
  let idx = 0; const index = Array(n).fill(-1), low = Array(n).fill(0), on = Array(n).fill(false), st = [], out = [];
  const visit = (v) => { index[v] = low[v] = idx++; st.push(v); on[v] = true; for (let w = 0; w < n; w++) if (w !== v && edge(v, w)) { if (index[w] < 0) { visit(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], index[w]); }
    if (low[v] === index[v]) { const c = []; let w; do { w = st.pop(); on[w] = false; c.push(w); } while (w !== v); out.push(c); } };
  for (let v = 0; v < n; v++) if (index[v] < 0) visit(v); return out;
}
export function rankMenu(actions, P, { majorityMargin = 0 } = {}) {
  const n = assertMenu(actions); assertComparisonMatrix(P, n); if (!(majorityMargin >= 0 && majorityMargin < 0.5)) reject('RANKING_OPTION_INVALID', 'majorityMargin');
  const keys = actions.map((a) => a.key), sig = actions.map((a) => (typeof a.signature === 'string' ? a.signature : a.key)), excluded = actions.map((a) => a.excluded === true), cand = [...Array(n).keys()].filter((i) => !excluded[i]);
  // an action is supported when every comparison against another candidate that is itself comparable is present
  const hasAny = (i) => cand.some((j) => j !== i && P[i][j] !== null), comparable = cand.filter((i) => actions[i].supported !== false && (cand.length === 1 || hasAny(i)));
  const supported = comparable.filter((i) => comparable.every((j) => j === i || P[i][j] !== null)), sup = new Set(supported);
  const S = Array(n).fill(null), R = Array(n).fill(null);
  for (const i of supported) { const others = supported.filter((j) => j !== i).map((j) => P[i][j]); S[i] = others.length ? stableMean(others) : 0.5; R[i] = others.length ? Math.min(...others) : 0.5; }
  const cls = (i) => (excluded[i] ? 2 : sup.has(i) ? 0 : 1), substantive = (a, b) => cls(a) - cls(b) || (cls(a) === 0 ? S[b] - S[a] || R[b] - R[a] : 0);
  const order = [...Array(n).keys()].sort((a, b) => substantive(a, b) || (sig[a] < sig[b] ? -1 : sig[a] > sig[b] ? 1 : 0)); // the signature orders the LISTING only
  let rank = 0; const rankOf = Array(n).fill(0); order.forEach((i, k) => { if (k > 0 && substantive(order[k - 1], i) !== 0) rank = k; rankOf[i] = rank; });
  // cycles in the strict majority relation among supported candidates
  const comps = stronglyConnected(n, (v, w) => sup.has(v) && sup.has(w) && P[v][w] > 0.5 + majorityMargin).filter((c) => c.length > 1), inCycle = new Set(comps.flat());
  const ranked = order.map((i) => ({ index: i, key: keys[i], type: actions[i].type, rank: rankOf[i], excluded: excluded[i], supported: sup.has(i), relativeSafety: S[i], worstCaseComparison: R[i], inCycle: inCycle.has(i) }));
  const base = { contract: IDS.rankingContract, menuSize: n, complete: ranked.length === n, ranked, cycles: comps.map((c) => c.map((i) => keys[i]).sort()).sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1)), unsupportedActions: cand.length - supported.length, epistemic: EPISTEMIC, authority: AUTHORITY };
  if (!cand.length) return { ...base, order: { kind: 'NO_ORDER', reason: 'ALL_ACTIONS_EXCLUDED_BY_PUBLIC_CONSTRAINT', topSet: [] } };
  if (!supported.length) return { ...base, order: { kind: 'NO_ORDER', reason: 'NO_SUPPORTED_COMPARISON', topSet: [] } };
  const top = order.filter((i) => rankOf[i] === rankOf[order[0]] && sup.has(i)), distinct = new Set(top.map((i) => keys[i])).size, runner = order.find((i) => sup.has(i) && rankOf[i] > rankOf[top[0]]);
  const reasons = [...(top.some((i) => inCycle.has(i)) ? ['TOP_SET_IN_A_COMPARISON_CYCLE'] : []), ...(top.length > 1 ? [distinct === 1 ? 'TIE_WITHIN_EQUIVALENT_ACTIONS' : 'INDISTINGUISHABLE_DISTINCT_ACTIONS'] : []), ...(cand.length - supported.length ? ['SOME_ACTIONS_WITHOUT_SUPPORTED_COMPARISON'] : [])];
  return { ...base, order: { kind: 'ORDERED', topSet: top.slice().sort((a, b) => a - b), topKeys: [...new Set(top.map((i) => keys[i]))].sort(), distinctActionsInTopSet: distinct, strictOrderSupported: distinct === 1 && !top.some((i) => inCycle.has(i)),
    marginToRunnerUp: runner === undefined ? null : S[top[0]] - S[runner], reasons } };
}

// ---------------------------------------------------------------- provenance and the R0 interface
const PROVENANCE_FIELDS = ['discriminatorId', 'sourceHash', 'modelHash', 'observationContract', 'labelContract', 'trainingPopulationDigest', 'exclusionRegistryHash', 'preregistrationHash', 'qualification'];
const HEX64 = /^[0-9a-f]{64}$/;
export function assertProvenance(p) {
  if (!p || typeof p !== 'object') reject('PROVENANCE_MISSING'); for (const f of PROVENANCE_FIELDS) if (p[f] === undefined || p[f] === null || p[f] === '') reject('PROVENANCE_INCOMPLETE', f);
  if (p.discriminatorId !== IDS.discriminator) reject('PROVENANCE_IDENTITY_MISMATCH', String(p.discriminatorId)); if (p.labelContract !== IDS.labelContract) reject('PROVENANCE_LABEL_CONTRACT_MISMATCH');
  for (const f of ['sourceHash', 'modelHash', 'trainingPopulationDigest', 'exclusionRegistryHash', 'preregistrationHash']) if (!HEX64.test(p[f])) reject('PROVENANCE_HASH_MALFORMED', f);
  if (!['NOT_TRAINED', 'NOT_QUALIFIED'].includes(p.qualification?.status)) reject('PROVENANCE_QUALIFICATION_LABEL_NOT_ALLOWED', String(p.qualification?.status)); // nothing may present itself as qualified here
  return Object.freeze({ ...p });
}
