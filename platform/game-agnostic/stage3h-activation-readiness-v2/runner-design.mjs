// Synthetic orchestration and row-contract implementation only. No native environment adapter or campaign entry point.
import { createHash } from 'node:crypto';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const setKey = ids => JSON.stringify([...ids].sort());
const assert = (v, m) => { if (!v) throw Error(m); };

export function selectSets(band, B, nexus) {
  assert(['H0', 'H2'].includes(band), 'OUTSIDE_FROZEN_RULE_DOMAIN');
  const N = nexus ?? B;
  return { B: [...B], N: [...N], R: [...(band === 'H0' ? N : B)] };
}
function selection(ids, menu) { assert(ids.length && new Set(ids).size === ids.length && ids.every(id => menu.includes(id)), 'ILLEGAL_OR_DUPLICATE_SELECTION'); }
export function scoreSet(ids, truth) {
  const utilities = truth.map(b => b.utility);
  assert(utilities.length && utilities.every(Number.isFinite), 'INVALID_SYNTHETIC_TRUTH');
  const max = Math.max(...utilities), spread = max - Math.min(...utilities);
  const regrets = ids.map(id => { const b = truth.find(b => b.id === id); assert(b, 'UNLABELLED_ACTION'); return max - b.utility; });
  const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
  return { nreg: spread ? mean(regrets) / spread : 0, regret: mean(regrets), hit: mean(regrets.map(x => Number(x === 0))), cat: mean(regrets.map(x => Number(x >= 100))) };
}
export function potentialIntroduction(candidate, baseline, truth) {
  if (setKey(candidate) === setKey(baseline)) return false; // Shared identical policy output; exact equality control.
  const best = Math.max(...truth.map(b => b.utility));
  const regret = id => { const b = truth.find(b => b.id === id); assert(b, 'UNLABELLED_ACTION'); return best - b.utility; };
  return candidate.some(id => regret(id) >= 100) && baseline.some(id => regret(id) < 100);
}
export function syntheticRecord(fixture) {
  assert(fixture.synthetic === true && fixture.seed === undefined && fixture.world === undefined, 'SYNTHETIC_FIXTURE_ONLY_NO_WORLD_OR_SEED');
  const events = ['ADMISSION'];
  if (!fixture.admitted) return { rejected: true, id: fixture.id, cell: fixture.cell, band: fixture.band, reason: fixture.reason, events, replacementAllowed: false };
  assert(fixture.elapsedMs <= 1000, 'PUBLIC_ENVELOPE_TIMEOUT_INVALID');
  const envelopeHash = hash(fixture.publicEnvelope), menu = fixture.publicEnvelope.menu;
  assert(new Set(menu).size === menu.length, 'DUPLICATE_MENU_ACTION');
  events.push('PUBLIC_ENVELOPE_HASHED');
  const selections = selectSets(fixture.band, fixture.B, fixture.nexus);
  Object.values(selections).forEach(ids => selection(ids, menu));
  const decisionsHash = hash(selections);
  events.push('ALL_DECISIONS_LOCKED');
  // The harness releases handcrafted utilities only after the lock, like a future evaluator boundary.
  const truth = fixture.releaseSyntheticTruth({ decisionsHash, events: [...events] });
  assert(setKey(truth.map(b => b.id)) === setKey(menu), 'TRUTH_MENU_MISMATCH');
  events.push('SYNTHETIC_TRUTH_RELEASED');
  const metrics = Object.fromEntries(Object.entries(selections).map(([k, ids]) => [k, scoreSet(ids, truth)]));
  assert(hash(fixture.publicEnvelope) === envelopeHash, 'PUBLIC_INPUT_MUTATED');
  return { id: fixture.id, cell: fixture.cell, band: fixture.band, regime: fixture.regime, selections, metrics,
    publicEnvelopeHashByArm: { R: envelopeHash, B: envelopeHash, N: envelopeHash }, decisionsHash,
    computeAccounting: { S0Calls: 1, NexusCalls: 1, sharedCache: true, budgetMs: 1000, simulatorCallsByPublicArms: 0 },
    introductionB: potentialIntroduction(selections.R, selections.B, truth), introductionN: potentialIntroduction(selections.R, selections.N, truth), events };
}
export function admissionReport(rows, scheduledCells) {
  const ids = rows.map(r => r.id); assert(new Set(ids).size === ids.length, 'DUPLICATE_INDEPENDENT_UNIT');
  assert(rows.every(r => Object.hasOwn(scheduledCells, r.cell)), 'UNSCHEDULED_CELL');
  const cells = Object.fromEntries(Object.keys(scheduledCells).map(c => [c, { scheduled: scheduledCells[c], accepted: rows.filter(r => r.cell === c && !r.rejected).length, rejected: rows.filter(r => r.cell === c && r.rejected).length }]));
  assert(Object.values(cells).every(c => c.accepted + c.rejected === c.scheduled), 'MISSING_OR_EXTRA_SCHEDULED_UNIT');
  const n = Object.values(cells).reduce((s, c) => s + c.accepted, 0), scheduled = rows.length;
  const effectiveN = Object.values(cells).every(c => c.accepted) ? 1 / Object.values(cells).reduce((s, c) => s + 1 / (Object.keys(cells).length ** 2 * c.accepted), 0) : 0;
  return { cells, accepted: n, scheduled, rejected: scheduled - n, effectiveN, populationAdmissionPass: n / scheduled >= 0.9 && Object.values(cells).every(c => c.accepted >= Math.ceil(0.5 * c.scheduled)) && effectiveN >= 2100, replacementAllowed: false };
}
export function auditSyntheticNuisance(original, transformed, actionMap) {
  assert(original.id === transformed.id && original.band === transformed.band, 'NUISANCE_UNIT_OR_HORIZON_CHANGED');
  assert(Object.values(actionMap).length === new Set(Object.values(actionMap)).size, 'NUISANCE_NOT_BIJECTIVE');
  for (const arm of ['R', 'B', 'N']) assert(setKey(original.selections[arm].map(id => actionMap[id])) === setKey(transformed.selections[arm]), 'NUISANCE_SELECTION_NOT_MAPPED');
  return { originalUnitId: original.id, countsAsIndependentWorld: false, dependenceRB: Math.abs((original.metrics.R.nreg - original.metrics.B.nreg) - (transformed.metrics.R.nreg - transformed.metrics.B.nreg)), dependenceRN: Math.abs((original.metrics.R.nreg - original.metrics.N.nreg) - (transformed.metrics.R.nreg - transformed.metrics.N.nreg)) };
}
export function assertIndependentCustody(custody) {
  assert(custody.evaluatorIdentity && custody.custodianIdentity && custody.reviewerIdentity && custody.designerIdentity, 'CUSTODY_IDENTITIES_REQUIRED');
  assert(custody.evaluatorIdentity !== custody.designerIdentity && custody.reviewerIdentity !== custody.designerIdentity && custody.custodianIdentity !== custody.designerIdentity, 'INDEPENDENCE_NOT_ESTABLISHED');
  assert(custody.conflictDeclarationsSigned === true && custody.ALocked === true && custody.BLocked === true, 'BOTH_REPLICATIONS_MUST_BE_LOCKED');
  assert(custody.designerReadBeforeLock === false, 'PREMATURE_DESIGNER_UNSEALING');
  return true;
}
export function campaignEntryPoint() { throw Error('NO_NATIVE_RUNNER_OR_ACTIVE_REGISTRATION_NO_ALLOCATION_OR_EXECUTION_AUTHORIZED'); }
