// Independent verification of the contradiction witness(es). Usage (from this lane): node verify-witness.mjs
// Selection rule (fixed before reading any margin): among all WITNESS classes, the primary witness is the pair whose
// smallest distance of a decisive regret from the threshold is largest; ties by (set, idx). Every witness is verified.
// For each pair (w1: choosing N introduces vs B; w2: choosing B introduces vs N) it rebuilds both worlds natively from
// (seed, axes, hidden spec) and checks: generator-support provenance; that the configs differ only in the declared hidden
// fields; identical calibrated warm-up length; byte-identical public content (digests excepted) at the decision point
// AND at every warm-up tick; identical frozen decisions via the frozen connector lock; Nexus applicable; evaluator
// determinism; the introduction labels; the exhaustive two-arm class verdict; the identity-free comparator relation;
// and an evaluator-only reward decomposition of the decisive actions. Writes evidence/witness.json once.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from '../src/core/determinism.js';
import { FORGE_REWARD_V2_WEIGHTS } from '../src/forge/reward-v2.js';
import { nativeLock } from '../stage3h-owner-governed-v1/connector.mjs';
import { loadRows, comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { evaluatorTruth, evaluatorVectors, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { nativeWorld, hiddenSupport, publicHistory, decisions } from './twins.mjs';
import { labels, classVerdict, PUBLIC_DECISION_INFORMATION, POLICY_CLASS, CATASTROPHE } from './contract.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ok = (v, m) => { if (!v) throw Error(m); }, sha = (s) => createHash('sha256').update(s).digest('hex');
const results = readdirSync(resolve(LANE, 'search')).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readFileSync(resolve(LANE, 'search', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
// distance of each decisive regret from the threshold: catastrophic side regret - 100 (>= 0), safe side 100 - regret (> 0)
const margin = (w) => Math.min(w.nIntroducesVsB.regretN - 100, 100 - w.nIntroducesVsB.regretB, w.bIntroducesVsN.regretB - 100, 100 - w.bIntroducesVsN.regretN);
const witnesses = results.filter((r) => r.status === 'WITNESS').map((r) => ({ ...r, margin: margin(r.witness) }))
  .sort((a, b) => b.margin - a.margin || a.set.localeCompare(b.set) || a.idx - b.idx);
ok(witnesses.length > 0, 'NO_WITNESS_TO_VERIFY');
const rowsBySet = {};

function configDiff(a, b) {
  const out = [], walk = (x, y, p) => { if (stableStringify(x) === stableStringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); return; } out.push(p); };
  walk(a, b, '$'); return out;
}
function decomposition(world, horizon, menu, idx) {
  const v = evaluatorVectors(world, horizon), best = Math.max(...menu.map((id) => v.get(id).total)), b = [...menu].map((id) => v.get(id)).find((x) => x.total === best);
  return idx.map((i) => { const c = v.get(menu[i]); return { action: i, total: c.total, regret: best - c.total, path: c.path, bestPath: b.path,
    deficitByComponent: Object.fromEntries(Object.keys(FORGE_REWARD_V2_WEIGHTS).map((k) => [k, (b.vector[k] - c.vector[k]) * FORGE_REWARD_V2_WEIGHTS[k]]).filter(([, x]) => x !== 0)) }; });
}

function verify(r) {
  rowsBySet[r.set] ??= loadRows(r.set);
  const row = rowsBySet[r.set].find((x) => x.idx === r.idx), combo = comboOf(row);
  const specs = { w1: r.witness.nIntroducesVsB.spec, w2: r.witness.bIntroducesVsN.spec }, W = {};
  for (const [k, spec] of Object.entries(specs)) { const w = nativeWorld(combo, spec); ok(!w.rejected, 'REBUILD_REJECTED_' + k); W[k] = w; }
  const base = nativeWorld(combo);
  const check = {};
  check.hashesReproduced = W.w1.worldHash === r.witness.nIntroducesVsB.worldHash && W.w2.worldHash === r.witness.bIntroducesVsN.worldHash;
  check.generatorSupport = ['w1', 'w2'].every((k) => hiddenSupport(W[k].config).inSupport);
  check.configDifferencesOnlyHidden = ['w1', 'w2'].every((k) => configDiff(base.config, W[k].config).every((p) => /^\$\.entities\.\d+\.(value|health)$/.test(p)));
  check.configDiffW1W2 = configDiff(W.w1.config, W.w2.config);
  check.sameSeedAndAxes = W.w1.seed === W.w2.seed;
  check.sameWarmupTicks = W.w1.warmupTicks === W.w2.warmupTicks;
  check.decisionPointPublicContentIdentical = W.w1.content === W.w2.content;
  const H1 = publicHistory(W.w1.seed, W.w1.config, W.w1.warmupTicks), H2 = publicHistory(W.w2.seed, W.w2.config, W.w2.warmupTicks);
  check.replayReachesWorlds = H1.finalHash === W.w1.worldHash && H2.finalHash === W.w2.worldHash;
  check.fullPublicHistoryIdentical = H1.contents.length === H2.contents.length && H1.contents.every((c, t) => c === H2.contents[t]);
  check.publicHistoryTicks = H1.contents.length;
  check.hiddenStateDiffers = W.w1.worldHash !== W.w2.worldHash;
  // decisions: lane lock and the frozen connector lock (with its compute assertion) on both public views
  const d1 = decisions(W.w1.view, W.w1.band), d2 = decisions(W.w2.view, W.w2.band), f1 = nativeLock(W.w1.view, W.w1.band), f2 = nativeLock(W.w2.view, W.w2.band);
  check.decisionsIdentical = stableStringify([d1.B, d1.N, d1.menu]) === stableStringify([d2.B, d2.N, d2.menu]) && stableStringify(f1.selections) === stableStringify(f2.selections);
  check.frozenLockMatchesLaneLock = stableStringify(f1.selections.B.map((id) => f1.menu.indexOf(id))) === stableStringify(d1.B) && stableStringify(f1.selections.N.map((id) => f1.menu.indexOf(id))) === stableStringify(d1.N);
  check.nexusApplicableBoth = !d1.nexusAbstain && !d2.nexusAbstain;
  check.armsDiffer = stableStringify([...d1.B].sort()) !== stableStringify([...d1.N].sort());
  // truth (evaluator only), computed twice for determinism
  const t1 = evaluatorTruth(W.w1.world, W.w1.horizon, d1.menu).map((x) => x.utility), t2 = evaluatorTruth(W.w2.world, W.w2.horizon, d2.menu).map((x) => x.utility);
  check.evaluatorDeterministic = stableStringify(t1) === stableStringify(evaluatorTruth(W.w1.world, W.w1.horizon, d1.menu).map((x) => x.utility)) && stableStringify(t2) === stableStringify(evaluatorTruth(W.w2.world, W.w2.horizon, d2.menu).map((x) => x.utility));
  const L1 = labels(d1, t1), L2 = labels(d2, t2);
  check.w1ChoosingNIntroducesVsB = L1.choosingNIntroducesVsB && !L1.choosingBIntroducesVsN;
  check.w2ChoosingBIntroducesVsN = L2.choosingBIntroducesVsN && !L2.choosingNIntroducesVsB;
  const verdict = classVerdict(d1, [{ truth: t1 }, { truth: t2 }]);
  // identity-free comparator relation: Nexus preferred-type class (uniform) and S0-argmax within it
  const types = d1.menu.map((id) => W.w1.view.surface.find((e) => e.actionId === id).actionType), nPick = d1.N[0], cls = types.map((t, i) => (t === types[nPick] ? i : -1)).filter((i) => i >= 0);
  const identityFree = { preferredType: types[nPick], tieClass: cls, tieClassSize: cls.length,
    TYPE_SET: { w1: labels({ B: d1.B, N: cls }, t1), w2: labels({ B: d1.B, N: cls }, t2) } };
  identityFree.contradictionSurvivesWithTypeSet = identityFree.TYPE_SET.w1.choosingNIntroducesVsB && identityFree.TYPE_SET.w2.choosingBIntroducesVsN;
  identityFree.note = cls.length === 1 ? 'Nexus preferred-type class has one member: an identity-invariant tie-break cannot change N here, so the contradiction is independent of the lexical-handle defect.' : 'multi-member class: see TYPE_SET labels';
  const valid = Object.entries(check).filter(([k, v]) => typeof v === 'boolean').every(([, v]) => v) && check.configDiffW1W2.every((p) => /^\$\.entities\.\d+\.(value|health)$/.test(p)) && !verdict.anyClassMemberSafe;
  return { set: r.set, idx: r.idx, seed: r.seed, cell: r.cell, margin: r.margin, valid, checks: check,
    hiddenDifference: { w1: specs.w1, w2: specs.w2, w1vsw2ConfigPaths: check.configDiffW1W2 },
    menu: d1.menu.map((id, i) => ({ index: i, type: types[i], handle: id })), B: d1.B, N: d1.N, nexusCodes: d1.nexusCodes,
    w1: { worldHash: W.w1.worldHash, regretB: L1.regretB, regretN: L1.regretN, utilities: t1, decomposition: decomposition(W.w1.world, W.w1.horizon, d1.menu, [...new Set([...d1.B, ...d1.N])]) },
    w2: { worldHash: W.w2.worldHash, regretB: L2.regretB, regretN: L2.regretN, utilities: t2, decomposition: decomposition(W.w2.world, W.w2.horizon, d2.menu, [...new Set([...d1.B, ...d1.N])]) },
    publicContentSha: sha(W.w1.content), classVerdict: verdict, identityFree };
}

const verified = witnesses.map(verify);
const primary = verified[0];
const out = { schema: 'STAGE3H_SAFETY_FEASIBILITY_WITNESS_V1', authority: 'R0', definitions: { PUBLIC_DECISION_INFORMATION, POLICY_CLASS, CATASTROPHE },
  selectionRule: 'primary = witness with the largest smallest-decisive-regret margin from the 100 threshold; ties by (set, idx); fixed before verification',
  witnessesFound: witnesses.length, witnessesValid: verified.filter((v) => v.valid).length, marginsOfValidWitnesses: verified.filter((v) => v.valid).map((v) => v.margin),
  primary, others: verified.slice(1).map((v) => ({ set: v.set, idx: v.idx, cell: v.cell, margin: v.margin, valid: v.valid, w1: { regretB: v.w1.regretB, regretN: v.w1.regretN }, w2: { regretB: v.w2.regretB, regretN: v.w2.regretN },
    tieClassSize: v.identityFree.tieClassSize, survivesTypeSet: v.identityFree.contradictionSurvivesWithTypeSet, failedChecks: Object.entries(v.checks).filter(([, x]) => x === false).map(([k]) => k) })) };
writeExclusive(resolve(LANE, 'evidence/witness.json'), out);
console.log(JSON.stringify({ witnessesFound: out.witnessesFound, witnessesValid: out.witnessesValid, primary: { set: primary.set, idx: primary.idx, cell: primary.cell, margin: primary.margin, valid: primary.valid, w1: [primary.w1.regretB, primary.w1.regretN], w2: [primary.w2.regretB, primary.w2.regretN], checks: primary.checks, classVerdict: primary.classVerdict, identityFree: { size: primary.identityFree.tieClassSize, survives: primary.identityFree.contradictionSurvivesWithTypeSet } } }, null, 1));
