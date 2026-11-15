// Frozen policy arms for STAGE3H_ASCII_COMPETENCE_BENCHMARK_V1.
// Every arm receives the identical frozen public packet (observation + offered legal actions) and nothing else.
// No arm receives simulator state, successors, seeds, evaluator labels or witnesses.
// Existing controllers and experts are imported unchanged; the only new code here is one explicitly declared
// composition adapter (NEXUS_REPAIR_OVER_STRONGEST_V1) that reuses the existing v31 public graph and the existing
// Nexus relational selector port over the existing offered REPAIR branch set, exactly as the v31 binding does.
import { createPolicy as createV32 } from '../ascii-suite/v32/policy.mjs';
import { createPolicyV331 } from '../ascii-quality-v33_1/policy-v33_1.mjs';
import { publicGraph, sentinelDecide, sentinelState } from '../ascii-suite/v31/sentinel.mjs';
import { controllerState, decide as decideV3 } from '../ascii-suite/v3/controllers.mjs';
import { evaluateNexus } from '../src/experts/nexus.js';
import { evaluateOracle } from '../src/experts/oracle.js';
import { nexusRelationalSelector } from '../stage3h-canonical-v1/nexus-selector-v1-port.mjs';

export const GAMES = Object.freeze(['pong', 'platformer', 'fighter', 'racing', 'rescue', 'cards', 'factory', 'roguelike']);
export const LEGACY_GAMES = Object.freeze(['pong', 'platformer', 'fighter', 'racing']);
export const STRATEGIC_GAMES = Object.freeze(['rescue', 'cards', 'factory', 'roguelike']);

// Strongest qualified native controller per game, chosen from pre-existing v33.1 development evidence only
// (ascii-quality-v33_1/RESULT.json: STRONG_V33_1 platformer Advanced 24/24 vs v32 STRONG 0/24, equal on Expert/Extreme;
// STRONG_RESCUE_V33_1 = v32 STRONG plus a stale-packet crash guard). All other games: v32 STRONG is the strongest existing.
export const STRONGEST_KIND = Object.freeze({ platformer: 'STRONG_V33_1', rescue: 'STRONG_RESCUE_V33_1' });
const strongest = (game, opts) => createPolicyV331(game, STRONGEST_KIND[game] ?? 'STRONG', opts);

export const ARMS = Object.freeze({
  STRONGEST_NATIVE: { role: 'BASELINE_STRONGEST', games: GAMES, source: 'ascii-quality-v33_1/policy-v33_1.mjs (platformer/rescue) else ascii-suite/v32/policy.mjs STRONG', expertsInvoked: [] },
  INCUMBENT_STRONG_V32: { role: 'BASELINE_INCUMBENT', games: GAMES, source: 'ascii-suite/v32/policy.mjs STRONG', expertsInvoked: [] },
  RULE_V32: { role: 'BASELINE_REFERENCE_RULE', games: GAMES, source: 'ascii-suite/v32/policy.mjs RULE', expertsInvoked: [] },
  FIXED_WAIT: { role: 'FLOOR_NONADAPTIVE', games: GAMES, source: 'ascii-suite/v32/policy.mjs WAIT', expertsInvoked: [] },
  UNIFORM_RANDOM: { role: 'FLOOR_RANDOM_LEGAL', games: GAMES, source: 'ascii-suite/v32/policy.mjs RANDOM', expertsInvoked: [] },
  // Existing Sentinel recommendation path, unchanged (v31 binding): Nexus may own a public REPAIR in factory only.
  SENTINEL_V31_AS_IS: { role: 'SENTINEL_EXISTING_BINDING', games: STRATEGIC_GAMES, source: 'ascii-suite/v31/sentinel.mjs#sentinelDecide', expertsInvoked: ['Nexus', 'Oracle'] },
  // Exact ablation of SENTINEL_V31_AS_IS: the identical inner fallback planner with Nexus/Oracle removed.
  V31_FALLBACK_ABLATION: { role: 'ABLATION_OF_SENTINEL_V31', games: STRATEGIC_GAMES, source: 'ascii-suite/v3/controllers.mjs#decide BOUNDED_PLANNER', expertsInvoked: [] },
  // Declared composition adapter: Nexus relational selector over offered REPAIRs, fallback = strongest native controller.
  NEXUS_REPAIR_OVER_STRONGEST_V1: { role: 'SENTINEL_DECLARED_ADAPTER', games: ['factory'], source: 'this file; v31 publicGraph + nexus-selector-v1-port, unchanged', expertsInvoked: ['Nexus'] },
  // Read-only shadow: strongest native controller acts; Sentinel evidence is computed and never applied.
  SHADOW_SENTINEL_READONLY: { role: 'NONINTERFERENCE_CONTROL', games: GAMES, source: 'strongest native + v31 nativeEvidence-equivalent advisory calls', expertsInvoked: ['Nexus', 'Oracle'] },
});
export const ARM_NAMES = Object.freeze(Object.keys(ARMS));

const channels = (o) => { const a = o.actor ?? o.body ?? o.me ?? {}; return { x: a.x ?? 0, y: a.y ?? 0, health: a.health ?? a.hp ?? 0, progress: o.delivered ?? o.publicMetrics?.extracted ?? o.publicMetrics?.teamScore ?? 0, resources: o.credits ?? o.clues ?? o.supplies ?? 0 }; };
// Advisory evidence exactly as v31 nativeEvidence computes it (same graph, same history window), without action authority.
function advisory(o, history, actions) {
  history.push({ tick: o.tick, channels: channels(o) }); while (history.length > 32) history.shift();
  const graph = publicGraph(o);
  const nexus = evaluateNexus({ canonicalState: graph, legalActions: actions.map((a) => ({ actionId: a.id, targetEntityId: a.parameters?.id ?? null })) });
  const oracle = evaluateOracle({ observationHistory: history });
  return { nexus, oracle };
}

const now = () => performance.now();
/** Create the acting policy for player index 0 of `arm`. Partners (cards) are always v32 STRONG, as in the v32 runner. */
export function createArm(arm, game, { seed = 74123, partnerStyle = null } = {}) {
  if (!ARMS[arm]) throw Error('UNKNOWN_ARM:' + arm);
  if (!ARMS[arm].games.includes(game)) throw Error('ARM_INAPPLICABLE:' + arm + ':' + game);
  const opts = { seed, partnerStyle };
  const wrap = (inner, extra = {}) => ({ arm, decide(p) { const t = now(), d = inner.decide(p); return { ...d, armLatencyMs: now() - t, expertCalls: 0, nexusChanged: false, ...extra }; } });
  switch (arm) {
    case 'STRONGEST_NATIVE': return wrap(strongest(game, opts));
    case 'INCUMBENT_STRONG_V32': return wrap(createV32(game, 'STRONG', opts));
    case 'RULE_V32': return wrap(createV32(game, 'RULE', opts));
    case 'FIXED_WAIT': return wrap(createV32(game, 'WAIT', opts));
    case 'UNIFORM_RANDOM': return wrap(createV32(game, 'RANDOM', opts));
    case 'SENTINEL_V31_AS_IS': {
      let s = sentinelState({ memoryMode: 'EPISODE_MEMORY_ONLY' });
      return { arm, decide(p) {
        const t = now(); if (!p.actions.length) return { action: null, abstain: true, armLatencyMs: 0 };
        if (!p.observation) { const a = p.actions.find((x) => x.type === 'WAIT') ?? p.actions[0]; return { action: a, abstain: true, reason: 'MISSING_OBSERVATION_EXPLICIT_SAFE_FALLBACK', armLatencyMs: now() - t, expertCalls: 0, nexusChanged: false }; }
        const d = sentinelDecide(p, s); s = d.state;
        const fired = d.integration.actionSource === 'NEXUS_RELATIONAL_SELECTOR_V1';
        // sentinelDecide overwrites its fallback action, so "changed versus fallback" is not observable inside this arm;
        // it is measured by pairing with V31_FALLBACK_ABLATION on the identical world (trajectory comparison).
        return { action: p.actions.find((x) => x.id === d.action?.id) ?? null, reason: d.reason, abstain: false, actionSource: d.integration.actionSource, armLatencyMs: now() - t, expertCalls: 2, nexusFired: fired, nexusChanged: null, work: (d.work?.expansions ?? 0) + (d.work?.candidates ?? 0) };
      } };
    }
    case 'V31_FALLBACK_ABLATION': {
      // sentinelDecide calls decide(packet, planner) with planner = controllerState('BOUNDED_PLANNER', options): identical here.
      let s = controllerState('BOUNDED_PLANNER', { memoryMode: 'EPISODE_MEMORY_ONLY' });
      return { arm, decide(p) {
        const t = now(); if (!p.actions.length) return { action: null, abstain: true, armLatencyMs: 0 };
        if (!p.observation) { const a = p.actions.find((x) => x.type === 'WAIT') ?? p.actions[0]; return { action: a, abstain: true, reason: 'MISSING_OBSERVATION_EXPLICIT_SAFE_FALLBACK', armLatencyMs: now() - t, expertCalls: 0, nexusChanged: false }; }
        const d = decideV3(p, s); s = d.state;
        return { action: p.actions.find((x) => x.id === d.action?.id) ?? null, reason: d.reason, abstain: false, actionSource: 'BOUNDED_PLANNER_FALLBACK', armLatencyMs: now() - t, expertCalls: 0, nexusChanged: false, work: (d.work?.expansions ?? 0) + (d.work?.candidates ?? 0) };
      } };
    }
    case 'NEXUS_REPAIR_OVER_STRONGEST_V1': {
      const base = strongest(game, opts);
      return { arm, decide(p) {
        const t = now(), d = base.decide(p), tb = now() - t; // fallback always runs first: its state evolves exactly as in STRONGEST_NATIVE
        if (!p.observation || !p.actions.length) return { ...d, armLatencyMs: now() - t, baseLatencyMs: tb, expertCalls: 0, nexusFired: false, nexusChanged: false };
        const graph = publicGraph(p.observation);
        const nexus = evaluateNexus({ canonicalState: graph, legalActions: p.actions.map((a) => ({ actionId: a.id, targetEntityId: a.parameters?.id ?? null })) });
        const repairs = p.actions.filter((a) => a.type === 'REPAIR');
        const sel = nexusRelationalSelector({ branches: repairs.map((a) => ({ actionKey: a.id, actionType: a.type })) }, nexus);
        const chosen = sel.abstain ? null : repairs.find((a) => a.id === sel.actionId);
        const action = chosen ?? d.action;
        return { ...d, action, actionSource: chosen ? 'NEXUS_RELATIONAL_SELECTOR_V1' : d.actionSource, armLatencyMs: now() - t, baseLatencyMs: tb, expertCalls: 1,
          nexusFired: !!chosen, nexusChanged: !!chosen && chosen.id !== d.action?.id, fallbackActionId: d.action?.id ?? null, nexusCodes: nexus.rationaleCodes };
      } };
    }
    case 'SHADOW_SENTINEL_READONLY': {
      const base = strongest(game, opts), history = [];
      return { arm, decide(p) {
        const t = now(), d = base.decide(p), tb = now() - t;
        let shadow = null;
        if (p.observation) { const ev = advisory(p.observation, history, p.actions); shadow = { nexusCodes: ev.nexus.rationaleCodes, oracleAbstain: !!ev.oracle.abstain }; }
        return { ...d, armLatencyMs: now() - t, baseLatencyMs: tb, expertCalls: p.observation ? 2 : 0, nexusChanged: false, shadow };
      } };
    }
  }
  throw Error('UNREACHABLE');
}
export const partnerPolicy = (game, i, partnerStyle) => createV32(game, 'STRONG', { seed: 74123 + i * 7919, partnerStyle });
