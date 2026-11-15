#!/usr/bin/env node
import readline from 'node:readline';
import { createGame, stepGame, GAMES } from './games.mjs';
import { createController, PRIMARY_BASELINE } from './controllers/index.mjs';
import { terminalFrame } from './render.mjs';
import { playbackAfter, manualAction } from './playback.mjs';
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const game = arg('--game', 'pong'), mode = arg('--mode', 'sentinel'), seed = Number(arg('--seed', '1')), difficulty = Number(arg('--difficulty', '3')), style = arg('--style', 'ADAPTIVE');
if (!GAMES.includes(game) || !['manual', 'sentinel', 'prime', 'baseline'].includes(mode)) throw Error('Use --game pong|platformer|fighter|racing --mode sentinel|prime|baseline|manual [--difficulty 1-5]');
const kind = { sentinel: 'SENTINEL', prime: 'INCUMBENT_ROOT_PUCT', baseline: PRIMARY_BASELINE[game] }[mode];
const fresh = () => ({ state: createGame(game, { seed, difficulty, style }), controller: kind ? createController(game, kind, { seed }) : null, context: {} });
let { state, controller, context } = fresh(), decision = null, running = playbackAfter(mode, false, 'ready');
const idle = game === 'fighter' || game === 'platformer' ? 'WAIT' : 'HOLD';
const controls = { pong: { up: 'UP', down: 'DOWN' }, platformer: { left: 'MOVE_LEFT', right: 'MOVE_RIGHT', up: 'JUMP', j: 'JUMP', h: 'JUMP_LEFT', k: 'JUMP_RIGHT', c: 'CROUCH' },
  fighter: { left: 'MOVE_LEFT', right: 'MOVE_RIGHT', up: 'JUMP', a: 'LIGHT_ATTACK', s: 'HEAVY_ATTACK', d: 'LOW_ATTACK', b: 'BLOCK_HIGH', v: 'BLOCK_LOW', c: 'CROUCH' }, racing: { up: 'ACCELERATE', down: 'BRAKE', left: 'TURN_LEFT', right: 'TURN_RIGHT' } };
let action = idle;
function draw() { process.stdout.write('\x1b[H' + terminalFrame(state, decision, process.stdout.columns ?? 100, process.stdout.rows ?? 44, context) + '\x1b[J'); }
function tick() {
  if (state.terminal) { running = false; decision = { action: 'NO_ACTION_TERMINAL' }; return; }
  decision = controller ? controller.decide(state) : null;
  const applied = decision?.action ?? manualAction(game, [action], action, state);
  if (decision) { context.lastPreterminal = decision; if (decision.adaptationTrigger) context.lastTrigger = decision.adaptationTrigger; if (decision.lastFailure) context.lastFailure = decision.lastFailure; context.controller = decision.controller; }
  state = stepGame(state, applied); action = idle; draw();
}
if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.includes('--snapshot')) {
  process.stdout.write(terminalFrame(state, null, 120, 50) + '\n');
} else {
  readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true);
  process.stdout.write('\x1b[?1049h\x1b[?25l');
  let timer;
  const cleanup = () => { clearInterval(timer); process.stdin.setRawMode(false); process.stdout.write('\x1b[?25h\x1b[?1049l'); process.stdin.pause(); };
  process.on('exit', () => { if (process.stdin.isRaw) cleanup(); });
  process.on('SIGINT', () => { cleanup(); process.exit(); }); process.on('SIGTERM', () => { cleanup(); process.exit(); });
  process.stdout.on('resize', draw);
  process.stdin.on('keypress', (_, key) => {
    if (key.name === 'q' || key.ctrl && key.name === 'c') { cleanup(); process.exit(); }
    if (key.name === 'space') running = !running;
    else if (key.name === 'r') { ({ state, controller, context } = fresh()); decision = null; running = playbackAfter(mode, false, 'ready'); draw(); }
    else if (key.name === 'n') tick();
    else if (controls[game][key.name]) { action = controls[game][key.name]; if (!running) tick(); }
  });
  timer = setInterval(() => { if (running) tick(); }, 100); draw();
}
