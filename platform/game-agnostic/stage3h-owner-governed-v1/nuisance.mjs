// Prospective method amendment O-2 (requires owner approval under SCOPE-THRESHOLDS; changes no threshold or family size).
// V3 runner.nuisanceDependence asserts that every twin's native truth equals the original's under the action map.
// Native development replay (evidence/connector-validation.json) shows this holds for all D4 and ORDER twins but NOT
// for IDENTITY twins: the frozen symmetric counterfactual evaluator sorts and tie-breaks by canonical action keys that
// embed entity ids, so renaming entities changes native utilities in a substantial fraction of worlds.
// Amendment: D4 and ORDER are computed exactly as V3 (including the truth-equality assertion). IDENTITY measures the
// policy's sensitivity to identity renaming with the ORIGINAL truth held fixed: twin selections are mapped back through
// the inverse action map and scored against the original world's truth. When native truth is identity-invariant this
// equals the V3 value exactly (tested). Whether native truth was identity-invariant is recorded per unit.
import { scoreSyntheticTruth } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { ORIENTATIONS } from '../src/forge-symmetric/orientation-symmetric-v1.js';
const ok = (v, m) => { if (!v) throw Error(m); };
const setKey = (ids) => JSON.stringify([...ids].sort());
export const NUISANCE_AMENDMENT_ID = 'STAGE3H_OWNER_GOVERNED_NUISANCE_O2_V1';

function checkBijection(original, v) {
  ok(v.row.id === original.id && v.row.band === original.band && v.row.regime === original.regime, 'NUISANCE_UNIT_OR_STRATUM_CHANGED');
  ok(setKey(Object.keys(v.actionMap)) === setKey(original.menu) && setKey(Object.values(v.actionMap)) === setKey(v.row.menu), 'INCOMPLETE_ACTION_BIJECTION');
  ok(new Set(Object.values(v.actionMap)).size === original.menu.length, 'NONBIJECTIVE_ACTION_MAP');
  ok(original.truth.length === original.menu.length && v.row.truth.length === v.row.menu.length, 'MISSING_NUISANCE_TRUTH');
}
const diff = (metrics, key) => metrics.R.nreg - metrics[key === 'RB' ? 'B' : 'N'].nreg;

export function nuisanceOwnerV1(original, variants) {
  const verify = (row) => ok(JSON.stringify(scoreSyntheticTruth(row.selections, row.menu, row.truth).metrics) === JSON.stringify(row.metrics), 'NUISANCE_METRICS_NOT_FROM_TRUTH');
  verify(original);
  const values = {}, identityTruthInvariant = [];
  for (const category of ['D4', 'IDENTITY', 'ORDER']) {
    const vs = variants.filter((v) => v.category === category), expected = category === 'D4' ? ORIENTATIONS : [category];
    ok(vs.length === expected.length && setKey(vs.map((v) => v.transform)) === setKey(expected), 'MISSING_OR_DUPLICATE_NUISANCE');
    for (const v of vs) {
      checkBijection(original, v); verify(v.row);
      const invariant = original.truth.every((t) => v.row.truth.find((x) => x.id === v.actionMap[t.id])?.utility === t.utility);
      if (category !== 'IDENTITY') { ok(invariant, 'NUISANCE_TRUTH_CHANGED'); v.scored = v.row.metrics; continue; }
      identityTruthInvariant.push(invariant);
      const inverse = Object.fromEntries(Object.entries(v.actionMap).map(([a, b]) => [b, a]));
      const mapped = Object.fromEntries(Object.entries(v.row.selections).map(([arm, ids]) => [arm, ids.map((id) => inverse[id])]));
      v.scored = scoreSyntheticTruth(mapped, original.menu, original.truth).metrics;
    }
    values[category] = Object.fromEntries(['RB', 'RN'].map((key) => [key, Math.max(...vs.map((v) => Math.abs(diff(original.metrics, key) - diff(v.scored, key))))]));
  }
  return { values, identityTruthInvariant: identityTruthInvariant.every(Boolean), amendment: NUISANCE_AMENDMENT_ID, independentUnitCount: 1, variantsAreIndependentWorlds: false };
}
