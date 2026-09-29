import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { ContractError } from '../core/errors.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { EpistemicCategory, EvidenceAuthority } from '../stage3f/world-state-v1.js';

/* ===========================================================================
 * STAGE_3G_1 — SENTINEL_EPISTEMIC_PROVENANCE_V1
 *
 * The canonical Stage 3G epistemic schema. Stage 3F froze EPISTEMIC_PROVENANCE_REQUIRED=true and explicitly left the
 * level scale undefined; this module defines it.
 *
 * Two ORTHOGONAL axes, because the candidate E0-E5 scale conflated them:
 *   epistemicClass  what KIND of knowledge a value is (observed, derived, verified, predicted, counterfactual,
 *                   synthetic, unknown);
 *   access          WHO may read it (DEPLOYABLE at decision time, PRIVILEGED simulator state, ORACLE labels). The Stage 3F
 *                   provenance rule ("deployable / privileged / oracle") is this axis. A kernel position is not a weaker
 *                   kind of observation; it is a true fact the decision maker is not allowed to see.
 *
 * The classes are NOT a single authority ladder. E0-E2 are authoritative about the actual present; E3 is provisional and
 * verifiable (a later observation can confirm or refute it); E4 and E5 are non-factual and can never be verified, so they
 * can never become authoritative at all. EU marks absence and never carries a value.
 *
 * Records are immutable and content-addressed. Validity and verification status change only through the deterministic
 * transitions of the epistemic state below, which are logged append-only; a record's class never changes. There is no
 * promote operation: a prediction is "promoted" only in the sense that an independent observation of the same path is
 * admitted and the prediction is marked CONFIRMED. The authoritative value is then the observation, never the prediction.
 *
 * Diagnostics (task-state contamination flags) are reported, never voted: they carry no authority and cannot change a
 * decision. Authority stays R0.
 * ========================================================================= */

export const EPISTEMIC_SCHEMA_ID = 'SENTINEL_EPISTEMIC_PROVENANCE_V1';
export const EPISTEMIC_SCHEMA_VERSION = 1;

export const EpistemicClass = deepFreeze({ E0: 'E0', E1: 'E1', E2: 'E2', E3: 'E3', E4: 'E4', E5: 'E5', EU: 'EU' });
export const EPISTEMIC_CLASSES = deepFreeze({
  E0: { name: 'OBSERVED', tier: 'AUTHORITATIVE', definition: 'directly present in the authoritative current observation of the environment', verifiable: 'NOT_REQUIRED' },
  E1: { name: 'DETERMINISTICALLY_DERIVED', tier: 'AUTHORITATIVE', definition: 'computed exactly, by a declared deterministic method, from VALID E0/E1/E2 records only', verifiable: 'NOT_REQUIRED' },
  E2: { name: 'EXTERNALLY_VERIFIED', tier: 'AUTHORITATIVE', definition: 'asserted by an independent verifier registered as trusted for this environment', verifiable: 'BY_TRUSTED_VERIFIER' },
  E3: { name: 'MODEL_PREDICTION', tier: 'PROVISIONAL', definition: 'a model estimate of a future or latent value of the ACTUAL world; verifiable by later observation', verifiable: 'BY_LATER_OBSERVATION' },
  E4: { name: 'COUNTERFACTUAL', tier: 'NON_FACTUAL', definition: 'a prediction for an action that was not executed; the branch never happens, so it can never be observed', verifiable: 'NEVER' },
  E5: { name: 'SYNTHETIC', tier: 'NON_FACTUAL', definition: 'generated, simulated or training-only experience; never evidence about the live world', verifiable: 'NEVER' },
  EU: { name: 'UNKNOWN', tier: 'ABSENT', definition: 'no admissible value; value and confidence are null', verifiable: 'NONE' },
});
/** Field-level vocabulary used by the Stage 3G.2 state contracts, mapped onto the classes. */
export const FieldClass = deepFreeze({ OBSERVED: 'E0', DETERMINISTICALLY_DERIVED: 'E1', MODEL_INFERRED: 'E3', UNAVAILABLE: 'EU' });
export const Access = deepFreeze({ DEPLOYABLE: 'DEPLOYABLE', PRIVILEGED: 'PRIVILEGED', ORACLE: 'ORACLE' });
export const Lane = deepFreeze({ AUTHORITATIVE: 'AUTHORITATIVE', PROVISIONAL: 'PROVISIONAL', COUNTERFACTUAL: 'COUNTERFACTUAL', TRAINING: 'TRAINING', NONE: 'NONE' });
const LANE_OF = deepFreeze({ E0: 'AUTHORITATIVE', E1: 'AUTHORITATIVE', E2: 'AUTHORITATIVE', E3: 'PROVISIONAL', E4: 'COUNTERFACTUAL', E5: 'TRAINING', EU: 'NONE' });
export const Validity = deepFreeze({ VALID: 'VALID', SUPERSEDED: 'SUPERSEDED', STALE: 'STALE', CONTRADICTED: 'CONTRADICTED', REFUTED: 'REFUTED', CONFIRMED_HISTORICAL: 'CONFIRMED_HISTORICAL' });
export const Verification = deepFreeze({ NOT_REQUIRED: 'NOT_REQUIRED', VERIFIED_BY_TRUSTED_SOURCE: 'VERIFIED_BY_TRUSTED_SOURCE', UNVERIFIED: 'UNVERIFIED',
  CONFIRMED: 'CONFIRMED', REFUTED: 'REFUTED', UNVERIFIABLE: 'UNVERIFIABLE', NONE: 'NONE' });
const INITIAL_VERIFICATION = deepFreeze({ E0: 'NOT_REQUIRED', E1: 'NOT_REQUIRED', E2: 'VERIFIED_BY_TRUSTED_SOURCE', E3: 'UNVERIFIED', E4: 'UNVERIFIABLE', E5: 'UNVERIFIABLE', EU: 'NONE' });
export const InvalidationReason = deepFreeze({
  NEWER_OBSERVATION: 'NEWER_OBSERVATION', INPUT_SUPERSEDED: 'INPUT_SUPERSEDED', EQUAL_TIME_CONFLICT: 'EQUAL_TIME_CONFLICT',
  CONTRADICTED_BY_OBSERVATION: 'CONTRADICTED_BY_OBSERVATION', CONFIRMED_BY_OBSERVATION: 'CONFIRMED_BY_OBSERVATION',
});
/** Source kinds. A SYNTHETIC_GENERATOR or SIMULATOR_ORACLE source can never produce an authoritative class. */
export const SourceKind = deepFreeze({ ENVIRONMENT_OBSERVATION: 'ENVIRONMENT_OBSERVATION', DETERMINISTIC_DERIVATION: 'DETERMINISTIC_DERIVATION',
  TRUSTED_VERIFIER: 'TRUSTED_VERIFIER', PREDICTIVE_MODEL: 'PREDICTIVE_MODEL', COUNTERFACTUAL_MODEL: 'COUNTERFACTUAL_MODEL',
  SYNTHETIC_GENERATOR: 'SYNTHETIC_GENERATOR', SIMULATOR_ORACLE: 'SIMULATOR_ORACLE', MEMORY: 'MEMORY' });
const SOURCE_KINDS_FOR_CLASS = deepFreeze({
  E0: ['ENVIRONMENT_OBSERVATION', 'MEMORY'], E1: ['DETERMINISTIC_DERIVATION'], E2: ['TRUSTED_VERIFIER'], E3: ['PREDICTIVE_MODEL'],
  E4: ['COUNTERFACTUAL_MODEL'], E5: ['SYNTHETIC_GENERATOR', 'SIMULATOR_ORACLE'], EU: ['ENVIRONMENT_OBSERVATION', 'DETERMINISTIC_DERIVATION', 'MEMORY'],
});
/** Taint order for derivation: a value derived from inputs is at best as strong as its weakest input. */
const TAINT_RANK = deepFreeze({ E0: 0, E2: 0, E1: 0, E3: 1, E4: 2, E5: 3, EU: 4 });

/** The record fields every epistemic value carries (the Stage 3G required list). */
export const RECORD_FIELDS = deepFreeze(['epistemicClass', 'source', 'sourceStateHash', 'timestamp', 'confidence', 'validity', 'invalidationReason', 'verificationStatus']);

/* ------------------------------------------------------------ promotion rules */
export const PROMOTION_RULES = deepFreeze([
  { id: 'P1_CLASS_IMMUTABLE', rule: 'A record\'s epistemicClass is fixed at creation. No operation changes it; there is no promote operation. Any request to re-label E3/E4/E5/EU as E0/E1/E2 is refused and flagged UNVERIFIED_STATE_PROMOTION.' },
  { id: 'P2_AUTHORITATIVE_SLOT', rule: 'Only E0, E1 and E2 records with access DEPLOYABLE may occupy a path\'s authoritative slot.' },
  { id: 'P3_PREDICTION_PROVISIONAL', rule: 'E3 is admitted only to the provisional lane of its path. It never occupies or overwrites the authoritative slot, whatever its confidence. A request to admit E3 as authoritative is refused and flagged.' },
  { id: 'P4_COUNTERFACTUAL_EXCLUDED', rule: 'E4 is never admitted to runtime world state (it belongs to a counterfactual ledger). A request to admit it is refused; a request to admit it as authoritative is also flagged.' },
  { id: 'P5_SYNTHETIC_EXCLUDED', rule: 'E5 is never admitted to runtime world state. A record whose source kind is SYNTHETIC_GENERATOR or SIMULATOR_ORACLE may only carry class E5; claiming any other class is refused and flagged (synthetic masquerade).' },
  { id: 'P6_RECENCY', rule: 'An authoritative record older (logical time) than the current authoritative record of its path is kept as history and never overwrites it (historical memory never overwrites a newer verified observation). Equal time with a different value from the same class marks the path CONTRADICTED: neither value is authoritative until a newer observation arrives. An older value re-asserted from MEMORY is history only.' },
  { id: 'P7_SOURCE_STATE_BINDING', rule: 'An E0 record (including one re-asserted from MEMORY) must carry the sourceStateHash of the observation registered for its logical time. A record bound to another or an unregistered observation (for example a replayed old observation relabelled as current) is refused.' },
  { id: 'P8_DERIVATION_TAINT', rule: 'E1 requires a declared method and inputRecordIds that are all admitted, all E0/E1/E2 and all VALID, and a sourceStateHash equal to the digest of those inputs. A derivation with any E3/E4/E5 input takes the weakest input class (deriveClass) and may not claim E1; the claim is refused and flagged.' },
  { id: 'P9_TRUSTED_VERIFIER', rule: 'E2 requires verification.verifierId registered as trusted for the environment. The Forge registry is empty, so no Forge record can claim E2.' },
  { id: 'P10_STALENESS', rule: 'When a newer authoritative E0 is admitted for a path, the previous authoritative record becomes SUPERSEDED, every VALID E1 derived from it (transitively) becomes STALE, and every provisional E3 on that path whose targetTime is at or before the new observation becomes CONFIRMED (equal value) or REFUTED.' },
  { id: 'P11_ACCESS', rule: 'PRIVILEGED and ORACLE access is refused from runtime state whatever the class; such values exist only in offline evaluation.' },
  { id: 'P12_UNKNOWN', rule: 'EU carries value=null and confidence=null, is never stored in the authoritative slot, and is what reading an absent or contradicted path returns.' },
]);

export const CONTAMINATION_FLAGS = deepFreeze({
  STALE_ASSUMPTION: 'a trace relies on a record that is no longer VALID, or for whose path a newer authoritative record exists',
  UNSUPPORTED_ASSUMPTION: 'a trace relies on a path with no authoritative record, on a record that was never admitted, or on an E3/E4/E5 record as though it were authoritative',
  STALE_PLAN: 'a plan formed against an earlier state is used after any path it depends on changed',
  CONTRADICTED_STATE: 'a path the trace relies on is CONTRADICTED, or the record it relies on was REFUTED',
  UNVERIFIED_STATE_PROMOTION: 'a refused attempt to place E3/E4/E5 (or a synthetic source) in the authoritative slot or to re-label it, or a trace that uses such a record as authoritative',
});
export const DIAGNOSTIC_AUTHORITY = deepFreeze({ authority: 'NONE', vote: false, affectsDecision: false, note: 'contamination flags are diagnostics, not expert votes' });

export class EpistemicContractError extends ContractError {}

const requireString = (v, name) => { if (typeof v !== 'string' || v.trim() === '') throw new EpistemicContractError(`${name} must be a non-empty string`); return v; };
const requireTime = (v, name) => { if (!Number.isSafeInteger(v) || v < 0) throw new EpistemicContractError(`${name} must be a non-negative safe integer`); return v; };

/** The class a derived value may claim from the classes of its inputs: the weakest input (E0/E1/E2 derive E1). */
export function deriveClass(inputClasses) {
  if (!Array.isArray(inputClasses) || inputClasses.length === 0) throw new EpistemicContractError('a derivation needs at least one input class');
  const worst = inputClasses.reduce((w, c) => { if (TAINT_RANK[c] === undefined) throw new EpistemicContractError(`unknown class ${c}`); return TAINT_RANK[c] > TAINT_RANK[w] ? c : w; }, inputClasses[0]);
  return TAINT_RANK[worst] === 0 ? 'E1' : worst;
}

/** Digest of a derivation's inputs: the sourceStateHash an E1 record must carry. */
export function derivationInputsHash(inputRecords) {
  return sha256([...inputRecords].map((r) => ({ recordId: r.recordId, value: r.value })).sort((a, b) => (a.recordId < b.recordId ? -1 : 1)));
}

/**
 * An immutable epistemic record. `timestamp` is logical: { logicalTime, targetTime? } (targetTime: the time a prediction
 * is about; defaults to logicalTime). Wall-clock time is never used, so replay is deterministic.
 */
export function createEpistemicRecord({ path, value = null, epistemicClass, source, sourceStateHash, timestamp, confidence = null, access = 'DEPLOYABLE', derivation = null, verification = null }) {
  const parts = Array.isArray(path) ? [...path] : typeof path === 'string' ? path.split('.') : [];
  if (parts.length < 1 || parts.some((p) => typeof p !== 'string' || p === '')) throw new EpistemicContractError('path must be a non-empty list of names');
  if (EPISTEMIC_CLASSES[epistemicClass] === undefined) throw new EpistemicContractError(`unknown epistemic class ${epistemicClass}`);
  if (!Object.values(Access).includes(access)) throw new EpistemicContractError(`unknown access ${access}`);
  if (!source || typeof source !== 'object') throw new EpistemicContractError('source must be an object');
  requireString(source.sourceId, 'source.sourceId');
  if (!Object.values(SourceKind).includes(source.kind)) throw new EpistemicContractError(`unknown source kind ${source.kind}`);
  requireString(sourceStateHash, 'sourceStateHash');
  if (!timestamp || typeof timestamp !== 'object') throw new EpistemicContractError('timestamp must be { logicalTime, targetTime? }');
  const logicalTime = requireTime(timestamp.logicalTime, 'timestamp.logicalTime');
  const targetTime = timestamp.targetTime === undefined ? logicalTime : requireTime(timestamp.targetTime, 'timestamp.targetTime');
  if (epistemicClass === 'EU') {
    if (value !== null || confidence !== null) throw new EpistemicContractError('EU records carry value=null and confidence=null');
  } else if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new EpistemicContractError('known records need confidence in [0,1]');
  }
  if ((epistemicClass === 'E0' || epistemicClass === 'E1') && confidence !== null && confidence !== 1) throw new EpistemicContractError('E0/E1 are exact: confidence must be 1');
  if (epistemicClass === 'E1') {
    if (!derivation || typeof derivation !== 'object') throw new EpistemicContractError('E1 requires derivation { method, inputRecordIds }');
    requireString(derivation.method, 'derivation.method');
    if (!Array.isArray(derivation.inputRecordIds) || derivation.inputRecordIds.length === 0) throw new EpistemicContractError('E1 requires inputRecordIds');
  }
  try { stableStringify(value); } catch (e) { throw new EpistemicContractError('value is not deterministically serialisable', { cause: e.message }); }
  const body = {
    schemaId: EPISTEMIC_SCHEMA_ID, path: parts, value: canonicalize(value), epistemicClass, access,
    source: canonicalize({ sourceId: source.sourceId, kind: source.kind, version: source.version ?? null }),
    sourceStateHash, timestamp: { logicalTime, targetTime }, confidence,
    validity: 'VALID', invalidationReason: null, verificationStatus: INITIAL_VERIFICATION[epistemicClass],
    derivation: derivation === null ? null : canonicalize({ method: derivation.method, inputRecordIds: [...derivation.inputRecordIds].sort() }),
    verification: verification === null ? null : canonicalize(verification),
  };
  return deepFreeze({ ...body, recordId: `sha256:${sha256(body)}` });
}

/* ------------------------------------------------------------ epistemic state */

const pathKey = (parts) => parts.join('\u001f');
const valueHash = (v) => sha256(v === undefined ? null : v);

/**
 * A fresh epistemic state for one environment. Pure: every operation returns a new state.
 * trustedVerifiers: verifier ids allowed to assert E2 (empty for Forge).
 */
export function createEpistemicState({ environment, trustedVerifiers = [] }) {
  requireString(environment?.identity, 'environment.identity'); requireString(environment?.version, 'environment.version');
  const authority = defaultAuthorityPolicy(); assertEvaluationOnly(authority);
  return deepFreeze({
    schemaId: EPISTEMIC_SCHEMA_ID, environment: { identity: environment.identity, version: environment.version }, trustedVerifiers: [...trustedVerifiers].sort(),
    observations: {}, records: {}, status: {}, slots: {}, transitions: [], refusals: [], authority,
  });
}

/** Register the authoritative observation for a logical time (the hash E0 records must bind to). */
export function registerObservation(state, { logicalTime, observationHash }) {
  requireTime(logicalTime, 'logicalTime'); requireString(observationHash, 'observationHash');
  const existing = state.observations[logicalTime];
  if (existing !== undefined && existing !== observationHash) throw new EpistemicContractError('a different observation is already registered for this logical time', { logicalTime });
  return deepFreeze({ ...structuredClone(state), observations: { ...state.observations, [logicalTime]: observationHash } });
}

const emptySlot = () => ({ authoritative: null, contradicted: false, contradictedIds: [], provisional: [], history: [] });

function refuse(s, record, rule, flag = null) {
  s.refusals.push({ recordId: record.recordId, path: record.path, epistemicClass: record.epistemicClass, rule, flag });
  return { decision: 'REFUSED', rule, flags: flag === null ? [] : [flag] };
}
function setStatus(s, recordId, validity, reason, verificationStatus = undefined) {
  const prev = s.status[recordId];
  const next = { validity, invalidationReason: reason, verificationStatus: verificationStatus ?? prev.verificationStatus };
  s.status[recordId] = next;
  s.transitions.push({ recordId, from: prev.validity, to: validity, reason, verificationStatus: next.verificationStatus });
}
function staleDependents(s, recordId) {
  const queue = [recordId]; const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift();
    for (const [rid, r] of Object.entries(s.records).sort()) {
      if (r.derivation === null || !r.derivation.inputRecordIds.includes(id) || seen.has(rid)) continue;
      seen.add(rid); queue.push(rid);
      if (s.status[rid].validity === 'VALID') setStatus(s, rid, 'STALE', 'INPUT_SUPERSEDED');
    }
  }
}

/**
 * Admit one record under the promotion rules. `requestedLane` lets a caller ASK for a lane (for example a model that
 * wants its prediction treated as authoritative); the request never changes the outcome except to be refused and
 * flagged. Returns { state, decision, rule, flags }.
 */
export function admit(state, record, { requestedLane = null } = {}) {
  const s = structuredClone(state);
  const cls = record.epistemicClass;
  const lane = LANE_OF[cls];
  const out = (r) => ({ state: deepFreeze(s), ...r });
  if (s.records[record.recordId] !== undefined) return out({ decision: 'DUPLICATE', rule: null, flags: [] });
  const { recordId: _id, ...body } = record;
  if (`sha256:${sha256(body)}` !== record.recordId) return out(refuse(s, record, 'RECORD_DIGEST'));
  if (requestedLane === 'AUTHORITATIVE' && lane !== 'AUTHORITATIVE') {
    return out(refuse(s, record, cls === 'E3' ? 'P3_PREDICTION_PROVISIONAL' : cls === 'E4' ? 'P4_COUNTERFACTUAL_EXCLUDED' : cls === 'E5' ? 'P5_SYNTHETIC_EXCLUDED' : 'P12_UNKNOWN', 'UNVERIFIED_STATE_PROMOTION'));
  }
  if (record.access !== 'DEPLOYABLE') return out(refuse(s, record, 'P11_ACCESS', lane === 'AUTHORITATIVE' ? 'UNVERIFIED_STATE_PROMOTION' : null));
  if (['SYNTHETIC_GENERATOR', 'SIMULATOR_ORACLE'].includes(record.source.kind) && cls !== 'E5') return out(refuse(s, record, 'P5_SYNTHETIC_EXCLUDED', 'UNVERIFIED_STATE_PROMOTION'));
  if (!SOURCE_KINDS_FOR_CLASS[cls].includes(record.source.kind)) return out(refuse(s, record, 'P1_CLASS_IMMUTABLE', lane === 'AUTHORITATIVE' ? 'UNVERIFIED_STATE_PROMOTION' : null));
  if (cls === 'E4') return out(refuse(s, record, 'P4_COUNTERFACTUAL_EXCLUDED'));
  if (cls === 'E5') return out(refuse(s, record, 'P5_SYNTHETIC_EXCLUDED'));
  if (cls === 'EU') return out(refuse(s, record, 'P12_UNKNOWN'));
  if (cls === 'E2' && !(record.verification && s.trustedVerifiers.includes(record.verification.verifierId))) return out(refuse(s, record, 'P9_TRUSTED_VERIFIER', 'UNVERIFIED_STATE_PROMOTION'));
  if (cls === 'E0' && s.observations[record.timestamp.logicalTime] !== record.sourceStateHash) {
    return out(refuse(s, record, 'P7_SOURCE_STATE_BINDING'));
  }
  if (cls === 'E1') {
    const inputs = record.derivation.inputRecordIds.map((id) => s.records[id]);
    if (inputs.some((r) => r === undefined)) return out(refuse(s, record, 'P8_DERIVATION_TAINT', 'UNSUPPORTED_ASSUMPTION'));
    if (deriveClass(inputs.map((r) => r.epistemicClass)) !== 'E1') return out(refuse(s, record, 'P8_DERIVATION_TAINT', 'UNVERIFIED_STATE_PROMOTION'));
    if (inputs.some((r) => s.status[r.recordId].validity !== 'VALID')) return out(refuse(s, record, 'P8_DERIVATION_TAINT', 'STALE_ASSUMPTION'));
    if (derivationInputsHash(inputs) !== record.sourceStateHash) return out(refuse(s, record, 'P8_DERIVATION_TAINT'));
  }

  const key = pathKey(record.path);
  const slot = s.slots[key] ?? emptySlot();
  s.slots[key] = slot;
  s.records[record.recordId] = record;
  s.status[record.recordId] = { validity: 'VALID', invalidationReason: null, verificationStatus: record.verificationStatus };

  if (cls === 'E3') { slot.provisional.push(record.recordId); return out({ decision: 'ADMITTED_PROVISIONAL', rule: 'P3_PREDICTION_PROVISIONAL', flags: [] }); }

  /* authoritative lane: E0 / E1 / E2 */
  const t = record.timestamp.logicalTime;
  const current = slot.authoritative === null ? null : s.records[slot.authoritative];
  const flags = [];
  if (slot.contradicted) {
    const tc = s.records[slot.contradictedIds[0]].timestamp.logicalTime;
    if (t <= tc) { slot.history.push(record.recordId); setStatus(s, record.recordId, 'SUPERSEDED', 'NEWER_OBSERVATION'); return out({ decision: 'RECORDED_HISTORICAL', rule: 'P6_RECENCY', flags }); }
    slot.contradicted = false; slot.contradictedIds = [];
  } else if (current !== null) {
    const tc = current.timestamp.logicalTime;
    if (t < tc || (t === tc && record.source.kind === 'MEMORY')) {
      slot.history.push(record.recordId); setStatus(s, record.recordId, 'SUPERSEDED', 'NEWER_OBSERVATION');
      return out({ decision: 'RECORDED_HISTORICAL', rule: 'P6_RECENCY', flags });
    }
    if (t === tc && current.epistemicClass === cls && valueHash(current.value) !== valueHash(record.value)) {
      slot.contradicted = true; slot.contradictedIds = [current.recordId, record.recordId].sort(); slot.authoritative = null;
      setStatus(s, current.recordId, 'CONTRADICTED', 'EQUAL_TIME_CONFLICT'); setStatus(s, record.recordId, 'CONTRADICTED', 'EQUAL_TIME_CONFLICT');
      staleDependents(s, current.recordId);
      return out({ decision: 'CONTRADICTED', rule: 'P6_RECENCY', flags: ['CONTRADICTED_STATE'] });
    }
    if (t === tc && valueHash(current.value) === valueHash(record.value) && current.epistemicClass === cls) {
      slot.history.push(record.recordId); return out({ decision: 'CORROBORATED', rule: 'P6_RECENCY', flags });
    }
    slot.history.push(current.recordId); setStatus(s, current.recordId, 'SUPERSEDED', 'NEWER_OBSERVATION'); staleDependents(s, current.recordId);
  }
  slot.authoritative = record.recordId;
  if (cls === 'E0') {
    for (const pid of slot.provisional) {
      const p = s.records[pid];
      if (s.status[pid].validity !== 'VALID' || p.timestamp.targetTime > t) continue;
      if (valueHash(p.value) === valueHash(record.value)) setStatus(s, pid, 'CONFIRMED_HISTORICAL', 'CONFIRMED_BY_OBSERVATION', 'CONFIRMED');
      else setStatus(s, pid, 'REFUTED', 'CONTRADICTED_BY_OBSERVATION', 'REFUTED');
    }
  }
  return out({ decision: 'ADMITTED_AUTHORITATIVE', rule: 'P2_AUTHORITATIVE_SLOT', flags });
}

/** The explicit (always refused) promotion request: P1. Exists so a caller that tries is recorded, not silently ignored. */
export function requestPromotion(state, recordId, targetClass) {
  const s = structuredClone(state);
  const r = s.records[recordId];
  const entry = { recordId, path: r?.path ?? null, epistemicClass: r?.epistemicClass ?? null, rule: 'P1_CLASS_IMMUTABLE', requested: targetClass, flag: 'UNVERIFIED_STATE_PROMOTION' };
  s.refusals.push(entry);
  return { state: deepFreeze(s), decision: 'REFUSED', rule: 'P1_CLASS_IMMUTABLE', flags: ['UNVERIFIED_STATE_PROMOTION'] };
}

/** Read the authoritative value of a path. Absent or contradicted -> EU (value null). Never returns a prediction. */
export function readAuthoritative(state, path) {
  const slot = state.slots[pathKey(Array.isArray(path) ? path : path.split('.'))];
  if (!slot || slot.authoritative === null) return deepFreeze({ epistemicClass: 'EU', value: null, confidence: null, contradicted: Boolean(slot?.contradicted), recordId: null });
  const r = state.records[slot.authoritative];
  return deepFreeze({ epistemicClass: r.epistemicClass, value: r.value, confidence: r.confidence, contradicted: false, recordId: r.recordId, ...state.status[r.recordId] });
}
/** Provisional predictions of a path, with their current verification status. Never mixed with the authoritative read. */
export function readProvisional(state, path) {
  const slot = state.slots[pathKey(Array.isArray(path) ? path : path.split('.'))];
  return deepFreeze((slot?.provisional ?? []).map((id) => ({ recordId: id, value: state.records[id].value, epistemicClass: 'E3', ...state.status[id] })));
}
export const recordStatus = (state, recordId) => state.status[recordId] ?? null;

/** Digest of the authoritative content of a set of paths (what a plan is formed against). */
export function authoritativeDigest(state, paths) {
  return sha256([...paths].map((p) => (Array.isArray(p) ? p : p.split('.'))).map((p) => ({ path: p, ...readAuthoritative(state, p) }))
    .map((x) => ({ path: x.path, recordId: x.recordId, contradicted: x.contradicted })));
}

/**
 * Task-state contamination audit of a decision trace. Diagnostics only (DIAGNOSTIC_AUTHORITY); the function reads the
 * state and the trace and returns flags, it never alters either.
 * trace: { assumptions: [{ path, recordId, usedAs: 'AUTHORITATIVE'|'PROVISIONAL' }], plan?: { formedAgainstDigest, paths } }
 */
export function auditContamination(state, trace) {
  const counts = Object.fromEntries(Object.keys(CONTAMINATION_FLAGS).map((k) => [k, 0]));
  const details = [];
  const add = (flag, detail) => { counts[flag] += 1; details.push({ flag, ...detail }); };
  for (const a of trace.assumptions ?? []) {
    const parts = Array.isArray(a.path) ? a.path : a.path.split('.');
    const slot = state.slots[pathKey(parts)];
    const r = a.recordId ? state.records[a.recordId] : undefined;
    const st = r ? state.status[r.recordId] : null;
    if (a.recordId && r === undefined) { add('UNSUPPORTED_ASSUMPTION', { path: parts, reason: 'RECORD_NEVER_ADMITTED' }); continue; }
    if (!a.recordId && (!slot || slot.authoritative === null) && !slot?.contradicted) { add('UNSUPPORTED_ASSUMPTION', { path: parts, reason: 'NO_AUTHORITATIVE_RECORD' }); continue; }
    if (slot?.contradicted) add('CONTRADICTED_STATE', { path: parts, reason: 'PATH_CONTRADICTED' });
    if (r === undefined) continue;
    if (a.usedAs === 'AUTHORITATIVE' && LANE_OF[r.epistemicClass] !== 'AUTHORITATIVE') {
      add('UNSUPPORTED_ASSUMPTION', { path: parts, reason: `${r.epistemicClass}_USED_AS_AUTHORITATIVE` });
      add('UNVERIFIED_STATE_PROMOTION', { path: parts, reason: `${r.epistemicClass}_USED_AS_AUTHORITATIVE` });
    }
    if (st.validity === 'REFUTED' || st.validity === 'CONTRADICTED') add('CONTRADICTED_STATE', { path: parts, reason: `RECORD_${st.validity}` });
    else if (st.validity === 'SUPERSEDED' || st.validity === 'STALE') add('STALE_ASSUMPTION', { path: parts, reason: `RECORD_${st.validity}` });
    else if (LANE_OF[r.epistemicClass] === 'AUTHORITATIVE' && slot && slot.authoritative !== null && slot.authoritative !== r.recordId
      && state.records[slot.authoritative].timestamp.logicalTime > r.timestamp.logicalTime) add('STALE_ASSUMPTION', { path: parts, reason: 'NEWER_AUTHORITATIVE_RECORD' });
  }
  if (trace.plan && authoritativeDigest(state, trace.plan.paths) !== trace.plan.formedAgainstDigest) add('STALE_PLAN', { reason: 'DEPENDED_PATH_CHANGED_SINCE_FORMATION' });
  const promotions = state.refusals.filter((x) => x.flag === 'UNVERIFIED_STATE_PROMOTION').length;
  counts.UNVERIFIED_STATE_PROMOTION += promotions;
  if (promotions) details.push({ flag: 'UNVERIFIED_STATE_PROMOTION', reason: 'REFUSED_PROMOTION_ATTEMPTS', count: promotions });
  return deepFreeze({ flags: counts, contaminated: Object.values(counts).some((v) => v > 0), details, ...DIAGNOSTIC_AUTHORITY });
}

/* ------------------------------------------------------------ compatibility with SENTINEL_WORLD_STATE_V1 */

/**
 * Projection of the AUTHORITATIVE lane onto the frozen Stage 3F world-state vocabulary. E0 -> OBSERVED, E1 -> DERIVED.
 * E3 is deliberately NOT projected: SENTINEL_WORLD_STATE_V1 selects a PREDICTED fact as a path's fact when no observation
 * exists, which a consumer reading `facts` without checking the category would take as current state. E2/E4/E5 have no
 * World State V1 category and are refused.
 */
export const WORLD_STATE_V1_PROJECTION = deepFreeze({
  E0: { category: EpistemicCategory.OBSERVED, authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION },
  E1: { category: EpistemicCategory.DERIVED, authority: EvidenceAuthority.VALIDATED_DERIVATION },
  E2: null, E3: 'NOT_PROJECTED (provisional lane only)', E4: null, E5: null,
  EU: { category: EpistemicCategory.UNKNOWN, authority: EvidenceAuthority.UNKNOWN },
});

export const EPISTEMIC_SCHEMA = deepFreeze({
  schemaId: EPISTEMIC_SCHEMA_ID, schemaVersion: EPISTEMIC_SCHEMA_VERSION,
  axes: { epistemicClass: 'what kind of knowledge a value is', access: 'who may read it at decision time' },
  classes: EPISTEMIC_CLASSES, fieldClasses: FieldClass, access: Access, lanes: LANE_OF, validity: Validity, verification: Verification,
  initialVerification: INITIAL_VERIFICATION, invalidationReasons: InvalidationReason, sourceKinds: SourceKind, sourceKindsForClass: SOURCE_KINDS_FOR_CLASS,
  taintOrder: TAINT_RANK, recordFields: RECORD_FIELDS, promotionRules: PROMOTION_RULES, contaminationFlags: CONTAMINATION_FLAGS,
  diagnosticAuthority: DIAGNOSTIC_AUTHORITY, worldStateV1Projection: WORLD_STATE_V1_PROJECTION,
  timestamp: 'logical time (environment tick) and, for predictions, the target logical time; wall-clock time is never an input',
  forgeTrustedVerifiers: [],
  candidateTaxonomyEvaluation: {
    adopted: 'E0 OBSERVED, E1 DETERMINISTICALLY_DERIVED, E2 EXTERNALLY_VERIFIED, E3 MODEL_PREDICTION, E4 COUNTERFACTUAL, E5 SYNTHETIC',
    changes: [
      'EU UNKNOWN added: SENTINEL_WORLD_STATE_V1 already has UNKNOWN and fail-closed reads need an explicit absent class',
      'access (DEPLOYABLE / PRIVILEGED / ORACLE) made a separate axis: Stage 3F provenance is about who may see a value, not how it was obtained',
      'not an ordered ladder: E4/E5 are non-factual and never verifiable, so they can never be promoted; only E3 is verifiable',
      'E1 made taint-propagating: a value derived from any E3/E4/E5 input takes the weakest input class',
      'E2 requires a registered trusted verifier; the Forge registry is empty, so no Forge value is E2',
      'MEMORY is an admissible E0 source only as history: re-asserted memory never overwrites a newer observation',
    ],
    existingContracts: {
      SENTINEL_WORLD_STATE_V1: 'OBSERVED/DERIVED/PREDICTED/UNKNOWN map to E0/E1/E3/EU; its authority precedence is preserved and the module is not modified',
      STAGE3F6P1ASYM_FEATURE_CLASSES: 'DEPLOYABLE -> access DEPLOYABLE; ORACLE_ONLY/LEAKED/UNAVAILABLE -> access ORACLE/PRIVILEGED; FUTURE_STATE_REQUIRED -> E3 if predicted by a model, PRIVILEGED if read from the simulator; ROLLOUT_REQUIRED -> PRIVILEGED; NON_EQUIVARIANT is a scoring property, not an epistemic class',
      STAGE3F_FREEZE_EPISTEMIC_PROVENANCE: 'deployable / privileged-simulator / oracle is the access axis',
    },
  },
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const EPISTEMIC_SCHEMA_HASH = sha256(EPISTEMIC_SCHEMA);
