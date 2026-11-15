// Manual input and UI lifecycle only; never changes an automated recommendation.
// Fighter keys are absolute (left/right); they are converted to facing-relative actions using the visible facing.
export function manualAction(game, heldActions, requested, state = null) {
  const actions = [...heldActions];
  const direction = actions.filter(a => a === 'MOVE_LEFT' || a === 'MOVE_RIGHT').at(-1);
  if (game === 'platformer' && actions.includes('JUMP')) return direction ? (direction === 'MOVE_LEFT' ? 'JUMP_LEFT' : 'JUMP_RIGHT') : 'JUMP';
  if (game === 'fighter') {
    const me = state?.fighters?.[0], facing = me?.facing ?? 1;
    const rel = d => d === undefined ? null : (d === 'MOVE_RIGHT') === (facing > 0) ? 'FORWARD' : 'BACK';
    const last = actions.at(-1) ?? requested;
    if (actions.includes('JUMP') || last === 'JUMP') { const r = rel(direction); return r ? 'JUMP_' + r : 'JUMP_UP'; }
    if (me && !me.grounded && (last === 'LIGHT_ATTACK' || last === 'HEAVY_ATTACK')) return 'AIR_ATTACK';
    if (last === 'MOVE_LEFT' || last === 'MOVE_RIGHT') return 'WALK_' + rel(last);
    return last;
  }
  return actions.at(-1) ?? requested;
}
export const isAutomatic = mode => mode === 'sentinel' || mode === 'prime' || mode === 'baseline';
export function playbackAfter(mode, running, event) {
  if (!['sentinel', 'prime', 'baseline', 'manual'].includes(mode)) throw Error('Unknown control mode');
  if (event === 'ready' || event === 'mode-change') return isAutomatic(mode);
  if (event === 'blur') return isAutomatic(mode) && running;
  if (event === 'pause' || event === 'terminal' || event === 'error') return false;
  if (event === 'toggle') return !running;
  throw Error('Unknown playback event');
}
