// SK1.1 Phase 6 test helpers. Public requests only: the two committed SK1 demo fixtures (development-side, identity
// free) and transformations of them. No population world, seed, outcome or evaluator truth is involved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frameProjection } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs';
import { RESCUE_OBSERVATION_CONTRACT } from '../../stage3h-sk1-safety-kernel-v1/adapters/rescue/adapter.mjs';
import { AssuranceRejection, declarationFor, SK1_LANE } from './assured-api.mjs';

export const SOURCES = Object.freeze({ S0: Object.freeze({ producer: 'STAGE3H_FROZEN_DEV_LOCK_S0', projection: 'PUBLIC_SCORE' }), NEXUS: Object.freeze({ producer: 'STAGE3H_FROZEN_DEV_LOCK_NEXUS_ELSE_S0', projection: 'RECOMMENDATION_PROJECTION' }) });
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const fixture = (which) => { const { note, ...rq } = JSON.parse(readFileSync(resolve(SK1_LANE, `demo/fixtures/forge-request-${which}.json`), 'utf8')); return rq; };
export const decl = (over = {}) => ({ ...declarationFor('forge', clone(SOURCES)), ...over });
export const serve = (api, rq, declaration = decl()) => api.recommend(rq.state, rq.legalActions, rq.advisoryEvidence, declaration);
export const rejects = (fn, code, origin) => assert.throws(fn, (e) => { assert.ok(e instanceof AssuranceRejection, `expected AssuranceRejection, got ${e?.name}: ${e?.message}`); assert.equal(e.code, code, e.message); assert.equal(e.failClosed, true); if (origin) assert.equal(e.origin, origin); return true; });
export const setOf = (record) => { const d = record.recommendedActionOrAbstention; return (d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? []).map((a) => a.index).sort((a, b) => a - b); };
export const deepFreeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); } return v; };

/** Menu-order permutation: new position p holds old action order[p]. Evidence that is aligned with the menu moves with it. */
export function permuteMenu(rq, order) {
  const ev = rq.advisoryEvidence ? clone(rq.advisoryEvidence) : null;
  if (ev) { ev.experts.S0.scores = order.map((i) => rq.advisoryEvidence.experts.S0.scores[i]); ev.experts.S0.topSet = rq.advisoryEvidence.experts.S0.topSet.map((i) => order.indexOf(i)).sort((a, b) => a - b); }
  return { rq: { state: clone(rq.state), legalActions: order.map((i) => clone(rq.legalActions[i])), advisoryEvidence: ev }, newIndexOf: (old) => order.indexOf(old) };
}
/** Opaque identity permutation: entities are reordered and every reference to them (targets, dependents, relations) is re-linked. */
export function relabelNodes(rq, perm) {
  const inv = perm.map((_, i) => perm.indexOf(i)), state = clone(rq.state), re = (i) => (i == null ? i : inv[i]);
  state.projection.nodes = perm.map((i) => { const n = clone(rq.state.projection.nodes[i]); n.rels = n.rels.map((r) => ('to' in r ? { ...r, to: re(r.to) } : r)); return n; });
  return { rq: { state, legalActions: rq.legalActions.map((a) => ({ ...clone(a), target: re(a.target), dependent: re(a.dependent) })), advisoryEvidence: clone(rq.advisoryEvidence) }, newIndexOf: (old) => old };
}
/** The same public state seen through D4 element t (menu order is preserved by the frozen frame transformation). */
export function frameRequest(rq, t) {
  const { menu, ...projection } = frameProjection({ ...clone(rq.state.projection), menu: clone(rq.legalActions) }, t);
  return { rq: { state: { observationContract: clone(rq.state.observationContract), projection }, legalActions: menu, advisoryEvidence: clone(rq.advisoryEvidence) }, newIndexOf: (old) => old };
}
/** What "the same action" must keep under a transformation: its semantics outcome and its estimates. */
export const semanticsOf = (record, index) => { const a = record.rankedActions.find((x) => x.index === index); return { type: a.type, rank: a.rank, selectable: a.selectable, constraintOutcome: a.constraintOutcome, riskStatus: a.riskStatus, riskTier: a.riskTier, riskEstimate: a.risk?.estimate ?? null, riskUpperBound: a.risk?.upperBound ?? null, expectedRegret: a.expectedRegret?.estimate ?? null }; };

/** A hand-written second-game request (reference grid rescue): public observation and native legal menu, no evidence. */
export const rescueRequest = () => ({ state: { observationContract: { ...RESCUE_OBSERVATION_CONTRACT }, turn: 1, maxTurns: 10, energy: 5, knownSites: [{ site: 'alpha', risk: 0.3, rescued: false }] },
  legalActions: [{ type: 'scan', targetSite: null }, { type: 'assist', targetSite: 'alpha' }, { type: 'rest', targetSite: null }], advisoryEvidence: null });
