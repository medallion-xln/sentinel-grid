// Pong controllers. All read observePong() only: observed (possibly delayed/noisy) ball position, paddles and score.
import { PONG_FIELD, foldY, projectIntercept } from '../../worlds/pong.mjs';

const steer = (target, y, deadband) => Math.abs(target - y) < deadband ? 'HOLD' : target < y ? 'UP' : 'DOWN';
const round = v => v === null || v === undefined || !Number.isFinite(v) ? v ?? null : Math.round(v * 100) / 100;
const base = (id, label, capability) => ({ id, label, capability, access: 'OBSERVATION_ONLY' });

export function createReactivePong() {
  return { ...base('REACTIVE_BALL_FOLLOWER', 'REACTIVE BALL FOLLOWER (BASELINE)', 'REACTIVE_CONTROL'), horizon: 0,
    decide(obs) { if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      return { action: steer(obs.ball.y, obs.playerY, .8), reason: `follow observed ball y=${round(obs.ball.y)}`, horizon: 0, planningHorizon: 'NONE (reactive)', branches: 1, objective: 'keep paddle on observed ball' }; } };
}

// Analytic intercept from the two most recent observations: straight line with wall reflections, no spin, no filtering.
export function createAnalyticPong() {
  let prev = null;
  return { ...base('ANALYTIC_INTERCEPT', 'ANALYTIC INTERCEPT (BASELINE)', 'DETERMINISTIC_PLANNING'), horizon: 'TO_INTERCEPT',
    decide(obs) {
      if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      const p = prev; prev = obs.ball;
      if (!p || obs.ball.tick === p.tick) return { action: 'HOLD', reason: 'awaiting second observation', horizon: 0, branches: 0 };
      const dt = obs.ball.tick - p.tick, vx = (obs.ball.x - p.x) / dt, vy = (obs.ball.y - p.y) / dt;
      const lag = obs.tick - obs.ball.tick, now = { x: obs.ball.x + vx * lag, y: obs.ball.y + vy * lag, vx, vy };
      const hit = vx < -.2 ? projectIntercept(now) : null, target = hit ? hit.y : 16;
      return { action: steer(target, obs.playerY, .8), reason: hit ? `straight-line intercept y=${round(hit.y)} in ${round(hit.ticks)} ticks` : 'ball outbound; recentre',
        prediction: hit ? { y: hit.y, sigma: null, lead: hit.ticks } : null, horizon: hit ? Math.ceil(hit.ticks) : 0, planningHorizon: 'TO_INTERCEPT (analytic)', branches: 1, objective: 'meet projected intercept' };
    } };
}

// Least squares with polynomial basis; returns coefficients and the inverse normal matrix for prediction variance.
function polyFit(ts, vs, degree) {
  const n = degree + 1, A = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
  for (let i = 0; i < ts.length; i++) { const p = Array.from({ length: n }, (_, k) => ts[i] ** k); for (let r = 0; r < n; r++) { b[r] += p[r] * vs[i]; for (let c = 0; c < n; c++) A[r][c] += p[r] * p[c]; } }
  const inv = invert(A); if (!inv) return null;
  const coef = inv.map(row => row.reduce((acc, v, k) => acc + v * b[k], 0));
  let rss = 0; for (let i = 0; i < ts.length; i++) { const e = vs[i] - coef.reduce((acc, c, k) => acc + c * ts[i] ** k, 0); rss += e * e; }
  return { coef, inv, rss, dof: Math.max(1, ts.length - n) };
}
function invert(m) {
  const n = m.length, a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, k) => k === i ? 1 : 0)]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null; [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c]; for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map(row => row.slice(n));
}

// Sentinel bounded strategic Pong controller: tracks the flight since the last paddle contact in unfolded wall coordinates,
// fits position/velocity/curvature, compensates the declared sensor delay, reports intercept uncertainty, and only aims a
// return away from the opponent when that uncertainty leaves margin on the paddle.
export function createSentinelPong({ strategic = false, uncertainty = true } = {}) {
  let track = [], dir = 0, noiseVar = .05, lastTick = -1, opponentLean = [], lastPrediction = null, contacts = 0, trigger = null;
  const unfold = (y, guess) => {
    let best = y, err = Infinity;
    for (let k = -3; k <= 3; k++) for (const c of [y + k * 58, 2 * PONG_FIELD.top - y + k * 58]) if (Math.abs(c - guess) < err) { err = Math.abs(c - guess); best = c; }
    return best;
  };
  return { ...base('SENTINEL_PONG_ESTIMATOR', strategic ? 'SENTINEL TEST CONTROLLER (FILTERED INTERCEPT + SHOT SELECTION)' : 'SENTINEL TEST CONTROLLER (FILTERED INTERCEPT ONLY)', 'DETERMINISTIC_PLANNING'), // state estimation + projection; no logged adaptation trigger
    horizon: 'TO_INTERCEPT',
    decide(obs) {
      const start = performance.now();
      if (obs.terminal) return { action: 'NO_ACTION_TERMINAL' };
      trigger = null;
      const o = obs.ball;
      const newMeasurement = o.tick > lastTick;
      if (newMeasurement) {
        lastTick = o.tick;
        if (track.length >= 2) {
          const last = track.at(-1), dx = o.x - last.x;
          const newDir = Math.abs(o.x - 48) < 1 && Math.abs(last.x - 48) > 20 ? 0 : Math.sign(dx);
          // A large jump means a serve; a sustained reversal means a paddle contact. Either starts a new flight segment.
          const dt = Math.max(1, o.tick - last.t);
          // Sparse fast motion is not a serve. Require impossible observed speed or a sustained paddle reversal.
          if (Math.abs(dx) / dt > 4 || dt > 12 || (newDir && dir && newDir !== dir && track.length >= 3 && Math.sign(o.x - track.at(-2).x) === newDir)) { track = []; dir = 0; }
        }
        let u = o.y;
        if (track.length >= 2) {
          const t0 = track[0].t, fit = polyFit(track.map(p => p.t - t0), track.map(p => p.u), track.length >= 6 && obs.band >= 3 ? 2 : 1);
          if (fit) { const g = fit.coef.reduce((acc, c, k) => acc + c * (o.tick - t0) ** k, 0); u = unfold(o.y, g); }
        } else if (track.length === 1) u = unfold(o.y, track[0].u);
        track.push({ t: o.tick, x: o.x, u }); if (track.length > 18) track.shift();
        if (track.length >= 2) dir = Math.sign(track.at(-1).x - track[0].x);
      }
      if (obs.lastContact && obs.lastContact.tick === obs.tick - 1) contacts++;
      // Within-episode opponent model: where the opponent sits when the ball leaves our paddle.
      if (obs.temporal?.fresh && obs.events.includes('PLAYER_RETURN')) { opponentLean.push(obs.enemyY - 16); if (opponentLean.length > 8) opponentLean.shift(); }
      const lean = opponentLean.length ? opponentLean.reduce((a, b) => a + b, 0) / opponentLean.length : 0;
      if (track.length < 3 || dir >= 0) {
        // Outbound or unknown: hold near centre, offset slightly toward where the opponent's returns have tended to arrive.
        const target = 16; lastPrediction = null;
        return { action: steer(target, obs.playerY, 1.6), reason: dir > 0 ? 'ball outbound; recover to centre' : 'acquiring track', horizon: 0, planningHorizon: 'NONE (no inbound track)', branches: 0,
          objective: 'recover position', prediction: null, opponentLean: round(lean), latencyMs: performance.now() - start, adaptationTrigger: trigger };
      }
      const t0 = track[0].t, ts = track.map(p => p.t - t0), xfit = polyFit(ts, track.map(p => p.x), 1), degree = track.length >= 6 && obs.band >= 3 ? 2 : 1;
      const ufit = polyFit(ts, track.map(p => p.u), degree);
      if (!xfit || !ufit || xfit.coef[1] >= -.05) return { action: 'HOLD', reason: 'track not yet inbound', horizon: 0, branches: 0, latencyMs: performance.now() - start };
      const tHit = (PONG_FIELD.playerX - xfit.coef[0]) / xfit.coef[1], lead = tHit + t0 - obs.tick;
      const g = Array.from({ length: degree + 1 }, (_, k) => tHit ** k), uHit = ufit.coef.reduce((acc, c, k) => acc + c * g[k], 0);
      const s2 = ufit.rss / ufit.dof; if (newMeasurement) noiseVar = .9 * noiseVar + .1 * Math.max(.01, s2);
      const leverage = g.reduce((acc, gi, r) => acc + gi * ufit.inv[r].reduce((q, v, c) => q + v * g[c], 0), 0);
      // Unmodelled spin decay grows with lead time; include it so the interval stays honest at long range.
      const modelError = obs.band >= 3 ? .0009 * lead * lead : .02 * lead;
      const sigma = Math.sqrt(Math.max(0, noiseVar * leverage) + modelError ** 2 + .04);
      const yHit = foldY(uHit);
      let aim = 0, aimNote = 'centre contact';
      if (strategic && lead > 0 && lead < 30 && sigma < 1.2) {
        // Shot selection: send the return toward the side farther from the observed opponent paddle, bounded by uncertainty.
        const away = obs.enemyY > 16 ? -1 : 1, room = Math.max(0, (obs.paddleHalf + .5) - 2 * sigma) / (obs.paddleHalf + .5);
        aim = Math.min(.75, room) * away; aimNote = `aim ${away < 0 ? 'UP' : 'DOWN'} away from opponent y=${round(obs.enemyY)} (|offset|=${round(Math.abs(aim))})`;
      }
      const target = Math.min(27, Math.max(4, yHit - aim * (obs.paddleHalf + .5)));
      lastPrediction = { y: yHit, sigma, lead };
      return { action: steer(target, obs.playerY, uncertainty ? Math.min(1.2, .5 + sigma / 2) : .5), reason: `intercept y=${round(yHit)} +/-${round(sigma)} in ${round(lead)} ticks; ${aimNote}`,
        prediction: { y: yHit, sigma, lead }, observed: { x: o.x, y: o.y, tick: o.tick }, horizon: Math.ceil(lead), planningHorizon: `${Math.ceil(lead)} ticks to intercept (fitted flight)`,
        branches: 1, objective: strategic ? 'return and place ball away from opponent' : 'return ball', opponentLean: round(lean), latencyMs: performance.now() - start, adaptationTrigger: trigger };
    } };
}
