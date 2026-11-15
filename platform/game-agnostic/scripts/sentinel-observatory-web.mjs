#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ObservatoryView,
  createBoundedTelemetryProducer,
  renderAsciiObservatoryFrame,
} from '../src/stage3f/ascii-observatory-v1.js';
import { beginIntegratedLiveShadowStep, completeIntegratedLiveShadowStep, createForgeIntegratedCalibration } from '../src/stage3f/integrated-live-shadow-v1.js';
import { forgeWorldAdapter, forgeAdapterState, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { createWorld, isTerminal, hashWorld } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import { projectObservatoryIntelligence } from './lib/observatory-intelligence.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(here, '..', 'web-observatory');
const port = Number(process.env.SENTINEL_OBSERVATORY_PORT ?? 4173);
const cadenceMs = Number(process.env.SENTINEL_OBSERVATORY_CADENCE_MS ?? 1200);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid observatory port');
if (!Number.isFinite(cadenceMs) || cadenceMs < 250) throw new Error('Cadence must be at least 250ms');
const producer = createBoundedTelemetryProducer({ capacity: 64 });
const calibration = createForgeIntegratedCalibration();
let state;
let episode = 0;
let sequence = 0;
const clients = new Set();
let cachedPresentation;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
// Load once. Telemetry requests and every stream client share the same cached payload.
const assetBodies = new Map(await Promise.all([...assets].map(async ([url, [file, mime]]) =>
  [url, { body: await readFile(path.join(publicDirectory, file)), mime }])));

function advance() {
  if (!state || isTerminal(state.world) || state.sequence >= 64) {
    episode += 1;
    const seed = episode + 2;
    const family = episode % 2 ? 'archimedes/repair_network' : 'prime/adversarial_choice';
    state = forgeAdapterState(createWorld(seed, generateScenario({ family, level: (episode - 1) % 4, seed })));
  }
  // The incumbent chooses an immediate-reward action independently of Sentinel's shadow recommendation.
  const legal = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  let incumbent = legal[0];
  let bestReward = -Infinity;
  for (const action of legal) {
    const reward = forgeWorldAdapter.step(state, action, { observerId: FORGE_OBSERVER_ID }).reward;
    if (reward > bestReward) { bestReward = reward; incumbent = action; }
  }
  const pending = beginIntegratedLiveShadowStep({ state, calibration, incumbentAction: incumbent });
  const result = completeIntegratedLiveShadowStep(pending, { telemetrySink: producer });
  state = pending.nextState;
  sequence += 1;
  cachedPresentation = JSON.stringify(presentation(pending, result, incumbent));
}

function aggregateAt(visible) {
  const latest = new Map();
  for (const frame of visible) latest.set(frame.trace?.traceId ?? `unknown:${frame.logicalTime}`, frame);
  const episodes = [...latest.values()];
  const count = (fn) => episodes.filter(fn).length;
  const ratio = (n, d) => d === 0 ? 'UNKNOWN' : (n / d).toFixed(4);
  return {
    episodes: episodes.length,
    states: count((frame) => frame.worldState),
    valid: count((frame) => frame.experience?.validationStatus === 'VALIDATED'),
    invalid: count((frame) => ['INVALID', 'INCOMPLETE'].includes(frame.experience?.validationStatus)),
    conflicted: count((frame) => frame.degradation?.status === 'CONFLICTED'),
    agreementRate: ratio(count((frame) => frame.trace?.matchingStatus === 'MATCH'), count((frame) => frame.trace?.matchingStatus)),
    outcomeResolutionRate: ratio(count((frame) => frame.trace?.outcomeStatus === 'BOUND'), count((frame) => frame.trace)),
    calibrationInsufficiencyRate: ratio(count((frame) => frame.degradation?.failures?.some((failure) => failure.reason === 'CALIBRATION_INSUFFICIENT')), episodes.length),
    routingPrecision: 'UNKNOWN_NOT_ESTABLISHED_IN_STAGE3F5',
    predictionError: 'UNKNOWN_NOT_ESTABLISHED_IN_STAGE3F5',
  };
}

function presentation(pending, result, incumbent) {
  const { frames, stats } = producer.snapshot();
  const frame = frames.at(-1);
  const aggregate = aggregateAt(frames);
  const views = Object.fromEntries(Object.values(ObservatoryView).map((view) => [view,
    renderAsciiObservatoryFrame(frame, { view, telemetryStats: stats, aggregate })]));
  return {
    sequence,
    frameIndex: sequence - 1,
    frameCount: frames.length,
    source: 'LIVE_FORGE_SIMULATION',
    episode,
    worldHash: hashWorld(state.world),
    family: state.world.scenarioFamily,
    tick: state.world.tick,
    maxTicks: state.world.maxTicks,
    energy: state.world.constraints.energy,
    action: incumbent.parameters.actionType,
    reward: result.transition.reward,
    terminal: result.transition.terminal,
    worldAscii: views.WORLD.split('\n\n')[1]?.split('\n\n')[0] ?? '',
    emittedAt: new Date().toISOString(),
    status: frame.degradation?.status ?? 'UNKNOWN',
    logicalTime: frame.logicalTime,
    outcomeTime: frame.outcomeTime,
    authority: frame.authority,
    intelligence: projectObservatoryIntelligence(pending, result, { stats, aggregate, episode }),
    views,
  };
}

function sendEvent(client, event) {
  // Disconnect slow readers rather than accumulating unbounded socket buffers.
  if (client.writableLength > 256 * 1024) { client.destroy(); return; }
  if (client.writableNeedDrain) return;
  client.write(`id: ${sequence}\nevent: frame\ndata: ${event}\n\n`);
}

advance();
const timer = setInterval(() => {
  try {
    advance();
    for (const client of clients) sendEvent(client, cachedPresentation);
  } catch (error) {
    process.stderr.write(`Simulation step failed: ${error.message}\n`);
    for (const client of clients) client.write(`event: fault\ndata: ${JSON.stringify({ message: 'Simulation step failed; retrying.' })}\n\n`);
  }
}, cadenceMs).unref();

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/events' && request.method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    response.write('retry: 1000\n\n');
    clients.add(response);
    sendEvent(response, cachedPresentation);
    response.on('close', () => clients.delete(response));
    return;
  }
  if (pathname === '/api/snapshot') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : cachedPresentation);
    return;
  }
  const asset = assetBodies.get(pathname);
  if (!asset) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    response.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : asset.body);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Observatory asset unavailable');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Sentinel Grid live observatory: http://127.0.0.1:${server.address().port}\n`);
  process.stdout.write(`cadence=${cadenceMs}ms source=LIVE_FORGE_SIMULATION authority=R0 dispatch=false mutate=false\n`);
});

function shutdown() {
  clearInterval(timer);
  for (const client of clients) client.end();
  server.close();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
server.on('error', (error) => { process.stderr.write(`${error.message}\n`); shutdown(); process.exitCode = 1; });
