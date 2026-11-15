// Successor preparation, Phase 4 (development-only; no world generated, no outcome read). Statistical validity of
// STAGE3H_NATIVE_MENU_VALIDITY_V1 from the 9,456 spent-world records (evidence/successor-v4/menu-scan-records.json):
// invalid-menu frequency with exact Clopper-Pearson uncertainty by registered population, horizon and cell; whether
// exclusions concentrate in OOD; expected exclusions per registered replication; and admission / catastrophe-bound
// feasibility re-simulated with the predecessor's own procedure (o3-catastrophe.mjs, reproduced exactly first) after
// adding menu rejections, plus a deliberately pessimistic stress variant. Every threshold is read, none is changed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { zeroIntroductionUpper } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { feasibility as predecessorFeasibility } from './o3-catastrophe.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const contract = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json'), pred = J('stage3h-owner-governed-v1/registration/ACTIVE_REGISTRATION_V3.json');
const scan = J('stage3h-owner-governed-v1/evidence/successor-v4/menu-scan-records.json'), records = scan.records;

// Exact binomial tools.
function cdf(k, n, p) { if (k < 0) return 0; if (k >= n) return 1; if (p <= 0) return 1; if (p >= 1) return 0; let t = Math.exp(n * Math.log1p(-p)), s = t; for (let i = 0; i < k; i++) { t *= ((n - i) / (i + 1)) * (p / (1 - p)); s += t; } return Math.min(1, s); }
const solve = (f, target) => { let lo = 0, hi = 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > target) lo = m; else hi = m; } return (lo + hi) / 2; };
export function clopperPearson(k, n, conf = 0.95) { const a = 1 - conf; return { lower: k === 0 ? 0 : solve((p) => 1 - cdf(k - 1, n, p), 1 - a / 2) , upper: k === n ? 1 : solve((p) => cdf(k, n, p), a / 2) }; }
const upperOneSided = (k, n, conf = 0.95) => (k === n ? 1 : solve((p) => cdf(k, n, p), 1 - conf));
const lf = [0]; for (let i = 1; i <= 20000; i++) lf[i] = lf[i - 1] + Math.log(i);
function fisherTwoSided(a, b, c, d) { const r1 = a + b, c1 = a + c, n = a + b + c + d, p = (x) => Math.exp(lf[r1] - lf[x] - lf[r1 - x] + lf[n - r1] - lf[c1 - x] - lf[n - r1 - c1 + x] - lf[n] + lf[c1] + lf[n - c1]); const lo = Math.max(0, c1 - (n - r1)), hi = Math.min(r1, c1), obs = p(a); let s = 0; for (let x = lo; x <= hi; x++) { const q = p(x); if (q <= obs * (1 + 1e-9)) s += q; } return Math.min(1, s); }
const est = (k, n) => ({ n, invalid: k, rate: n ? k / n : null, cp95: n ? clopperPearson(k, n) : null, upper95OneSided: n ? upperOneSided(k, n) : null });

// Frequencies (denominator: spent worlds that reach the rule, i.e. pass the V3 pre-policy gates).
const reached = records.filter((r) => !r.preRejection), inv = (rs) => rs.filter((r) => r.verdict !== 'VALID').length;
const pops = Object.keys(contract.populations);
const byPopulation = Object.fromEntries(pops.map((p) => { const rs = reached.filter((r) => r.trackAPopulation === p); return [p, { ...est(inv(rs), rs.length), byBand: Object.fromEntries(['H0', 'H2'].map((b) => { const x = rs.filter((r) => r.band === b); return [b, est(inv(x), x.length)]; })) }]; }));
const cells = {};
for (const r of reached) { const k = r.trackAPopulation + '|' + r.cell; (cells[k] ??= { n: 0, k: 0 }); cells[k].n++; if (r.verdict !== 'VALID') cells[k].k++; }
const cellEst = Object.entries(cells).map(([key, c]) => ({ key, ...est(c.k, c.n) }));
const byCell = { cellsObserved: cellEst.length, cellsWithInvalid: cellEst.filter((c) => c.invalid > 0), maxCp95UpperOverZeroCells: Math.max(...cellEst.filter((c) => c.invalid === 0).map((c) => c.cp95.upper)), minWorldsPerCell: Math.min(...cellEst.map((c) => c.n)) };
const ood = reached.filter((r) => r.trackAPopulation !== 'HOLDOUT_KNOWN_COMPOSITION'), known = reached.filter((r) => r.trackAPopulation === 'HOLDOUT_KNOWN_COMPOSITION');
const concentration = { ood: est(inv(ood), ood.length), knownComposition: est(inv(known), known.length), fisherExactTwoSidedP: fisherTwoSided(inv(ood), ood.length - inv(ood), inv(known), known.length - inv(known)),
  structural: { bypassOfferedWorldsByPopulation: Object.fromEntries(pops.map((p) => [p, reached.filter((r) => r.trackAPopulation === p && r.latent.bypassOffered > 0).length])),
    rolesWithSubstitutesByPopulation: J('stage3h-owner-governed-v1/evidence/successor-v4/defect-reproduction.json').bypassCapableRolesByRegisteredPopulation,
    latentDuplicatedRelationWorldsByPopulation: Object.fromEntries(pops.map((p) => [p, reached.filter((r) => r.trackAPopulation === p && r.latent.dependsOnDuplicated.length).length])) },
  reading: 'The single invalid world is OOD (OOD_ROLES); the OOD vs known-composition difference is not statistically detectable (one event), but it is structural: a duplicated action id requires a duplicated dependency relation AND a BYPASS on it, and BYPASS needs a substitute, which only the OOD_ROLES roles (redundant, scarce, populated, industrial) create. In the four other registered populations the defect cannot occur; latent duplicated relations exist there too but never surface as a menu entry.' };
const expectedPerReplication = Object.fromEntries(pops.map((p) => { const s = contract.populations[p].scheduledPerReplication, e = byPopulation[p]; return [p, { scheduled: s, expectedInvalid: e.rate * s, upper95Invalid: e.upper95OneSided * s }]; }));

// Admission and catastrophe-bound feasibility: predecessor procedure reproduced, then menu rejections added.
const key = (c) => [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/');
function baseCounts(pop) {
  const src = { HOLDOUT_KNOWN_COMPOSITION: 'IN_DISTRIBUTION_CONTROL' }[pop] ?? pop, s = J(`stage3h1f-development/results/${src}/summary.json`), r = J(`stage3h1f-development/results/${src}/rows.json`), rows = Array.isArray(r) ? r : r.rows, sch = {}, rej = {};
  for (const x of rows) sch[key(x.combo)] = (sch[key(x.combo)] ?? 0) + 1;
  for (const x of s.rejections) { const k = key(x.combo); rej[k] = (rej[k] ?? 0) + 1; sch[k] = (sch[k] ?? 0) + 1; }
  return { src, sch, rej };
}
function simulate(rateFor, sims = 2000) {
  let st = 0x0c47; const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const out = {};
  for (const pop of pops) {
    const p = contract.populations[pop], a = p.axes, cl = [];
    for (const sh of a.shapes) for (const ro of a.roles) for (const ob of a.objectives) for (const hb of a.horizonBands) for (const lv of a.levels) cl.push({ k: [sh, ro, ob, hb, lv].join('/'), band: hb });
    const res = { MIN_TWO_PER_CELL: { admit: 0, admitAndBoundAttainable: 0 }, KEEP_V3_HALF_PER_CELL: { admit: 0, admitAndBoundAttainable: 0 } };
    for (let s = 0; s < sims; s++) {
      const acc = cl.map((c) => { const q = rateFor(pop, c.k); let n = 0; for (let i = 0; i < p.repetitionsPerCell; i++) if (rnd() >= q) n++; return { band: c.band, n }; });
      const tot = acc.reduce((x, c) => x + c.n, 0), bandOk = ['H0', 'H2'].every((b) => { const cs = acc.filter((c) => c.band === b); return cs.reduce((x, c) => x + c.n, 0) / (cs.length * p.repetitionsPerCell) >= 0.9; });
      const kish = acc.every((c) => c.n > 0) ? 1 / acc.reduce((x, c) => x + 1 / (cl.length ** 2 * c.n), 0) : 0;
      const attainable = acc.every((c) => c.n > 0) && [acc.filter((c) => c.band === 'H0'), acc.filter((c) => c.band === 'H2'), acc].every((cs) => zeroIntroductionUpper(cs.map((c) => c.n), 40) <= 0.02);
      for (const [opt, floor] of [['MIN_TWO_PER_CELL', 2], ['KEEP_V3_HALF_PER_CELL', Math.ceil(p.repetitionsPerCell / 2)]]) {
        const admit = tot / (cl.length * p.repetitionsPerCell) >= 0.9 && bandOk && kish >= 2100 && acc.every((c) => c.n >= floor);
        res[opt].admit += admit; res[opt].admitAndBoundAttainable += admit && attainable;
      }
    }
    const minPerCell = (C) => Math.ceil(Math.log(0.05 / 40) / Math.log(0.98) / C);
    out[pop] = { repetitionsPerCell: p.repetitionsPerCell, minAcceptedPerCellForBoundBand: minPerCell(cl.length / 2), minAcceptedPerCellForBoundFull: minPerCell(cl.length),
      ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { P_admit: v.admit / sims, P_admitAndBoundAttainable: v.admitAndBoundAttainable / sims }])) };
  }
  return out;
}
const base = Object.fromEntries(pops.map((p) => [p, baseCounts(p)]));
const jeffreys = (pop, k, extra = 0) => { const b = base[pop]; return b.sch[k] === undefined ? 0.5 / 13 : ((b.rej[k] ?? 0) + extra + 0.5) / (b.sch[k] + 1); };
const menuInvalidIn3H1F = (pop, k) => records.filter((r) => r.source === 'stage3h1f-development/' + base[pop].src && r.cell === k && r.verdict !== 'VALID').length;
const reproduced = simulate((pop, k) => jeffreys(pop, k));
const predecessorReproduced = isDeepStrictEqual(reproduced, predecessorFeasibility().populations);
const withMenu = simulate((pop, k) => jeffreys(pop, k, menuInvalidIn3H1F(pop, k)));
const worstCell = byCell.cellsWithInvalid.reduce((m, c) => Math.max(m, c.cp95.upper), 0);
const atRisk = (pop, k) => pop === 'OOD_ROLES' && /\/(redundant|scarce|populated|industrial)\/restore/.test('/' + k);
const stress = simulate((pop, k) => Math.min(1, jeffreys(pop, k, menuInvalidIn3H1F(pop, k)) + (atRisk(pop, k) ? worstCell : 0)));

// Thresholds and inference machinery: read and verified unchanged, never modified.
const unchanged = ['stage3h-final-review-handoff/amendments/v3/contract-v3.json', 'stage3h-final-review-handoff/amendments/v3/analysis.mjs', 'stage3h-final-review-handoff/amendments/v3/runner.mjs', 'stage3h-activation-readiness-v2/analysis.mjs', 'stage3h-owner-governed-v1/analysis-native.mjs', 'stage3h-owner-governed-v1/campaign.mjs']
  .map((f) => ({ file: f, predecessorBound: pred.bindings.sources[f] ?? null, current: fsha(f) })).map((x) => ({ ...x, unchanged: x.predecessorBound === x.current }));
const thresholds = { O3: pred.amendments.O3.choice, minAcceptedPerCell: 2, populationFloor: 0.9, perHorizonFloor: 0.9, effectiveNFloor: 2100, resamples: contract.resamples, alphaPerPrimary: contract.alphaPerPrimary, pointMateriality: contract.pointMateriality, primaryQuantile: contract.primaryQuantile, catastropheBound: 'zeroIntroductionUpper(cells, 40) <= 0.02 (unchanged)', replacementAllowed: false };

assertSoleWriter(); const inh = verifyOwnerLane();
const out = {
  schema: 'STAGE3H_SUCCESSOR_STATISTICAL_VALIDITY_V1', rule: 'STAGE3H_NATIVE_MENU_VALIDITY_V1', inheritanceHead: inh.head, scanRecordsSha256: scan.recordsSha256,
  denominators: { spentWorlds: records.length, reachedRule: reached.length, preRejectedByV3Gates: records.length - reached.length },
  frequency: { overall: est(inv(reached), reached.length), byPopulation, byCell, concentration },
  expectedPerReplication,
  admissionFeasibility: { method: 'o3-catastrophe.mjs procedure (2000 sims, LCG 0x0c47, Jeffreys plug-in per cell from 3H.1-F), reimplemented with an injectable rate', predecessorReproducedExactly: predecessorReproduced,
    predecessor: reproduced, withMenuRejections: withMenu, stress: { description: 'every OOD_ROLES substitute-role restore cell (48 cells) gets an extra rejection probability equal to the 95% Clopper-Pearson upper bound of the worst observed cell', extraRate: worstCell, populations: stress } },
  thresholds, inferenceMachineryUnchanged: unchanged.every((x) => x.unchanged), inferenceMachinery: unchanged,
  conditionalInference: 'All registered estimands, bootstrap intervals, multiplicity corrections, materiality tests and the catastrophe / false-selection vetoes are computed on accepted worlds only, i.e. they are conditional on the valid-menu population (and, as before, on the V3 validator, terminal, task and prior-world gates). Rejected worlds are counted in admission and never replaced; cell weights stay fixed, so a rejected world reduces its own cell only.',
  generalizationLimitation: 'Claims do not extend to worlds whose native menu presents one action twice. Under the frozen Forge World V2 generator this subpopulation exists only where a restore objective re-adds an existing dependency edge AND that edge carries an offered BYPASS (substitute-bearing roles, i.e. OOD_ROLES): observed 1/1,824 spent OOD_ROLES worlds (95% CP upper ' + byPopulation.OOD_ROLES.cp95.upper.toFixed(4) + '), 0 elsewhere. Separately, 222/9,456 spent worlds (2.35%) present a duplicated dependency relationship in the observation without any menu effect; that is native generator behaviour present in every earlier stage, is not a menu defect, and is neither rejected nor repaired.',
  verdict: null, authority: 'R0',
};
const pass = (o) => Object.values(o).every((p) => p.MIN_TWO_PER_CELL.P_admit >= 0.99 && p.MIN_TWO_PER_CELL.P_admitAndBoundAttainable >= 0.99);
out.verdict = predecessorReproduced && out.inferenceMachineryUnchanged && pass(withMenu) ? (pass(stress) ? 'STATISTICALLY_VALID_CONDITIONAL_ON_VALID_MENU_POPULATION' : 'VALID_AT_OBSERVED_RATES_STRESS_SENSITIVE') : 'STATISTICAL_VALIDITY_NOT_ESTABLISHED';
writeExclusive(resolve(LANE, 'evidence/successor-v4/statistical-validity.json'), out);
console.log(JSON.stringify({ verdict: out.verdict, predecessorReproduced, overall: out.frequency.overall, byPopulation: Object.fromEntries(Object.entries(byPopulation).map(([k, v]) => [k, v.invalid + '/' + v.n + ' up95=' + v.upper95OneSided.toFixed(5)])), cellsWithInvalid: byCell.cellsWithInvalid, fisherP: concentration.fisherExactTwoSidedP, expectedPerReplication, withMenu: Object.fromEntries(Object.entries(withMenu).map(([k, v]) => [k, v.MIN_TWO_PER_CELL])), stress: Object.fromEntries(Object.entries(stress).map(([k, v]) => [k, v.MIN_TWO_PER_CELL])), worstCell, unchanged: out.inferenceMachineryUnchanged }, null, 1));
