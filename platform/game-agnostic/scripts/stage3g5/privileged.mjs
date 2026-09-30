// Attribution-only intervention on a source-hash-bound copy of the frozen kernel. Never imported by deployable code.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../../src/core/determinism.js';
import { isTerminal } from '../../src/forge/kernel.js';
import { rewardV2For, scalarizeRewardV2 } from '../../src/forge/reward-v2.js';
import { symmetricLegalActions, symmetricStep, toKernelAction } from '../../src/forge-symmetric/action-surface-symmetric-v1.js';
import { canonicalOrientation } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
const kernelUrl = new URL('../../src/forge/kernel.js', import.meta.url);
const source = readFileSync(kernelUrl, 'utf8');
export const ABLATION_KERNEL_HASH = sha256(source);
const modules = {};
for (const mask of ['NO_HOSTILE', 'NO_HAZARD', 'NO_ENV']) {
  let s = source.replace(/from '([^']+)'/g, (_, p) => `from '${new URL(p, kernelUrl).href}'`);
  const replacements = [
    ...(mask !== 'NO_HOSTILE' ? [["if (terrain.tickDamage && !entity.flags.protected)", 'if (false && terrain.tickDamage && !entity.flags.protected)']] : []),
    ...(mask !== 'NO_HAZARD' ? [[".filter((entry) => entry.type === 'attacks')", ".filter((entry) => false && entry.type === 'attacks')"]] : []),
  ];
  for (const [before, after] of replacements) {
    if (s.split(before).length !== 2) throw new Error(`ABLATION_SOURCE_DRIFT: ${before}`);
    s = s.replace(before, after);
  }
  modules[mask] = await import(`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`);
}
export function privilegedTransition(world, action, mask = 'KNOWN') {
  const r = mask === 'KNOWN' ? symmetricStep(world, action) : modules[mask].step(world, toKernelAction(world, action));
  const vector = rewardV2For({ before: world, after: r.state, v1Vector: r.rewardVector, events: r.events, terminal: r.terminal, outcome: r.outcome });
  return { ...r, scalar: scalarizeRewardV2(vector) };
}
export function boundedValues(world, action, D, mask = 'KNOWN', frame = canonicalOrientation(world).orientation) {
  function best(state, depth) {
    if (!depth || isTerminal(state)) return 0;
    const actions = symmetricLegalActions(state, frame);
    if (!actions.length) return 0;
    return Math.max(...actions.map(a => { const r = privilegedTransition(state, a, mask); return r.scalar + (r.terminal ? 0 : best(r.state, depth - 1)); }));
  }
  const root = privilegedTransition(world, action, mask);
  return Array.from({ length: D + 1 }, (_, d) => root.scalar + (root.terminal ? 0 : best(root.state, d)));
}
export function effectAudit(world, actions) {
  const flags = { HOSTILE_ATTACK: false, HAZARD_DAMAGE: false, SERVICE_REVERSAL: false, ENTITY_STATE_CHANGE: false, RESOURCE_STATE_CHANGE: false, OTHER: false };
  const before = new Map(world.entities.map(e => [e.id, e]));
  for (const a of actions) {
    const r = privilegedTransition(world, a);
    if (r.events.some(e => e.type === 'DEGRADED')) flags.HOSTILE_ATTACK = true;
    if (r.events.some(e => e.type === 'HAZARD_DAMAGE')) flags.HAZARD_DAMAGE = true;
    for (const e of r.state.entities) {
      const b = before.get(e.id);
      const changed = b && (e.health !== b.health || e.available !== b.available);
      const envAffected = r.events.some(x => ['DEGRADED', 'HAZARD_DAMAGE'].includes(x.type) && x.id === e.id);
      if (changed && envAffected) {
        flags.ENTITY_STATE_CHANGE = true;
        if (e.type === 'RESOURCE') flags.RESOURCE_STATE_CHANGE = true;
        if (a.actionType === 'RESTORE' && a.target?.id === e.id && (!e.available || e.health <= 0)) flags.SERVICE_REVERSAL = true;
      }
    }
    // Frozen advanceWorld has no other autonomous event types.
  }
  return flags;
}
