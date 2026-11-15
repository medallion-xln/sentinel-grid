// SENTINEL SAFETY KERNEL — assured R0 recommendation envelope, version SK1_R0_ASSURED_API_V1_1 (Stage 3H-SK1.1, Phase 6).
//
// A PURE ENVELOPE around the frozen SK1 recommendation API (stage3h-sk1-safety-kernel-v1/api/recommend.mjs).
//   * It imports the frozen API; it contains no kernel, ranking or risk logic of its own and no estimator.
//   * The inner decision record and its decisionHash are passed through UNCHANGED.
//   * Everything it adds is a fail-closed check with a stable rejection code, or a derived read-only view.
//   * It can only withhold: a request is either served with the frozen decision, or refused. It never alters a decision.
// Status of everything served here: R0, shadow mode, recommendation only, NOT_QUALIFIED. Nothing is executed,
// dispatched or mutated, and this file is not connected to the certified Prime / Arbiter path.
//
//   const api = createAssuredApi({ game: 'forge' });
//   const env = api.recommend(canonicalPublicState, legalActions, advisoryEvidence, declarationFor('forge', sources));
//   env.record            the frozen kernel's record, byte-for-byte        env.decisionHash === env.record.decisionHash
//   env.assurance         checks, pins, evidence provenance, separated view, uncertainty and tie summaries
//   api.replay(args, { decisionHash, envelopeHash })    api.verify(env)    api.describe()
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecommendationApi, API_VERSION as INNER_API_VERSION } from '../../stage3h-sk1-safety-kernel-v1/api/recommend.mjs';
import { digest, sha256, stable, KernelRejection, REQUEST_CONTRACT, RECORD_CONTRACT, KERNEL_ID, KERNEL_VERSION } from '../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';
import { ACTION_TYPES, ENTITY_KINDS, FORGE_OBSERVATION_CONTRACT } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/features.mjs';
import { EVIDENCE_CONTRACT } from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/evidence.mjs';
import { RESCUE_OBSERVATION_CONTRACT } from '../../stage3h-sk1-safety-kernel-v1/adapters/rescue/adapter.mjs';

export const ASSURED_API_VERSION = 'SK1_R0_ASSURED_API_V1_1';
export const ENVELOPE_CONTRACT = 'SENTINEL_ASSURED_RECOMMENDATION_ENVELOPE_V1_1';
export const SK1_LANE = resolve(dirname(fileURLToPath(import.meta.url)), '../../stage3h-sk1-safety-kernel-v1');
export const LABELS = Object.freeze(['R0', 'SHADOW_MODE', 'RECOMMENDATION_ONLY', 'NOT_QUALIFIED']);
export const REQUIRED_AUTHORITY = Object.freeze({ state: 'R0', mode: 'OBSERVATION_AND_RECOMMENDATION_ONLY', canDispatch: false, canMutateLiveWorld: false, promotedToRuntime: false });
export const SCIENTIFIC_STATUS = Object.freeze({
  sk1Classification: 'B_SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED', safetyKernelDevQualified: false, selectiveContractCertified: false,
  statement: 'The served model failed the frozen SK1 DEV qualification contract. This envelope adds engineering checks only. It changes no decision and supports no qualification claim.',
});

// Identities frozen by stage3h-sk1-safety-kernel-v1/evidence/SK1_EXPERIMENT_FREEZE.json (sha256 below) and reported in
// SK1_RESULT.md. They are literals on purpose: the envelope serves these exact bytes or nothing.
// r0/pins.test.mjs verifies every literal against the freeze record.
export const PINS = Object.freeze({
  freezeRecord: 'evidence/SK1_EXPERIMENT_FREEZE.json',
  freezeSha256: 'd22be2c4766324db1794d511b3bbd79917d3771c28cfa1c7087ba4c6c0663794',
  files: Object.freeze({
    'kernel/contract.mjs': 'fbd57bce5d404fbca372531b1124aa753ccb0b400eb380a619e3431610654427',
    'kernel/index.mjs': 'a6b96ec1fa288c553d73ab4e03747dd0a6e6e1e6f7afe78ca2104794f58bff2f',
    'kernel/ranking.mjs': '3f8a7adb6cd18ebb6ef07e2f06a4ebbf021ddbe0d0d39853ec2f6f3195dbf27a',
    'kernel/record.mjs': 'e529ecc09dc647b80997450b98b1d991b559171ab5e649e1d3152fa17ae6761c',
    'kernel/risk.mjs': '94a8b3ed5b6504c9e8f378ba1ffc8e0016e030684aed24f26743f3f203752996',
    'kernel/semantics.mjs': '9441a984946443ecbfc1f5d48f8302826ec7aa938f78b2ff20d1bffc46d1db44',
    'adapters/forge/evidence.mjs': 'caa3c2577c9269ed27d19fdca2878011ff337400be0dcb067db5d51396e95cb9',
    'adapters/forge/features.mjs': 'd8077bed1cd55885fdf237db19414ebe0fcf347504dcaca8d9df98e707ff4d84',
    'adapters/forge/projection.mjs': 'e2a050b2f25dfe6937cd9194ee0fafa4cc3a421bb894cb3e9c3bf94b91069f1d',
    'adapters/rescue/adapter.mjs': '61e10391fa5a48fe3a6f16d5bcdc182295c74b7fbc490bda674ea9c5d365ef8a',
    'api/host.mjs': '9dfb89914ab66905aa05f5f17562bb32cc7cb91aedf0b47431fa255837128bc2',
    'api/recommend.mjs': 'b7c47a14f367998e2df0ab41160cf324c19fa6bff38899bf9b7b3651769f8d52',
  }),
  model: Object.freeze({
    file: 'models/SK1_MODEL.json', sha256: '683ce6e09c374e7c3a628a53e39f9875d6b8122b6eca8a4b72d58087a0c9efa0',
    modelId: 'SK1_FORGE_PRIMARY_V1', modelHash: 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b', qualification: 'NOT_QUALIFIED',
    ranking: Object.freeze({ contract: 'SK1_TIERED_RISK_THEN_REGRET_V1', z: 1, tierWidth: 0.1, tau: 0.2, oodPenalty: 0.05, requireEvidence: true }),
  }),
  kernelSourceHash: '5588744316bf27efaabdc72b86b886f6e31d868c13f3a783bc75ca19a3bc7cb5',
  adapterSourceHash: Object.freeze({ forge: '948352b6497dfa4aea28144bc889cdd6c561a821bef5dba43a4e324b3661582d', rescue: '3fb64b1fd0a2653b3df641983caf352ee3f145b115ba1f64ce7ddb2b1423600e' }),
  adapterId: Object.freeze({ forge: 'SK1_FORGE_ADAPTER_V1', rescue: 'SK1_RESCUE_ADAPTER_V1' }),
  kernel: Object.freeze({ id: 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1', version: '1.0.0' }),
  innerApiVersion: 'SK1_R0_API_V1', requestContract: 'SENTINEL_PUBLIC_DECISION_REQUEST_V1', recordContract: 'SENTINEL_SAFETY_DECISION_RECORD_V1', rankingContract: 'SK1_TIERED_RISK_THEN_REGRET_V1',
});

const GAMES = Object.freeze({
  forge: Object.freeze({ observationContract: FORGE_OBSERVATION_CONTRACT, evidenceContract: EVIDENCE_CONTRACT, hasModel: true }),
  rescue: Object.freeze({ observationContract: RESCUE_OBSERVATION_CONTRACT, evidenceContract: null, hasModel: false }),
});

/** Every refusal of this envelope. `origin` says whether the frozen kernel or the envelope refused. Always fail-closed. */
export class AssuranceRejection extends Error {
  constructor(code, detail = '', origin = 'ENVELOPE') { super(detail ? `${code}:${detail}` : code); this.name = 'AssuranceRejection'; this.code = code; this.detail = detail; this.origin = origin; this.failClosed = true; }
}
const reject = (code, detail) => { throw new AssuranceRejection(code, detail === undefined ? '' : String(detail)); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const same = (a, b) => stable(a) === stable(b);

// ---------------------------------------------------------------------------------------------- 1. source pinning
/** Reads the pinned inference files and the model from disk and compares them with the frozen identities. */
export function verifySourcePins({ lane = SK1_LANE, game = 'forge', modelPath, pins = PINS } = {}) {
  for (const [file, expected] of Object.entries(pins.files)) {
    let actual; try { actual = sha256(readFileSync(resolve(lane, file))); } catch { reject('SOURCE_PIN_MISMATCH', `${file}:UNREADABLE`); }
    if (actual !== expected) reject('SOURCE_PIN_MISMATCH', file);
  }
  if (!GAMES[game]) reject('UNKNOWN_GAME_ADAPTER', game);
  if (!GAMES[game].hasModel) { if (modelPath !== undefined) reject('MODEL_NOT_SUPPORTED_FOR_ADAPTER', game); return { game, filesVerified: Object.keys(pins.files).length, model: null }; }
  const path = modelPath === undefined ? resolve(lane, pins.model.file) : resolve(modelPath);
  let bytes; try { bytes = readFileSync(path); } catch { reject('MODEL_PIN_MISMATCH', 'UNREADABLE'); }
  if (sha256(bytes) !== pins.model.sha256) reject('MODEL_PIN_MISMATCH', 'FILE_SHA256');
  const model = JSON.parse(bytes.toString('utf8'));
  if (model.modelHash !== pins.model.modelHash || model.modelId !== pins.model.modelId) reject('MODEL_PIN_MISMATCH', 'MODEL_HASH_OR_ID');
  if (model.qualification?.status !== pins.model.qualification) reject('QUALIFICATION_LABEL_MISMATCH', String(model.qualification?.status));
  if (!same(model.ranking, pins.model.ranking)) reject('MODEL_PIN_MISMATCH', 'RANKING_PARAMETERS');
  return { game, filesVerified: Object.keys(pins.files).length, model: { path, sha256: pins.model.sha256, modelHash: model.modelHash } };
}
/** The identity the loaded inner API reports must equal the pins as well. */
export function verifyInnerIdentity(described, game, pins = PINS) {
  const s = described?.sourceIdentity ?? {};
  if (described?.apiVersion !== pins.innerApiVersion) reject('INNER_API_VERSION_MISMATCH', String(described?.apiVersion));
  if (s.kernelId !== pins.kernel.id || s.kernelVersion !== pins.kernel.version) reject('KERNEL_VERSION_MISMATCH', `${s.kernelId}/${s.kernelVersion}`);
  if (s.kernelSourceHash !== pins.kernelSourceHash) reject('SOURCE_PIN_MISMATCH', 'kernelSourceHash');
  if (s.adapterId !== pins.adapterId[game] || s.adapterSourceHash !== pins.adapterSourceHash[game]) reject('SOURCE_PIN_MISMATCH', 'adapterSourceHash');
  if (GAMES[game].hasModel) {
    if (described.model?.modelHash !== pins.model.modelHash) reject('MODEL_PIN_MISMATCH', 'LOADED_MODEL_HASH');
    if (described.model?.qualification?.status !== pins.model.qualification) reject('QUALIFICATION_LABEL_MISMATCH', String(described.model?.qualification?.status));
  } else if (described.model !== null) reject('MODEL_PIN_MISMATCH', 'UNEXPECTED_MODEL');
  if (!same(described.authority, REQUIRED_AUTHORITY)) reject('AUTHORITY_LABEL_MISMATCH');
}

// ----------------------------------------------------------------------------- 2. explicit contract declaration
const DECLARATION_KEYS = new Set(['apiVersion', 'requestContract', 'observationContract', 'evidenceContract', 'evidenceSources', 'mode']);
/** A complete, correct declaration for a game. Callers state what they are sending; the envelope compares, never infers. */
export function declarationFor(game, evidenceSources = null) {
  const g = GAMES[game]; if (!g) reject('UNKNOWN_GAME_ADAPTER', game);
  return { apiVersion: ASSURED_API_VERSION, requestContract: REQUEST_CONTRACT, observationContract: { ...g.observationContract }, evidenceContract: g.evidenceContract, evidenceSources, mode: 'RECOMMEND' };
}
export function assertDeclaration(declaration, game, state, advisoryEvidence) {
  const g = GAMES[game];
  if (!isObj(declaration)) reject('CONTRACT_DECLARATION_MISSING');
  for (const k of Object.keys(declaration)) if (!DECLARATION_KEYS.has(k)) reject(looksLikeExecution(k) ? 'EXECUTION_OR_MUTATION_REQUESTED' : 'UNKNOWN_DECLARATION_KEY', k);
  if (declaration.mode !== 'RECOMMEND') reject('EXECUTION_OR_MUTATION_REQUESTED', `mode=${String(declaration.mode)}`);
  if (declaration.apiVersion !== ASSURED_API_VERSION) reject('API_VERSION_MISMATCH', String(declaration.apiVersion));
  if (declaration.requestContract !== REQUEST_CONTRACT) reject('REQUEST_CONTRACT_MISMATCH', String(declaration.requestContract));
  const oc = declaration.observationContract, sc = isObj(state) ? state.observationContract : null;
  if (!isObj(oc) || oc.id !== g.observationContract.id || oc.version !== g.observationContract.version) reject('OBSERVATION_CONTRACT_MISMATCH', `declared=${oc?.id}/${oc?.version}`);
  if (!isObj(sc) || sc.id !== oc.id || sc.version !== oc.version) reject('OBSERVATION_CONTRACT_MISMATCH', `state=${sc?.id}/${sc?.version}`);
  if (!own(declaration, 'evidenceContract')) reject('EVIDENCE_CONTRACT_MISMATCH', 'UNDECLARED');
  if (declaration.evidenceContract !== g.evidenceContract) reject('EVIDENCE_CONTRACT_MISMATCH', `declared=${String(declaration.evidenceContract)}`);
  if (advisoryEvidence !== null && advisoryEvidence !== undefined && g.evidenceContract === null) reject('EVIDENCE_NOT_SUPPORTED_BY_ADAPTER', game);
}

// ------------------------------------------------------------------ 3. hardened execution / privileged key scans
// The frozen kernel matches exact, case-sensitive key names (kernel/contract.mjs FORBIDDEN_KEY, EXECUTION_KEY). Variants
// such as `Execute`, `executeAction`, `doDispatch`, `world_hash` or `groundTruth` pass it. The envelope normalises a key
// (lower case, alphanumerics only) and matches on stems. Finding recorded in SK1_ENGINEERING_ASSURANCE.md (F1, F2).
const normKey = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const EXEC_STEMS = ['execut', 'dispatch', 'mutat', 'apply', 'commit', 'actuat', 'sendtoworld', 'perform', 'enact', 'write'], EXEC_EXACT = new Set(['act', 'run']);
const PRIV_STEMS = ['truth', 'utilit', 'regret', 'nreg', 'catastroph', 'label', 'outcome', 'oracle', 'rollout', 'evaluator', 'seed', 'worldhash', 'statehash', 'hidden', 'counterfactual', 'privileged', 'secret'], PRIV_EXACT = new Set(['members']);
export const looksLikeExecution = (key) => { const k = normKey(key); return EXEC_EXACT.has(k) || EXEC_STEMS.some((s) => k.includes(s)); };
export const looksPrivileged = (key) => { const k = normKey(key); return PRIV_EXACT.has(k) || PRIV_STEMS.some((s) => k.includes(s)); };
export function scanKeysHardened(value, path, depth = 0) {
  if (depth > 16) reject('REQUEST_TOO_DEEP', path);
  if (Array.isArray(value)) { value.forEach((x, i) => scanKeysHardened(x, `${path}[${i}]`, depth + 1)); return; }
  if (isObj(value)) for (const k of Object.keys(value)) {
    if (looksLikeExecution(k)) reject('EXECUTION_OR_MUTATION_REQUESTED', `${path}.${k}`);
    if (looksPrivileged(k)) reject('PRIVILEGED_FIELD_IN_REQUEST', `${path}.${k}`);
    scanKeysHardened(value[k], `${path}.${k}`, depth + 1);
  }
}

// ------------------------------------------------------------------- 4. public-state completeness (Forge adapter)
// The frozen kernel already reports most missing public fields (it marks the estimate UNSUPPORTED_MISSING_INFORMATION and
// abstains); those requests pass through unchanged. The envelope refuses only what the frozen featurizer does NOT report:
//   * an action type or entity kind outside its vocabulary gets a SUPPORTED estimate (all one-hot columns zero)   finding F3
//   * fields it silently imputes when absent: terrainCounts (-> 0 hazard cells), history.channels (-> no history),
//     flags of nodes that no action targets (-> false), absent action keys (-> no target / no displacement)       finding F4
//   * fields it ignores but which change the request hash (unknown extra state, projection or action fields)
// The envelope does not repair such a request and it removes no lawful action from a menu it serves: it refuses the request.
const PROJECTION_KEYS = ['version', 'tick', 'grid', 'actor', 'history', 'terrainCounts', 'nodes', 'frame'];
const NODE_FLAGS = ['hostile', 'critical', 'resource', 'objective', 'inService', 'threatened', 'hub'];
const ACTION_KEYS = ['type', 'params', 'target', 'dependent', 'disp', 'toRel', 'cost', 'pre', 'eff', 'energyAfter', 'destTerrain'];
export function assertForgePublicState(state, legalActions) {
  const missing = (what) => reject('REQUIRED_PUBLIC_FIELD_MISSING', what), vocab = (what) => reject('INPUT_OUTSIDE_ADAPTER_VOCABULARY', what);
  for (const k of Object.keys(state)) if (k !== 'observationContract' && k !== 'projection') reject('UNKNOWN_STATE_FIELD', `state.${k}`);
  const P = state.projection; if (!isObj(P)) missing('projection');
  for (const k of Object.keys(P)) if (!PROJECTION_KEYS.includes(k)) reject('UNKNOWN_STATE_FIELD', `projection.${k}`);
  if (P.version !== FORGE_OBSERVATION_CONTRACT.version) reject('OBSERVATION_CONTRACT_MISMATCH', `projection.version=${String(P.version)}`);
  if (!isObj(P.terrainCounts) || Object.values(P.terrainCounts).some((v) => !fin(v))) missing('projection.terrainCounts');
  if (isObj(P.history) && !Array.isArray(P.history.channels)) missing('projection.history.channels');
  if (!Array.isArray(P.nodes)) missing('projection.nodes');
  P.nodes.forEach((n, i) => {
    if (!isObj(n)) missing(`nodes[${i}]`);
    if (!ENTITY_KINDS.includes(n.kind)) vocab(`nodes[${i}].kind=${String(n.kind)}`);
    if (!isObj(n.flags)) missing(`nodes[${i}].flags`);
    for (const f of NODE_FLAGS) if (typeof n.flags[f] !== 'boolean') missing(`nodes[${i}].flags.${f}`);
  });
  legalActions.forEach((a, i) => {
    if (!isObj(a)) missing(`legalActions[${i}]`);
    for (const k of ACTION_KEYS) if (!own(a, k)) missing(`legalActions[${i}].${k}`);
    for (const k of Object.keys(a)) if (!ACTION_KEYS.includes(k)) reject('UNKNOWN_ACTION_FIELD', `legalActions[${i}].${k}`);
    if (!ACTION_TYPES.includes(a.type)) vocab(`legalActions[${i}].type=${String(a.type)}`);
    for (const k of ['target', 'dependent']) if (!(a[k] === null || (Number.isInteger(a[k]) && a[k] >= 0 && a[k] < P.nodes.length))) reject('ACTION_REFERENCE_OUTSIDE_STATE', `legalActions[${i}].${k}`);
  });
}

// ------------------------------------------------------------------------------- 5. advisory evidence provenance
// Envelope policy (documented in SK1_ENGINEERING_ASSURANCE.md):
//   absent evidence (null)      passes through; the frozen kernel abstains (EVIDENCE_ABSENT) because the model requires it
//   structurally malformed      REJECTED here (MALFORMED_EVIDENCE) — the frozen kernel would abstain on most, but it
//                               accepts wrong `kind` labels and unknown extra fields (finding F5)
//   not VALID to the frozen     REJECTED here (EVIDENCE_NOT_VALID) after the inner call — INVALID and PARTIAL alike
//   validator
// A valid request is never changed: the same evidence object reaches the frozen kernel.
const EXPERT_SHAPE = Object.freeze({
  S0: Object.freeze({ kind: 'PUBLIC_SCORE', keys: ['kind', 'scores', 'topSet'] }),
  NEXUS: Object.freeze({ kind: 'RECOMMENDATION_PROJECTION', keys: ['kind', 'abstain', 'recommendedType', 'rationaleCodes', 'reason'] }),
});
const SOURCE_KEYS = new Set(['producer', 'producerVersion', 'projection']);
export function assertEvidenceEnvelope(evidence, legalActions, declaration, game) {
  const bad = (d) => reject('MALFORMED_EVIDENCE', d), src = declaration.evidenceSources;
  if (evidence === null || evidence === undefined) {
    if (src !== null && src !== undefined) reject('EVIDENCE_SOURCES_DECLARED_WITHOUT_EVIDENCE');
    return { contract: GAMES[game].evidenceContract, present: false, declaredSources: null, expertsPresent: [], kinds: {}, evidenceDigest: null, authenticated: false, verification: 'NO_EVIDENCE_SUPPLIED' };
  }
  if (!isObj(evidence)) bad('NOT_AN_OBJECT');
  for (const k of Object.keys(evidence)) if (k !== 'contract' && k !== 'experts') bad(`UNKNOWN_FIELD:${k}`);
  if (evidence.contract !== GAMES[game].evidenceContract) reject('EVIDENCE_CONTRACT_MISMATCH', `evidence=${String(evidence.contract)}`);
  if (!isObj(evidence.experts)) bad('EXPERTS_MISSING');
  const names = Object.keys(evidence.experts).sort(), n = legalActions.length;
  for (const e of names) if (!EXPERT_SHAPE[e]) bad(`UNSUPPORTED_EXPERT_OUTPUT:${e}`);
  for (const e of Object.keys(EXPERT_SHAPE)) {
    const x = evidence.experts[e]; if (!isObj(x)) bad(`${e}_MISSING`);
    if (x.kind !== EXPERT_SHAPE[e].kind) bad(`${e}_KIND:${String(x.kind)}`);
    for (const k of Object.keys(x)) if (!EXPERT_SHAPE[e].keys.includes(k)) bad(`${e}_UNKNOWN_FIELD:${k}`);
    for (const k of EXPERT_SHAPE[e].keys) if (!own(x, k)) bad(`${e}_FIELD_MISSING:${k}`);
  }
  const s = evidence.experts.S0, x = evidence.experts.NEXUS;
  if (!Array.isArray(s.scores) || s.scores.length !== n || s.scores.some((v) => !fin(v))) bad('S0_SCORES');
  if (!Array.isArray(s.topSet) || !s.topSet.length || s.topSet.some((i) => !Number.isInteger(i) || i < 0 || i >= n) || new Set(s.topSet).size !== s.topSet.length) bad('S0_TOPSET');
  if (typeof x.abstain !== 'boolean') bad('NEXUS_ABSTAIN');
  if (!(x.recommendedType === null || typeof x.recommendedType === 'string')) bad('NEXUS_RECOMMENDED_TYPE');
  if (!Array.isArray(x.rationaleCodes) || x.rationaleCodes.some((c) => typeof c !== 'string')) bad('NEXUS_CODES');
  if (!(x.reason === null || typeof x.reason === 'string')) bad('NEXUS_REASON');
  // declared provenance: required for every expert present; the envelope records it and cannot authenticate it
  if (!isObj(src)) reject('EVIDENCE_PROVENANCE_MISSING');
  if (stable(Object.keys(src).sort()) !== stable(names)) reject('EVIDENCE_PROVENANCE_MISMATCH', `declared=${Object.keys(src).sort().join(',')}`);
  for (const e of names) {
    const d = src[e]; if (!isObj(d) || typeof d.producer !== 'string' || !d.producer) reject('EVIDENCE_PROVENANCE_MISSING', e);
    for (const k of Object.keys(d)) if (!SOURCE_KEYS.has(k)) reject('EVIDENCE_PROVENANCE_MISMATCH', `${e}.${k}`);
    if (d.projection !== EXPERT_SHAPE[e].kind) reject('EVIDENCE_PROVENANCE_MISMATCH', `${e}.projection=${String(d.projection)}`);
    if (d.producerVersion !== undefined && typeof d.producerVersion !== 'string') reject('EVIDENCE_PROVENANCE_MISMATCH', `${e}.producerVersion`);
  }
  return { contract: evidence.contract, present: true, declaredSources: JSON.parse(JSON.stringify(src)), expertsPresent: names, kinds: Object.fromEntries(names.map((e) => [e, evidence.experts[e].kind])),
    evidenceDigest: digest(evidence), authenticated: false, verification: 'DECLARED_BY_CALLER_NOT_AUTHENTICATED' };
}

// --------------------------------------------------------------------------- 6. output integrity (frozen record)
/** The inner record hashes to its own decisionHash, also after a JSON round trip. */
export function assertRecordHash(record) {
  const { apiVersion, decisionHash, ...body } = record;
  if (typeof decisionHash !== 'string' || !/^[0-9a-f]{64}$/.test(decisionHash)) reject('DECISION_HASH_MALFORMED');
  let direct, round; try { direct = digest(body); round = digest(JSON.parse(JSON.stringify(body))); } catch (e) { reject('RECORD_NOT_SERIALISABLE', e.code ?? e.message); }
  if (direct !== decisionHash) reject('DECISION_HASH_MISMATCH');
  if (round !== decisionHash) reject('RECORD_NOT_JSON_STABLE');
  return apiVersion;
}
/** Every lawful action is ranked exactly once; the decision refers only to the menu; an abstention selects nothing. */
export function assertMenuIntegrity(legalActions, record) {
  const n = legalActions.length, R = record.rankedActions, bad = (d) => reject('MENU_INTEGRITY_VIOLATION', d);
  if (!Array.isArray(R) || R.length !== n) bad('RANKED_COUNT');
  const seen = new Set();
  R.forEach((a, k) => {
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= n || seen.has(a.index)) bad(`RANKED_INDEX:${String(a.index)}`);
    seen.add(a.index);
    if (a.type !== legalActions[a.index].type) bad(`RANKED_TYPE:${a.index}`);
    if (typeof a.key !== 'string' || !a.key) bad(`RANKED_KEY:${a.index}`);
    if (!Number.isInteger(a.rank) || a.rank < 0 || a.rank > k || (k > 0 && a.rank < R[k - 1].rank)) bad(`RANK_ORDER:${a.index}`);
  });
  const m = record.legalActionMenu;
  if (!isObj(m) || m.size !== n || m.complete !== true || !/^[0-9a-f]{64}$/.test(String(m.identity))) bad('MENU_IDENTITY');
  const d = record.recommendedActionOrAbstention, byIndex = new Map(R.map((a) => [a.index, a]));
  if (!isObj(d) || !Array.isArray(d.decisionSet)) bad('DECISION_SHAPE');
  const inMenu = (set, what) => { const ids = set.map((a) => a?.index); if (ids.some((i) => !byIndex.has(i)) || new Set(ids).size !== ids.length) bad(what); for (const a of set) if (a.type !== legalActions[a.index].type) bad(what + '_TYPE'); return ids; };
  if (d.kind === 'RECOMMEND') {
    const ids = inMenu(d.decisionSet, 'DECISION_SET'); if (!ids.length) bad('EMPTY_RECOMMENDATION');
    if (!d.representative || !ids.includes(d.representative.index)) bad('REPRESENTATIVE');
    const tau = record.uncertainty?.riskCriterion?.tau, rank0 = byIndex.get(ids[0]).rank;
    for (const i of ids) { const a = byIndex.get(i);
      if (a.constraintOutcome?.excluded !== false || a.selectable !== true) bad(`RECOMMENDED_ACTION_NOT_SELECTABLE:${i}`);
      if (a.riskStatus !== 'ESTIMATED' || !a.risk || !fin(tau) || !(a.risk.upperBound <= tau)) bad(`RECOMMENDED_ACTION_ABOVE_CRITERION:${i}`);
      if (a.rank !== rank0) bad(`DECISION_SET_SPANS_RANKS:${i}`); }
    if (R.some((a) => a.selectable && a.rank < rank0)) bad('RECOMMENDATION_IS_NOT_TOP_RANKED');
    if (record.safetyAssessment?.decisionMetRiskCriterion !== true) bad('CRITERION_FLAG');
  } else if (d.kind === 'ABSTAIN') {
    if (d.decisionSet.length !== 0 || d.representative !== null) bad('ABSTENTION_SELECTS_AN_ACTION');
    if (typeof d.reason !== 'string' || !d.reason.startsWith('ABSTAIN_')) bad('ABSTENTION_REASON');
    if (d.bestEffortNotRecommended) { inMenu(d.bestEffortNotRecommended.decisionSet ?? [], 'BEST_EFFORT_SET'); if (!/NOT a recommendation/.test(String(d.bestEffortNotRecommended.note))) bad('BEST_EFFORT_NOT_LABELLED'); }
    if (record.safetyAssessment?.decisionMetRiskCriterion !== false) bad('CRITERION_FLAG');
  } else bad(`DECISION_KIND:${String(d.kind)}`);
}
/** Labels: NOT_QUALIFIED (or NO_MODEL + abstention), R0 authority, empirical-estimate status, pinned identities. */
export function assertOutputLabels(record, game, pins = PINS) {
  if (record.apiVersion !== pins.innerApiVersion) reject('INNER_API_VERSION_MISMATCH', String(record.apiVersion));
  if (record.contract !== pins.recordContract) reject('RECORD_CONTRACT_MISMATCH', String(record.contract));
  if (record.kernel?.id !== pins.kernel.id || record.kernel?.version !== pins.kernel.version) reject('KERNEL_VERSION_MISMATCH', `${record.kernel?.id}/${record.kernel?.version}`);
  if (!same(record.authority, REQUIRED_AUTHORITY)) reject('AUTHORITY_LABEL_MISMATCH');
  const sa = record.safetyAssessment ?? {}, q = sa.qualification ?? {};
  if (sa.status !== 'EMPIRICAL_ESTIMATE_NOT_A_GUARANTEE' || typeof sa.statement !== 'string' || !sa.statement) reject('EPISTEMIC_STATUS_MISSING');
  if (GAMES[game].hasModel) {
    if (q.status !== 'NOT_QUALIFIED' || typeof q.statement !== 'string' || !q.statement) reject('QUALIFICATION_LABEL_MISMATCH', String(q.status));
    if (sa.rankingContract !== pins.rankingContract) reject('RANKING_CONTRACT_MISMATCH', String(sa.rankingContract));
    if (!same(record.uncertainty?.riskCriterion, { tau: pins.model.ranking.tau, tierWidth: pins.model.ranking.tierWidth, z: pins.model.ranking.z, oodPenalty: pins.model.ranking.oodPenalty })) reject('MODEL_PIN_MISMATCH', 'RISK_CRITERION_IN_RECORD');
    if (record.sourceIdentity?.modelHash !== pins.model.modelHash) reject('MODEL_PIN_MISMATCH', 'RECORD_MODEL_HASH');
  } else {
    if (q.status !== 'NO_MODEL') reject('QUALIFICATION_LABEL_MISMATCH', String(q.status));
    if (record.recommendedActionOrAbstention?.kind !== 'ABSTAIN') reject('RECOMMENDATION_WITHOUT_MODEL');
  }
  const s = record.sourceIdentity ?? {};
  if (s.kernelSourceHash !== pins.kernelSourceHash || s.adapterSourceHash !== pins.adapterSourceHash[game] || s.adapterId !== pins.adapterId[game]) reject('SOURCE_PIN_MISMATCH', 'RECORD_SOURCE_IDENTITY');
  if (!/^[0-9a-f]{64}$/.test(String(s.requestHash))) reject('REQUEST_HASH_MISSING');
}
/** Every number is finite; probabilities are in [0,1]; spreads are non-negative; bounds are ordered. */
export function assertNumericSerialization(record) {
  const walk = (v, p) => { if (typeof v === 'number') { if (!Number.isFinite(v)) reject('NON_FINITE_NUMBER_IN_RECORD', p); } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`)); else if (isObj(v)) for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`); };
  walk(record, 'record');
  const p01 = (v, what) => { if (!fin(v) || v < 0 || v > 1) reject('PROBABILITY_OUT_OF_RANGE', what); };
  for (const a of record.rankedActions) {
    if (a.riskStatus === 'ESTIMATED') {
      const r = a.risk, w = `rankedActions[index=${a.index}].risk`;
      if (!isObj(r) || r.kind !== 'EMPIRICAL_ESTIMATE') reject('RISK_NOT_LABELLED_EMPIRICAL', w);
      for (const k of ['estimate', 'upperBound', 'bagMin', 'bagMax']) p01(r[k], `${w}.${k}`);
      if (!fin(r.spread) || r.spread < 0) reject('UNCERTAINTY_OUT_OF_RANGE', `${w}.spread`);
      if (r.bagMin > r.estimate || r.estimate > r.bagMax || r.upperBound < r.estimate) reject('UNCERTAINTY_OUT_OF_RANGE', `${w}.ordering`);
      if (r.calibration && r.calibration.observedRate !== null) p01(r.calibration.observedRate, `${w}.calibration.observedRate`);
      if (!isObj(a.expectedRegret) || !fin(a.expectedRegret.estimate) || !fin(a.expectedRegret.spread) || a.expectedRegret.spread < 0) reject('UNCERTAINTY_OUT_OF_RANGE', `${w}.expectedRegret`);
      if (!Number.isInteger(a.riskTier) || a.riskTier < 0) reject('UNCERTAINTY_OUT_OF_RANGE', `${w}.riskTier`);
    } else if (a.risk !== null || a.expectedRegret !== null || a.riskTier !== null) reject('UNSUPPORTED_ACTION_CARRIES_AN_ESTIMATE', `index=${a.index}`);
  }
  const b = record.uncertainty?.bestRiskUpperBound; if (b !== null && b !== undefined) p01(b, 'uncertainty.bestRiskUpperBound');
}

// ------------------------------------------------------------------------------------ 7. derived, read-only views
const splitAnnotation = (s) => { const k = s.indexOf(':'); return k < 0 ? [s, ''] : [s.slice(0, k), s.slice(k + 1)]; };
/**
 * Three disjoint sections. An item appears as "established" only if the adapter declared it PUBLIC_DETERMINISTIC or
 * IMPLIED_BY_LEGALITY. Risk numbers appear only under `empiricalEstimates`, each labelled an estimate. Nothing in this
 * view states that an action is safe.
 */
export function separatedView(record) {
  const tau = record.uncertainty?.riskCriterion?.tau ?? null, det = [], emp = [], unk = [];
  for (const a of record.rankedActions) {
    const c = a.constraintOutcome, id = { index: a.index, type: a.type }, ann = c.annotations.map(splitAnnotation);
    det.push({ ...id, excludedByPublicConstraint: c.excluded, violatedHardConstraints: [...c.violatedHardConstraints],
      establishedConstraints: c.constraints.filter((x) => x.basis === 'PUBLIC_DETERMINISTIC' && x.status !== 'UNKNOWN').map((x) => ({ code: x.code, status: x.status })),
      impliedByLegality: c.constraints.filter((x) => x.basis === 'IMPLIED_BY_LEGALITY').map((x) => x.code),
      deterministicEffects: ann.filter(([t]) => t === 'DETERMINISTIC_EFFECT').map(([, e]) => e), publicHazardAtDestination: c.annotations.includes('DESTINATION_IS_PUBLIC_HAZARD'), basis: 'PUBLIC_DETERMINISTIC_OR_IMPLIED_BY_LEGALITY' });
    if (a.riskStatus === 'ESTIMATED') emp.push({ ...id, kind: 'EMPIRICAL_ESTIMATE', riskEstimate: a.risk.estimate, riskUpperBound: a.risk.upperBound, ensembleSpread: a.risk.spread, expectedRegretEstimate: a.expectedRegret.estimate, riskTier: a.riskTier,
      withinFrozenRiskCriterion: tau === null ? null : a.risk.upperBound <= tau, numericFeaturesOutsideEnvelope: a.outOfDistribution.numericFeaturesOutsideEnvelope, basis: 'LEARNED_FROM_FINITE_DEVELOPMENT_DATA_NOT_A_GUARANTEE' });
    const unknownConstraints = [...c.unknownConstraints], uncertainEffects = ann.filter(([t]) => t === 'UNCERTAIN_EFFECT').map(([, e]) => e);
    if (a.riskStatus !== 'ESTIMATED' || unknownConstraints.length || uncertainEffects.length) unk.push({ ...id, riskStatus: a.riskStatus, riskEstimateAvailable: a.riskStatus === 'ESTIMATED', detail: a.detail ?? null, unknownConstraints, uncertainEffects, basis: 'NOT_PUBLICLY_ESTABLISHED_OR_NOT_SUPPORTED' });
  }
  return { statement: 'Deterministic constraint outcomes and empirical risk estimates are different kinds of statement and are listed separately. An estimate within the frozen criterion is not an established property of the action.',
    deterministicallyEstablished: det, empiricalEstimates: emp, unsupportedOrUnknown: unk };
}
/** Numbers a consumer needs to judge how firm the decision is. All are read from the frozen record. */
export function uncertaintySummary(record) {
  const u = record.uncertainty, crit = u.riskCriterion, best = u.bestRiskUpperBound ?? null, R = record.rankedActions;
  const sel = R.filter((a) => a.selectable && a.riskStatus === 'ESTIMATED'), top = sel[0] ?? null, next = top ? sel.find((a) => a.rank !== top.rank) ?? null : null;
  const edge = top && crit ? (() => { const x = top.risk.upperBound / crit.tierWidth, lo = Math.floor(x + 1e-12); return Math.min(top.risk.upperBound - lo * crit.tierWidth, (lo + 1) * crit.tierWidth - top.risk.upperBound); })() : null;
  return { method: u.method, boundDefinition: 'risk estimate + z x spread across bags + oodPenalty x (numeric features outside the development envelope), clamped to [0,1]',
    boundKind: 'HEURISTIC_UPPER_BOUND_NOT_A_CALIBRATED_CONFIDENCE_INTERVAL', riskCriterion: crit, bestRiskUpperBound: best, marginToCriterion: best === null || !crit ? null : crit.tau - best,
    decisionMetRiskCriterion: record.safetyAssessment.decisionMetRiskCriterion, supportedActions: u.supportedActions, unsupportedActions: u.unsupportedActions, maxEnsembleSpread: u.maxEnsembleSpread, actionsOutsideNumericEnvelope: u.actionsOutsideNumericEnvelope,
    topRanked: top ? { riskTier: top.riskTier, distanceToNearestTierBoundary: edge } : null,
    nextRankedAlternative: top && next ? { tierGap: next.riskTier - top.riskTier, expectedRegretGap: next.expectedRegret.estimate - top.expectedRegret.estimate, riskUpperBoundGap: next.risk.upperBound - top.risk.upperBound } : null };
}
/**
 * Tie handling as the frozen kernel defines it: actions exactly equal on every substantive criterion are returned
 * together. `representative` in the frozen record is the first member in canonical-signature order. When the set holds
 * DISTINCT actions that order is not a preference, so the envelope reports no assured single action (finding F7).
 */
export function tieSummary(record) {
  const d = record.recommendedActionOrAbstention, set = d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? [];
  const keys = new Map(record.rankedActions.map((a) => [a.index, a.key])), distinct = new Set(set.map((a) => keys.get(a.index))).size;
  return { decisionSetSize: set.length, distinctActionsInSet: distinct, indistinguishableDistinctActions: distinct > 1,
    singleActionIdentified: d.kind === 'RECOMMEND' && distinct === 1, assuredRepresentative: d.kind === 'RECOMMEND' && distinct === 1 ? d.representative : null,
    rule: 'EXACT_EQUALITY_ON_ALL_RANKING_CRITERIA_RETURNS_THE_WHOLE_SET; listing order inside a set carries no preference' };
}

// ------------------------------------------------------------------------------------------------ envelope
function envelopeOf({ game, declaration, record, provenance, pinsInfo }) {
  const body = { envelopeContract: ENVELOPE_CONTRACT, assuredApiVersion: ASSURED_API_VERSION, labels: [...LABELS], qualification: 'NOT_QUALIFIED', deployment: 'SHADOW_MODE_NOT_PRODUCTION', authority: { ...REQUIRED_AUTHORITY }, scientificStatus: { ...SCIENTIFIC_STATUS },
    game, declaration: JSON.parse(JSON.stringify(declaration)), record, decisionHash: record.decisionHash,
    assurance: { checks: { SOURCE_PINS_VERIFIED: true, CONTRACT_DECLARATION_MATCHED: true, NO_EXECUTION_OR_PRIVILEGED_KEY: true, PUBLIC_STATE_COMPLETE_AND_IN_VOCABULARY: game === 'forge' ? true : 'NOT_APPLICABLE_FOR_ADAPTER', EVIDENCE_STRUCTURE_AND_PROVENANCE_DECLARED: true,
        INPUTS_NOT_MUTATED: true, DECISION_HASH_REPRODUCED: true, LEGAL_MENU_COMPLETE: true, OUTPUT_LABELS_ASSERTED: true, NUMERIC_SERIALIZATION_VERIFIED: true },
      pins: pinsInfo, evidenceProvenance: { ...provenance, kernelValidation: { status: record.evidence.status, issues: [...record.evidence.issues] }, use: record.evidence.use },
      view: separatedView(record), uncertainty: uncertaintySummary(record), tie: tieSummary(record) } };
  return { ...body, envelopeHash: digest(body) };
}
/** Offline check of an envelope: both hashes are internally consistent. It does not re-run the kernel. */
export function verifyEnvelope(envelope) {
  if (!isObj(envelope) || !isObj(envelope.record)) return { ok: false, reason: 'NOT_AN_ENVELOPE' };
  const { envelopeHash, ...body } = envelope, { apiVersion, decisionHash, ...inner } = envelope.record;
  let e, d; try { e = digest(body); d = digest(inner); } catch { return { ok: false, reason: 'NOT_SERIALISABLE' }; }
  const decisionOk = d === decisionHash && envelope.decisionHash === decisionHash, envelopeOk = e === envelopeHash;
  return { ok: decisionOk && envelopeOk, decisionHashConsistent: decisionOk, envelopeHashConsistent: envelopeOk, labelled: same(envelope.labels, LABELS) && envelope.qualification === 'NOT_QUALIFIED' };
}

/**
 * game: 'forge' (pinned SK1 model) or 'rescue' (no model; the kernel abstains). modelPath is accepted only so that a
 * caller can point at a copy of the model; any file that is not byte-identical to the pinned model is refused.
 */
export function createAssuredApi({ game = 'forge', modelPath } = {}) {
  const pinned = verifySourcePins({ game, modelPath });
  let inner; try { inner = createRecommendationApi({ game, modelPath: pinned.model?.path }); } catch (e) { if (e instanceof KernelRejection) throw new AssuranceRejection(e.code, e.detail, 'FROZEN_KERNEL'); throw e; }
  const described = inner.describe(); verifyInnerIdentity(described, game);
  const pinsInfo = Object.freeze({ freezeRecord: PINS.freezeRecord, freezeSha256: PINS.freezeSha256, inferenceFilesVerified: pinned.filesVerified, kernelSourceHash: PINS.kernelSourceHash, adapterSourceHash: PINS.adapterSourceHash[game],
    modelSha256: pinned.model ? PINS.model.sha256 : null, modelHash: pinned.model ? PINS.model.modelHash : null, verifiedAt: 'API_CONSTRUCTION' });

  function recommend(canonicalPublicState, legalActions, advisoryEvidence = null, declaration = undefined, ...extra) {
    if (extra.length) reject('UNEXPECTED_ARGUMENT', String(extra.length));
    if (!isObj(canonicalPublicState)) reject('STATE_NOT_AN_OBJECT');
    if (!Array.isArray(legalActions) || !legalActions.length) reject('LEGAL_MENU_MISSING_OR_EMPTY');
    assertDeclaration(declaration, game, canonicalPublicState, advisoryEvidence);
    scanKeysHardened(canonicalPublicState, 'state'); scanKeysHardened(legalActions, 'legalActions'); scanKeysHardened(advisoryEvidence ?? {}, 'advisoryEvidence'); scanKeysHardened(declaration.evidenceSources ?? {}, 'declaration.evidenceSources');
    if (game === 'forge') assertForgePublicState(canonicalPublicState, legalActions);
    const provenance = assertEvidenceEnvelope(advisoryEvidence, legalActions, declaration, game);
    const before = digest({ state: canonicalPublicState, legalActions, advisoryEvidence: advisoryEvidence ?? null });
    let record; try { record = inner.recommend(canonicalPublicState, legalActions, advisoryEvidence, { mode: 'RECOMMEND' }); } catch (e) { if (e instanceof KernelRejection) throw new AssuranceRejection(e.code, e.detail, 'FROZEN_KERNEL'); throw e; }
    if (digest({ state: canonicalPublicState, legalActions, advisoryEvidence: advisoryEvidence ?? null }) !== before) reject('INPUT_MUTATED_DURING_RECOMMENDATION');
    if (record.sourceIdentity?.requestHash !== before) reject('REQUEST_HASH_MISMATCH');
    assertRecordHash(record); assertOutputLabels(record, game); assertMenuIntegrity(legalActions, record); assertNumericSerialization(record);
    if (provenance.present && record.evidence.status !== 'VALID') reject('EVIDENCE_NOT_VALID', `${record.evidence.status}:${record.evidence.issues.join(';')}`);
    return envelopeOf({ game, declaration, record, provenance, pinsInfo });
  }
  /** Re-runs a request and compares BOTH hashes. request = { state, legalActions, advisoryEvidence, declaration }. */
  function replay(request, expected) {
    if (!isObj(expected) || typeof expected.decisionHash !== 'string' || typeof expected.envelopeHash !== 'string') reject('REPLAY_EXPECTATION_INCOMPLETE');
    const env = recommend(request.state, request.legalActions, request.advisoryEvidence ?? null, request.declaration);
    const decision = env.decisionHash === expected.decisionHash, envelope = env.envelopeHash === expected.envelopeHash;
    return { reproduced: decision && envelope, decisionHashReproduced: decision, envelopeHashReproduced: envelope, decisionHash: env.decisionHash, envelopeHash: env.envelopeHash };
  }
  const describe = () => ({ assuredApiVersion: ASSURED_API_VERSION, envelopeContract: ENVELOPE_CONTRACT, labels: [...LABELS], qualification: 'NOT_QUALIFIED', deployment: 'SHADOW_MODE_NOT_PRODUCTION', authority: { ...REQUIRED_AUTHORITY }, scientificStatus: { ...SCIENTIFIC_STATUS },
    game, contracts: { request: REQUEST_CONTRACT, record: RECORD_CONTRACT, observation: { ...GAMES[game].observationContract }, evidence: GAMES[game].evidenceContract, kernel: { id: KERNEL_ID, version: KERNEL_VERSION }, innerApi: INNER_API_VERSION },
    pins: pinsInfo, inner: described, capabilities: ['recommend', 'replay', 'verify', 'describe'], refuses: ['execute', 'dispatch', 'mutate', 'apply', 'commit', 'act'] });
  // Explicit refusals: a caller that reaches for an effect gets a stable rejection code instead of "undefined is not a function".
  const refuse = (name) => () => reject('EXECUTION_OR_MUTATION_REQUESTED', `method=${name}`);
  return Object.freeze({ recommend, replay, verify: verifyEnvelope, describe, execute: refuse('execute'), dispatch: refuse('dispatch'), mutate: refuse('mutate'), apply: refuse('apply'), commit: refuse('commit'), act: refuse('act') });
}
