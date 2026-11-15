// STAGE3H_FAILURE_DIAGNOSIS_V1: shared development-only machinery.
// Worlds: the 288 already-evaluated development worlds (STAGE3H1_CANONICAL_OPEN_NATIVE_V1) and fresh DEV namespaces
// 951 and 952 (never registered, never sealed). No V4 decision row, analysis outcome or sealed seed is read.
// Every frozen function is imported read-only; no frozen file is edited. Policies see only the public view.
// Evaluator truth for a world is computed only after every policy decision for that world (original and all
// relabelled twins) is made, and is never a policy input.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, hashWorld, isTerminal, cloneWorld } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { CONTINUATION_POLICIES } from '../src/forge/counterfactual-v2.js';
import { addRewardV2Vectors, emptyRewardV2Vector, rewardV2For, scalarizeRewardV2 } from '../src/forge/reward-v2.js';
import { canonicalActionKey, canonicalOrientation } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { symmetricLegalActions, symmetricStep } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { decisionPacket, invokeNexus } from '../stage3h-canonical-v1/adapters.mjs';
import { S0_HASH } from '../stage3h-canonical-v1/baseline.mjs';
import { scoreCandidates, topSet, modelHash } from '../src/stage3f/free-action-sufficiency-v1.js';
import { observableColumns } from '../src/stage3g7/target-eligibility-contract-v1.js';
import { projectObjectiveProgress, objectiveProgressColumns } from '../stage3g8/objective-progress-v1.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { scoreSyntheticTruth } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { stableStringify } from '../src/core/determinism.js';

export const LANE = dirname(fileURLToPath(import.meta.url));
export const GA = resolve(LANE, '..');
export const DIAGNOSIS_ID = 'STAGE3H_FAILURE_DIAGNOSIS_V1';
export const DEV_BLOCKS = Object.freeze({ FRESH_EXPLORE: 951_000_000_000, FRESH_CHECK: 952_000_000_000 });
export const ok = (v, m) => { if (!v) throw Error(m); };
export const sha = (x) => createHash('sha256').update(typeof x === 'string' ? x : stableStringify(x)).digest('hex');
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export function writeExclusive(path, value) { const fd = openSync(path, 'wx'); writeSync(fd, JSON.stringify(value, null, 1) + '\n'); closeSync(fd); }
const bandOf = (steps) => (steps === 1 ? 'H0' : steps === 4 ? 'H2' : null);

// S0 exactly as stage3h-canonical-v1/baseline.mjs#currentBaseline, additionally exposing features and scores.
const S0_MODEL = readJson(resolve(GA, 'artifacts/stage3g8-projection-disclosure/stage3g8-open-phase-report.json')).models.OBJECTIVE_PROGRESS_ONLY;
ok(modelHash(S0_MODEL) === S0_HASH, 'FROZEN_S0_MODEL_MISMATCH');
export function s0Detail(view) {
  const progress = projectObjectiveProgress(view.observation);
  const features = view.surface.map((e) => [...observableColumns(view, e.action).features, ...objectiveProgressColumns(progress, e.action)]);
  const scores = scoreCandidates(S0_MODEL, features).scores;
  return { features, scores, selected: topSet(scores).map((i) => view.surface[i].actionId) };
}

/** The frozen lock (connector.mjs#nativeLock call order and selectSets rule) without the wall-clock assertion. */
export function devLock(view, band) {
  ok(['H0', 'H2'].includes(band), 'OUTSIDE_FROZEN_DOMAIN');
  const packet = decisionPacket(view.observation, view.surface, { evaluationSteps: band === 'H0' ? 1 : 4 });
  const menu = packet.legalActions.map((a) => a.actionId);
  ok(menu.length && new Set(menu).size === menu.length, 'MENU_INVALID');
  const nexus = invokeNexus(packet), s0 = s0Detail(view);
  const selections = selectSets(band, s0.selected, nexus.recommendedAction ? [nexus.recommendedAction] : null);
  return { selections, menu, regime: packet.regime[0], s0,
    nexus: { abstain: nexus.abstain, action: nexus.recommendedAction, reason: nexus.payload.selected.reason ?? null,
      codes: [...nexus.payload.raw.rationaleCodes].sort(), signals: nexus.payload.raw.signals } };
}

/** Generation and admission identical to connector-v3.mjs#nativeRowV3 (same calls, same order). */
export function devWorld(combo) {
  const { seed, population, cell, panel, ...axes } = combo;
  const warm = runCalibratedWarmup(seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, seed, warmupTicks })), config = warm.scenarioConfig;
  const initial = createWorld(seed, config), validation = validateScenarioV2(initial, config), world = warm.world;
  if (!validation.valid || isTerminal(world) || !warm.taskPreserved) return { rejected: !validation.valid ? 'VALIDATOR_INVALID' : isTerminal(world) ? 'TERMINAL_AFTER_WARMUP' : 'TASK_NOT_PRESERVED' };
  const view = observableView(world), band = bandOf(config.horizon + 1);
  ok(band === axes.horizonBand, 'PACKET_HORIZON_MISMATCH');
  return { world, view, band, horizon: config.horizon, worldHash: hashWorld(world) };
}

/** Evaluator-only truth (frozen symmetric counterfactual evaluator), aligned to a menu. */
export function evaluatorTruth(world, horizon, menu) {
  const t = evaluateCounterfactualsSymmetricV1(world, { horizon });
  const byId = new Map(t.branches.map((b) => [b.actionKey, b]));
  ok(byId.size === menu.length && menu.every((id) => byId.has(id)), 'ACTION_SURFACE_MISMATCH');
  return menu.map((id) => ({ id, utility: byId.get(id).totalScalar }));
}

/** Evaluator-only reward vectors per branch: the frozen evaluator's loop, keeping vectors; totals asserted equal. */
export function evaluatorVectors(world, horizon) {
  const policy = CONTINUATION_POLICIES.GREEDY_CONTINUATION_V1, frame = canonicalOrientation(world).orientation, size = world.grid.width;
  const tieKey = (a) => canonicalActionKey(frame, a, size);
  const transition = (w, a) => { const o = symmetricStep(w, a), vector = rewardV2For({ before: w, after: o.state, v1Vector: o.rewardVector, events: o.events, terminal: o.terminal, outcome: o.outcome });
    return { state: o.state, vector, scalar: scalarizeRewardV2(vector), terminal: o.terminal, outcome: o.outcome, events: o.events }; };
  const continuation = (cur) => { let best = null; for (const a of symmetricLegalActions(cur, frame)) { const r = transition(cur, a), rank = policy.rank({ scalar: r.scalar, vector: r.vector }), key = tieKey(a);
    if (best === null || rank > best.rank || (rank === best.rank && key < best.key)) best = { a, rank, key }; } return best?.a ?? null; };
  const out = new Map();
  for (const action of symmetricLegalActions(world, frame)) {
    const first = transition(cloneWorld(world), action); let cur = first.state, acc = emptyRewardV2Vector(), outcome = first.terminal ? first.outcome : null;
    const path = [action.actionType];
    for (let d = 0; d < horizon; d++) { if (isTerminal(cur)) break; const n = continuation(cur); if (n === null) break; const r = transition(cur, n); acc = addRewardV2Vectors(acc, r.vector); cur = r.state; path.push(n.actionType); if (r.terminal) outcome = r.outcome; }
    const total = addRewardV2Vectors(first.vector, acc), actor = cur.entities.find((e) => e.type === 'ACTOR' && e.faction === 'sentinel');
    out.set(canonicalActionKey('R0', action, size), { vector: total, total: scalarizeRewardV2(total), outcome, terminalReason: cur.terminalReason ?? null, path, actorHealthEnd: actor?.health ?? null });
  }
  const frozen = evaluateCounterfactualsSymmetricV1(world, { horizon });
  for (const b of frozen.branches) ok(out.get(b.actionKey)?.total === b.totalScalar, 'VECTOR_TRUTH_DIVERGES_FROM_FROZEN');
  return out;
}

export const score = (selections, menu, truth) => scoreSyntheticTruth(selections, menu, truth);

// ---- consistent public-view relabelling (O-2R.1 mechanics with caller-supplied maps) ----
export function identityUniverse(view) {
  return [...new Set([view.state.actor.entityId, ...view.observation.metadata.canonicalState.entities.map((e) => e.id), ...view.observation.metadata.objectives.flatMap((o) => [o.id, o.entityId])])].sort();
}
/** Replace every string VALUE equal to a mapped identifier (keys untouched), exactly as identity-view(-v2).mjs does. */
export function relabelView(view, entityMap, handleMap) {
  const m = { ...entityMap };
  for (const [k, v] of Object.entries(handleMap)) { ok(!Object.hasOwn(m, k), 'MAP_OVERLAP'); m[k] = v; }
  const f = (x) => (typeof x === 'string' ? (Object.hasOwn(m, x) ? m[x] : x) : Array.isArray(x) ? x.map(f) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, f(v)])) : x);
  return f(structuredClone(view));
}
export function prng(label) {
  let a = parseInt(sha(label).slice(0, 8), 16) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffled(xs, rnd) { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pad = (i) => String(i).padStart(4, '0');
/** Control relabellings. ORDER_PRESERVING keeps the lexical order of entity ids and of action handles. */
export function controlMaps(view, kind, label) {
  const ids = identityUniverse(view), menu = view.surface.map((e) => e.actionId);
  const o2rEntity = Object.fromEntries(ids.map((id, i) => [id, `entity-${ids.length - i}`]));
  const o2rHandle = Object.fromEntries(menu.map((id, i) => [id, `opaque-${menu.length - i}`]));
  if (kind === 'O2R1_EQUIVALENT') return { entity: o2rEntity, handle: o2rHandle };
  if (kind === 'HANDLES_ONLY') return { entity: {}, handle: o2rHandle };
  if (kind === 'ENTITIES_ONLY') return { entity: o2rEntity, handle: {} };
  if (kind === 'ORDER_PRESERVING') { const sortedMenu = [...menu].sort(); return { entity: Object.fromEntries(ids.map((id, i) => [id, `entity-${pad(i)}`])), handle: Object.fromEntries(sortedMenu.map((id, i) => [id, `opaque-${pad(i)}`])) }; }
  if (kind.startsWith('RANDOM')) { const r = prng(label + ':' + kind), pe = shuffled(ids.map((_, i) => i), r), ph = shuffled(menu.map((_, i) => i), r);
    return { entity: Object.fromEntries(ids.map((id, i) => [id, `entity-${pad(pe[i])}`])), handle: Object.fromEntries(menu.map((id, i) => [id, `opaque-${pad(ph[i])}`])) }; }
  throw Error('UNKNOWN_CONTROL');
}

// ---- transform-validity probes ----
export function stringLeaves(x, path = '$', out = []) {
  if (typeof x === 'string') out.push([path, x]);
  else if (Array.isArray(x)) x.forEach((v) => stringLeaves(v, path + '[]', out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) stringLeaves(v, path + '.' + k, out);
  return out;
}
export function objectKeys(x, out = []) {
  if (Array.isArray(x)) x.forEach((v) => objectKeys(v, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { out.push(k); objectKeys(v, out); }
  return out;
}
export function changedLeafPaths(a, b, path = '$', out = new Set()) {
  if (a === b) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changedLeafPaths(a[k], b[k], path + (Array.isArray(a) ? '[]' : '.' + k), out);
    return out;
  }
  out.add(path); return out;
}

// ---- public decision-time descriptors (all from the public view; used only for diagnosis and DEV guard research) ----
export function publicDescriptors(view, s0scores) {
  const st = view.state, byId = new Map(st.entities.map((e) => [e.entityId, e]));
  const hostiles = st.entities.filter((e) => e.entityKind === 'HOSTILE' && e.inService);
  const md = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
  const nearestHostileFrom = (p) => (hostiles.length ? Math.min(...hostiles.map((h) => md(p, h.observedPosition))) : null);
  const actions = view.surface.map((e, i) => {
    const t = byId.get(e.targetEntityId) ?? null, dest = view.semantics[i]?.observableSpatialEffect?.destination ?? null;
    return { t: e.actionType, k: t?.entityKind ?? null,
      f: t ? [t.criticalFlag, t.objectiveFlag, t.hostileFlag, t.threatenedFlag, t.inService, t.hubFlag].map(Number).join('') : null,
      d: t?.relativeDistance?.manhattan ?? null, p: t?.relativeDistance?.path ?? null, rel: t ? t.observedRelationships.length : null,
      hd: dest ? nearestHostileFrom(dest) : nearestHostileFrom(st.actor.observedPosition), s: s0scores[i] };
  });
  return {
    actor: { energy: st.actor.energy, health: st.actor.actorHealth, carried: st.actor.carriedMaterial, ticks: st.actor.ticksRemaining },
    hostiles: hostiles.length, nearestHostile: nearestHostileFrom(st.actor.observedPosition),
    threatened: st.entities.filter((e) => e.threatenedFlag).length, outOfService: st.entities.filter((e) => !e.inService).length,
    objectivesOpen: view.observation.metadata.objectives.filter((o) => o.deliveredValue < o.requiredValue).length,
    actions,
  };
}
