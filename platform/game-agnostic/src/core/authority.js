import { AuthorityError } from './errors.js';
import { deepFreeze } from './determinism.js';

export const AuthorityTier = deepFreeze({
  R0_EVALUATION: 'R0',
  R1_ADVISORY: 'R1',
  R2_HUMAN_APPROVED_DISPATCH: 'R2',
  R3_BOUNDED_DELEGATION: 'R3',
  R4_OPERATIONAL_AUTONOMY: 'R4',
  R5_STRATEGIC_AUTONOMY: 'R5',
});

const R0_POLICY = {
  policyVersion: 1,
  tier: AuthorityTier.R0_EVALUATION,
  canObserve: true,
  canRecommend: true,
  canSimulateDetachedState: true,
  canDispatch: false,
  canMutateLiveWorld: false,
  canIssueAuthorityTokens: false,
  canChangeAuthorityPolicy: false,
  requiresHumanAuthorizationForExpansion: true,
  deniedCapabilities: [
    'dispatch',
    'live-world-mutation',
    'authority-token-issuance',
    'authority-policy-change',
    'self-promotion',
  ],
};

export function defaultAuthorityPolicy() {
  return deepFreeze(structuredClone(R0_POLICY));
}

export function assertEvaluationOnly(policy = defaultAuthorityPolicy()) {
  const valid =
    policy?.tier === AuthorityTier.R0_EVALUATION &&
    policy.canObserve === true &&
    policy.canRecommend === true &&
    policy.canSimulateDetachedState === true &&
    policy.canDispatch === false &&
    policy.canMutateLiveWorld === false &&
    policy.canIssueAuthorityTokens === false &&
    policy.canChangeAuthorityPolicy === false &&
    policy.requiresHumanAuthorizationForExpansion === true;
  if (!valid) throw new AuthorityError('Stage 0/1 requires the exact R0 default-denial authority policy');
  return true;
}

export function denyExecution(operation) {
  throw new AuthorityError(`Operation denied at R0: ${operation}`, {
    tier: AuthorityTier.R0_EVALUATION,
    operation,
  });
}
