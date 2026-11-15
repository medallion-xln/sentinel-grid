import { MOVES, FIGHT, fighterLegalActions } from '../worlds/fighter.mjs';
import { createTemporalController } from './controller.mjs';
export const ADVERSARIES = ['AGGRESSIVE_PRESSURE', 'DEFENSIVE_TURTLE', 'COUNTER_PUNISHER', 'ANTI_AIR_SPECIALIST', 'ADAPTIVE_MIXUP', 'MIRROR_V2'];
export const GRAPPLING_RANGE_PRESSURE = 'NOT_APPLICABLE_NO_GRAPPLE_MECHANIC';
export function createAdversary(style, episodeId) {
  if (!ADVERSARIES.includes(style)) throw Error('UNKNOWN_ADVERSARY');
  if (style === 'MIRROR_V2') return createTemporalController('fighter', 'V2', episodeId);
  const counts = { jump: 0, high: 0, low: 0, attack: 0, total: 0 }, responses = [], temporal = createTemporalController('fighter', 'V3', episodeId);
  // The stronger policy baseline is the same bounded planner. Styles are policy overrides using only its observed/provisional input.
  let lastObservationId = null;
  return { decide(packet) {
    const d = temporal.decide(packet), o = d.authoritativeObservation?.payload;
    if (!o) return d;
    if (lastObservationId !== d.observationId) { lastObservationId = d.observationId; counts.total++; if (!o.opponent.grounded) counts.jump++; if (o.opponent.guard === 'HIGH') counts.high++; if (o.opponent.guard === 'LOW') counts.low++; if (o.opponent.move) counts.attack++; }
    const me = d.estimatedState, op = o.opponent, distance = Math.abs(me.x - op.x), legal = fighterLegalActions({ ...me, move: me.move ? { ...me.move, t: me.move.remaining } : null });
    let action = d.action, response = null;
    if (legal.length > 1 && me.grounded) {
      const lead = MOVES.HEAVY_ATTACK.startup, y = op.y + op.vy * lead - FIGHT.gravity * lead * lead / 2, x = op.x + op.vx * lead;
      if (!op.grounded && Math.abs(x - me.x) < 11 && y > -1 && y < 7 && ['ANTI_AIR_SPECIALIST', 'ADAPTIVE_MIXUP', 'DEFENSIVE_TURTLE'].includes(style)) { action = 'HEAVY_ATTACK'; response = 'PUNISH_PREDICTABLE_JUMP'; }
      else if (!op.grounded && distance < 8 && ['ANTI_AIR_SPECIALIST', 'DEFENSIVE_TURTLE'].includes(style)) { action = 'WALK_BACK'; response = 'DENY_CROSSUP'; }
      else if (style === 'COUNTER_PUNISHER' && op.phase === 'RECOVERY') { action = distance < 8 ? 'LIGHT_ATTACK' : distance < 11.5 && op.move?.remaining > 6 ? 'HEAVY_ATTACK' : 'WALK_FORWARD'; response = 'WHIFF_PUNISH'; }
      else if (style === 'AGGRESSIVE_PRESSURE' && distance > 14) action = 'WALK_FORWARD';
      else if (style === 'DEFENSIVE_TURTLE' && op.move && distance < 12) action = op.move.name === 'LOW_ATTACK' ? 'BLOCK_LOW' : 'BLOCK_HIGH';
      else if (style === 'ADAPTIVE_MIXUP' && distance < 9 && counts.total >= 8 && counts.high > counts.low * 1.5) { action = 'LOW_ATTACK'; response = 'EXPLOIT_HIGH_GUARD'; }
      else if (style === 'ADAPTIVE_MIXUP' && distance < 8 && counts.low > counts.high * 1.5) { action = 'LIGHT_ATTACK'; response = 'EXPLOIT_LOW_GUARD'; }
    }
    if (!legal.includes(action)) action = d.action;
    if (response) responses.push({ tick: packet.receiptTick, response, action, evidenceId: d.observationId });
    return { ...d, action, adversaryStyle: style, opponentResponse: response, observedHabitCounts: { ...counts } };
  }, executed: (a, t) => temporal.executed(a, t), memory: () => ({ counts, responses }) };
}
