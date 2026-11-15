import { hash } from './freeze.mjs';
export const OBSERVATION_CONTRACT = 'SENTINEL_TEMPORAL_OBSERVATION_V1';
export const AUTHORITY = Object.freeze({ authority: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
export function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; }
export function leafFields(o, prefix = '') { return Object.entries(o ?? {}).flatMap(([k, v]) => { const p = prefix ? prefix + '.' + k : k; return v && typeof v === 'object' && !Array.isArray(v) ? leafFields(v, p) : [p]; }); }
const forbidden = /^(rng|seed|fighters|player|rivals|reactionBuffer|reward|future|successors|hidden|windStrength|wetGrip|opponentScript)$/;
function checkPayload(o) { for (const [k, v] of Object.entries(o ?? {})) { if (forbidden.test(k) && !(k === 'wetGrip' && v === 'UNQUANTIFIED')) throw Error('PRIVILEGED_OBSERVATION_FIELD: ' + k); if (typeof v === 'function') throw Error('EXECUTABLE_OBSERVATION'); if (v && typeof v === 'object') checkPayload(v); } }
export function makeObservation(payload, { episodeId, receiptTick, sequenceNumber, lastExecutedActionId = null, actionExecutionTick = null, unknownFields = [], source = 'ASCII_VISIBLE_SENSOR', missing = false } = {}) {
  if (!episodeId || !Number.isInteger(receiptTick) || !Number.isInteger(sequenceNumber)) throw Error('INVALID_TEMPORAL_IDENTITY');
  if (payload) checkPayload(payload);
  if (payload && (!Number.isInteger(payload.tick) || payload.tick > receiptTick)) throw Error('FUTURE_OBSERVATION');
  const observationTick = payload?.tick ?? null;
  const fieldTicks = payload?.ball ? { ball: payload.ball.tick, ownPaddle: observationTick, opponentPaddle: observationTick } : {};
  if (Object.values(fieldTicks).some(t => !Number.isInteger(t) || t > receiptTick)) throw Error('INVALID_FIELD_TIMESTAMP');
  return deepFreeze({ schema: OBSERVATION_CONTRACT, episodeId,
    observationId: payload ? hash({ episodeId, source, observationTick, payload }) : null,
    observationTick, receiptTick, observationAge: observationTick === null ? null : receiptTick - observationTick,
    sequenceNumber, source, observedFields: leafFields(payload), unknownFields: [...unknownFields], confidenceMetadata: { kind: 'SENSOR_METADATA_NOT_ACTION_CORRECTNESS', noise: payload?.sensor?.noise ?? 'UNQUANTIFIED', fieldTicks },
    lastExecutedActionId, actionExecutionTick, missing, payload: payload ? structuredClone(payload) : null });
}
export class ObservationGate {
  constructor(episodeId) { this.episodeId = episodeId; this.last = null; this.seen = new Map(); this.lastSequence = -1; }
  accept(packet) {
    if (packet.schema !== OBSERVATION_CONTRACT || packet.episodeId !== this.episodeId) throw Error('OBSERVATION_EPISODE_MISMATCH');
    if (packet.payload) checkPayload(packet.payload);
    if (!Number.isInteger(packet.receiptTick) || packet.observationTick > packet.receiptTick) throw Error('INVALID_OBSERVATION_TIME');
    const statuses = [];
    let fresh = false, rejected = false;
    if (!packet.payload || packet.missing) statuses.push('MISSING_OBSERVATION');
    else {
      const digest = hash(packet.payload), seen = this.seen.get(packet.observationId);
      if (seen && seen !== digest) { statuses.push('CONFLICTING_OBSERVATION'); rejected = true; }
      else if (packet.sequenceNumber < this.lastSequence || this.last && packet.observationTick < this.last.observationTick) { statuses.push('OUT_OF_ORDER_OBSERVATION'); rejected = true; }
      else if (seen || this.last && packet.observationTick === this.last.observationTick) { statuses.push(seen ? 'REPEATED_STALE_OBSERVATION' : 'CONFLICTING_OBSERVATION'); rejected = !seen; }
      else { statuses.push(packet.observationAge > 0 ? 'DELAYED_OBSERVATION' : 'CURRENT_OBSERVATION'); fresh = true; }
      if (packet.unknownFields.length) statuses.push('PARTIALLY_OBSERVED');
      if (fresh) { this.last = packet; this.seen.set(packet.observationId, digest); while (this.seen.size > 128) this.seen.delete(this.seen.keys().next().value); }
      this.lastSequence = Math.max(this.lastSequence, packet.sequenceNumber);
    }
    return { packet: this.last, incoming: packet, fresh, rejected, statuses, status: statuses[0], receiptTick: packet.receiptTick,
      age: this.last ? packet.receiptTick - this.last.observationTick : null };
  }
}
// Transport operates on legitimate observations only, not full simulator states. Schedule is fixed externally.
export class ObservationTransport {
  constructor(episodeId, condition = 'NORMAL') { this.episodeId = episodeId; this.condition = condition; this.frames = []; this.last = null; this.sequence = 0; }
  sample(observation, tick, executed = null) {
    this.frames.push(structuredClone(observation)); if (this.frames.length > 16) this.frames.shift();
    const kind = this.condition, delay = kind === 'DELAY3' || kind === 'STALE_REPEAT' ? 3 : kind === 'JITTER' ? [0, 3, 1, 5, 2, 4][tick % 6] : kind.startsWith('LATENCY_') ? Number(kind.slice(8)) : 0;
    let seen = this.frames[Math.max(0, this.frames.length - 1 - delay)];
    const repeat = kind === 'STALE_REPEAT' && tick % 10 < 2 && this.last;
    if (repeat) seen = this.last;
    const missing = kind === 'MISSING' && tick % 11 >= 7;
    const partial = kind === 'PARTIAL' && tick % 7 === 3;
    const unknownFields = [];
    seen = structuredClone(seen);
    if (partial) { const node = seen.body ?? seen.me ?? seen.ball; const field = seen.ball ? 'y' : 'vx' in node ? 'vx' : 'v'; delete node[field]; unknownFields.push((seen.body ? 'body.' : seen.me ? 'me.' : 'ball.') + field); }
    if (!missing) this.last = structuredClone(seen);
    return makeObservation(missing ? null : seen, { episodeId: this.episodeId, receiptTick: tick, sequenceNumber: this.sequence++, missing, unknownFields,
      lastExecutedActionId: executed?.action ?? null, actionExecutionTick: executed?.tick ?? null });
  }
}
