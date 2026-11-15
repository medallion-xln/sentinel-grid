// Phase A4 — shared-infrastructure checks across all eight games: tick counter, state cloning/purity, packet immutability,
// seeding/determinism, terminal handling, sensor contracts, cross-player isolation (Cards). Read-only; writes one evidence file.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { create, packet, step, terminal, legal, observe } from '../ascii-suite/v32/kernel.mjs';
import { LEVELS } from '../ascii-suite/v32/catalog.mjs';
import { hash } from '../ascii-suite/v3/common.mjs';
import { createPolicyV331 } from './policy-v33_1.mjs';
import { FRESH_DEV, FAMILY } from './population.mjs';
import { LANE, writeExclusive, sourceClosure } from './guard.mjs';
export function checks() {
  const out = [];
  for (const L of LEVELS) {
    const seed = FRESH_DEV[0], c = { level: L.id };
    try { levelChecks(L, seed, c); } catch (e) { c.probeException = { message: e.message, stack: String(e.stack).split('\n').slice(1, 4).join(' | ') }; }
    out.push(c);
  }
  return out;
}
function levelChecks(L, seed, c) {
  {
    const a = create(L.game, seed, L.tier, { family: FAMILY }), b = create(L.game, seed, L.tier, { family: FAMILY }), d = create(L.game, FRESH_DEV[1], L.tier, { family: FAMILY });
    c.sameSeedSameWorld = hash(a.inner) === hash(b.inner); c.differentSeedDifferentWorld = hash(a.inner) !== hash(d.inner);
    let w = a; const before = hash(w.inner), p = packet(w); c.packetFrozen = Object.isFrozen(p) && Object.isFrozen(p.observation ?? {}) && Object.isFrozen(p.actions);
    c.tickStartsAtZero = w.inner.tick === 0; const pols = Array.from({ length: L.game === 'cards' ? w.inner.players : 1 }, (_, i) => createPolicyV331(L.game, 'STRONG', { partnerStyle: i > 0 ? w.inner.ext.partnerStyle : null }));
    let ticksOk = true, purity = true, stale = 0; for (let k = 0; k < 60 && !terminal(w); k++) { const q = packet(w), h = hash(w.inner), dec = pols[L.game === 'cards' ? w.inner.turn : 0].decide(q), chosen = q.actions.some((x) => x.id === dec.action?.id) ? dec.action : (c.policyProposedUnofferedAction = (c.policyProposedUnofferedAction ?? 0) + 1, q.actions[0]), n = step(w, q, chosen); if (hash(w.inner) !== h) purity = false; if (n.inner.tick !== w.inner.tick + 1) ticksOk = false; try { step(w, q, q.actions[0]); } catch (e) { stale++; } w = n; }
    c.stepIsPure = purity; c.tickIncrementsByOne = ticksOk; c.firstStepHashUnchangedInput = hash(a.inner) === before;
    // A packet is bound to its tick: re-stepping an old packet after the world advanced must be refused (STALE_PACKET).
    if (terminal(w)) { c.worldTerminalBeforeTick60 = w.inner.result + '@' + w.inner.tick; w = create(L.game, seed, L.tier, { family: FAMILY }); }
    const old = packet(w); const n2 = step(w, old, old.actions[0]); let rejected = false; try { step(n2, old, old.actions[0]); } catch (e) { rejected = /STALE_PACKET|ILLEGAL_ACTION|ACTOR_NOT_ACTIVE/.test(e.message); } c.stalePacketRejected = rejected;
    let illegalRejected = false; try { const q = packet(n2); step(n2, q, { id: 'BOGUS', type: 'BOGUS', parameters: {} }); } catch (e) { illegalRejected = /ILLEGAL_ACTION/.test(e.message); } c.illegalActionRejected = illegalRejected;
    // Sensor contracts.
    const delayed = create(L.game, seed, L.tier, { family: FAMILY, sensor: 'DELAYED' }), missing = create(L.game, seed, L.tier, { family: FAMILY, sensor: 'MISSING' });
    let wd = delayed, ok = true; for (let k = 0; k < 6 && !terminal(wd); k++) { const q = packet(wd); if (k >= 2 && q.observation && q.sensor.age !== 2 && L.game !== 'fighter') ok = false; wd = step(wd, q, q.actions.find((x) => x.type === 'WAIT') ?? q.actions[0]); } c.delayedSensorAgeTwo = ok;
    let wm = missing, miss = 0; for (let k = 0; k < 8 && !terminal(wm); k++) { const q = packet(wm); if (q.observation === null) miss++; if (q.observation === null && q.actions.length === 0 && !terminal(wm)) ok = false; wm = step(wm, q, q.actions.find((x) => x.type === 'WAIT') ?? q.actions[0]); } c.missingSensorDropsObservationNotActions = miss >= 1 && ok;
    if (L.game === 'cards') { const q0 = packet(a, 'P0'), q1 = packet(a, 'P1'); c.cardsOwnHandConcealed = q0.observation.hands[0].cards.every((x) => x.concealed) && q1.observation.hands[1].cards.every((x) => x.concealed); c.cardsPartnerHandVisible = q0.observation.hands[1].cards.every((x) => x.category); c.cardsNonActiveViewerHasNoActions = legal(a, 'P1').length === 0; }
    // Terminal handling: drive a WAIT/SPAM/RANDOM mix until terminal (bounded) and check legal() is empty and step throws.
    let wt = create(L.game, seed, L.tier, { family: FAMILY }); const polw = Array.from({ length: L.game === 'cards' ? wt.inner.players : 1 }, (_, i) => createPolicyV331(L.game, i === 0 ? (L.game === 'cards' ? 'SPAM' : 'WAIT') : 'STRONG', { partnerStyle: i > 0 ? wt.inner.ext.partnerStyle : null })); let n = 0; const limit = wt.inner.ext?.limit ?? wt.inner.limit ?? 20000;
    while (!terminal(wt) && n < limit + 5) { const q = packet(wt); wt = step(wt, q, polw[L.game === 'cards' ? wt.inner.turn : 0].decide(q).action); n++; }
    c.terminalReached = terminal(wt); c.terminalResult = wt.inner.result; c.terminalTick = wt.inner.tick; c.terminalLegalEmpty = legal(wt).length === 0; let threw = false; try { step(wt, packet(wt), { id: 'x', type: 'WAIT', parameters: {} }); } catch { threw = true; } c.terminalStepRefused = threw; c.timeoutExactlyAtLimit = wt.inner.result !== 'TIMEOUT' || wt.inner.tick === limit;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const res = checks(); const flags = ['sameSeedSameWorld', 'differentSeedDifferentWorld', 'packetFrozen', 'tickStartsAtZero', 'stepIsPure', 'tickIncrementsByOne', 'stalePacketRejected', 'illegalActionRejected', 'delayedSensorAgeTwo', 'missingSensorDropsObservationNotActions', 'terminalReached', 'terminalLegalEmpty', 'terminalStepRefused', 'timeoutExactlyAtLimit']; const summary = Object.fromEntries(flags.map((f) => [f, res.filter((c) => c[f] === true).length + '/' + res.filter((c) => c[f] !== undefined).length])); writeExclusive(resolve(LANE, 'evidence/shared-infrastructure.json'), { schema: 'ASCII_V33_1_SHARED_INFRASTRUCTURE_V1', sourceClosure: sourceClosure().hash, summary, levels: res }); console.log(JSON.stringify({ summary, failing: res.filter((c) => flags.some((f) => c[f] === false) || c.probeException || c.policyProposedUnofferedAction).map((c) => ({ level: c.level, fails: flags.filter((f) => c[f] === false), terminal: c.terminalResult + '@' + c.terminalTick, exception: c.probeException?.message ?? null, unoffered: c.policyProposedUnofferedAction ?? 0 })) }, null, 1)); }
