// Versioned native analysis for STAGE3H_OWNER_GOVERNED_QUALIFICATION_V1 (amendment O-1).
// V3 analyseSyntheticPanel accepts only rows flagged synthetic (SYNTHETIC_ROWS_ONLY), so it cannot analyse native rows.
// This file is a verbatim copy of the V3 panel analysis body with exactly two changes:
//   (1) validateNativeRows requires native provenance instead of the synthetic flag (all numeric checks unchanged);
//   (2) the returned decision label is OWNER_GOVERNED_NATIVE_NUMERIC instead of SYNTHETIC_ONLY_NO_QUALIFICATION.
// Every estimator, family size, resample count, materiality, tail, equivalence and veto rule is imported unchanged from
// V2/V3. tests.mjs proves numeric identity with V3 on V3-style rows.
import { SPEC, bootstrap, groupCells, primarySpecs, superiority, equalityCheck, zeroIntroductionUpper } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { REGIMES, POPULATIONS, interpretRegime, interpretPrimary, subgroupSupport, descriptiveBundle } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { PROVENANCE } from './connector.mjs';
export const ANALYSIS_ID = 'STAGE3H_OWNER_GOVERNED_NATIVE_ANALYSIS_O1_V1';
const ok = (x, m) => { if (!x) throw Error(m); };
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
function inferred(cells, specs, family, options) { return bootstrap(cells, specs, { ...options, family }); }
function scalarInference(cells, values, specs, family, options) {
  const mapped = cells.map((c) => c.map((r) => ({ ...r, metrics: { R: { nreg: values(r) }, B: { nreg: 0 }, N: { nreg: 0 } } })));
  return inferred(mapped, specs.map((s) => ({ ...s, metric: 'RB' })), family, options);
}
export function validateNativeRows(rows) {
  ok(rows.length > 0 && new Set(rows.map((r) => r.id)).size === rows.length, 'EMPTY_OR_DUPLICATE_UNITS');
  for (const r of rows) {
    ok(r.provenance === PROVENANCE && r.synthetic === undefined && !('seed' in r) && !('world' in r), 'NATIVE_OWNER_GOVERNED_ROWS_ONLY');
    ok(['H0', 'H2'].includes(r.band) && REGIMES.includes(r.regime), 'UNDECLARED_STRATUM');
    for (const arm of ['R', 'B', 'N']) {
      const m = r.metrics[arm], ids = r.selections[arm];
      ok(m && ['nreg', 'hit', 'cat', 'regret'].every((k) => finite(m[k])), 'NONFINITE_METRIC');
      ok(['nreg', 'hit', 'cat'].every((k) => m[k] >= 0 && m[k] <= 1) && m.regret >= 0, 'OUT_OF_RANGE_METRIC');
      ok(ids?.length > 0 && new Set(ids).size === ids.length, 'MISSING_OR_DUPLICATE_SELECTION');
    }
  }
}
/** Body identical to V3 analyseSyntheticPanel except validateNativeRows and the decision label. */
export function analyseNativePanel(rows, options = {}, { validate = validateNativeRows } = {}) {
  validate(rows);
  const cells = groupCells(rows);
  ok(cells.every((c) => c.every((r) => r.band === c[0].band)), 'CELL_CROSSES_HORIZONS');
  const equalities = { H0: equalityCheck(rows, 'H0', 'R', 'N'), H2: equalityCheck(rows, 'H2', 'R', 'B') };
  ok(Object.values(equalities).every((e) => e.status === 'EXACT_IDENTITY_PASS'), 'MISSING_OR_INVALID_EXACT_CONTROL');
  const primaries = inferred(cells, primarySpecs(), 40, options), accuracy = {}, catastrophe = {};
  for (const e of Object.values(primaries)) e.interpretation = interpretPrimary(e);
  for (const spec of primarySpecs()) {
    const hit = inferred(cells, [{ ...spec, metric: spec.metric === 'RB' ? 'HIT_RB' : 'HIT_RN' }], 40, options)[spec.key];
    accuracy[spec.key] = { ...hit, pass: hit.inference === 'PERCENTILE_DESIGN_ONLY' && hit.ci95[1] >= 0 && hit.lower >= -0.02 };
    const cat = inferred(cells, [{ ...spec, metric: spec.metric === 'RB' ? 'CAT_RB' : 'CAT_RN' }], 40, options)[spec.key];
    const selected = cells.filter((c) => !spec.band || c[0].band === spec.band);
    const key = spec.metric === 'RB' ? 'introductionB' : 'introductionN';
    ok(selected.flat().every((r) => typeof r[key] === 'boolean'), 'INTRODUCTION_SUPPORT_MISSING');
    const introductions = selected.flat().filter((r) => r[key]).length;
    const upper = introductions ? null : zeroIntroductionUpper(selected.map((c) => c.length), 40);
    catastrophe[spec.key] = { ...cat, introductions, introductionUpper: upper,
      pass: introductions === 0 && upper <= 0.02 && cat.inference === 'PERCENTILE_DESIGN_ONLY' && cat.upper <= 0.02 };
  }
  const safety = inferred(cells, ['HARM_B', 'HARM_N', 'BEST_OF_GAP'].map((key) => ({ key, metric: key })), 30, options);
  for (const e of Object.values(safety)) e.pass = e.inference === 'PERCENTILE_DESIGN_ONLY' && e.upper <= 0.02;
  const regimeSpecs = REGIMES.flatMap((regime) => ['RB', 'RN'].map((metric) => ({ key: regime + '/' + metric, metric, regime })));
  const regimes = inferred(cells, regimeSpecs, 40, options);
  for (const spec of regimeSpecs) {
    const support = subgroupSupport(cells, spec), e = regimes[spec.key];
    if (!support.pass) e.inference = 'UNAVAILABLE_SPARSE_SUBGROUP';
    e.support = support; e.interpretation = interpretRegime(e);
  }
  const nuisance = {};
  for (const category of ['D4', 'IDENTITY', 'ORDER']) for (const spec of primarySpecs()) {
    const e = scalarInference(cells, (r) => {
      const x = r.nuisance?.[category]?.[spec.metric];
      ok(finite(x) && x >= 0 && x <= 2, 'MISSING_OR_INVALID_NUISANCE_MAX'); return x;
    }, [spec], 120, options)[spec.key];
    nuisance[category + '/' + spec.key] = { ...e, pass: e.inference === 'PERCENTILE_DESIGN_ONLY' && e.upper <= 0.02 };
  }
  return { equalities, primaries, accuracy, catastrophe, safety, regimes, nuisance, DDVBundle: descriptiveBundle(cells),
    numericCriteriaPass: Object.values(primaries).every(superiority) && [accuracy, catastrophe, safety, nuisance].every((x) => Object.values(x).every((e) => e.pass)) && !Object.values(regimes).some((e) => e.interpretation.materialHarm),
    decision: 'OWNER_GOVERNED_NATIVE_NUMERIC', reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, externalIndependentCustody: false,
    canonicalTCA: null, incumbentPrimeValue: null, boundedQualificationImpliesFullCertification: false };
}

/** Owner-governed bounded disposition. It can never return a canonical or independently reviewed classification. */
export function ownerGovernedDisposition({ ownerApproval, registered = false, panels = [], admissionPass = false, integrityPass = false } = {}) {
  const scopes = ['SCOPE-DDV', 'SCOPE-TCA', 'SCOPE-PRIME', 'SCOPE-REGIME', 'SCOPE-THRESHOLDS'];
  const approved = !!ownerApproval && scopes.every((s) => ownerApproval.decisions?.[s]?.approved === true && ownerApproval.decisions[s].signatureOrTrustedApprovalReference);
  if (!approved || !registered) return { classification: 'CONTRACT_BLOCKED', reviewMode: 'OWNER_GOVERNED' };
  const expected = new Set(['A', 'B'].flatMap((r) => POPULATIONS.map((p) => r + '/' + p)));
  if (!admissionPass || !integrityPass || panels.length !== 10 || new Set(panels.map((p) => p.key)).size !== 10 || panels.some((p) => !expected.has(p.key) || p.report?.decision !== 'OWNER_GOVERNED_NATIVE_NUMERIC')) return { classification: 'UNMEASURED', reviewMode: 'OWNER_GOVERNED' };
  const all = panels.map((p) => p.report);
  const positive = all.every((r) => r.numericCriteriaPass);
  const harm = all.some((r) => Object.values(r.primaries).some((e) => e.interpretation === 'HARM_DIRECTION_NUMERIC_ONLY') || Object.values(r.catastrophe).some((e) => e.introductions > 0));
  const equivalent = all.every((r) => Object.values(r.primaries).every((e) => e.interpretation === 'EQUIVALENCE_NUMERIC_ONLY'));
  return { classification: positive ? 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFIED_POSITIVE' : harm ? 'BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_HARM' : equivalent ? 'BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_NO_MATERIAL_VALUE' : 'BOUNDED_OWNER_GOVERNED_INCONCLUSIVE',
    reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, externalIndependentCustody: false, canonicalStage3hCertification: false, analysis: ANALYSIS_ID, resamples: SPEC.resamples };
}
