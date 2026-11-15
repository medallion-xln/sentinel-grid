#!/usr/bin/env node
// Phase 0: reproduce and instrument the recorded failures on the INCUMBENT v1 engine (legacy/games-v1.mjs), before any v2 change.
// Output: results/phase0-reproduction.json (traces summarised + every issue classified). Diagnostic only.
import { writeFileSync, mkdirSync } from 'node:fs';
import * as v1 from '../legacy/games-v1.mjs';
import { primeDecision } from '../prime.mjs';

const out = new URL('../results/', import.meta.url); mkdirSync(out, { recursive: true });
const CLASSES = ['POLICY', 'PHYSICS', 'SCORING', 'ACTION_SEMANTICS', 'OPPONENT', 'OBSERVABILITY'];
const share = (n, d) => d ? Math.round(n / d * 1000) / 1000 : null;
function trace(game, seed, policy, limit = 4000) {
  let s = v1.createGame(game, { seed }); const rows = [];
  while (!s.terminal && s.tick < limit) {
    const d = policy(s), next = v1.stepGame(s, d.action);
    const top = d.ranking?.[0]?.value, tied = d.ranking ? d.ranking.filter(r => Math.abs(r.value - top) < 1e-9).map(r => r.action) : null;
    rows.push({ tick: s.tick, action: d.action, q: d.ranking?.find(r => r.action === d.action)?.value ?? null, tiedTop: tied, events: next.events,
      obs: game === 'platformer' ? { x: s.x, y: s.y, vx: s.vx, grounded: s.grounded } : game === 'fighter' ? { d: s.enemyX - s.x, enemy: s.enemyStance } : game === 'pong' ? { ball: { ...s.ball }, paddle: s.playerY } : { distance: s.distance, lane: s.lane, speed: s.speed, curve: v1.trackAt(s.distance).curve } });
    s = next;
  }
  return { final: s, rows };
}
const prime = s => primeDecision(s, v1);
const issues = [], evidence = {};

// --- Side scroller ---
{
  const runs = [1, 2, 3].map(seed => ({ seed, ...trace('platformer', seed, prime) }));
  const r = runs[0], acts = r.rows.map(x => x.action), deaths = r.rows.filter(x => x.events.includes('FALL_CHECKPOINT_RESET'));
  const airborneJump = r.rows.filter(x => !x.obs.grounded && x.action === 'JUMP_RIGHT').length, airborne = r.rows.filter(x => !x.obs.grounded).length;
  const tieJM = r.rows.filter(x => x.tiedTop?.includes('JUMP_RIGHT') && x.tiedTop?.includes('MOVE_RIGHT')).length;
  const tieAllDoomed = deaths.map(dd => r.rows.find(x => x.tick === dd.tick)).filter(x => x.tiedTop && x.tiedTop.length >= 4).length;
  evidence.platformer = { seeds: runs.map(x => ({ seed: x.seed, result: x.final.result, maxProgress: x.final.metrics.maxProgress, deaths: x.final.metrics.deaths, gaps: x.final.gaps })),
    jumpRightShare: share(acts.filter(a => a === 'JUMP_RIGHT').length, acts.length), jumpRightWhileAirborneShare: share(airborneJump, airborne),
    jumpRightMoveRightTiedAtTop: share(tieJM, r.rows.length), deathPositions: deaths.map(x => ({ tick: x.tick, x: Math.round(x.obs.x * 100) / 100, action: x.action })),
    deathTicksAllActionsTied: tieAllDoomed, respawnX: r.final.checkpoint, actionSequenceBeforeFirstDeath: acts.slice(Math.max(0, (deaths[0]?.tick ?? 20) - 20), deaths[0]?.tick ?? 20) };
  const sameDeath = new Set(deaths.map(x => Math.round(x.obs.x))).size === 1;
  issues.push(
    { game: 'platformer', id: 'PLAT-1', class: 'POLICY', issue: 'One-step root PUCT ranks only the immediate effect; JUMP_RIGHT and MOVE_RIGHT tie at the top, so it pogo-jumps continuously.', evidence: `JUMP_RIGHT share ${evidence.platformer.jumpRightShare}; JUMP_RIGHT/MOVE_RIGHT tied at top on ${evidence.platformer.jumpRightMoveRightTiedAtTop} of ticks` },
    { game: 'platformer', id: 'PLAT-2', class: 'ACTION_SEMANTICS', issue: 'JUMP_RIGHT while airborne is offered as legal and silently behaves as MOVE_RIGHT (no grounded/airborne distinction in the legal set).', evidence: `JUMP_RIGHT chosen on ${evidence.platformer.jumpRightWhileAirborneShare} of airborne ticks` },
    { game: 'platformer', id: 'PLAT-3', class: 'SCORING', issue: 'The fall penalty arrives only on the death tick, after the trajectory is already committed, so a one-step search sees all actions equal when it matters.', evidence: `${tieAllDoomed}/${deaths.length} death ticks had >=4 actions tied` },
    { game: 'platformer', id: 'PLAT-4', class: 'PHYSICS', issue: 'Checkpoint 64 is set only while grounded past x=64; continuous jumping never grounds there, so every fall respawns at x=4 (the ~44% progress ceiling).', evidence: `respawn x=${r.final.checkpoint}; max progress ${r.final.metrics.maxProgress.toFixed(4)}` },
    { game: 'platformer', id: 'PLAT-5', class: 'POLICY', issue: 'No failure memory: identical deterministic deaths repeat at the same position with the same action sequence.', evidence: `death x positions ${deaths.map(x => Math.round(x.obs.x)).join(',')}; identical=${sameDeath}` },
    { game: 'platformer', id: 'PLAT-6', class: 'OBSERVABILITY', issue: 'Telemetry shows only the next gap; no landing region, trajectory, failure signature or retry state is exposed.', evidence: 'stateLines(platformer) v1' },
    { game: 'platformer', id: 'PLAT-7', class: 'SCORING', issue: 'Seed variety is weak (4 gap offsets) so seeds 1 and 3 produce identical runs.', evidence: `seed1 vs seed3 identical progress: ${runs[0].final.metrics.maxProgress === runs[2].final.metrics.maxProgress}` },
  );
}
// --- Pong ---
{
  const reactive = s => ({ action: Math.abs(s.ball.y - s.playerY) < .8 ? 'HOLD' : s.ball.y < s.playerY ? 'UP' : 'DOWN' });
  const analytic = s => ({ action: v1.baselineAction(s) });
  const res = {};
  for (const [name, p] of [['reactive', reactive], ['analytic', analytic], ['incumbentRootPuct', prime]]) for (const seed of [1, 2]) {
    const r = trace('pong', seed, p, name === 'incumbentRootPuct' ? 1200 : 3000);
    res[`${name}_seed${seed}`] = { ticks: r.final.tick, score: r.final.score, returns: r.final.metrics.returns, misses: r.final.metrics.misses, movedTicks: r.rows.filter(x => x.action !== 'HOLD').length,
      agreesWithAnalytic: name === 'incumbentRootPuct' ? share(r.rows.filter(x => { const s = { ...x.obs, ball: x.obs.ball, playerY: x.obs.paddle, game: 'pong', height: 32 }; const y = v1.pongIntercept(s) ?? 16; const a = Math.abs(y - x.obs.paddle) < .8 ? 'HOLD' : y < x.obs.paddle ? 'UP' : 'DOWN'; return a === x.action; }).length, r.rows.length) : null };
  }
  evidence.pong = res;
  issues.push(
    { game: 'pong', id: 'PONG-1', class: 'SCORING', issue: 'The shaped reward contains the analytic intercept (pongIntercept of the true state): one-step search inherits the reward designer\'s prediction, so "prediction" is future-state leakage, not Sentinel inference.', evidence: `root PUCT agrees with the analytic-intercept rule on ${res.incumbentRootPuct_seed1.agreesWithAnalytic} of ticks` },
    { game: 'pong', id: 'PONG-2', class: 'OPPONENT', issue: 'Neither side misses: a purely reactive follower returns every ball, so early prediction has no measurable return-rate value and scores stay 0-0.', evidence: `reactive misses ${res.reactive_seed1.misses}, analytic misses ${res.analytic_seed1.misses}, scores ${JSON.stringify(res.reactive_seed1.score)} / ${JSON.stringify(res.analytic_seed1.score)} over 3000 ticks` },
    { game: 'pong', id: 'PONG-3', class: 'OBSERVABILITY', issue: 'Observation is the exact true ball state; the projected intercept is drawn from privileged state with no uncertainty, and "prediction error" measures the formula, not a controller.', evidence: 'meanPredictionError metric in v1' },
    { game: 'pong', id: 'PONG-4', class: 'PHYSICS', issue: 'Spin acts only at contact (no in-flight curvature), so a straight-line projection is near-exact and there is no prediction problem beyond reflection.', evidence: 'v1 pong(): vy changes only at paddle contact' },
  );
}
// --- Fighter ---
{
  const res = [];
  for (const seed of [1, 3]) {
    const r = trace('fighter', seed, prime, 600), act = r.rows.filter(x => x.tiedTop);
    const far = r.rows.filter(x => x.obs.d > 11), farBlock = far.filter(x => x.action === 'BLOCK').length;
    res.push({ seed, result: r.final.result, dealt: r.final.metrics.dealt, tieRate: share(act.filter(x => x.tiedTop.length > 1).length, act.length), sevenWayTies: act.filter(x => x.tiedTop.length >= 7).length,
      longRangeBlockShare: share(farBlock, far.length), minDistance: Math.min(...r.rows.map(x => x.obs.d)), actionCounts: r.rows.reduce((m, x) => (m[x.action] = (m[x.action] ?? 0) + 1, m), {}) });
  }
  evidence.fighter = res;
  issues.push(
    { game: 'fighter', id: 'FIGHT-1', class: 'SCORING', issue: 'Attack damage resolves after windup, beyond the one-step horizon; BLOCK, attacks and movement tie at -0.005 regardless of distance.', evidence: `tie rate ${res.map(r => r.tieRate).join(' / ')}; 7-way ties ${res.map(r => r.sevenWayTies).join(' / ')}` },
    { game: 'fighter', id: 'FIGHT-2', class: 'POLICY', issue: 'Ties are broken by ranking order, which puts BLOCK first: it blocks from long range and can stall to TIMEOUT with zero damage.', evidence: `long-range BLOCK share ${res.map(r => r.longRangeBlockShare).join(' / ')}; seed3 result ${res[1].result} dealt ${res[1].dealt}` },
    { game: 'fighter', id: 'FIGHT-3', class: 'PHYSICS', issue: 'No vertical position or facing: JUMP is a stance, x is clamped to enemyX-2 so fighters can never cross; no hitboxes, startup/active/recovery frames, hit-stun or knockback.', evidence: `min distance ${res.map(r => r.minDistance).join(' / ')}` },
    { game: 'fighter', id: 'FIGHT-4', class: 'OPPONENT', issue: 'Opponent uses different movement rules (approach speed 1+0.3d, no jump) and coin-flip attack/block choices independent of spacing.', evidence: 'v1 fighter(): enemy branch' },
    { game: 'fighter', id: 'FIGHT-5', class: 'ACTION_SEMANTICS', issue: 'STEP_LEFT/STEP_RIGHT are absolute; no forward/back semantics, no low block, aerial attack or crouching guard.', evidence: 'ACTIONS.fighter v1' },
  );
}
// --- Racing ---
{
  const res = [];
  for (const seed of [1, 2, 9]) {
    const r = trace('racing', seed, prime), curve = r.rows.filter(x => x.obs.curve);
    const st = v1.raceStandings(r.final);
    res.push({ seed, result: r.final.result, lapTimes: r.final.lapTimes, gaps: st.map(c => ({ id: c.id, gap: Math.round(c.gap) })), meanCurveSpeed: Math.round(curve.reduce((a, x) => a + x.obs.speed, 0) / curve.length * 100) / 100,
      rivalCornerTargets: r.final.rivals.map(c => ({ id: c.id, corner: c.corner, cruise: c.cruise, pace: Math.round(c.pace * 1000) / 1000 })) });
  }
  // v1 renderWorld drew the road with half-width max(7, 0.23 * columns), independent of the lane scale (measured 55 columns at 120).
  evidence.racing = { runs: res, roadColumnsAt120: Math.round(2 * Math.max(7, 120 * .23)), lapTimesIdenticalAcrossSeeds: res.every(r => JSON.stringify(r.lapTimes) === JSON.stringify(res[0].lapTimes)) };
  issues.push(
    { game: 'racing', id: 'RACE-1', class: 'OBSERVABILITY', issue: 'The road is drawn at 46% of the field width (~55 columns at 120) with no consistent lateral scale; lanes +/-6 map to that width.', evidence: `road columns ${evidence.racing.roadColumnsAt120}` },
    { game: 'racing', id: 'RACE-2', class: 'PHYSICS', issue: 'Curves only add speed-squared lateral drift that steering cancels; there is no grip limit or braking requirement, so the player corners at full speed.', evidence: `mean player curve speed ${res.map(r => r.meanCurveSpeed).join(' / ')} vs nominal safe 1.5` },
    { game: 'racing', id: 'RACE-3', class: 'OPPONENT', issue: 'Rivals brake to fixed corner speeds 1.55-1.95 that the physics never requires: a structural pace deficit, not a skill difference.', evidence: `final gaps ${res.map(r => r.gaps.map(g => g.id + g.gap).join(' ')).join(' | ')}` },
    { game: 'racing', id: 'RACE-4', class: 'SCORING', issue: 'The safe-speed penalty (0.1 x excess) is smaller than the progress reward (0.12 x speed), so one-step reward favours ignoring corners.', evidence: 'v1 racing() reward terms' },
    { game: 'racing', id: 'RACE-5', class: 'OPPONENT', issue: 'Seeds barely matter (pace 0.98-1.02, one fixed track): lap times are identical across seeds.', evidence: `identical across seeds: ${evidence.racing.lapTimesIdenticalAcrossSeeds}` },
  );
}
for (const i of issues) if (!CLASSES.includes(i.class)) throw Error('Unclassified issue ' + i.id);
const report = { schema: 'ASCII_WORLDS_PHASE0_REPRODUCTION_V1', engine: 'legacy/games-v1.mjs (incumbent, unchanged)', controller: 'INCUMBENT ROOT-PUCT ONE-STEP (96 simulations)', status: 'DIAGNOSTIC',
  classes: CLASSES, issues, evidence, generatedBy: 'eval/phase0-reproduce.mjs' };
writeFileSync(new URL('phase0-reproduction.json', out), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ issues: issues.map(i => `${i.id} [${i.class}] ${i.evidence}`) }, null, 2));
