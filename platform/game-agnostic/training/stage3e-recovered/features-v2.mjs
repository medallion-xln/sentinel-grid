/* STAGE3E_RUNTIME_FEATURE_CONTRACT_V2
 *
 * Runtime-safety rule: a feature is admissible iff it is computable from canonical
 * CURRENT state plus expert outputs, before final action selection.
 *   ADMISSIBLE : branch.immediateScalar and its rewardVector components (greedy is
 *                itself deployable and uses exactly this), Nexus structural signals,
 *                legal-action surface, expert recommendations, tick/energy context.
 *   FORBIDDEN  : branch.scalarReward and branch.regret (horizon-scored), optimalActionKey,
 *                optimalScalar, horizonClass, greedyRegret, utilitySpread, supervisionClass,
 *                supervisionMargin, exactTie, tieCount, tieClass, paretoTradeoff, split.
 */
import { nexusFor, nexusRelationalSelector, heuristicGreedyBaseline } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/lab/stage3c-learned-nexus.js';

export const FORBIDDEN_V2 = Object.freeze(['scalarReward','regret','optimalActionKey','optimalScalar',
  'horizonClass','greedyRegret','utilitySpread','supervisionClass','supervisionMargin','exactTie',
  'tieCount','tieClass','paretoTradeoff','split','outOfDistribution','GREEDY_SAFE','inOptimalSet']);

const ent = (counts) => { const t=counts.reduce((a,b)=>a+b,0); if(!t) return 0;
  return +(-counts.filter(c=>c>0).reduce((s,c)=>s+(c/t)*Math.log2(c/t),0)).toFixed(4); };

export function extractV2(record, learnedAnswer) {
  const br = record.branches ?? [];
  const imm = br.map(b=>b.immediateScalar);
  const sorted=[...imm].sort((a,b)=>b-a);
  const t1=sorted[0]??0, t2=sorted[1]??t1, t3=sorted[2]??t2;
  const mean=imm.reduce((a,b)=>a+b,0)/(imm.length||1);
  const spread=Math.sqrt(imm.reduce((s,v)=>s+(v-mean)**2,0)/(imm.length||1));
  const n=nexusFor(record); const S=n?.signals??{};
  const sel=n?nexusRelationalSelector(record,n):null;
  const g=heuristicGreedyBaseline(record);
  const gB=br.find(b=>b.actionKey===g?.actionId);
  const lB=br.find(b=>b.actionKey===learnedAnswer?.actionId);
  const rv=gB?.rewardVector??{};
  const typeCounts=Object.values(br.reduce((m,b)=>{m[b.actionType]=(m[b.actionType]??0)+1;return m;},{}));
  const moves=br.filter(b=>b.actionType==='MOVE');
  const nonMove=br.filter(b=>b.actionType!=='MOVE').map(b=>b.immediateScalar).sort((a,b)=>b-a);
  return {
    /* --- action surface (Phase 7) --- */
    legalActionCount: br.length,
    immediateMargin: t1-t2,
    immediateMargin2: t1-t3,
    immediateSpread: +spread.toFixed(3),
    immediateEntropy: ent(imm.map(v=>Math.max(0,v-Math.min(...imm)+1))),
    topTieCount: imm.filter(v=>v===t1).length,
    nearTieCount: imm.filter(v=>t1-v<=2).length,
    actionTypeEntropy: ent(typeCounts),
    moveCount: moves.length,
    distinctMoveDirections: new Set(moves.map(b=>b.parameters?.direction)).size,
    bestNonMoveMargin: nonMove.length ? t1-nonMove[0] : 0,
    greedyIsMove: gB?.actionType==='MOVE'?1:0,
    /* --- greedy action's own reward structure (runtime-visible one-step vector) --- */
    greedyOptionValue: rv.optionValue??0,
    greedyRiskExposure: rv.riskExposure??0,
    greedyFuturePotential: rv.futureObjectivePotential??0,
    greedyTerminalOutcome: rv.terminalOutcome??0,
    greedyTimeCost: rv.timeCost??0,
    greedyResourceCost: rv.resourceCost??0,
    greedyInfraHealth: rv.infrastructureHealth??0,
    /* --- Nexus structural evidence (Phase 6 / Phase 9) --- */
    nxBottleneck: S.bottleneckCount??0, nxCriticalDep: S.criticalDependencyCount??0,
    nxCycleDetected: (S.cycleDetected??0)>0?1:0, nxCycleNodes: S.cycleNodeCount??0,
    nxEdgeCount: S.edgeCount??0, nxGraphDensity: S.graphDensity??0,
    nxHostile: S.hostileEntityCount??0, nxIsolated: S.isolatedEntityCount??0,
    nxIsolatedRatio: S.isolatedRatio??0, nxMaxCentrality: S.maxCentrality??0,
    nxMaxDegree: S.maxDegree??0, nxMaxDepDepth: S.maxDependencyDepth??0,
    nxMaxDependents: S.maxDependents??0, nxThreatened: S.threatenedEntityCount??0,
    nxUncoveredThreat: S.uncoveredThreatenedCount??0, nxUnresolvedDep: S.unresolvedDependencyCount??0,
    nxUnsupportedThreat: S.unsupportedThreatenedCount??0, nxActionTargeted: S.actionTargetedEntityCount??0,
    nxConfidence: n?.confidence??0, nxAbstains: (sel&&sel.abstain)?1:0,
    /* --- expert disagreement (Phase 8) --- */
    greedyEqLearned: (g&&learnedAnswer&&g.actionId===learnedAnswer.actionId)?1:0,
    greedyEqNexus: (g&&sel&&!sel.abstain&&g.actionId===sel.actionId)?1:0,
    nexusEqLearned: (sel&&!sel.abstain&&learnedAnswer&&sel.actionId===learnedAnswer.actionId)?1:0,
    allThreeAgree: (g&&sel&&!sel.abstain&&learnedAnswer&&g.actionId===sel.actionId&&g.actionId===learnedAnswer.actionId)?1:0,
    sameActionType: (gB&&lB&&gB.actionType===lB.actionType)?1:0,
    sameTarget: (gB&&lB&&(gB.targetId??null)===(lB.targetId??null))?1:0,
    /* --- context --- */
    tickProgress: record.maxTicks?+(record.tick/record.maxTicks).toFixed(4):0,
    energy: record.energy, objectiveCount: record.objectiveCount,
    entityCount: record.entityCount, relationCount: record.relationCount,
    decisionHorizonRemaining: record.decisionHorizonRemaining??0,
  };
}
export function leakageProbeV2(record, ans){
  const f=extractV2(record,ans); const keys=Object.keys(f);
  const src=extractV2.toString();
  const badKeys=keys.filter(k=>FORBIDDEN_V2.some(b=>k.toLowerCase()===b.toLowerCase()));
  const badReads=FORBIDDEN_V2.filter(b=>new RegExp('[.\\[\'"]'+b+'\\b').test(src));
  return {featureCount:keys.length, forbiddenKeys:badKeys, forbiddenSourceReads:badReads,
          LABEL_LEAKAGE: badKeys.length>0||badReads.length>0,
          AVAILABLE_BEFORE_ACTION:true, FUTURE_TRUTH_DEPENDENCE: badReads.length>0};
}
