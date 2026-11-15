import test from 'node:test';
import assert from 'node:assert/strict';
import { makeObservation, ObservationGate, ObservationTransport } from './temporal.mjs';
import { TemporalEstimator } from './estimator.mjs';
import { createTemporalController } from './controller.mjs';
import { runEpisode, verifyReplay } from './harness.mjs';
import { initialWorld, advanceWorld, observe } from './scenarios.mjs';
import { verifyBaseline } from './freeze.mjs';
import { ADVERSARIES, GRAPPLING_RANGE_PRESSURE } from './adversaries.mjs';
import { createGame, stepGame } from '../games.mjs';
import { FIGHT, fighterFallback } from '../worlds/fighter.mjs';
const packet = (o, receiptTick = o.tick, sequenceNumber = receiptTick) => makeObservation(o, { episodeId: 'TEST', receiptTick, sequenceNumber });
test('v2, frozen Stage 3F/G and prior Stage 3H artifacts remain unchanged', () => assert.equal(verifyBaseline().frozenPathsUnchanged, true));
test('temporal contract is immutable; capture and field timestamps are not receipt time', () => {
  const o = observe(createGame('pong', { difficulty: 4 })), p = packet(o, 3);
  assert.equal(p.observationAge, 3); assert.equal(p.payload.tick, 0); assert.equal(p.confidenceMetadata.fieldTicks.ball, 0); assert.throws(() => { p.payload.ball.x = 0; });
  assert.throws(() => packet({ ...o, tick: 4 }, 3), /FUTURE/);
});
test('duplicate stale, missing, out-of-order, partial and conflicting measurements do not become independent evidence', () => {
  const gate = new ObservationGate('TEST'), o = observe(createGame('platformer'));
  const p = packet(o); assert.equal(gate.accept(p).fresh, true);
  assert.equal(gate.accept({ ...p, receiptTick: 3, sequenceNumber: 1 }).status, 'REPEATED_STALE_OBSERVATION');
  const conflict = { ...p, sequenceNumber: 2, payload: { ...o, health: 2 } }; assert.equal(gate.accept(conflict).status, 'CONFLICTING_OBSERVATION'); assert.equal(gate.last.payload.health, 5);
  assert.equal(gate.accept(makeObservation(null, { episodeId: 'TEST', receiptTick: 4, sequenceNumber: 3, missing: true })).status, 'MISSING_OBSERVATION');
  const newer = packet({ ...o, tick: 4 }, 4, 4); gate.accept(newer);
  assert.equal(gate.accept({ ...p, receiptTick: 5, sequenceNumber: 5 }).status, 'OUT_OF_ORDER_OBSERVATION');
  const partial = makeObservation({ ...o, tick: 5 }, { episodeId: 'TEST', receiptTick: 5, sequenceNumber: 6, unknownFields: ['body.vx'] }); assert.ok(gate.accept(partial).statuses.includes('PARTIALLY_OBSERVED'));
});
test('privileged state, rewards, seeds, hidden parameters and executable handles are rejected', () => {
  const o = observe(createGame('fighter'));
  for (const key of ['rng', 'seed', 'reward', 'successors', 'reactionBuffer', 'fighters', 'opponentScript']) assert.throws(() => packet({ ...o, [key]: 1 }), /PRIVILEGED/);
  assert.throws(() => packet({ ...o, callable: () => 1 }), /EXECUTABLE/);
  assert.throws(() => new ObservationGate('OTHER').accept(packet(o)), /EPISODE/);
});
test('known-action platformer prediction matches published no-wind physics without overwriting source', () => {
  let s = createGame('platformer', { difficulty: 1 }), o = observe(s); const e = new TemporalEstimator('platformer', 'TEST'); e.update(packet(o));
  for (let t = 0; t < 3; t++) { e.executed('MOVE_RIGHT', t); s = stepGame(s, 'MOVE_RIGHT'); }
  const result = e.update({ ...packet(o), receiptTick: 3, sequenceNumber: 1 });
  assert.ok(Math.abs(result.observation.body.x - s.x) < 1e-9); assert.equal(result.observed.payload.body.x, 4); assert.equal(result.provenance, 'ESTIMATED_PROVISIONAL');
});
test('executed-action history affects estimates; no-history ablation does not know those actions', () => {
  const o = observe(createGame('platformer')), a = new TemporalEstimator('platformer', 'TEST'), b = new TemporalEstimator('platformer', 'TEST', { actionHistory: false });
  for (const e of [a, b]) { e.update(packet(o)); e.executed('MOVE_LEFT', 0); }
  assert.notEqual(a.update({ ...packet(o), receiptTick: 1, sequenceNumber: 1 }).observation.body.x, b.update({ ...packet(o), receiptTick: 1, sequenceNumber: 1 }).observation.body.x);
});
test('wind residual metadata never freezes the estimator internal memory', () => {
  const e = new TemporalEstimator('platformer', 'TEST'); e.wind.set(1, { estimate: .2, samples: 1 }); const o = observe(createGame('platformer'));
  e.update(packet(o)); assert.equal(Object.isFrozen(e.wind.get(1)), false);
});
test('imputed partial fields are provisional and never replace the authoritative packet', () => {
  const o = observe(createGame('platformer')), e = new TemporalEstimator('platformer', 'TEST'); e.update(packet(o));
  const partial = structuredClone(o); partial.tick = 1; delete partial.body.vx;
  const p = makeObservation(partial, { episodeId: 'TEST', receiptTick: 1, sequenceNumber: 1, unknownFields: ['body.vx'] }), r = e.update(p);
  assert.equal(r.provenance, 'ESTIMATED_PROVISIONAL'); assert.equal(r.observed.payload.body.vx, undefined); assert.equal(r.observation.body.vx, 0); assert.equal(r.observation.temporal.provisionalLayer, 'OUTSIDE_AUTHORITATIVE_E0_E1_E2');
});
test('all transport impairment schedules operate only on visible observations', () => {
  const o = observe(createGame('racing'));
  for (const kind of ['NORMAL', 'DELAY3', 'JITTER', 'STALE_REPEAT', 'MISSING', 'PARTIAL']) { const tr = new ObservationTransport('TEST', kind);
    for (let t = 0; t < 14; t++) { const p = tr.sample({ ...o, tick: t }, t); assert.ok(p.observationTick === null || p.observationTick <= t); assert.equal(p.payload?.rng, undefined); }
  }
});
for (const game of ['platformer', 'pong', 'fighter', 'racing']) test(`${game}: temporal controllers receive observations only and replay exact impaired trajectories`, () => {
  const e = runEpisode({ game, seed: 112001, difficulty: 3, variant: 'V3', condition: 'DELAY3', maxTicks: 80 }); assert.equal(verifyReplay(e), true);
  assert.ok(e.frames.every(f => !f.packet.payload || !('rng' in f.packet.payload)));
  const s = initialWorld({ game, seed: 112001, difficulty: 3 }), c = createTemporalController(game, 'V3', 'TEST'), o = observe(s); const before = JSON.stringify(o); c.decide(packet(o)); assert.equal(JSON.stringify(o), before);
});
test('equal-latency mirror has no hidden archetype access and exact simultaneous-action replay', () => {
  const e = runEpisode({ game: 'fighter', seed: 112002, difficulty: 3, variant: 'V3', adversary: 'MIRROR_V2', condition: 'LATENCY_3', maxTicks: 70 });
  assert.equal(verifyReplay(e), true); assert.ok(e.actions.every(a => a.opponentAction)); assert.equal(GRAPPLING_RANGE_PRESSURE, 'NOT_APPLICABLE_NO_GRAPPLE_MECHANIC'); assert.equal(ADVERSARIES.length, 6);
  let s = initialWorld(e);
  for (const a of e.actions) { assert.equal(a.opponentApplied, fighterFallback(s.fighters[1], a.opponentAction)); s = advanceWorld(s, a.action, a.opponentAction); }
});
test('opponent override shares unchanged fightTick damage/physics rather than a new combat mechanic', () => {
  const s = initialWorld({ game: 'fighter', seed: 112003 }); const next = advanceWorld(s, 'WALK_FORWARD', 'WALK_BACK');
  assert.ok(Math.abs(next.fighters[0].x - s.fighters[0].x - FIGHT.walkForward) < 1e-9); assert.ok(next.fighters[1].x > s.fighters[1].x); assert.equal(s.tick, 0);
});
test('rotated grid slots preserve road, track, vehicles and same-physics rival policies', () => {
  const s = initialWorld({ game: 'racing', seed: 112004 }), p = JSON.stringify(s.track);
  for (const slot of [0, 1, 2, 3]) { const r = initialWorld({ game: 'racing', seed: 112004, slot }); assert.equal(r.startPlace, slot + 1); assert.equal(JSON.stringify(r.track), p); assert.equal(r.rivals.length, 3); }
});
