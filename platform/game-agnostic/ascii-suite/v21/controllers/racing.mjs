// Racing controllers. All read observeRacing(): own car, a 200-unit curvature preview, nearby cars and the timing screen.
import { CAR, carStep, ruleDriver, kMax } from '../../worlds/racing.mjs';

const round = v => v === null || v === undefined || !Number.isFinite(v) ? v ?? null : Math.round(v * 100) / 100;
const centreSteer = (me, kappa, nTarget, gain = .9) => {
  const psiT = Math.max(-.25, Math.min(.25, .07 * (nTarget - me.n))), want = Math.max(-1, Math.min(1, (kappa + gain * (psiT - me.psi) / Math.max(.6, me.v)) / kMax(me.v)));
  return want > me.delta + .15 ? 'TURN_LEFT' : want < me.delta - .15 ? 'TURN_RIGHT' : null;
};
import { driverInfo, beliefTrack } from '../../worlds/racing.mjs';
export const racingInfo = driverInfo;

export function createConstantSpeedRacer(target = 1.3) {
  return { id: 'CONSTANT_SPEED', label: `CONSTANT SPEED ${target} (BASELINE)`, capability: 'REACTIVE_CONTROL', access: 'OBSERVATION_ONLY', horizon: 0,
    decide(obs) { if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      const me = obs.me, steer = centreSteer(me, obs.preview[0].kappa, 0);
      const action = steer ?? (me.v > target + .05 ? 'BRAKE' : me.v < target - .02 ? 'ACCELERATE' : 'HOLD');
      return { action, reason: `hold ${target} on centre line`, horizon: 0, planningHorizon: 'NONE', branches: 1, objective: 'finish' }; } };
}
export function createReactiveRacer() {
  return { id: 'REACTIVE_STEERING', label: 'REACTIVE STEERING (BASELINE)', capability: 'REACTIVE_CONTROL', access: 'OBSERVATION_ONLY', horizon: 0,
    decide(obs) { if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      const me = obs.me, steer = centreSteer(me, obs.preview[0].kappa, 0);
      const action = steer ?? (me.offTrack || me.sliding ? 'BRAKE' : 'ACCELERATE');
      return { action, reason: 'full throttle, steer to centre, brake only when sliding/off track', horizon: 0, planningHorizon: 'NONE', branches: 1, objective: 'finish' }; } };
}
export function createRuleRacer(params = { skill: .93, brakeMargin: 1.1, line: .5, lane: 0, gain: .9, defend: true, wetCaution: .7 }) {
  return { id: 'RULE_BASED_RACER', label: 'RULE-BASED RACER (SAME DRIVER LOGIC AS RIVALS)', capability: 'REACTIVE_CONTROL', access: 'OBSERVATION_ONLY', horizon: 'PREVIEW_200', // rule with curvature-preview feed-forward
    decide(obs) { if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      const action = ruleDriver(obs.me, { preview: obs.preview, traffic: obs.cars, grip: CAR.grip }, params);
      return { action, reason: `braking-distance profile at skill ${params.skill}`, horizon: 0, planningHorizon: 'curvature preview 160-200 units', branches: 1, objective: 'finish ahead' }; } };
}

// Sentinel racing TEST planner: MPC over (aggression x lateral plan), each rolled out with the published vehicle model on the visible
// preview against constant-velocity rival predictions. Learns wet grip as an interval from its own slide/no-slide observations
// (within-episode) and keeps a per-corner speed factor across laps (cross-attempt, local and ephemeral).
export function createSentinelRacer({ memory = true, horizon = 40, inherited = null, robust = true, racecraft = true } = {}) {
  const corner = new Map(memory && inherited ? Object.entries(inherited.corner ?? {}).map(([k, v]) => [Number(k), v]) : []), wet = memory && inherited?.wet ? { ...inherited.wet } : { lo: 0, hi: CAR.grip };
  let lastSeg = null, segIssues = new Set(), segPeakGrip = 0, lastTrigger = null, wetSamples = memory && inherited ? inherited.wetSamples ?? 0 : 0;
  const wetGrip = () => wetSamples ? (wet.lo + wet.hi) / 2 : CAR.grip; // nominal until evidence arrives
  const LATERAL = { RACING_LINE: null, PASS_LEFT: 4.5, PASS_RIGHT: -4.5, CENTRE: 0 };
  return { id: 'SENTINEL_RACING_MPC', label: memory ? 'SENTINEL TEST PLANNER (MPC + GRIP/CORNER MEMORY)' : 'SENTINEL TEST PLANNER (MPC, NO CORNER MEMORY)', capability: memory ? 'CROSS_ATTEMPT_ADAPTATION' : 'WITHIN_EPISODE_ADAPTATION', access: 'OBSERVATION_ONLY', horizon,
    decide(obs) {
      const start = performance.now();
      if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      const me = obs.me, seg = obs.preview[0]; let trigger = null;
      // Wet-grip interval from own dynamics: a slide bounds grip above, a held corner bounds it below.
      if ((!obs.temporal || obs.temporal.fresh && obs.temporal.age === 0) && seg.wet && me.v > .5) { const demand = me.v * me.v * Math.abs(me.delta * kMax(me.v));
        if (me.sliding && demand < wet.hi) { wet.hi = demand; wetSamples++; trigger = { type: 'GRIP_ESTIMATE_UPDATE', wetGripHigh: round(wet.hi) }; }
        else if (!me.sliding && demand > wet.lo && demand < wet.hi) { wet.lo = demand; wetSamples++; } }
      if (seg.id !== lastSeg) {
        if (lastSeg !== null && memory) {
          const f = corner.get(lastSeg) ?? 1;
          if (segIssues.size) { corner.set(lastSeg, Math.max(.75, f - .05)); trigger = { type: 'CORNER_MEMORY_SLOWER', segment: lastSeg, factor: round(corner.get(lastSeg)), cause: [...segIssues].join('+') }; }
          else if (segPeakGrip < .85 && f < 1) corner.set(lastSeg, Math.min(1, f + .02));
        }
        lastSeg = seg.id; segIssues = new Set(); segPeakGrip = 0;
      }
      if (me.offTrack) segIssues.add('OFF_TRACK'); if (obs.events.includes('BARRIER_COLLISION')) segIssues.add('BARRIER');
      if (me.v > .3) segPeakGrip = Math.max(segPeakGrip, me.v * me.v * Math.abs(me.delta * kMax(me.v)) / CAR.grip);
      if (trigger) lastTrigger = trigger;
      const track = beliefTrack(obs), gripOf = s => { const g = track.at(s); return g?.wet ? wetGrip() : CAR.grip; };
      const plans = [];
      for (const aggr of [.86, .91, .95, .99]) for (const [lat, offset] of Object.entries(racecraft ? LATERAL : { RACING_LINE: null })) {
        const sim = { ...me, offTicks: 0, barrierHits: 0, cooldown: 0, contacts: 0 }, rivals = obs.cars.map(c => ({ ...c }));
        let first = null, penalty = 0, passed = 0;
        for (let t = 0; t < horizon; t++) {
          const ahead = track.segments.filter(g => g.start + g.length > sim.s).map(g => ({ id: g.id, kappa: g.kappa, wet: g.wet, ahead: g.start - sim.s, length: g.length }));
          const view = { preview: ahead, traffic: rivals, grip: CAR.grip };
          const params = { skill: aggr * Math.min(...ahead.slice(0, 3).filter(p => p.kappa).map(p => corner.get(p.id) ?? 1), 1), brakeMargin: 1.0 + (robust ? Math.min(.25, (obs.temporal?.age ?? 0) * .025) : 0), line: offset === null ? .8 : 0, lane: offset ?? 0, gain: .9, defend: false, wetCaution: wetGrip() / CAR.grip };
          let a = ruleDriver(sim, view, params);
          if (offset !== null) a = (() => { const st = centreSteer(sim, ahead[0]?.kappa ?? 0, offset); return st && !(a === 'BRAKE') ? st : a; })();
          if (t === 0) first = a;
          const before = sim.s, r = carStep(sim, a, { segments: track.segments, lapLength: 1e9 }, gripOf(sim.s));
          if (r.events.includes('OFF_TRACK')) penalty += 4; if (r.events.includes('BARRIER_COLLISION')) penalty += 40;
          for (const o of rivals) { o.ds += o.v - (sim.s - before); if (Math.abs(o.ds) < CAR.length && Math.abs(o.n - sim.n) < CAR.width) penalty += 6; }
        }
        rivals.forEach((o, i) => { if (obs.cars[i].ds > 0 && o.ds < 0) passed++; });
        // Terminal feasibility: can we still brake for the next visible corner?
        const next = track.segments.find(g => g.kappa && g.start > sim.s);
        if (next) { const vLim = Math.sqrt(gripOf(next.start) / Math.abs(next.kappa)), d = next.start - sim.s; const excess = (sim.v * sim.v - vLim * vLim) / (2 * CAR.brake) - d; if (excess > 0) penalty += excess * .8; }
        plans.push({ aggr, lat, first, value: sim.s - me.s - penalty + passed * 2, penalty });
      }
      plans.sort((a, b) => b.value - a.value);
      const best = plans[0], info = racingInfo(obs);
      return { action: best.first, simulationRollouts: plans.length + 1, simulationSteps: plans.length * horizon + 20, reason: `MPC ${best.lat} @${best.aggr} grip: progress ${round(best.value + best.penalty)} penalty ${round(best.penalty)}${info.nextCorner ? `; ${info.nextCorner.direction} R${info.nextCorner.radius} in ${round(info.nextCorner.distance)} (vmax ${round(info.nextCorner.maxSpeed)})` : ''}`,
        ranking: plans.slice(0, 5).map(p => ({ action: `${p.lat}@${p.aggr}:${p.first}`, value: round(p.value) })), horizon, planningHorizon: `${horizon} ticks x ${plans.length} plans (vehicle model on visible preview)`, branches: plans.length,
        objective: info.overtakeOpportunity ? `overtake ${info.nearestAhead.id}` : 'minimise lap time within grip', adaptationTrigger: trigger, lastAdaptation: lastTrigger,
        wetGripEstimate: wetSamples ? [round(wet.lo), round(wet.hi)] : 'NO_EVIDENCE', cornerMemory: Object.fromEntries([...corner].map(([k, v]) => [k, round(v)])), latencyMs: performance.now() - start };
    },
    memorySnapshot: () => ({ corner: Object.fromEntries(corner), wet: { ...wet }, wetSamples }) };
}
