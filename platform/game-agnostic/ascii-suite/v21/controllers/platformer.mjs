// Sentinel side-scroller TEST controller (diagnostic). Receding-horizon comparison of complete jump trajectories over the
// controller's own belief: observed static geometry, published body physics, estimated enemy motion and estimated crosswind.
// It never receives simulator state, RNG, wind strength or enemy speed. Memory is local and ephemeral (one episode); no weights change.
import { PHYS, bodyStep, bodyLegalActions, bodyFallback } from '../../worlds/platformer.mjs';

const HORIZON = 45, ROWS = 40;
export const PLATFORMER_STRATEGIES = ['NOMINAL_MAX_MARGIN', 'EDGE_TAKEOFF', 'RUN_UP', 'SHORT_HOP', 'FULL_ARC', 'WAIT_FOR_CLEARANCE'];
const RETRY_ORDER = {
  FALL: ['EDGE_TAKEOFF', 'RUN_UP', 'SHORT_HOP', 'FULL_ARC', 'WAIT_FOR_CLEARANCE', 'NOMINAL_MAX_MARGIN'],
  FALL_AFTER_HEAD_BUMP: ['SHORT_HOP', 'EDGE_TAKEOFF', 'RUN_UP', 'FULL_ARC', 'NOMINAL_MAX_MARGIN'],
  ENEMY_CONTACT: ['WAIT_FOR_CLEARANCE', 'FULL_ARC', 'EDGE_TAKEOFF', 'RUN_UP', 'NOMINAL_MAX_MARGIN'],
  HAZARD_CONTACT: ['FULL_ARC', 'EDGE_TAKEOFF', 'RUN_UP', 'NOMINAL_MAX_MARGIN'],
  STAGNATION: ['RUN_UP', 'FULL_ARC', 'EDGE_TAKEOFF', 'WAIT_FOR_CLEARANCE', 'NOMINAL_MAX_MARGIN'],
};
const causeOf = e => e === 'FALL_CHECKPOINT_RESET' ? 'FALL' : e;

class Belief {
  constructor() { this.keys = new Set(); this.geometry = { gaps: [], platforms: [], walls: [], ceilings: [] }; this.spikes = new Set(); this.wind = new Map(); this.width = 0; this.grid = null; }
  update(obs) {
    let changed = obs.terrain.width !== this.width; this.width = obs.terrain.width;
    for (const kind of ['gaps', 'platforms', 'walls', 'ceilings']) for (const g of obs.terrain[kind]) {
      const key = kind + g.join(','); if (!this.keys.has(key)) { this.keys.add(key); this.geometry[kind].push(g); changed = true; }
    }
    for (const x of obs.spikes) this.spikes.add(x);
    for (const z of obs.windZones) if (!this.wind.has(z.x0)) this.wind.set(z.x0, { x0: z.x0, x1: z.x1, estimate: 0, samples: 0 });
    if (changed || !this.grid) this.rebuild();
  }
  rebuild() {
    const w = this.width, g = new Uint8Array(w * ROWS), { gaps, platforms, walls, ceilings } = this.geometry;
    for (let col = 0; col < w; col++) for (let row = 0; row < ROWS; row++) {
      let solid = row >= PHYS.floor && !gaps.some(p => col >= p[0] && col <= p[1]);
      solid ||= platforms.some(p => col >= p[0] && col <= p[1] && row === p[2]) || walls.some(p => col >= p[0] && col <= p[1] && row >= p[2]) || ceilings.some(p => col >= p[0] && col <= p[1] && row === p[2]);
      g[col * ROWS + row] = solid ? 1 : 0;
    }
    this.grid = g;
  }
  solid = (x, y) => {
    const col = Math.floor(x), row = Math.floor(y);
    if (col < 0 || col >= this.width) return true;
    if (row < 0) return false; if (row >= ROWS) return this.grid[col * ROWS + ROWS - 1] === 1;
    return this.grid[col * ROWS + row] === 1;
  };
  windAt = x => { for (const z of this.wind.values()) if (x >= z.x0 && x < z.x1 + 1) return z.estimate; return 0; };
}

export function createPlatformerPlanner({ memory = true, label = 'TEMPORAL_PLATFORMER_V3', inherited = null, robust = true, horizon = 45 } = {}) {
  let belief = new Belief();
  const enemies = new Map(), failures = [], strategyByKey = new Map(), triedByKey = new Map(), actionTail = [];
  // Explicit local diagnostic history carried from a previous attempt (cross-episode); never weights.
  if (memory && inherited) {
    for (const [k, v] of Object.entries(inherited.strategies ?? {})) strategyByKey.set(Number(k), v);
    for (const [k, v] of Object.entries(inherited.tried ?? {})) triedByKey.set(Number(k), new Set(v));
    for (const z of inherited.wind ?? []) belief.wind.set(z.x0, { ...z });
  }
  const comparedSections = new Set();
  let last = null, lastPlan = null, bestX = -Infinity, sinceBest = 0, stagnationCount = 0, lastFailure = null, seenDeathTick = null, pendingTrigger = null, retries = 0;
  let simulationRollouts = 0, simulationSteps = 0;

  function trackEnemies(obs) {
    for (const e of obs.enemies) {
      const m = enemies.get(e.id) ?? { x: e.x, tick: obs.tick, dir: e.dir, speed: null, lo: null, hi: null };
      if (obs.tick > m.tick) { const v = Math.abs(e.x - m.x) / (obs.tick - m.tick); if (e.dir === m.dir && v > 0) m.speed = m.speed === null ? v : .7 * m.speed + .3 * v; }
      if (e.dir !== m.dir) { if (m.dir > 0) m.hi = Math.max(m.hi ?? -Infinity, e.x); else m.lo = Math.min(m.lo ?? Infinity, e.x); }
      Object.assign(m, { x: e.x, tick: obs.tick, dir: e.dir }); enemies.set(e.id, m);
    }
  }
  const predictEnemy = (m, t) => {
    let x = m.x, dir = m.dir; const v = m.speed ?? .3;
    for (let k = 0; k < t; k++) { x += dir * v; if (m.hi !== null && dir > 0 && x >= m.hi) { x = m.hi; dir = -1; } else if (m.lo !== null && dir < 0 && x <= m.lo) { x = m.lo; dir = 1; } }
    return x;
  };
  // Own-motion residual: commanded vx versus observed displacement estimates crosswind; only inside visible wind zones.
  function learnWind(obs) {
    // Temporal estimator's residual is based on two actual sightings and executed actions, not consecutive predictions.
    if (obs.temporal) {
      for (const [key, value] of Object.entries(obs.temporal.windEstimates ?? {})) {
        const z = belief.wind.get(Number(key)); if (z) Object.assign(z, value);
      }
      return null;
    }
    if (!last || obs.events.includes('FALL_CHECKPOINT_RESET') || obs.events.includes('WALL_CONTACT') || obs.events.some(e => e.endsWith('CONTACT'))) return null;
    const zone = [...belief.wind.values()].find(z => last.body.x >= z.x0 && last.body.x < z.x1 + 1);
    if (!zone) return null;
    const residual = obs.body.vx - (obs.body.x - last.body.x);
    zone.samples++; zone.estimate += (residual - zone.estimate) / zone.samples;
    return zone;
  }

  function recordFailure(obs) {
    const d = obs.lastDeath; if (!d || d.tick === seenDeathTick) return null; seenDeathTick = d.tick;
    const headBump = actionTail.some(r => r.events?.includes('HEAD_BUMP'));
    const cause = causeOf(d.cause) === 'FALL' && headBump ? 'FALL_AFTER_HEAD_BUMP' : causeOf(d.cause);
    const key = `${d.checkpoint}:${d.section}:${causeOf(d.cause)}`;
    const used = strategyByKey.get(d.section) ?? 'NOMINAL_MAX_MARGIN';
    const zone = [...belief.wind.values()].find(z => d.x >= z.x0 - 2 && d.x < z.x1 + 3);
    const signature = { key, checkpoint: d.checkpoint, section: d.section, sectionType: d.sectionType, cause, position: [round(d.x), round(d.y)], velocity: [round(d.vx), round(d.vy)],
      takeoffX: d.takeoff ? round(d.takeoff.x) : null, actionSequence: actionTail.slice(-12).map(r => r.action), strategy: used, predictedLanding: lastPlan?.landingX ?? null,
      observedDrift: zone && zone.samples ? round(zone.estimate) : null, tick: d.tick };
    failures.push(signature); lastFailure = signature;
    const repeats = failures.filter(f => f.key === key).length;
    const interval = obs.temporal?.uncertainty.x;
    signature.failureClass = obs.temporal?.age > 0 && interval && interval[1] - interval[0] > 1.5 ? 'FAILED_DUE_TO_STALE_OBSERVATION' : zone && !zone.samples ? 'FAILED_DUE_TO_UNKNOWN_DYNAMICS' : 'FAILED_DUE_TO_STRATEGY';
    // A timing fault is not evidence that a jump strategy needs another retry permutation.
    if (memory && signature.failureClass === 'FAILED_DUE_TO_STALE_OBSERVATION') {
      pendingTrigger = { type: 'STALE_FAILURE_REESTIMATE', key, repeats, section: d.section }; return signature;
    }
    if (repeats > 1) comparedSections.delete(d.section);
    if (!memory) { pendingTrigger = { type: repeats > 1 ? 'REPEATED_FAILURE_DETECTED_NO_MEMORY' : 'FAILURE_OBSERVED_NO_MEMORY', key, repeats }; for (const z of belief.wind.values()) Object.assign(z, { estimate: 0, samples: 0 }); return signature; }
    const tried = triedByKey.get(d.section) ?? new Set(['NOMINAL_MAX_MARGIN']); tried.add(used); triedByKey.set(d.section, tried);
    const order = RETRY_ORDER[cause] ?? RETRY_ORDER.FALL;
    const next = order.find(s => !tried.has(s)) ?? order[repeats % order.length];
    strategyByKey.set(d.section, next); retries++;
    pendingTrigger = { type: repeats > 1 ? 'REPEATED_FAILURE_DETECTED' : 'FAILURE_RETRY', key, repeats, from: used, to: next, compareOnApproach: repeats > 1, section: d.section };
    return signature;
  }

  function nextObstacle(obs, x) {
    const g = belief.geometry, list = [];
    for (const p of g.gaps) if (p[1] + 1 > x) list.push({ kind: 'GAP', x0: p[0], x1: p[1] + 1 });
    for (const p of g.walls) if (p[1] + 1 > x) list.push({ kind: 'WALL', x0: p[0], x1: p[1] + 1 });
    for (const c of belief.spikes) if (c + 1 > x) list.push({ kind: 'SPIKES', x0: c, x1: c + 1 });
    for (const e of obs.enemies) if (e.x + 1 > x - .5) list.push({ kind: 'ENEMY', x0: e.x - 1, x1: e.x + 1, id: e.id });
    list.sort((a, b) => a.x0 - b.x0);
    const first = list[0]; if (!first) return null;
    // Merge adjacent hazards (spike clusters, pit followed by patrol) into one clearance target.
    let end = first.x1; for (const o of list.slice(1)) if (o.x0 <= end + 1.5 && o.kind === first.kind) end = Math.max(end, o.x1);
    const section = obs.sections.find(s => first.x0 >= s.x0 && first.x0 < s.x1);
    return { ...first, x1: end, section: section?.id ?? null, sectionType: section?.type ?? null };
  }

  function rollout(body0, script, target, horizon = HORIZON) {
    simulationRollouts++;
    const b = { ...body0, drift: 0 }, r = { died: false, damage: 0, takeoff: null, landing: null, bumps: 0, clearance: Infinity, cleared: false, ticks: horizon, actions: [] };
    let sinceJump = -1;
    for (let t = 0; t < horizon; t++) {
      simulationSteps++;
      let a = script(t, b, sinceJump); a = bodyFallback(b, a); r.actions.push(a);
      const x0 = b.x, ev = bodyStep(b, a, belief.solid, belief.windAt);
      if (ev.includes('JUMP_START')) { r.takeoff ??= { x: x0, vx: b.vx, t }; sinceJump = 0; } else if (sinceJump >= 0) sinceJump++;
      if (ev.includes('HEAD_BUMP')) r.bumps++;
      if (ev.includes('LANDING') && r.takeoff && !r.landing) r.landing = { x: b.x, y: b.y, t };
      if (b.y > PHYS.deathY) { r.died = true; r.ticks = t + 1; break; }
      for (const m of enemies.values()) {
        const ex = predictEnemy(m, t + 1 + (obsTick - m.tick)); const dx = Math.abs(b.x - ex);
        if (b.y > 25) r.clearance = Math.min(r.clearance, dx);
        if (dx < 1.15 && b.y > 27.0) r.damage++;
      }
      for (const c of belief.spikes) if (Math.abs(b.x - (c + .5)) < .85 && b.y > 27.2) r.damage++;
      if (target && b.grounded && b.x > target.x1 + .5 && (target.kind !== 'ENEMY' || r.clearance > 1.15)) { r.cleared = true; r.ticks = t + 1; break; }
    }
    r.x = b.x; r.end = b; return r;
  }
  let obsTick = 0;

  // Landing margin: distance from the landing point back to the edge of the supporting ground, and forward to the next drop.
  function landingMargins(r) {
    if (!r.landing) return { short: 0, long: 0 };
    const y = r.landing.y + .001; let lo = r.landing.x, hi = r.landing.x;
    while (lo > r.landing.x - 12 && belief.solid(lo - .1, y)) lo -= .1;
    while (hi < r.landing.x + 12 && belief.solid(hi + .1, y)) hi += .1;
    return { short: r.landing.x - lo, long: hi - r.landing.x };
  }
  function takeoffMargin(r) {
    if (!r.takeoff) return 0; let x = r.takeoff.x; while (x < r.takeoff.x + 12 && belief.solid(x + .1, PHYS.floor + .001)) x += .1; return x - r.takeoff.x;
  }

  function candidates(body, strategy) {
    const plans = [];
    const jumpScript = (pre, hold) => (t, b, sinceJump) => {
      if (t < pre.length) return pre[t];
      if (sinceJump < 0) return b.grounded ? 'JUMP_RIGHT' : 'MOVE_RIGHT';
      return b.grounded ? 'MOVE_RIGHT' : sinceJump < hold - 1 ? 'JUMP_RIGHT' : 'MOVE_RIGHT';
    };
    if (!body.grounded) {
      const holds = body.jumpHeld && body.vy < 0 ? [0, 1, 2, 4, 99] : [0];
      for (const hold of holds) for (const air of ['MOVE_RIGHT', 'WAIT', 'MOVE_LEFT'])
        plans.push({ name: `AIR hold=${hold} ${air}`, hold, air, script: (t, b) => b.grounded ? 'MOVE_RIGHT' : (t < hold && b.jumpHeld ? (air === 'MOVE_LEFT' ? 'JUMP_LEFT' : air === 'WAIT' ? 'JUMP' : 'JUMP_RIGHT') : air) });
      return plans;
    }
    const holds = strategy === 'SHORT_HOP' ? [1, 2] : strategy === 'FULL_ARC' ? [99] : [1, 2, 4, 99];
    plans.push({ name: 'RUN', hold: null, script: () => 'MOVE_RIGHT' });
    for (let k = 0; k <= 16; k++) for (const hold of holds) plans.push({ name: `RUN${k}+JUMP h${hold}`, k, hold, script: jumpScript(Array(k).fill('MOVE_RIGHT'), hold) });
    for (const w of [2, 4, 8, 12]) for (const k of [0, 2, 4, 6, 8]) plans.push({ name: `WAIT${w}+RUN${k}+JUMP`, k, wait: w, hold: 99, script: jumpScript([...Array(w).fill('WAIT'), ...Array(k).fill('MOVE_RIGHT')], 99) });
    for (const m of [3, 6, 9]) for (const k of [6, 8, 10, 12]) plans.push({ name: `BACK${m}+RUN${k}+JUMP`, k, back: m, hold: 99, script: jumpScript([...Array(m).fill('MOVE_LEFT'), ...Array(k).fill('MOVE_RIGHT')], 99) });
    return plans;
  }

  function score(r, strategy, plan) {
    const lm = landingMargins(r), tm = takeoffMargin(r), land = Math.min(lm.short, lm.long), clear = Math.min(r.clearance, 6);
    let v;
    if (strategy === 'EDGE_TAKEOFF') v = Math.min(lm.short, 6) - .6 * tm;
    else if (strategy === 'RUN_UP') v = (r.takeoff?.vx ?? 0) >= .95 ? Math.min(lm.short, 6) - .3 * tm : -5;
    else if (strategy === 'SHORT_HOP') v = Math.min(land, 4) - 3 * r.bumps;
    else if (strategy === 'WAIT_FOR_CLEARANCE') v = clear + .5 * Math.min(land, 4);
    else if (strategy === 'FULL_ARC') v = Math.min(land, 4) + .3 * clear;
    else v = Math.min(tm, land, 3) + .2 * Math.min(clear, 4);
    return v - .02 * r.ticks - 1.5 * r.bumps * (plan.hold === 99 ? 1 : 0);
  }

  function plan(obs, strategy, target) {
    const body = obs.body, list = candidates(body, strategy), results = [];
    for (const p of list) {
      const r = rollout(body, p.script, target, horizon);
      const variants = [r];
      if (robust && obs.temporal?.age > 0 && obs.temporal.uncertainty.x) {
        // Same action script must be safe at both bounded current-position endpoints.
        for (const x of obs.temporal.uncertainty.x) variants.push(rollout({ ...body, x }, p.script, target, horizon));
      }
      const safe = variants.every(q => !q.died && q.damage === 0 && (q.cleared || !target || q.ticks >= horizon && q.x < target.x0 - 1));
      const value = Math.min(...variants.map(q => score(q, strategy, p)));
      results.push({ plan: p, r, safe, value: safe ? value : -1000 + Math.min(...variants.map(q => q.x - 50 * q.damage - (q.died ? 200 : 0))) });
    }
    results.sort((a, b) => b.value - a.value);
    return { best: results[0], branches: results.length * (robust && obs.temporal?.age > 0 && obs.temporal.uncertainty.x ? 3 : 1) };
  }

  return {
    id: label, label: memory ? 'SENTINEL TEST PLANNER (TRAJECTORY + FAILURE MEMORY)' : 'SENTINEL TEST PLANNER (NO FAILURE MEMORY, ABLATION)',
    access: 'OBSERVATION_ONLY', horizon: HORIZON, capability: memory ? 'CROSS_ATTEMPT_ADAPTATION' : 'DETERMINISTIC_PLANNING',
    decide(obs) {
      const start = performance.now(); obsTick = obs.tick; simulationRollouts = 0; simulationSteps = 0;
      if (obs.terminal) return { action: 'NO_ACTION_TERMINAL', terminal: true };
      belief.update(obs); trackEnemies(obs);
      const windZone = learnWind(obs);
      const failure = recordFailure(obs);
      let trigger = pendingTrigger; pendingTrigger = null;
      if (windZone && windZone.samples === 1) trigger ??= { type: 'RESIDUAL_MODEL_UPDATE', zone: windZone.x0 };
      if (obs.body.x > bestX + .5) { bestX = obs.body.x; sinceBest = 0; } else sinceBest++;
      const target = nextObstacle(obs, obs.body.x);
      if (sinceBest > 90 && memory && target) {
        const tried = triedByKey.get(target.section) ?? new Set(['NOMINAL_MAX_MARGIN']); tried.add(strategyByKey.get(target.section) ?? 'NOMINAL_MAX_MARGIN'); triedByKey.set(target.section, tried);
        const next = RETRY_ORDER.STAGNATION.find(s => !tried.has(s)) ?? RETRY_ORDER.STAGNATION[stagnationCount % 5];
        strategyByKey.set(target.section, next); stagnationCount++; sinceBest = 0; trigger = { type: 'STAGNATION_REPLAN', section: target.section, to: next };
      }
      const strategy = memory && target ? strategyByKey.get(target.section) ?? 'NOMINAL_MAX_MARGIN' : 'NOMINAL_MAX_MARGIN';
      let comparison = null;
      const near = target && target.x0 - obs.body.x < 22;
      const pendingCompare = memory && target && failures.some(f => f.section === target.section && failures.filter(g => g.key === f.key).length > 1) && !comparedSections.has(target.section);
      if (near && pendingCompare && obs.body.grounded) {
        // Repeated failure: compare the best complete trajectory under every strategy before committing.
        comparedSections.add(target.section);
        comparison = PLATFORMER_STRATEGIES.map(s => { const p = plan(obs, s, target); return { strategy: s, safe: p.best.safe, plan: p.best.plan.name, predictedLandingX: round(p.best.r.landing?.x ?? p.best.r.x), margin: round(landingMargins(p.best.r).short) }; });
        const tried = triedByKey.get(target.section) ?? new Set();
        const pick = comparison.filter(c => c.safe && !tried.has(c.strategy)).sort((a, b) => b.margin - a.margin)[0] ?? comparison.filter(c => c.safe).sort((a, b) => b.margin - a.margin)[0];
        if (pick) strategyByKey.set(target.section, pick.strategy);
      }
      const active = memory && target ? strategyByKey.get(target.section) ?? strategy : strategy;
      let decision;
      if (!target || target.x0 - obs.body.x > 26 && obs.body.grounded) {
        const r = rollout(obs.body, () => 'MOVE_RIGHT', null, 20);
        decision = { action: r.died || r.damage ? 'WAIT' : 'MOVE_RIGHT', reason: target ? `clear path; next ${target.kind}@${round(target.x0)} beyond trajectory window` : 'clear path to exit', branches: 1, plan: null };
      } else {
        const p = plan(obs, active, target), best = p.best;
        const action = bodyFallback(obs.body, best.r.actions[0] ?? 'WAIT');
        lastPlan = { name: best.plan.name, takeoffX: best.r.takeoff ? round(best.r.takeoff.x) : null, landingX: best.r.landing ? round(best.r.landing.x) : null, safe: best.safe };
        decision = { action, branches: p.branches, plan: lastPlan,
          reason: `${best.safe ? 'safe' : 'NO_SAFE_TRAJECTORY'} ${best.plan.name} clears ${target.kind}@${round(target.x0)}..${round(target.x1)}${best.r.landing ? ' landing x=' + round(best.r.landing.x) : ''} strategy=${active}` };
      }
      const record = { action: decision.action, tick: obs.tick, events: obs.events };
      actionTail.push(record); if (actionTail.length > 24) actionTail.shift();
      last = obs;
      return { ...decision, simulationRollouts, simulationSteps, source: 'SENTINEL_TEST_PLANNER', controller: label, horizon, planningHorizon: `${horizon} ticks (bounded trajectory rollouts)`,
        objective: target ? `clear ${target.kind} in section ${target.section} (${target.sectionType}) then reach EXIT` : 'reach EXIT', strategy: active,
        adaptationTrigger: trigger, lastFailure, repeatedFailureDetected: failures.some(f => failures.filter(g => g.key === f.key).length > 1), comparison,
        failureHistory: failures.length, retries, capability: memory ? 'CROSS_ATTEMPT_ADAPTATION' : 'DETERMINISTIC_PLANNING', access: 'OBSERVATION_ONLY',
        windEstimates: [...belief.wind.values()].filter(z => z.samples).map(z => ({ zone: z.x0, estimate: round(z.estimate) })), latencyMs: performance.now() - start, failure: failure ?? null };
    },
    memorySnapshot: () => ({ failures: structuredClone(failures), strategies: Object.fromEntries(strategyByKey), tried: Object.fromEntries([...triedByKey].map(([k, v]) => [k, [...v]])),
      wind: [...belief.wind.values()].filter(z => z.samples).map(z => ({ ...z })), retries }),
  };
}
const round = v => v === null || v === undefined ? v : Math.round(v * 100) / 100;
