// SK1 second-game adapter: "reference grid rescue" (src/adapters/reference-rescue). Demonstrates that the kernel API is
// not tied to Forge World. This file is pure and imports nothing from the game: it consumes the game's own PUBLIC
// observation and its own legal-action list, exactly as the game emits them, and changes no game mechanic.
// What is deliberately absent: a risk model and a catastrophe definition. Forge's catastrophe semantics are NOT assumed
// to transfer. With no model the kernel inspects and ranks the complete menu on public semantics only, reports every
// risk estimate as UNSUPPORTED, and abstains. Architectural portability is shown; decision competence is not claimed.
import { KernelRejection, sha256 } from '../../kernel/contract.mjs';

export const RESCUE_OBSERVATION_CONTRACT = Object.freeze({ id: 'REFERENCE_GRID_RESCUE_PUBLIC_OBSERVATION', version: '1' });
const NAMES = Object.freeze(['cat.scan', 'cat.assist', 'cat.rest', 'obs.turn', 'obs.turnsRemaining', 'obs.energy', 'obs.knownSites', 'target.known', 'target.risk', 'target.rescued']);
const schema = Object.freeze({ id: `SK1_RESCUE_FEATURES_V1:${sha256(NAMES.join('\n')).slice(0, 16)}`, names: NAMES });

/** The game's own observe(state, 'controller') output and legalActions(state, 'controller') output -> recommend() arguments. */
export function rescueRequest(observation, legalActions) {
  const f = observation.features, known = observation.metadata.knownSiteIds;
  return { state: { observationContract: RESCUE_OBSERVATION_CONTRACT, turn: f[0], maxTurns: f[1], energy: f[2], knownSites: known.map((id, i) => ({ site: id, risk: f[4 + 2 * i], rescued: f[5 + 2 * i] === 1 })) },
    legalActions: legalActions.map((a) => ({ type: a.metadata.category, targetSite: a.target ? a.target.id : null })), advisoryEvidence: null };
}
export function rescueFeaturizer(state, legalActions, evidence) {
  if (state.observationContract.id !== RESCUE_OBSERVATION_CONTRACT.id || !Array.isArray(state.knownSites)) throw new KernelRejection('NOT_A_RESCUE_PUBLIC_OBSERVATION');
  const site = (id) => state.knownSites.find((s) => s.site === id) ?? null, num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const rows = legalActions.map((a) => { const s = a.targetSite == null ? null : site(a.targetSite); return [Number(a.type === 'scan'), Number(a.type === 'assist'), Number(a.type === 'rest'), num(state.turn), num(state.maxTurns) === null || num(state.turn) === null ? null : state.maxTurns - state.turn, num(state.energy), state.knownSites.length, Number(s !== null), s ? num(s.risk) : 0, s ? Number(s.rescued) : 0]; });
  // identity-free key: the action category plus the PUBLIC attributes of its target (never the site id)
  const keys = legalActions.map((a) => { const s = a.targetSite == null ? null : site(a.targetSite); return JSON.stringify([a.type, s ? [s.risk, s.rescued] : a.targetSite == null ? null : 'UNKNOWN_SITE']); });
  const constraints = legalActions.map((a) => { const s = a.targetSite == null ? null : site(a.targetSite), cs = [{ code: 'ACTION_IN_NATIVE_LEGAL_MENU', status: 'SATISFIED', basis: 'IMPLIED_BY_LEGALITY', hard: true }];
    if (a.type === 'assist') cs.push(s === null ? { code: 'TARGET_PUBLICLY_KNOWN', status: 'UNKNOWN', basis: 'NOT_PUBLICLY_ESTABLISHED', hard: false } : { code: 'TARGET_NOT_ALREADY_RESCUED', status: s.rescued ? 'VIOLATED' : 'SATISFIED', basis: 'PUBLIC_DETERMINISTIC', hard: true }); return cs; });
  return { schema, rows, keys, signatures: keys, selectable: legalActions.map(() => true), constraints, annotations: legalActions.map((a) => (a.type === 'scan' ? ['UNCERTAIN_EFFECT:SITE_REVEAL'] : [])),
    evidence: { status: evidence == null ? 'ABSENT' : 'NOT_USED_BY_THIS_ADAPTER', issues: [], summary: null } };
}
