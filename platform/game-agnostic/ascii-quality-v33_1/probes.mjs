// Phase A4 — targeted forensic probes for the games whose STRONG/witness status is unresolved or failing. Evaluator-only:
// some probes edit cloned private state to compute UPPER BOUNDS on what any legal play could achieve; such results are
// labelled PRIVILEGED_UPPER_BOUND and are never policy inputs. Mechanics unchanged.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { create, packet, step, terminal, metrics } from '../ascii-suite/v32/kernel.mjs';
import { clone, hash } from '../ascii-suite/v3/common.mjs';
import { ruleDriver, previewFor, CAR, segmentAt, raceStandings } from '../ascii-suite/worlds/racing.mjs';
import { createPolicyV331 } from './policy-v33_1.mjs';
import { FRESH_DEV, FAMILY } from './population.mjs';
import { LANE, writeExclusive, sourceClosure } from './guard.mjs';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mk = (game, seed, tier, sensor = 'NORMAL') => create(game, seed, tier, { family: FAMILY, sensor });
const act = (p, type) => p.actions.find((a) => a.type === type) ?? p.actions[0];

/* ---------------- Pong: can ANY return beat the environment opponent? ---------------- */
function ballIntercept(ball, plane = 3) { const b = clone(ball); for (let t = 1; t < 400; t++) { b.vy = clamp(b.vy + b.spin, -2.8, 2.8); b.spin *= .97; b.x += b.vx; b.y += b.vy; if (b.y < 1 || b.y > 30) { b.y = b.y < 1 ? 2 - b.y : 60 - b.y; b.vy = -b.vy; b.spin = -b.spin; } if (b.x <= plane) return { ticks: t, y: b.y }; } return null; }
function trackerAction(w, p) { const s = w.inner, e = s.ext, b = e.balls.filter((b) => b.vx < 0 && s.tick >= b.release).map(ballIntercept).filter(Boolean).sort((a, b) => a.ticks - b.ticks)[0]; const aim = b ? clamp(b.y, 4, 27) : 16, err = aim - s.playerY - e.velocity * 2; return act(p, err < -.25 ? 'UP' : err > .25 ? 'DOWN' : 'HOLD'); }
function pongProbe(seed, tier) {
  let w = mk('pong', seed, tier); const pol = createPolicyV331('pong', 'STRONG', {}); const states = [];
  // Collect approach states along a STRONG trajectory: ball heading to the player, x in [12,24], released.
  for (let k = 0; k < 2500 && !terminal(w) && states.length < 6; k++) { const p = packet(w), b = w.inner.ext.balls[0]; if (b.vx < 0 && b.x > 12 && b.x < 24 && w.inner.tick >= b.release && (states.length === 0 || w.inner.tick - states.at(-1).tick > 60)) states.push({ tick: w.inner.tick, w: clone(w) }); w = step(w, p, pol.decide(p).action); }
  const sweeps = states.map(({ tick, w: w0 }) => {
    // Advance clones with HOLD until the crossing step; record the crossing y and the tick before it.
    let pre = clone(w0), cross = null;
    for (let k = 0; k < 120; k++) { const p = packet(pre), nx = step(pre, p, act(p, 'HOLD')); const bb = nx.inner.ext.balls[0]; if (bb.x <= 3 || nx.inner.events.some((e) => /POINT_LOST|PLAYER_RETURN/.test(e))) { cross = { y: bb.y, stateBefore: pre }; break; } pre = nx; }
    if (!cross) return { tick, status: 'NO_CROSSING_FOUND' };
    let returns = 0, pointsWon = 0, pointsLost = 0, bestOpponentMiss = Infinity; const tried = [];
    for (let offset = -1; offset <= 1.0001; offset += .1) for (let v = -1.5; v <= 1.5001; v += .25) {
      const s = clone(cross.stateBefore); s.inner.playerY = clamp(cross.y - offset * 3.5 - v, 4, 27); s.inner.ext.velocity = v / .6; // PRIVILEGED state edit: places the paddle for this contact
      let p = packet(s), x = step(s, p, act(p, 'HOLD')); if (!x.inner.events.includes('PLAYER_RETURN ball-0') && !x.inner.events.some((e) => e.startsWith('PLAYER_RETURN'))) continue; returns++;
      let won = false, lost = false, exchanges = 0, oppMiss = Infinity;
      for (let k = 0; k < 900 && !won && !lost && exchanges < 8; k++) { const q = packet(x); x = step(x, q, trackerAction(x, q)); const ev = x.inner.events; if (ev.some((e) => e.startsWith('OPPONENT_RETURN'))) exchanges++; if (ev.includes('POINT_WON')) won = true; if (ev.includes('POINT_LOST')) lost = true; const b = x.inner.ext.balls[0]; if (b.vx > 0 && b.x > 88 && b.x < 92) oppMiss = Math.min(oppMiss, Math.abs(b.y - x.inner.enemyY)); }
      if (won) pointsWon++; if (lost) pointsLost++; bestOpponentMiss = Math.min(bestOpponentMiss, oppMiss === Infinity ? bestOpponentMiss : oppMiss); tried.push({ offset: +offset.toFixed(1), v, won, lost, exchanges });
    }
    return { tick, crossingY: +cross.y.toFixed(2), contactsTried: tried.length, returns, pointsWon, pointsLost, firstWinningContact: tried.find((t) => t.won) ?? null, note: 'PRIVILEGED_UPPER_BOUND: every reachable (offset, paddle velocity) contact plus a perfect-information tracker afterwards' };
  });
  // Opponent tracking margin: how close the environment paddle gets to the ball when it arrives (from the STRONG run).
  let w2 = mk('pong', seed, tier); const pol2 = createPolicyV331('pong', 'STRONG', {}); const arrivals = [];
  for (let k = 0; k < 3000 && !terminal(w2); k++) { const p = packet(w2); const b0 = w2.inner.ext.balls[0]; w2 = step(w2, p, pol2.decide(p).action); const b = w2.inner.ext.balls[0]; if (b0.vx > 0 && b0.x < 92 && (b.x >= 92 || w2.inner.events.some((e) => e.startsWith('OPPONENT_RETURN')))) arrivals.push(+Math.abs(b.y - w2.inner.enemyY).toFixed(2)); }
  return { seed, tier, approachStatesSampled: states.length, sweeps, strongRun: { result: w2.inner.result, points: w2.inner.ext.points, ticks: w2.inner.tick, opponentArrivalError: { n: arrivals.length, max: arrivals.length ? Math.max(...arrivals) : null, mean: arrivals.length ? +(arrivals.reduce((a, b) => a + b, 0) / arrivals.length).toFixed(2) : null, paddleReach: 3.5 } } };
}

/* ---------------- Racing: why never first? privileged driver sweep + grid isolation ---------------- */
function raceWith(seed, tier, params, { pole = false, maxTicks = 20000 } = {}) {
  let w = mk('racing', seed, tier); if (pole) { const s = w.inner; const lead = Math.max(...s.rivals.map((r) => r.s)); s.player.s = lead + 7; s.player.n = 0; } // PRIVILEGED state edit
  const lapAt = {}, lapT = {}; let contacts = 0, off = 0, slides = 0, barrier = 0;
  while (!terminal(w) && w.inner.tick < maxTicks) {
    const p = packet(w), s = w.inner, c = s.player, grip = CAR.grip * (segmentAt(s.track, c.s).wet ? s.track.wetGrip : 1), traffic = s.rivals.map((r) => ({ id: r.id, ds: r.s - c.s, n: r.n, v: r.v }));
    const a = params === 'STRONG' ? null : ruleDriver(c, { preview: previewFor(s.track, c.s, 300), traffic, grip }, params);
    w = step(w, p, params === 'STRONG' ? createPolicyV331('racing', 'STRONG', {}).decide(p).action : act(p, a));
    for (const car of [w.inner.player, ...w.inner.rivals]) { const lap = Math.floor(car.s / w.inner.track.lapLength); if ((lapAt[car.id] ?? 0) < lap) { lapAt[car.id] = lap; (lapT[car.id] ??= []).push(w.inner.tick); } }
    const ev = w.inner.events ?? []; if (ev.some((e) => e.startsWith('CAR_CONTACT'))) contacts++; if (ev.includes('OFF_TRACK')) off++; if (ev.includes('SLIDING')) slides++; if (ev.includes('BARRIER_COLLISION')) barrier++;
  }
  const st = raceStandings(w.inner);
  return { result: w.inner.result, ticks: w.inner.tick, place: st.find((c) => c.id === 'P')?.place, startPlace: w.inner.startPlace, finishTicks: Object.fromEntries(st.map((c) => [c.id, c.finishedTick])), lapTicks: lapT, contacts, offTrack: off, slides, barrierHits: barrier, rivalSkills: w.inner.rivals.map((r) => +r.driver.skill.toFixed(3)) };
}
function racingProbe(seed, tier) {
  const grid = []; for (const skill of [.9, .95, .97, .99, 1.0]) for (const brakeMargin of [.9, 1.0, 1.1]) for (const line of [.3, .6, .9]) { const r = raceWith(seed, tier, { skill, brakeMargin, line, lane: 0, gain: 1, wetCaution: 1, defend: false }, { maxTicks: 9000 }); grid.push({ skill, brakeMargin, line, place: r.place, result: r.result, ticks: r.ticks, contacts: r.contacts, slides: r.slides, offTrack: r.offTrack }); }
  const best = [...grid].sort((a, b) => a.place - b.place || a.ticks - b.ticks)[0];
  const strong = raceWith(seed, tier, 'STRONG', { maxTicks: 9000 });
  const pole = raceWith(seed, tier, { skill: best.skill, brakeMargin: best.brakeMargin, line: best.line, lane: 0, gain: 1, wetCaution: 1, defend: false }, { pole: true, maxTicks: 9000 });
  return { seed, tier, sweep: { combos: grid.length, firstPlaceCombos: grid.filter((g) => g.place === 1).length, best }, strong: { place: strong.place, result: strong.result, ticks: strong.ticks, startPlace: strong.startPlace, lapTicks: strong.lapTicks, contacts: strong.contacts, offTrack: strong.offTrack, slides: strong.slides, barrierHits: strong.barrierHits, rivalSkills: strong.rivalSkills }, poleIsolation: { note: 'PRIVILEGED state edit: player placed 7 units ahead of the leader at start with the best sweep driver', place: pole.place, result: pole.result, ticks: pole.ticks, contacts: pole.contacts } };
}

/* ---------------- Cards: anatomy of the early FAILURE ---------------- */
function cardsProbe(seed, tier) {
  let w = mk('cards', seed, tier); const pols = Array.from({ length: w.inner.players }, (_, i) => createPolicyV331('cards', 'STRONG', { partnerStyle: i > 0 ? w.inner.ext.partnerStyle : null })); const counts = {}, timeline = [];
  while (!terminal(w)) { const p = packet(w), d = pols[w.inner.turn].decide(p); w = step(w, p, d.action); for (const e of w.inner.events ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1; timeline.push({ t: w.inner.tick, a: d.action.type, score: w.inner.score, errors: w.inner.errors, deck: w.inner.deck.length, clues: w.inner.clues }); }
  const i = w.inner; return { seed, tier, result: i.result, ticks: i.tick, score: i.score, target: i.target, errorsLeft: i.errors, deckLeft: i.deck.length, finalTurns: i.finalTurns, handsEmpty: !i.hands.flat().length, criticalLosses: i.metrics.criticalLosses, events: counts, terminalCause: i.errors <= 0 ? 'ERRORS_EXHAUSTED' : i.finalTurns === 0 ? 'FINAL_TURNS_AFTER_DECK_EMPTY' : !i.hands.flat().length ? 'NO_CARDS' : i.score >= i.target ? 'TARGET_REACHED' : 'LIMIT', deckSize: Object.values(i.multiplicity).reduce((a, b) => a + b, 0), timelineTail: timeline.slice(-6) };
}

/* ---------------- Roguelike: where does STRONG die? ---------------- */
function rogueProbe(seed, tier) {
  let w = mk('roguelike', seed, tier); const pol = createPolicyV331('roguelike', 'STRONG', {}); const dmg = {}, health = []; let potions = 0, floorsMax = 1, knownTrapHits = 0, enemiesAdjacentMax = 0;
  while (!terminal(w)) { const p = packet(w), o = p.observation; const before = w.inner.actor.health; const adjacent = o.enemies.filter((e) => Math.abs(e.x - o.actor.x) + Math.abs(e.y - o.actor.y) <= 1).length; enemiesAdjacentMax = Math.max(enemiesAdjacentMax, adjacent); const d = pol.decide(p); w = step(w, p, d.action); const i = w.inner; floorsMax = Math.max(floorsMax, i.level); const lost = before - i.actor.health; if (lost > 0) { const ev = i.events.map((e) => e.type); const src = ev.includes('TRAP') ? 'TRAP' : ev.includes('CYCLIC_HAZARD') ? 'CYCLIC_HAZARD' : adjacent ? 'ENEMY_ADJACENT' : 'ENEMY_RANGED_OR_HUNTER'; dmg[src] = (dmg[src] ?? 0) + lost; if (ev.includes('TRAP') && o.traps.some((t) => !t.disabled)) knownTrapHits++; } if (d.action.type === 'USE_ITEM') potions++; if (i.tick % 25 === 0) health.push([i.tick, i.actor.health, i.level]); }
  const i = w.inner; return { seed, tier, result: i.result, ticks: i.tick, floorsReached: floorsMax, floorsTotal: i.levelsTotal, damageBySource: dmg, potionsUsed: potions, potionsLeft: i.inventory.potions, enemiesAdjacentMax, knownTrapHits, healthTimeline: health.slice(0, 40), cause: i.result === 'FAILURE' ? Object.entries(dmg).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN' : null };
}

export function probes() {
  const out = { schema: 'ASCII_V33_1_GAME_PROBES_V1', family: FAMILY, seeds: [...FRESH_DEV], sourceClosure: sourceClosure().hash, pong: [], racing: [], cards: [], roguelike: [] };
  for (const tier of [1, 2, 3]) { out.pong.push(pongProbe(FRESH_DEV[0], tier)); process.stderr.write(`[probes] pong ${tier}\n`); }
  for (const tier of [1, 2]) for (const seed of FRESH_DEV.slice(0, 2)) { out.racing.push(racingProbe(seed, tier)); process.stderr.write(`[probes] racing ${tier} ${seed}\n`); }
  for (const tier of [1, 2, 3]) for (const seed of FRESH_DEV) out.cards.push(cardsProbe(seed, tier));
  for (const tier of [1, 2, 3]) for (const seed of FRESH_DEV) out.roguelike.push(rogueProbe(seed, tier));
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const o = probes(); writeExclusive(resolve(LANE, 'evidence/game-probes.json'), o); console.log(JSON.stringify({ pong: o.pong.map((p) => ({ tier: p.tier, sweeps: p.sweeps.map((s) => ({ returns: s.returns, won: s.pointsWon, lost: s.pointsLost })), strong: p.strongRun })), racing: o.racing.map((r) => ({ tier: r.tier, seed: r.seed, sweep: r.sweep, strongPlace: r.strong.place, start: r.strong.startPlace, pole: r.poleIsolation.place })), cards: o.cards.map((c) => ({ tier: c.tier, result: c.result, t: c.ticks, score: c.score + '/' + c.target, cause: c.terminalCause, errorsLeft: c.errorsLeft, deck: c.deckLeft + '/' + c.deckSize, critical: c.criticalLosses })), rogue: o.roguelike.map((r) => ({ tier: r.tier, result: r.result, floors: r.floorsReached + '/' + r.floorsTotal, cause: r.cause, dmg: r.damageBySource, potions: r.potionsUsed })) }, null, 1)); }
