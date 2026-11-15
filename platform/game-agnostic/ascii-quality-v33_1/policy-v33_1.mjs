// v33.1 policy registry: the unchanged v32 policies plus separately versioned candidates.
//  STRONG_V33_1 (platformer only): v32 STRONG wrapper semantics with SENTINEL_PLATFORMER_TRAJECTORY_PLANNER_V2 (repair on).
//  STRONG_V1COPY (platformer only): same wrapper with the V2 copy in repair=false mode; must equal v32 STRONG bit-for-bit.
//  STRONG_RESCUE_V33_1 (rescue only): v32 STRONG with the stale-packet guard controller copy (controllers-v33_1.mjs).
// Everything else delegates to ascii-suite/v32/policy.mjs unchanged. No mechanics, observation or action change.
import { createPolicy as createV32 } from '../ascii-suite/v32/policy.mjs';
import { createPlatformerPlannerV2, PLANNER_V2_ID } from './platformer-planner-v2.mjs';
import { controllerState, decide as decideV331 } from './controllers-v33_1.mjs';
export const POLICIES_V33_1 = Object.freeze(['STRONG_V33_1', 'STRONG_V1COPY', 'STRONG_RESCUE_V33_1']);
export function createPolicyV331(game, kind = 'STRONG', options = {}) {
  if (!POLICIES_V33_1.includes(kind)) return createV32(game, kind, options);
  if (kind === 'STRONG_RESCUE_V33_1') {
    if (game !== 'rescue') throw Error('STRONG_RESCUE_V33_1_IS_RESCUE_ONLY');
    let s = controllerState('BOUNDED_PLANNER', { memoryMode: 'EPISODE_MEMORY_ONLY' });
    return { kind, modelId: null, version: 'RESCUE_CONTROLLER_V33_1', decide(p) {
      const start = performance.now(), actions = p.actions, fallback = actions.find((a) => a.type === 'WAIT') ?? actions[0];
      if (!actions.length) return { abstain: true, action: null };
      if (!p.observation) return { action: fallback, reason: 'MISSING_OBSERVATION_EXPLICIT_SAFE_FALLBACK', abstain: true, actionSource: 'EXISTING_GAME_PLANNER_ACTION', canonicalExpertsInvoked: [], work: 0, latencyMs: performance.now() - start };
      let a, reason, work = 0, abstain = false;
      const o = p.observation, visiblePacket = o.actor.carrying && o.extractions ? { ...p, observation: { ...o, extraction: [...o.extractions].sort((x, y) => Math.abs(o.actor.x - x.x) + Math.abs(o.actor.y - x.y) - Math.abs(o.actor.x - y.x) - Math.abs(o.actor.y - y.y))[0] } } : p;
      try { const d = decideV331(visiblePacket, s); s = d.state; a = actions.find((x) => x.id === d.action?.id); work = (d.work.expansions ?? 0) + (d.work.candidates ?? 0); reason = d.reason; } catch (error) { reason = 'PUBLIC_CONTROLLER_EXCEPTION_ABSTAIN:' + error.message; abstain = true; }
      a ??= fallback;
      return { action: a, reason, abstain, actionSource: 'EXISTING_GAME_PLANNER_ACTION', canonicalExpertsInvoked: [], expertComplementarity: 'NOT_TESTABLE', modelId: null, memoryStatus: 'WITHIN_EPISODE_ONLY', contribution: null, actionChanges: 0, invocations: 0, work, latencyMs: performance.now() - start };
    } };
  }
  if (game !== 'platformer') throw Error(kind + '_IS_PLATFORMER_ONLY');
  const planner = createPlatformerPlannerV2({ memory: true, repair: kind === 'STRONG_V33_1', debug: !!options.debug });
  return { kind, modelId: null, version: PLANNER_V2_ID + (kind === 'STRONG_V33_1' ? '/repair' : '/v1copy'), planner, decide(p) {
    const start = performance.now(), o = p.observation, actions = p.actions, find = (type) => actions.find((x) => x.type === type);
    const fallback = find('WAIT') ?? actions[0];
    if (!actions.length) return { abstain: true, action: null };
    let a, reason = 'public observation planner', work = 0, abstain = false;
    if (!o) { a = fallback; abstain = true; reason = 'MISSING_OBSERVATION_EXPLICIT_SAFE_FALLBACK'; }
    else {
      // Identical to the v32 STRONG wrapper for platformer (policy.mjs legacy branch): dependency pickup first, then planner.
      if (o.tier >= 2 && o.dependencies) { const d = o.dependencies, b = o.body, goal = !d.inventory.keys ? d.key : !d.inventory.switch ? d.switch : null; if (goal) { const type = !d.inventory.keys ? 'TAKE_KEY' : 'ACTIVATE_SWITCH'; a = find(type); if (!a && b.x > goal.x + 1) a = find('MOVE_LEFT'); } }
      if (!a) { const d = planner.decide(o); a = find(d.action); work = d.branches ?? 0; reason = d.reason ?? reason; if (d.repair) reason += ' [' + d.repair + ']'; }
    }
    a ??= fallback;
    return { action: a, reason, abstain, actionSource: 'EXISTING_GAME_PLANNER_ACTION', canonicalExpertsInvoked: [], expertComplementarity: 'NOT_TESTABLE', modelId: null, memoryStatus: 'WITHIN_EPISODE_ONLY', contribution: null, actionChanges: 0, invocations: 0, work, latencyMs: performance.now() - start };
  } };
}
