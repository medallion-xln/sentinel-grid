// Isolated paired-episode harness. Evaluator owner: seeds, native state, replays and outcomes never enter inference.
// Mirrors ascii-suite/v32/runner.mjs#episode (same world construction, partner policies, round re-creation and
// stepping) so that the STRONG arm reproduces the v32 runner exactly (tested), and adds:
//  - deterministic invalid-case accounting (no substitution of an illegal or failed decision),
//  - optional per-step purity checks (observation and decision must not change native state),
//  - public, source-grounded decision labels (observable regime and observable time remaining),
//  - expert-call, action-change and compute accounting per arm.
import { create, packet, step, terminal, metrics, verifyReplay, observe } from '../ascii-suite/v32/kernel.mjs';
import { hash } from '../ascii-suite/v3/common.mjs';
import { createArm, partnerPolicy } from './arms.mjs';

export const INVALID = Object.freeze(['INVALID_ILLEGAL_ACTION', 'INVALID_POLICY_EXCEPTION', 'INVALID_STATE_MUTATION', 'INVALID_REPLAY', 'INVALID_NULL_ACTION']);
export const STATUSES = Object.freeze(['COMPLETED', 'INCOMPLETE_DECISION_BUDGET', ...INVALID]);

// Observable regime labels. Every label reads only a public observation field (cited by name). null = NOT_DEFINED.
export const REGIME_RULES = Object.freeze({
  pong: null, // single noisy ball position; no source-declared regime field
  platformer: { field: 'enemies', label: (o) => (o.enemies?.length ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT') },
  fighter: { field: 'opponent.phase', label: (o) => (['startup', 'active'].includes(o.opponent?.phase) ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT') },
  racing: { field: 'weather', label: (o) => (o.weather && o.weather !== 'DRY' ? 'OBSERVED_WET' : 'OBSERVED_DRY') },
  rescue: { field: 'enemies', label: (o) => (o.enemies?.length ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT') },
  cards: { field: 'clues', label: (o) => (o.clues === 0 ? 'NO_CLUES' : 'CLUES_AVAILABLE') },
  factory: { field: 'nodes[].broken', label: (o) => (o.nodes?.some((n) => n.broken) ? 'OBSERVED_DISRUPTION' : 'NO_OBSERVED_DISRUPTION') },
  roguelike: { field: 'enemies,traps', label: (o) => ((o.enemies?.length || o.traps?.length) ? 'OBSERVED_THREAT' : 'NO_OBSERVED_THREAT') },
});
// Observable time remaining (a public temporal label, not a planning horizon). Bands are fixed fractions of the
// public remaining budget at the first decision of the episode. null = NOT_DEFINED for that game.
export const TIME_RULES = Object.freeze({
  pong: null, platformer: null, racing: null,
  fighter: { field: 'timeLeft', value: (o) => o.timeLeft },
  rescue: { field: 'ticksRemaining', value: (o) => o.ticksRemaining },
  cards: { field: 'deckRemaining', value: (o) => o.deckRemaining },
  factory: { field: 'ticksRemaining', value: (o) => o.ticksRemaining },
  roguelike: { field: 'ticksRemaining', value: (o) => o.ticksRemaining },
});
const band = (v, v0) => (!Number.isFinite(v) || !Number.isFinite(v0) || v0 <= 0 ? 'UNDEFINED' : v / v0 > 2 / 3 ? 'EARLY' : v / v0 > 1 / 3 ? 'MIDDLE' : 'LATE');

const quant = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : null);

/** Run one isolated episode of `arm`. The world is constructed from the spec alone; nothing is shared across arms. */
export function runEpisode(spec, { decisionLimit = 6000, checkPurity = false, verify = true, keepActions = false, armFactory = createArm } = {}) {
  const initial = { game: spec.game, tier: spec.tier, seed: spec.seed, family: spec.family, sensor: spec.sensor ?? 'NORMAL' };
  let w = create(initial.game, initial.seed, initial.tier, { family: initial.family, sensor: initial.sensor });
  const initialHash = hash(w);
  const players = spec.game === 'cards' ? w.inner.players : 1;
  const make = () => Array.from({ length: players }, (_, i) => (i === 0 ? armFactory(spec.arm, spec.game, { seed: 74123, partnerStyle: null }) : partnerPolicy(spec.game, i, w.inner.ext.partnerStyle)));
  let policies = make(), round = 1, status = null, invalidDetail = null;
  const actions = [], ids = [], latencies = [], labels = {}, sources = {};
  let expertCalls = 0, nexusFired = 0, nexusChanged = 0, work = 0, p0Decisions = 0, abstentions = 0, t0 = null;
  while (!terminal(w) && actions.length < decisionLimit) {
    if (w.inner.ext.round !== round) { round = w.inner.ext.round; policies = make(); }
    const before = checkPurity ? hash(w) : null;
    const p = packet(w), index = spec.game === 'cards' ? w.inner.turn : 0;
    let d;
    try { d = policies[index].decide(p); } catch (e) { status = 'INVALID_POLICY_EXCEPTION'; invalidDetail = { tick: w.inner.tick, error: String(e.message).slice(0, 200) }; break; }
    if (checkPurity && hash(w) !== before) { status = 'INVALID_STATE_MUTATION'; invalidDetail = { tick: w.inner.tick }; break; }
    if (!d || !d.action) { status = 'INVALID_NULL_ACTION'; invalidDetail = { tick: w.inner.tick }; break; }
    if (!p.actions.some((a) => a.id === d.action.id && a.type === d.action.type)) { status = 'INVALID_ILLEGAL_ACTION'; invalidDetail = { tick: w.inner.tick, proposed: d.action.id }; break; }
    if (index === 0) {
      p0Decisions++; latencies.push(d.armLatencyMs ?? 0); expertCalls += d.expertCalls ?? 0; work += d.work ?? 0; abstentions += d.abstain ? 1 : 0;
      if (d.nexusFired) nexusFired++; if (d.nexusChanged) nexusChanged++;
      sources[d.actionSource ?? 'UNSPECIFIED'] = (sources[d.actionSource ?? 'UNSPECIFIED'] ?? 0) + 1;
      if (p.observation) {
        const rr = REGIME_RULES[spec.game], tr = TIME_RULES[spec.game];
        const v = tr ? tr.value(p.observation) : null; if (t0 === null && Number.isFinite(v)) t0 = v;
        const key = (rr ? rr.label(p.observation) : 'REGIME_NOT_DEFINED') + '|' + (tr ? band(v, t0) : 'TIME_NOT_DEFINED');
        labels[key] ??= { decisions: 0, nexusChanged: 0 }; labels[key].decisions++; if (d.nexusChanged) labels[key].nexusChanged++;
      } else { labels['OBSERVATION_MISSING'] ??= { decisions: 0, nexusChanged: 0 }; labels['OBSERVATION_MISSING'].decisions++; }
    }
    actions.push(d.action); ids.push(d.action.id);
    w = step(w, p, d.action);
  }
  if (!status) status = terminal(w) ? 'COMPLETED' : 'INCOMPLETE_DECISION_BUDGET';
  const m = metrics(w);
  let replay = { pass: null };
  if (verify && !INVALID.includes(status)) {
    try {
      const hashes = [];
      let r = create(initial.game, initial.seed, initial.tier, { family: initial.family, sensor: initial.sensor }); hashes.push(hash(r.inner));
      for (const a of actions) { r = step(r, packet(r), a); hashes.push(hash(r.inner)); }
      replay = verifyReplay({ schema: 'V32_EVALUATOR_ONLY_REPLAY_V1', initial, actions, hashes, final: metrics(r) });
      if (hash(r.inner) !== hash(w.inner)) throw Error('FINAL_STATE_DIVERGED');
    } catch (e) { status = 'INVALID_REPLAY'; invalidDetail = { error: String(e.message) }; replay = { pass: false }; }
  }
  return {
    spec: { ...spec, sensor: initial.sensor }, status, invalidDetail, valid: !INVALID.includes(status),
    outcome: w.inner.result, ticks: w.inner.tick, decisions: actions.length, p0Decisions, metrics: m,
    initialHash, actionHash: hash(ids), finalStateHash: hash(w.inner), replay: replay.pass,
    latencyMs: { p50: quant(latencies, 0.5), p95: quant(latencies, 0.95), max: latencies.length ? Math.max(...latencies) : null, total: latencies.reduce((a, b) => a + b, 0) },
    workPerDecision: p0Decisions ? work / p0Decisions : 0, expertCalls, nexusFired, nexusChanged, abstentions, actionSources: sources, labels,
    actions: keepActions ? ids : undefined,
  };
}

/** Paired evaluation: every arm plays the identical world spec independently. Returns per-arm results and first divergence. */
export function runPaired(spec, arms, options = {}) {
  const results = Object.fromEntries(arms.map((arm) => [arm, runEpisode({ ...spec, arm }, { ...options, keepActions: true })]));
  const initial = new Set(Object.values(results).map((r) => r.initialHash));
  if (initial.size !== 1) throw Error('PAIRED_INITIAL_STATE_MISMATCH');
  const divergence = {};
  for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
    const a = results[arms[i]].actions, b = results[arms[j]].actions; let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
    divergence[arms[i] + '~' + arms[j]] = k === a.length && k === b.length ? 'IDENTICAL' : k;
  }
  for (const r of Object.values(results)) { r.actionCount = r.actions.length; delete r.actions; }
  return { spec, initialHash: [...initial][0], results, divergence };
}

/** Observation latency (packet construction only), measured over a fixed number of steps of a fixed policy. */
export function observationLatency(game, tier, seed, family, steps = 50) {
  let w = create(game, seed, tier, { family }); const pol = createArm('FIXED_WAIT', game), times = [];
  for (let i = 0; i < steps && !terminal(w); i++) { const t = performance.now(), p = packet(w); times.push(performance.now() - t); const d = pol.decide(p); w = step(w, p, d.action); }
  return { p50: quant(times, 0.5), p95: quant(times, 0.95), n: times.length };
}
export { observe };
