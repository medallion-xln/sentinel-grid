// Phase 2 contrast: why D4 orientation passes while IDENTITY fails. DEV288 only. Usage: node d4-contrast.mjs
// For each development world and each of the 8 orientations: the oriented world's public view is locked with the
// frozen policies, decisions are mapped back through the oriented canonical action key (connector-v3 construction),
// and S0 / Nexus invariance is recorded together with whether each original menu handle is unchanged by the
// orientation (targeted actions' forgeActionKey carries no geometry; MOVE/RETREAT parameters do). Decisions only;
// no truth is computed. Writes evidence/d4-contrast-DEV288.json.
import { resolve } from 'node:path';
import { ORIENTATIONS, orientWorld, orientAction, canonicalActionKey } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { LANE, writeExclusive, devWorld, devLock } from './lib.mjs';
import { worldsOf } from './run-dev.mjs';

const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const rows = [];
for (const c of worldsOf('DEV288')) {
  const w = devWorld(c); if (w.rejected) continue;
  const size = w.world.grid.width, lock = devLock(w.view, w.band), type = new Map(w.view.surface.map((e) => [e.actionId, e.actionType]));
  const per = ORIENTATIONS.map((t) => {
    const map = Object.fromEntries(w.view.surface.map((e) => [e.actionId, canonicalActionKey('R0', orientAction(t, e.action, size), size)])), inv = Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
    const tl = devLock(observableView(orientWorld(t, w.world)), w.band), back = (ids) => ids.map((id) => inv[id]);
    const cls = lock.nexus.abstain ? [] : w.view.surface.filter((e) => e.actionType === type.get(lock.nexus.action)).map((e) => e.actionId);
    return { t, S0same: same(back(tl.s0.selected), lock.s0.selected), nexusSame: (lock.nexus.action ?? null) === (tl.nexus.action === null ? null : inv[tl.nexus.action]),
      tieClassHandlesUnchanged: cls.every((id) => map[id] === id), tieClassSize: cls.length };
  });
  rows.push({ idx: c.idx, band: w.band, nexusType: lock.nexus.abstain ? 'ABSTAIN' : type.get(lock.nexus.action), per });
}
const flat = rows.flatMap((r) => r.per.map((p) => ({ ...p, nexusType: r.nexusType })));
const out = { schema: 'STAGE3H_FAILURE_DIAGNOSIS_D4_CONTRAST_V1', worlds: rows.length, twins: flat.length,
  S0Invariant: flat.filter((p) => p.S0same).length, nexusInvariant: flat.filter((p) => p.nexusSame).length,
  nexusChangedWhereTieClassHandlesChanged: flat.filter((p) => !p.nexusSame && !p.tieClassHandlesUnchanged).length,
  nexusChangedWhereTieClassHandlesUnchanged: flat.filter((p) => !p.nexusSame && p.tieClassHandlesUnchanged).length,
  tieClassHandlesUnchanged: flat.filter((p) => p.nexusType !== 'ABSTAIN' && p.tieClassHandlesUnchanged).length, nonAbstainTwins: flat.filter((p) => p.nexusType !== 'ABSTAIN').length,
  nexusPickTypes: rows.reduce((m, r) => ({ ...m, [r.nexusType]: (m[r.nexusType] ?? 0) + 1 }), {}), authority: 'R0' };
writeExclusive(resolve(LANE, 'evidence/d4-contrast-DEV288.json'), { ...out, rows });
console.log(JSON.stringify(out, null, 1));
