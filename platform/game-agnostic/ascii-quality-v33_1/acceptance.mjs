// Phase A6 — Platformer acceptance: STRONG v1 vs STRONG_V33_1 (versioned planner V2) on the identical v33 twelve-seed population
// (271828..271839) and twelve fresh preregistered seeds, all three tiers. Unchanged mechanics; replay-verified; no privileged input.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { create, packet, step, terminal, metrics, replay, verifyReplay } from '../ascii-suite/v32/kernel.mjs';
import { createPolicyV331 } from './policy-v33_1.mjs';
import { V33_TWELVE, PLATFORMER_ACCEPTANCE_SEEDS, FAMILY } from './population.mjs';
import { LANE, assertSoleWriter, writeExclusive, verifyInheritance, sourceClosure } from './guard.mjs';
export function run(seed, tier, kind) {
  const initial = { game: 'platformer', seed, tier, family: FAMILY, sensor: 'NORMAL' };
  let w = create('platformer', seed, tier, { family: FAMILY, sensor: 'NORMAL' }); const pol = createPolicyV331('platformer', kind, {}), actions = []; let illegal = 0, approach = 0;
  while (!terminal(w) && actions.length < 20000) { const p = packet(w), d = pol.decide(p); if (!p.actions.some((x) => x.id === d.action?.id)) illegal++; if (/APPROACH_UNTIL_CLEARABLE/.test(d.reason ?? '')) approach++; actions.push(d.action); w = step(w, p, d.action); }
  const m = metrics(w), rep = replay(initial, actions);
  return { seed, tier, kind, result: w.inner.result, ticks: w.inner.tick, health: w.inner.health, stages: w.inner.ext.round, deaths: m.deaths, damage: m.damage, illegalActionRequests: m.illegalActionRequests, illegalProposals: illegal, approachDecisions: approach, replayVerified: verifyReplay(rep).pass, progress: m.progress };
}
export function acceptance() {
  const inheritance = verifyInheritance();
  const plannerSource = readFileSync(resolve(LANE, 'platformer-planner-v2.mjs'), 'utf8'), imports = [...plannerSource.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  const populations = { V33_TWELVE: [...V33_TWELVE], FRESH_TWELVE: [...PLATFORMER_ACCEPTANCE_SEEDS] };
  const runs = [];
  for (const [pop, seeds] of Object.entries(populations)) for (const tier of [1, 2, 3]) for (const seed of seeds) for (const kind of ['STRONG', 'STRONG_V33_1']) runs.push({ population: pop, ...run(seed, tier, kind) });
  const cell = (pop, tier, kind) => { const rs = runs.filter((r) => r.population === pop && r.tier === tier && r.kind === kind); const c = {}; for (const r of rs) c[r.result] = (c[r.result] ?? 0) + 1; return { n: rs.length, results: c, wins: c.WIN ?? 0, timeouts: c.TIMEOUT ?? 0, losses: c.LOSS ?? 0, replayAll: rs.every((r) => r.replayVerified), illegal: rs.reduce((n, r) => n + r.illegalProposals + r.illegalActionRequests, 0), meanTicksWin: rs.filter((r) => r.result === 'WIN').length ? Math.round(rs.filter((r) => r.result === 'WIN').reduce((n, r) => n + r.ticks, 0) / rs.filter((r) => r.result === 'WIN').length) : null }; };
  const summary = Object.fromEntries(Object.keys(populations).map((pop) => [pop, Object.fromEntries([1, 2, 3].map((tier) => [tier, { STRONG: cell(pop, tier, 'STRONG'), STRONG_V33_1: cell(pop, tier, 'STRONG_V33_1') }]))]));
  return { schema: 'ASCII_V33_1_PLATFORMER_ACCEPTANCE_V1', preregistered: 'populations and endpoints declared in population.mjs before any run; 12 + 12 seeds x 3 tiers x 2 controllers', mechanicsChanged: false, privilegedAccess: { plannerImports: imports, onlyPublicPhysics: imports.every((i) => i === '../ascii-suite/worlds/platformer.mjs'), importedSymbols: plannerSource.match(/import \{([^}]+)\}/)?.[1].trim() ?? null },
    inheritance: { canonicalProtected: inheritance.canonicalProtected.count, sourcesUnchanged: inheritance.sourcesUnchanged }, sourceClosure: sourceClosure().hash, summary, runs, authority: 'R0' };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { assertSoleWriter(); const a = acceptance(); writeExclusive(resolve(LANE, 'evidence/platformer-acceptance.json'), a); console.log(JSON.stringify({ summary: a.summary, privileged: a.privilegedAccess.onlyPublicPhysics }, null, 1)); }
