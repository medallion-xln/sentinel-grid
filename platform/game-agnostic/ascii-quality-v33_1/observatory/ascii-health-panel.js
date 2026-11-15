// ASCII Worlds v33.1 game-health panel: reads only /api/ascii-v33-1/*; shown in STAGE 3H EVALUATION mode (hidden in LIVE/FORENSIC).
const $ = (id) => document.getElementById(id), root = $('asciiHealth'), mode = $('mode');
const h = (tag, attributes = {}, ...children) => { const node = document.createElement(tag); for (const [k, v] of Object.entries(attributes)) { if (k === 'class') node.className = v; else if (v !== undefined && v !== null) node.setAttribute(k, String(v)); } for (const c of children.flat(Infinity)) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : String(c)); return node; };
const CLASS = { VALID: 'good', WITNESS_FOUND: 'good', EXACT: 'good', REPAIRED_CANDIDATE: 'good', DEFECT_RECORDED: 'bad', DIVERGED: 'bad', NOT_ESTABLISHED: 'warning', REFERENCE_NOT_ESTABLISHED: 'warning', NOT_APPLICABLE: 'unknown', NO_REPAIR: 'unknown' };
const status = (v) => { const s = String(v ?? 'NOT_ESTABLISHED'); const key = Object.keys(CLASS).find((k) => s.startsWith(k)); return h('span', { class: 'status ' + (CLASS[key] ?? 'warning') }, s.replaceAll('_', ' ')); };
const table = (headers, rows) => h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, headers.map((n) => h('th', { scope: 'col' }, n)))), h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
let index = null, rendering = false;
async function render() {
  if (!root) return; if (mode.value !== 'STAGE3H') { root.hidden = true; return; } if (rendering) return; rendering = true;
  try {
    if (!index) index = await (await fetch('/api/ascii-v33-1/index')).json();
    const header = h('div', { class: 'canvas-chrome' }, h('h2', {}, 'ASCII WORLDS v33.1 GAME HEALTH'), h('span', {}, `audited levels ${index.auditLevels}/24 · evidence files ${Object.keys(index.files).length} · R0 read-only`));
    const body = h('div', { class: 'intelligence' }, h('div', { class: 'notice' }, 'Every cell traces to an immutable evidence file (hash shown per row). WORLD_VALID, WORLD_SOLVABLE, CONTROLLER_COMPETENT and BENCHMARK_QUALIFIED are independent claims; nothing here is a live result or a simulated success.'),
      index.missing.length ? h('p', { class: 'empty' }, 'Missing evidence (NOT ESTABLISHED): ' + index.missing.join(', ')) : null,
      table(['GAME', 'LEVEL', 'WORLD_HEALTH', 'REFERENCE_SOLVABILITY', 'STRONG_WIN_RATE', 'TIMEOUT_RATE', 'ILLEGAL_ACTION_RATE', 'REPLAY_STATUS', 'VERSION', 'KNOWN_DEFECTS', 'ROOT_CAUSE', 'REPAIR_STATUS', 'CANDIDATE_RESULT', 'SOURCE'],
        index.rows.map((r) => [r.GAME, r.LEVEL, status(r.WORLD_HEALTH), status(r.REFERENCE_SOLVABILITY), r.STRONG_WIN_RATE, r.TIMEOUT_RATE, r.ILLEGAL_ACTION_RATE, status(r.REPLAY_STATUS), h('small', {}, r.VERSION), h('small', {}, r.KNOWN_DEFECTS), h('small', {}, r.ROOT_CAUSE), status(r.REPAIR_STATUS), h('small', {}, r.CANDIDATE_RESULT), h('small', {}, r.sources.map((s) => s.file.split('/').pop() + ' ' + s.sha256.slice(0, 12) + '…').join(' · ') || 'NOT ESTABLISHED')])));
    root.replaceChildren(header, body); root.hidden = false;
  } catch (error) { root.replaceChildren(h('p', { class: 'empty' }, 'ASCII game-health evidence unavailable: ' + error.message)); root.hidden = false; } finally { rendering = false; }
}
mode.addEventListener('change', render); render();
