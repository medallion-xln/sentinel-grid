// Phase 3 contradiction search. Usage (from this lane): node search.mjs <shard> <of>
// Candidate public observations (fixed before any twin is built): every admitted H2 world of the spent DEV sets
// (DEV288, FRESH_EXPLORE block 951, FRESH_CHECK block 952) in which Nexus applies (no abstention), N != B, and either
// S0 introduces vs N (B catastrophic, N safe) or both arms' regrets lie in [40, 160]. For each, the deterministic twin
// family (twins.mjs) is built natively; a twin joins the observation class only if its complete public view (digests
// excepted) equals the base view, and both arms' decisions are re-locked and asserted identical. Only after every
// decision in the class is fixed is evaluator truth computed. A class is a WITNESS when it contains one world where
// choosing N introduces a catastrophe vs B and another where choosing B introduces one vs N.
// Writes search/shard-<i>-of-<n>.jsonl ('wx'). Reads the lane's own DEV rows only; no V4 row, outcome or analysis.
import { openSync, writeSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRows, comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { evaluatorTruth, prng } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { nativeWorld, hiddenSupport, decisions, twinFamily } from './twins.mjs';
import { labels, classVerdict } from './contract.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ok = (v, m) => { if (!v) throw Error(m); };
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export const DRAWS = 40;

export function candidates() {
  const out = [];
  for (const set of ['DEV288', 'FRESH_EXPLORE', 'FRESH_CHECK']) for (const r of loadRows(set)) {
    if (r.rejected || r.band !== 'H2' || r.nexus.abstain || same(r.sel.B, r.sel.N)) continue;
    const max = Math.max(...r.u), regB = Math.max(...r.sel.B.map((i) => max - r.u[i])), regN = Math.max(...r.sel.N.map((i) => max - r.u[i]));
    const near = regB >= 40 && regB <= 160 && regN >= 40 && regN <= 160;
    if (r.introN || near) out.push({ set, row: r, reason: r.introN ? (near ? 'INTRO_AND_NEAR' : 'INTRO') : 'NEAR_THRESHOLD' });
  }
  return out;
}

export function searchClass({ set, row, reason }) {
  const combo = comboOf(row), base = nativeWorld(combo);
  ok(!base.rejected && base.worldHash === row.worldHash, 'BASE_REGENERATION_MISMATCH');
  const sup = hiddenSupport(base.config), out = { set, idx: row.idx, cell: row.cell, seed: row.seed, worldHash: row.worldHash, reason, coords: sup.coords.length };
  if (!sup.inSupport) return { ...out, status: 'BASE_OUTSIDE_SUPPORT_MODEL', violations: sup.violations };
  const dec = decisions(base.view, base.band);
  ok(same(dec.B, row.sel.B) && same(dec.N, row.sel.N) && !dec.nexusAbstain, 'BASE_DECISION_MISMATCH');
  const members = [{ kind: 'BASE', spec: [], w: base }], rejected = {}; let notEquivalent = 0;
  for (const f of twinFamily(sup.coords, prng(base.worldHash), DRAWS)) {
    const w = nativeWorld(combo, f.spec);
    if (w.rejected) { rejected[w.rejected] = (rejected[w.rejected] ?? 0) + 1; continue; }
    if (w.content !== base.content) { notEquivalent++; continue; }
    const d = decisions(w.view, w.band);
    ok(same(d.B, dec.B) && same(d.N, dec.N) && d.nexusAbstain === false && JSON.stringify(d.menu) === JSON.stringify(dec.menu), 'EQUIVALENT_TWIN_CHANGED_A_DECISION');
    members.push({ kind: f.kind, spec: f.spec, w });
  }
  // every decision in the class is fixed; truth is released only now
  const scored = members.map((m) => ({ kind: m.kind, spec: m.spec, worldHash: m.w.worldHash, truth: evaluatorTruth(m.w.world, m.w.horizon, dec.menu).map((x) => x.utility) }))
    .map((m) => ({ ...m, ...labels(dec, m.truth) }));
  const w1 = scored.find((m) => m.choosingNIntroducesVsB), w2 = scored.find((m) => m.choosingBIntroducesVsN);
  const brief = (m) => m && { kind: m.kind, spec: m.spec, worldHash: m.worldHash, regretB: m.regretB, regretN: m.regretN, truth: m.truth };
  return { ...out, status: w1 && w2 ? 'WITNESS' : w1 || w2 ? 'ONE_SIDED' : 'NO_INTRODUCTION', menuSize: dec.menu.length, B: dec.B, N: dec.N,
    familySize: members.length - 1 + Object.values(rejected).reduce((a, b) => a + b, 0) + notEquivalent, equivalentTwins: members.length - 1, notEquivalent, rejected,
    worldsWhereNIntroducesVsB: scored.filter((m) => m.choosingNIntroducesVsB).length, worldsWhereBIntroducesVsN: scored.filter((m) => m.choosingBIntroducesVsN).length,
    regretRange: { B: [Math.min(...scored.map((m) => m.regretB)), Math.max(...scored.map((m) => m.regretB))], N: [Math.min(...scored.map((m) => m.regretN)), Math.max(...scored.map((m) => m.regretN))] },
    classVerdict: classVerdict(dec, scored), witness: w1 && w2 ? { nIntroducesVsB: brief(w1), bIntroducesVsN: brief(w2) } : null,
    equivalentHashes: scored.map((m) => m.worldHash) };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'search.mjs')) {
  const [shard, of] = process.argv.slice(2).map(Number);
  ok(Number.isInteger(shard) && Number.isInteger(of) && shard >= 0 && shard < of, 'USAGE: node search.mjs <shard> <of>');
  const dir = resolve(LANE, 'search'); if (!existsSync(dir)) mkdirSync(dir);
  const fd = openSync(resolve(dir, `shard-${shard}-of-${of}.jsonl`), 'wx'), all = candidates(), mine = all.filter((_, i) => i % of === shard);
  let n = 0, witnesses = 0; const t0 = Date.now();
  for (const c of mine) { const r = searchClass(c); if (r.status === 'WITNESS') witnesses++; writeSync(fd, JSON.stringify(r) + '\n'); n++; }
  closeSync(fd);
  console.log(JSON.stringify({ shard, of, candidatesTotal: all.length, classes: n, witnesses, seconds: (Date.now() - t0) / 1000 }));
}
