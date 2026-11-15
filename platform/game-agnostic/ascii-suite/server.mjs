import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGame, stepGame, ACTIONS, ENGINE_VERSION } from './games.mjs';
import { createController, CONTROLLERS, PRIMARY_BASELINE } from './controllers/index.mjs';
import { sourceManifest } from './provenance.mjs';

export const MODES = ['manual', 'sentinel', 'prime', 'baseline'];
const kindFor = (game, mode, controller) => controller && CONTROLLERS[game].includes(controller) ? controller : mode === 'sentinel' ? 'SENTINEL' : mode === 'prime' ? 'INCUMBENT_ROOT_PUCT' : mode === 'baseline' ? PRIMARY_BASELINE[game] : null;
const summarize = d => d && { action: d.action, source: d.source, controller: d.controller, sourceTick: d.sourceTick, reason: d.reason ?? null, planningHorizon: d.planningHorizon ?? d.horizon ?? null,
  branches: d.branches ?? null, adaptationTrigger: d.adaptationTrigger ?? null, strategy: d.strategy ?? null, legal: d.legal ?? null, latencyMs: d.latencyMs ?? null };

export function createSuiteServer() {
  const sessions = new Map();
  const provenance = sourceManifest();
  function decisionFor(session, mode, controller) {
    const s = session.state, kind = kindFor(s.game, mode, controller);
    if (!kind) return null;
    if (s.terminal) return { action: 'NO_ACTION_TERMINAL', source: kind, sourceTick: s.tick, terminal: true, lastPreterminal: session.context.lastPreterminal };
    if (session.pending && session.pending.tick === s.tick && session.pending.kind === kind) return session.pending.decision;
    session.controllers[kind] ??= createController(s.game, kind, { seed: s.seed });
    const decision = session.controllers[kind].decide(s);
    session.pending = { tick: s.tick, kind, decision };
    return decision;
  }
  return http.createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && ['/api/reset', '/api/step', '/api/decision'].includes(url.pathname)) {
        if (req.headers.origin && !['http://localhost:' + req.headers.host?.split(':').at(-1), 'http://' + req.headers.host].includes(req.headers.origin)) return json(403, { error: 'Cross-origin request refused' });
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) { json(413, { error: 'Request too large' }); return; } }
        const body = JSON.parse(text || '{}');
        if (url.pathname === '/api/reset') {
          const state = createGame(body.game, body.config); const id = randomUUID();
          if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
          sessions.set(id, { state, history: [], initial: structuredClone(state), controllers: {}, pending: null, context: { lastFailure: null, lastTrigger: null, lastPreterminal: null, controller: null } });
          return json(200, { id, state, decision: null, context: sessions.get(id).context });
        }
        const session = sessions.get(body.id); if (!session) return json(404, { error: 'Session expired; reset' });
        if (!MODES.includes(body.mode)) return json(400, { error: 'Unknown control mode' });
        if (url.pathname === '/api/decision') return json(200, { id: body.id, state: session.state, decision: decisionFor(session, body.mode, body.controller), context: session.context });
        if (session.state.terminal) return json(409, { error: 'Terminal episode; reset', decision: { action: 'NO_ACTION_TERMINAL' }, context: session.context });
        const decision = decisionFor(session, body.mode, body.controller);
        const action = decision?.action ?? body.action;
        if (!ACTIONS[session.state.game].includes(action)) return json(400, { error: 'Illegal action' });
        const next = stepGame(session.state, action);
        session.history.push({ tick: next.tick, action, source: decision?.source ?? 'MANUAL', controller: decision?.controller ?? 'MANUAL', reward: next.reward, events: next.events, audit: next.audit,
          decision: summarize(decision), stateHash: decision?.stateHash ?? null, recommendationHash: decision?.recommendationHash ?? null });
        if (decision) { session.context.lastPreterminal = summarize(decision); session.context.controller = decision.controller; }
        if (decision?.adaptationTrigger) session.context.lastTrigger = decision.adaptationTrigger;
        if (decision?.lastFailure) session.context.lastFailure = decision.lastFailure;
        session.pending = null; session.state = next;
        return json(200, { id: body.id, state: next, decision, context: session.context });
      }
      if (req.method === 'GET' && url.pathname === '/api/export') {
        const session = sessions.get(url.searchParams.get('id')); if (!session) return json(404, { error: 'Session expired' });
        const i = session.initial;
        return json(200, { schema: 'SENTINEL_ASCII_EVALUATION_REPLAY_V2', engine: ENGINE_VERSION, status: 'DIAGNOSTIC', authority: 'R0_LOCAL_SIM_ONLY', provenance,
          config: { game: i.game, seed: i.seed, difficulty: i.difficulty, style: i.style }, replay: 'stepGame(initialState, actions[k].action) in order reproduces finalState',
          initialState: i, actions: session.history, actionSequence: session.history.map(r => r.action), finalState: session.state, certificate: null });
      }
      const files = { '/': ['web/index.html', 'text/html'], '/app.mjs': ['web/app.mjs', 'text/javascript'], '/style.css': ['web/style.css', 'text/css'], '/games.mjs': ['games.mjs', 'text/javascript'],
        '/render.mjs': ['render.mjs', 'text/javascript'], '/playback.mjs': ['playback.mjs', 'text/javascript'],
        ...Object.fromEntries(['common', 'pong', 'platformer', 'fighter', 'racing'].map(n => [`/worlds/${n}.mjs`, [`worlds/${n}.mjs`, 'text/javascript']])) };
      if (req.method !== 'GET' || !files[url.pathname]) return json(404, { error: 'Not found' });
      const [file, mime] = files[url.pathname];
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' });
      res.end(await readFile(new URL(file, import.meta.url)));
    } catch (error) { if (!res.headersSent) json(400, { error: error.message }); else res.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.ASCII_SUITE_PORT ?? process.env.PORT ?? 4174);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  const server = createSuiteServer();
  server.on('error', error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Sentinel ASCII Worlds 2.0: http://127.0.0.1:${server.address().port}\nR0 local simulation only; evidence=DIAGNOSTIC\n`));
}
