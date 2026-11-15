// Prospective V3 author correction. Numeric fixtures only; no environment or campaign imports.
import { SPEC, bootstrap, groupCells, estimate, primarySpecs, superiority, equalityCheck, zeroIntroductionUpper, metric, quantile } from '../../../stage3h-activation-readiness-v2/analysis.mjs';
export { SPEC, bootstrap, groupCells, estimate, primarySpecs, superiority, equalityCheck, zeroIntroductionUpper, metric, quantile };
const ok = (x, m) => { if (!x) throw Error(m); };
const finite = x => typeof x === 'number' && Number.isFinite(x);
export const REGIMES = Object.freeze(['OBSERVED_THREAT', 'NO_OBSERVED_THREAT']);
export const POPULATIONS = Object.freeze(['HOLDOUT_KNOWN_COMPOSITION', 'OOD_LEVEL', 'OOD_ROLES', 'OOD_OBJECTIVES', 'OOD_SHAPES']);
export function familyKeys() {
  const keys = { P40: [], REGIME40: [], SAFETY30: [], NUISANCE120: [] };
  for (const replication of ['A', 'B']) for (const population of POPULATIONS) {
    const prefix = `${replication}/${population}/`;
    for (const s of primarySpecs()) {
      keys.P40.push(prefix + s.key);
      for (const nuisance of ['D4', 'IDENTITY', 'ORDER']) keys.NUISANCE120.push(prefix + s.key + '/' + nuisance);
    }
    for (const regime of REGIMES) for (const contrast of ['RB', 'RN']) keys.REGIME40.push(prefix + regime + '/' + contrast);
    for (const contrast of ['HARM_B', 'HARM_N', 'BEST_OF_GAP']) keys.SAFETY30.push(prefix + contrast);
  }
  return keys;
}
export function interpretRegime(e) {
  if (e.inference !== 'PERCENTILE_DESIGN_ONLY') return { status: 'UNMEASURED', benefit: false, materialHarm: false, equivalent: false, harmAvoidance: false };
  ok([e.mean, e.lower, e.upper].every(finite) && e.lower <= e.upper, 'INVALID_REGIME_INTERVAL');
  return { status: 'NOMINAL_APPROXIMATE_INFERENCE',
    benefit: e.mean <= -0.02 && e.upper < 0,
    materialHarm: e.mean >= 0.02 && e.lower > 0,
    direction: e.upper < 0 ? 'NEGATIVE' : e.lower > 0 ? 'POSITIVE' : 'UNRESOLVED',
    equivalent: e.lower > -0.02 && e.upper < 0.02,
    v2InclusiveContainmentDiagnostic: e.lower >= -0.02 && e.upper <= 0.02,
    harmAvoidance: e.upper <= 0.02,
    equivalenceRole: 'TOST_INTERSECTION_UNION_NOT_JOINT_BIDIRECTIONAL_COVERAGE',
    directionalFamilyAlphaEach: 0.05, jointDirectionalUnionUpperBound: 0.10,
    heterogeneity: 'DESCRIPTIVE_ONLY_NOT_TESTED' };
}
export function interpretPrimary(e) {
  if (e.inference !== 'PERCENTILE_DESIGN_ONLY') return 'UNMEASURED';
  if (superiority(e)) return 'MATERIAL_BENEFIT_NUMERIC_ONLY';
  if (e.lower > 0) return 'HARM_DIRECTION_NUMERIC_ONLY';
  if (e.lower > -0.02 && e.upper < 0.02) return 'EQUIVALENCE_NUMERIC_ONLY';
  return 'INCONCLUSIVE';
}
export function subgroupSupport(cells, spec) {
  const matches = r => (!spec.band || r.band === spec.band) && (!spec.regime || r.regime === spec.regime);
  const counts = cells.map(c => c.filter(matches).length), n = counts.reduce((a, b) => a + b, 0);
  return { counts, n, pass: n >= 50 && counts.filter(n => n > 0).every(n => n >= 2) };
}
function inferred(cells, specs, family, options) {
  // Same cell ordering, analysis label and draw count preserve common paired draws across families.
  return bootstrap(cells, specs, { ...options, family });
}
function scalarInference(cells, values, specs, family, options) {
  const mapped = cells.map(c => c.map(r => ({ ...r, metrics: { R: { nreg: values(r) }, B: { nreg: 0 }, N: { nreg: 0 } } })));
  return inferred(mapped, specs.map(s => ({ ...s, metric: 'RB' })), family, options);
}
export function validateNumericRows(rows) {
  ok(rows.length > 0 && new Set(rows.map(r => r.id)).size === rows.length, 'EMPTY_OR_DUPLICATE_UNITS');
  for (const r of rows) {
    ok(r.synthetic === true && !('seed' in r) && !('world' in r), 'SYNTHETIC_ROWS_ONLY');
    ok(['H0', 'H2'].includes(r.band) && REGIMES.includes(r.regime), 'UNDECLARED_STRATUM');
    for (const arm of ['R', 'B', 'N']) {
      const m = r.metrics[arm], ids = r.selections[arm];
      ok(m && ['nreg', 'hit', 'cat', 'regret'].every(k => finite(m[k])), 'NONFINITE_METRIC');
      ok(['nreg', 'hit', 'cat'].every(k => m[k] >= 0 && m[k] <= 1) && m.regret >= 0, 'OUT_OF_RANGE_METRIC');
      ok(ids?.length > 0 && new Set(ids).size === ids.length, 'MISSING_OR_DUPLICATE_SELECTION');
    }
  }
}
export function descriptiveBundle(cells) {
  const weighted = fn => cells.reduce((sum, c) => sum + c.reduce((s, r) => s + fn(r), 0) / c.length, 0) / cells.length;
  return Object.fromEntries(['R', 'B', 'N'].map(arm => {
    const weightedRaw = cells.flatMap(c => c.map(r => ({ x: r.metrics[arm].regret, w: 1 / (cells.length * c.length) }))).sort((a, b) => a.x - b.x);
    let cumulative = 0, p95 = weightedRaw.at(-1).x;
    for (const { x, w } of weightedRaw) { cumulative += w; if (cumulative >= .95) { p95 = x; break; } }
    return [arm, { hit: weighted(r => r.metrics[arm].hit), normalizedRegret: weighted(r => r.metrics[arm].nreg), rawRegretMean: weighted(r => r.metrics[arm].regret), rawRegretP95EqualCellWeighted: p95, catastrophe: weighted(r => r.metrics[arm].cat) }];
  }));
}
export function analyseSyntheticPanel(rows, options = {}) {
  validateNumericRows(rows);
  const cells = groupCells(rows);
  ok(cells.every(c => c.every(r => r.band === c[0].band)), 'CELL_CROSSES_HORIZONS');
  const equalities = { H0: equalityCheck(rows, 'H0', 'R', 'N'), H2: equalityCheck(rows, 'H2', 'R', 'B') };
  ok(Object.values(equalities).every(e => e.status === 'EXACT_IDENTITY_PASS'), 'MISSING_OR_INVALID_EXACT_CONTROL');
  const primaries = inferred(cells, primarySpecs(), 40, options), accuracy = {}, catastrophe = {};
  for (const e of Object.values(primaries)) e.interpretation = interpretPrimary(e);
  for (const spec of primarySpecs()) {
    const hit = inferred(cells, [{ ...spec, metric: spec.metric === 'RB' ? 'HIT_RB' : 'HIT_RN' }], 40, options)[spec.key];
    accuracy[spec.key] = { ...hit, pass: hit.inference === 'PERCENTILE_DESIGN_ONLY' && hit.ci95[1] >= 0 && hit.lower >= -0.02 };
    const cat = inferred(cells, [{ ...spec, metric: spec.metric === 'RB' ? 'CAT_RB' : 'CAT_RN' }], 40, options)[spec.key];
    const selected = cells.filter(c => !spec.band || c[0].band === spec.band);
    const key = spec.metric === 'RB' ? 'introductionB' : 'introductionN';
    ok(selected.flat().every(r => typeof r[key] === 'boolean'), 'INTRODUCTION_SUPPORT_MISSING');
    const introductions = selected.flat().filter(r => r[key]).length;
    const upper = introductions ? null : zeroIntroductionUpper(selected.map(c => c.length), 40);
    catastrophe[spec.key] = { ...cat, introductions, introductionUpper: upper,
      pass: introductions === 0 && upper <= 0.02 && cat.inference === 'PERCENTILE_DESIGN_ONLY' && cat.upper <= 0.02 };
  }
  const safety = inferred(cells, ['HARM_B', 'HARM_N', 'BEST_OF_GAP'].map(key => ({ key, metric: key })), 30, options);
  for (const e of Object.values(safety)) e.pass = e.inference === 'PERCENTILE_DESIGN_ONLY' && e.upper <= 0.02;
  const regimeSpecs = REGIMES.flatMap(regime => ['RB', 'RN'].map(metric => ({ key: regime + '/' + metric, metric, regime })));
  const regimes = inferred(cells, regimeSpecs, 40, options);
  for (const spec of regimeSpecs) {
    const support = subgroupSupport(cells, spec), e = regimes[spec.key];
    if (!support.pass) e.inference = 'UNAVAILABLE_SPARSE_SUBGROUP';
    e.support = support; e.interpretation = interpretRegime(e);
  }
  const nuisance = {};
  for (const category of ['D4', 'IDENTITY', 'ORDER']) for (const spec of primarySpecs()) {
    const e = scalarInference(cells, r => {
      const x = r.nuisance?.[category]?.[spec.metric];
      ok(finite(x) && x >= 0 && x <= 2, 'MISSING_OR_INVALID_NUISANCE_MAX'); return x;
    }, [spec], 120, options)[spec.key];
    nuisance[category + '/' + spec.key] = { ...e, pass: e.inference === 'PERCENTILE_DESIGN_ONLY' && e.upper <= 0.02 };
  }
  return { equalities, primaries, accuracy, catastrophe, safety, regimes, nuisance, DDVBundle: descriptiveBundle(cells),
    numericCriteriaPass: Object.values(primaries).every(superiority) && [accuracy, catastrophe, safety, nuisance].every(x => Object.values(x).every(e => e.pass)) && !Object.values(regimes).some(e => e.interpretation.materialHarm),
    decision: 'SYNTHETIC_ONLY_NO_QUALIFICATION', independentReview: 'REVIEW_PENDING', canonicalTCA: null, incumbentPrimeValue: null,
    boundedQualificationImpliesFullCertification: false };
}
export function boundedDisposition({ approved = false, independentReviewAccepted = false, registered = false, independentAB = false, panels = [], admissionPass = false, integrityPass = false } = {}) {
  if (!approved || !independentReviewAccepted || !registered) return 'CONTRACT_BLOCKED';
  const expected = new Set(['A', 'B'].flatMap(r => POPULATIONS.map(p => r + '/' + p)));
  if (!independentAB || !admissionPass || !integrityPass || panels.length !== 10 || new Set(panels.map(p => p.key)).size !== 10 || panels.some(p => !expected.has(p.key))) return 'UNMEASURED';
  // This API intentionally cannot promote synthetic panels or certify Stage 3H.
  if (panels.some(p => p.report?.decision === 'SYNTHETIC_ONLY_NO_QUALIFICATION')) return 'SYNTHETIC_ONLY_NO_QUALIFICATION';
  return 'NATIVE_EVIDENCE_REQUIRES_SEPARATELY_AUTHORIZED_ADAPTER';
}
