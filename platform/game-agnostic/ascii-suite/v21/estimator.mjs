// Deterministic, bounded published-semantics prediction, never authoritative world state or a learned model.
import { bodyStep, terrainSolid, bodyFallback, bodyLegalActions, PHYS } from '../worlds/platformer.mjs';
import { carStep, CAR, beliefTrack } from '../worlds/racing.mjs';
import { fightTick, fighterLegalActions, phaseOf } from '../worlds/fighter.mjs';
import { ObservationGate, deepFreeze } from './temporal.mjs';
const clone = o => structuredClone(o);
export function rebuildFighter(p) { return { ...p, knock: p.stun ? p.vx : 0, move: p.move ? { name: p.move.name, phase: p.move.phase, t: p.move.remaining, contacted: false } : null }; }
export function publicFighter(p) { const { knock, ...out } = p; return { ...out, phase: phaseOf(p), move: p.move ? { name: p.move.name, phase: p.move.phase, remaining: p.move.t } : null }; }
export class TemporalEstimator {
  constructor(game, episodeId, { estimation = true, actionHistory = true, uncertainty = true } = {}) {
    this.game = game; this.gate = new ObservationGate(episodeId); this.options = { estimation, actionHistory, uncertainty }; this.actions = new Map(); this.wind = new Map(); this.previous = null; this.enemyTracks = new Map(); this.lastBody = null;
  }
  executed(action, tick) { this.actions.set(tick, action); for (const k of this.actions.keys()) if (k < tick - 64) this.actions.delete(k); }
  actionAt(t, fallback) { return this.options.actionHistory ? this.actions.get(t) ?? fallback : fallback; }
  windAt(o, x) { const z = o.windZones.find(z => x >= z.x0 && x < z.x1 + 1); return z ? this.wind.get(z.x0)?.estimate ?? 0 : 0; }
  bodyPredict(o, end, windShift = 0) {
    const b = { ...o.body }, solid = (x, y) => terrainSolid(o.terrain, x, y);
    for (let t = o.tick; t < end; t++) bodyStep(b, bodyFallback(b, this.actionAt(t, 'MOVE_RIGHT')), solid, x => this.windAt(o, x) + (o.windZones.some(z => x >= z.x0 && x < z.x1 + 1) ? windShift : 0));
    return b;
  }
  update(packet) {
    const start = performance.now(), gated = this.gate.accept(packet), accepted = gated.packet;
    if (!accepted) return { gate: gated, observation: null, observed: null, provenance: 'UNKNOWN', uncertainty: {}, latencyMs: performance.now() - start, predictionSteps: 0 };
    const raw = accepted.payload, previous = this.previous;
    if (this.options.estimation && gated.fresh && !accepted.unknownFields.length && !this.previousUnknown && previous && raw.body && raw.tick > previous.tick && raw.lastDeath?.tick === previous.lastDeath?.tick) {
      const zones = raw.windZones.filter(z => previous.body.x >= z.x0 && previous.body.x < z.x1 + 1);
      if (zones.length && Math.abs(raw.body.x - previous.body.x) < 20 && !raw.events.some(e => /CONTACT|RESET/.test(e))) {
        const predicted = this.bodyPredict(previous, raw.tick), residual = (predicted.x - raw.body.x) / (raw.tick - previous.tick), z = zones[0];
        const old = { ...(this.wind.get(z.x0) ?? { estimate: 0, samples: 0 }) }; old.estimate = Math.max(-.6, Math.min(.6, old.estimate + residual)); old.samples++; this.wind.set(z.x0, old);
      }
    }
    if (gated.fresh && raw.enemies) for (const e of raw.enemies) { const old = this.enemyTracks.get(e.id); this.enemyTracks.set(e.id, { x: e.x, tick: raw.tick, dir: e.dir, speed: old && old.dir === e.dir ? Math.min(.7, Math.abs(e.x - old.x) / Math.max(1, raw.tick - old.tick)) : old?.speed ?? .35 }); }
    // Partial observations retain unknown labels. Recovery from prior values is provisional, not an authoritative merge.
    const o = clone(raw);
    for (const field of accepted.unknownFields) { const [a, b] = field.split('.'); o[a][b] = previous?.[a]?.[b] ?? (b === 'y' ? 16 : 0); }
    if (gated.fresh) { this.previous = clone(o); this.previousUnknown = accepted.unknownFields.length > 0; }
    const age = Math.min(12, Math.max(0, packet.receiptTick - raw.tick)), uncertainty = {}, predicted = this.options.estimation && age > 0;
    if (this.game === 'platformer' && predicted) {
      o.body = this.bodyPredict(o, raw.tick + age);
      if (this.options.uncertainty) { const unlearned = o.windZones.some(z => !this.wind.get(z.x0)?.samples); const spread = unlearned ? .45 : .025;
        const lo = this.bodyPredict({ ...o, body: this.previous.body }, raw.tick + age, -spread), hi = this.bodyPredict({ ...o, body: this.previous.body }, raw.tick + age, spread);
        uncertainty.x = [Math.min(lo.x, hi.x, o.body.x) - .03 * age, Math.max(lo.x, hi.x, o.body.x) + .03 * age]; uncertainty.y = [Math.min(lo.y, hi.y, o.body.y), Math.max(lo.y, hi.y, o.body.y)]; }
      o.enemies = o.enemies.map(e => { const m = this.enemyTracks.get(e.id); return { ...e, x: e.x + e.dir * (m?.speed ?? .35) * age }; });
      o.legalActions = bodyLegalActions(o.body);
    } else if (this.game === 'racing' && predicted) {
      const track = beliefTrack(o), car = { ...o.me, offTicks: 0, barrierHits: 0, contacts: 0 };
      const predict = grip => { const c = { ...car }; for (let t = raw.tick; t < raw.tick + age; t++) carStep(c, this.actionAt(t, 'HOLD'), { segments: track.segments, lapLength: 1e9 }, track.at(c.s)?.wet ? CAR.grip * grip : CAR.grip); return c; };
      const c = predict(.7), ds = c.s - raw.me.s; o.me = c;
      o.preview = o.preview.map(p => ({ ...p, ahead: p.ahead - ds, remaining: p.remaining - ds })).filter(p => p.remaining > 0);
      if (!o.preview.length) o.preview = [{ ...raw.preview.at(-1), ahead: 0 }];
      o.cars = o.cars.map(c => ({ ...c, ds: c.ds + c.v * age - ds }));
      if (this.options.uncertainty) { const lo = predict(.55), hi = predict(.9); uncertainty.n = [Math.min(lo.n, hi.n, c.n) - .06 * age, Math.max(lo.n, hi.n, c.n) + .06 * age]; uncertainty.gripFraction = [.55, .9]; uncertainty.v = [Math.max(0, c.v - .05 * age), c.v + .05 * age]; }
    } else if (this.game === 'fighter' && predicted) {
      const world = { fighters: [rebuildFighter(o.me), rebuildFighter(o.opponent)] };
      // No unrevealed opponent actions: WAIT continuation for known commitments, explicit unknown follow-up interval.
      for (let t = raw.tick; t < raw.tick + age; t++) fightTick(world, [this.actionAt(t, 'WAIT'), 'WAIT']);
      o.me = publicFighter(world.fighters[0]); o.opponent = publicFighter(world.fighters[1]); o.distance = Math.abs(o.me.x - o.opponent.x); o.legalActions = fighterLegalActions(world.fighters[0]);
      if (this.options.uncertainty) uncertainty.opponentX = [o.opponent.x - 1.2 * age, o.opponent.x + 1.2 * age];
    } else if (this.game === 'pong') {
      const paddleAge = age; let y = o.playerY;
      if (this.options.estimation) for (let t = raw.tick; t < raw.tick + paddleAge; t++) { const a = this.actionAt(t, 'HOLD'); y = Math.max(4, Math.min(27, y + (a === 'UP' ? -1.5 : a === 'DOWN' ? 1.5 : 0))); }
      o.playerY = y; if (this.options.estimation) o.tick = packet.receiptTick;
      uncertainty.ballAge = packet.receiptTick - raw.ball.tick; uncertainty.bounceEvent = 'POSSIBLE_UNOBSERVED'; uncertainty.opponentReach = [Math.max(4, raw.enemyY - 1.5 * age), Math.min(27, raw.enemyY + 1.5 * age)];
    }
    if (predicted && this.game !== 'pong') o.tick = packet.receiptTick;
    // Sensor events are consumed once; receipt repeats are not extra adaptation evidence.
    if (!gated.fresh) o.events = [];
    const provenance = predicted || accepted.unknownFields.length > 0 ? 'ESTIMATED_PROVISIONAL' : 'OBSERVED';
    o.temporal = { age, status: gated.status, fresh: gated.fresh, provenance, authoritativeStateUnchanged: true, provisionalLayer: 'OUTSIDE_AUTHORITATIVE_E0_E1_E2', receiptTick: packet.receiptTick, uncertainty,
      windEstimates: clone(Object.fromEntries(this.wind)), authoritativeObservationId: accepted.observationId };
    return { gate: gated, observation: deepFreeze(o), observed: accepted, provenance, uncertainty,
      latencyMs: performance.now() - start, predictionSteps: predicted ? age : 0 };
  }
}
