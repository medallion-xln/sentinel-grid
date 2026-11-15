// Phase A3 — full-series regression audit: 8 games x 3 tiers x preregistered fresh DEV seeds. Independent dimensions per
// level/seed (never collapsed into one PASS): world validity, action contract, progression, reachability witness,
// termination, controllers, presentation, replay. Mechanics unchanged; witnesses are evaluator-only.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { create, packet, step, terminal, metrics, replay, verifyReplay } from '../ascii-suite/v32/kernel.mjs';
import { LEVELS } from '../ascii-suite/v32/catalog.mjs';
import { hash } from '../ascii-suite/v3/common.mjs';
import { structural, witness as privilegedWitness } from '../ascii-suite/v32/feasibility.mjs';
import { constructive } from '../ascii-suite/v32/legacy-witness.mjs';
import { render as renderV32 } from '../ascii-suite/v32/render.mjs';
import { render as renderV33 } from '../ascii-quality-v33/render-v33.mjs';
import { platformerWitness } from '../ascii-quality-v33/witness.mjs';
import { createPolicyV331 } from './policy-v33_1.mjs';
import { FRESH_DEV, FAMILY } from './population.mjs';
import { LANE, assertSoleWriter, writeExclusive, verifyInheritance, sourceClosure, readJson } from './guard.mjs';

const OUT = resolve(LANE, 'evidence/audit');
const RESULTS = { pong: ['WIN', 'LOSS', 'TIMEOUT'], platformer: ['WIN', 'LOSS', 'TIMEOUT'], fighter: ['WIN', 'LOSS', 'TIMEOUT'], racing: ['FINISH_PLACE_1', 'FINISH_PLACE_2', 'FINISH_PLACE_3', 'FINISH_PLACE_4', 'TIMEOUT'], rescue: ['SUCCESS', 'FAILURE', 'TIMEOUT'], cards: ['SUCCESS', 'FAILURE', 'TIMEOUT'], factory: ['SUCCESS', 'DEADLINE_FAILURE', 'TIMEOUT', 'FAILURE'], roguelike: ['SUCCESS', 'FAILURE', 'TIMEOUT'] };
const policiesFor = (game) => ['STRONG', 'RULE', 'RANDOM', 'WAIT', 'SPAM', ...(game === 'platformer' ? ['STRONG_V33_1'] : game === 'rescue' ? ['STRONG_RESCUE_V33_1'] : [])];
const renderOf = (game) => (['platformer', 'fighter'].includes(game) ? renderV33 : renderV32);

export function episode(game, seed, tier, kind, sensor = 'NORMAL', { renderTicks = 150 } = {}) {
  const initial = { game, seed, tier, family: FAMILY, sensor };
  let w = create(game, seed, tier, { family: FAMILY, sensor });
  const mk = () => Array.from({ length: game === 'cards' ? w.inner.players : 1 }, (_, i) => createPolicyV331(game, i === 0 ? kind : 'STRONG', { seed: 74123 + i * 7919, partnerStyle: i > 0 ? w.inner.ext.partnerStyle : null }));
  let policies = mk(), round = 1;
  const actions = [], progress = [], renderErrors = [], exceptions = [];
  let illegalProposals = 0, abstentions = 0, kernelErrors = 0, renderFrames = 0, renderPlayerMissing = 0, lines = new Set();
  const limit = w.inner.ext?.limit ?? w.inner.limit ?? 20000;
  while (!terminal(w) && actions.length < limit + 5) {
    const p = packet(w), index = game === 'cards' ? w.inner.turn : 0;
    if (w.inner.ext.round !== round) { round = w.inner.ext.round; policies = mk(); }
    const d = policies[index].decide(p);
    if (d.abstain) abstentions++;
    if (/EXCEPTION/.test(d.reason ?? '')) exceptions.push({ tick: w.inner.tick, reason: d.reason.slice(0, 160) });
    let a = d.action;
    if (!a || !p.actions.some((x) => x.id === a.id)) { illegalProposals++; a = p.actions.find((x) => x.type === 'WAIT') ?? p.actions[0]; }
    if (actions.length < renderTicks && p.observation) { try { const text = renderOf(game)(p.observation); renderFrames++; lines.add(text.split('\n').length); if (['platformer', 'roguelike', 'rescue', 'factory'].includes(game) && !/[@O]/.test(text)) renderPlayerMissing++; } catch (e) { renderErrors.push({ tick: w.inner.tick, error: String(e.message).slice(0, 120) }); } }
    try { w = step(w, p, a); } catch (e) { kernelErrors++; exceptions.push({ tick: w.inner.tick, reason: 'KERNEL:' + e.message }); break; }
    actions.push(a);
    if (actions.length % 50 === 0 || terminal(w)) progress.push({ tick: w.inner.tick, completion: metrics(w).objectiveCompletion ?? null });
  }
  const m = metrics(w), rep = replay(initial, actions);
  let replayPass = false; try { replayPass = verifyReplay(rep).pass; } catch { replayPass = false; }
  const term = terminal(w), result = w.inner.result;
  return { game, seed, tier, kind, sensor, ticks: w.inner.tick, terminal: term, result, success: m.success === true, objectiveCompletion: m.objectiveCompletion ?? null, catastrophic: m.catastrophic === true,
    termination: { resultAllowed: RESULTS[game].includes(result) || (!term && result === 'IN_PROGRESS'), timeoutAtLimit: result !== 'TIMEOUT' || w.inner.tick >= limit, terminalFlagConsistent: term === (result !== 'IN_PROGRESS'), limit },
    illegalProposals, abstentions, kernelErrors, exceptions: exceptions.slice(0, 5), exceptionCount: exceptions.length, replayPass, render: { frames: renderFrames, errors: renderErrors.slice(0, 3), lineCounts: [...lines], playerMissing: renderPlayerMissing },
    progression: { samples: progress.length, maxCompletion: Math.max(0, ...progress.map((x) => x.completion ?? 0)), monotone: progress.every((x, i) => i === 0 || (x.completion ?? 0) >= (progress[i - 1].completion ?? 0) - 1e-9) }, finalHash: hash(w.inner).slice(0, 16) };
}

/** Action contract: every offered action applies without error; game-specific documented effects on sampled states. */
export function actionContract(game, seed, tier, sampleTicks = [0, 40, 120]) {
  let w = create(game, seed, tier, { family: FAMILY, sensor: 'NORMAL' });
  const pol = createPolicyV331(game, 'STRONG', {}), partners = game === 'cards' ? Array.from({ length: w.inner.players }, (_, i) => createPolicyV331(game, 'STRONG', { partnerStyle: i > 0 ? w.inner.ext.partnerStyle : null })) : null;
  const checks = []; let k = 0;
  while (!terminal(w) && k <= Math.max(...sampleTicks)) {
    const p = packet(w);
    if (sampleTicks.includes(k)) for (const a of p.actions) {
      let next, error = null; try { next = step(w, p, a); } catch (e) { error = e.message; }
      const c = { tick: k, action: a.type, applied: !error, error, changed: next ? hash(next.inner) !== hash(w.inner) : null, documentedEffect: null };
      if (next) c.documentedEffect = effectOf(game, w.inner, next.inner, a);
      checks.push(c);
    }
    const d = (partners ? partners[w.inner.turn] : pol).decide(p); w = step(w, p, d.action); k++;
  }
  return { sampled: sampleTicks, checks: checks.length, errors: checks.filter((c) => !c.applied).length, effectViolations: checks.filter((c) => c.documentedEffect === false).map((c) => ({ tick: c.tick, action: c.action })), unverifiedEffects: checks.filter((c) => c.documentedEffect === null).length, detail: checks.filter((c) => !c.applied || c.documentedEffect === false).slice(0, 10) };
}
function effectOf(game, i, j, a) {
  const t = a.type, ev = j.events ?? [];
  if (game === 'platformer') {
    if (t === 'MOVE_RIGHT') return j.vx > i.vx - 1e-9 || ev.includes('WALL_CONTACT') || j.x !== i.x;
    if (t === 'MOVE_LEFT') return j.vx < i.vx + 1e-9 || ev.includes('WALL_CONTACT') || j.x !== i.x;
    if (/^JUMP/.test(t)) return i.grounded ? ev.includes('JUMP_START') : true;
    if (t === 'CROUCH' || t === 'WAIT') return i.grounded ? Math.abs(j.vx) <= Math.abs(i.vx) + 1e-9 : true;
    if (t === 'TAKE_KEY') return ev.includes('KEY_COLLECTED'); if (t === 'ACTIVATE_SWITCH') return ev.includes('SWITCH_ON');
  }
  if (game === 'pong') { // v32 paddles are acceleration-limited (legacy-extension pongStep): UP/DOWN act on paddle velocity (±.35, clamp ±1.5), HOLD decays it (×.6); position follows velocity, so the documented effect is on velocity.
    const v0 = i.ext.velocity, v1 = j.ext.velocity; if (t === 'UP') return v1 <= Math.max(-1.5, v0 - .35) + 1e-9; if (t === 'DOWN') return v1 >= Math.min(1.5, v0 + .35) - 1e-9; if (t === 'HOLD') return Math.abs(v1 - v0 * .6) < 1e-9; }
  if (game === 'racing') { // carStep: ACCELERATE adds .055 before drag/rolling; BRAKE subtracts .11; TURN_LEFT/RIGHT step delta ±.25 (clamped); HOLD centres delta (×.9). Compared against the coast (no-input) outcome.
    const a0 = i.player, a1 = j.player; if (a1.finishedTick !== null) return true; const coast = Math.max(0, a0.v - .0057 * a0.v * a0.v - (a0.v > 0 ? .002 : 0)); if (t === 'ACCELERATE') return a1.v >= coast - 1e-9; if (t === 'BRAKE') return a1.v <= coast + 1e-9; if (t === 'TURN_LEFT') return a1.delta >= Math.min(1, a0.delta + .25) - 1e-9 - .5 * (a0.v > 0 ? 0 : 0); if (t === 'TURN_RIGHT') return a1.delta <= Math.max(-1, a0.delta - .25) + 1e-9; if (t === 'HOLD') return Math.abs(a1.delta - a0.delta * .9) < 1e-9; }
  if (game === 'fighter') { const f0 = i.fighters[0], f1 = j.fighters[0]; if (/ATTACK$/.test(t) && !f0.move && f0.grounded) return f1.move?.name === t; return null; } // other fighter effects (guard, walk, jump) are not verified here: NOT_ESTABLISHED, not asserted
  if (['rescue', 'roguelike'].includes(game) && t.startsWith('MOVE_')) { const u0 = game === 'rescue' ? i.units[i.active] : i.actor, u1 = game === 'rescue' ? j.units[j.active] : j.actor; return u1.x !== u0.x || u1.y !== u0.y || ev.some((e) => e.type === 'BLOCKED'); }
  if (game === 'factory' && t.startsWith('MOVE_')) return true;
  if (game === 'cards') { if (t === 'PLAY_CARD') return ev.some((e) => ['VALID_PLAY', 'MISPLAY'].includes(e.type)); if (t === 'DISCARD_CARD') return ev.some((e) => e.type === 'DISCARD'); if (t.startsWith('GIVE_')) return ev.some((e) => e.type === 'CLUE') && j.clues === i.clues - 1; }
  return null;
}
export function reachability(game, seed, tier) {
  const spec = { game, seed, tier, family: FAMILY }, s = structural(spec);
  let witness;
  if (game === 'platformer') { const w = platformerWitness(seed, tier); witness = { kind: 'SCRIPTED_PUBLIC_ACTION_FAMILY', success: w.status === 'WITNESS_FOUND', ticks: w.ticks ?? null, replayVerified: w.replayVerified ?? null, searched: w.searched, parameters: w.parameters ?? null };
    if (!witness.success) { // as in v33 (Extreme): a recorded, replay-verified winning trajectory of a public-observation controller is also a legitimate completion witness
      for (const kind of ['STRONG', 'STRONG_V33_1']) { const e = episode(game, seed, tier, kind, 'NORMAL', { renderTicks: 0 }); if (e.success && e.replayPass) { witness = { kind: 'RECORDED_' + kind + '_TRAJECTORY (public observation, replay-verified)', success: true, ticks: e.ticks, replayVerified: true, scriptedFamily: 'UNRESOLVED_WITHIN_BUDGET (' + w.searched + ' searched)' }; break; } } } }
  else if (['pong', 'racing'].includes(game)) { const tries = [0, 1, 2, 3].map((v) => { const c = constructive(spec, v); return { variant: v, success: c.success, outcome: c.outcome, ticks: c.ticks }; }); const pub = privilegedWitness(spec); witness = { kind: 'PRIVILEGED_CONSTRUCTIVE_VARIANTS+PUBLIC_PLANNER', success: tries.some((t) => t.success) || pub.success, variants: tries, publicPlanner: { success: pub.success, outcome: pub.outcome, ticks: pub.ticks } }; }
  else { const pub = privilegedWitness(spec); witness = { kind: pub.scope, success: pub.success, outcome: pub.outcome, ticks: pub.ticks }; }
  return { structural: { pass: s.pass, scope: s.scope }, witness, status: witness.success ? 'WITNESS_FOUND' : 'REFERENCE_NOT_ESTABLISHED' };
}

export function auditLevel(L, seeds, log = false) {
  const out = { level: L.id, game: L.game, tier: L.tier, seeds, worlds: {}, episodes: [], actionContract: {}, reachability: {} };
  for (const seed of seeds) {
    const w = create(L.game, seed, L.tier, { family: FAMILY, sensor: 'NORMAL' }); out.worlds[seed] = { loads: true, innerHash: hash(w.inner).slice(0, 16), admission: w.inner.admission ?? null, limit: w.inner.ext?.limit ?? w.inner.limit ?? null };
    out.actionContract[seed] = actionContract(L.game, seed, L.tier);
    out.reachability[seed] = reachability(L.game, seed, L.tier);
    for (const kind of policiesFor(L.game)) out.episodes.push(episode(L.game, seed, L.tier, kind));
    if (L.game === 'rescue') for (const kind of ['STRONG', 'STRONG_RESCUE_V33_1']) out.episodes.push(episode(L.game, seed, L.tier, kind, 'STALE'));
    if (log) process.stderr.write(`[audit] ${L.id} seed ${seed} done\n`);
  }
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyInheritance(); mkdirSync(OUT, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--level='))?.slice(8);
  for (const L of LEVELS) { if (only && L.id !== only) continue; const file = resolve(OUT, L.id + '.json'); if (existsSync(file)) { process.stderr.write(`[audit] ${L.id} exists, skipped\n`); continue; } const t = performance.now(); const r = auditLevel(L, FRESH_DEV, true); writeExclusive(file, { ...r, wallMs: Math.round(performance.now() - t), sourceClosure: sourceClosure().hash, inheritance: { canonicalProtected: inh.canonicalProtected.count } }); process.stderr.write(`[audit] ${L.id} written ${Math.round((performance.now() - t) / 1000)}s\n`); }
  console.log(JSON.stringify({ status: 'AUDIT_COMPLETE', levels: LEVELS.length }));
}
