// Fixtures for STAGE3H_NATIVE_MENU_VALIDITY_V1 (development-only). Synthetic menus plus native worlds that are already
// spent (the 3H.1-F witness, seed 202610203007, and STAGE3H1 OPEN development worlds). No registered world is generated.
// runFixtures() returns one result per fixture: { id, category, pass, detail }.
import { isDeepStrictEqual } from 'node:util';
import { hashWorld, forgeActionKey, legalActions } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { symmetricStep } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { menuVerdict, validatePolicyFacingViews, atomicDecisionEpisode, INVALID_REASON } from './menu-validity-v1.mjs';
import { nativeRowV4, policyFacingViews } from './connector-v4.mjs';
import { nativeRowV3 } from './connector-v3.mjs';
import { identityViewTwinV2 } from './identity-view-v2.mjs';

export const WITNESS = Object.freeze({ population: 'SPENT_3H1F_OOD_ROLES', cell: 'star/industrial/restore_and_protect/H2/1', shape: 'star', roles: 'industrial', objectives: 'restore_and_protect', horizonBand: 'H2', level: 1, seed: 202610203007 });
const warmWorld = (c) => runCalibratedWarmup(c.seed, (warmupTicks) => generateScenarioSymmetricV1({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed, warmupTicks })).world;
const throwsWith = (fn, msg) => { try { fn(); return false; } catch (e) { return e.message === msg; } };
const strip = (row) => ({ ...row, compute: { ...row.compute, elapsedMs: null } });
const desc = (actionType, target, parameters = {}, label = 'forge/' + actionType.toLowerCase()) => ({ actionId: label, actionType, actorId: 'actor', target: target ? { kind: 'entity', id: target } : null, parameters });
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function openWorld(pred) {
  for (const { panel, ...c } of openCombos()) { const w = warmWorld(c), v = observableView(w); if (pred(v)) return { combo: c, world: w, view: v }; }
  return null;
}

export function runFixtures() {
  const R = [], add = (id, category, pass, detail) => R.push({ id, category, pass: !!pass, detail });

  // 1. Empty menu.
  const e1 = menuVerdict([]), e2 = validatePolicyFacingViews([{ label: 'ORIGINAL', view: { surface: [] } }]);
  add('F1_EMPTY_MENU', 'EMPTY', !e1.valid && e1.cause === 'EMPTY_MENU' && !e2.valid && e2.cause === 'EMPTY_MENU' && e2.reason === INVALID_REASON, { e1, e2 });

  // 2. Duplicate id: synthetic, and the native spent witness through connector-v4 (rejected, atomic) vs connector-v3 (aborts).
  const d1 = menuVerdict(['a', 'b', 'a']);
  const w4 = nativeRowV4(WITNESS, { seen: new Set() });
  let v3Error = null; try { nativeRowV3(WITNESS, { seen: new Set() }); } catch (err) { v3Error = err.message; }
  const atomic = w4.rejected && !w4.row && !w4.ledger && ['selections', 'truth', 'metrics', 'menu', 'nuisance', 'compute'].every((k) => !(k in w4.rejected));
  add('F2_DUPLICATE_ID_SYNTHETIC', 'DUPLICATE', !d1.valid && d1.cause === 'DUPLICATE_ACTION_ID' && d1.size === 3 && d1.distinct === 2, d1);
  add('F2_DUPLICATE_ID_NATIVE_WITNESS', 'DUPLICATE', atomic && w4.rejected.reason === INVALID_REASON && w4.rejected.cause === 'DUPLICATE_ACTION_ID' && w4.rejected.firstInvalidView === 'ORIGINAL' && w4.rejected.invalidViews === 11 && w4.rejected.views === 11 && v3Error === 'NATIVE_MENU_MISMATCH', { v4: w4.rejected, v3Error });

  // 3. Legitimately distinct actions sharing type, target or label are distinct ids and valid.
  const distinct = [desc('REINFORCE', 'n3'), desc('REPAIR', 'n3'), desc('BYPASS', 'n5', { dependent: 'n0' }), desc('BYPASS', 'n5', { dependent: 'n3' }), desc('MOVE', null, { direction: 'NORTH' }), desc('MOVE', null, { direction: 'SOUTH' }), desc('WAIT', null)];
  const dv = menuVerdict(distinct.map(forgeActionKey));
  const nat = openWorld((v) => v.surface.some((e) => e.actionType === 'REINFORCE' && v.surface.some((f) => f.actionType === 'REPAIR' && f.targetEntityId === e.targetEntityId)));
  const nv = nat && validatePolicyFacingViews(policyFacingViews(nat.world, nat.view));
  add('F3_LEGITIMATELY_DISTINCT', 'DISTINCT', dv.valid && dv.distinct === 7 && nat && nv.valid && nv.views === 11, { synthetic: dv, native: nat && { seed: nat.combo.seed, cell: [nat.combo.shape, nat.combo.roles, nat.combo.objectives, nat.combo.horizonBand, nat.combo.level].join('/'), verdict: nv } });

  // 4. Identity nuisance: serialization order and descriptor label are not identity; IDENTITY twin preserves the verdict.
  const k1 = forgeActionKey(desc('BYPASS', 'n5', { dependent: 'n0', via: 'x' })), k2 = forgeActionKey(desc('BYPASS', 'n5', { via: 'x', dependent: 'n0' })), k3 = forgeActionKey(desc('BYPASS', 'n5', { dependent: 'n0', via: 'x' }, 'forge/bypass-relabelled'));
  const witnessWorld = warmWorld(WITNESS), witnessView = observableView(witnessWorld), wid = identityViewTwinV2(witnessView);
  const witnessIdentity = menuVerdict(wid.view.surface.map((e) => e.actionId)), witnessOrig = menuVerdict(witnessView.surface.map((e) => e.actionId));
  const validId = identityViewTwinV2(nat.view), validIdV = menuVerdict(validId.view.surface.map((e) => e.actionId));
  const bijective = new Set(Object.values(validId.actionMap)).size === nat.view.surface.length;
  add('F4_IDENTITY_NUISANCE', 'IDENTITY', k1 === k2 && k2 === k3 && !menuVerdict([k1, k2]).valid && !witnessIdentity.valid && witnessIdentity.size === witnessOrig.size && witnessIdentity.distinct === witnessOrig.distinct && validIdV.valid && bijective,
    { keyOrderInvariant: k1 === k2, labelNotIdentity: k2 === k3, witness: { original: witnessOrig, identity: witnessIdentity }, validWorldIdentity: validIdV, opaqueBijection: bijective });

  // 5. Reorder nuisance: non-adjacent duplicates, every permutation, reversed native surface, and view order.
  const base = ['x', 'a', 'b', 'x'], perms = [];
  const permute = (arr, k = 0) => { if (k === arr.length) { perms.push([...arr]); return; } for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; permute(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; } };
  permute([...base]);
  const allDup = perms.every((p) => menuVerdict(p).cause === 'DUPLICATE_ACTION_ID');
  const rev = menuVerdict([...witnessView.surface].reverse().map((e) => e.actionId)), revValid = menuVerdict([...nat.view.surface].reverse().map((e) => e.actionId));
  const views = policyFacingViews(witnessWorld, witnessView), fwd = validatePolicyFacingViews(views), bwd = validatePolicyFacingViews([...views].reverse());
  add('F5_REORDER_NUISANCE', 'ORDER', allDup && perms.length === 24 && !rev.valid && revValid.valid && fwd.valid === bwd.valid && fwd.invalidViews === bwd.invalidViews && isDeepStrictEqual(fwd.causes, bwd.causes),
    { permutations: perms.length, allDuplicate: allDup, witnessReversed: rev, validReversed: revValid, viewOrderInvariant: { forward: fwd.invalidViews, backward: bwd.invalidViews } });

  // 6. Exceptional actions: symmetric RETREAT and the MOVE onto the same cell are distinct; WAIT-only menu is valid;
  //    a malformed entry or a non-list aborts (integrity), it is never a rejection.
  const retreat = { actionId: 'forge/retreat', actionType: 'RETREAT', actorId: 'actor', target: null, parameters: { toX: 3, toY: 4 } };
  const ex = menuVerdict([forgeActionKey(retreat), forgeActionKey(desc('MOVE', null, { direction: 'SOUTH' })), forgeActionKey(desc('WAIT', null))]);
  const waitOnly = menuVerdict([forgeActionKey(desc('WAIT', null))]);
  const natRetreat = openWorld((v) => v.surface.some((e) => e.actionType === 'RETREAT'));
  const nrv = natRetreat && validatePolicyFacingViews(policyFacingViews(natRetreat.world, natRetreat.view));
  const malformed = throwsWith(() => menuVerdict(['a', undefined]), 'NATIVE_MENU_ENTRY_MALFORMED') && throwsWith(() => menuVerdict(['a', '']), 'NATIVE_MENU_ENTRY_MALFORMED') && throwsWith(() => validatePolicyFacingViews([{ label: 'ORIGINAL', view: { surface: null } }]), 'NATIVE_MENU_NOT_A_LIST');
  add('F6_EXCEPTIONAL_ACTIONS', 'EXCEPTIONAL', ex.valid && waitOnly.valid && waitOnly.size === 1 && natRetreat && nrv.valid && malformed, { retreatMoveWait: ex, waitOnly, nativeRetreatWorld: natRetreat && { seed: natRetreat.combo.seed, verdict: nrv }, malformedEntriesAbort: malformed });

  // 7. Multi-decision worlds (synthetic): valid episode; invalid at decision 2 rejects atomically; empty at decision 1.
  let calls = 0;
  const menus = [['a', 'b'], ['c', 'd'], ['e']], ok3 = atomicDecisionEpisode({ start: 0, menuOf: (s) => menus[s], decide: (s, m) => m[0], advance: (s) => s + 1, decisions: 3 });
  const bad = [['a', 'b'], ['c', 'c'], ['e']], r2 = atomicDecisionEpisode({ start: 0, menuOf: (s) => bad[s], decide: (s, m) => { calls++; return m[0]; }, advance: (s) => s + 1, decisions: 3 });
  let calls0 = 0; const r0 = atomicDecisionEpisode({ start: 0, menuOf: () => [], decide: () => { calls0++; return 'x'; }, advance: (s) => s, decisions: 2 });
  add('F7_MULTI_DECISION', 'MULTI_DECISION', isDeepStrictEqual(ok3.decisions, ['a', 'c', 'e']) && r2.rejected?.atDecision === 1 && r2.rejected.cause === 'DUPLICATE_ACTION_ID' && r2.rejected.armDependent === true && !('decisions' in r2) && calls === 1
    && r0.rejected?.cause === 'EMPTY_MENU' && r0.rejected.atDecision === 0 && r0.rejected.armDependent === false && calls0 === 0, { valid: ok3.decisions, invalidAtSecond: r2, decideCallsBeforeRejection: calls, emptyAtFirst: r0, decideCallsOnEmpty: calls0 });

  // 8. A menu that becomes malformed after an initially valid observation. Native kernel transitions only: from the spent
  //    witness the actor takes a legal MOVE away from the failed node (BYPASS no longer offered, menu valid); that state
  //    is the start, and a legal MOVE back makes the duplicated BYPASS reappear.
  const n5 = witnessWorld.entities.find((x) => x.id === 'n5').position, actorPos = (w) => w.entities.find((x) => x.type === 'ACTOR').position;
  let later = null;
  for (const away of witnessView.surface.filter((e) => e.actionType === 'MOVE')) {
    const w = symmetricStep(structuredClone(witnessWorld), away.action).state;
    if (manhattan(actorPos(w), n5) !== 2 || legalActions(w).length === 0) continue;
    const v = observableView(w);
    if (!menuVerdict(v.surface.map((e) => e.actionId)).valid) continue;
    const move = v.surface.find((e) => { if (e.actionType !== 'MOVE') return false; const c = symmetricStep(structuredClone(w), e.action).state; return !menuVerdict(observableView(c).surface.map((f) => f.actionId)).valid; });
    if (move) { later = { world: w, view: v, move, pos: actorPos(w) }; break; }
  }
  let episode = null, singleDecision = null;
  if (later) {
    const byId = (s, id) => observableView(s).surface.find((e) => e.actionId === id).action;
    episode = atomicDecisionEpisode({ start: later.world, menuOf: (s) => observableView(s).surface.map((e) => e.actionId), decide: (s, m, i) => (i === 0 ? later.move.actionId : m[0]), advance: (s, id) => symmetricStep(structuredClone(s), byId(s, id)).state, decisions: 2 });
    singleDecision = validatePolicyFacingViews(policyFacingViews(later.world, later.view));
  }
  add('F8_MALFORMED_AFTER_VALID_OBSERVATION', 'LATER_STEP', later && episode.rejected?.atDecision === 1 && episode.rejected.cause === 'DUPLICATE_ACTION_ID' && episode.rejected.armDependent === true && singleDecision.valid,
    { actorPosition: later?.pos, initialMenu: later && menuVerdict(later.view.surface.map((e) => e.actionId)), multiDecision: episode, singleDecisionProtocol: singleDecision,
      note: 'In the registered single-decision protocol this later menu is evaluator-internal (not policy-facing) and decision-inert; the world is judged on its policy-facing views, which are valid.' });

  // 9. Twin-only malformation is caught before any policy call (all views are checked, not only the original).
  const tw = validatePolicyFacingViews([{ label: 'ORIGINAL', view: { surface: [{ actionId: 'a' }, { actionId: 'b' }] } }, { label: 'D4:R90', view: { surface: [{ actionId: 'c' }, { actionId: 'c' }] } }, { label: 'ORDER', view: { surface: [{ actionId: 'b' }, { actionId: 'a' }] } }]);
  add('F9_TWIN_ONLY_MALFORMATION', 'TWIN', !tw.valid && tw.firstInvalidView === 'D4:R90' && tw.invalidViews === 1, tw);

  // 10. Accepted native world: connector-v4 returns exactly the connector-v3 row (wall-clock field excluded).
  const { panel: _p, ...oc } = openCombos()[0], combo = { population: 'FIXTURE_OPEN', cell: [oc.shape, oc.roles, oc.objectives, oc.horizonBand, oc.level].join('/'), ...oc };
  const a3 = nativeRowV3(combo, { seen: new Set() }), a4 = nativeRowV4(combo, { seen: new Set() });
  add('F10_ACCEPTED_WORLD_PARITY', 'PARITY', a3.row && a4.row && isDeepStrictEqual(strip(a3.row), strip(a4.row)) && isDeepStrictEqual(a3.ledger, a4.ledger), { seed: oc.seed, worldHash: a4.ledger?.worldHash });

  if (hashWorld(witnessWorld) !== hashWorld(warmWorld(WITNESS))) add('F_WITNESS_NOT_MUTATED', 'INTEGRITY', false, null);
  return R;
}
