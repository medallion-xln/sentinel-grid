// SK1 evidence source (evaluation side). Runs the frozen comparators on a PUBLIC view and reduces their output to the
// canonical, handle-free advisory evidence the kernel accepts. The comparators are certified experts whose sources are
// custody-protected; they are invoked here, outside the kernel, exactly as the frozen lock invokes them.
import { devLock } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { canonicalEvidence } from '../adapters/forge/evidence.mjs';
import { fail } from './common.mjs';

/** view: observableView(world); band: 'H0' | 'H2'. Returns { evidence, lock } — lock is for evaluation-side bookkeeping only. */
export function evidenceForView(view, band) {
  const lock = devLock(view, band), handles = view.surface.map((e) => e.actionId);
  if (JSON.stringify(handles) !== JSON.stringify(lock.menu)) fail('SURFACE_ORDER_DIFFERS_FROM_LOCK_MENU');
  if (lock.s0.scores.length !== handles.length) fail('S0_SCORE_COUNT_MISMATCH');
  return { lock, evidence: canonicalEvidence({ menuHandles: handles, menuTypes: view.surface.map((e) => e.actionType), s0: { scores: lock.s0.scores, selected: lock.s0.selected }, nexus: { abstain: lock.nexus.abstain, action: lock.nexus.action, codes: lock.nexus.codes, reason: lock.nexus.reason } }) };
}
