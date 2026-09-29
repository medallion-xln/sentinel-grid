/* STAGE_3G_1/3G_2 — per-row evidence for the representation sufficiency recheck.
 *
 * For one stored corpus row:
 *   old   the certified Stage 3F.6-P.1A-SYM candidate evidence, computed by its own unmodified code (candidateEvidence):
 *         deployable TYPE/CANDIDATE/GEOMETRY blocks, privileged kernel relations, one-step immediate, direction controls.
 *   new   the Stage 3G observable representation of the same candidates, built ONLY from the ObservationPacket and the
 *         visible map (SENTINEL_OBSERVABLE_ENTITY_STATE_V1 + ACTION_SEMANTICS_V1): entity blocks with Manhattan and path
 *         geometry.
 * plus integrity evidence: D4 twins of the new blocks (on the stored equivariance sample), action- and entity-identity
 * renaming with the legal list reversed, E1 effect fidelity against the frozen kernel (audit only; never an input),
 * visible-map/renderer agreement, a privileged-key scan and a privileged-field poisoning probe.
 * Deterministic; writes nothing.
 */
import { stableStringify } from '../../src/core/determinism.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../../src/forge/adapter.js';
import { FORGE_ENTITY_TYPES, FORGE_TERRAIN_BY_CODE } from '../../src/forge/contract.js';
import { cloneWorld } from '../../src/forge/kernel.js';
import { renderWorld } from '../../src/forge/render.js';
import { symmetricStep } from '../../src/forge-symmetric/action-surface-symmetric-v1.js';
import { INVERSE_ORIENTATION, TRANSFORM_EQUIVALENT, canonicalActionKey, orientAction, orientWorld } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { DECLARED_ACTION_COST_MODEL } from '../../src/stage3f/deployable-action-proposal-v1.js';
import { buildObservableEntityState, forgeVisibleMap, privilegedKeyScan } from '../../src/stage3g/observable-entity-state-v1.js';
import { deriveActionSemantics, entityBlock } from '../../src/stage3g/action-semantics-v1.js';
import { policySurface } from '../generate-stage3f6p1e-policy-evidence.mjs';
import { TWIN_TRANSFORMS, candidateEvidence, isEligible, rebuildWorld } from '../stage3f6p1asym-evidence.mjs';

export { isEligible };
const K16 = (k) => k.slice(0, 16);
const observe = (world) => forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);

/** The complete Stage 3G decision-time view of a presented world: observation packet, visible map, entity state, semantics. */
export function observableView(world) {
  const observation = observe(world);
  const visibleMap = forgeVisibleMap(world);
  const state = buildObservableEntityState({ observation, visibleMap });
  const surface = policySurface(world);
  const semantics = deriveActionSemantics({ state, visibleMap, legalActions: surface });
  return { observation, visibleMap, state, surface, semantics };
}
const blocksOf = (view, i) => ({ GM: entityBlock(view.semantics[i], view.state, 'MANHATTAN'), GP: entityBlock(view.semantics[i], view.state, 'PATH') });
const semanticKey = (a, rename = (id) => id) => `${a.actionType}|${a.parameters?.direction ?? ''}|${a.parameters?.toX ?? ''},${a.parameters?.toY ?? ''}|${a.target?.id === undefined || a.target === null ? '' : rename(a.target.id)}`;

/** Consistently rename every entity identity (relations, objectives, targets follow). */
export function renameEntities(world, name) {
  const w = cloneWorld(world);
  for (const e of w.entities) e.id = name(e.id);
  w.relations = w.relations.map((r) => ({ ...r, from: name(r.from), to: name(r.to) }));
  w.objectives = w.objectives.map((o) => ({ ...o, entityId: name(o.entityId) }));
  return w;
}

/** Rename every entity handle in an observation, its visible map and its offered actions (the actions themselves unchanged). */
export function renameObservation(view, name) {
  const o = structuredClone(view.observation); const cs = o.metadata.canonicalState;
  cs.entities = cs.entities.map((e) => ({ ...e, id: name(e.id) }));
  cs.relationships = cs.relationships.map((r) => ({ ...r, from: name(r.from), to: name(r.to) }));
  o.metadata.objectives = o.metadata.objectives.map((x) => ({ ...x, entityId: name(x.entityId) }));
  const visibleMap = { ...view.visibleMap, entities: view.visibleMap.entities.map((e) => ({ ...e, id: name(e.id) })).sort((a, b) => (a.id < b.id ? -1 : 1)) };
  const surface = view.surface.map((e) => ({ ...e, targetEntityId: e.targetEntityId === null ? null : name(e.targetEntityId),
    action: { ...e.action, actorId: name(e.action.actorId), target: e.action.target ? { ...e.action.target, id: name(e.action.target.id) } : null } }));
  return { observation: o, visibleMap, surface };
}

/** Perturb every field the Stage 3G contract declares unexposed or privileged; decision-time content must not move. */
export function poisonPrivileged(world) {
  const w = cloneWorld(world);
  for (const e of w.entities) {
    e.value += 7; e.cost += 3; e.risk += 2;
    /* health moves but keeps what the surface reveals: in service or not, damaged (legal REPAIR/REINFORCE) or not */
    if (e.type !== 'ACTOR' && e.type !== 'CIVILIAN' && e.health > 0 && e.health < 100) e.health = ((e.health * 37) % 99) + 1;
    if (e.type !== 'ACTOR') e.resources = { ...e.resources, poison: 99 };
    e.flags = { ...e.flags, poisonFlag: true };
  }
  w.channels = Object.fromEntries(Object.entries(w.channels).map(([k, s]) => [k, s.map((v, i) => (i > w.tick ? v + 1000 : v))]));
  w.seed = String(BigInt(w.seed) + 7919n); w.hazards = [...(w.hazards ?? []), { poison: true }];
  return w;
}

const SYMBOL_ORDER = ['ACTOR', 'HOSTILE', 'CIVILIAN', 'CRITICAL_TARGET', 'REPAIR_TARGET', 'SUBSTITUTE', 'INFRASTRUCTURE', 'POWER_SOURCE', 'DEPOT', 'BARRIER', 'RESOURCE', 'HAZARD'];
/** Audit only: does the visible map say exactly what the renderer draws (top occupant glyph + case, terrain)? */
function renderAgreement(world, visibleMap) {
  const lines = renderWorld(world).split('\n').slice(1, -1).map((l) => l.slice(1, -1));
  const top = new Map(); let stacked = 0;
  for (const e of visibleMap.entities) {
    const k = `${e.position.x},${e.position.y}`; const r = SYMBOL_ORDER.indexOf(e.kind); const cur = top.get(k);
    if (cur !== undefined) stacked += 1;
    if (cur === undefined || r < cur.r || (r === cur.r && e.id < cur.e.id)) top.set(k, { e, r });
  }
  const symbolOfTerrain = Object.fromEntries(Object.values(FORGE_TERRAIN_BY_CODE).map((s) => [s.name, s.symbol]));
  let cells = 0; let agree = 0;
  for (let y = 0; y < visibleMap.height; y += 1) for (let x = 0; x < visibleMap.width; x += 1) {
    const o = top.get(`${x},${y}`);
    const expected = o ? (o.e.inService ? FORGE_ENTITY_TYPES[o.e.kind].symbol : FORGE_ENTITY_TYPES[o.e.kind].symbol.toLowerCase()) : symbolOfTerrain[visibleMap.terrain[y * visibleMap.width + x]];
    cells += 1; if (lines[y][x] === expected) agree += 1;
  }
  return { cells, agree, stackedEntities: stacked };
}

/** Audit only: every E1 effect of every legal action against the frozen kernel's executed transition. */
function effectFidelity(world, view) {
  const t = { displacement: [0, 0], energy: [0, 0], tick: [0, 0], service: [0, 0], protected: [0, 0], carried: [0, 0], delivery: [0, 0] };
  const ok = (k, v) => { t[k][0] += 1; if (v) t[k][1] += 1; };
  view.surface.forEach((entry, i) => {
    const s = view.semantics[i]; const r = symmetricStep(world, entry.action).state;
    const actor = r.entities.find((e) => e.type === 'ACTOR' && e.faction === 'sentinel');
    for (const e of s.deterministicImmediateEffects) {
      if (e.class !== 'E1') continue;
      if (e.effect === 'ACTOR_DISPLACEMENT') ok('displacement', actor.position.x === e.destination.x && actor.position.y === e.destination.y);
      if (e.effect === 'ENERGY_DELTA') ok('energy', r.constraints.energy === e.energyAfter && e.energyAfter === world.constraints.energy - DECLARED_ACTION_COST_MODEL.cost[s.actionType]);
      if (e.effect === 'TICK_ADVANCE') ok('tick', r.tick === world.tick + 1);
      if (e.effect === 'TARGET_LEAVES_SERVICE' || e.effect === 'TARGET_RETURNS_TO_SERVICE') { const x = r.entities.find((z) => z.id === s.target); ok('service', (x.available && x.health > 0) === e.targetInServiceAfter); }
      if (e.effect === 'TARGET_PROTECTED') ok('protected', r.entities.find((z) => z.id === s.target).flags.protected === true);
      if (e.effect === 'CARRIED_MATERIAL_TO_ZERO') ok('carried', (actor.resources.material ?? 0) === 0);
      if (e.effect === 'OBJECTIVE_DELIVERY') {
        const before = world.objectives.find((o) => o.entityId === s.target); const after = r.objectives.find((o) => o.entityId === s.target);
        ok('delivery', e.targetIsObjective ? after.deliveredValue - before.deliveredValue === e.deliveredIncrement : before === undefined);
      }
    }
  });
  return t;
}

/**
 * Evidence for one row. `integrity` adds twins / renaming / poisoning / render agreement (the stored equivariance sample
 * by default); `fidelity` adds the kernel effect audit.
 */
export function stage3gEvidence(row, { integrity = row.equivariance !== null, fidelity = true } = {}) {
  const old = candidateEvidence(row, { twins: integrity });
  const world = rebuildWorld(row);
  const size = world.grid.width;
  const view = observableView(world);
  const indexByKey = new Map(); view.surface.forEach((e, i) => { const k = K16(e.actionId); if (!indexByKey.has(k)) indexByKey.set(k, i); });
  const candidates = old.candidates.map((c) => { const i = indexByKey.get(c.key); return { ...c, ...blocksOf(view, i), semKey: semanticKey(view.surface[i].action) }; });
  const out = { ...old, candidates, carrying: view.state.actor.carriedMaterial > 0, newScanHits: privilegedKeyScan({ state: view.state, semantics: view.semantics }).length,
    fidelity: fidelity ? effectFidelity(world, view) : null, twinNew: null, idPermutationNew: null, poisonInvariant: null, render: null };
  if (!integrity) return out;

  out.twinNew = {};
  for (const transform of TWIN_TRANSFORMS) {
    const o = TRANSFORM_EQUIVALENT[transform];
    const tv = observableView(orientWorld(o, world));
    const mapped = new Map();
    tv.surface.forEach((e, i) => { const k = K16(canonicalActionKey('R0', orientAction(INVERSE_ORIENTATION[o], e.action, size), size)); if (!mapped.has(k)) mapped.set(k, blocksOf(tv, i)); });
    out.twinNew[transform] = Object.fromEntries(candidates.map((c) => [c.key, mapped.get(c.key) ?? null]));
  }
  /* identities: the SAME offered actions and observation, with every entity handle renamed to an opaque token, every
   * action id replaced and the legal list reversed. (Renaming inside the world instead would also move the Stage 3F
   * symmetric RETREAT tie-break, which reads entity ids through the canonical-frame digest; that surface property is
   * measured separately as surfaceRetreatIdDependent.) */
  const ids = [...world.entities.map((e) => e.id)].sort();
  const opaque = new Map(ids.map((id, i) => [id, `h${String(ids.length - 1 - i).padStart(3, '0')}`]));
  const back = new Map([...opaque].map(([a, b]) => [b, a]));
  const rn = renameObservation(view, (id) => opaque.get(id));
  const rs = buildObservableEntityState({ observation: rn.observation, visibleMap: rn.visibleMap });
  const rsurf = [...rn.surface].reverse().map((e, i) => ({ ...e, actionId: `perm-${i}` }));
  const rsem = deriveActionSemantics({ state: rs, visibleMap: rn.visibleMap, legalActions: rsurf });
  const byKey = new Map(rsurf.map((e, i) => [semanticKey(e.action, (id) => back.get(id)), { GM: entityBlock(rsem[i], rs, 'MANHATTAN'), GP: entityBlock(rsem[i], rs, 'PATH') }]));
  out.idPermutationNew = candidates.every((c) => stableStringify(byKey.get(c.semKey)) === stableStringify({ GM: c.GM, GP: c.GP })) ? 1 : 0;
  const retreatOf = (surface) => surface.filter((e) => e.actionType === 'RETREAT').map((e) => `${e.action.parameters.toX},${e.action.parameters.toY}`).join('|');
  out.surfaceRetreatIdDependent = retreatOf(policySurface(renameEntities(world, (id) => opaque.get(id)))) === retreatOf(view.surface) ? 0 : 1;
  /* poisoning: privileged and unexposed fields perturbed; the decision-time view must be byte-identical */
  const pv = observableView(poisonPrivileged(world));
  out.poisonInvariant = stableStringify({ s: pv.state, m: pv.semantics }) === stableStringify({ s: view.state, m: view.semantics }) ? 1 : 0;
  out.render = renderAgreement(world, view.visibleMap);
  return out;
}
