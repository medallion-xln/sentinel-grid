// Component D — Evidence and Explanation.
// Builds the structured, hashable decision record. Nothing in the record claims more than the evidence supports:
// risk values are labelled empirical estimates, the qualification status of the model is carried verbatim, and the
// authority block states that the kernel is advisory (R0) and cannot dispatch or mutate.
import { KERNEL_ID, KERNEL_VERSION, RECORD_CONTRACT, AUTHORITY, EPISTEMIC, digest } from './contract.mjs';

export function buildRecord({ state, legalActions, advisoryEvidence, featurized, semantics, risks, ranking, model, sourceIdentity }) {
  const d = ranking.decision, menuIdentity = digest(semantics.map((s) => s.key).slice().sort()), requestHash = digest({ state, legalActions, advisoryEvidence: advisoryEvidence ?? null });
  const action = (i) => ({ index: i, key: semantics[i].key, type: legalActions[i].type });
  const rankedActions = ranking.ranked.map((r) => { const s = semantics[r.index], k = risks[r.index]; return { ...action(r.index), rank: r.rank, selectable: r.selectable,
    constraintOutcome: { excluded: s.excluded, violatedHardConstraints: s.violatedHardConstraints, unknownConstraints: s.unknownConstraints, constraints: s.constraints, annotations: s.annotations },
    riskStatus: k.status, risk: k.risk, expectedRegret: k.regret, riskTier: r.riskTier, outOfDistribution: { numericFeaturesOutsideEnvelope: k.oodCount, examples: k.oodFeatures }, detail: k.detail,
    reasons: [...s.reasons, ...k.reasons, ...(k.supported && model && k.upper > model.ranking.tau ? ['RISK_ABOVE_CRITERION'] : [])] }; });
  const recommended = d.kind === 'RECOMMEND'
    ? { kind: 'RECOMMEND', decisionSet: d.decisionSet.map(action), representative: action(d.selectedIndex), indistinguishableDistinctActions: d.indistinguishableDistinctActions, reason: d.reason, tieNote: d.tieNote }
    : { kind: 'ABSTAIN', decisionSet: [], representative: null, reason: d.reason, bestEffortNotRecommended: d.forcedChoiceSet ? { decisionSet: d.forcedChoiceSet.map(action), note: 'Top-ranked action(s). NOT a recommendation: the frozen risk criterion was not met.' } : null };
  const supported = risks.filter((k) => k.supported), ev = featurized.evidence ?? { status: 'ABSENT', issues: [], summary: null };
  const body = {
    contract: RECORD_CONTRACT, kernel: { id: KERNEL_ID, version: KERNEL_VERSION },
    observationContract: state.observationContract, legalActionMenu: { size: legalActions.length, identity: menuIdentity, complete: rankedActions.length === legalActions.length },
    rankedActions, recommendedActionOrAbstention: recommended,
    uncertainty: { method: model?.uncertainty?.method ?? null, supportedActions: supported.length, unsupportedActions: risks.length - supported.length,
      maxEnsembleSpread: supported.length ? Math.max(...supported.map((k) => k.risk.spread)) : null, actionsOutsideNumericEnvelope: supported.filter((k) => k.oodCount > 0).length,
      riskCriterion: model ? { tau: model.ranking.tau, tierWidth: model.ranking.tierWidth, z: model.ranking.z, oodPenalty: model.ranking.oodPenalty } : null,
      bestRiskUpperBound: d.kind === 'RECOMMEND' ? d.riskUpperBound : d.bestRiskUpperBound ?? null },
    safetyAssessment: { ...EPISTEMIC, qualification: model?.qualification ?? { status: 'NO_MODEL', statement: 'No risk model applies to this observation contract. Nothing is recommended.' },
      rankingContract: ranking.contract, decisionMetRiskCriterion: d.kind === 'RECOMMEND' },
    evidence: { status: ev.status, issues: ev.issues, summary: ev.summary ?? null, contract: model?.evidenceContract ?? null, use: 'Advisory expert evidence enters the estimators as features. It never overrides public constraints or the risk criterion.' },
    sourceIdentity: { ...sourceIdentity, modelId: model?.modelId ?? null, modelHash: model?.modelHash ?? null, featureSchema: featurized.schema.id, requestHash },
    authority: AUTHORITY,
  };
  return { ...body, decisionHash: digest(body) };
}
