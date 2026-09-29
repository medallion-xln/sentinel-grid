import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256, stableStringify } from '../src/core/determinism.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { FORGE_ACTION_TYPE_NAMES, FORGE_ILLEGALITY_REASONS } from '../src/forge/contract.js';
import { symmetricStep } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { INVERSE_ORIENTATION, ORIENTATIONS, canonicalActionKey, orientAction, orientCell, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import {
  ENTITY_FIELD_CLASSIFICATION, FORBIDDEN_RUNTIME_KEYS, FORGE_OBSERVABILITY_DECLARATION, OBSERVABLE_ENTITY_STATE_SCHEMA, OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, PRIVILEGED_BOUNDARY,
  buildObservableEntityState, forgeVisibleMap, privilegedKeyScan,
} from '../src/stage3g/observable-entity-state-v1.js';
import { ACTION_SEMANTICS_CONTRACT, ACTION_SEMANTICS_SCHEMA, ACTION_SEMANTICS_SCHEMA_HASH, deriveActionSemantics, entityBlock } from '../src/stage3g/action-semantics-v1.js';
import { FieldClass } from '../src/stage3g/epistemic-provenance-v1.js';
import { FUTURE_CERTIFIER_PATTERN } from '../scripts/certification/check-mode-guard.mjs';
import { readCorpus, policySurface } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { rebuildWorld } from '../scripts/stage3f6p1asym-evidence.mjs';
import { observableView, poisonPrivileged, renameObservation, stage3gEvidence, isEligible } from '../scripts/stage3g/evidence.mjs';
import { NEW_SPECS, PLAN, PLAN_HASH, PLAN_PATH, SEED_PLAN } from '../scripts/stage3g/plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(readFileSync(path.join(root, f), 'utf8'));
const K16 = (k) => k.slice(0, 16);
const DEV = readCorpus().filter((r) => r.partition === 'DEV' && isEligible(r));
const SAMPLE = DEV.filter((_, i) => i % 97 === 0).slice(0, 30);
const TWIN_ROWS = DEV.filter((r) => r.equivariance !== null).slice(0, 12);

test('1. Stage 3G schema hashes are deterministic and bound to the committed plan', () => {
  assert.equal(sha256(OBSERVABLE_ENTITY_STATE_SCHEMA), OBSERVABLE_ENTITY_STATE_SCHEMA_HASH);
  assert.equal(sha256(ACTION_SEMANTICS_SCHEMA), ACTION_SEMANTICS_SCHEMA_HASH);
  const file = json(PLAN_PATH);
  assert.equal(file.planHash, PLAN_HASH);
  assert.equal(file.plan.schemas.observableEntityState.hash, OBSERVABLE_ENTITY_STATE_SCHEMA_HASH);
  assert.equal(file.plan.schemas.actionSemantics.hash, ACTION_SEMANTICS_SCHEMA_HASH);
  assert.equal(FORGE_OBSERVABILITY_DECLARATION.adapterDeclaresImperfectInformation, false);
  assert.deepEqual(PLAN.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });
  assert.ok(Object.values(NEW_SPECS).every((s) => [...s.main, ...s.interact].every((b) => ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GM', 'GP'].includes(b))));
  assert.ok(SEED_PLAN.declared.HOLDOUT.every((s) => !SEED_PLAN.priorSeedSpaces.includes(s)) && SEED_PLAN.declared.OOD.every((s) => !SEED_PLAN.priorSeedSpaces.includes(s)));
});

test('2. every entity field is classified OBSERVED / DETERMINISTICALLY_DERIVED / MODEL_INFERRED / UNAVAILABLE, and provenance is complete', () => {
  const classes = new Set(ENTITY_FIELD_CLASSIFICATION.map((f) => f.class));
  for (const c of classes) assert.ok(Object.keys(FieldClass).includes(c));
  assert.deepEqual([...classes].sort(), ['DETERMINISTICALLY_DERIVED', 'MODEL_INFERRED', 'OBSERVED', 'UNAVAILABLE']);
  const declared = new Set(ENTITY_FIELD_CLASSIFICATION.map((f) => f.field.split('.')[0]));
  for (const f of ENTITY_FIELD_CLASSIFICATION.filter((x) => x.class === 'DETERMINISTICALLY_DERIVED')) assert.ok(Array.isArray(f.derivation) && f.derivation.length > 0, `${f.field} declares its inputs`);
  for (const row of SAMPLE) {
    const { state } = observableView(rebuildWorld(row));
    for (const e of state.entities) {
      for (const k of Object.keys(e)) assert.ok(declared.has(k), `entity field ${k} is classified`);
      assert.equal(e.provenance.sourceStateHash, state.sourceStateHash); assert.equal(e.provenance.access, 'DEPLOYABLE');
      assert.equal(e.observationTimestamp, state.observationTimestamp);
    }
    for (const u of ENTITY_FIELD_CLASSIFICATION.filter((x) => x.class !== 'OBSERVED' && x.class !== 'DETERMINISTICALLY_DERIVED')) {
      assert.ok(state.entities.every((e) => !(u.field in e)), `${u.field} (${u.class}) is absent from runtime state`);
    }
  }
});

test('3. privileged-state boundary: no privileged key, no read of the kernel digest, poisoning changes nothing', () => {
  for (const cat of ['KERNEL_PRIVATE_GEOMETRY', 'HIDDEN_ORIENTATION', 'ORACLE_OPTIMAL_ACTIONS', 'REGRET', 'FUTURE_STATE', 'ROLLOUT_RESULTS', 'SYNTHETIC_LABELS']) assert.ok(PRIVILEGED_BOUNDARY[cat].length > 0, cat);
  assert.deepEqual(privilegedKeyScan({ a: { orientation: 1, regret: 2, ok: { optimalSet: [] } } }), ['$.a.orientation', '$.a.regret', '$.a.ok.optimalSet']);
  assert.deepEqual(privilegedKeyScan({ declaredResourceCost: 0, actorHealth: 100, carriedMaterial: 0 }), []);
  for (const row of SAMPLE) {
    const world = rebuildWorld(row); const view = observableView(world);
    assert.deepEqual(privilegedKeyScan({ state: view.state, semantics: view.semantics }), []);
    const text = stableStringify({ state: view.state, semantics: view.semantics });
    assert.ok(!text.includes(view.observation.metadata.worldHash), 'the kernel world digest never enters state');
    assert.ok(!text.includes(row.recordHash) && !text.includes(row.worldHash));
    const poisoned = observableView(poisonPrivileged(world));
    assert.equal(stableStringify({ s: poisoned.state, m: poisoned.semantics }), stableStringify({ s: view.state, m: view.semantics }));
  }
  /* the derivation reads only whitelisted observation fields */
  const row = SAMPLE[0]; const world = rebuildWorld(row);
  const touched = new Set();
  const spy = (obj, prefix) => new Proxy(obj, { get(t, k) { if (typeof k === 'string') touched.add(`${prefix}.${k}`); const v = t[k]; return v && typeof v === 'object' && !Array.isArray(v) ? spy(v, `${prefix}.${k}`) : v; } });
  const observation = forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);
  buildObservableEntityState({ observation: spy(observation, 'obs'), visibleMap: spy(forgeVisibleMap(world), 'map') });
  for (const k of ['obs.metadata.worldHash', 'obs.metadata.scenarioFamily', 'obs.sequence']) assert.ok(!touched.has(k), `${k} is never read`);
  const mapKeys = Object.keys(forgeVisibleMap(world)).sort();
  assert.deepEqual(mapKeys, ['entities', 'height', 'mapId', 'terrain', 'tick', 'width']);
  assert.deepEqual(Object.keys(forgeVisibleMap(world).entities[0]).sort(), ['id', 'inService', 'kind', 'position']);
  for (const k of FORBIDDEN_RUNTIME_KEYS) assert.ok(!mapKeys.includes(k));
});

test('4. the observable state fails closed on inconsistent input', () => {
  const world = rebuildWorld(SAMPLE[0]);
  const observation = forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID); const map = forgeVisibleMap(world);
  assert.throws(() => buildObservableEntityState({ observation, visibleMap: { ...map, tick: map.tick + 1 } }), /tick/);
  const moved = structuredClone(observation); moved.features[3] = (moved.features[3] + 1) % map.width;
  assert.throws(() => buildObservableEntityState({ observation: moved, visibleMap: map }), /actor/);
  const wrongKind = structuredClone(map); const i = wrongKind.entities.findIndex((e) => e.kind !== 'ACTOR'); wrongKind.entities[i] = { ...wrongKind.entities[i], kind: 'HAZARD' };
  assert.throws(() => buildObservableEntityState({ observation, visibleMap: wrongKind }), /disagree/);
  const noActor = structuredClone(observation); noActor.features[3] = null;
  assert.throws(() => buildObservableEntityState({ observation: noActor, visibleMap: map }), /not observed/);
});

test('5. actor-relative spatial state and the visible map agree with what the environment shows', () => {
  for (const row of SAMPLE) {
    const world = rebuildWorld(row); const view = observableView(world);
    const actor = world.entities.find((e) => e.type === 'ACTOR');
    assert.deepEqual(view.state.actor.observedPosition, actor.position);
    for (const e of view.state.entities) {
      const k = world.entities.find((x) => x.id === e.entityId);
      assert.deepEqual(e.observedPosition, k.position);
      assert.deepEqual(e.actorRelativePosition, { dx: k.position.x - actor.position.x, dy: k.position.y - actor.position.y });
      assert.equal(e.relativeDistance.manhattan, Math.abs(e.actorRelativePosition.dx) + Math.abs(e.actorRelativePosition.dy));
      assert.ok(e.relativeDistance.path === null || e.relativeDistance.path >= e.relativeDistance.manhattan);
    }
  }
});

test('6. ACTION_SEMANTICS_V1: every action type is declared; E1 effects hold exactly against the frozen kernel', () => {
  assert.deepEqual(Object.keys(ACTION_SEMANTICS_CONTRACT).sort(), [...FORGE_ACTION_TYPE_NAMES].sort());
  for (const spec of Object.values(ACTION_SEMANTICS_CONTRACT)) {
    for (const f of spec.failureConditions) assert.ok(FORGE_ILLEGALITY_REASONS.includes(f), f);
    for (const e of spec.effects) assert.ok(!/HAZARD|DEGRAD|HOSTILE_ATTACK|SUCCESSOR|ROLLOUT/.test(e.effect), 'environment dynamics are excluded');
  }
  let checked = 0;
  for (const row of SAMPLE) {
    const world = rebuildWorld(row); const view = observableView(world);
    view.surface.forEach((entry, i) => {
      const s = view.semantics[i]; const next = symmetricStep(world, entry.action).state; const actor = next.entities.find((e) => e.type === 'ACTOR');
      for (const e of s.deterministicImmediateEffects.filter((x) => x.class === 'E1')) {
        checked += 1;
        if (e.effect === 'ACTOR_DISPLACEMENT') assert.deepEqual(actor.position, e.destination);
        if (e.effect === 'ENERGY_DELTA') assert.equal(next.constraints.energy, e.energyAfter);
        if (e.effect === 'TICK_ADVANCE') assert.equal(next.tick, world.tick + 1);
      }
      for (const k of ['ACTION_ID', 'ACTION_TYPE', 'SOURCE_ENTITY', 'TARGET_ENTITY', 'CURRENT_RELATIVE_GEOMETRY', 'DECLARED_RESOURCE_COST', 'LEGAL_PRECONDITIONS', 'RELATIVE_SPATIAL_EFFECT_IF_DETERMINISTIC', 'TARGET_RELATIONSHIPS']) assert.ok(k in s, k);
      for (const k of ACTION_SEMANTICS_SCHEMA.fields) assert.ok(k in s, k);
    });
  }
  assert.ok(checked > 100);
  /* TRANSFER on a constructed world: carried material empties into the objective and is counted */
  const state = forgeWorldAdapter.initialState(); const world = state.world;
  world.entities[0].resources.material = 3; world.grid = { width: 5, height: 5, cells: new Array(25).fill(0) };
  const view = observableView(world);
  const i = view.surface.findIndex((e) => e.actionType === 'TRANSFER'); assert.ok(i >= 0);
  const s = view.semantics[i]; const next = symmetricStep(world, view.surface[i].action).state;
  const delivery = s.deterministicImmediateEffects.find((e) => e.effect === 'OBJECTIVE_DELIVERY');
  assert.equal(delivery.deliveredIncrement, next.objectives[0].deliveredValue - world.objectives[0].deliveredValue);
  assert.equal(next.entities.find((e) => e.type === 'ACTOR').resources.material, 0);
  assert.equal(s.preconditions.find((p) => p.id === 'TARGET_ACCEPTS_MATERIAL').status, 'IMPLIED_BY_LEGALITY');
});

test('7. spatial equivariance: the entity blocks are invariant and the relative state transforms under all eight D4 elements', () => {
  for (const row of TWIN_ROWS.slice(0, 6)) {
    const world = rebuildWorld(row); const size = world.grid.width; const base = observableView(world);
    const blocks = new Map(base.surface.map((e, i) => [K16(e.actionId), stableStringify({ M: entityBlock(base.semantics[i], base.state, 'MANHATTAN'), P: entityBlock(base.semantics[i], base.state, 'PATH') })]));
    for (const o of ORIENTATIONS.filter((x) => x !== 'R0')) {
      const tv = observableView(orientWorld(o, world));
      tv.surface.forEach((e, i) => {
        const k = K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[o], e.action, size), size));
        assert.equal(stableStringify({ M: entityBlock(tv.semantics[i], tv.state, 'MANHATTAN'), P: entityBlock(tv.semantics[i], tv.state, 'PATH') }), blocks.get(k), `${o} ${e.actionType}`);
      });
      for (const e of tv.state.entities) {
        const b = base.state.entities.find((x) => x.entityId === e.entityId);
        assert.deepEqual(e.observedPosition, orientCell(o, b.observedPosition, size));
        assert.deepEqual(e.relativeDistance, b.relativeDistance);
      }
    }
  }
});

test('8. identity invariance: renaming every entity handle and action id, and reversing the list, changes no representation', () => {
  for (const row of SAMPLE.slice(0, 15)) {
    const view = observableView(rebuildWorld(row));
    const ids = view.state.entities.map((e) => e.entityId).concat(view.state.actor.entityId);
    const name = (id) => `x${sha256(`opaque:${id}`).slice(0, 8)}`;
    const rn = renameObservation(view, name);
    const rs = buildObservableEntityState({ observation: rn.observation, visibleMap: rn.visibleMap });
    const rsurf = [...rn.surface].reverse().map((e, i) => ({ ...e, actionId: `perm-${i}` }));
    const rsem = deriveActionSemantics({ state: rs, visibleMap: rn.visibleMap, legalActions: rsurf });
    const sig = (sem, st) => stableStringify({ t: sem.ACTION_TYPE, p: sem.parameters, M: entityBlock(sem, st, 'MANHATTAN'), P: entityBlock(sem, st, 'PATH') });
    const orig = view.semantics.map((s, i) => `${sig(s, view.state)}|${view.surface[i].targetEntityId ?? ''}`).sort();
    const back = new Map(ids.map((id) => [name(id), id]));
    const renamed = rsem.map((s, i) => `${sig(s, rs)}|${rsurf[i].targetEntityId === null ? '' : back.get(rsurf[i].targetEntityId)}`).sort();
    assert.deepEqual(renamed, orig);
  }
  const ev = stage3gEvidence(TWIN_ROWS[0]);
  assert.equal(ev.idPermutationNew, 1); assert.equal(ev.poisonInvariant, 1); assert.equal(ev.render.agree, ev.render.cells);
});

test('9. candidate order: the semantics of each action do not depend on its position in the legal list', () => {
  for (const row of SAMPLE.slice(0, 15)) {
    const world = rebuildWorld(row); const view = observableView(world);
    const rev = deriveActionSemantics({ state: view.state, visibleMap: view.visibleMap, legalActions: [...view.surface].reverse() }).reverse();
    assert.equal(stableStringify(rev), stableStringify(view.semantics));
  }
});

test('10. deterministic replay: the observable state and semantics rebuild byte for byte', () => {
  for (const row of SAMPLE.slice(0, 10)) {
    const a = observableView(rebuildWorld(row)); const b = observableView(rebuildWorld(row));
    assert.equal(stableStringify({ s: a.state, m: a.semantics }), stableStringify({ s: b.state, m: b.semantics }));
  }
});

test('11. every Stage 3G script installs the read-only check-mode guard', () => {
  const scripts = readdirSync(path.join(root, 'scripts')).filter((f) => /stage3g/.test(f) && f.endsWith('.mjs'));
  assert.deepEqual(scripts.sort(), ['certify-stage3g-predictive-integrity.mjs', 'generate-stage3g-sealed.mjs', 'stage3g-plan.mjs']);
  for (const f of scripts) {
    const s = readFileSync(path.join(root, 'scripts', f), 'utf8');
    assert.match(s, /import \{[^}]*enforceCheckModeReadOnly[^}]*\} from '\.\/certification\/check-mode-guard\.mjs'/, f);
    assert.match(s, /enforceCheckModeReadOnly\(\{ checkOnly/, f);
  }
  assert.ok(FUTURE_CERTIFIER_PATTERN.test('certify-stage3g-predictive-integrity.mjs') && FUTURE_CERTIFIER_PATTERN.test('stage3g-plan.mjs'));
});
