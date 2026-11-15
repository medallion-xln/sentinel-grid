// Observer contract audit (benchmark family A, B and part of J). Read-only over the native v32 kernel.
// Checks, per (game, tier, seed): purity, frame/tick binding, entity identity, legal-action masks, illegal/stale rejection,
// deep freezing, missing/delayed sensor semantics, terminal handling, deterministic replay, and public-information leakage
// by two independent methods: (1) a recursive forbidden-field scan, and (2) counterfactual invariance - perturbing only
// privileged native fields must leave the public observation byte-identical.
import { create, packet, step, terminal, legal, observe, actor, replay, verifyReplay } from '../ascii-suite/v32/kernel.mjs';
import { hash, clone, stable } from '../ascii-suite/v3/common.mjs';
import { createArm, partnerPolicy } from './arms.mjs';

// Field names that are privileged by source contract and must never appear anywhere in a public observation.
export const FORBIDDEN_KEYS = Object.freeze(['seed', 'rng', 'sensorRng', 'deck', 'opponentMode', 'habits', 'baseWet', 'reactionBuffer', 'admission', 'config', 'strength', 'grid', 'lockedDoors']);
export function forbiddenPaths(o, path = '$', out = []) {
  // A forbidden key is a leak only when it carries a value; null/undefined/'WITHHELD' are explicit source withholding.
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (FORBIDDEN_KEYS.includes(k) && v !== null && v !== undefined && v !== 'WITHHELD') out.push(path + '.' + k); forbiddenPaths(v, path + '.' + k, out); }
  return out;
}
const isDeepFrozen = (v) => !v || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(isDeepFrozen));

// Privileged perturbations: each mutates only state the source declares hidden from the acting viewer.
export const PERTURB = Object.freeze({
  common(w) { const n = clone(w); if (typeof n.inner.rng === 'number') n.inner.rng = (n.inner.rng ^ 0x5a5a5a5a) >>> 0; if (typeof n.inner.ext?.sensorRng === 'number') n.inner.ext.sensorRng = (n.inner.ext.sensorRng ^ 0x0f0f0f0f) >>> 0; n.inner.seed = (n.inner.seed ^ 1) >>> 0; return { world: n, fields: ['inner.rng', 'inner.ext.sensorRng', 'inner.seed'] }; },
  pong(w) { const n = clone(w); n.inner.ball.spin = (n.inner.ball.spin ?? 0) + 0.013; return { world: n, fields: ['inner.ball.spin'] }; },
  platformer(w) { const n = clone(w); for (const z of n.inner.wind ?? []) z.strength = z.strength * 2 + 0.05; return { world: n, fields: ['inner.wind[].strength'] }; },
  fighter(w) { const n = clone(w); n.inner.opponentMode = n.inner.opponentMode === 'DEFENSIVE' ? 'AGGRESSIVE' : 'DEFENSIVE'; if (Array.isArray(n.inner.ext.styles)) n.inner.ext.styles = [...n.inner.ext.styles].reverse(); return { world: n, fields: ['inner.opponentMode', 'inner.ext.styles'] }; },
  racing() { return null; }, // wet corners are publicly visible by design; only common hidden RNG/seed are perturbed
  rescue(w, o) { const n = clone(w), seen = new Set([...(o?.civilians ?? []), ...(o?.enemies ?? [])].map((e) => e.id)); let k = 0;
    for (const c of n.inner.civilians) if (!seen.has(c.id)) { c.deadline += 17; k++; }
    for (const e of n.inner.enemies) if (!seen.has(e.id)) { e.containedUntil = (e.containedUntil ?? -1) - 3; k++; }
    return k ? { world: n, fields: ['unseen civilians[].deadline', 'unseen enemies[].containedUntil'] } : null; },
  cards(w) { const n = clone(w), me = actor(w), i = Number(String(me).slice(1)), h = n.inner.hands[i];
    if (h?.length >= 2) { const a = h[0]; h[0] = h[1]; h[1] = a; }
    n.inner.deck = [...n.inner.deck].reverse(); return { world: n, fields: ['inner.hands[actor] identities', 'inner.deck order'] }; },
  factory() { return null; }, // fully public management game: no hidden world state beyond common RNG/seed
  roguelike(w, o) { const n = clone(w), seen = new Set([...(o?.traps ?? []), ...(o?.enemies ?? [])].map((e) => e.id)); let k = 0;
    for (const t of n.inner.traps) if (!seen.has(t.id)) { t.kind = t.kind === 'SPIKES' ? 'POISON' : 'SPIKES'; k++; }
    for (const e of n.inner.enemies) if (!seen.has(e.id) && e.health > 0) { e.health += 7; k++; }
    return k ? { world: n, fields: ['unseen traps[].kind', 'unseen enemies[].health'] } : null; },
});

/** Audit one (game, tier, seed): steps a frozen strongest-native trajectory and checks the contract at sampled ticks. */
export function auditObserver(game, tier, seed, family, { steps = 120, sampleEvery = 10 } = {}) {
  const checks = {}, fail = (k, detail) => { checks[k] = { pass: false, detail }; }, pass = (k) => { checks[k] ??= { pass: true }; };
  let w = create(game, seed, tier, { family });
  const w2 = create(game, seed, tier, { family });
  hash(w) === hash(w2) ? pass('sameSeedSameWorld') : fail('sameSeedSameWorld');
  const other = create(game, (seed + 1) >>> 0, tier, { family });
  hash(other.inner) !== hash(w.inner) ? pass('differentSeedDifferentWorld') : fail('differentSeedDifferentWorld');
  const pol = createArm('STRONGEST_NATIVE', game), partners = {}, acts = [];
  let leakScans = 0, invariances = 0, invarianceSkips = 0;
  for (let i = 0; i < steps && !terminal(w); i++) {
    const h0 = hash(w), p = packet(w), o = observe(w), l = legal(w);
    hash(w) === h0 ? pass('observationIsPure') : fail('observationIsPure', { tick: w.inner.tick });
    p.binding.tick === w.inner.tick ? pass('frameTickBinding') : fail('frameTickBinding', { tick: w.inner.tick });
    p.binding.observationHash === hash(p.observation) && p.binding.actionsHash === hash(p.actions) ? pass('bindingHashes') : fail('bindingHashes', { tick: w.inner.tick });
    p.binding.actor === actor(w) ? pass('entityIdentityActor') : fail('entityIdentityActor', { tick: w.inner.tick });
    stable(p.actions) === stable(l) ? pass('legalMaskMatchesNative') : fail('legalMaskMatchesNative', { tick: w.inner.tick });
    new Set(p.actions.map((a) => a.id)).size === p.actions.length ? pass('actionIdsUnique') : fail('actionIdsUnique', { tick: w.inner.tick });
    isDeepFrozen(p) ? pass('packetDeepFrozen') : fail('packetDeepFrozen', { tick: w.inner.tick });
    const fp = forbiddenPaths(o); leakScans++; fp.length ? fail('noForbiddenFields', { tick: w.inner.tick, paths: fp.slice(0, 5) }) : pass('noForbiddenFields');
    if (i % sampleEvery === 0) {
      try { step(w, p, { id: 'NOT_OFFERED', type: 'NOT_OFFERED', parameters: {} }); fail('illegalActionRejected'); } catch (e) { e.message === 'ILLEGAL_ACTION' ? pass('illegalActionRejected') : fail('illegalActionRejected', e.message); }
      for (const perturb of [PERTURB.common, PERTURB[game]]) {
        const r = perturb(w, o); if (!r) { invarianceSkips++; continue; }
        invariances++;
        hash(observe(r.world, actor(w))) === hash(o) ? pass('privilegedPerturbationInvariant') : fail('privilegedPerturbationInvariant', { tick: w.inner.tick, fields: r.fields });
      }
    }
    const idx = game === 'cards' ? w.inner.turn : 0;
    const dec = idx === 0 ? pol : (partners[idx] ??= partnerPolicy(game, idx, w.inner.ext.partnerStyle));
    const d = dec.decide(p); acts.push(d.action);
    const next = step(w, p, d.action);
    next.inner.tick === w.inner.tick + 1 || terminal(next) ? pass('tickAdvancesByOne') : fail('tickAdvancesByOne', { from: w.inner.tick, to: next.inner.tick });
    try { step(next, p, d.action); terminal(next) ? pass('stalePacketRejected') : fail('stalePacketRejected', { tick: next.inner.tick }); } catch (e) { e.message === 'STALE_PACKET' || e.message === 'ILLEGAL_ACTION' ? pass('stalePacketRejected') : fail('stalePacketRejected', e.message); }
    w = next;
  }
  if (terminal(w)) { legal(w).length === 0 && packet(w).actions.length === 0 ? pass('terminalOffersNoActions') : fail('terminalOffersNoActions'); }
  else checks.terminalOffersNoActions = { pass: null, detail: 'NOT_REACHED_WITHIN_AUDIT_STEPS' };
  try { verifyReplay(replay({ game, seed, tier, family, sensor: 'NORMAL' }, acts)) && pass('deterministicReplay'); } catch (e) { fail('deterministicReplay', e.message); }
  // Sensor semantics on a fresh world: DELAYED age 2 after warm-up; MISSING drops observation (tick%4==1) but keeps fresh actions.
  // DELAYED adds exactly two ticks of age to the NORMAL packet age (fighter's NORMAL age already includes its native equal reaction latency).
  let d = create(game, seed, tier, { family, sensor: 'DELAYED' }), n = create(game, seed, tier, { family }), m = create(game, seed, tier, { family, sensor: 'MISSING' }); const wp = createArm('FIXED_WAIT', game);
  for (let i = 0; i < 12 && !terminal(d) && !terminal(m) && !terminal(n); i++) { const pd = packet(d), pn = packet(n), pm = packet(m); d = step(d, pd, wp.decide(pd).action); n = step(n, pn, wp.decide(pn).action); m = step(m, pm, wp.decide(pm).action); }
  const pd = packet(d), pn = packet(n); terminal(d) || pd.sensor.age === pn.sensor.age + 2 ? pass('delayedSensorAddsTwoTicks') : fail('delayedSensorAddsTwoTicks', { delayed: pd.sensor.age, normal: pn.sensor.age });
  let sawMissing = false;
  for (let i = 0; i < 6 && !terminal(m); i++) { const pm = packet(m); if (pm.sensor.missing) { sawMissing = true; pm.observation === null && pm.actions.length > 0 && stable(pm.actions) === stable(legal(m)) ? pass('missingSensorDropsObservationKeepsActions') : fail('missingSensorDropsObservationKeepsActions'); } m = step(m, pm, wp.decide(pm).action); }
  if (!sawMissing) checks.missingSensorDropsObservationKeepsActions = { pass: null, detail: 'NO_MISSING_TICK_REACHED' };
  const failed = Object.entries(checks).filter(([, c]) => c.pass === false).map(([k]) => k);
  return { game, tier, seed, family, stepsAudited: acts.length, leakScans, invariances, invarianceSkips, checks, failed, pass: failed.length === 0 };
}
