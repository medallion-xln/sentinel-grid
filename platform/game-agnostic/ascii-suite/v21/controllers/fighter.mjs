// Sentinel fighter TEST controller (diagnostic). Rebuilds a model world from the observation (bodies, facing, visible move phases),
// evaluates multi-tick macro options against a within-episode opponent response model using the shared published physics, and
// mixes expected and worst-case outcome. It never sees the archetype, the opponent's reaction buffer, habit counts or RNG.
import { fightTick, fighterLegalActions, MOVES, FIGHT, phaseOf } from '../../worlds/fighter.mjs';

const HORIZON = 28, DISCOUNT = .985, GROUPS = ['WAIT', 'WALK_FORWARD', 'WALK_BACK', 'BLOCK_HIGH', 'BLOCK_LOW', 'LIGHT_ATTACK', 'HEAVY_ATTACK', 'LOW_ATTACK', 'JUMP_FORWARD'];
const groupOf = a => a === 'CROUCH' ? 'WAIT' : a.startsWith('JUMP') ? 'JUMP_FORWARD' : GROUPS.includes(a) ? a : null;
const round = v => v === null || v === undefined || !Number.isFinite(v) ? v ?? null : Math.round(v * 100) / 100;
// Decision-relevant tie classes: guard vs attack vs movement vs jump vs idle (guard height alone is not a different class).
export const actionCategory = a => a.startsWith('BLOCK') ? 'GUARD' : a.includes('ATTACK') ? 'ATTACK' : a.startsWith('WALK') ? 'MOVE' : a.startsWith('JUMP') ? 'JUMP' : 'IDLE';
const actionable = f => !f.move && !f.stun && !f.turn && !f.landingLag;

function rebuild(p) {
  return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing, grounded: p.grounded, health: p.health, guard: p.guard, crouch: p.crouch, turn: p.turn, landingLag: p.landingLag,
    airAttackUsed: p.airAttackUsed, lastAction: p.lastAction, knock: p.stun ? p.vx : 0,
    move: p.move ? { name: p.move.name, phase: p.move.phase, t: p.move.remaining, contacted: false } : null, stun: p.stun ? { ...p.stun } : null };
}
const cloneF = f => ({ ...f, move: f.move ? { ...f.move } : null, stun: f.stun ? { ...f.stun } : null });

// Script interpreter: each step issues an action for n actionable ticks; non-actionable ticks issue WAIT and do not advance.
function script(steps, fallback) {
  let i = 0, n = 0;
  return (f, other) => {
    while (i < steps.length) {
      const [a, count = 1] = steps[i], legal = fighterLegalActions(f);
      if (count <= 0) { i++; continue; }
      const free = a === 'WAIT' ? legal.length > 0 && !f.move && !f.stun : legal.includes(a);
      if (!free) return 'WAIT';
      if (++n >= count) { i++; n = 0; }
      return a;
    }
    return fallback(f, other);
  };
}
// Default continuation after a script ends. Ours: guard a visible threat (we see it immediately). The opponent's: a reactive
// response with a REACTION-tick delay — it guards a startup it has seen for REACTION ticks and punishes visible recovery.
// This is a modelling assumption of the planner, not knowledge of the opponent's archetype or difficulty.
const REACTION = 3;
const threatOf = (o, d) => o.move && (o.move.phase === 'STARTUP' || o.move.phase === 'ACTIVE') && d < 13;
const defaultPolicy = (f, o) => {
  if (!actionable(f) || !f.grounded) return 'WAIT';
  const d = Math.abs(o.x - f.x), m = o.move;
  if (threatOf(o, d)) return m.name === 'LOW_ATTACK' ? 'BLOCK_LOW' : 'BLOCK_HIGH';
  // Visible recovery: take the fastest attack that still lands inside the remaining window.
  const left = m?.phase === 'RECOVERY' ? m.t : o.landingLag;
  if (left > 3) return d < 8 ? 'LIGHT_ATTACK' : d < 11.5 && left > 6 ? 'HEAVY_ATTACK' : d < 18 && left > 8 ? 'WALK_FORWARD' : 'WAIT';
  return 'WAIT';
};
const reactivePolicy = (f, o) => {
  if (!actionable(f)) return 'WAIT';
  if (!f.grounded) return !f.airAttackUsed && f.vy < 0 && Math.abs(o.x - f.x) < 5 ? 'AIR_ATTACK' : 'WAIT';
  const d = Math.abs(o.x - f.x), m = o.move;
  if (m && (m.phase === 'STARTUP' && MOVES[m.name].startup - m.t >= REACTION || m.phase === 'ACTIVE') && d < 13) return m.name === 'LOW_ATTACK' ? 'BLOCK_LOW' : 'BLOCK_HIGH';
  if ((m?.phase === 'RECOVERY' && m.t > 3) || o.landingLag > 3) return d < 8 ? 'LIGHT_ATTACK' : d < 11.5 ? 'HEAVY_ATTACK' : 'WALK_FORWARD';
  return 'WAIT';
};

function options(me) {
  const list = [], add = (name, steps) => list.push({ name, steps });
  if (!me.grounded) {
    add('AIR_WAIT -> land, LIGHT', [['WAIT', 30]]);
    if (!me.airAttackUsed) for (let t = 0; t <= 12; t++) add(`AIR_ATTACK in ${t} -> land, turn, LIGHT`, [['WAIT', t], ['AIR_ATTACK'], ['LIGHT_ATTACK']]);
    return list;
  }
  add('WAIT', [['WAIT', 6]]);
  for (const k of [3, 6, 10]) add(`WALK_FORWARD x${k}`, [['WALK_FORWARD', k]]);
  for (const k of [3, 6]) add(`WALK_BACK x${k}`, [['WALK_BACK', k]]);
  for (const g of ['BLOCK_HIGH', 'BLOCK_LOW']) for (const k of [4, 10]) add(`${g} x${k}`, [[g, k]]);
  for (const m of ['LIGHT_ATTACK', 'HEAVY_ATTACK', 'LOW_ATTACK']) add(m, [[m]]);
  for (const k of [2, 4, 7]) for (const m of ['LIGHT_ATTACK', 'HEAVY_ATTACK', 'LOW_ATTACK']) add(`WALK_FORWARD x${k} -> ${m}`, [['WALK_FORWARD', k], [m]]);
  for (const g of ['BLOCK_HIGH', 'BLOCK_LOW']) for (const m of ['LIGHT_ATTACK', 'HEAVY_ATTACK', 'LOW_ATTACK']) add(`${g} until safe -> ${m}`, [[g, 8], [m]]);
  for (const t of [5, 7, 9, 11]) add(`JUMP_FORWARD -> AIR_ATTACK@${t} -> land, turn, LIGHT`, [['JUMP_FORWARD'], ['WAIT', t], ['AIR_ATTACK'], ['LIGHT_ATTACK']]);
  add('JUMP_FORWARD -> land, turn, HEAVY', [['JUMP_FORWARD'], ['HEAVY_ATTACK']]);
  add('JUMP_BACK', [['JUMP_BACK']]); add('JUMP_UP', [['JUMP_UP']]);
  return list;
}
// Opponent hypothesis g: what it does when free and not reacting. Reactive guarding/punishing (reactivePolicy) always takes priority.
const opponentScript = g => {
  const plan = g === 'JUMP_FORWARD' ? script([['JUMP_FORWARD'], ['WAIT', 6], ['AIR_ATTACK']], () => 'WAIT')
    : ['WALK_FORWARD', 'WALK_BACK', 'BLOCK_HIGH', 'BLOCK_LOW', 'WAIT'].includes(g) ? script([[g, 4]], () => 'WAIT') : script([[g]], () => 'WAIT');
  return (f, o) => { const r = reactivePolicy(f, o); return r !== 'WAIT' || !actionable(f) ? r : plan(f, o); };
};
export function createFighterPlanner({ prior = null, label = 'TEMPORAL_FIGHTER_V3', riskWeight = .3, opponentModel = true, horizon = 28 } = {}) {
  // counts[context][group]: what the opponent chose when it was free to act, by spacing and our visible phase.
  const counts = prior ? structuredClone(prior) : {}, history = [];
  let prev = null, lastTop = new Map(), rounds = prior ? 1 : 0;
  let simulationRollouts = 0, simulationSteps = 0;
  const context = (d, me) => `${d <= 8 ? 'CLOSE' : d <= 12 ? 'MID' : d <= 20 ? 'FAR' : 'VERY_FAR'}|${!me.grounded ? 'AIR' : me.move?.phase === 'STARTUP' || me.move?.phase === 'ACTIVE' ? 'THREAT' : me.move?.phase === 'RECOVERY' || me.landingLag ? 'VULNERABLE' : 'NEUTRAL'}`;
  const distribution = ctx => {
    const c = counts[ctx] ?? {}, total = GROUPS.reduce((n, g) => n + (c[g] ?? 0) + .5, 0);
    return GROUPS.map(g => ({ g, p: ((c[g] ?? 0) + .5) / total, n: c[g] ?? 0 })).sort((a, b) => b.p - a.p);
  };
  function learn(obs) {
    if (!opponentModel || obs.temporal && !obs.temporal.fresh) return null;
    if (!prev) return null;
    const o0 = prev.opponent;
    if (o0.phase === 'NEUTRAL' && o0.grounded && !o0.move && !o0.stun) {
      const g = groupOf(obs.opponent.lastAction); if (!g) return null;
      const ctx = context(prev.distance, prev.me); counts[ctx] ??= {}; counts[ctx][g] = (counts[ctx][g] ?? 0) + 1; history.push({ tick: prev.tick, ctx, g });
      const dist = distribution(ctx), total = Object.values(counts[ctx]).reduce((a, b) => a + b, 0);
      if (total >= 8 && lastTop.get(ctx) !== dist[0].g) { const from = lastTop.get(ctx) ?? null; lastTop.set(ctx, dist[0].g); if (from) return { type: 'OPPONENT_MODEL_SHIFT', context: ctx, from, to: dist[0].g, samples: total }; }
    }
    return null;
  }
  function styleEstimate() {
    const all = {}; for (const c of Object.values(counts)) for (const [g, n] of Object.entries(c)) all[g] = (all[g] ?? 0) + n;
    const n = Object.values(all).reduce((a, b) => a + b, 0); if (n < 10) return { label: 'UNKNOWN (insufficient observations)', samples: n };
    const share = k => k.reduce((acc, g) => acc + (all[g] ?? 0), 0) / n;
    const attack = share(['LIGHT_ATTACK', 'HEAVY_ATTACK', 'LOW_ATTACK', 'JUMP_FORWARD']), guard = share(['BLOCK_HIGH', 'BLOCK_LOW']), retreat = share(['WALK_BACK']);
    const label = attack > .4 ? 'AGGRESSIVE-LIKE' : guard + retreat > .5 ? (retreat > .2 ? 'DEFENSIVE-LIKE' : 'COUNTER/GUARD-LIKE') : 'MIXED';
    return { label: `INFERRED ${label} (attack ${Math.round(attack * 100)}% guard ${Math.round(guard * 100)}% retreat ${Math.round(retreat * 100)}%)`, samples: n };
  }

  function evaluate(world0, opt, oppScripts) {
    const outcomes = [];
    for (const { g, p } of oppScripts) {
      simulationRollouts++;
      const w = { fighters: world0.fighters.map(cloneF) }, mine = script(opt.steps, defaultPolicy), theirs = opponentScript(g);
      let dealt = 0, taken = 0, crossHit = false;
      for (let t = 0; t < horizon; t++) {
        simulationSteps++;
        const [me, op] = w.fighters, ev = fightTick(w, [mine(me, op), theirs(op, me)]);
        // Damage is discounted by when it happens, so an earlier identical hit is preferred (no horizon-end artefacts).
        const g = DISCOUNT ** t;
        for (const e of ev) if (e.type === 'HIT' || e.type === 'BLOCKED') { const dmg = (e.type === 'HIT' ? e.damage : e.chip) * g; if (e.who === 0) { dealt += dmg; crossHit ||= e.back; } else taken += dmg; }
          else if (e.type === 'WHIFF' && e.who === 0) dealt -= .3 * g; // a whiff spends recovery for nothing
        if (w.fighters[0].health <= 0 || w.fighters[1].health <= 0) break;
      }
      const [me, op] = w.fighters, d = Math.abs(op.x - me.x);
      let v = dealt - taken;
      if (me.move?.phase === 'RECOVERY' && d < 12 && !op.stun) v -= 3; // left vulnerable at the horizon
      v -= .06 * Math.max(0, d - 12);                                        // engagement: long range scores nothing
      if (me.x < FIGHT.stage[0] + 5 || me.x > FIGHT.stage[1] - 5) v -= 1;
      if (op.health <= 0) v += 30; if (me.health <= 0) v -= 30;
      outcomes.push({ g, p, v, dealt, taken, crossHit });
    }
    const expected = outcomes.reduce((a, o) => a + o.p * o.v, 0) / outcomes.reduce((a, o) => a + o.p, 0), worst = Math.min(...outcomes.map(o => o.v));
    return { value: (1 - riskWeight) * expected + riskWeight * worst, expected, worst, outcomes };
  }

  return {
    id: label, label: 'TEMPORAL TASK FIGHTER V3 (NOT CANONICAL PRIME)', capability: 'WITHIN_EPISODE_ADAPTATION', access: 'OBSERVATION_ONLY', horizon,
    decide(obs) {
      const start = performance.now();
      simulationRollouts = 0; simulationSteps = 0;
      if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      const trigger = learn(obs); prev = obs;
      const me = obs.me, legal = obs.legalActions, style = styleEstimate();
      if (legal.length <= 1) return { action: legal[0] ?? 'WAIT', reason: `committed (${me.phase}); only WAIT is legal`, horizon: 0, branches: 0, planningHorizon: 'NONE (not actionable)',
        objective: 'complete current action', opponentStatus: style.label, adaptationTrigger: trigger, latencyMs: performance.now() - start, legalActions: legal };
      const world = { fighters: [rebuild(obs.me), rebuild(obs.opponent)] };
      const ctx = context(obs.distance, me), dist = distribution(ctx);
      // Opponent committed to a visible move: its next ticks are determined, so only its follow-up is uncertain.
      const committed = !actionable(world.fighters[1]);
      const opp = (committed ? dist.slice(0, 3) : dist.filter(x => x.p >= .05).slice(0, 5));
      const scored = options(world.fighters[0]).map(opt => ({ opt, ...evaluate(world, opt, opp) })).sort((a, b) => b.value - a.value);
      const best = scored[0], first = script(best.opt.steps, defaultPolicy)(cloneF(world.fighters[0]), world.fighters[1]);
      // A tie only matters when equally valued options would start with different actions.
      const tiedFirst = scored.filter(s => Math.abs(s.value - best.value) < 1e-9).map(s => script(s.opt.steps, defaultPolicy)(cloneF(world.fighters[0]), world.fighters[1]));
      const ties = new Set(tiedFirst).size, categoryTies = new Set(tiedFirst.map(actionCategory)).size;
      return { action: legal.includes(first) ? first : 'WAIT', simulationRollouts, simulationSteps, reason: `${best.opt.name}: E=${round(best.expected)} worst=${round(best.worst)} vs ${opp.map(o => o.g + ':' + round(o.p)).join(' ')}`,
        option: best.opt.name, ranking: scored.slice(0, 6).map(s => ({ action: s.opt.name, value: round(s.value), expected: round(s.expected), worst: round(s.worst) })), qTies: ties, qTieCategories: categoryTies,
        horizon, planningHorizon: `${horizon} ticks x ${scored.length} options x ${opp.length} opponent responses`, branches: scored.length * opp.length,
        objective: obs.distance > 14 ? 'close distance safely' : 'win exchange at current spacing', opponentStatus: style.label, adaptationTrigger: trigger,
        opponentModelContext: ctx, latencyMs: performance.now() - start, legalActions: legal };
    },
    memorySnapshot: () => structuredClone(counts),
    history: () => history,
  };
}
