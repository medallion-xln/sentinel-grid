// Identity-free key collisions: menus in which two actions share one semantic key. For every such class, compares the
// colliding actions' offline outcomes across every equivalent world. If colliding actions ever differ in catastrophe or
// introduction status, an identity-invariant public policy cannot tell them apart there (an observability limit of the
// key); if they are outcome-identical, the collision is harmless. Writes evidence/KEY_COLLISIONS.json once.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { evaluatorTruth, prng, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { candidates, DRAWS } from '../stage3h-safety-feasibility-v1/search.mjs';
import { nativeWorld, hiddenSupport, decisions, twinFamily } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { semanticKey } from './intersect.mjs';
import { worldLabels } from './contract.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), dir = resolve(LANE, 'work/intersect');
const rows = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(resolve(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
const flagged = rows.filter((r) => !r.identity.semanticKeysUnique), cands = candidates();
const classes = flagged.map((r) => {
  const c = cands.find((x) => x.set === r.set && x.row.idx === r.idx), combo = comboOf(c.row), base = nativeWorld(combo), dec = decisions(base.view, base.band);
  const keys = base.view.surface.map((_, i) => semanticKey(base.view, i)), groups = Object.values(keys.reduce((m, k, i) => ((m[k] ??= []).push(i), m), {})).filter((g) => g.length > 1);
  const members = [base]; for (const f of twinFamily(hiddenSupport(base.config).coords, prng(base.worldHash), DRAWS)) { const t = nativeWorld(combo, f.spec); if (!t.rejected && t.content === base.content) members.push(t); }
  const L = members.map((m) => { const u = evaluatorTruth(m.world, m.horizon, dec.menu).map((x) => x.utility); return { u, ...worldLabels(u, dec.B, dec.N) }; });
  return { set: r.set, idx: r.idx, cell: r.cell, worlds: members.length, groups: groups.map((g) => ({ actions: g, type: base.view.surface[g[0]].actionType, key: JSON.parse(keys[g[0]]),
    targets: g.map((i) => base.view.surface[i].targetEntityId ? base.view.state.entities.find((e) => e.entityId === base.view.surface[i].targetEntityId)?.entityKind : null),
    utilityIdenticalInEveryWorld: L.every((l) => g.every((i) => l.u[i] === l.u[g[0]])), catastropheStatusIdentical: L.every((l) => g.every((i) => l.cat[i] === l.cat[g[0]])), introFreeStatusIdentical: L.every((l) => g.every((i) => l.introFree[i] === l.introFree[g[0]])),
    containsOracle: r.oracle ? g.includes(r.oracle.index) : false, containsArm: g.some((i) => dec.B.includes(i) || dec.N.includes(i)) })) };
});
const groups = classes.flatMap((c) => c.groups);
const out = { schema: 'STAGE3H_WIDER_ACTION_KEY_COLLISIONS_V1', authority: 'R0', classesWithCollisions: classes.length, collisionGroups: groups.length,
  groupsOutcomeIdentical: groups.filter((g) => g.utilityIdenticalInEveryWorld).length, groupsDifferingInCatastrophe: groups.filter((g) => !g.catastropheStatusIdentical).length, groupsDifferingInIntroFree: groups.filter((g) => !g.introFreeStatusIdentical).length,
  groupsContainingOracle: groups.filter((g) => g.containsOracle).length, groupsContainingArm: groups.filter((g) => g.containsArm).length, byType: groups.reduce((m, g) => ((m[g.type] = (m[g.type] ?? 0) + 1), m), {}), classes };
writeExclusive(resolve(LANE, 'evidence/KEY_COLLISIONS.json'), out);
console.log(JSON.stringify({ ...out, classes: classes.map((c) => ({ idx: c.idx, groups: c.groups.map((g) => ({ type: g.type, n: g.actions.length, targets: g.targets, same: g.utilityIdenticalInEveryWorld, catSame: g.catastropheStatusIdentical, oracle: g.containsOracle, arm: g.containsArm })) })) }, null, 1));
