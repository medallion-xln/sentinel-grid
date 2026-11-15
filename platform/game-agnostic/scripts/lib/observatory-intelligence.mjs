import { FORGE_ENTITY_TYPES } from '../../src/forge/contract.js';
import { renderWorld } from '../../src/forge/render.js';

export const EXPERT_NAMES = Object.freeze(['Prime', 'Vanguard', 'Oracle', 'Nexus', 'Horizon', 'Archimedes', 'Alexandria', 'Picasso', 'Forge']);
const distance = (a, b) => a && b ? Math.abs(a.x - b.x) + Math.abs(a.y - b.y) : null;
const evidence = (value, kind, source) => ({ value, kind, source });

/** Read-only presentation projection. No new expert, inference, authority, or execution path. */
export function projectObservatoryIntelligence(pending, result, { stats, aggregate, episode }) {
  const world = pending.nextState.world;
  const actor = world.entities.find((entity) => entity.type === 'ACTOR');
  const entities = world.entities.map((entity) => ({
    id: entity.id, type: entity.type, symbol: FORGE_ENTITY_TYPES[entity.type].symbol,
    position: entity.position, inService: entity.available && entity.health > 0,
    // Map fields are presentation evidence. They are not new approved Sentinel input fields.
    source: 'FORGE_PRESENTATION_STATE', kind: 'OBS',
    distance: distance(actor?.position, entity.position),
    direction: !actor ? 'UNKNOWN' : [entity.position.y < actor.position.y ? 'NORTH' : entity.position.y > actor.position.y ? 'SOUTH' : '',
      entity.position.x < actor.position.x ? 'WEST' : entity.position.x > actor.position.x ? 'EAST' : ''].filter(Boolean).join(' ') || 'HERE',
    critical: world.objectives.some((objective) => objective.entityId === entity.id) || entity.flags.critical === true,
    relationships: world.relations.filter((relation) => relation.from === entity.id || relation.to === entity.id),
    actorHealth: entity.type === 'ACTOR' ? entity.health : null,
    threatenedBy: world.relations.filter((relation) => relation.to === entity.id && ['attacks', 'blocks'].includes(relation.type)).map((relation) => relation.from),
    // Health values are not included in the current entity observation contract.
    unknowns: [...(entity.type === 'ACTOR' ? [] : ['entity health (not in entity observation packet)']), 'future survival', 'future eligibility'],
  }));
  const label = (id) => {
    const entity = entities.find((entry) => entry.id === id);
    return entity ? `${entity.symbol} · ${id}` : id ?? '—';
  };
  const branches = pending.features?.branches ?? [];
  const action = (descriptor) => {
    if (!descriptor) return 'ABSTAIN';
    const type = descriptor.parameters?.actionType ?? descriptor.actionType ?? descriptor.actionId;
    const direction = descriptor.parameters?.direction;
    const target = descriptor.target?.id ?? descriptor.targetId;
    return `${type}${direction ? ` ${direction}` : ''}${target ? ` → ${label(target)}` : ''}`;
  };
  const byKey = (key) => {
    const branch = branches.find((entry) => entry.actionKey === key);
    return branch ? action(branch) : key ?? '—';
  };
  const nexus = pending.features?.nexus;
  const selector = pending.features?.selector;
  const experts = EXPERT_NAMES.map((name) => ({
    name: `Sentinel ${name}`, shortName: name, status: 'NOT_RECORDED', action: null, confidence: null,
    kind: 'UNK', applicability: 'UNKNOWN', reason: 'No output from this expert is recorded by this stream.',
    rankedActions: [], evidence: [], horizon: 'NOT ESTABLISHED', regime: 'NOT ESTABLISHED',
    calibration: 'NOT ESTABLISHED', historicalValue: 'NOT ESTABLISHED', falseSelectionHarm: 'NOT ESTABLISHED',
  }));
  if (nexus && selector) {
    Object.assign(experts.find((expert) => expert.shortName === 'Nexus'), {
      status: selector.abstain ? 'ABSTAIN' : 'ACTIVE', action: selector.abstain ? null : byKey(selector.actionId),
      confidence: selector.confidence, kind: 'DRV', applicability: 'APPLICABLE', reason: selector.reason,
      evidence: nexus.rationaleCodes, signals: nexus.signals,
      rankedActions: (selector.ranking ?? []).map((rank) => ({ action: byKey(rank.actionId), score: rank.score })),
      confidenceNote: 'Selector confidence is an uncalibrated heuristic, not probability of correctness.',
      proposalSource: 'NEXUS_RELATIONAL_SELECTOR_V1 · existing interpretation of Nexus signals',
    });
  }
  experts[0].reason = 'This stream records a router recommendation; no Prime synthesis output is recorded.';
  const recommendation = pending.trace?.decisionTimeEvent.decisionTimeEvidence.recommendation;
  const hostile = entities.filter((entity) => entity.type === 'HOSTILE' && entity.inService);
  const threats = [...hostile].sort((a, b) => a.distance - b.distance);
  const resources = entities.filter((entity) => entity.type === 'RESOURCE' && entity.inService).sort((a, b) => a.distance - b.distance);
  const objectives = world.objectives.map((objective) => ({ ...objective, label: label(objective.entityId),
    status: objective.deliveredValue >= objective.requiredValue ? 'COMPLETE' : 'ACTIVE' }));
  const facts = result.worldState?.facts ?? [];
  const factCounts = { OBS: 0, DRV: 0, PRD: 0, UNK: 0 };
  for (const fact of facts) {
    const key = { OBSERVED: 'OBS', DERIVED: 'DRV', PREDICTED: 'PRD', UNKNOWN: 'UNK' }[fact.category];
    if (key) factCounts[key] += 1;
  }
  const hazardCount = world.grid.cells.filter((cell) => cell === 2).length + entities.filter((entity) => entity.type === 'HAZARD').length;
  const observedExperts = experts.filter((expert) => ['ACTIVE', 'ABSTAIN'].includes(expert.status));
  const proposals = Object.entries(Object.groupBy ? Object.groupBy(observedExperts, (expert) => expert.action ?? 'ABSTAIN') :
    observedExperts.reduce((groups, expert) => { (groups[expert.action ?? 'ABSTAIN'] ??= []).push(expert); return groups; }, {}))
    .map(([proposal, group]) => ({ action: proposal, experts: group.map((expert) => expert.shortName) }));
  const eligibility = result.experience?.projection.eligibilityByPurpose ?? {};
  return {
    schemaVersion: 1, episode, worldTick: world.tick, decisionTick: pending.stateBefore.world.tick,
    evidenceScope: 'Entity/map details are simulator presentation observations; only packet facts are approved Sentinel observations. They do not extend runtime contracts.',
    worldAscii: renderWorld(world), legend: renderWorld(world, { legend: true }).split('\n\n')[1],
    entities, actorId: actor?.id ?? null, objectives,
    regime: evidence(hostile.length ? 'THREAT_PRESSURE' : 'INFRASTRUCTURE_RECOVERY', 'DRV', 'Presentation heuristic from visible hostile count; not a certified Stage 3H regime'),
    horizon: evidence('NOT ESTABLISHED', 'UNK', 'No horizon specialization evidence is recorded'),
    situation: {
      threats, nearestResource: resources[0] ?? null, hazards: hazardCount,
      civilians: entities.filter((entity) => entity.type === 'CIVILIAN'),
      risk: evidence(threats.some((entity) => entity.distance <= 2) ? 'HIGH' : threats.length ? 'MEDIUM' : 'LOW', 'DRV', 'Display heuristic using Manhattan actor distance ≤ 2; not a calibrated risk score'),
      unknowns: ['Future hostile movement', 'Future objective eligibility', 'Resource quantity in the Sentinel observation packet', 'Entity health in the Sentinel observation packet'],
      attention: [threats[0] ? `${label(threats[0].id)} is ${threats[0].distance} Manhattan cells from the actor.` : 'No active hostile appears in the current map.',
        hazardCount ? `${hazardCount} hazard cells/entities are visible. Inspect traversability before interpreting distance.` : 'No hazard appears in the current map.',
        resources[0] ? `${label(resources[0].id)} is the nearest resource (${resources[0].distance} Manhattan cells). Quantity is unknown to Sentinel.` : 'No available resource is visible.'],
    },
    experts, disagreement: { proposals, recorded: observedExperts.length, total: 9, type: observedExperts.length < 2 ? 'NOT ESTABLISHED' : 'RECORDED_PROPOSALS',
      falseSelectionRisk: 'NOT ESTABLISHED' },
    decision: {
      recommendation: recommendation?.abstained ? 'ABSTAIN' : recommendation ? action(recommendation.proposedAction) : 'UNKNOWN',
      recommendationKind: recommendation ? recommendation.abstained ? 'DRV' : 'PRD' : 'UNK', confidence: recommendation?.confidence ?? null,
      reason: recommendation?.recommendedPath ?? 'NO_RECOMMENDATION_EVIDENCE', prime: 'NOT RECORDED',
      incumbent: action(pending.incumbentAction), match: result.trace?.projection.incumbentActions[0]?.matchingRecommendationStatus ?? 'UNKNOWN',
      candidates: [...branches].sort((a, b) => b.immediateScalar - a.immediateScalar || a.actionKey.localeCompare(b.actionKey))
        .map((branch) => ({ action: action(branch), actionId: branch.actionKey, value: branch.immediateScalar, kind: 'SYN' })),
      candidateSource: 'Privileged Forge one-step simulator branches used by the incumbent; scores are immediate rewards, not expert confidence or Prime ranking.',
      outcome: result.transition.info.outcome, terminal: result.transition.terminal, reward: result.transition.reward,
      outcomeStatus: result.trace?.projection.outcomeStatus ?? 'UNKNOWN',
      execution: { status: 'NOT DISPATCHED BY SENTINEL', reason: 'AUTHORITY_R0', executor: 'INCUMBENT', token: 'NONE', liveMutation: 'DISABLED' },
    },
    counterfactuals: (result.ledger?.projection.counterfactuals ?? []).map((entry) => ({
      action: action(entry.candidateAction), confidence: entry.confidence, value: entry.predictedValue,
      risk: entry.predictedRisk, outcome: entry.predictedOutcome, kind: 'CF', id: entry.counterfactualId,
    })),
    counterfactualEvaluation: result.ledger?.projection.evaluations.at(-1)?.status ?? 'UNKNOWN',
    experience: { eligibility, validation: result.experience?.projection.validations.at(-1) ?? null,
      uses: { 'Stage 3H evaluation': 'NOT RECORDED', 'Alexandria memory candidate': 'NOT RECORDED', 'Forge RSI dataset': 'NOT RECORDED' } },
    metrics: { stats, aggregate, latencyMs: result.metrics.total, factCounts, factTotal: facts.length,
      abstentionRate: recommendation ? (recommendation.abstained ? 1 : 0) : null },
    trace: {
      observation: pending.trace?.decisionTimeEvent.decisionTimeEvidence.observationEvidence,
      worldState: result.worldState, features: pending.features?.values, expert: nexus,
      router: result.router, recommendation, incumbent: pending.incumbentAction,
      outcome: result.trace?.projection.outcomes, ledger: result.ledger?.projection,
    },
  };
}
