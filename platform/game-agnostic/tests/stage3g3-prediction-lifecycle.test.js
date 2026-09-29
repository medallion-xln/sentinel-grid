import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256, stableStringify } from '../src/core/determinism.js';
import {
  INVALIDATION_RULES, LIFECYCLE_RULES, PREDICTION_FIELDS, PREDICTION_LIFECYCLE_SCHEMA, PREDICTION_LIFECYCLE_SCHEMA_HASH, PredictionStatus, STALE_RULES,
  createPrediction, evaluatePrediction, toEpistemicRecord, usableForDecision,
} from '../src/stage3g/prediction-lifecycle-v1.js';
import { admit, createEpistemicRecord, createEpistemicState, readAuthoritative, readProvisional, registerObservation } from '../src/stage3g/epistemic-provenance-v1.js';
import { ACTION_SEMANTICS_SCHEMA_HASH } from '../src/stage3g/action-semantics-v1.js';
import { PLAN_HASH, PLAN_PATH } from '../scripts/stage3g3/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (over = {}) => createPrediction({ sourceStateHash: 'state-10', actionSignature: { actionType: 'MOVE', parameters: { direction: 'EAST' }, target: null },
  legalActionSetHash: 'legal-10', executed: true, createdAtLogicalTick: 10, targetHorizon: 2, predicted: { path: ['actor', 'position'], value: { x: 4, y: 3 } },
  confidence: 0.8, requiredEntities: { hostile0: 'h-hash' }, requiredPreconditions: ['DESTINATION_TRAVERSABLE'], provenance: { producerId: 'test-model', producerVersion: '1' }, ...over });
const ctx = (over = {}) => ({ logicalTick: 10, currentSourceStateHash: 'state-10', actionSemanticsVersion: ACTION_SEMANTICS_SCHEMA_HASH, legalActionSetHash: 'legal-10',
  actionStillOffered: true, preconditions: { DESTINATION_TRAVERSABLE: true }, entityHashes: { hostile0: 'h-hash' }, ...over });

test('1. the lifecycle schema is complete, deterministic and bound to the committed plan', () => {
  assert.equal(sha256(PREDICTION_LIFECYCLE_SCHEMA), PREDICTION_LIFECYCLE_SCHEMA_HASH);
  const file = JSON.parse(readFileSync(path.join(root, PLAN_PATH), 'utf8'));
  assert.equal(file.planHash, PLAN_HASH); assert.equal(file.plan.lifecycle.hash, PREDICTION_LIFECYCLE_SCHEMA_HASH);
  assert.deepEqual(Object.keys(PredictionStatus), ['VALID', 'STALE', 'INVALID', 'RESOLVED_CONFIRMED', 'RESOLVED_REFUTED']);
  const p = base();
  for (const f of PREDICTION_FIELDS) assert.ok(f in p, f);
  for (const f of ['predictionId', 'sourceStateHash', 'actionContextHash', 'createdAtLogicalTick', 'targetHorizon', 'confidence', 'validityConditions', 'invalidationConditions', 'provenance', 'epistemicClass', 'access', 'status']) assert.ok(PREDICTION_FIELDS.includes(f));
  assert.equal(p.status, 'VALID'); assert.equal(p.epistemicClass, 'E3'); assert.equal(base({ executed: false }).epistemicClass, 'E4');
  assert.equal(base().predictionId, p.predictionId, 'content-addressed');
  assert.deepEqual(STALE_RULES, ['L9_SOURCE_SUPERSEDED']); assert.equal(INVALIDATION_RULES.length, 6); assert.equal(LIFECYCLE_RULES.length, 10);
  assert.equal(PREDICTION_LIFECYCLE_SCHEMA.role, 'INFRASTRUCTURE: no model, no vote, no authority');
});

test('2. every field is required and validated', () => {
  assert.throws(() => base({ sourceStateHash: '' }), /sourceStateHash/);
  assert.throws(() => base({ executed: 'yes' }), /executed/);
  assert.throws(() => base({ targetHorizon: 0 }), /targetHorizon/);
  assert.throws(() => base({ confidence: 1.2 }), /confidence/);
  assert.throws(() => base({ provenance: { producerId: 'x' } }), /provenance/);
  assert.throws(() => base({ createdAtLogicalTick: -1 }), /createdAtLogicalTick/);
  assert.throws(() => base({ predicted: { path: [], value: 1 } }), /predicted/);
  assert.throws(() => base({ access: 'SECRET' }), /access/);
});

test('3. staleness: a superseded source state makes a prediction STALE (still resolvable, no longer usable)', () => {
  const s = evaluatePrediction(base(), ctx({ logicalTick: 11, currentSourceStateHash: 'state-11' }));
  assert.equal(s.status, 'STALE'); assert.equal(s.statusReason, 'L9_SOURCE_SUPERSEDED'); assert.equal(usableForDecision(s), false);
  const r = evaluatePrediction(s, ctx({ logicalTick: 12, currentSourceStateHash: 'state-12', observation: { logicalTick: 12, path: ['actor', 'position'], value: { x: 4, y: 3 } } }));
  assert.equal(r.status, 'RESOLVED_CONFIRMED');
  assert.equal(usableForDecision(base()), true);
});

test('4. invalidation: entity change, action availability, semantics version, precondition, horizon expiry, contradiction', () => {
  const cases = [
    [ctx({ logicalTick: 11, entityHashes: { hostile0: 'moved' } }), 'L5_REQUIRED_ENTITY_CHANGED'],
    [ctx({ actionStillOffered: false }), 'L3_ACTION_UNAVAILABLE'],
    [ctx({ legalActionSetHash: 'legal-other' }), 'L3_ACTION_UNAVAILABLE'],
    [ctx({ actionSemanticsVersion: 'ACTION_SEMANTICS_V2' }), 'L2_ACTION_SEMANTICS_VERSION_CHANGED'],
    [ctx({ preconditions: { DESTINATION_TRAVERSABLE: false } }), 'L4_PRECONDITION_FALSE'],
    [ctx({ logicalTick: 13, currentSourceStateHash: 'state-13' }), 'L8_HORIZON_EXPIRED'],
    [ctx({ logicalTick: 11, observation: { logicalTick: 11, path: ['actor', 'position'], value: { x: 9, y: 9 }, contradictsAssumption: true } }), 'L7_CONTRADICTED_BEFORE_TARGET'],
  ];
  for (const [c, reason] of cases) { const p = evaluatePrediction(base(), c); assert.equal(p.status, 'INVALID', reason); assert.equal(p.statusReason, reason); assert.equal(usableForDecision(p), false); }
  /* the offered set is allowed to change after execution (the world moved on); it only invalidates before execution */
  assert.equal(evaluatePrediction(base(), ctx({ logicalTick: 11, legalActionSetHash: 'legal-11' })).status, 'VALID');
});

test('5. resolution: an authoritative observation at the target tick confirms or refutes; terminal statuses are final', () => {
  const at12 = (value) => ctx({ logicalTick: 12, observation: { logicalTick: 12, path: ['actor', 'position'], value } });
  const c = evaluatePrediction(base(), at12({ x: 4, y: 3 })); assert.equal(c.status, 'RESOLVED_CONFIRMED');
  const r = evaluatePrediction(base(), at12({ x: 5, y: 3 })); assert.equal(r.status, 'RESOLVED_REFUTED');
  for (const t of [c, r, evaluatePrediction(base(), ctx({ actionStillOffered: false }))]) {
    assert.equal(evaluatePrediction(t, ctx({ logicalTick: 30, currentSourceStateHash: 'x', actionSemanticsVersion: 'v9' })), t, 'terminal is final');
  }
  /* a counterfactual (E4) is never resolved by observation of its path: its branch did not happen */
  const cf = base({ executed: false });
  assert.equal(evaluatePrediction(cf, at12({ x: 4, y: 3 })).status, 'VALID');
  assert.equal(evaluatePrediction(cf, ctx({ logicalTick: 13, currentSourceStateHash: 'state-10' })).status, 'INVALID');
});

test('6. authoritative-state isolation: a prediction enters epistemic state only as E3 (provisional) or E4 (refused)', () => {
  let s = registerObservation(createEpistemicState({ environment: { identity: 'forge', version: '1' } }), { logicalTime: 10, observationHash: 'state-10' });
  const obs = createEpistemicRecord({ path: ['actor', 'position'], value: { x: 3, y: 3 }, epistemicClass: 'E0', source: { sourceId: 'env', kind: 'ENVIRONMENT_OBSERVATION' },
    sourceStateHash: 'state-10', timestamp: { logicalTime: 10 }, confidence: 1 });
  s = admit(s, obs).state;
  const before = stableStringify(readAuthoritative(s, ['actor', 'position']));
  const e3 = toEpistemicRecord(base()); assert.equal(e3.epistemicClass, 'E3');
  const a = admit(s, e3); assert.equal(a.decision, 'ADMITTED_PROVISIONAL');
  assert.equal(stableStringify(readAuthoritative(a.state, ['actor', 'position'])), before, 'the authoritative value is untouched');
  assert.equal(readProvisional(a.state, ['actor', 'position']).length, 1);
  const forced = admit(s, e3, { requestedLane: 'AUTHORITATIVE' }); assert.equal(forced.decision, 'REFUSED'); assert.deepEqual(forced.flags, ['UNVERIFIED_STATE_PROMOTION']);
  const e4 = toEpistemicRecord(base({ executed: false })); assert.equal(e4.epistemicClass, 'E4');
  assert.equal(admit(s, e4).rule, 'P4_COUNTERFACTUAL_EXCLUDED');
  assert.equal(stableStringify(readAuthoritative(admit(s, e4).state, ['actor', 'position'])), before);
});

test('7. no wall clock, no simulator, deterministic replay', () => {
  const src = readFileSync(path.join(root, 'src/stage3g/prediction-lifecycle-v1.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Date\.|performance\.now|process\.hrtime|Math\.random/.test(src));
  assert.ok(![...src.matchAll(/from '([^']+)'/g)].some((m) => /forge|counterfactual|oracle|stage3g3/.test(m[1])));
  const run = () => [ctx({ logicalTick: 11, currentSourceStateHash: 'state-11' }), ctx({ logicalTick: 12, currentSourceStateHash: 'state-12', observation: { logicalTick: 12, path: ['actor', 'position'], value: { x: 4, y: 3 } } })]
    .reduce((p, c) => evaluatePrediction(p, c), base());
  assert.equal(stableStringify(run()), stableStringify(run()));
});
