#!/usr/bin/env node
// Merges results/eval-<game>.json, scores the pre-registered hypotheses exactly as written, classifies capability from logged
// evidence, and writes results/ascii-worlds-2-results.json + results/ASCII_WORLDS_2_REPORT.md. Diagnostic only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const R = new URL('../results/', import.meta.url), regText = readFileSync(new URL('./preregistration.json', import.meta.url), 'utf8'), reg = JSON.parse(regText);
const regHash = createHash('sha256').update(regText).digest('hex');
const GAMES = ['pong', 'platformer', 'fighter', 'racing'], data = {};
for (const g of GAMES) { const f = new URL(`eval-${g}.json`, R); if (existsSync(f)) data[g] = JSON.parse(readFileSync(f, 'utf8')); }
for (const [g, d] of Object.entries(data)) if (d.preregistrationSha256 !== regHash) throw Error(`${g}: results were produced under a different pre-registration`);

const mean = a => { const v = a.filter(x => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r3 = v => v === null || v === undefined ? null : Math.round(v * 1000) / 1000;
const success = e => e.game === 'racing' ? e.result === 'FINISH_PLACE_1' : e.result === 'WIN';
const PRIMARY = {
  pong: ['returnRate', 'scoreDifference', 'meanContactOffset', 'travelRatio', 'opponentPointShareFirstHalf', 'opponentPointShareSecondHalf'],
  platformer: ['progress', 'deaths', 'progressPerLife', 'jumpTimingError', 'headBumps'],
  fighter: ['damageEfficiency', 'whiffRate', 'punishRate', 'blockEffectiveness', 'jumpOvers', 'jumpOverHits', 'hitsFromBehind', 'longRangeBlockTicks'],
  racing: ['placement', 'meanLapTicks', 'offTrackTicks', 'barrierHits', 'carContacts', 'overtakes', 'cornerEfficiency', 'finishSpreadTicks', 'winnerTicks'],
};
const CTRL = ['interceptAbsError', 'calibrationCoverage1Sigma', 'calibrationCoverage2Sigma', 'crossCategoryTieRate', 'qTieRate', 'uniqueRetryStrategies', 'oneStepShapedRewardRegretProxy', 'decisionLatencyMeanMs', 'decisionLatencyP95Ms', 'branchesMean', 'planningHorizonMax', 'actionLegalityRate'];
function agg(eps) {
  if (!eps.length) return null;
  const g = eps[0].game, out = { n: eps.length, censored: eps.filter(e => e.result === 'CENSORED_BY_EVALUATION_BUDGET').length, SUCCESS_RATE: r3(eps.filter(success).length / eps.length),
    REWARD: r3(mean(eps.map(e => e.totalReward))), REGRET_ONE_STEP_PROXY: r3(mean(eps.map(e => e.controllerMetrics.oneStepShapedRewardRegretProxy))),
    DECISION_LATENCY_MS: r3(mean(eps.map(e => e.controllerMetrics.decisionLatencyMeanMs))), DECISION_LATENCY_P95_MS: r3(mean(eps.map(e => e.controllerMetrics.decisionLatencyP95Ms))),
    REPEATED_FAILURE_RATE: r3(mean(eps.map(e => e.metrics.repeatedFailureRate))),
    terminalBehavior: [...new Set(eps.map(e => e.controllerMetrics.terminalBehavior))].join('/'), actionLegalityMin: r3(Math.min(...eps.map(e => e.controllerMetrics.actionLegalityRate ?? 1))) };
  for (const k of PRIMARY[g]) out[k] = r3(mean(eps.map(e => e.metrics[k])));
  for (const k of CTRL) out[k] = r3(mean(eps.map(e => e.controllerMetrics[k])));
  const triggers = {}; for (const e of eps) for (const [k, v] of Object.entries(e.controllerMetrics.adaptationTriggers)) triggers[k] = (triggers[k] ?? 0) + v; out.triggers = triggers;
  return out;
}
const pick = (eps, f) => eps.filter(e => Object.entries(f).every(([k, v]) => e[k] === v));

// ---------- main held-out tables ----------
const tables = {};
for (const [g, d] of Object.entries(data)) {
  tables[g] = {};
  const controllers = [...new Set(d.episodes.map(e => e.controller))];
  for (const c of controllers) for (const t of reg.difficultyTiers[g]) {
    const eps = pick(d.episodes, { controller: c, difficulty: t }); if (!eps.length) continue;
    tables[g][`${c}|${t}`] = agg(eps);
    if (g === 'fighter') for (const st of reg.fighterArchetypes) tables[g][`${c}|${t}|${st}`] = agg(pick(eps, { style: st }));
  }
}
const cell = (g, c, t, st) => tables[g]?.[`${c}|${t}${st ? '|' + st : ''}`] ?? null;

// ---------- Phase 5 ----------
const PRIMARY_ONE = { pong: ['scoreDifference', 1], platformer: ['progress', 1], fighter: ['damageEfficiency', 1], racing: ['placement', -1] };
const phase5 = {};
for (const [g, d] of Object.entries(data)) {
  phase5[g] = {};
  const [metric, sign] = PRIMARY_ONE[g];
  for (const c of [...new Set(d.phase5.map(e => e.controller))]) {
    const eps = d.phase5.filter(e => e.controller === c), first = agg(pick(eps, { condition: 'FIRST_ENCOUNTER' }));
    const rows = {};
    for (const cond of ['FIRST_ENCOUNTER', 'REPEATED_SIMILAR_ATTEMPT_1', 'REPEATED_SIMILAR_ATTEMPT_2', 'CHANGED_INITIAL_STATE', 'CHANGED_OPPONENT', 'UNSEEN_SEED', 'INCREASED_DIFFICULTY', 'DELAYED_OBSERVATION']) {
      const a = agg(pick(eps, { condition: cond })); if (!a) continue;
      rows[cond] = { n: a.n, SUCCESS_RATE: a.SUCCESS_RATE, [metric]: a[metric], deltaVsFirst: r3((a[metric] - first[metric]) * sign), triggers: a.triggers, REPEATED_FAILURE_RATE: a.REPEATED_FAILURE_RATE };
    }
    const a1 = pick(eps, { condition: 'REPEATED_SIMILAR_ATTEMPT_1' }), a2 = pick(eps, { condition: 'REPEATED_SIMILAR_ATTEMPT_2' });
    const identical = a1.filter((e, i) => a2[i] && e.actionSequenceHash === a2[i].actionSequenceHash).length;
    rows.REPEATED_SIMILAR = { identicalReplays: `${identical}/${a1.length}`, interpretation: identical === a1.length ? 'DETERMINISTIC_REPETITION (identical action sequences; not learning)' : 'behaviour changed on the second attempt using carried explicit memory',
      improvement: r3((mean(a2.map(e => e.metrics[metric])) - mean(a1.map(e => e.metrics[metric]))) * sign) };
    phase5[g][c] = rows;
  }
}

// ---------- evidence-based capability classification ----------
const WITHIN = ['RESIDUAL_MODEL_UPDATE', 'OPPONENT_MODEL_SHIFT', 'GRIP_ESTIMATE_UPDATE'], CROSS = ['FAILURE_RETRY', 'REPEATED_FAILURE_DETECTED', 'STAGNATION_REPLAN', 'CORNER_MEMORY_SLOWER'];
const capability = {};
for (const [g, d] of Object.entries(data)) {
  capability[g] = {};
  for (const c of [...new Set(d.episodes.map(e => e.controller))]) {
    const eps = [...d.episodes, ...d.phase5].filter(e => e.controller === c), trig = new Set(eps.flatMap(e => Object.keys(e.controllerMetrics.adaptationTriggers)));
    const horizon = Math.max(...eps.map(e => e.controllerMetrics.planningHorizonMax ?? 0)), declared = eps[0].capability, rep = phase5[g][c]?.REPEATED_SIMILAR;
    const classes = [horizon > 0 ? 'DETERMINISTIC_PLANNING' : 'REACTIVE_CONTROL'];
    if (WITHIN.some(t => trig.has(t))) classes.push('WITHIN_EPISODE_ADAPTATION');
    if (CROSS.some(t => trig.has(t))) classes.push('CROSS_ATTEMPT_ADAPTATION');
    capability[g][c] = { declared, evidenced: classes, LEARNED_POLICY_ADAPTATION: 'NOT_PRESENT (no weight updates in any controller)', access: eps[0].access, triggersObserved: [...trig],
      repeatedScenario: rep?.interpretation ?? 'NOT_RUN', note: declared && !classes.includes(declared) ? `declared ${declared} is not supported by logged evidence` : null };
  }
}

// ---------- pre-registered hypotheses (criteria exactly as registered) ----------
const H = [], verdict = (id, pass, values) => H.push({ id, claim: reg.hypotheses.find(h => h.id === id).claim, success: reg.hypotheses.find(h => h.id === id).success, outcome: pass === null ? 'NOT_EVALUABLE' : pass ? 'SUPPORTED' : 'NOT_SUPPORTED', values });
if (data.platformer) {
  const S = cell('platformer', 'SENTINEL', 5), N = cell('platformer', 'SENTINEL_NO_MEMORY', 5), S3 = cell('platformer', 'SENTINEL', 3), RB = cell('platformer', 'RULE_BASELINE', 3), I3 = cell('platformer', 'INCUMBENT_ROOT_PUCT', 3);
  verdict('H-PLAT-1', S.REPEATED_FAILURE_RATE <= .2 && S.SUCCESS_RATE >= N.SUCCESS_RATE + .3, { sentinelRepeatedFailureRate: S.REPEATED_FAILURE_RATE, sentinelCompletion: S.SUCCESS_RATE, noMemoryCompletion: N.SUCCESS_RATE });
  verdict('H-PLAT-2', S3.SUCCESS_RATE >= Math.max(RB.SUCCESS_RATE, I3.SUCCESS_RATE) + .3, { sentinel: S3.SUCCESS_RATE, rule: RB.SUCCESS_RATE, incumbent: I3.SUCCESS_RATE });
}
if (data.pong) {
  const d = b => r3(cell('pong', 'SENTINEL_FILTER_ONLY', b).returnRate - cell('pong', 'ANALYTIC_INTERCEPT', b).returnRate);
  verdict('H-PONG-1', d(4) >= .1 && d(5) >= .1 && Math.abs(d(1)) <= .03 && Math.abs(d(2)) <= .03, { returnRateDifferenceByBand: Object.fromEntries([1, 2, 3, 4, 5].map(b => [b, d(b)])) });
  const sd = r3(cell('pong', 'SENTINEL', 5).scoreDifference - cell('pong', 'SENTINEL_FILTER_ONLY', 5).scoreDifference);
  verdict('H-PONG-2', sd >= .5, { scoreDifferenceGain: sd });
  const c1 = mean([3, 4, 5].map(b => cell('pong', 'SENTINEL_FILTER_ONLY', b).calibrationCoverage1Sigma)), c2 = mean([3, 4, 5].map(b => cell('pong', 'SENTINEL_FILTER_ONLY', b).calibrationCoverage2Sigma));
  verdict('H-PONG-3', c2 >= .85 && c2 <= .99 && c1 >= .55 && c1 <= .85, { coverage1Sigma: r3(c1), coverage2Sigma: r3(c2) });
}
if (data.fighter) {
  const S = cell('fighter', 'SENTINEL', 5), RB = cell('fighter', 'RULE_BASELINE', 5);
  const per = Object.fromEntries(reg.fighterArchetypes.map(st => [st, { sentinel: cell('fighter', 'SENTINEL', 5, st).damageEfficiency, rule: cell('fighter', 'RULE_BASELINE', 5, st).damageEfficiency }]));
  verdict('H-FIGHT-1', S.SUCCESS_RATE >= RB.SUCCESS_RATE + .2 && Object.values(per).every(p => p.sentinel > p.rule), { sentinelWin: S.SUCCESS_RATE, ruleWin: RB.SUCCESS_RATE, damageEfficiencyByArchetype: per });
  const S3 = cell('fighter', 'SENTINEL', 3), I3 = cell('fighter', 'INCUMBENT_ROOT_PUCT', 3);
  verdict('H-FIGHT-2', S3.crossCategoryTieRate <= .05 && I3.crossCategoryTieRate >= .5, { sentinel: S3.crossCategoryTieRate, incumbent: I3.crossCategoryTieRate });
  const delayed = phase5.fighter.SENTINEL?.DELAYED_OBSERVATION;
  verdict('H-FIGHT-3', delayed ? delayed.SUCCESS_RATE >= .5 : null, { delayedObservationWinRate: delayed?.SUCCESS_RATE ?? null, firstEncounterWinRate: phase5.fighter.SENTINEL?.FIRST_ENCOUNTER?.SUCCESS_RATE ?? null });
}
if (data.racing) {
  const rb = pick(data.racing.episodes, { controller: 'RULE_BASED', difficulty: 3 }), spread = mean(rb.map(e => e.metrics.finishSpreadTicks / e.metrics.winnerTicks)), RB3 = cell('racing', 'RULE_BASED', 3);
  verdict('H-RACE-1', spread <= .1 && RB3.SUCCESS_RATE >= .1 && RB3.SUCCESS_RATE <= .6, { meanFinishSpreadFraction: r3(spread), ruleBasedWinShare: RB3.SUCCESS_RATE });
  const t = [3, 5].map(x => ({ tier: x, sentinelPlacement: cell('racing', 'SENTINEL', x).placement, rulePlacement: cell('racing', 'RULE_BASED', x).placement, sentinelOff: cell('racing', 'SENTINEL', x).offTrackTicks, ruleOff: cell('racing', 'RULE_BASED', x).offTrackTicks }));
  verdict('H-RACE-2', t.every(r => r.sentinelPlacement <= r.rulePlacement - .3 && r.sentinelOff <= r.ruleOff), { tiers: t });
  const S5 = cell('racing', 'SENTINEL', 5), N5 = cell('racing', 'SENTINEL_NO_MEMORY', 5);
  verdict('H-RACE-3', S5.offTrackTicks < N5.offTrackTicks, { sentinelOffTrack: S5.offTrackTicks, noMemoryOffTrack: N5.offTrackTicks });
}

const out = { schema: 'ASCII_WORLDS_2_RESULTS_V1', status: 'DIAGNOSTIC', certificate: null, authority: 'R0_LOCAL_SIM_ONLY', stage3hCompetenceClaim: 'NONE',
  preregistrationSha256: regHash, sourceClosureHash: Object.values(data)[0]?.provenance.sourceClosureHash ?? null, runtimeSeconds: Object.fromEntries(Object.entries(data).map(([g, d]) => [g, d.runtimeSeconds])),
  heldOutSeeds: reg.heldOutSeeds, tables, phase5, capability, hypotheses: H };
writeFileSync(new URL('ascii-worlds-2-results.json', R), JSON.stringify(out, null, 2));

// ---------- markdown ----------
const fmt = v => v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v);
const tableMd = (g, cols) => {
  const keys = Object.keys(tables[g]).filter(k => k.split('|').length === 2);
  return [`| controller | tier | n | ${cols.join(' | ')} |`, `|---|---|---|${cols.map(() => '---').join('|')}|`,
    ...keys.map(k => { const [c, t] = k.split('|'), a = tables[g][k]; return `| ${c} | ${t} | ${a.n}${a.censored ? ` (${a.censored} censored)` : ''} | ${cols.map(x => fmt(a[x])).join(' | ')} |`; })].join('\n');
};
const md = [`# ASCII Worlds 2.0 — held-out evaluation (diagnostic)`, '',
  `Pre-registration sha256 \`${regHash}\`. Source closure \`${out.sourceClosureHash}\`. Held-out seeds ${reg.heldOutSeeds[0]}–${reg.heldOutSeeds.at(-1)} (incumbent: ${reg.incumbentHeldOutSeeds.join(', ')}). Status DIAGNOSTIC, authority R0, certificate none. Not a Stage 3H result.`, '',
  '## Pre-registered hypotheses', '', '| id | outcome | criterion | values |', '|---|---|---|---|',
  ...H.map(h => `| ${h.id} | **${h.outcome}** | ${h.success} | \`${JSON.stringify(h.values)}\` |`), '',
  ...Object.keys(tables).flatMap(g => [`## ${g}`, '', tableMd(g, ['SUCCESS_RATE', 'REWARD', 'REGRET_ONE_STEP_PROXY', 'DECISION_LATENCY_MS', 'REPEATED_FAILURE_RATE', ...PRIMARY[g].slice(0, 5),
    ...(g === 'pong' ? ['interceptAbsError', 'calibrationCoverage1Sigma', 'calibrationCoverage2Sigma'] : g === 'fighter' ? ['crossCategoryTieRate'] : g === 'platformer' ? ['uniqueRetryStrategies'] : [])]), '',
    ...(g === 'fighter' ? ['### Opponent robustness (win rate by archetype)', '', '| controller | tier | ' + reg.fighterArchetypes.join(' | ') + ' |', '|---|---|' + reg.fighterArchetypes.map(() => '---').join('|') + '|',
      ...[...new Set(data.fighter.episodes.map(e => e.controller))].flatMap(c => reg.difficultyTiers.fighter.map(t => `| ${c} | ${t} | ${reg.fighterArchetypes.map(st => fmt(cell('fighter', c, t, st)?.SUCCESS_RATE)).join(' | ')} |`)), ''] : []),
    `### Phase 5 adaptation (${PRIMARY_ONE[g][0]}, delta vs first encounter; positive = better)`, '',
    '| controller | condition | n | success | primary | delta | triggers |', '|---|---|---|---|---|---|---|',
    ...Object.entries(phase5[g]).flatMap(([c, rows]) => Object.entries(rows).filter(([k]) => k !== 'REPEATED_SIMILAR').map(([k, r]) => `| ${c} | ${k} | ${r.n} | ${fmt(r.SUCCESS_RATE)} | ${fmt(r[PRIMARY_ONE[g][0]])} | ${fmt(r.deltaVsFirst)} | ${Object.entries(r.triggers).map(([a, b]) => a + ':' + b).join(' ') || '—'} |`)), '',
    ...Object.entries(phase5[g]).map(([c, rows]) => `- ${c} repeated scenario: ${rows.REPEATED_SIMILAR.identicalReplays} identical replays — ${rows.REPEATED_SIMILAR.interpretation}; improvement ${fmt(rows.REPEATED_SIMILAR.improvement)}`), '',
    '### Capability classification (from logged evidence)', '', '| controller | access | declared | evidenced | note |', '|---|---|---|---|---|',
    ...Object.entries(capability[g]).map(([c, v]) => `| ${c} | ${v.access} | ${v.declared} | ${v.evidenced.join(', ')} | ${v.note ?? ''} |`), '']),
].join('\n');
writeFileSync(new URL('ASCII_WORLDS_2_REPORT.md', R), md);
console.log(JSON.stringify(H.map(h => ({ id: h.id, outcome: h.outcome, values: h.values })), null, 1));
