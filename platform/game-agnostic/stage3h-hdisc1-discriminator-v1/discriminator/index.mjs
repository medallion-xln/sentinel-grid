// SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1 — composition of the four components.
//   A  public decision-state encoder                 (encoder.mjs, forge-encoder.mjs)
//   B  context-dependent, non-additive pair comparison (pair-model.mjs)
//   C  menu-wide aggregation and deterministic ranking (contract.mjs: the H-DISC-0 menu ranking contract)
//   D  explicit uncertainty, abstention and evidence reporting (this file)
//
//   createDiscriminator({ encoder, parameters, provenance, mode, sourceIdentity }).compare(state, legalActions, evidence)
//
// STATUS OF THIS IMPLEMENTATION: UNTRAINED. No learned parameter set exists. Without parameters every comparison is
// unsupported and the component ABSTAINS with reason DISCRIMINATOR_NOT_TRAINED. Parameter sets built by hand as
// mathematical witnesses can be evaluated only in SYNTHETIC_CONTRACT_VERIFICATION mode, and every such result says so.
// The component is R0: it compares and ranks. It recommends nothing by itself, cannot execute, dispatch or mutate, and
// does not replace the frozen SK1 kernel. An ABSTAIN is the absence of a recommendation; it is never a safe outcome.
import { IDS as CONTRACT, AUTHORITY, EPISTEMIC, ContractRejection, assertPublicRequest, assertSupportedEvidence, assertProvenance, rankMenu } from './contract.mjs';
import { FAMILIES, ORIGINS, ModelRejection, validateParameters, parametersHash, comparePair, additiveMenuScores, summariseLogits, capacityOf, hasCrossActionInteraction } from './pair-model.mjs';
import { assertEncoding, project } from './encoder.mjs';
import { stable, digest } from './canonical.mjs';

export const DISCRIMINATOR_ID = CONTRACT.discriminator, DISCRIMINATOR_VERSION = '1.0.0', RECORD_CONTRACT = 'HDISC_COMPARISON_RECORD_V1';
export const STATUS = Object.freeze({ NOT_TRAINED: 'NOT_TRAINED', SYNTHETIC: 'SYNTHETIC_CONTRACT_VERIFICATION_ONLY', TRAINED: 'TRAINED_NOT_QUALIFIED' });
export const MODES = Object.freeze({ ADVISORY: 'R0_ADVISORY', SYNTHETIC: 'SYNTHETIC_CONTRACT_VERIFICATION' });
export const ABSTENTION = Object.freeze({ semantics: 'ABSTAIN means the discriminator gives no ordering and names no action. It is not a native action, not WAIT, not a deferral to any policy and not a safe outcome. What happens next is outside this component.' });
const UNCERTAINTY = Object.freeze({ method: 'PAIRWISE_MARGIN_CYCLES_AND_BAG_DISAGREEMENT_V1', status: 'HEURISTIC_NOT_A_CALIBRATED_CONFIDENCE_STATEMENT' });
const TOL = 1e-12, REQUEST_OPTIONS = ['mode'];
const reject = (code, detail) => { throw new ContractRejection(code, detail); };
const freeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

export function createDiscriminator({ encoder, parameters = null, provenance = null, mode = MODES.ADVISORY, sourceIdentity = {} } = {}) {
  if (typeof encoder !== 'function' || !encoder.schema) reject('ENCODER_REQUIRED'); if (!Object.values(MODES).includes(mode)) reject('UNKNOWN_MODE', String(mode));
  if (encoder.synthetic === true && mode !== MODES.SYNTHETIC) reject('SYNTHETIC_ENCODER_OUTSIDE_SYNTHETIC_MODE');
  let status = STATUS.NOT_TRAINED, prov = null;
  if (parameters !== null) {
    parameters = freeze(structuredClone(parameters));
    validateParameters(parameters);
    if (parameters.origin === ORIGINS.SYNTHETIC) { if (mode !== MODES.SYNTHETIC) reject('SYNTHETIC_PARAMETERS_OUTSIDE_SYNTHETIC_MODE'); status = STATUS.SYNTHETIC; }
    else { if (mode !== MODES.ADVISORY) reject('LEARNED_PARAMETERS_IN_SYNTHETIC_MODE'); prov = assertProvenance(provenance); if (prov.modelHash !== parametersHash(parameters)) reject('PROVENANCE_DOES_NOT_BIND_THESE_PARAMETERS'); status = STATUS.TRAINED; }
    for (const [block, have] of [['descriptor', encoder.schema.descriptor], ['relation', encoder.schema.relation], ['context', encoder.schema.context]]) for (const nm of parameters.layout[block]) if (!have.includes(nm)) throw new ModelRejection('PARAMETER_LAYOUT_NOT_IN_ENCODER_SCHEMA', `${block}:${nm}`);
  }
  const observationContract = encoder.observationContract ?? { id: encoder.schema.id, version: '1' };
  const identity = Object.freeze({ discriminatorId: DISCRIMINATOR_ID, discriminatorVersion: DISCRIMINATOR_VERSION, sourceHash: sourceIdentity.sourceHash ?? null, encoderId: encoder.encoderId ?? null, encoderSchemaId: encoder.schema.id,
    family: parameters?.family ?? null, parametersHash: parameters ? parametersHash(parameters) : null, parametersOrigin: parameters?.origin ?? null, capacity: parameters ? capacityOf(parameters) : null, crossActionInteraction: parameters ? hasCrossActionInteraction(parameters) : null });
  const qualification = Object.freeze(status === STATUS.TRAINED ? prov.qualification : { status: status === STATUS.SYNTHETIC ? 'NOT_TRAINED' : 'NOT_TRAINED', statement: status === STATUS.SYNTHETIC ? 'Hand-built mathematical witness parameters. Not learned from any data. No decision competence is claimed.' : 'No parameters exist. The discriminator abstains on every request.' });

  function compare(canonicalPublicState, legalActions, advisoryEvidence = null, options = {}) {
    // ---- request boundary (fail closed)
    if (!canonicalPublicState || typeof canonicalPublicState !== 'object' || Array.isArray(canonicalPublicState)) reject('STATE_NOT_AN_OBJECT');
    if (options === null || typeof options !== 'object' || Array.isArray(options)) reject('OPTIONS_NOT_AN_OBJECT');
    for (const k of Object.keys(options)) if (!REQUEST_OPTIONS.includes(k)) { assertPublicRequest({ [k]: options[k] }, 'options'); reject('UNKNOWN_OPTION', k); } // an execution-like key is reported as such first
    if (options.mode !== undefined && options.mode !== 'COMPARE') reject('EXECUTION_OR_MUTATION_REQUESTED', `mode=${String(options.mode)}`);
    if (!Array.isArray(legalActions)) reject('LEGAL_ACTIONS_NOT_AN_ARRAY'); if (!legalActions.length) reject('EMPTY_LEGAL_MENU'); if (legalActions.length > 4096) reject('LEGAL_MENU_TOO_LARGE');
    legalActions.forEach((a, i) => { if (!a || typeof a !== 'object' || Array.isArray(a)) reject('MALFORMED_ACTION', String(i)); if (typeof a.type !== 'string' || !a.type) reject('ACTION_TYPE_MISSING', String(i)); });
    const oc = canonicalPublicState.observationContract; if (!oc || oc.id !== observationContract.id || oc.version !== observationContract.version) reject('OBSERVATION_CONTRACT_MISMATCH', `${String(oc?.id)}/${String(oc?.version)}`);
    assertPublicRequest({ state: canonicalPublicState, legalActions, advisoryEvidence: advisoryEvidence ?? {} });
    const evidence = encoder.evidenceContract ? assertSupportedEvidence(advisoryEvidence) : { status: advisoryEvidence == null ? 'ABSENT' : 'NOT_USED_BY_THIS_ENCODER' };
    const before = stable({ canonicalPublicState, legalActions, advisoryEvidence });
    // ---- A: encode
    const n = legalActions.length, enc = encoder(canonicalPublicState, legalActions, advisoryEvidence ?? null); assertEncoding(enc, n);
    // ---- B: pairwise comparison (both directions computed; they must agree or the pair is withheld)
    const P = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0.5 : null))), logit = P.map((r) => r.map(() => null)), spread = P.map((r) => r.map(() => null)), agree = P.map((r) => r.map(() => null)), issues = [];
    const proj = parameters ? project(enc, parameters.layout) : null;
    const additive = proj && parameters.family === FAMILIES.ADDITIVE ? additiveMenuScores(parameters, legalActions.map((_, i) => proj.descriptor(i)), proj.context) : null;
    const comparison = (i, j, rij, rji) => additive ? (additive[i] && additive[j] ? summariseLogits(additive[i].map((s, b) => additive[j][b] - s)) : null) : comparePair(parameters, proj.descriptor(i), proj.descriptor(j), rij, rji, proj.context);
    if (proj) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (enc.excluded[i] || enc.excluded[j] || !enc.supported[i] || !enc.supported[j]) continue;
      const rij = proj.relation(i, j), rji = proj.relation(j, i), a = rij === null || rji === null ? null : comparison(i, j, rij, rji), b = rij === null || rji === null ? null : comparison(j, i, rji, rij);
      if (a === null || b === null) { issues.push({ pair: [i, j], code: 'COMPARISON_MISSING_OR_INVALID' }); continue; }
      if (Math.abs(a.probability + b.probability - 1) > TOL) { issues.push({ pair: [i, j], code: 'PAIRWISE_SCORES_INCONSISTENT' }); continue; }
      P[i][j] = a.probability; P[j][i] = b.probability; logit[i][j] = a.logit; logit[j][i] = b.logit; spread[i][j] = spread[j][i] = a.bagLogitSpread; agree[i][j] = agree[j][i] = a.bagAgreement; }
    // ---- C: menu-wide aggregation and ranking, by the H-DISC-0 contract
    const actions = legalActions.map((a, i) => ({ key: enc.keys[i], signature: enc.signatures[i], type: enc.types[i], descriptor: {}, excluded: enc.excluded[i], supported: enc.supported[i] }));
    const ranking = rankMenu(actions, P);
    if (parameters === null || (ranking.order.kind === 'ORDERED' && !actions.some((a) => a.supported && !a.excluded))) {
      ranking.order = { kind: 'NO_ORDER', topSet: [], reason: parameters === null ? 'DISCRIMINATOR_NOT_TRAINED' : 'NO_SUPPORTED_COMPARISON' };
      ranking.ranked = ranking.ranked.map((a) => ({ ...a, supported: false, relativeSafety: null, worstCaseComparison: null }));
    }
    const top = ranking.order.topSet, ordered = ranking.order.kind === 'ORDERED';
    // ---- D: uncertainty, abstention, evidence
    const others = ordered ? [...Array(n).keys()].filter((j) => j !== top[0] && P[top[0]][j] !== null) : [], bags = parameters ? parameters.bags.length : 0;
    const minAgree = others.length ? Math.min(...others.map((j) => agree[top[0]][j] ?? 1)) : null, maxSpread = others.length ? Math.max(...others.map((j) => spread[top[0]][j])) : null;
    const unsupported = enc.supported.filter((s, i) => !s && !enc.excluded[i]).length;
    const flags = [...(parameters === null ? ['DISCRIMINATOR_NOT_TRAINED'] : []), ...(ordered ? ranking.order.reasons : [ranking.order.reason]), ...(issues.some((x) => x.code === 'PAIRWISE_SCORES_INCONSISTENT') ? ['COMPARISONS_WITHHELD_AS_INCONSISTENT'] : []),
      ...(ordered && bags === 1 ? ['SINGLE_BAG_NO_DISAGREEMENT_ESTIMATE'] : []), ...(ordered && minAgree !== null && minAgree < 1 ? ['BAGS_DISAGREE_ON_A_TOP_COMPARISON'] : [])];
    const reasonsOf = (i) => [...(enc.excluded[i] ? ['EXCLUDED_BY_PUBLIC_CONSTRAINT'] : []), ...enc.unsupportedReasons[i]];
    const decision = ordered
      ? { kind: 'TOP_SET', topSet: top, topActions: top.map((i) => ({ index: i, key: enc.keys[i], type: enc.types[i] })), distinctActionsInTopSet: ranking.order.distinctActionsInTopSet, strictOrderSupported: ranking.order.strictOrderSupported, reasons: ranking.order.reasons, note: 'The top of the relative-safety order. Relative evidence only: it is not a statement that the action is safe.' }
      : { kind: 'ABSTAIN', topSet: [], topActions: [], reason: parameters === null ? 'DISCRIMINATOR_NOT_TRAINED' : ranking.order.reason, unsupportedReasons: [...new Set(enc.unsupportedReasons.flat())].sort(), ...ABSTENTION };
    const sigOf = (i) => enc.signatures[i], canonicalRanked = ranking.ranked.map((x) => [sigOf(x.index), x.type, x.rank, x.excluded, x.supported, x.relativeSafety, x.worstCaseComparison, x.inCycle]).sort((a, b) => a[2] - b[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) || (stable(a) < stable(b) ? -1 : 1));
    const canonicalPairs = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && P[i][j] !== null) canonicalPairs.push([sigOf(i), sigOf(j), P[i][j]]); canonicalPairs.sort((a, b) => (stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0));
    const uncertainty = { ...UNCERTAINTY, flags, cycles: ranking.cycles, cyclesBySignature: ranking.cycles.length ? stronglyBySignature(ranking, enc) : [], topSetInCycle: ordered ? ranking.order.reasons.includes('TOP_SET_IN_A_COMPARISON_CYCLE') : null, marginToRunnerUp: ordered ? ranking.order.marginToRunnerUp : null,
      worstCaseComparisonOfTop: ordered ? ranking.ranked.find((x) => x.index === top[0]).worstCaseComparison : null, minBagAgreementForTop: minAgree, maxBagLogitSpreadForTop: maxSpread, bags, withheldPairs: issues.length, unsupportedActions: unsupported };
    // decisionDigest: independent of menu order, entity relabelling and frame (canonical signatures, no indices, no keys)
    const decisionDigest = digest({ contract: RECORD_CONTRACT, discriminator: DISCRIMINATOR_ID, status, observationContract, encoderSchemaId: encoder.schema.id, parametersHash: identity.parametersHash, menu: [...enc.signatures].sort(), ranked: canonicalRanked, pairs: canonicalPairs,
      decision: { kind: decision.kind, top: top.map(sigOf).sort(), strict: ordered ? decision.strictOrderSupported : null, reason: ordered ? decision.reasons : decision.reason }, flags: [...flags].sort(), cycles: uncertainty.cyclesBySignature });
    const body = { contract: RECORD_CONTRACT, contracts: { pair: CONTRACT.pairContract, label: CONTRACT.labelContract, ranking: CONTRACT.rankingContract }, discriminator: { id: DISCRIMINATOR_ID, version: DISCRIMINATOR_VERSION }, status, mode, observationContract,
      legalActionMenu: { size: n, identity: digest([...enc.signatures].sort()), complete: ranking.ranked.length === n },
      rankedActions: ranking.ranked.map((x) => ({ ...x, comparisonSupported: x.supported, inputsSupported: enc.supported[x.index], signature: sigOf(x.index), reasons: reasonsOf(x.index), constraints: enc.constraints[x.index] })),
      pairwiseEvidence: { semantics: 'matrix[i][j] estimates P(action i is safer than action j), counting an indistinguishable pair as one half; null means no supported comparison', matrix: P, logit, bagLogitSpread: spread, bagAgreement: agree, issues },
      decision, uncertainty, evidence: { ...evidence, encoderStatus: enc.evidence?.status ?? null, issues: enc.evidence?.issues ?? [] }, sourceIdentity: identity, qualification, epistemic: EPISTEMIC, authority: AUTHORITY, decisionDigest, requestDigest: digest({ canonicalPublicState, legalActions, advisoryEvidence: advisoryEvidence ?? null }) };
    if (stable({ canonicalPublicState, legalActions, advisoryEvidence }) !== before) reject('REQUEST_MUTATED_DURING_COMPARISON'); // the component must not write to its inputs
    return Object.freeze({ ...body, recordHash: digest(body) });
  }
  const refuse = (what) => () => reject('EXECUTION_OR_MUTATION_REQUESTED', what);
  const replay = (request, expected) => { const r = compare(request.state, request.legalActions, request.advisoryEvidence ?? null); return { reproduced: r.decisionDigest === expected.decisionDigest && (expected.recordHash === undefined || r.recordHash === expected.recordHash), decisionDigest: r.decisionDigest, recordHash: r.recordHash }; };
  const describe = () => ({ discriminator: { id: DISCRIMINATOR_ID, version: DISCRIMINATOR_VERSION }, status, mode, contracts: { pair: CONTRACT.pairContract, label: CONTRACT.labelContract, ranking: CONTRACT.rankingContract, record: RECORD_CONTRACT }, observationContract, sourceIdentity: identity, qualification, authority: AUTHORITY, epistemic: EPISTEMIC, abstention: ABSTENTION,
    families: FAMILIES, capabilities: ['compare', 'replay', 'describe'], refuses: ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act'] });
  return Object.freeze({ compare, replay, describe, identity, status, authority: AUTHORITY, execute: refuse('execute'), dispatch: refuse('dispatch'), mutate: refuse('mutate'), apply: refuse('apply'), commit: refuse('commit'), act: refuse('act') });
}
/** Cycles expressed by canonical signature (frame- and relabelling-invariant), for the decision digest. */
function stronglyBySignature(ranking, enc) {
  const byKey = new Map(); ranking.ranked.forEach((x) => { if (x.inCycle) (byKey.get(x.key) ?? byKey.set(x.key, []).get(x.key)).push(enc.signatures[x.index]); });
  return ranking.cycles.map((c) => c.flatMap((k) => byKey.get(k) ?? []).sort()).sort((a, b) => (a.join('|') < b.join('|') ? -1 : 1));
}
export { ContractRejection, ModelRejection, FAMILIES, ORIGINS, AUTHORITY };
