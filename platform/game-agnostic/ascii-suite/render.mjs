import { TITLES, ACTIONS, metricsOf, ratio, raceStandings, segmentAt, terrainSolid, PONG_BANDS, phaseOf, observe } from './games.mjs';
import { driverInfo } from './worlds/racing.mjs';
const fmt = n => n === null || n === undefined ? 'NOT_MEASURED' : typeof n === 'number' ? Number.isInteger(n) ? String(n) : n.toFixed(3) : String(n);
const f2 = n => n === null || n === undefined || !Number.isFinite(n) ? 'N/A' : n.toFixed(2);
export const LEGENDS = {
  pong: 'P player | E opponent | o ball | * observed ball (delayed/noisy) | : projected intercept | . +/-1 sigma | x last contact | # wall',
  platformer: '@ player | # terrain | E enemy | ^ spikes | ~ crosswind (strength unknown) | ! checkpoint | $ coin | X exit',
  fighter: 'P/E torso (faces opponent) | o head/fist | LIGHT punch | HEAVY kick | LOW sweep | AIR jump kick | ! hurt | = guard | - floor',
  racing: '/P\\ player | A APEX / B BOLT / C CRUISE | ^/v offscreen rival | | road edge | # barrier | ~ wet surface | , grass',
};
// Poses follow visible move phases and stance; they never invent combat rules.
export function combatPose(s, enemy = false) {
  const f = s.fighters[enemy ? 1 : 0];
  if (f.health <= 0) return 'KO';
  if (f.stun?.kind === 'HIT') return 'HURT';
  if (f.stun?.kind === 'BLOCK') return f.guard === 'LOW' ? 'LOW_GUARD' : 'GUARD';
  if (f.move) {
    const n = f.move.name, p = f.move.phase;
    if (n === 'AIR_ATTACK') return p === 'STARTUP' ? 'JUMP' : 'AIR_KICK';
    if (p === 'STARTUP') return n === 'LIGHT_ATTACK' ? 'PUNCH_WINDUP' : n === 'LOW_ATTACK' ? 'CROUCH' : 'KICK_WINDUP';
    if (p === 'ACTIVE') return n === 'LIGHT_ATTACK' ? 'PUNCH' : n === 'LOW_ATTACK' ? 'SWEEP' : 'KICK';
    return 'RECOVER';
  }
  if (!f.grounded) return 'JUMP';
  if (f.landingLag) return 'RECOVER';
  if (f.guard === 'HIGH') return 'GUARD';
  if (f.guard === 'LOW') return 'LOW_GUARD';
  if (f.crouch) return 'CROUCH';
  if (f.turn) return 'TURN';
  return f.lastAction === 'WALK_FORWARD' || f.lastAction === 'WALK_BACK' ? 'WALK' : 'READY';
}
export function fighterSprite(pose, id = 'P', mirrored = false) {
  const body = ['     .-.     ', '     |o|     ', "     '-'     ", '      |      ', '   o--P--o   ', '    / | \\    ', '      |      ', '     / \\     ', '    /   \\    ', '   /     \\   ', '  _|     |_  '];
  const low = () => { body.fill('             '); body[5] = '     .-.     '; body[6] = '     |o|     '; body[7] = '   o--P--o   '; body[8] = '     / \\     '; body[9] = '   _/   \\_   '; body[10] = '  _|     |_  '; };
  if (pose === 'PUNCH') { body[4] = '   o--P-----O'; body[5] = '      |      '; }
  if (pose === 'PUNCH_WINDUP' || pose === 'KICK_WINDUP') { body[3] = '      |  o   '; body[4] = '   o--P-/    '; body[8] = pose === 'KICK_WINDUP' ? '    /  _|    ' : body[8]; }
  if (pose === 'KICK') { body[7] = '     / \\     '; body[8] = '    /  \\---->'; body[9] = '   /         '; body[10] = '  _|         '; }
  if (pose === 'GUARD') { body[3] = '      | o=   '; body[4] = '      P/|=   '; body[5] = '      |      '; }
  if (pose === 'HURT') { body[1] = '     |!|     '; body[3] = '  o   |   o  '; body[4] = '   \\--P--/   '; }
  if (pose === 'RECOVER') { body[4] = '      P      '; body[5] = '    / | \\    '; body[6] = '   o  |  o   '; }
  if (pose === 'WALK') { body[8] = '   /     |   '; body[9] = '  /     /    '; body[10] = '_|    _|     '; }
  if (pose === 'TURN') { body[4] = '    o-P-o    '; body[5] = '      |      '; }
  if (pose === 'JUMP') { body[7] = '    _/ \\_    '; body[8] = '   |     |   '; body[9] = '   o     o   '; body[10] = '             '; }
  if (pose === 'AIR_KICK') { body[7] = '     / \\     '; body[8] = '    /   \\    '; body[9] = '   o     \\   '; body[10] = '          \\->'; }
  if (pose === 'CROUCH') low();
  if (pose === 'LOW_GUARD') { low(); body[7] = '   o--P=o=   '; }
  if (pose === 'SWEEP') { low(); body[9] = '   _/   \\___ '; body[10] = '  _|      -->'; }
  if (pose === 'KO') { body.fill('             '); body[9] = '   o--P--o   '; body[10] = ' .-.  / \\    '; }
  return body.map(row => {
    const line = row.replace('P', id).padEnd(13).slice(0, 13);
    return mirrored ? [...line].reverse().map(c => ({ '/': '\\', '\\': '/', '>': '<', '(': ')', ')': '(' })[c] ?? c).join('') : line;
  });
}

export function renderWorld(s, columns = 80, rows = 30, decision = null) {
  const w = Math.max(24, Math.min(240, Math.floor(columns))), h = Math.max(10, Math.min(100, Math.floor(rows)));
  const grid = Array.from({ length: h }, () => Array(w).fill(' '));
  const put = (x, y, c) => { const col = Math.round(x), row = Math.round(y); if (row >= 0 && row < h && col >= 0 && col < w) grid[row][col] = c; };
  const text = (x, y, str) => [...str].forEach((c, i) => put(x + i, y, c));
  if (s.game === 'pong') {
    const project = (x, y, c) => put(x / 95 * (w - 1), y / 31 * (h - 1), c);
    for (let x = 0; x < w; x++) { put(x, 0, '#'); put(x, h - 1, '#'); }
    for (let y = 1; y < h - 1; y++) if (y % 2 === 0) put(Math.floor(w / 2), y, '|');
    for (let y = 0; y < h; y++) { const wy = y / (h - 1) * 31; if (Math.abs(wy - s.playerY) <= s.paddleHalf) put(3 / 95 * (w - 1), y, 'P'); if (Math.abs(wy - s.enemyY) <= s.paddleHalf) put(92 / 95 * (w - 1), y, 'E'); }
    const p = decision?.prediction;
    if (p && Number.isFinite(p.y)) { if (p.sigma) for (let y = p.y - p.sigma; y <= p.y + p.sigma; y += .5) project(1, y, '.'); project(1, p.y, ':'); }
    if (s.lastContact && s.tick - s.lastContact.tick < 40) project(2, s.lastContact.y, 'x');
    if (PONG_BANDS[s.difficulty].delay) project(s.observed.x, s.observed.y, '*');
    project(s.ball.x, s.ball.y, 'o');
    text(2, 1, `${s.score[0]} : ${s.score[1]}  BAND ${s.difficulty} ${PONG_BANDS[s.difficulty].name}`.slice(0, w - 4));
  } else if (s.game === 'platformer') {
    const span = Math.max(48, Math.min(w, 150)), scale = (w - 1) / span, offset = Math.max(0, Math.min(s.width - span, s.x - span * .3)), ys = (h - 1) / 34;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (terrainSolid(s, offset + x / scale, y / ys)) grid[y][x] = '#';
    const p = (x, y, c) => put((x - offset) * scale, y * ys, c);
    for (const z of s.wind) for (let x = z.x0; x <= z.x1; x += 2) { p(x, 19, '~'); p(x + 1, 21, '~'); }
    s.checkpoints.forEach(x => p(x, 27, '!'));
    s.coins.filter(c => !c.taken).forEach(c => p(c.x, c.y, '$')); s.spikes.forEach(x => p(x + .5, 27.5, '^'));
    s.enemies.forEach(e => p(e.x, 27.5, 'E')); p(s.exit, 26.5, 'X'); p(s.x, s.y - .5, '@');
  } else if (s.game === 'fighter') {
    const [P, E] = s.fighters, floor = h - 2, rowsPerUnit = 1.1;
    const span = Math.min(120, Math.max(36, w / 1.6, Math.abs(E.x - P.x) + 30)), offset = Math.max(0, Math.min(120 - span, (P.x + E.x) / 2 - span / 2));
    for (let x = 0; x < w; x++) put(x, floor, '-');
    for (let y = 0; y <= floor; y++) { put(((2 - offset) / span) * (w - 1), y, '#'); put(((118 - offset) / span) * (w - 1), y, '#'); }
    const draw = (f, enemy) => { const col = (f.x - offset) / span * (w - 1), pose = combatPose(s, enemy), lift = Math.round(f.y * rowsPerUnit);
      fighterSprite(pose, enemy ? 'E' : 'P', f.facing < 0).forEach((row, y) => [...row].forEach((c, dx) => { if (c !== ' ') put(col + dx - 6, Math.max(1, floor - 11 - lift + y), c); })); };
    draw(P, false); draw(E, true);
    const bar = (hp, label) => label + ' [' + '#'.repeat(Math.ceil(hp / 5)).padEnd(20, '.') + '] ' + hp;
    text(2, 0, bar(P.health, 'P')); text(Math.max(2, w - 30), 0, bar(E.health, 'E'));
    text(Math.max(0, Math.floor(w / 2) - 4), 1, `T-${Math.max(0, s.roundTicks - s.tick)}`);
  } else {
    // Top-down scrolling road: 1 column = 1 lateral unit (road = 18 columns), 1 row = 2 distance units; corners bend the road ahead.
    const P = s.player, playerRow = Math.min(h - 3, Math.floor(h * .72)), mid = Math.floor(w / 2), halfW = 9, edge = 10.5;
    const centre = new Map(); let off = 0, heading = 0;
    for (let r = playerRow; r >= 0; r--) { centre.set(r, off); const seg = segmentAt(s.track, P.s + (playerRow - r) * 2); heading += seg.kappa * 2; off -= heading * 2 * .5; off = Math.max(-(mid - 13), Math.min(mid - 13, off)); }
    for (let r = playerRow + 1; r < h; r++) centre.set(r, 0);
    for (let y = 0; y < h; y++) {
      const c = mid + centre.get(y), d = P.s + (playerRow - y) * 2, seg = segmentAt(s.track, d);
      for (let x = 0; x < w; x++) { const dx = x - c; grid[y][x] = Math.abs(dx) > edge + .5 ? ((x * 7 + Math.floor(d) * 3) % 11 === 0 ? ',' : ' ') : Math.abs(dx) > halfW ? ' ' : seg.wet && (x + Math.floor(d)) % 3 === 0 ? '~' : ' '; }
      put(c - halfW - .5, y, '|'); put(c + halfW + .5, y, '|'); put(c - edge - .5, y, '#'); put(c + edge + .5, y, '#');
      if (Math.floor(d) % 8 < 4) put(c, y, ':');
      if (Math.floor(d) % s.track.lapLength < 2) for (let x = -halfW; x <= halfW; x++) put(c + x, y, '=');
    }
    const car = (c, y, id) => { const col = mid + (centre.get(Math.round(y)) ?? 0) - c.n; ['/' + id + '\\', '[_]'].forEach((row, dy) => [...row].forEach((ch, dx) => put(col + dx - 1, Math.round(y) + dy - 1, ch))); };
    s.rivals.forEach((c, i) => { const y = playerRow - (c.s - P.s) / 2; if (y < 1 || y > h - 2) { put(0, i + 1, c.id); put(1, i + 1, y < 1 ? '^' : 'v'); } else car(c, y, c.id); });
    car(P, playerRow, 'P');
  }
  return grid.map(row => row.join('')).join('\n');
}

export function stateLines(s) {
  if (s.game === 'pong') { const b = PONG_BANDS[s.difficulty];
    return [`score P:${s.score[0]} E:${s.score[1]} / first to 7`, `band ${s.difficulty} ${b.name}`, `paddle y=${fmt(s.playerY)} enemy=${fmt(s.enemyY)}`, `ball (true) x=${fmt(s.ball.x)} y=${fmt(s.ball.y)}`,
      `ball (observed) x=${fmt(s.observed.x)} y=${fmt(s.observed.y)} @t${s.observed.tick}`, `sensor delay=${b.delay} noise=${b.noise ? 'PRESENT' : 'NONE'} spin=${b.spin}`,
      `last contact=${s.lastContact ? `y=${fmt(s.lastContact.y)} offset=${fmt(s.lastContact.offset)} @t${s.lastContact.tick}` : 'NONE'}`, `rally=${s.rally}`]; }
  if (s.game === 'platformer') { const sec = s.sections.find(x => s.x >= x.x0 && s.x < x.x1);
    return [`health=${s.health}/${s.lives} life=${s.life} checkpoint=${s.checkpoint}`, `position=${fmt(s.x)},${fmt(s.y)}`, `velocity=${fmt(s.vx)},${fmt(s.vy)}`,
      `grounded=${s.grounded} jumpHeld=${s.jumpHeld} invuln=${s.invulnerable}`, `legal=${s.terminal ? 'NONE' : (s.grounded ? 'ALL' : s.jumpHeld && s.vy < 0 ? 'AIR+HOLD' : 'AIR')}`,
      `section=${sec ? sec.id + ' ' + sec.type : 'NONE'}`, `goal=EXIT@${s.exit} progress=${fmt(s.metrics.maxProgress * 100)}%`, `next gap=${s.gaps.find(g => g[1] >= s.x)?.join('..') ?? 'NONE'}`]; }
  if (s.game === 'fighter') { const [P, E] = s.fighters, desc = f => `${phaseOf(f)}${f.move ? ' ' + f.move.name + ':' + f.move.t : ''}${f.stun ? ' ' + f.stun.kind + ':' + f.stun.t : ''}`;
    return [`health P:${P.health} E:${E.health} time=${Math.max(0, s.roundTicks - s.tick)}`, `position P:${fmt(P.x)},${fmt(P.y)} E:${fmt(E.x)},${fmt(E.y)}`, `distance=${fmt(Math.abs(E.x - P.x))}`,
      `facing P:${P.facing > 0 ? 'RIGHT' : 'LEFT'} E:${E.facing > 0 ? 'RIGHT' : 'LEFT'}`, `P ${desc(P)} guard=${P.guard}`, `E ${desc(E)} guard=${E.guard}`, `opponent archetype=HIDDEN (${s.terminal ? s.style : 'revealed at end'})`]; }
  const P = s.player, seg = segmentAt(s.track, P.s), hud = driverInfo(observe(s)), nc = hud.nextCorner;
  return [`lap=${Math.min(s.lap + 1, 3)}/3 distance=${fmt(P.s)}`, `lane=${fmt(P.n)} heading=${fmt(P.psi)} steer=${fmt(P.delta)}`, `speed=${fmt(P.v)} offTrack=${P.offTrack} sliding=${P.sliding}`,
    `segment=${seg.name}${seg.wet ? ' WET' : ''} R=${seg.kappa ? Math.round(1 / Math.abs(seg.kappa)) : 'INF'}`,
    `next corner=${nc ? `${nc.direction} R${nc.radius} in ${f2(nc.distance)}${nc.wet ? ' WET' : ''} vmax=${f2(nc.maxSpeed)}` : 'NONE IN PREVIEW'}`,
    `braking distance=${f2(hud.brakingDistance)} grip use=${f2(hud.gripUsage)}`,
    `gap ahead=${hud.nearestAhead ? hud.nearestAhead.id + ' +' + f2(hud.nearestAhead.ds) : 'NONE'} behind=${hud.nearestBehind ? hud.nearestBehind.id + ' ' + f2(hud.nearestBehind.ds) : 'NONE'}`,
    `overtake=${hud.overtakeOpportunity ? 'OPPORTUNITY' : 'NO'} off-track risk=${f2(hud.offTrackRisk)}`, 'STANDINGS (gap: + ahead / - behind)',
    ...raceStandings(s).map(c => `${c.place}. ${c.id} ${c.name.padEnd(8)} ${c.gap >= 0 ? '+' : ''}${fmt(c.gap)}${c.finishedTick !== null ? ' FIN@' + c.finishedTick : ''}`)];
}
// Phase 8 diagnostic panel. `context` carries session history: last failure, last adaptation trigger, last preterminal recommendation.
export function diagnosticLines(s, decision = null, context = {}) {
  const terminal = s.terminal, d = decision ?? {};
  const trig = d.adaptationTrigger ?? context.lastTrigger ?? null, failure = d.lastFailure ?? context.lastFailure ?? null;
  const fail = failure ? (failure.cause ? `${failure.cause} sec ${failure.section ?? '-'} @x=${failure.position?.[0] ?? '-'} strat=${failure.strategy ?? '-'}` : JSON.stringify(failure).slice(0, 60)) : 'NONE';
  const opp = s.game === 'fighter' ? (d.opponentStatus ?? 'UNKNOWN') : s.game === 'pong' ? `${s.opponent.mode}${d.opponentLean !== undefined ? ' lean=' + f2(d.opponentLean) : ''}` : s.game === 'racing' ? (() => { const st = raceStandings(s), me = st.find(c => c.id === 'P'), near = st.filter(c => c.id !== 'P').sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))[0]; return `P${me.place}/4 nearest ${near.id} ${near.gap >= 0 ? '+' : ''}${f2(near.gap)}`; })() : `${s.enemies.length} patrols visible`;
  return [
    `CURRENT_OBJECTIVE=${terminal ? 'NONE (terminal)' : d.objective ?? 'MANUAL'}`,
    `CONTROLLER=${d.controller ?? context.controller ?? 'MANUAL'}`,
    `ACTION=${terminal ? 'NO_ACTION_TERMINAL' : d.action ?? 'MANUAL_INPUT'}`,
    `REASON=${terminal ? 'episode ended: ' + s.result : d.reason ?? 'N/A'}`,
    `PLANNING_HORIZON=${terminal ? 'N/A' : d.planningHorizon ?? (d.horizon ?? 'N/A')}`,
    `LAST_FAILURE=${fail}`,
    `ADAPTATION_TRIGGER=${trig ? trig.type + (trig.to ? '->' + trig.to : '') + (trig.key ? ' ' + trig.key : '') : 'NONE'}`,
    `OPPONENT_STATUS=${opp}`,
    `RESULT=${s.result}`,
    ...(terminal && context.lastPreterminal ? [`last preterminal recommendation=${context.lastPreterminal.action} @t${context.lastPreterminal.sourceTick}`] : []),
  ];
}
export function panels(s, decision = null, context = {}) {
  const m = metricsOf(s), live = s.terminal ? null : decision;
  return { diagnostic: diagnosticLines(s, live, context),
    state: [`tick=${s.tick} seed=${s.seed} difficulty=${s.difficulty}`, ...stateLines(s), `result=${s.result}`],
    decision: [`recommended=${s.terminal ? 'NO_ACTION_TERMINAL' : live?.action ?? 'NOT_REQUESTED'}`, `source=${live?.source ?? 'MANUAL'}`, `confidence=NOT_AVAILABLE`, `horizon=${live?.horizon ?? 'N/A'}`,
      `branches=${live?.branches ?? 'N/A'} latency ms=${live?.latencyMs !== undefined ? f2(live.latencyMs) : 'N/A'}`, ...((live?.ranking ?? []).slice(0, 8).map(r => `${String(r.action).slice(0, 34).padEnd(34)} Q=${fmt(r.value)}${r.visits !== undefined ? ' n=' + r.visits : ''}`)),
      `legal: ${(s.terminal ? [] : ACTIONS[s.game]).join(' ')}`],
    trace: [`last action=${s.lastAction}${s.audit && !s.audit.legal ? ` (requested ${s.audit.requested} -> applied ${s.audit.applied}: ${s.audit.reason})` : ''}`, `reward=${fmt(s.reward)} (shaped)`, `events=${s.events.join(', ') || 'NONE'}`, `phase=${s.terminal ? 'TERMINAL' : 'ACTIVE'}`],
    metrics: Object.entries(m).map(([k, v]) => `${k}=${typeof v === 'boolean' ? v : fmt(v)}`),
  };
}
export function terminalFrame(s, decision, columns = 100, rows = 40, context = {}) {
  const width = Math.max(60, columns), height = Math.max(24, rows), panelWidth = Math.min(46, Math.floor(width * .4));
  const worldWidth = width - panelWidth - 3, bodyHeight = height - 4, p = panels(s, decision, context);
  const compress = lines => lines.map(l => l.replaceAll('NOT_MEASURED', 'N/A').replaceAll('NOT_AVAILABLE', 'N/A').replaceAll('NOT_REQUESTED', 'N/A'));
  const detailed = Object.entries(p).flatMap(([name, lines]) => [name.toUpperCase(), ...compress(lines), '']);
  const compact = ['DIAGNOSTIC', ...compress(p.diagnostic).slice(0, 9), 'STATE', ...compress(p.state).slice(0, 3), 'METRICS', ...compress(p.metrics)];
  const sidebar = detailed.length <= bodyHeight ? detailed : compact;
  const field = renderWorld(s, worldWidth, bodyHeight, decision).split('\n');
  const keys = { pong: 'UP / DOWN move; HOLD is idle', platformer: 'LEFT/RIGHT move | UP/J jump (hold to rise) | H/K jump left/right | C crouch', fighter: 'LEFT/RIGHT walk | UP jump | A light | S heavy | D low | B guard high | V guard low | C crouch', racing: 'UP accelerate | DOWN brake | LEFT / RIGHT steer' };
  return [TITLES[s.game] + ' | ASCII WORLDS 2.0 | R0 LOCAL SIMULATION | DIAGNOSTIC',
    ...field.map((line, i) => line + ' | ' + (sidebar[i] ?? '').slice(0, panelWidth)),
    'LEGEND ' + LEGENDS[s.game], keys[s.game],
    `${s.result} | SPACE pause | N step | R reset | Q quit`,
  ].map(line => line.slice(0, width).padEnd(width)).join('\n');
}
