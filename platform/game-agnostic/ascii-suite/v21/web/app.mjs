import { ACTIONS, TITLES } from '/games.mjs';
import { renderWorld, panels, LEGENDS } from '/render.mjs';
import { playbackAfter, manualAction } from '/playback.mjs';
const $ = id => document.getElementById(id);
let game = 'pong', session = null, decision = null, running = false, busy = false, manual = 'HOLD', resetVersion = 0;
const bindings = {
  pong: { ArrowUp: 'UP', ArrowDown: 'DOWN' }, platformer: { ArrowLeft: 'MOVE_LEFT', ArrowRight: 'MOVE_RIGHT', ArrowUp: 'JUMP', j: 'JUMP', h: 'JUMP_LEFT', k: 'JUMP_RIGHT', c: 'CROUCH' },
  fighter: { ArrowLeft: 'MOVE_LEFT', ArrowRight: 'MOVE_RIGHT', ArrowUp: 'JUMP', a: 'LIGHT_ATTACK', s: 'HEAVY_ATTACK', d: 'LOW_ATTACK', b: 'BLOCK_HIGH', v: 'BLOCK_LOW', c: 'CROUCH' },
  racing: { ArrowUp: 'ACCELERATE', ArrowDown: 'BRAKE', ArrowLeft: 'TURN_LEFT', ArrowRight: 'TURN_RIGHT' },
};
const idle = () => game === 'platformer' || game === 'fighter' ? 'WAIT' : 'HOLD';
const held = new Map();
async function api(path, body) { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await r.json(); if (!r.ok) throw Error(data.error); return data; }
function pause() { running = false; }
function draw() {
  if (!session) return;
  const s = session.state, pre = $('world'), box = pre.getBoundingClientRect(), cs = getComputedStyle(pre);
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.font = `${cs.fontSize} ${cs.fontFamily}`;
  const cols = Math.floor(box.width / context.measureText('M').width), rows = Math.floor(box.height / parseFloat(cs.lineHeight));
  pre.textContent = renderWorld(s, cols, rows, decision); $('title').textContent = 'WORLD / ' + TITLES[game];
  // A decision belongs to the source tick, not the successor state shown on screen. After a terminal outcome no action is shown.
  const p = panels(s, decision, session.context ?? {}); for (const id of ['diagnostic', 'state', 'decision', 'trace', 'metrics']) $(id).textContent = p[id].join('\n');
  const d = s.terminal ? session.context?.lastPreterminal : decision;
  const compact = value => value === undefined || value === null ? 'UNKNOWN' : typeof value === 'string' ? value : JSON.stringify(value);
  $('temporal').textContent = [
    'CONTROLLER=' + (d?.controller ?? 'UNKNOWN'),
    'OBSERVED / id=' + (d?.observationId?.slice(0, 12) ?? 'UNKNOWN'),
    'OBSERVATION_AGE=' + compact(d?.observationAge),
    'OBSERVATION_STATUS=' + compact(d?.observationStatus),
    (d?.provenance ?? 'UNKNOWN') + ' / ESTIMATED_STATE=' + compact(d?.estimatedState),
    'UNCERTAINTY=' + compact(d?.uncertainty),
    'ACTION=' + (s.terminal ? 'NO_ACTION_TERMINAL' : d?.action ?? 'MANUAL'),
    'ACTION_EXECUTION_TICK=' + compact(d?.estimatedActionExecutionTick),
    'PREDICTED / HORIZON=' + compact(d?.planningHorizon ?? d?.horizon),
    'REPLAN_REASON=' + compact(d?.replanReason),
    'MEMORY_USED=' + compact(d?.memoryUsed),
    'OPPONENT_MODEL_STATUS=' + compact(d?.opponentStatus),
    'LAST_FAILURE=' + compact(d?.lastFailure ?? session.context?.lastFailure),
    'DERIVED / EPISODE_PROGRESS=' + compact(s.game === 'platformer' ? s.metrics.maxProgress : s.game === 'racing' ? s.lap + '/3 laps' : s.game === 'pong' ? s.score : s.fighters.map(f => f.health)),
    'OUTCOME=' + s.result,
    'EVIDENCE_STATUS=DIAGNOSTIC_TASK_CONTROLLER_NOT_CANONICAL_MOE',
  ].join('\n');
  if (decision && !s.terminal) $('decision').textContent += `\nrecommendation source tick=${decision.sourceTick}`;
  $('legend').textContent = 'LEGEND / ' + LEGENDS[game];
  $('keys').textContent = Object.entries(bindings[game]).map(([k, v]) => `${k.replace('Arrow', '')}:${v}`).join(' | ') + ' | SPACE pause | N step | R reset | F full screen';
  const mode = $('mode').value, source = { sentinel: 'TEMPORAL TASK PLANNER V3', prime: 'FROZEN TASK PLANNER V2', baseline: 'RULE BASELINE', manual: 'MANUAL' }[mode];
  $('play').textContent = running ? 'PAUSE' : mode === 'manual' ? 'RUN MANUAL' : 'RUN ' + source.split(' (')[0];
  $('status').textContent = `${running ? source + ' PLAYING' : 'PAUSED / ' + source} / tick=${s.tick} / ${s.result} / Deterministic tick time / confidence NOT_AVAILABLE`;
  $('step').disabled = s.terminal; $('play').disabled = s.terminal;
  document.querySelectorAll('#actions button').forEach(b => b.disabled = s.terminal || $('mode').value !== 'manual');
}
async function reset() {
  pause(); const version = ++resetVersion; held.clear(); decision = null; session = null; manual = idle();
  try {
    const next = await api('/api/reset', { game, config: { seed: Number($('seed').value), difficulty: Number($('difficulty').value), style: $('style').value, observationCondition: $('observation-condition').value } });
    if (version !== resetVersion) return; session = next;
    running = playbackAfter($('mode').value, running, 'ready');
    $('actions').replaceChildren(...ACTIONS[game].map(action => { const button = document.createElement('button'); button.textContent = action; button.onclick = () => { manual = action; tick(true); }; return button; }));
    draw();
  } catch (e) { $('status').textContent = 'ERROR / ' + e.message; }
}
async function tick(force = false) {
  if (busy || !session || session.state.terminal || !running && !force) return;
  busy = true; const version = resetVersion;
  try {
    const mode = $('mode').value, action = manualAction(game, held.values(), manual, session.state);
    const next = await api('/api/step', { id: session.id, mode, action });
    if (version !== resetVersion) return;
    session = { ...next, applied: true }; decision = next.decision; manual = idle();
    if (session.state.terminal) decision = { action: 'NO_ACTION_TERMINAL', sourceTick: session.state.tick, lastPreterminal: next.context?.lastPreterminal ?? null };
    if (session.state.terminal) pause(); draw();
  } catch (e) { pause(); $('status').textContent = 'ERROR / ' + e.message; } finally { busy = false; }
}
document.querySelectorAll('[data-game]').forEach(button => button.onclick = () => {
  game = button.dataset.game; document.querySelectorAll('[data-game]').forEach(b => b.classList.toggle('active', b === button)); reset();
});
$('play').onclick = () => { running = playbackAfter($('mode').value, running, 'toggle'); draw(); };
$('step').onclick = () => tick(true); $('reset').onclick = reset;
$('observation-condition').onchange = reset; $('style').onchange = reset;
$('mode').onchange = async () => {
  pause(); const version = resetVersion;
  if (!session || session.state.terminal) { draw(); return; }
  try {
    const next = await api('/api/decision', { id: session.id, mode: $('mode').value });
    if (version !== resetVersion) return;
    if (next.state.tick >= session.state.tick) { session = next; decision = next.decision; }
    running = playbackAfter($('mode').value, running, 'mode-change'); draw();
  } catch (e) { pause(); draw(); $('status').textContent = 'ERROR / ' + e.message; }
};
$('fullscreen').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(e => { $('status').textContent = 'FULL SCREEN / ' + e.message; });
$('export').onclick = async () => { if (!session) return; const r = await fetch('/api/export?id=' + session.id); if (!r.ok) return; const blob = await r.blob(), a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = `sentinel-${game}-seed${session.state.seed}-replay.json`; a.click(); URL.revokeObjectURL(url); };
document.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(document.activeElement.tagName) && e.key !== 'Escape') return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (bindings[game][key]) { e.preventDefault(); held.set(key, bindings[game][key]); if (!running && !e.repeat) { manual = bindings[game][key]; tick(true); } }
  else if (key === ' ') { e.preventDefault(); $('play').click(); }
  else if (key === 'n') tick(true); else if (key === 'r') reset(); else if (key === 'f') $('fullscreen').click();
});
document.addEventListener('keyup', e => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => { held.clear(); running = playbackAfter($('mode').value, running, 'blur'); draw(); });
new ResizeObserver(draw).observe($('world-section'));
async function loop() { await tick(); setTimeout(loop, 1000 / Number($('speed').value)); }
document.querySelector('[data-game="pong"]').classList.add('active'); await reset(); loop();
