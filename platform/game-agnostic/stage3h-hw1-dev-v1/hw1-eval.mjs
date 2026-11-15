// H-W1 evaluator (I-4 exploration measurement and I-5 validation). Offline truth is read here and nowhere in the policy path. Definitions follow H_W1_CONTRACT.json and the frozen
// runner-design predicates: catastrophe = regret >= 100; nreg = regret / menu utility spread (0 when the spread is 0); introduction = potentialIntroduction(candidate, comparator, truth)
// (identical sets never introduce; otherwise the candidate set holds a catastrophic action while the comparator set holds a non-catastrophic one). A decision is the keyV2 orbit of the chosen action:
// catastrophe is the worst case over the orbit, regret the uniform expectation (worst case also reported). Class nreg is the equal-weight mean over the class's member worlds (base + twins).
import { prng } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { potentialIntroduction } from '../stage3h-activation-readiness-v2/runner-design.mjs';

export const CATASTROPHE = 100, RESAMPLES = 10000, BOOTSTRAP_SEED = 'HW1_CLUSTER_BOOTSTRAP_V1', REGRET_THRESHOLD = -0.02;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, sameSet = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

/** Per-world scoring of an index set against one truth vector. */
export function scoreIndexSet(set, truth) {
  const max = Math.max(...truth), spread = max - Math.min(...truth), reg = set.map((i) => max - truth[i]), r = mean(reg);
  return { nreg: spread ? r / spread : 0, nregWorst: spread ? Math.max(...reg) / spread : 0, regret: r, worstRegret: Math.max(...reg), cat: reg.some((x) => x >= CATASTROPHE) };
}
const asTruth = (truth) => truth.map((u, i) => ({ id: i, utility: u }));

/** One class, one decided orbit (array of menu indices) -> per-member and class-level outcomes against S0 (B) and Nexus-else-S0 (N). */
export function evalClass(cls, orbit) {
  if (!orbit.length || orbit.some((i) => !(i >= 0 && i < cls.menu.length))) return { illegal: true };
  const per = cls.members.map((m) => {
    const t = asTruth(m.truth), c = scoreIndexSet(orbit, m.truth), b = scoreIndexSet(cls.B, m.truth), n = scoreIndexSet(cls.N, m.truth);
    return { kind: m.kind, cand: c, nregB: b.nreg, nregN: n.nreg, introB: potentialIntroduction(orbit, cls.B, t), introN: potentialIntroduction(orbit, cls.N, t) };
  });
  const base = per[0], m = (f) => mean(per.map(f));
  return { illegal: false, nreg: m((p) => p.cand.nreg), nregWorst: Math.max(...per.map((p) => p.cand.nregWorst)), nregBase: base.cand.nreg, nregB: m((p) => p.nregB), nregN: m((p) => p.nregN), nregBBase: base.nregB, nregNBase: base.nregN,
    catAny: per.some((p) => p.cand.cat), catBase: base.cand.cat, introB: per.some((p) => p.introB), introN: per.some((p) => p.introN), introBBase: base.introB, introNBase: base.introN,
    introBMembers: per.filter((p) => p.introB).length, introNMembers: per.filter((p) => p.introN).length, members: per.length, equalsB: sameSet(orbit, cls.B), equalsN: sameSet(orbit, cls.N) };
}

/** Cluster bootstrap (clusters = origin families, class-paired deltas, class-weighted mean): one-sided 95% upper bound = 95th percentile of the resampled mean. */
export function clusterBootstrap(values, clusterOf, { resamples = RESAMPLES, seed = BOOTSTRAP_SEED } = {}) {
  const by = new Map(); values.forEach((v, i) => { const k = clusterOf[i]; const e = by.get(k) ?? by.set(k, { s: 0, n: 0 }).get(k); e.s += v; e.n++; });
  const cl = [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, e]) => e), rnd = prng(seed), out = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) { let s = 0, n = 0; for (let k = 0; k < cl.length; k++) { const e = cl[Math.floor(rnd() * cl.length)]; s += e.s; n += e.n; } out[r] = s / n; }
  out.sort(); const q = (p) => out[Math.min(resamples - 1, Math.floor(p * resamples))];
  return { point: mean(values), upper95: q(0.95), lower95: q(0.05), clusters: cl.length, resamples };
}

/** Rule-of-three style one-sided 95% bound at zero events: 1 - 0.05^(1/n). */
export const zeroEventUpper = (n) => 1 - Math.pow(0.05, 1 / n);

/** Aggregate class outcomes into the contract's reported metrics. results[i] = evalClass(...); families[i] = origin family of class i. */
export function aggregate(results, families, opts = {}) {
  const ok = results.filter((r) => !r.illegal), n = results.length, dB = ok.map((r) => r.nreg - r.nregB), dN = ok.map((r) => r.nreg - r.nregN), fam = results.map((r, i) => (r.illegal ? null : families[i])).filter((x) => x !== null);
  const sum = (f) => ok.reduce((a, r) => a + Number(f(r)), 0);
  const bootB = clusterBootstrap(dB, fam, opts), bootN = clusterBootstrap(dN, fam, opts);
  const familiesWithIntro = (k) => new Set(ok.map((r, i) => (r[k] ? fam[i] : null)).filter((x) => x !== null)).size;
  return { classes: n, illegal: n - ok.length, introVsS0: sum((r) => r.introB), introVsNexus: sum((r) => r.introN), introVsS0BaseOnly: sum((r) => r.introBBase), introVsNexusBaseOnly: sum((r) => r.introNBase),
    introMembersVsS0: sum((r) => r.introBMembers), introMembersVsNexus: sum((r) => r.introNMembers), catClasses: sum((r) => r.catAny), catBaseOnly: sum((r) => r.catBase), familiesWithIntroVsS0: familiesWithIntro('introB'), familiesWithIntroVsNexus: familiesWithIntro('introN'),
    meanNreg: mean(ok.map((r) => r.nreg)), meanNregS0: mean(ok.map((r) => r.nregB)), meanNregNexus: mean(ok.map((r) => r.nregN)), meanNregBaseOnly: mean(ok.map((r) => r.nregBase)), worstClassNreg: Math.max(...ok.map((r) => r.nregWorst)),
    deltaVsS0: bootB, deltaVsNexus: bootN, deltaVsS0BaseOnly: mean(ok.map((r) => r.nregBase - r.nregBBase)), deltaVsNexusBaseOnly: mean(ok.map((r) => r.nregBase - r.nregNBase)),
    equalsS0: sum((r) => r.equalsB), equalsNexus: sum((r) => r.equalsN), classLevelZeroEventUpper: zeroEventUpper(n), clusterLevelZeroEventUpper: zeroEventUpper(bootB.clusters) };
}
