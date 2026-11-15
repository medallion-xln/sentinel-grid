// Phase 3 mechanism probe on DEV worlds only. Usage: node h2-mechanism.mjs <set>
// Selects, from this lane's own DEV rows, H2 worlds where S0 (= R at H2) is catastrophic and Nexus-else-S0 is not
// (INTRO), the reverse (N catastrophic, S0 safe: what a switch to N would introduce vs B), and a fixed control sample.
// For each: (1) regenerates the world and re-locks every decision from the public view (asserted equal to the row);
// (2) evaluator-only reward-vector decomposition of each catastrophe; (3) public-equivalent hidden-health twins: one
// non-civilian, non-actor entity's health shifted by +-5/10/20 (alive stays alive), kept only if the whole public view
// (minus world-hash and provenance digests, which no policy reads) is byte-identical and every decision is identical;
// then the evaluator re-labels catastrophe status. Truth never reaches a policy. Writes evidence/h2-mechanism-<set>.json.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cloneWorld } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { FORGE_REWARD_V2_WEIGHTS } from '../src/forge/reward-v2.js';
import { stableStringify } from '../src/core/determinism.js';
import { LANE, ok, writeExclusive, devWorld, devLock, evaluatorTruth, evaluatorVectors } from './lib.mjs';

export function loadRows(set) {
  const dir = resolve(LANE, 'dev-runs', set);
  return readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readFileSync(resolve(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
}
export const comboOf = (r) => { const [shape, roles, objectives, horizonBand, level] = r.cell.split('/'); return { population: r.population, cell: r.cell, seed: r.seed, shape, roles, objectives, horizonBand, level: Number(level) }; };
export const catSet = (r, idx) => idx.map((i) => Math.max(...r.u) - r.u[i] >= 100);
export const someCat = (r, idx) => catSet(r, idx).some(Boolean), someSafe = (r, idx) => catSet(r, idx).some((c) => !c);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Policy-relevant public content: the full public view without the world-hash/provenance digests (read by no policy). */
export function publicContent(view) {
  const strip = (x) => (Array.isArray(x) ? x.map(strip) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => !['worldHash', 'sourceStateHash', 'provenance'].includes(k)).map(([k, v]) => [k, strip(v)])) : x);
  return stableStringify(strip(view));
}

function decompose(vectors, menu, catIdx) {
  const best = Math.max(...menu.map((id) => vectors.get(id).total)), bestIds = menu.filter((id) => vectors.get(id).total === best), b = vectors.get(bestIds[0]);
  return catIdx.map((i) => {
    const c = vectors.get(menu[i]), contrib = Object.fromEntries(Object.keys(FORGE_REWARD_V2_WEIGHTS).map((k) => [k, (b.vector[k] - c.vector[k]) * FORGE_REWARD_V2_WEIGHTS[k]]).filter(([, v]) => v !== 0));
    const top = Object.entries(contrib).sort((x, y) => y[1] - x[1])[0];
    return { regret: best - c.total, topComponent: top?.[0] ?? null, contributions: contrib, catOutcome: c.outcome, catTerminalReason: c.terminalReason, catPath: c.path, bestPath: b.path, catActorHealthEnd: c.actorHealthEnd, bestOutcome: b.outcome };
  });
}

export function hiddenTwins(w, lock) {
  const baseContent = publicContent(w.view), out = [];
  for (const e of w.world.entities) {
    if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0)) continue;
    for (const d of [-20, -10, -5, 5, 10, 20]) {
      const h = e.health + d; if (h < 1 || h > 100) continue;
      const tw = cloneWorld(w.world); tw.entities.find((x) => x.id === e.id).health = h;
      const tv = observableView(tw); if (publicContent(tv) !== baseContent) { out.push({ entity: e.id, type: e.type, delta: d, publicEquivalent: false }); continue; }
      const tl = devLock(tv, w.band);
      ok(stableStringify(tl.selections) === stableStringify(lock.selections), 'PUBLIC_EQUIVALENT_TWIN_CHANGED_A_DECISION');
      out.push({ entity: e.id, type: e.type, delta: d, publicEquivalent: true, world: tw });
    }
  }
  return out;
}

export function probe(r) {
  const w = devWorld(comboOf(r)); ok(!w.rejected && w.worldHash === r.worldHash, 'REGENERATION_MISMATCH');
  const lock = devLock(w.view, w.band), menu = lock.menu, ix = (ids) => ids.map((id) => menu.indexOf(id));
  ok(same(ix(lock.selections.B), r.sel.B) && same(ix(lock.selections.N), r.sel.N), 'RELOCK_MISMATCH');
  const twins = hiddenTwins(w, lock); // all decisions (original and twins) are locked before any truth below
  const vectors = evaluatorVectors(w.world, w.horizon);
  const catB = r.sel.B.filter((i) => Math.max(...r.u) - r.u[i] >= 100), catN = r.sel.N.filter((i) => Math.max(...r.u) - r.u[i] >= 100);
  const status = (u) => ({ Bcat: r.sel.B.some((i) => Math.max(...u) - u[i] >= 100), Bsafe: r.sel.B.some((i) => Math.max(...u) - u[i] < 100), Ncat: r.sel.N.some((i) => Math.max(...u) - u[i] >= 100), Nsafe: r.sel.N.some((i) => Math.max(...u) - u[i] < 100),
    safeActions: u.map((x, i) => (Math.max(...u) - x < 100 ? i : -1)).filter((i) => i >= 0) });
  const orig = status(r.u), eq = twins.filter((t) => t.publicEquivalent);
  const twinStatus = eq.map((t) => { const u = evaluatorTruth(t.world, w.horizon, menu).map((x) => x.utility); return { entity: t.entity, type: t.type, delta: t.delta, ...status(u), nreg: { B: nreg(u, r.sel.B), N: nreg(u, r.sel.N) } }; });
  const introN = (s) => s.Bcat && s.Nsafe && !same(r.sel.B, r.sel.N), introB = (s) => s.Ncat && s.Bsafe && !same(r.sel.B, r.sel.N);
  const robustSafe = orig.safeActions.filter((i) => twinStatus.every((s) => s.safeActions.includes(i)));
  return { idx: r.idx, population: r.population, cell: r.cell, regime: r.regime, menuSize: menu.length,
    types: { B: r.sel.B.map((i) => r.pub.actions[i].t), N: r.sel.N.map((i) => r.pub.actions[i].t) }, s0SetSize: r.sel.B.length, nexusReason: r.nexus.reason,
    original: { introN: introN(orig), introB: introB(orig), Bcat: orig.Bcat, Ncat: orig.Ncat, safeActions: orig.safeActions.length },
    causesB: decompose(vectors, menu, catB), causesN: decompose(vectors, menu, catN),
    twins: { attempted: twins.length, publicEquivalent: eq.length,
      BcatFlips: twinStatus.filter((s) => s.Bcat !== orig.Bcat).length, NcatFlips: twinStatus.filter((s) => s.Ncat !== orig.Ncat).length,
      introNInTwins: twinStatus.filter(introN).length, introBInTwins: twinStatus.filter(introB).length,
      conflictWitness: (introN(orig) && twinStatus.some(introB)) || (introB(orig) && twinStatus.some(introN)),
      robustSafeActions: robustSafe.length, robustSafeIncludesB: r.sel.B.every((i) => robustSafe.includes(i)), robustSafeIncludesN: r.sel.N.every((i) => robustSafe.includes(i)),
      flippingEntities: [...new Set(twinStatus.filter((s) => s.Bcat !== orig.Bcat || s.Ncat !== orig.Ncat).map((s) => s.type + (s.delta > 0 ? '+' : '') + s.delta))].sort() } };
}
const nreg = (u, sel) => { const max = Math.max(...u), spread = max - Math.min(...u); return spread ? sel.reduce((a, i) => a + (max - u[i]) / spread, 0) / sel.length : 0; };

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'h2-mechanism.mjs')) {
  const set = process.argv[2], rows = loadRows(set).filter((r) => !r.rejected && r.band === 'H2');
  const differs = (r) => !same(r.sel.B, r.sel.N);
  // All INTRO worlds; REVERSE and CONTROL are the first 60 / 40 by schedule index (fixed before any probe runs).
  const intro = rows.filter((r) => r.introN), reverseAll = rows.filter((r) => differs(r) && someCat(r, r.sel.N) && someSafe(r, r.sel.B)), reverse = reverseAll.slice(0, 60);
  const control = rows.filter((r) => differs(r) && !someCat(r, r.sel.B) && !someCat(r, r.sel.N)).slice(0, 40);
  const t0 = Date.now(), probes = { INTRO: intro.map(probe), REVERSE: reverse.map(probe), CONTROL: control.map(probe) };
  const summ = (ps) => ({ worlds: ps.length, withPublicEquivalentTwins: ps.filter((p) => p.twins.publicEquivalent > 0).length,
    BcatFlipWorlds: ps.filter((p) => p.twins.BcatFlips > 0).length, NcatFlipWorlds: ps.filter((p) => p.twins.NcatFlips > 0).length,
    conflictWitnessWorlds: ps.filter((p) => p.twins.conflictWitness).length, worldsWithRobustSafeAction: ps.filter((p) => p.twins.robustSafeActions > 0).length,
    s0TieSets: ps.filter((p) => p.s0SetSize > 1).length,
    topComponentsB: count(ps.flatMap((p) => p.causesB.map((c) => c.topComponent))), topComponentsN: count(ps.flatMap((p) => p.causesN.map((c) => c.topComponent))),
    catTerminalB: count(ps.flatMap((p) => p.causesB.map((c) => c.catTerminalReason ?? c.catOutcome ?? 'NONE'))), catTerminalN: count(ps.flatMap((p) => p.causesN.map((c) => c.catTerminalReason ?? c.catOutcome ?? 'NONE'))),
    typesB: count(ps.map((p) => p.types.B.join('+'))), typesN: count(ps.map((p) => p.types.N.join('+'))), regimes: count(ps.map((p) => p.regime)), nexusReasons: count(ps.map((p) => p.nexusReason ?? 'ABSTAIN')) });
  const out = { schema: 'STAGE3H_FAILURE_DIAGNOSIS_H2_MECHANISM_V1', set, h2Worlds: rows.length, introTotal: intro.length, reverseTotal: reverseAll.length, summary: Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, summ(v)])), probes, seconds: (Date.now() - t0) / 1000, authority: 'R0', v4RowsRead: false };
  writeExclusive(resolve(LANE, `evidence/h2-mechanism-${set}.json`), out);
  console.log(JSON.stringify({ set, h2Worlds: rows.length, summary: out.summary, seconds: out.seconds }, null, 1));
}
function count(xs) { const m = {}; for (const x of xs) m[x] = (m[x] ?? 0) + 1; return m; }
