import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ACTIONS } from '../games.mjs';
import { createTemporalController } from './controller.mjs';
import { createAdversary, ADVERSARIES } from './adversaries.mjs';
import { ObservationTransport, AUTHORITY } from './temporal.mjs';
import { initialWorld, advanceWorld, observe, opponentObservation } from './scenarios.mjs';
import { hash, verifyBaseline, sourceManifest } from './freeze.mjs';
import { fighterFallback } from '../worlds/fighter.mjs';
const conditions = ['NORMAL', 'DELAY3', 'JITTER', 'STALE_REPEAT', 'MISSING', 'PARTIAL', 'LATENCY_1', 'LATENCY_3', 'LATENCY_5'];
export function createTemporalServer() {
  const sessions = new Map(), provenance = { ...verifyBaseline(), ...sourceManifest() };
  function decide(s, mode) {
    const variant = { sentinel: 'V3', prime: 'V2', baseline: 'RULE', manual: null }[mode];
    if (variant === undefined) throw Error('Unknown mode');
    if (s.state.terminal) return { action: 'NO_ACTION_TERMINAL', sourceTick: s.state.tick, lastPreterminal: s.context.lastPreterminal };
    if (!variant) return null;
    if (s.pending?.tick === s.state.tick && s.pending.variant === variant) return s.pending.decision;
    s.controllers[variant] ??= createTemporalController(s.state.game, variant, s.id);
    if (!s.packet || s.packet.receiptTick !== s.state.tick) s.packet = s.transport.sample(observe(s.state), s.state.tick, s.executed);
    const d = s.controllers[variant].decide(s.packet);
    s.pending = { tick: s.state.tick, variant, decision: d }; return d;
  }
  return http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' && ['/api/reset', '/api/decision', '/api/step'].includes(url.pathname)) {
        if (req.headers.origin && !['http://' + req.headers.host, 'http://localhost:' + req.headers.host.split(':').at(-1)].includes(req.headers.origin)) return json(403, { error: 'Cross-origin request refused' });
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) throw Error('Request too large'); } const body = JSON.parse(text || '{}');
        if (url.pathname === '/api/reset') {
          const { game, config = {} } = body, condition = config.observationCondition ?? 'NORMAL'; if (!conditions.includes(condition)) throw Error('Unknown observation condition');
          const adversary = game === 'fighter' && ADVERSARIES.includes(config.style) ? config.style : null;
          const initial = initialWorld({ game, seed: config.seed ?? 1, difficulty: config.difficulty ?? 3, adversary });
          const id = randomUUID(), session = { id, state: initial, initial: structuredClone(initial), config: { game, seed: initial.seed, difficulty: initial.difficulty, condition, adversary }, transport: new ObservationTransport(id, condition),
            opponent: adversary ? createAdversary(adversary, id + '-OPPONENT') : null, opponentTransport: adversary ? new ObservationTransport(id + '-OPPONENT', condition) : null,
            controllers: {}, history: [], context: {}, packet: null, executed: null, pending: null };
          if (sessions.size >= 32) sessions.delete(sessions.keys().next().value); sessions.set(id, session); return json(200, { id, state: initial, context: { ...AUTHORITY } });
        }
        const session = sessions.get(body.id); if (!session) return json(404, { error: 'Session expired; reset' });
        if (url.pathname === '/api/decision') return json(200, { id: session.id, state: session.state, decision: decide(session, body.mode), context: session.context });
        if (session.state.terminal) return json(409, { error: 'Terminal episode; reset', decision: { action: 'NO_ACTION_TERMINAL' } });
        const d = decide(session, body.mode), action = d?.action ?? body.action; if (!ACTIONS[session.state.game].includes(action)) throw Error('Illegal action');
        const tick = session.state.tick, od = session.opponent?.decide(session.opponentTransport.sample(opponentObservation(session.state), tick, session.opponentExecuted));
        const opponentApplied = od ? fighterFallback(session.state.fighters[1], od.action) : null;
        const next = advanceWorld(session.state, action, od?.action ?? null);
        session.executed = { action: next.audit?.applied ?? action, tick };
        Object.values(session.controllers).forEach(c => c.executed(session.executed.action, tick));
        if (session.opponent) { session.opponent.executed(opponentApplied, tick); session.opponentExecuted = { action: opponentApplied, tick }; }
        session.history.push({ action, opponentAction: od?.action ?? null, opponentApplied, tick, packet: session.packet, decision: d, stateHash: hash(next) });
        if (d) session.context.lastPreterminal = d; session.context = { ...session.context, ...AUTHORITY, controller: d?.controller ?? 'MANUAL', lastFailure: d?.lastFailure, lastTrigger: d?.adaptationTrigger };
        session.state = next; session.pending = null; session.packet = null; return json(200, { id: session.id, state: next, decision: d, context: session.context });
      }
      if (url.pathname === '/api/export' && req.method === 'GET') {
        const s = sessions.get(url.searchParams.get('id')); if (!s) return json(404, { error: 'Session expired' });
        return json(200, { schema: 'SENTINEL_ASCII_TEMPORAL_REPLAY_V1', engine: 'ASCII_WORLDS_2.1_CONTROLLER_OVER_UNCHANGED_V2_PHYSICS', evidenceStatus: 'DIAGNOSTIC', ...AUTHORITY, provenance,
          config: s.config, initialState: s.initial, actions: s.history, finalState: s.state, finalStateHash: hash(s.state), replay: 'advanceWorld(initialState, action, opponentAction) in order; receipt packet and estimates are forensic evidence only' });
      }
      const files = { '/': ['v21/web/index.html', 'text/html'], '/app.mjs': ['v21/web/app.mjs', 'text/javascript'], '/style.css': ['v21/web/style.css', 'text/css'],
        '/games.mjs': ['games.mjs', 'text/javascript'], '/render.mjs': ['render.mjs', 'text/javascript'], '/playback.mjs': ['playback.mjs', 'text/javascript'],
        ...Object.fromEntries(['common', 'pong', 'platformer', 'fighter', 'racing'].map(n => [`/worlds/${n}.mjs`, [`worlds/${n}.mjs`, 'text/javascript']])) };
      if (req.method !== 'GET' || !files[url.pathname]) return json(404, { error: 'Not found' });
      const [path, mime] = files[url.pathname]; res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(await readFile(new URL('../' + path, import.meta.url)));
    } catch (error) { if (!res.headersSent) json(400, { error: error.message }); else res.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.ASCII_TEMPORAL_PORT ?? 4175); if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  const server = createTemporalServer(); server.listen(port, '127.0.0.1', () => console.log(`ASCII Worlds 2.1: http://127.0.0.1:${server.address().port}\nR0 / local diagnostic simulation only / task controllers, not canonical Prime`));
}
