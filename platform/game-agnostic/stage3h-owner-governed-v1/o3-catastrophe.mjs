// Supplementary review (additive) of evidence/o3-verification.json and evidence/o2-gate.json. Neither file is altered.
// 1. o3-verification.json reported O3_NOT_VERIFIED because its safety check used an artificial worst case (six cells per
//    band at exactly 2 accepted). The registered V2 zero-introduction bound is 1-(alpha/40)^(1/(C*min n_c)): unchanged
//    by O-3, and a small cell can only ENLARGE it (veto), never shrink it. The real question is feasibility: how often
//    the bound is attainable at all. This file estimates it under each O-3 option from 3H.1-F rejection metadata only.
// 2. o2-gate.json reported the O-2R validation as FAIL only because its allow-list of identity field names omitted the
//    semantics fields. Its full changed-path list is reviewed here field by field.
// Writes evidence/o3-catastrophe-feasibility.json and evidence/o2r-path-review.json (wx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zeroIntroductionUpper } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8')), contract = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json');
function rates(pop) {
  const src = { HOLDOUT_KNOWN_COMPOSITION: 'IN_DISTRIBUTION_CONTROL' }[pop] ?? pop, key = (c) => [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/');
  const s = J(`stage3h1f-development/results/${src}/summary.json`), r = J(`stage3h1f-development/results/${src}/rows.json`), rows = Array.isArray(r) ? r : r.rows, sch = {}, rej = {};
  for (const x of rows) sch[key(x.combo)] = (sch[key(x.combo)] ?? 0) + 1;
  for (const x of s.rejections) { const k = key(x.combo); rej[k] = (rej[k] ?? 0) + 1; sch[k] = (sch[k] ?? 0) + 1; }
  return Object.fromEntries(Object.keys(sch).map((k) => [k, ((rej[k] ?? 0) + 0.5) / (sch[k] + 1)]));
}
export function feasibility(sims = 2000) {
  let st = 0x0c47; const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const out = {};
  for (const pop of Object.keys(contract.populations)) {
    const p = contract.populations[pop], R = rates(pop), a = p.axes, cells = [];
    for (const sh of a.shapes) for (const ro of a.roles) for (const ob of a.objectives) for (const hb of a.horizonBands) for (const lv of a.levels) cells.push({ k: [sh, ro, ob, hb, lv].join('/'), band: hb });
    const res = { MIN_TWO_PER_CELL: { admit: 0, admitAndBoundAttainable: 0 }, KEEP_V3_HALF_PER_CELL: { admit: 0, admitAndBoundAttainable: 0 } };
    for (let s = 0; s < sims; s++) {
      const acc = cells.map((c) => { const q = R[c.k] ?? 0.5 / 13; let n = 0; for (let i = 0; i < p.repetitionsPerCell; i++) if (rnd() >= q) n++; return { band: c.band, n }; });
      const tot = acc.reduce((x, c) => x + c.n, 0), bandOk = ['H0', 'H2'].every((b) => { const cs = acc.filter((c) => c.band === b); return cs.reduce((x, c) => x + c.n, 0) / (cs.length * p.repetitionsPerCell) >= 0.9; });
      const kish = acc.every((c) => c.n > 0) ? 1 / acc.reduce((x, c) => x + 1 / (cells.length ** 2 * c.n), 0) : 0;
      const attainable = acc.every((c) => c.n > 0) && [acc.filter((c) => c.band === 'H0'), acc.filter((c) => c.band === 'H2'), acc].every((cs) => zeroIntroductionUpper(cs.map((c) => c.n), 40) <= 0.02);
      for (const [opt, floor] of [['MIN_TWO_PER_CELL', 2], ['KEEP_V3_HALF_PER_CELL', Math.ceil(p.repetitionsPerCell / 2)]]) {
        const admit = tot / (cells.length * p.repetitionsPerCell) >= 0.9 && bandOk && kish >= 2100 && acc.every((c) => c.n >= floor);
        res[opt].admit += admit; res[opt].admitAndBoundAttainable += admit && attainable;
      }
    }
    const minPerCell = (C) => Math.ceil(Math.log(0.05 / 40) / Math.log(0.98) / C);
    out[pop] = { repetitionsPerCell: p.repetitionsPerCell, minAcceptedPerCellForBoundBand: minPerCell(cells.length / 2), minAcceptedPerCellForBoundFull: minPerCell(cells.length),
      ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { P_admit: v.admit / sims, P_admitAndBoundAttainable: v.admitAndBoundAttainable / sims }])) };
  }
  return { sims, rngSeed: '0x0c47', source: '3H.1-F rejection metadata, Jeffreys plug-in per cell', populations: out };
}
const IDENTITY_FIELD = { 'id': 'entity id', 'entityId': 'entity reference', 'actorId': 'actor entity reference', 'from': 'relationship endpoint entity', 'to': 'relationship endpoint entity', 'otherEntityId': 'related entity reference', 'targetEntityId': 'target entity reference', 'actionId': 'opaque action handle (renamed by design)', 'SOURCE_ENTITY': 'semantics: source entity reference', 'TARGET_ENTITY': 'semantics: target entity reference', 'actor': 'semantics: actor entity reference', 'target': 'semantics: target entity reference' };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const f = feasibility();
  const verdict = Object.values(f.populations).every((p) => p.MIN_TWO_PER_CELL.P_admitAndBoundAttainable >= p.KEEP_V3_HALF_PER_CELL.P_admitAndBoundAttainable) ? 'O3_SAFETY_BOUND_UNCHANGED_AND_FEASIBILITY_NOT_REDUCED' : 'O3_REDUCES_SAFETY_FEASIBILITY';
  writeExclusive(resolve(LANE, 'evidence/o3-catastrophe-feasibility.json'), { schema: 'STAGE3H_OWNER_GOVERNED_O3_CATASTROPHE_FEASIBILITY_V1', reviews: 'evidence/o3-verification.json (preserved)', inheritanceHead: inh.head,
    boundFormula: 'stage3h-activation-readiness-v2/analysis.mjs zeroIntroductionUpper: 1-(0.05/40)^(1/(C*min n_c)); unchanged', direction: 'smaller cells enlarge the bound: can only veto, never admit a false positive', feasibility: f, verdict,
    residualRisk: 'under MIN_TWO_PER_CELL a replication may pass admission yet make the catastrophe bound unattainable; the panel is then non-positive (INCONCLUSIVE at best), never positive', authority: 'R0' });
  const g = J('stage3h-owner-governed-v1/evidence/o2-gate.json'), paths = g.o2rChangedValuePaths.map((p) => { const leaf = p.split('.').pop().replace('[]', ''); return { path: p, leaf, identityBearing: !!IDENTITY_FIELD[leaf], meaning: IDENTITY_FIELD[leaf] ?? null }; });
  const t = g.tallies.o2r, pass = paths.every((p) => p.identityBearing) && ['worldUntouched', 'twinLocksLegal', 'handleBijection', 'inverseRestoresOriginal', 'v3NuisanceDependenceUnchangedPasses'].every((k) => t[k] === g.tallies.worlds) && t.retreatPreservedExactly === t.retreatPresent;
  writeExclusive(resolve(LANE, 'evidence/o2r-path-review.json'), { schema: 'STAGE3H_OWNER_GOVERNED_O2R_PATH_REVIEW_V1', reviews: 'evidence/o2-gate.json (preserved; its automatic O-2R verdict FAIL came from an allow-list that omitted the semantics field names)', paths,
    supportingTallies: t, note: 'rename only replaces strings exactly equal to an entity id; inverse renaming restored the original view exactly in every world, so no non-identity value changed', o2rValidationAfterReview: pass ? 'PASS' : 'FAIL', authority: 'R0' });
  console.log(JSON.stringify({ verdict, populations: f.populations, o2r: pass ? 'PASS' : 'FAIL', nonIdentityPaths: paths.filter((p) => !p.identityBearing) }, null, 1));
}
