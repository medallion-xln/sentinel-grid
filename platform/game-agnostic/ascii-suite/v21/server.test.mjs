import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemporalServer } from './server.mjs';
import { advanceWorld } from './scenarios.mjs';
import { hash } from './freeze.mjs';
test('2.1 HTTP: observation controls, cached decisions, equal opponents, provenance, exact replay, CORS and terminal behavior', async () => {
  const server = createTemporalServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const api = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
    const html = await (await fetch(base)).text(); assert.ok(html.includes('OBSERVATION') && html.includes('NOT CERTIFIED PRIME'));
    for (const game of ['platformer', 'pong', 'fighter', 'racing']) {
      const reset = await api('/api/reset', { game, config: { seed: 112001, difficulty: 3, observationCondition: 'DELAY3', style: 'MIRROR_V2' } }); assert.equal(reset.status, 200); const id = reset.body.id;
      const first = await api('/api/decision', { id, mode: 'sentinel' }), again = await api('/api/decision', { id, mode: 'sentinel' }); assert.equal(JSON.stringify(first.body.decision), JSON.stringify(again.body.decision));
      let last; for (let i = 0; i < 20; i++) { last = await api('/api/step', { id, mode: 'sentinel' }); assert.equal(last.status, 200); }
      assert.ok(last.body.decision.observationAge >= 3); assert.equal(last.body.context.canDispatch, false); assert.equal(last.body.context.canMutateLiveWorld, false);
      const replay = await (await fetch(base + '/api/export?id=' + id)).json(); let s = replay.initialState;
      for (const a of replay.actions) { s = advanceWorld(s, a.action, a.opponentAction); assert.equal(hash(s), a.stateHash); }
      assert.equal(hash(s), replay.finalStateHash); assert.ok(replay.actions.some(a => a.packet?.payload));
      assert.equal((await api('/api/step', { id, mode: 'manual', action: 'INVALID' })).status, 400);
    }
    const denied = await fetch(base + '/api/reset', { method: 'POST', headers: { Origin: 'https://example.invalid' }, body: '{}' }); assert.equal(denied.status, 403);
    assert.equal((await fetch(base + '/../package.json')).status, 404);
    const terminalReset = await api('/api/reset', { game: 'platformer', config: { seed: 112001, difficulty: 1 } }); let terminal = terminalReset.body;
    for (let t = 0; t < 600 && !terminal.state.terminal; t++) terminal = (await api('/api/step', { id: terminal.id, mode: 'sentinel' })).body;
    assert.equal(terminal.state.result, 'WIN');
    assert.equal((await api('/api/decision', { id: terminal.id, mode: 'sentinel' })).body.decision.action, 'NO_ACTION_TERMINAL');
    assert.equal((await api('/api/step', { id: terminal.id, mode: 'sentinel' })).status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
