import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createGame, stepGame, observe, legalActions, GAMES, ACTIONS, metricsOf, raceStandings, ENGINE_VERSION } from './games.mjs';
import { renderWorld, panels, terminalFrame, fighterSprite, combatPose, stateLines } from './render.mjs';
import { primeDecision, adapterFor, INCUMBENT_LABEL } from './prime.mjs';
import { createController, CONTROLLERS, CAPABILITY_CLASSES } from './controllers/index.mjs';
import { sha256 } from '../src/core/determinism.js';
import { createSuiteServer } from './server.mjs';
import { sourceManifest } from './provenance.mjs';
import { playbackAfter, manualAction } from './playback.mjs';
import { runEpisode, replay, runCondition, CONDITIONS } from './eval/harness.mjs';
import * as v1 from './legacy/games-v1.mjs';

const play = (s, ctrl, ticks = Infinity) => { const decisions = []; for (let i = 0; i < ticks && !s.terminal; i++) { const d = ctrl.decide(s); decisions.push(d); s = stepGame(s, d.action); } return { s, decisions }; };

test('Autoplay lifecycle: automated controllers start on ready and survive blur; manual does not', () => {
  for (const mode of ['sentinel', 'prime', 'baseline']) {
    assert.equal(playbackAfter(mode, false, 'ready'), true); assert.equal(playbackAfter(mode, true, 'blur'), true);
    assert.equal(playbackAfter(mode, false, 'blur'), false); assert.equal(playbackAfter(mode, true, 'terminal'), false);
  }
  assert.equal(playbackAfter('manual', false, 'ready'), false); assert.equal(playbackAfter('manual', true, 'blur'), false);
});

for (const game of GAMES) {
  test(`${game}: deterministic replay, immutable step, legal-action audit, rectangular printable ASCII`, () => {
    let a = createGame(game, { seed: 42, difficulty: 3 }), b = structuredClone(a);
    for (let i = 0; i < 160 && !a.terminal; i++) {
      const action = ACTIONS[game][i % ACTIONS[game].length], before = sha256(a);
      a = stepGame(a, action); b = stepGame(b, action); assert.equal(sha256(a), sha256(b)); assert.notEqual(sha256(a), before);
      assert.ok(Number.isFinite(a.reward)); assert.equal(a.audit.requested, action); assert.ok(ACTIONS[game].includes(a.audit.applied));
    }
    for (const [cols, rows] of [[120, 44], [80, 24], [200, 60]]) {
      const lines = renderWorld(a, cols, rows).split('\n');
      assert.equal(lines.length, rows); assert.ok(lines.every(l => l.length === cols)); assert.match(lines.join('\n'), /^[\x20-\x7e\n]+$/);
    }
    const initial = createGame(game), before = sha256(initial); stepGame(initial, ACTIONS[game][0]); assert.equal(sha256(initial), before);
    assert.throws(() => stepGame(initial, 'DISPATCH'), /Illegal action/);
    assert.ok(legalActions(initial).every(x => ACTIONS[game].includes(x)));
    const frame = terminalFrame(initial, null, 80, 24).split('\n'); assert.equal(frame.length, 24); assert.ok(frame.every(l => l.length === 80));
  });
  test(`${game}: observation boundary excludes RNG, hidden parameters and future state`, () => {
    const s = createGame(game, { seed: 5, difficulty: 5 }), text = JSON.stringify(observe(s));
    for (const hidden of ['"rng"', '"seed"', 'driver', 'habits', 'reactionBuffer', 'obsBuffer', 'aimWins', '"spin"', '"vx":', 'opponentScript']) {
      if (game === 'platformer' && hidden === '"vx":') continue; // own body velocity is observable
      if (game === 'fighter' && hidden === '"vx":') continue;    // fighter bodies' velocities are visible motion
      assert.ok(!text.includes(hidden), `${game} observation leaks ${hidden}`);
    }
    if (game === 'platformer') assert.ok(observe(s).windZones.every(z => z.strength === null));
  });
  test(`${game}: incumbent root-PUCT is unchanged, labelled one-step, legal, deterministic and non-mutating`, () => {
    const s = createGame(game, { seed: 7 }), before = sha256(s), r = primeDecision(s), again = primeDecision(s);
    assert.equal(sha256(s), before); assert.ok(legalActions(s).includes(r.action)); assert.equal(r.recommendationHash, again.recommendationHash);
    assert.equal(r.horizon, 'ONE_STEP'); assert.equal(r.controller, INCUMBENT_LABEL); assert.equal(r.confidence, null);
    assert.equal(adapterFor(game).manifest().authority.tier, 'R0'); assert.equal(adapterFor(game).manifest().authority.executionInterface, false);
    assert.equal(r.ranking.reduce((n, row) => n + row.visits, 0), 96);
  });
  test(`${game}: every controller is legal, declares access/capability, and returns NO_ACTION_TERMINAL after a terminal outcome`, () => {
    for (const kind of CONTROLLERS[game].filter(k => k !== 'INCUMBENT_ROOT_PUCT')) {
      const c = createController(game, kind, { seed: 3 }); assert.ok(CAPABILITY_CLASSES.includes(c.capability)); assert.ok(['OBSERVATION_ONLY', 'KNOWN_SIMULATOR_DIAGNOSTIC'].includes(c.access));
      const { s, decisions } = play(createGame(game, { seed: 3, difficulty: 2 }), c, 60);
      assert.ok(decisions.every(d => d.legal), `${kind} produced an illegal action`);
      const t = structuredClone(s); t.terminal = true; t.result = 'WIN';
      assert.equal(c.decide(t).action, 'NO_ACTION_TERMINAL');
      const p = panels(t, decisions.at(-1), { lastPreterminal: decisions.at(-1) });
      assert.ok(p.diagnostic.includes('ACTION=NO_ACTION_TERMINAL')); assert.ok(p.decision[0] === 'recommended=NO_ACTION_TERMINAL');
      assert.ok(p.diagnostic.some(l => l.startsWith('last preterminal recommendation=')));
    }
  });
  test(`${game}: five difficulty levels change the world`, () => {
    const hashes = new Set([1, 2, 3, 4, 5].map(difficulty => { const s = createGame(game, { seed: 11, difficulty }); return sha256(game === 'fighter' ? [s.difficulty] : observe(s)); }));
    assert.equal(hashes.size, 5); assert.throws(() => createGame(game, { difficulty: 6 }));
  });
}

test('Phase 0: the incumbent v1 side-scroller failure still reproduces (~44% progress, identical deaths)', () => {
  let s = v1.createGame('platformer', { seed: 1 }); const deaths = [];
  while (!s.terminal) { s = v1.stepGame(s, primeDecision(s, v1).action); if (s.events.includes('FALL_CHECKPOINT_RESET')) deaths.push(Math.round(s.metrics.maxProgress * 1000)); }
  assert.equal(s.result, 'LOSS'); assert.ok(Math.abs(s.metrics.maxProgress - .4406) < .001); assert.equal(s.checkpoint, 4); assert.equal(deaths.length, 3);
});

// ---------------- Side scroller ----------------
test('Side scroller: airborne jumps are illegal and audited; held jump rises higher than a released jump; checkpoints activate when passed', () => {
  let s = createGame('platformer', { seed: 2 }); s = stepGame(s, 'JUMP_RIGHT');
  assert.equal(s.grounded, false); assert.ok(legalActions(s).includes('JUMP_RIGHT'), 'holding jump while rising is legal');
  let held = s, cut = s; for (let i = 0; i < 6; i++) { held = stepGame(held, 'JUMP_RIGHT'); cut = stepGame(cut, 'MOVE_RIGHT'); }
  assert.ok(held.y < cut.y - 2, 'variable jump height');
  while (held.vy < 0) held = stepGame(held, 'MOVE_RIGHT');
  assert.ok(!legalActions(held).includes('JUMP_RIGHT')); const audited = stepGame(held, 'JUMP_RIGHT');
  assert.equal(audited.audit.legal, false); assert.equal(audited.audit.applied, 'MOVE_RIGHT'); assert.equal(audited.metrics.illegalRequests, 1);
  s = createGame('platformer', { seed: 2 }); s.x = s.checkpoints[2] + 1.5; s.y = 20; s.grounded = false; s = stepGame(s, 'MOVE_RIGHT');
  assert.equal(s.checkpoint, s.checkpoints[2], 'a checkpoint passed in the air still activates');
});
test('Side scroller gameplay: Sentinel completes difficulty 1-3 levels; offline check proves difficulty 1-5 levels solvable', async () => {
  const { offlineGapSolvability } = await import('./worlds/platformer.mjs');
  for (const difficulty of [1, 2, 3, 4, 5]) for (let seed = 400; seed < 440; seed++) assert.ok(offlineGapSolvability(createGame('platformer', { seed, difficulty })).every(g => g.solvable), `d${difficulty} seed${seed}`);
  for (const [seed, difficulty] of [[11, 1], [12, 2], [13, 3]]) {
    const { s } = play(createGame('platformer', { seed, difficulty }), createController('platformer', 'SENTINEL'));
    assert.equal(s.result, 'WIN', `seed ${seed} d${difficulty}`); assert.ok(metricsOf(s).progressPerLife > .3);
  }
});
test('Side scroller gameplay: no-memory ablation repeats the identical wind-gap death; memory retries a different strategy and completes', () => {
  const base = { game: 'platformer', seed: 1, difficulty: 4 };
  const ablation = runEpisode({ ...base, controller: 'SENTINEL_NO_MEMORY' }), adaptive = runEpisode({ ...base, controller: 'SENTINEL' });
  assert.equal(ablation.result, 'LOSS'); assert.ok(ablation.metrics.repeatedDeaths >= 3); assert.ok(ablation.controllerMetrics.adaptationTriggers.REPEATED_FAILURE_DETECTED_NO_MEMORY >= 1);
  assert.equal(adaptive.result, 'WIN'); assert.ok(adaptive.controllerMetrics.adaptationTriggers.FAILURE_RETRY >= 1); assert.equal(adaptive.metrics.repeatedDeaths, 0);
  const failure = adaptive.memory.failures[0];
  assert.equal(failure.cause, 'FALL'); assert.equal(failure.sectionType, 'WIND_GAP'); assert.ok(failure.observedDrift > .2, 'residual drift recorded in the failure signature');
  assert.ok(failure.actionSequence.length >= 6 && failure.position.length === 2 && failure.velocity.length === 2);
  assert.notEqual(adaptive.memory.strategies[failure.section], failure.strategy, 'retry strategy differs from the failed one');
  // The exact action sequence reproduces the outcome.
  assert.equal(sha256(replay(base, adaptive.actions)), adaptive.finalStateHash);
});
test('Side scroller gameplay: an impossible gap triggers REPEATED_FAILURE_DETECTED, a strategy comparison and several genuinely different retries', () => {
  const mutate = s => { const z = s.wind[0] ?? null; const gap = s.gaps[0]; if (z) z.strength = 1.4; else s.wind.push({ x0: gap[0], x1: gap[1] + 1, strength: 1.4 }); };
  const r = runEpisode({ game: 'platformer', controller: 'SENTINEL', seed: 1, difficulty: 4, mutate });
  assert.equal(r.result, 'LOSS'); assert.ok(r.controllerMetrics.adaptationTriggers.REPEATED_FAILURE_DETECTED >= 1);
  assert.ok(r.controllerMetrics.uniqueRetryStrategies >= 3, JSON.stringify(r.controllerMetrics.retryStrategies));
  const takeoffs = new Set(r.memory.failures.map(f => f.takeoffX)), sequences = new Set(r.memory.failures.map(f => f.actionSequence.join(',')));
  assert.ok(takeoffs.size + sequences.size >= 4, 'retries executed different trajectories');
  let s = createGame('platformer', { seed: 1, difficulty: 4 }); mutate(s); const c = createController('platformer', 'SENTINEL'); let compared = null;
  while (!s.terminal && !compared) { const d = c.decide(s); if (d.comparison) compared = d.comparison; s = stepGame(s, d.action); }
  assert.ok(compared && compared.length >= 5 && compared.every(x => 'safe' in x && 'predictedLandingX' in x));
});
test('Side scroller gameplay: stagnation at an unclearable wall triggers an explicit replan', () => {
  const mutate = s => { s.walls = [[30, 31, 2]]; s.gaps = s.gaps.filter(g => g[0] > 40); };
  const r = runEpisode({ game: 'platformer', controller: 'SENTINEL', seed: 3, difficulty: 1, mutate, maxTicks: 400 });
  assert.ok(r.controllerMetrics.adaptationTriggers.STAGNATION_REPLAN >= 1);
});

// ---------------- Pong ----------------
test('Pong: no future-state leakage; delayed/noisy band lags the true ball; spin curves the flight; reward has no intercept term', () => {
  let s = createGame('pong', { seed: 4, difficulty: 4 });
  for (let i = 0; i < 20; i++) s = stepGame(s, 'HOLD');
  const o = observe(s); assert.equal(o.ball.tick, s.tick - 3); assert.ok(!('vx' in o.ball) && !('vy' in o.ball));
  assert.ok(Math.hypot(o.ball.x - s.ball.x, o.ball.y - s.ball.y) > .5);
  let c = createGame('pong', { seed: 4, difficulty: 3 }); c.ball.spin = .04; const vy0 = c.ball.vy; c = stepGame(c, 'HOLD'); assert.ok(Math.abs(c.ball.vy - vy0) > .03, 'in-flight curvature');
  const r = createGame('pong', { seed: 4, difficulty: 2 }); assert.ok(Math.abs(stepGame(r, 'UP').reward - stepGame(r, 'HOLD').reward + .01) < 1e-9, 'moving costs only the movement penalty');
});
test('Pong gameplay: filtered prediction beats the analytic baseline under delayed/noisy observation, not on constant velocity', () => {
  const runs = (controller, difficulty) => [1, 2, 3].map(seed => runEpisode({ game: 'pong', controller, seed, difficulty, keepActions: false }));
  const rate = rs => rs.reduce((a, r) => a + r.metrics.returnRate, 0) / rs.length;
  const s4 = runs('SENTINEL_FILTER_ONLY', 4), a4 = runs('ANALYTIC_INTERCEPT', 4), s1 = runs('SENTINEL_FILTER_ONLY', 1), a1 = runs('ANALYTIC_INTERCEPT', 1);
  assert.ok(rate(s4) > rate(a4) + .2, `band4 ${rate(s4)} vs ${rate(a4)}`); assert.ok(Math.abs(rate(s1) - rate(a1)) < .05);
  assert.ok(s4.every(r => r.controllerMetrics.calibrationCoverage2Sigma > .8), 'intervals cover the actual crossing');
  assert.ok(a4.every(r => r.controllerMetrics.calibrationCoverage1Sigma === null), 'analytic baseline reports no uncertainty');
});

// ---------------- Fighter ----------------
const fight = (setup, ticks, kind = 'SENTINEL') => { let s = createGame('fighter', { seed: 1, difficulty: 3 }); setup(s); const c = createController('fighter', kind), events = [], actions = [];
  for (let i = 0; i < ticks && !s.terminal; i++) { const d = c.decide(s); actions.push(d.action); s = stepGame(s, d.action); events.push(...s.events); } return { s, events, actions }; };
test('Fighter physics: jump passes over a standing opponent, facing reverses after landing, both fighters share physics', async () => {
  const { newFighter, fightTick } = await import('./worlds/fighter.mjs');
  const w = { fighters: [newFighter(50, 1), newFighter(60, -1)] }, ev = [];
  for (let t = 0; t < 26; t++) ev.push(...fightTick(w, [t === 0 ? 'JUMP_FORWARD' : 'WAIT', 'WAIT']));
  assert.ok(ev.some(e => e.type === 'CROSSED_OVER')); assert.ok(w.fighters[0].x > w.fighters[1].x); assert.equal(w.fighters[0].facing, -1); assert.equal(w.fighters[1].facing, 1);
  for (const [atk, def] of [[0, 1], [1, 0]]) { const m = { fighters: [newFighter(50, 1), newFighter(56, -1)] }; let dmg = 0;
    for (let t = 0; t < 6; t++) for (const e of fightTick(m, atk === 0 ? [t ? 'WAIT' : 'LIGHT_ATTACK', 'WAIT'] : ['WAIT', t ? 'WAIT' : 'LIGHT_ATTACK'])) if (e.type === 'HIT') dmg = e.damage;
    assert.equal(dmg, 6); assert.equal(m.fighters[def].health, 94); }
});
test('Fighter scenario: Sentinel jumps over a perfect-guard opponent and hits from the opposite side, then lands and turns', () => {
  const { events, s } = fight(s => { s.fighters[0].x = 50; s.fighters[1].x = 62; s.opponentScript = { mode: 'PERFECT_GUARD' }; }, 80);
  assert.ok(events.includes('PLAYER_JUMP_OVER')); assert.ok(events.some(e => e.includes('_HIT_FROM_BEHIND'))); assert.ok(events.includes('PLAYER_TURNED')); assert.ok(s.fighters[1].health < 100);
});
test('Fighter scenario: Sentinel punishes a missed heavy attack', () => {
  const { events } = fight(s => { s.fighters[0].x = 50; s.fighters[1].x = 63.5; s.opponentScript = { mode: 'SEQUENCE', actions: ['HEAVY_ATTACK'], then: 'WAIT' }; }, 30);
  assert.ok(events.includes('OPPONENT_WHIFF_HEAVY_ATTACK')); assert.ok(events.some(e => e.startsWith('PLAYER_') && e.includes('_HIT_PUNISH')));
});
test('Fighter scenario: Sentinel blocks a predictable low attack and counters', () => {
  const { events } = fight(s => { s.fighters[0].x = 50; s.fighters[1].x = 57; s.opponentScript = { mode: 'SEQUENCE', actions: ['LOW_ATTACK'], then: 'WAIT' }; }, 30);
  const blocked = events.indexOf('PLAYER_BLOCKED_LOW_ATTACK'), counter = events.findIndex(e => e.startsWith('PLAYER_') && e.includes('_HIT_PUNISH'));
  assert.ok(blocked >= 0 && counter > blocked);
});
test('Fighter scenario: Sentinel approaches from long range instead of blocking', () => {
  const { actions, s } = fight(s => { s.opponentScript = { mode: 'SEQUENCE', actions: [], then: 'WAIT' }; }, 30);
  assert.ok(!actions.some(a => a.startsWith('BLOCK'))); assert.ok(Math.abs(s.fighters[1].x - s.fighters[0].x) < 25);
});
test('Fighter scenario: light versus heavy follows spacing and the vulnerability window', () => {
  const decide = (move, t, d) => { const s = createGame('fighter', { seed: 1, difficulty: 3 }); s.fighters[0].x = 50; s.fighters[1].x = 50 + d; s.fighters[1].move = { name: move, phase: 'RECOVERY', t, contacted: false };
    s.opponentScript = { mode: 'SEQUENCE', actions: [], then: 'WAIT' }; return createController('fighter', 'SENTINEL').decide(s).action; };
  assert.equal(decide('LIGHT_ATTACK', 3, 6), 'LIGHT_ATTACK', 'short window, close: only the fast light fits');
  assert.equal(decide('HEAVY_ATTACK', 14, 10.5), 'HEAVY_ATTACK', 'long window, beyond light range: heavy reaches');
});
test('Fighter gameplay: Sentinel does not tie guard, attack and movement while the one-step incumbent mostly does', () => {
  const rs = runEpisode({ game: 'fighter', controller: 'SENTINEL', seed: 2, difficulty: 3, style: 'AGGRESSIVE' });
  const ri = runEpisode({ game: 'fighter', controller: 'INCUMBENT_ROOT_PUCT', seed: 2, difficulty: 3, style: 'AGGRESSIVE', maxTicks: 150 });
  assert.ok(rs.controllerMetrics.crossCategoryTieRate < .05, String(rs.controllerMetrics.crossCategoryTieRate)); assert.ok(ri.controllerMetrics.crossCategoryTieRate > .5, String(ri.controllerMetrics.crossCategoryTieRate));
  assert.equal(rs.metrics.longRangeBlockTicks, 0);
});
test('Fighter sprites: thirteen distinct articulated poses, mirrored by facing', () => {
  const poses = ['READY', 'WALK', 'PUNCH', 'PUNCH_WINDUP', 'KICK', 'KICK_WINDUP', 'GUARD', 'LOW_GUARD', 'JUMP', 'AIR_KICK', 'CROUCH', 'SWEEP', 'HURT', 'RECOVER', 'TURN', 'KO'];
  assert.equal(new Set(poses.map(p => fighterSprite(p).join('\n'))).size, poses.length);
  for (const p of poses) { const sp = fighterSprite(p, 'E', true); assert.equal(sp.length, 11); assert.ok(sp.every(r => r.length === 13)); }
  let s = createGame('fighter'); s = stepGame(s, 'BLOCK_LOW'); assert.equal(combatPose(s), 'LOW_GUARD');
});

// ---------------- Racing ----------------
test('Racing: road is 18 columns at 1 column per lateral unit for any field width; grip limit forces braking; barriers stop cars', async () => {
  const { carStep, newCar, CAR, ruleDriver, previewFor } = await import('./worlds/racing.mjs');
  for (const cols of [80, 120, 200]) { const row = renderWorld(createGame('racing', { seed: 3 }), cols, 40).split('\n')[5]; assert.equal(row.lastIndexOf('|') - row.indexOf('|'), 19); }
  const hairpin = { lapLength: 1e9, segments: [{ id: 0, name: 'STRAIGHT', kappa: 0, start: 0, length: 120, wet: false }, { id: 1, name: 'HAIRPIN', kappa: .06, start: 120, length: 400, wet: false }] };
  const fast = newCar('X', 'X', 0, 0), driven = newCar('Y', 'Y', 0, 0); fast.v = 2.6; driven.v = 2.6;
  const params = { skill: .93, brakeMargin: 1, line: 0, lane: 0, gain: .9, defend: false };
  for (let t = 0; t < 140; t++) { carStep(fast, fast.s < 120 ? 'HOLD' : 'TURN_LEFT', hairpin); carStep(driven, ruleDriver(driven, { preview: previewFor(hairpin, driven.s, 160), traffic: [], grip: CAR.grip }, params), hairpin); }
  assert.ok(fast.offTicks > 0 && fast.barrierHits > 0, 'above the grip limit full lock still runs wide into the barrier');
  assert.equal(driven.offTicks, 0, 'braking to the grip-limited speed keeps the car on the road'); assert.ok(driven.v < Math.sqrt(CAR.grip / .06));
  assert.ok(Math.abs(fast.n) <= CAR.barrier);
});
test('Racing gameplay: rivals run the same physics, never teleport, and the rule-based racer finishes among them (no structural pace deficit)', () => {
  for (const seed of [21, 22, 23]) {
    let s = createGame('racing', { seed, difficulty: 3 }); const c = createController('racing', 'RULE_BASED'), prev = s.rivals.map(r => r.s);
    while (!s.terminal) { s = stepGame(s, c.decide(s).action); s.rivals.forEach((r, i) => { assert.ok(r.s - prev[i] <= r.v * 2.9 + 1e-9 && r.s >= prev[i] - 1e-9, 'no teleport'); prev[i] = r.s; }); }
    const ticks = [s.player.finishedTick, ...s.rivals.map(r => r.finishedTick ?? s.tick)], spread = Math.max(...ticks) - Math.min(...ticks);
    assert.ok(spread < .12 * s.player.finishedTick, `seed ${seed}: finish spread ${spread} of ${s.player.finishedTick}`);
  }
});
test('Racing gameplay: Sentinel MPC finishes difficulty 3 races without barrier hits and exposes curvature/grip/gap information', async () => {
  const { racingInfo } = await import('./controllers/racing.mjs');
  const r = runEpisode({ game: 'racing', controller: 'SENTINEL', seed: 31, difficulty: 3 });
  assert.match(r.result, /FINISH_PLACE_/); assert.equal(r.metrics.barrierHits, 0);
  const info = racingInfo(observe(createGame('racing', { seed: 31, difficulty: 3 })));
  for (const k of ['nextCorner', 'brakingDistance', 'speed', 'gripUsage', 'nearestAhead', 'overtakeOpportunity', 'offTrackRisk']) assert.ok(k in info);
});

// ---------------- Harness, replay and HTTP ----------------
test('Harness: every Phase 5 condition runs and repeated deterministic controllers repeat exactly (repetition is not learning)', () => {
  for (const condition of CONDITIONS) { const eps = runCondition({ game: 'platformer', controller: 'RULE_BASELINE', seed: 5, difficulty: 2, condition, heldOutSeed: 99001, maxTicks: 300 }); assert.ok(eps.length >= 1); }
  const [a, b] = runCondition({ game: 'platformer', controller: 'RULE_BASELINE', seed: 5, difficulty: 2, condition: 'REPEATED_SIMILAR', heldOutSeed: 99001 });
  assert.equal(a.actionSequenceHash, b.actionSequenceHash); assert.equal(a.finalStateHash, b.finalStateHash);
});
test('HTTP lifecycle: modes, source-tick decisions, NO_ACTION_TERMINAL, V2 replay export, illegal action and cross-origin isolation', async () => {
  const server = createSuiteServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = 'http://127.0.0.1:' + server.address().port;
  const post = (path, body, origin) => fetch(root + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  try {
    const page = await (await fetch(root)).text(); assert.match(page, /value="sentinel" selected/); assert.match(page, /ROOT-PUCT \(ONE-STEP, INCUMBENT\)/);
    for (const f of ['/playback.mjs', '/worlds/pong.mjs', '/worlds/racing.mjs']) assert.equal((await fetch(root + f)).status, 200);
    assert.equal((await fetch(root + '/../../package.json')).status, 404);
    const start = await (await post('/api/reset', { game: 'platformer', config: { seed: 9, difficulty: 2 } })).json();
    assert.equal((await post('/api/step', { id: start.id, mode: 'manual', action: 'ATTACK' })).status, 400);
    assert.equal((await post('/api/step', { id: start.id, mode: 'manual', action: 'WAIT' }, 'https://attacker.test')).status, 403);
    const preview = await (await post('/api/decision', { id: start.id, mode: 'sentinel' })).json();
    const stepped = await (await post('/api/step', { id: start.id, mode: 'sentinel' })).json();
    assert.equal(stepped.decision.action, preview.decision.action); assert.equal(stepped.decision.sourceTick, 0); assert.equal(stepped.state.tick, 1);
    for (const mode of ['prime', 'baseline', 'manual']) assert.equal((await post('/api/step', { id: start.id, mode, action: 'MOVE_RIGHT' })).status, 200);
    const replayed = await (await fetch(root + '/api/export?id=' + start.id)).json();
    assert.equal(replayed.schema, 'SENTINEL_ASCII_EVALUATION_REPLAY_V2'); assert.equal(replayed.engine, ENGINE_VERSION); assert.equal(replayed.certificate, null);
    let st = replayed.initialState; for (const a of replayed.actionSequence) st = stepGame(st, a); assert.equal(sha256(st), sha256(replayed.finalState));
    assert.ok(replayed.provenance.files['src/prime/root-puct.js'] && replayed.provenance.files['ascii-suite/controllers/index.mjs']);
    assert.equal(replayed.provenance.sourceClosureHash, sourceManifest().sourceClosureHash);
    const pong = await (await post('/api/reset', { game: 'pong', config: { seed: 1, difficulty: 1 } })).json();
    let res; do { res = await (await post('/api/step', { id: pong.id, mode: 'manual', action: 'HOLD' })).json(); } while (!res.state.terminal);
    const after = await (await post('/api/decision', { id: pong.id, mode: 'sentinel' })).json(); assert.equal(after.decision.action, 'NO_ACTION_TERMINAL');
    assert.equal((await post('/api/step', { id: pong.id, mode: 'sentinel' })).status, 409);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('Manual input mapping: platformer combines jump with direction; fighter arrows map to facing-relative actions', () => {
  assert.equal(manualAction('platformer', ['JUMP', 'MOVE_RIGHT'], 'WAIT'), 'JUMP_RIGHT'); assert.equal(manualAction('platformer', ['MOVE_LEFT', 'JUMP'], 'WAIT'), 'JUMP_LEFT');
  const s = createGame('fighter'); assert.equal(manualAction('fighter', ['MOVE_RIGHT'], 'WAIT', s), 'WALK_FORWARD'); assert.equal(manualAction('fighter', ['MOVE_LEFT', 'JUMP'], 'WAIT', s), 'JUMP_BACK');
  s.fighters[0].facing = -1; assert.equal(manualAction('fighter', ['MOVE_RIGHT'], 'WAIT', s), 'WALK_BACK');
  s.fighters[0].grounded = false; assert.equal(manualAction('fighter', [], 'LIGHT_ATTACK', s), 'AIR_ATTACK');
});
test('Racing standings and state lines remain truthful', () => {
  const s = createGame('racing', { seed: 2 }); const st = raceStandings(s); assert.equal(st.length, 4); assert.ok(st.some(c => c.id === 'P'));
  assert.ok(stateLines(s).some(l => l.startsWith('STANDINGS')));
});
