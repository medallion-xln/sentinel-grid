// INCUMBENT ASCII WORLDS V1 — verbatim copy of games.mjs before the ASCII Worlds 2.0 upgrade. Do not edit; Phase 0 reproduction and incumbent baselines run against this file.
export const GAMES = ['pong', 'platformer', 'fighter', 'racing'];
export const TITLES = { pong: 'ASCII PONG', platformer: 'ASCII SIDE SCROLLER', fighter: 'ASCII 2D FIGHTER', racing: 'ASCII 2D RACING' };
export const ACTIONS = {
  pong: ['UP', 'DOWN', 'HOLD'],
  platformer: ['MOVE_LEFT', 'MOVE_RIGHT', 'JUMP', 'JUMP_LEFT', 'JUMP_RIGHT', 'CROUCH', 'WAIT'],
  fighter: ['STEP_LEFT', 'STEP_RIGHT', 'LIGHT_ATTACK', 'HEAVY_ATTACK', 'BLOCK', 'JUMP', 'CROUCH', 'WAIT'],
  racing: ['ACCELERATE', 'BRAKE', 'TURN_LEFT', 'TURN_RIGHT', 'HOLD'],
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const random = s => { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; };
const event = (s, message) => s.events.push(message);
export const ratio = (a, b) => b ? a / b : null;

export function createGame(game, { seed = 1, difficulty = 1, spin = true, style = 'balanced' } = {}) {
  if (!GAMES.includes(game)) throw Error('Unknown game');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error('Seed must be a uint32');
  if (![1, 2, 3].includes(difficulty)) throw Error('Difficulty must be 1, 2, or 3');
  if (!['balanced', 'aggressive', 'defensive'].includes(style)) throw Error('Unknown opponent style');
  if (typeof spin !== 'boolean') throw Error('Spin must be boolean');
  const s = { game, seed, rng: seed, difficulty, spin, style, tick: 0, terminal: false, result: 'IN_PROGRESS', reward: 0, lastAction: 'NONE', events: [], width: 96, height: 32, metrics: {} };
  if (game === 'pong') {
    Object.assign(s, { playerY: 16, enemyY: 16, paddleHalf: 3, ball: { x: 48, y: 16, vx: -1.25, vy: .65 }, score: [0, 0], rally: 0 });
    s.metrics = { returns: 0, misses: 0, interceptError: 0, longestRally: 0, predictions: 0, predictionError: 0 };
  } else if (game === 'platformer') {
    Object.assign(s, { width: 192, floor: 28, x: 4, y: 27, vx: 0, vy: 0, grounded: true, jumpInFlight: false, health: 3, checkpoint: 4, invulnerable: 0, exit: 185 });
    s.gaps = [35, 76, 119, 157].map(x => { const offset = Math.floor(random(s) * 4); return [x + offset, x + offset + 4 + difficulty]; });
    s.platforms = [[20, 31, 23], [58, 71, 21], [99, 113, 24], [141, 154, 22]];
    s.walls = [[89, 91, 25]];
    s.hazards = [53, 108, 150]; s.enemies = [{ home: 61, x: 61 }, { home: 133, x: 133 }];
    s.coins = [15, 25, 47, 65, 95, 105, 137, 147, 176].map(x => ({ x, y: s.platforms.find(p => x >= p[0] && x <= p[1])?.[2] - 1 || 26, taken: false }));
    s.metrics = { damage: 0, deaths: 0, coins: 0, jumps: 0, landings: 0, backtracking: 0, maxProgress: 0, threatsPassed: 0 };
  } else if (game === 'fighter') {
    Object.assign(s, { x: 28, enemyX: 65, health: 100, enemyHealth: 100, recovery: 0, enemyRecovery: 0, stun: 0, enemyStun: 0, stance: 'READY', enemyStance: 'READY', pending: null, enemyPending: null, lastMove: 'NONE', enemyLastMove: 'NONE' });
    s.metrics = { dealt: 0, taken: 0, attacks: 0, whiffs: 0, punishAttempts: 0, punishes: 0, guardAttempts: 0, incomingContacts: 0, blocks: 0, spacingTicks: 0, confirmedHits: 0, opponentAttacks: 0, opponentBlocks: 0, roundWins: 0 };
  } else {
    Object.assign(s, { distance: 0, lane: 0, speed: 0, heading: 0, lapLength: 720, lapsTarget: 3, lap: 0, lapStart: 0, lapTimes: [], crashCooldown: 0 });
    s.rivals = [
      { id: 'A', name: 'APEX', distance: 8, lane: -3, preferredLane: -2, cruise: 3.05, corner: 1.65 },
      { id: 'B', name: 'BOLT', distance: 18, lane: 3, preferredLane: 2, cruise: 3.2, corner: 1.95 },
      { id: 'C', name: 'CRUISE', distance: -8, lane: 0, preferredLane: 0, cruise: 2.9, corner: 1.55 },
    ].map(car => ({ ...car, pace: .98 + random(s) * .04, speed: 0, heading: 0, crashCooldown: 0, collisions: 0, finishedTick: null, lastAction: 'HOLD' }));
    s.metrics = { collisions: 0, carContacts: 0, overtakes: 0, offTrack: 0, speedSum: 0, deviation: 0, steeringChanges: 0, lastSteer: 0 };
  }
  return s;
}

export function pongIntercept(s) {
  if (s.ball.vx >= 0) return null;
  let y = s.ball.y + (3 - s.ball.x) / s.ball.vx * s.ball.vy;
  const span = s.height - 3, period = span * 2;
  y = ((y - 1) % period + period) % period;
  return 1 + (y > span ? period - y : y);
}
function pong(s, a) {
  const originalPlayerY = s.playerY;
  const move = a === 'UP' ? -1 : a === 'DOWN' ? 1 : 0;
  s.playerY = clamp(s.playerY + move * 1.5, 4, 27);
  const target = s.ball.vx > 0 ? s.ball.y : 16 + Math.sin(s.tick / 18) * 5;
  s.enemyY += clamp(target - s.enemyY, -(.8 + .3 * s.difficulty), .8 + .3 * s.difficulty);
  const before = pongIntercept(s), beforeError = before === null ? Math.abs(originalPlayerY - 16) : Math.abs(originalPlayerY - before);
  const n = Math.ceil(Math.max(Math.abs(s.ball.vx), Math.abs(s.ball.vy)) / .5);
  for (let i = 0; i < n; i++) {
    const b = s.ball; b.x += b.vx / n; b.y += b.vy / n;
    if (b.y < 1 || b.y > 30) { b.y = clamp(b.y, 1, 30); b.vy *= -1; event(s, 'WALL_BOUNCE'); }
    if (b.vx < 0 && b.x <= 3 && b.x >= 2 && Math.abs(b.y - s.playerY) <= s.paddleHalf + .5) {
      const error = Math.abs(b.y - s.playerY);
      s.metrics.returns++; s.metrics.interceptError += error; s.metrics.predictions++; s.metrics.predictionError += Math.abs(b.y - (before ?? b.y));
      b.x = 3.01; b.vx = Math.min(4.5, Math.abs(b.vx) + .08 * s.difficulty);
      if (s.spin) b.vy = clamp((b.y - s.playerY) * .42 + move * .18, -2.8, 2.8);
      s.rally++; s.reward += 2; event(s, 'PLAYER_RETURN');
    }
    if (b.vx > 0 && b.x >= 92 && b.x <= 93 && Math.abs(b.y - s.enemyY) <= s.paddleHalf + .5) {
      b.x = 91.99; b.vx *= -1;
      if (s.spin) b.vy = clamp((b.y - s.enemyY) * .5 + (random(s) - .5) * s.difficulty, -2.8, 2.8);
      s.rally++; event(s, 'OPPONENT_RETURN');
    }
    if (b.x < 1 || b.x > 94) {
      const win = b.x > 94; s.score[win ? 0 : 1]++; if (!win) s.metrics.misses++;
      s.reward += win ? 5 : -5; event(s, win ? 'POINT_WON' : 'POINT_LOST');
      s.ball = { x: 48, y: 8 + random(s) * 16, vx: (win ? -1 : 1) * (1.2 + .1 * s.difficulty), vy: (random(s) - .5) * 1.8 };
      s.rally = 0; break;
    }
  }
  s.metrics.longestRally = Math.max(s.metrics.longestRally, s.rally);
  const intercept = pongIntercept(s);
  s.reward += .08 * (beforeError - Math.abs(s.playerY - (intercept ?? 16))) - .002;
  if (Math.max(...s.score) >= 5) { s.terminal = true; s.result = s.score[0] > s.score[1] ? 'WIN' : 'LOSS'; }
}
export function solid(s, x, y) {
  const col = Math.floor(x), row = Math.floor(y);
  if (col < 0 || col >= s.width) return true;
  if (row >= s.floor && !s.gaps.some(g => col >= g[0] && col <= g[1])) return true;
  return s.platforms.some(p => col >= p[0] && col <= p[1] && row === p[2]) || s.walls.some(p => col >= p[0] && col <= p[1] && row >= p[2]);
}
function hurt(s, reason, fall = false) {
  if (s.invulnerable > 0 && !fall) return;
  s.health--; s.metrics.damage++; s.reward -= 4; s.invulnerable = 15; event(s, reason);
  if (fall) { s.metrics.deaths++; s.jumpInFlight = false; s.x = s.checkpoint; s.y = 27; s.vx = s.vy = 0; }
  if (s.health <= 0) { s.terminal = true; s.result = 'LOSS'; }
}
function platformer(s, a) {
  const oldX = s.x, wasGrounded = s.grounded;
  s.invulnerable = Math.max(0, s.invulnerable - 1);
  s.grounded = solid(s, s.x, s.y + 1.05);
  const direction = a === 'MOVE_LEFT' || a === 'JUMP_LEFT' ? -1 : a === 'MOVE_RIGHT' || a === 'JUMP_RIGHT' ? 1 : 0;
  s.vx = direction ? clamp(s.vx + direction * .32, -1.2, 1.2) : s.vx * .72;
  if (a === 'CROUCH') s.vx *= .3;
  if (['JUMP', 'JUMP_LEFT', 'JUMP_RIGHT'].includes(a) && s.grounded) { s.vy = -3.5; s.grounded = false; s.jumpInFlight = true; s.metrics.jumps++; event(s, 'JUMP_START'); }
  s.vy = Math.min(3, s.vy + .42);
  const steps = Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy)) / .2);
  for (let i = 0; i < steps; i++) {
    const nx = s.x + s.vx / steps;
    if (!solid(s, nx, s.y)) s.x = nx; else s.vx = 0;
    const ny = s.y + s.vy / steps;
    const falling = s.vy > 0, contactY = falling ? ny + 1 : ny;
    if (!solid(s, s.x, contactY)) s.y = ny;
    else { if (falling) s.y = Math.floor(contactY) - 1 - .01; s.vy = 0; }
  }
  s.grounded = s.vy >= 0 && solid(s, s.x, s.y + 1.05);
  if (!wasGrounded && s.grounded) { if (s.jumpInFlight) { s.metrics.landings++; s.jumpInFlight = false; } event(s, 'LANDING'); }
  if (s.y > 32) hurt(s, 'FALL_CHECKPOINT_RESET', true);
  for (const e of s.enemies) { e.x = e.home + Math.sin(s.tick / (12 - s.difficulty)) * 4; if (Math.abs(s.x - e.x) < 1 && s.y > 25) hurt(s, 'ENEMY_CONTACT'); }
  if (s.hazards.some(x => Math.abs(s.x - x) < .8) && s.y > 25 && a !== 'CROUCH') hurt(s, 'HAZARD_CONTACT');
  for (const c of s.coins) if (!c.taken && Math.abs(s.x - c.x) < 1.1 && Math.abs(s.y - c.y) < 2) { c.taken = true; s.metrics.coins++; s.reward += .8; event(s, 'COIN_COLLECTED'); }
  if (s.x > 128 && s.grounded && !s.gaps.some(g => 128 >= g[0] && 128 <= g[1])) s.checkpoint = 128;
  else if (s.x > 64 && s.grounded) s.checkpoint = 64;
  if (!s.events.includes('FALL_CHECKPOINT_RESET')) s.metrics.backtracking += Math.max(0, oldX - s.x);
  s.metrics.maxProgress = Math.max(s.metrics.maxProgress, Math.min(1, s.x / s.exit));
  s.metrics.threatsPassed = s.hazards.filter(x => x < s.x).length;
  s.reward += (s.x - oldX) * .18 - .015;
  if (s.x >= s.exit && s.health > 0) { s.terminal = true; s.result = 'WIN'; s.reward += 8; event(s, 'EXIT_REACHED'); }
}
const MOVES = { LIGHT_ATTACK: { range: 7, windup: 1, recovery: 3, damage: 8 }, HEAVY_ATTACK: { range: 11, windup: 3, recovery: 6, damage: 18 } };
function strike(s, enemy, action) {
  const m = MOVES[action], target = enemy ? 'health' : 'enemyHealth', distance = Math.abs(s.x - s.enemyX);
  const guard = enemy ? s.stance === 'BLOCK' : s.enemyStance === 'BLOCK';
  const evaded = action === 'HEAVY_ATTACK' && (enemy ? s.stance : s.enemyStance) === 'JUMP';
  if (!enemy) s.metrics.attacks++;
  if (distance > m.range || evaded) { if (!enemy) s.metrics.whiffs++; s.reward += enemy ? .02 : -.2; event(s, (enemy ? 'OPPONENT_' : 'PLAYER_') + 'WHIFF'); return; }
  if (enemy) s.metrics.incomingContacts++;
  if (guard) { const chip = Math.min(1, s[target]); if (enemy) { s.metrics.blocks++; s.metrics.taken += chip; } else s.metrics.dealt += chip;
    s[target] = Math.max(0, s[target] - 1); s.reward += enemy ? .2 : -.1; event(s, 'GUARDED_HIT'); return; }
  const damage = Math.min(s[target], (enemy ? s.stance : s.enemyStance) === 'CROUCH' && action === 'LIGHT_ATTACK' ? Math.ceil(m.damage * .7) : m.damage);
  s[target] = Math.max(0, s[target] - damage);
  if (enemy) { s.metrics.taken += damage; s.stun = 2; } else { s.metrics.dealt += damage; s.enemyStun = 2; s.metrics.confirmedHits++; if (s.enemyRecovery > 0) s.metrics.punishes++; }
  s.reward += (enemy ? -1 : 1) * damage / 10; event(s, (enemy ? 'OPPONENT_' : 'PLAYER_') + action + '_HIT');
}
function fighter(s, a) {
  const wasBusy = s.recovery > 0 || s.stun > 0;
  s.recovery = Math.max(0, s.recovery - 1); s.enemyRecovery = Math.max(0, s.enemyRecovery - 1);
  s.stun = Math.max(0, s.stun - 1); s.enemyStun = Math.max(0, s.enemyStun - 1);
  s.stance = wasBusy ? 'RECOVERY' : a;
  if (!wasBusy) {
    s.lastMove = a;
    if (a === 'STEP_LEFT') s.x = clamp(s.x - 2, 3, s.enemyX - 2);
    if (a === 'STEP_RIGHT') s.x = clamp(s.x + 2, 3, s.enemyX - 2);
    if (a === 'BLOCK') s.metrics.guardAttempts++;
    if (MOVES[a]) { s.pending = { action: a, timer: MOVES[a].windup }; s.recovery = MOVES[a].windup + MOVES[a].recovery; if (s.enemyRecovery > 0) s.metrics.punishAttempts++; }
  }
  if (s.enemyRecovery === 0 && s.enemyStun === 0) {
    const distance = s.enemyX - s.x, draw = random(s);
    const aggressive = s.style === 'aggressive' ? .8 : s.style === 'defensive' ? .3 : .55;
    if (distance > 10) { s.enemyX -= 1 + .3 * s.difficulty; s.enemyStance = 'APPROACH'; }
    else if (draw < aggressive) {
      const move = draw < aggressive * .5 ? 'HEAVY_ATTACK' : 'LIGHT_ATTACK';
      s.enemyPending = { action: move, timer: MOVES[move].windup }; s.enemyRecovery = MOVES[move].windup + MOVES[move].recovery;
      s.enemyStance = 'WINDUP'; s.enemyLastMove = move; s.metrics.opponentAttacks++;
    } else { s.enemyStance = 'BLOCK'; s.metrics.opponentBlocks++; }
  } else s.enemyStance = s.enemyPending ? 'WINDUP' : 'RECOVERY';
  // Both queued strikes resolve on the same tick; no player-first hit advantage.
  const playerReady = s.pending && --s.pending.timer <= 0;
  const enemyReady = s.enemyPending && --s.enemyPending.timer <= 0;
  if (playerReady) { strike(s, false, s.pending.action); s.pending = null; }
  if (enemyReady) { strike(s, true, s.enemyPending.action); s.enemyPending = null; }
  if (Math.abs(s.enemyX - s.x) >= 5 && Math.abs(s.enemyX - s.x) <= 11) { s.metrics.spacingTicks++; s.reward += .01; }
  s.reward -= .005;
  if (s.health === 0 || s.enemyHealth === 0) { s.terminal = true; s.result = s.health === s.enemyHealth ? 'DRAW' : s.health > s.enemyHealth ? 'WIN' : 'LOSS'; s.metrics.roundWins = s.result === 'WIN' ? 1 : 0; }
}
export function trackAt(distance) {
  const t = ((distance % 720) + 720) % 720;
  const curve = t >= 120 && t < 230 ? 1 : t >= 350 && t < 470 ? -1 : t >= 580 && t < 650 ? 1 : 0;
  return { center: Math.sin(t / 70) * 8, curve, safeSpeed: curve ? 1.5 : 3.2, hazardLane: t > 270 && t < 292 ? -2 : t > 505 && t < 526 ? 2 : null };
}
export function raceStandings(s) {
  const finish = s.lapLength * s.lapsTarget;
  return [{ id: 'P', name: 'SENTINEL', distance: s.distance, lane: s.lane, speed: s.speed,
    finishedTick: s.distance >= finish ? s.tick : null }, ...s.rivals].sort((a, b) => {
    if (a.finishedTick !== null && b.finishedTick !== null) return a.finishedTick - b.finishedTick || a.id.localeCompare(b.id);
    if (a.finishedTick !== null) return -1;
    if (b.finishedTick !== null) return 1;
    return b.distance - a.distance || a.id.localeCompare(b.id);
  }).map((car, i) => ({ ...car, place: i + 1, gap: car.distance - s.distance }));
}
function advanceRival(s, car, traffic) {
  if (car.finishedTick !== null) return;
  car.crashCooldown = Math.max(0, car.crashCooldown - 1);
  const track = trackAt(car.distance), ahead = trackAt(car.distance + Math.max(20, car.speed * 12));
  const targetSpeed = Math.min(3.2, (track.curve || ahead.curve ? car.corner : car.cruise) * car.pace);
  const hazard = trackAt(car.distance + 15).hazardLane;
  const candidates = [-3, 0, 3];
  const cost = lane => Math.abs(lane - car.preferredLane) + (hazard !== null && Math.abs(lane - hazard) < 1.5 ? 10 : 0)
    + traffic.filter(other => other.id !== car.id && other.distance >= car.distance - 2 && other.distance < car.distance + 12 && Math.abs(other.lane - lane) < 1.5).length * 8;
  const goalLane = candidates.sort((a, b) => cost(a) - cost(b) || a - b)[0];
  const projectedLane = car.lane + car.heading * .5 + track.curve * car.speed * car.speed * .06;
  const action = car.speed > targetSpeed + .1 ? 'BRAKE' : projectedLane > goalLane + .35 ? 'TURN_LEFT'
    : projectedLane < goalLane - .35 ? 'TURN_RIGHT' : car.speed < targetSpeed - .05 ? 'ACCELERATE' : 'HOLD';
  car.lastAction = action;
  if (action === 'ACCELERATE') car.speed = Math.min(3.2, car.speed + .18);
  if (action === 'BRAKE') car.speed = Math.max(0, car.speed - .45);
  car.speed = Math.max(0, car.speed - .01);
  car.heading = car.heading * .5 + (action === 'TURN_LEFT' ? -1 : action === 'TURN_RIGHT' ? 1 : 0) * .4;
  car.lane += car.heading + track.curve * car.speed * car.speed * .06;
  if (Math.abs(car.lane) > 6) { car.speed *= .75; car.lane = clamp(car.lane, -7, 7); }
  if (!car.crashCooldown && (Math.abs(car.lane) >= 7 || track.hazardLane !== null && Math.abs(car.lane - track.hazardLane) < 1)) {
    car.collisions++; car.speed *= .35; car.crashCooldown = 12;
  }
  car.distance += car.speed * Math.max(.3, 1 - Math.abs(car.lane) * .035);
  if (car.distance >= s.lapLength * s.lapsTarget) { car.distance = s.lapLength * s.lapsTarget; car.finishedTick = s.tick; car.speed = 0; }
}
function racing(s, a) {
  const oldDistance = s.distance, oldRivals = s.rivals.map(car => car.distance);
  // All opponents choose from the same pre-tick traffic snapshot; no update-order peeking.
  const traffic = [{ id: 'P', distance: s.distance, lane: s.lane }, ...s.rivals.map(({ id, distance, lane }) => ({ id, distance, lane }))];
  s.crashCooldown = Math.max(0, s.crashCooldown - 1);
  const track = trackAt(s.distance), steer = a === 'TURN_LEFT' ? -1 : a === 'TURN_RIGHT' ? 1 : 0;
  if (a === 'ACCELERATE') s.speed = Math.min(3.2, s.speed + .18);
  if (a === 'BRAKE') s.speed = Math.max(0, s.speed - .45);
  s.speed = Math.max(0, s.speed - .01);
  if (steer && s.metrics.lastSteer && steer !== s.metrics.lastSteer) s.metrics.steeringChanges++;
  if (steer) s.metrics.lastSteer = steer;
  s.heading = s.heading * .5 + steer * .4;
  s.lane += s.heading + track.curve * s.speed * s.speed * .06;
  if (Math.abs(s.lane) > 6) {
    s.metrics.offTrack++; s.reward -= .6; s.speed *= .75; s.lane = clamp(s.lane, -7, 7); event(s, 'OFF_TRACK');
  }
  if ((Math.abs(s.lane) >= 7 || track.hazardLane !== null && Math.abs(s.lane - track.hazardLane) < 1) && !s.crashCooldown) {
    s.metrics.collisions++; s.crashCooldown = 12; s.speed *= .35; s.reward -= 2; event(s, 'COLLISION');
  }
  const progress = s.speed * Math.max(.3, 1 - Math.abs(s.lane) * .035); s.distance += progress;
  s.rivals.forEach(car => advanceRival(s, car, traffic));
  for (const [i, car] of s.rivals.entries()) {
    if (oldDistance <= oldRivals[i] && s.distance > car.distance) { s.metrics.overtakes++; event(s, 'OVERTAKE_' + car.id); }
    if (car.finishedTick === null && !s.crashCooldown && !car.crashCooldown && Math.abs(s.distance - car.distance) < 2.2 && Math.abs(s.lane - car.lane) < 1.2) {
      s.speed *= .5; car.speed *= .5; s.crashCooldown = car.crashCooldown = 12;
      s.metrics.collisions++; s.metrics.carContacts++; car.collisions++; s.reward -= 1; event(s, 'CAR_CONTACT_' + car.id);
    }
  }
  s.metrics.speedSum += s.speed; s.metrics.deviation += Math.abs(s.lane);
  s.reward += progress * .12 - Math.abs(s.lane) * .03 - Math.max(0, s.speed - track.safeSpeed) * .1 - .005;
  const lap = Math.floor(s.distance / s.lapLength);
  if (lap > s.lap) { s.lapTimes.push(s.tick - s.lapStart); s.lapStart = s.tick; s.lap = lap; event(s, 'LAP_COMPLETE'); }
  if (s.lap >= s.lapsTarget) { s.terminal = true; s.result = 'FINISH_PLACE_' + raceStandings(s).find(car => car.id === 'P').place; }
}

export function stepGame(state, action) {
  if (state.terminal) throw Error('Episode is terminal; reset to continue');
  if (!ACTIONS[state.game]?.includes(action)) throw Error('Illegal action');
  const s = structuredClone(state); s.tick++; s.events = []; s.reward = 0; s.lastAction = action;
  ({ pong, platformer, fighter, racing })[s.game](s, action);
  const limit = s.game === 'racing' ? 4000 : s.game === 'platformer' ? 1200 : s.game === 'fighter' ? 600 : 3000;
  if (!s.terminal && s.tick >= limit) { s.terminal = true; s.result = 'TIMEOUT'; event(s, 'TICK_LIMIT'); }
  return s;
}

// Explicit hand-written comparator, not an expert or a claim of Sentinel competence.
export function baselineAction(s) {
  if (s.game === 'pong') { const y = pongIntercept(s) ?? 16; return Math.abs(y - s.playerY) < .8 ? 'HOLD' : y < s.playerY ? 'UP' : 'DOWN'; }
  if (s.game === 'platformer') {
    const danger = s.gaps.some(g => g[0] - s.x < 5 && g[1] >= s.x) || s.walls.some(p => p[0] - s.x < 4 && p[1] >= s.x) || s.hazards.some(x => x - s.x < 4 && x >= s.x);
    return s.grounded && danger ? 'JUMP_RIGHT' : 'MOVE_RIGHT';
  }
  if (s.game === 'fighter') {
    const d = s.enemyX - s.x;
    if (s.enemyPending && d < 12) return 'BLOCK';
    if (s.recovery || s.stun) return 'WAIT';
    return d > 9 ? 'STEP_RIGHT' : s.enemyRecovery > 2 ? 'HEAVY_ATTACK' : 'LIGHT_ATTACK';
  }
  const t = trackAt(s.distance), next = trackAt(s.distance + s.speed * 12);
  if (next.curve && s.speed > 1.6) return 'BRAKE';
  if (s.lane > .7 || t.curve === 1 && s.speed > 1) return 'TURN_LEFT';
  if (s.lane < -.7 || t.curve === -1 && s.speed > 1) return 'TURN_RIGHT';
  return s.speed < (t.curve ? 1.5 : 2.7) ? 'ACCELERATE' : 'HOLD';
}

export function metricsOf(s) {
  const m = s.metrics;
  if (s.game === 'pong') return { returnRate: ratio(m.returns, m.returns + m.misses), meanInterceptError: ratio(m.interceptError, m.returns), longestRally: m.longestRally, scoreDifference: s.score[0] - s.score[1], meanPredictionError: ratio(m.predictionError, m.predictions) };
  if (s.game === 'platformer') return { progress: m.maxProgress, damage: m.damage, deaths: m.deaths, collectibles: m.coins, jumpLandingRate: ratio(m.landings, m.jumps), hazardsPassed: m.threatsPassed, progressPerTick: ratio(s.x - 4, s.tick), backtracking: m.backtracking };
  if (s.game === 'fighter') return { damageDealt: m.dealt, damageTaken: m.taken, whiffRate: ratio(m.whiffs, m.attacks), punishRate: ratio(m.punishes, m.punishAttempts), blockSuccessRate: ratio(m.blocks, m.incomingContacts), spacingQuality: ratio(m.spacingTicks, s.tick), hitRate: ratio(m.confirmedHits, m.attacks), roundWins: m.roundWins };
  return { lapTimesTicks: s.lapTimes.join(',') || null, collisions: m.collisions, carContacts: m.carContacts, overtakes: m.overtakes, offTrackTicks: m.offTrack, averageSpeed: ratio(m.speedSum, s.tick), meanLineDeviation: ratio(m.deviation, s.tick), steeringReversals: m.steeringChanges, placement: raceStandings(s).find(car => car.id === 'P').place };
}
