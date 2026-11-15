// Phase 8 development-fixture run: ENGINEERING VALIDATION ONLY, not confirmatory performance evidence.
// Uses only the declared DEVELOPMENT seeds (population.mjs). Writes evidence/dev-run.json exclusively (wx); a rerun refuses.
import { resolve } from 'node:path';
import { LANE, writeExclusive, assertSoleWriter, verifyInheritance, laneClosure } from './guard.mjs';
import { GAMES, STRATEGIC_GAMES } from './arms.mjs';
import { runPaired } from './harness.mjs';
import { comparePaired, METRIC_SPEC, metricValue } from './metrics.mjs';
import { DEV_SEEDS, DEV_FAMILY } from './population.mjs';

const BASE_ARMS = ['STRONGEST_NATIVE', 'INCUMBENT_STRONG_V32', 'RULE_V32', 'FIXED_WAIT', 'UNIFORM_RANDOM', 'SHADOW_SENTINEL_READONLY'];
export const armsFor = (game) => [...BASE_ARMS, ...(STRATEGIC_GAMES.includes(game) ? ['SENTINEL_V31_AS_IS', 'V31_FALLBACK_ABLATION'] : []), ...(game === 'factory' ? ['NEXUS_REPAIR_OVER_STRONGEST_V1'] : [])];
export const NEXUS_ARMS = ['STRONGEST_NATIVE', 'NEXUS_REPAIR_OVER_STRONGEST_V1', 'SENTINEL_V31_AS_IS', 'V31_FALLBACK_ABLATION'];
export const FACTORY_STRESS = [{ sensor: 'DELAYED' }, { sensor: 'PARTIAL' }, { sensor: 'MISSING' }, { family: DEV_FAMILY + '_MIRRORED' }];

export function schedule() {
  const out = [];
  for (const game of GAMES) for (const tier of [1, 2, 3]) for (const seed of DEV_SEEDS) out.push({ stratum: 'DEV_NORMAL', spec: { game, tier, seed, family: DEV_FAMILY, sensor: 'NORMAL' }, arms: armsFor(game), checkPurity: seed === DEV_SEEDS[0] });
  for (const s of FACTORY_STRESS) for (const tier of [1, 2, 3]) for (const seed of DEV_SEEDS) out.push({ stratum: 'DEV_FACTORY_' + (s.sensor ?? 'MIRRORED'), spec: { game: 'factory', tier, seed, family: s.family ?? DEV_FAMILY, sensor: s.sensor ?? 'NORMAL' }, arms: NEXUS_ARMS, checkPurity: false });
  return out;
}

function summarize(rows) {
  const levels = {}, eng = { shadowIdentical: 0, shadowTotal: 0, ablationIdenticalWhenSilent: 0, ablationSilentTotal: 0, adapterIdenticalWhenSilent: 0, adapterSilentTotal: 0, replayFail: 0, invalid: [], episodes: 0 };
  const nexus = { adapter: { decisions: 0, fired: 0, changed: 0, episodesChanged: 0 }, v31: { decisions: 0, fired: 0, episodesFired: 0, episodesDivergedFromAblation: 0 }, byStratum: {}, labels: {} };
  for (const r of rows) {
    const g = r.spec.game, key = r.stratum + ':' + g + ':' + r.spec.tier;
    for (const [arm, x] of Object.entries(r.results)) {
      eng.episodes++; if (x.replay === false) eng.replayFail++; if (!x.valid) eng.invalid.push({ key, arm, status: x.status, detail: x.invalidDetail });
      const L = (levels[key] ??= {})[arm] ??= { n: 0, success: 0, catastrophic: 0, primary: [], ticks: [], latencyP50: [], invalid: 0 };
      L.n++; L.success += metricValue(x, 'success') ?? 0; L.catastrophic += x.metrics?.catastrophic ? 1 : 0; L.invalid += x.valid ? 0 : 1;
      L.primary.push(metricValue(x, METRIC_SPEC[g].primary.field)); L.ticks.push(x.ticks); L.latencyP50.push(x.latencyMs.p50);
    }
    const d = r.divergence, R = r.results;
    if (R.SHADOW_SENTINEL_READONLY) { eng.shadowTotal++; if (d['STRONGEST_NATIVE~SHADOW_SENTINEL_READONLY'] === 'IDENTICAL') eng.shadowIdentical++; }
    if (R.SENTINEL_V31_AS_IS) {
      const fired = R.SENTINEL_V31_AS_IS.nexusFired; nexus.v31.decisions += R.SENTINEL_V31_AS_IS.p0Decisions; nexus.v31.fired += fired; if (fired) nexus.v31.episodesFired++;
      if (d['SENTINEL_V31_AS_IS~V31_FALLBACK_ABLATION'] !== 'IDENTICAL') nexus.v31.episodesDivergedFromAblation++;
      if (!fired) { eng.ablationSilentTotal++; if (d['SENTINEL_V31_AS_IS~V31_FALLBACK_ABLATION'] === 'IDENTICAL') eng.ablationIdenticalWhenSilent++; }
    }
    if (R.NEXUS_REPAIR_OVER_STRONGEST_V1) {
      const a = R.NEXUS_REPAIR_OVER_STRONGEST_V1; nexus.adapter.decisions += a.p0Decisions; nexus.adapter.fired += a.nexusFired; nexus.adapter.changed += a.nexusChanged; if (a.nexusChanged) nexus.adapter.episodesChanged++;
      const s = (nexus.byStratum[r.stratum] ??= { episodes: 0, decisions: 0, fired: 0, changed: 0, v31Fired: 0 }); s.episodes++; s.decisions += a.p0Decisions; s.fired += a.nexusFired; s.changed += a.nexusChanged; s.v31Fired += R.SENTINEL_V31_AS_IS?.nexusFired ?? 0;
      if (!a.nexusChanged) { eng.adapterSilentTotal++; if (d['STRONGEST_NATIVE~NEXUS_REPAIR_OVER_STRONGEST_V1'] === 'IDENTICAL') eng.adapterIdenticalWhenSilent++; }
      for (const [k, v] of Object.entries(a.labels)) { const t = (nexus.labels[k] ??= { decisions: 0, nexusChanged: 0 }); t.decisions += v.decisions; t.nexusChanged += v.nexusChanged; }
    }
  }
  const mean = (a) => { const f = a.filter(Number.isFinite); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : null; };
  for (const lv of Object.values(levels)) for (const a of Object.values(lv)) { a.successRate = a.success / a.n; a.primaryMean = mean(a.primary); a.ticksMean = mean(a.ticks); a.latencyP50Mean = mean(a.latencyP50); delete a.primary; delete a.ticks; delete a.latencyP50; }
  return { levels, engineering: eng, nexus };
}

function comparisons(rows) {
  const out = [], normal = rows.filter((r) => r.stratum === 'DEV_NORMAL');
  for (const game of GAMES) {
    const g = normal.filter((r) => r.spec.game === game), c = (a, b, rr = g) => out.push({ scope: 'DEV_NORMAL', ...comparePaired(game, rr, a, b, { B: 4000 }) });
    c('STRONGEST_NATIVE', 'RULE_V32'); c('STRONGEST_NATIVE', 'UNIFORM_RANDOM'); c('STRONGEST_NATIVE', 'FIXED_WAIT'); c('STRONGEST_NATIVE', 'INCUMBENT_STRONG_V32');
    if (STRATEGIC_GAMES.includes(game)) { c('SENTINEL_V31_AS_IS', 'V31_FALLBACK_ABLATION'); c('SENTINEL_V31_AS_IS', 'STRONGEST_NATIVE'); }
    if (game === 'factory') { c('NEXUS_REPAIR_OVER_STRONGEST_V1', 'STRONGEST_NATIVE'); const all = rows.filter((r) => r.spec.game === 'factory'); out.push({ scope: 'DEV_FACTORY_ALL_STRATA', ...comparePaired('factory', all, 'NEXUS_REPAIR_OVER_STRONGEST_V1', 'STRONGEST_NATIVE', { B: 4000 }) }); out.push({ scope: 'DEV_FACTORY_ALL_STRATA', ...comparePaired('factory', all, 'SENTINEL_V31_AS_IS', 'V31_FALLBACK_ABLATION', { B: 4000 }) }); }
  }
  return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assertSoleWriter(); const inheritance = verifyInheritance(), closure = laneClosure();
  const plan = schedule(), rows = [], t0 = Date.now();
  for (const [i, s] of plan.entries()) {
    const r = runPaired(s.spec, s.arms, { checkPurity: s.checkPurity });
    rows.push({ stratum: s.stratum, ...r });
    process.stderr.write(`[${i + 1}/${plan.length}] ${s.stratum} ${s.spec.game} t${s.spec.tier} ${s.spec.seed.toString(16)} ${((Date.now() - t0) / 1000) | 0}s\n`);
  }
  const summary = summarize(rows), comps = comparisons(rows);
  const out = { schema: 'STAGE3H_ASCII_COMPETENCE_V1_DEV_RUN', classification: 'ENGINEERING_VALIDATION_DEVELOPMENT_FIXTURES_NOT_CONFIRMATORY', seeds: DEV_SEEDS, family: DEV_FAMILY, laneClosure: closure.hash, inheritanceHead: inheritance.head,
    wallSeconds: (Date.now() - t0) / 1000, scheduled: plan.length, completedRows: rows.length, summary, comparisons: comps,
    rows: rows.map((r) => ({ stratum: r.stratum, spec: r.spec, initialHash: r.initialHash, divergence: r.divergence, results: Object.fromEntries(Object.entries(r.results).map(([k, v]) => [k, { status: v.status, valid: v.valid, outcome: v.outcome, ticks: v.ticks, p0Decisions: v.p0Decisions, replay: v.replay, actionHash: v.actionHash, finalStateHash: v.finalStateHash, nexusFired: v.nexusFired, nexusChanged: v.nexusChanged, expertCalls: v.expertCalls, latencyMs: v.latencyMs, workPerDecision: v.workPerDecision, labels: v.labels, metrics: v.metrics }])) })),
    authority: 'R0' };
  writeExclusive(resolve(LANE, 'evidence/dev-run.json'), out);
  console.log(JSON.stringify({ rows: rows.length, wallSeconds: out.wallSeconds, engineering: { ...summary.engineering, invalid: summary.engineering.invalid.length }, nexus: summary.nexus.adapter, v31: summary.nexus.v31 }));
}
