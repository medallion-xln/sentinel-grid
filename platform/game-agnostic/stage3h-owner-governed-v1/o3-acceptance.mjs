// Phase 3: explicit sparse-cell catastrophe-bound behaviour under O-3 (MIN_ACCEPTED_PER_CELL=2). Synthetic panels only.
// Writes evidence/o3-acceptance.json (wx). The catastrophe veto is not altered: this file only shows what it does.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreSyntheticTruth } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { selectSets } from '../stage3h-activation-readiness-v2/runner-design.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { PROVENANCE } from './connector.mjs';
import { analyseNativePanel } from './analysis-native.mjs';
import { ownerAdmission } from './campaign.mjs';
import { verifyOwnerLane, LANE } from './inherit.mjs';

function panel(sizes) {
  const rows = []; let i = 0;
  sizes.forEach((n, c) => { for (let k = 0; k < n; k++, i++) {
    const band = c % 2 ? 'H2' : 'H0', effect = 10 + (i % 7), menu = ['b', 'n', 'low', 'high'], selections = selectSets(band, ['b'], ['n']);
    const truth = [{ id: 'b', utility: band === 'H0' ? 100 - effect : 100 }, { id: 'n', utility: band === 'H0' ? 100 : 100 - effect }, { id: 'low', utility: 0 }, { id: 'high', utility: 100 }];
    rows.push({ provenance: PROVENANCE, id: 'u' + i, cell: 'c' + String(c).padStart(2, '0'), band, regime: k % 2 ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT', selections, menu, truth, ...scoreSyntheticTruth(selections, menu, truth), nuisance: Object.fromEntries(['D4', 'IDENTITY', 'ORDER'].map((x) => [x, { RB: 0, RN: 0 }])) });
  } });
  return rows;
}
const summarise = (r) => ({ numericCriteriaPass: r.numericCriteriaPass, catastrophe: Object.fromEntries(Object.entries(r.catastrophe).map(([k, e]) => [k, { introductions: e.introductions, introductionUpper: e.introductionUpper, pass: e.pass }])), primaries: Object.fromEntries(Object.entries(r.primaries).map(([k, e]) => [k, e.interpretation])) });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const full = Array.from({ length: 48 }, () => 52), sparse = full.map((n, c) => (c === 0 ? 2 : n));
  const fullReport = analyseNativePanel(panel(full), { resamples: 1000 }), sparseReport = analyseNativePanel(panel(sparse), { resamples: 1000 });
  const sparseRows = panel(sparse), sched = Object.fromEntries(full.map((n, c) => ['c' + String(c).padStart(2, '0'), { scheduled: 52, band: c % 2 ? 'H2' : 'H0' }]));
  const records = []; sparse.forEach((n, c) => { for (let k = 0; k < 52; k++) records.push({ id: c + ':' + k, cell: 'c' + String(c).padStart(2, '0'), band: c % 2 ? 'H2' : 'H0', rejected: k >= n, reason: k >= n ? 'VALIDATOR_INVALID' : undefined }); });
  const admission = ownerAdmission(records, sched, 'MIN_TWO_PER_CELL');
  const out = { schema: 'STAGE3H_OWNER_GOVERNED_O3_ACCEPTANCE_V1', inheritanceHead: inh.head, o3: 'MIN_ACCEPTED_PER_CELL=2',
    fullPanel: summarise(fullReport), sparsePanel: { ...summarise(sparseReport), sparseCell: 'c00 (H0) with 2 accepted of 52', admissionUnderO3: { pass: admission.pass, accepted: admission.accepted, effectiveN: admission.effectiveN, perBand: admission.perBand } },
    behaviour: !sparseReport.numericCriteriaPass && sparseReport.catastrophe.A_H0_SPECIALIST.pass === false && sparseReport.catastrophe.A_H0_SPECIALIST.introductions === 0 && fullReport.catastrophe.A_H0_SPECIALIST.pass === true
      ? 'CONFIRMED: with zero introductions, one sparse H0 cell lifts the zero-introduction bound above 0.02, so the catastrophe criterion fails and a positive qualification is impossible for that panel; with full cells the same data pass. The veto is unchanged and can only block.'
      : 'NOT_CONFIRMED', sparseIsSyntheticAndNotAnOutcome: true, sampleSizeUsed: 'resamples 1000 (synthetic demonstration only; the registered value is 20,000)', authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/o3-acceptance.json'), out);
  console.log(JSON.stringify({ behaviour: out.behaviour, full: out.fullPanel.catastrophe, sparse: out.sparsePanel.catastrophe, sparseAdmission: out.sparsePanel.admissionUnderO3.pass, fullPass: out.fullPanel.numericCriteriaPass, sparsePass: out.sparsePanel.numericCriteriaPass }, null, 1));
}
