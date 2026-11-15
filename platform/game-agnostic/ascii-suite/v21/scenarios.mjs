import { createGame, stepGame, observe } from '../games.mjs';
import { observeFighter } from '../worlds/fighter.mjs';
import { raceStandings } from '../worlds/racing.mjs';
export function initialWorld({ game, seed, difficulty = 5, scenario = 'STANDARD', slot = null, adversary = null }) {
  const s = createGame(game, { seed, difficulty, style: 'ADAPTIVE' });
  if (game === 'fighter' && adversary) {
    // Fresh seeded starting spacings and mirrored sides, not fake independent copies of one deterministic arena.
    let randomState = seed >>> 0;
    const rand = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
    const left = 20 + rand() * 25, right = 60 + rand() * 35, mirrored = rand() < .5;
    s.fighters[0].x = mirrored ? right : left; s.fighters[0].facing = mirrored ? -1 : 1;
    s.fighters[1].x = mirrored ? left : right; s.fighters[1].facing = mirrored ? 1 : -1;
  }
  if (game === 'racing' && slot !== null) {
    if (![0, 1, 2, 3].includes(slot)) throw Error('INVALID_GRID_SLOT');
    const sorted = [s.player, ...s.rivals].sort((a, b) => b.s - a.s);
    const target = sorted[slot]; [s.player.s, target.s] = [target.s, s.player.s]; [s.player.n, target.n] = [target.n, s.player.n];
    s.startPlace = raceStandings(s).find(c => c.id === 'P').place;
  }
  // Declared evaluator-only variants, never altered to help a controller after seeing its outcome.
  if (scenario === 'WET_GRIP_LOW' && game === 'racing') s.track.wetGrip = .55;
  if (scenario === 'WET_GRIP_HIGH' && game === 'racing') s.track.wetGrip = .8;
  if (scenario === 'SEEDED_GRIP_CHANGE' && game === 'racing') { s.track.wetGrip = seed % 2 ? .55 : .8; s.gripChangeScenario = true; }
  if (scenario === 'WIND_SHIFT' && game === 'platformer') s.wind.forEach(z => { z.strength = .42; });
  if (scenario === 'FAST_PATROL' && game === 'platformer') s.enemies.forEach(e => { e.speed *= 1.15; });
  if (scenario === 'ADAPTIVE_PONG' && game === 'pong') s.opponentVariant = 'ADAPTIVE';
  return s;
}
export function opponentObservation(s) { return observeFighter({ ...s, fighters: [s.fighters[1], s.fighters[0]] }); }
export function advanceWorld(s, action, opponentAction = null) {
  if (s.game === 'racing' && s.gripChangeScenario) s = { ...s, track: { ...s.track, wetGrip: s.lap >= 1 ? .62 : s.seed % 2 ? .55 : .8 } };
  if (s.game !== 'fighter' || opponentAction === null) return stepGame(s, action);
  const configured = { ...s, opponentScript: { mode: 'SEQUENCE', actions: { [s.tick]: opponentAction }, then: 'WAIT' } };
  // Existing shared simultaneous fightTick, collision boxes, damage, legal actions and scoring are unchanged.
  return stepGame(configured, action);
}
export { observe };
