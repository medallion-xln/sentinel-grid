// Phase 5 feasibility and connector validation. Development worlds and synthetic panels only; no prospective seed.
// Writes evidence/connector-validation.json and evidence/feasibility.json (wx). No outcome of any executed or sealed
// population is read: power uses the inherited V2 planning SDs; admission risk uses rejection metadata only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { scoreSyntheticTruth } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { zeroIntroductionUpper, SPEC } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { inverseNormal } from '../stage3h-ascii-competence-v1/metrics.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { nativeRow, PROVENANCE } from './connector.mjs';
import { analyseNativePanel } from './analysis-native.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
const contract = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json'), power = J('stage3h-activation-readiness-v2/power-review.json');

export function connectorValidation() {
  const dev = openCombos().map(({ panel, ...c }) => c), byBand = { H0: { n: 0, identityTruthChanged: 0, identityRetreatRemapped: 0 }, H2: { n: 0, identityTruthChanged: 0, identityRetreatRemapped: 0 } };
  const times = [], seen = new Set(); let rows = 0, rejected = 0;
  for (const c of dev) {
    const t = performance.now(), r = nativeRow({ population: 'DEV', cell: 'dev', ...c }, { seen }); times.push(performance.now() - t);
    if (r.rejected) { rejected++; continue; }
    rows++; byBand[c.horizonBand].n++; if (!r.row.identityTruthInvariant) byBand[c.horizonBand].identityTruthChanged++; if (r.row.identityRetreatRemapped) byBand[c.horizonBand].identityRetreatRemapped++;
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { population: 'STAGE3H1_CANONICAL_OPEN_NATIVE_V1 (development only, already evaluated)', worlds: dev.length, rows, rejected, d4AndOrderTruthInvariant: 'all (assertion passed for every admitted world)',
    identityTruthDependence: byBand, msPerWorldWithTwinsMean: mean, msPerWorldWithTwinsMax: Math.max(...times), outcomeSummariesComputed: false };
}

function syntheticPanel(cells, perCell) {
  const rows = []; let i = 0;
  for (let c = 0; c < cells; c++) for (let k = 0; k < perCell; k++, i++) {
    const band = c % 2 ? 'H2' : 'H0', effect = 1 + ((i * 7919) % 13), menu = ['b', 'n', 'low', 'high'], selections = selectSets(band, ['b'], ['n']);
    const truth = [{ id: 'b', utility: band === 'H0' ? 100 - effect : 100 }, { id: 'n', utility: band === 'H0' ? 100 : 100 - effect }, { id: 'low', utility: 0 }, { id: 'high', utility: 100 }];
    rows.push({ provenance: PROVENANCE, id: 'u' + i, cell: 'c' + c, band, regime: i % 3 ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT', selections, menu, truth, ...scoreSyntheticTruth(selections, menu, truth), nuisance: Object.fromEntries(['D4', 'IDENTITY', 'ORDER'].map((k) => [k, { RB: 0, RN: 0 }])) });
  }
  return rows;
}

function admissionRisk() {
  const rej = {}, sch = {};
  for (const pop of ['OOD_LEVEL', 'OOD_ROLES', 'OOD_OBJECTIVES', 'OOD_SHAPES', 'IN_DISTRIBUTION_CONTROL']) {
    const s = JSON.parse(readFileSync(resolve(GA, 'stage3h1f-development/results', pop, 'summary.json'), 'utf8')), rows = JSON.parse(readFileSync(resolve(GA, 'stage3h1f-development/results', pop, 'rows.json'), 'utf8'));
    const list = Array.isArray(rows) ? rows : rows.rows, key = (c) => [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/');
    for (const r of list) sch[pop + '|' + key(r.combo)] = (sch[pop + '|' + key(r.combo)] ?? 0) + 1;
    for (const r of s.rejections) { const k = pop + '|' + key(r.combo); rej[k] = (rej[k] ?? 0) + 1; sch[k] = (sch[k] ?? 0) + 1; }
  }
  const binomCdf = (k, n, p) => { let s = 0, c = 1; for (let i = 0; i <= k; i++) { s += c * p ** i * (1 - p) ** (n - i); c = c * (n - i) / (i + 1); } return s; };
  const v3pop = { OOD_LEVEL: 'OOD_LEVEL', OOD_ROLES: 'OOD_ROLES', OOD_OBJECTIVES: 'OOD_OBJECTIVES', OOD_SHAPES: 'OOD_SHAPES', IN_DISTRIBUTION_CONTROL: 'HOLDOUT_KNOWN_COMPOSITION' };
  const out = {};
  for (const [pop, v3] of Object.entries(v3pop)) {
    const n = contract.populations[v3].repetitionsPerCell, need = Math.ceil(0.5 * n), cells = Object.keys(sch).filter((k) => k.startsWith(pop + '|'));
    let pNoFail = 1, worst = null;
    for (const k of cells) {
      const r = rej[k] ?? 0, m = sch[k], p = (r + 0.5) / (m + 1); // Jeffreys posterior mean of the cell rejection rate
      const pFail = binomCdf(need - 1, n, 1 - p); pNoFail *= 1 - pFail;
      if (!worst || pFail > worst.pFail) worst = { cell: k.split('|')[1], observedRejected: r, observedScheduled: m, plugInRejectionRate: p, pFail };
    }
    const totalRej = cells.reduce((s, k) => s + (rej[k] ?? 0), 0), totalSch = cells.reduce((s, k) => s + sch[k], 0);
    out[v3] = { v3RepetitionsPerCell: n, cellAdmissionFloor: need, observedRejectionRate: totalRej / totalSch, expectedAccepted: Math.round(contract.populations[v3].scheduledPerReplication * (1 - totalRej / totalSch)), effectiveNFloor: contract.admissionRules.effectiveNFloor, probabilityAnyCellBelowFloorPerReplication: 1 - pNoFail, worstCell: worst };
  }
  return { source: 'rejection metadata of executed 3H.1-F panels (identity fields only); plug-in Jeffreys rate per cell', populations: out };
}

function powerTable() {
  const z = inverseNormal(1 - SPEC.alpha / SPEC.primaryFamily) + inverseNormal(0.9), out = {};
  for (const [pop, p] of Object.entries(contract.populations)) {
    const sd = pop === 'HOLDOUT_KNOWN_COMPOSITION' ? power.sdPlanning.known : power.sdPlanning.OOD, nFull = p.scheduledPerReplication, nBand = nFull / 2;
    out[pop] = { planningSd: sd, nPerBand: nBand, nFull, mde90_A_or_B_band: z * sd / Math.sqrt(nBand), mde90_C_or_D_full: z * sd / Math.sqrt(nFull), impliedLocalEffectForFullMateriality: 'C = A/2 and D = B/2: full-population point <= -0.02 requires a local effect <= -0.04' };
  }
  return { alphaOneSidedPerPrimary: SPEC.alpha / SPEC.primaryFamily, power: 0.9, planningSds: power.sdPlanning, planningSdSource: power.source, table: out,
    caveat: 'Planning SDs are pooled inherited unsealed planning values, not estimates of the band-local R-B or R-N SDs (V2 power review limits). No prior outcome effect size is used.' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const cv = connectorValidation();
  writeExclusive(resolve(LANE, 'evidence/connector-validation.json'), { schema: 'STAGE3H_OWNER_GOVERNED_CONNECTOR_VALIDATION_V1', inheritanceHead: inh.head, ...cv });
  const t = performance.now(), panel = syntheticPanel(48, 52), rep = analyseNativePanel(panel, { resamples: 1000 }), msPer1000 = performance.now() - t; void rep;
  const analysisMinutesPerPanel = msPer1000 * (SPEC.resamples / 1000) / 60000;
  const worlds = contract.proposedWorlds, nativeMinutes = worlds * cv.msPerWorldWithTwinsMean / 60000;
  const zeroUpper = Object.fromEntries(Object.entries(contract.populations).map(([k, p]) => [k, { H0band: zeroIntroductionUpper(Array.from({ length: p.cells / 2 }, () => p.repetitionsPerCell), 40), full: zeroIntroductionUpper(Array.from({ length: p.cells }, () => p.repetitionsPerCell), 40) }]));
  const out = { schema: 'STAGE3H_OWNER_GOVERNED_FEASIBILITY_V1', design: { proposedWorlds: worlds, perReplication: worlds / 2, independentUnits: 'every scheduled world is a distinct seeded unit; twins are not counted (verified: 9,119 executed and 288 development worlds all semantically distinct)' },
    runtime: { msPerWorldWithTwins: cv.msPerWorldWithTwinsMean, nativeMinutesTotal: nativeMinutes, nativeMinutesPerReplication: nativeMinutes / 2, analysisMinutesPerPanelAt20000: analysisMinutesPerPanel, analysisMinutesPerReplication: analysisMinutesPerPanel * 5, v3AnalysisCeilingMinutesPerReplication: contract.analysisResourceCeilingProposed.minutesPerReplication,
      analysisWithinCeiling: analysisMinutesPerPanel * 5 <= contract.analysisResourceCeilingProposed.minutesPerReplication, measuredOn: 'synthetic 48x52 panel at 1,000 resamples, linear extrapolation to 20,000' },
    power: powerTable(), admission: admissionRisk(), catastropheBound: { zeroIntroductionUpperAtFamily40: zeroUpper, required: contract.sourceContract.expectedCatIncreaseUpperMaxProposed, potentialIntroductionsAllowed: contract.sourceContract.potentialIntroductionsAllowedProposed },
    resolution: { tailQuantile: SPEC.alpha / SPEC.primaryFamily, drawsInTailAt20000: SPEC.resamples * SPEC.alpha / SPEC.primaryFamily, note: 'nearest-rank percentile; 25 draws define each adjusted primary bound' },
    inconclusiveRisks: ['full-population C/D materiality needs local effects <= -0.04', 'B_H2_AVOIDANCE has no planning effect size without reading prior outcomes', 'any single introduced catastrophe vetoes', 'every one of 40 primaries in 10 panels must pass', 'per-cell admission floor in sparse OOD cells'] };
  writeExclusive(resolve(LANE, 'evidence/feasibility.json'), out);
  console.log(JSON.stringify({ connector: { ...cv }, runtime: out.runtime, admission: Object.fromEntries(Object.entries(out.admission.populations).map(([k, v]) => [k, { rej: +v.observedRejectionRate.toFixed(4), pAnyCellFail: +v.probabilityAnyCellBelowFloorPerReplication.toFixed(4), worst: v.worstCell.cell + ' ' + v.worstCell.observedRejected + '/' + v.worstCell.observedScheduled }])), power: Object.fromEntries(Object.entries(out.power.table).map(([k, v]) => [k, [+v.mde90_A_or_B_band.toFixed(3), +v.mde90_C_or_D_full.toFixed(3)]])), zeroUpper }, null, 1));
}
