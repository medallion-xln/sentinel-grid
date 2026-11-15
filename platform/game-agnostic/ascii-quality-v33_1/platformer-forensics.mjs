// Phase A2 — reproduce the Platformer Advanced defect (STRONG 0/12 TIMEOUT; reference WIN t169), compare against the
// legitimate scripted witness, find the first meaningful divergence, dump the planner's candidate set at the stall onset,
// classify the failure, and verify the versioned V2 copy (repair off) reproduces v1 decisions bit-for-bit.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { create, packet, step, terminal, replay, verifyReplay } from '../ascii-suite/v32/kernel.mjs';
import { createPolicy } from '../ascii-suite/v32/policy.mjs';
import { scriptedPlatformer, platformerWitness } from '../ascii-quality-v33/witness.mjs';
import { createPolicyV331 } from './policy-v33_1.mjs';
import { V33_SEED, V33_TWELVE, FAMILY } from './population.mjs';
import { LANE, assertSoleWriter, writeExclusive, verifyInheritance, sourceClosure } from './guard.mjs';

const INIT = (seed, tier) => ({ game: 'platformer', seed, tier, family: FAMILY, sensor: 'NORMAL' });
const r3 = (v) => Math.round(v * 1000) / 1000;
export function run(seed, tier, policy, maxTicks = 1600, { rows = true } = {}) {
  let w = create('platformer', seed, tier, { family: FAMILY, sensor: 'NORMAL' });
  const actions = [], trace = [];
  while (!terminal(w) && actions.length < maxTicks) {
    const p = packet(w), i = w.inner, d = policy.decide(p);
    actions.push(d.action);
    w = step(w, p, d.action);
    const j = w.inner;
    if (rows) trace.push({ tick: i.tick, x: r3(i.x), y: r3(i.y), vx: r3(i.vx), vy: r3(i.vy), grounded: i.grounded, action: d.action.type, executed: j.lastAction ?? d.action.type, legal: p.actions.map((a) => a.type), reason: d.reason, events: j.events ?? [], health: j.health, checkpoint: j.checkpoint, maxX: r3(Math.max(i.x, ...trace.map((t) => t.x))) });
  }
  return { result: w.inner.result, ticks: w.inner.tick, health: w.inner.health, actions, trace, final: w.inner };
}
export function runActions(seed, tier, actions) {
  let w = create('platformer', seed, tier, { family: FAMILY, sensor: 'NORMAL' }); const trace = [];
  for (const a of actions) { if (terminal(w)) break; const p = packet(w), i = w.inner, act = p.actions.find((x) => x.type === a.type) ?? a; w = step(w, p, act); trace.push({ tick: i.tick, x: r3(i.x), y: r3(i.y), vx: r3(i.vx), vy: r3(i.vy), grounded: i.grounded, action: act.type, events: w.inner.events ?? [] }); }
  return { result: w.inner.result, ticks: w.inner.tick, health: w.inner.health, trace };
}
export function forensics() {
  const inheritance = verifyInheritance();
  // 1. Reproduce STRONG on the identical v33 twelve-seed population.
  const strong = Object.fromEntries(V33_TWELVE.map((s) => { const r = run(s, 1, createPolicy('platformer', 'STRONG', {}), 1600, { rows: false }); return [s, { result: r.result, ticks: r.ticks, health: r.health, maxX: r3(Math.max(...[r.final.x])), lifeMaxX: r3(r.final.lifeMaxX) }]; }));
  // 2. Reference witness (planner-independent scripted public actions) on the v33 seed, replay-verified.
  const witness = platformerWitness(V33_SEED, 1);
  const wit = witness.status === 'WITNESS_FOUND' ? scriptedPlatformer(V33_SEED, 1, witness.parameters.d, witness.parameters.h) : null;
  const witTrace = wit ? runActions(V33_SEED, 1, wit.actions) : null;
  // 3. STRONG trace on the v33 seed with the v1 planner and the stall onset.
  const v1 = run(V33_SEED, 1, createPolicy('platformer', 'STRONG', {}));
  let stall = null; { const t = v1.trace; for (let s = 0; s + 120 <= t.length && !stall; s++) { const seg = t.slice(s, s + 120), xs = seg.map((r) => r.x), before = Math.max(...t.slice(0, s + 1).map((r) => r.x)); if (Math.max(...xs) - Math.min(...xs) <= 12 && Math.max(...xs) <= before + 1e-9) stall = { startTick: seg[0].tick, xRange: [Math.min(...xs), Math.max(...xs)], actions: seg.reduce((m, r) => ({ ...m, [r.action]: (m[r.action] ?? 0) + 1 }), {}), deaths: seg.filter((r) => r.events.includes('FALL_CHECKPOINT_RESET')).length, illegal: seg.filter((r) => !r.legal.includes(r.action)).length }; } }
  const firstLeft = v1.trace.find((r) => r.action === 'MOVE_LEFT' && r.x > 60);
  // First meaningful divergence: the first tick at which STRONG's running maximum x stops growing for good while the witness has already passed that x.
  const finalMax = Math.max(...v1.trace.map((r) => r.x)); const divergeTick = v1.trace.find((r) => r.x >= finalMax - 1e-9)?.tick ?? null;
  const witnessPass = witTrace ? witTrace.trace.find((r) => r.x >= finalMax) : null;
  const witnessAround = witTrace ? witTrace.trace.filter((r) => r.x >= 100 && r.x <= 150).map((r) => ({ tick: r.tick, x: r.x, y: r.y, action: r.action, events: r.events })) : null;
  // 4. Candidate dump at the stall onset using the faithful V2 copy in repair=false mode (debug hook), after proving equivalence.
  const copy = createPolicyV331('platformer', 'STRONG_V1COPY', { debug: true });
  const v1copy = run(V33_SEED, 1, copy);
  const equivalentActions = v1copy.actions.length === v1.actions.length && v1copy.actions.every((a, k) => a.type === v1.actions[k].type);
  const equivalence12 = Object.fromEntries(V33_TWELVE.map((s) => { const a = run(s, 1, createPolicy('platformer', 'STRONG', {}), 1600, { rows: false }).actions.map((x) => x.type), b = run(s, 1, createPolicyV331('platformer', 'STRONG_V1COPY'), 1600, { rows: false }).actions.map((x) => x.type); return [s, a.length === b.length && a.every((x, k) => x === b[k])]; }));
  const equivalenceTiers = Object.fromEntries([2, 3].map((tier) => { const a = run(V33_SEED, tier, createPolicy('platformer', 'STRONG', {}), 6000, { rows: false }), b = run(V33_SEED, tier, createPolicyV331('platformer', 'STRONG_V1COPY'), 6000, { rows: false }); return [tier, { same: a.actions.length === b.actions.length && a.actions.every((x, k) => x.type === b.actions[k].type), result: a.result, ticks: a.ticks }]; }));
  let candidatesAtStall = null;
  if (firstLeft) { // replay the copy up to the first MOVE_LEFT decision and read its candidate list
    let w = create('platformer', V33_SEED, 1, { family: FAMILY, sensor: 'NORMAL' }); const pol = createPolicyV331('platformer', 'STRONG_V1COPY', { debug: true });
    for (let k = 0; k <= firstLeft.tick && !terminal(w); k++) { const p = packet(w), d = pol.decide(p); if (k === firstLeft.tick) { const c = pol.planner.lastCandidates(); candidatesAtStall = { tick: k, x: r3(w.inner.x), decided: d.action.type, reason: d.reason, total: c.length, anyCleared: c.some((x) => x.safe && x.cleared), safeCount: c.filter((x) => x.safe).length, clearedCount: c.filter((x) => x.cleared).length, top: c.slice(0, 8), bestClearingAttempt: c.filter((x) => x.cleared).slice(0, 3), runPlan: c.find((x) => x.plan === 'RUN'), terrainAhead: { gaps: p.observation.terrain.gaps, platforms: p.observation.terrain.platforms, walls: p.observation.terrain.walls } }; break; } w = step(w, p, d.action); }
  }
  // 5. The repaired candidate on the v33 seed (diagnostic only here; the 12-seed acceptance is Phase A6).
  const v2 = run(V33_SEED, 1, createPolicyV331('platformer', 'STRONG_V33_1'));
  const v2rep = replay(INIT(V33_SEED, 1), v2.actions), v2replay = verifyReplay(v2rep).pass;
  const classification = { class: 'D', name: 'CONTROLLER_STRATEGY_OR_PLANNING_DEFECT', confirmed: !!(stall && candidatesAtStall && !candidatesAtStall.anyCleared && witness.status === 'WITNESS_FOUND' && stall.deaths === 0 && stall.illegal === 0),
    evidence: ['world mechanics: no death, damage, head bump or illegal action during the stall; the scripted public-action witness wins (replay-verified) on the same world', 'observation/state encoding: the planner sees the gap and the platform (terrainAhead) correctly', 'action legality: zero illegal selections', 'terminal/win logic: the witness WIN triggers at x >= exit with the Advanced gate open', 'rendering: not involved (decisions are computed from the observation, never from the render)'],
    mechanism: 'When GAP@x0 enters the 26-cell window no candidate trajectory (RUN k<=16 + JUMP, WAIT, BACK) can clear it within the 45-tick horizon because the takeoff must happen past the elevated platform that ends 4 cells before the gap (head-bump otherwise); the scoring rule treats every non-clearing plan that ends before the gap as "safe", so a BACK plan wins, the body moves left, the gap leaves the window, the "clear path" branch moves right, and the cycle repeats until TIMEOUT.' };
  const out = { schema: 'ASCII_V33_1_PLATFORMER_FORENSICS_V1', level: 'PLATFORMER_ADVANCED_1', family: FAMILY, inheritance: { canonicalProtected: inheritance.canonicalProtected.count, sourcesUnchanged: inheritance.sourcesUnchanged }, sourceClosure: sourceClosure().hash,
    reproduction: { population: 'v33 acceptance seeds 271828..271839 (identical)', STRONG_v1: strong, summary: Object.values(strong).reduce((m, r) => ({ ...m, [r.result]: (m[r.result] ?? 0) + 1 }), {}) },
    reference: { status: witness.status, kind: witness.kind, parameters: witness.parameters, result: witness.result, ticks: witness.ticks, health: witness.health, replayVerified: witness.replayVerified, actionTypes: witness.actionTypes },
    strongTrace: { seed: V33_SEED, result: v1.result, ticks: v1.ticks, finalMaxX: r3(finalMax), stall, firstLeftTurn: firstLeft ? { tick: firstLeft.tick, x: firstLeft.x, reason: firstLeft.reason } : null, window96to124: v1.trace.filter((r) => r.tick >= 96 && r.tick <= 124).map(({ tick, x, y, vx, grounded, action, reason, events }) => ({ tick, x, y, vx, grounded, action, reason, events })) },
    firstMeaningfulDivergence: { strongTick: divergeTick, strongX: r3(finalMax), witnessTickAtSameX: witnessPass?.tick ?? null, witnessActionsAround100to150: witnessAround, note: 'before this point both trajectories run right; after it STRONG never exceeds this x while the witness continues and wins at t' + (witness.ticks ?? '—') },
    candidatesAtStall, v2CopyEquivalence: { seed271828Tier1: equivalentActions, twelveSeedsTier1: equivalence12, tiers2and3: equivalenceTiers },
    classification, repairedCandidateOnV33Seed: { result: v2.result, ticks: v2.ticks, health: v2.health, replayVerified: v2replay, approachDecisions: v2.trace.filter((r) => /APPROACH_UNTIL_CLEARABLE/.test(r.reason)).length, firstApproach: v2.trace.find((r) => /APPROACH_UNTIL_CLEARABLE/.test(r.reason)) ?? null },
    authority: 'R0', mechanicsChanged: false };
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { assertSoleWriter(); const out = forensics(); writeExclusive(resolve(LANE, 'evidence/platformer-forensics.json'), out); console.log(JSON.stringify({ reproduction: out.reproduction.summary, reference: { result: out.reference.result, ticks: out.reference.ticks }, stall: out.strongTrace.stall, divergence: out.firstMeaningfulDivergence.strongTick, candidates: out.candidatesAtStall && { anyCleared: out.candidatesAtStall.anyCleared, decided: out.candidatesAtStall.decided, top: out.candidatesAtStall.top.slice(0, 3) }, equivalence: out.v2CopyEquivalence, classification: out.classification.class, confirmed: out.classification.confirmed, repaired: out.repairedCandidateOnV33Seed }, null, 1)); }
