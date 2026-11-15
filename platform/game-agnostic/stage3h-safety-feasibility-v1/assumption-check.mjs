// Phase 6 support: which assumption binds? For every VALID witness class, rebuilds the complete deterministic twin
// family (same rule and seed as search.mjs), keeps the publicly equivalent members, fixes both arms' decisions, then
// (evaluator only) lists the menu actions that are non-catastrophic in EVERY equivalent world. A non-empty list means a
// public-only rule that may choose outside S0 u N could be safe on the whole class, so the binding assumption there is
// the two-arm restriction rather than an absence of public information. This builds no selector: it only reports
// whether such an action exists, never how a policy could find it. Writes evidence/assumption-check.json once.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRows, comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { evaluatorTruth, prng, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { nativeWorld, hiddenSupport, decisions, twinFamily } from './twins.mjs';
import { DRAWS } from './search.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ok = (v, m) => { if (!v) throw Error(m); };
const witness = JSON.parse(readFileSync(resolve(LANE, 'evidence/witness.json'), 'utf8'));
const valid = [witness.primary, ...witness.others].filter((w) => w.valid);
const rows = {}, out = [];
for (const w of valid) {
  rows[w.set] ??= loadRows(w.set);
  const row = rows[w.set].find((r) => r.idx === w.idx), combo = comboOf(row), base = nativeWorld(combo), sup = hiddenSupport(base.config), dec = decisions(base.view, base.band);
  const members = [base];
  for (const f of twinFamily(sup.coords, prng(base.worldHash), DRAWS)) { const t = nativeWorld(combo, f.spec); if (!t.rejected && t.content === base.content) members.push(t); }
  const truths = members.map((m) => evaluatorTruth(m.world, m.horizon, dec.menu).map((x) => x.utility));
  const safeAll = dec.menu.map((_, i) => i).filter((i) => truths.every((u) => Math.max(...u) - u[i] < 100));
  const types = dec.menu.map((id) => base.view.surface.find((e) => e.actionId === id).actionType);
  out.push({ set: w.set, idx: w.idx, cell: w.cell, equivalentWorlds: members.length, B: dec.B, N: dec.N, armTypes: { B: dec.B.map((i) => types[i]), N: dec.N.map((i) => types[i]) },
    actionsSafeInEveryEquivalentWorld: safeAll.map((i) => ({ index: i, type: types[i], inBorN: dec.B.includes(i) || dec.N.includes(i) })), robustSafeActionOutsideArmsExists: safeAll.some((i) => !dec.B.includes(i) && !dec.N.includes(i)) });
}
const res = { schema: 'STAGE3H_SAFETY_FEASIBILITY_ASSUMPTION_CHECK_V1', authority: 'R0', validWitnessClasses: out.length,
  classesWithRobustSafeActionOutsideArms: out.filter((c) => c.robustSafeActionOutsideArmsExists).length, classesWithNoRobustSafeAction: out.filter((c) => c.actionsSafeInEveryEquivalentWorld.length === 0).length, classes: out };
ok(out.length === witness.witnessesValid, 'VALID_COUNT_MISMATCH');
writeExclusive(resolve(LANE, 'evidence/assumption-check.json'), res);
console.log(JSON.stringify(res, null, 1));
