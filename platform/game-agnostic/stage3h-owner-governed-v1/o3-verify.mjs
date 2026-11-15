// Phase 2: verification of O-3 = MIN_ACCEPTED_PER_CELL=2 (owner choice). Synthetic panels and 3H.1-F rejection
// metadata only (identity fields; no outcome). Writes evidence/o3-verification.json (wx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { estimate, bootstrap, zeroIntroductionUpper, groupCells } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { subgroupSupport } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { scoreSyntheticTruth } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { ownerAdmission } from './campaign.mjs';
import { PROVENANCE } from './connector.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8')), contract = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json');
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function plugInRates(pop) {
  const map = { HOLDOUT_KNOWN_COMPOSITION: 'IN_DISTRIBUTION_CONTROL' }, src = map[pop] ?? pop, key = (c) => [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/');
  const s = J(`stage3h1f-development/results/${src}/summary.json`), r = J(`stage3h1f-development/results/${src}/rows.json`), rows = Array.isArray(r) ? r : r.rows, sch = {}, rej = {};
  for (const x of rows) sch[key(x.combo)] = (sch[key(x.combo)] ?? 0) + 1;
  for (const x of s.rejections) { const k = key(x.combo); rej[k] = (rej[k] ?? 0) + 1; sch[k] = (sch[k] ?? 0) + 1; }
  return Object.fromEntries(Object.keys(sch).map((k) => [k, ((rej[k] ?? 0) + 0.5) / (sch[k] + 1)]));
}
/** Monte Carlo of admission under plug-in cell rejection rates; rejections are policy-independent (pre-policy). */
function admissionMonteCarlo(pop, sims = 400) {
  const p = contract.populations[pop], rates = plugInRates(pop), r = lcg(0x0b3c0001), cells = [];
  const a = p.axes; for (const shape of a.shapes) for (const roles of a.roles) for (const objectives of a.objectives) for (const horizonBand of a.horizonBands) for (const level of a.levels) cells.push({ key: [shape, roles, objectives, horizonBand, level].join('/'), band: horizonBand });
  const missing = cells.filter((c) => rates[c.key] === undefined).length;
  let pass = 0, overall = 0, bands = 0, kish = 0, noEmpty = 0, minAccepted = Infinity, minKish = Infinity;
  for (let s = 0; s < sims; s++) {
    const rows = [], sched = {};
    for (const c of cells) { sched[c.key] = { scheduled: p.repetitionsPerCell, band: c.band }; const q = rates[c.key] ?? 0.5 / 13; for (let k = 0; k < p.repetitionsPerCell; k++) { const rej = r() < q; rows.push({ id: c.key + ':' + k, cell: c.key, band: c.band, rejected: rej, reason: rej ? 'VALIDATOR_INVALID' : undefined }); } }
    const adm = ownerAdmission(rows, sched, 'MIN_TWO_PER_CELL'), cs = Object.values(adm.cells);
    pass += adm.pass; overall += adm.accepted / rows.length >= 0.9; bands += Object.values(adm.perBand).every((b) => b.pass); kish += adm.effectiveN >= 2100; noEmpty += cs.every((c) => c.accepted >= 2);
    minAccepted = Math.min(minAccepted, ...cs.map((c) => c.accepted)); minKish = Math.min(minKish, adm.effectiveN);
  }
  return { cells: cells.length, repetitionsPerCell: p.repetitionsPerCell, cellsWithoutPriorMetadata: missing, sims, P_pass: pass / sims, P_overall90: overall / sims, P_eachBand90: bands / sims, P_kish2100: kish / sims, P_everyCellAtLeast2: noEmpty / sims, minAcceptedObserved: minAccepted, minKishObserved: minKish };
}
function syntheticPanel(sizes) {
  const rows = []; let i = 0;
  sizes.forEach((n, c) => { for (let k = 0; k < n; k++, i++) { const band = c % 2 ? 'H2' : 'H0', effect = 1 + ((i * 7919) % 13), menu = ['b', 'n', 'low', 'high'], selections = selectSets(band, ['b'], ['n']);
    const truth = [{ id: 'b', utility: band === 'H0' ? 100 - effect : 100 }, { id: 'n', utility: band === 'H0' ? 100 : 100 - effect }, { id: 'low', utility: 0 }, { id: 'high', utility: 100 }];
    rows.push({ provenance: PROVENANCE, id: 'u' + i, cell: 'c' + String(c).padStart(3, '0'), band, regime: k % 3 ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT', selections, menu, truth, ...scoreSyntheticTruth(selections, menu, truth) }); } });
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const candidate = J('stage3h-owner-governed-v1/registration/REGISTRATION_CANDIDATE.json'), campaignSrc = readFileSync(resolve(LANE, 'campaign.mjs'), 'utf8'), connectorSrc = readFileSync(resolve(LANE, 'connector.mjs'), 'utf8');
  // Exact original (equal target-cell) weights with unequal accepted counts, including 2-row cells.
  const sizes = Array.from({ length: 48 }, (_, c) => (c % 12 === 0 ? 2 : 52)), rows = syntheticPanel(sizes), cells = groupCells(rows);
  const manual = cells.reduce((s, c) => s + c.reduce((t, r) => t + (r.metrics.R.nreg - r.metrics.B.nreg), 0) / c.length, 0) / cells.length;
  const est = estimate(cells, { key: 'C', metric: 'RB' });
  const boot = bootstrap(cells, [{ key: 'C', metric: 'RB' }, { key: 'A', metric: 'RB', band: 'H0' }], { resamples: 1000, family: 40 });
  const sparse = subgroupSupport(cells, { band: 'H0', regime: 'NO_OBSERVED_THREAT' }), oneRow = syntheticPanel([1, 52, 52, 52]);
  const oneRowAdm = ownerAdmission(oneRow.map((r) => ({ id: r.id, cell: r.cell, band: r.band, rejected: false })), Object.fromEntries(groupCells(oneRow).map((c) => [c[0].cell, { scheduled: c.length, band: c[0].band }])), 'MIN_TWO_PER_CELL');
  const zeroIntro = Object.fromEntries(Object.keys(contract.populations).map((pop) => { const p = contract.populations[pop], worst = Array.from({ length: p.cells / 2 }, (_, i) => (i < 6 ? 2 : p.repetitionsPerCell)); return [pop, { allFull: zeroIntroductionUpper(Array.from({ length: p.cells / 2 }, () => p.repetitionsPerCell), 40), sixCellsAtTwo: zeroIntroductionUpper(worst, 40), limit: contract.sourceContract.expectedCatIncreaseUpperMaxProposed }]; }));
  const mc = Object.fromEntries(Object.keys(contract.populations).map((pop) => [pop, admissionMonteCarlo(pop)]));
  const out = {
    schema: 'STAGE3H_OWNER_GOVERNED_O3_VERIFICATION_V1', inheritanceHead: inh.head, ownerChoice: 'MIN_ACCEPTED_PER_CELL=2', candidateOption: 'MIN_TWO_PER_CELL',
    supportedByBoundProtocol: { optionListedInCandidate: candidate.amendments.O3.options.includes('MIN_TWO_PER_CELL'), implementedInBoundCampaign: /cs\.every\(\(c\) => c\.accepted >= 2\)/.test(campaignSrc) && /cellFloor: 2/.test(campaignSrc), campaignSha256: createHash('sha256').update(campaignSrc).digest('hex'), campaignShaBound: candidate.bindings.sources['stage3h-owner-governed-v1/campaign.mjs'] === createHash('sha256').update(campaignSrc).digest('hex') },
    retainedFloors: { overall: 0.9, perHorizon: 0.9, kishEffectiveN: contract.admissionRules.effectiveNFloor, replacement: contract.admissionRules.replacement, outcomeFiltering: contract.admissionRules.outcomeFiltering },
    admissionMonteCarlo: mc,
    exactOriginalCellWeights: { manualEqualCellMean: manual, estimatorMean: est.mean, identical: Math.abs(manual - est.mean) < 1e-12, rule: 'w = 1/(C * n_c): every target cell carries weight 1/C regardless of its accepted count' },
    pairedBootstrapWithTwoRowCells: { inference: boot.C.inference, finite: [boot.C.lower, boot.C.upper, boot.A.lower, boot.A.upper].every(Number.isFinite), resampling: 'within each original cell, with replacement, common draws across estimands' },
    lowCountHandling: { regimeSubgroupSupport: sparse, cellWithOneAcceptedFailsAdmission: oneRowAdm.pass === false, sparseRule: 'subgroups need >= 50 rows and >= 2 rows in every contributing cell, else UNAVAILABLE_SPARSE_SUBGROUP' },
    safetyBounds: { zeroIntroductionUpperAtFamily40: zeroIntro, allWithinLimit: Object.values(zeroIntro).every((z) => z.sixCellsAtTwo <= z.limit), harmAndCatastropheIntervals: 'unchanged V3 bootstrap rules' },
    noOutcomeBasedExclusion: { admissionRecordFields: ['id', 'cell', 'band', 'rejected', 'reason'], rejectionPrecedesPolicyAndTruth: /if \(!validation\.valid \|\| isTerminal\(world\) \|\| !warm\.taskPreserved\) return \{ rejected/.test(connectorSrc), recordsCarryNoMetrics: !/records\.push\(\{[^}]*metrics/.test(campaignSrc) },
    authority: 'R0',
  };
  out.verdict = out.supportedByBoundProtocol.optionListedInCandidate && out.supportedByBoundProtocol.implementedInBoundCampaign && out.supportedByBoundProtocol.campaignShaBound && out.exactOriginalCellWeights.identical && out.pairedBootstrapWithTwoRowCells.finite && out.lowCountHandling.cellWithOneAcceptedFailsAdmission && out.safetyBounds.allWithinLimit && out.noOutcomeBasedExclusion.rejectionPrecedesPolicyAndTruth && out.noOutcomeBasedExclusion.recordsCarryNoMetrics ? 'O3_VERIFIED' : 'O3_NOT_VERIFIED';
  writeExclusive(resolve(LANE, 'evidence/o3-verification.json'), out);
  console.log(JSON.stringify({ verdict: out.verdict, supported: out.supportedByBoundProtocol, mc: Object.fromEntries(Object.entries(mc).map(([k, v]) => [k, { P_pass: v.P_pass, P_overall90: v.P_overall90, P_eachBand90: v.P_eachBand90, P_kish2100: v.P_kish2100, P_min2: v.P_everyCellAtLeast2, minKish: Math.round(v.minKishObserved) }])), weights: out.exactOriginalCellWeights.identical, boot: out.pairedBootstrapWithTwoRowCells, low: out.lowCountHandling.cellWithOneAcceptedFailsAdmission, safety: out.safetyBounds.allWithinLimit, noOutcome: out.noOutcomeBasedExclusion }, null, 1));
}
