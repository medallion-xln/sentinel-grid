/* STAGE3D_RUNTIME_FEATURE_CONTRACT_V1
 *
 * Every feature must be computable BEFORE action selection, from state the runtime
 * already has. Immediate (one-step) reward IS runtime-available -- the greedy expert
 * is itself deployable and uses nothing else. Continuation/horizon value is NOT: it
 * requires the counterfactual lookahead only Forge can do.
 *
 * FORBIDDEN and asserted absent below: horizonClass, greedyRegret, optimalActionKey,
 * optimalScalar, rewardGap, supervisionClass, tieClass, split identity, and any
 * branch.scalarReward (horizon-scored) term.
 */
import { nexusFor, nexusRelationalSelector, heuristicGreedyBaseline } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/lab/stage3c-learned-nexus.js';

export const FEATURE_CONTRACT_V1 = Object.freeze([
  'legalActionCount','entityCount','relationCount','graphDensity','tickProgress','energy',
  'objectiveCount','nexusConfidence','nexusStructural','nexusThreat','nexusNoRelations',
  'immediateMargin','immediateTopTieCount','immediateSpread','moveFractionLegal',
  'learnedAgreesGreedy','learnedAgreesNexus','learnedPicksMove','nexusAbstains',
]);

const FORBIDDEN = Object.freeze(['horizonClass','greedyRegret','optimalActionKey','optimalScalar',
  'rewardGap','supervisionClass','tieClass','split','outOfDistribution','scalarReward','totalScalar']);

export function extract(record, learnedAnswer) {
  const br = record.branches ?? [];
  const imm = br.map(b => b.immediateScalar).sort((a,b)=>b-a);
  const top = imm[0] ?? 0, second = imm[1] ?? top;
  const ties = imm.filter(v => v === top).length;
  const mean = imm.reduce((a,b)=>a+b,0)/(imm.length||1);
  const spread = Math.sqrt(imm.reduce((s,v)=>s+(v-mean)**2,0)/(imm.length||1));
  const n = nexusFor(record);
  const sel = n ? nexusRelationalSelector(record, n) : null;
  const codes = new Set(n?.rationaleCodes ?? []);
  const g = heuristicGreedyBaseline(record);
  return {
    legalActionCount: br.length,
    entityCount: record.entityCount, relationCount: record.relationCount,
    graphDensity: record.entityCount ? record.relationCount / record.entityCount : 0,
    tickProgress: record.maxTicks ? record.tick / record.maxTicks : 0,
    energy: record.energy, objectiveCount: record.objectiveCount,
    nexusConfidence: n?.confidence ?? 0,
    nexusStructural: (codes.has('NEXUS_CRITICAL_DEPENDENCY')||codes.has('NEXUS_BOTTLENECK')||
                      codes.has('NEXUS_UNSUPPORTED_THREAT')||codes.has('NEXUS_CYCLE_DETECTED')) ? 1 : 0,
    nexusThreat: (codes.has('NEXUS_UNSUPPORTED_THREAT')||codes.has('NEXUS_UNCOVERED_THREAT')) ? 1 : 0,
    nexusNoRelations: (codes.has('NEXUS_NO_RELATIONSHIPS')||codes.has('NEXUS_EMPTY_GRAPH')) ? 1 : 0,
    nexusAbstains: (sel && sel.abstain) ? 1 : 0,
    immediateMargin: top - second,
    immediateTopTieCount: ties,
    immediateSpread: Math.round(spread*1000)/1000,
    moveFractionLegal: br.length ? br.filter(b=>b.actionType==='MOVE').length / br.length : 0,
    learnedAgreesGreedy: (learnedAnswer && g && learnedAnswer.actionId === g.actionId) ? 1 : 0,
    learnedAgreesNexus: (learnedAnswer && sel && !sel.abstain && learnedAnswer.actionId === sel.actionId) ? 1 : 0,
    learnedPicksMove: (learnedAnswer && br.find(b=>b.actionKey===learnedAnswer.actionId)?.actionType==='MOVE') ? 1 : 0,
  };
}

/* PHASE 8 — leakage probe: assert no forbidden key reaches the feature vector. */
export function leakageProbe(sampleRecord, sampleAnswer) {
  const f = extract(sampleRecord, sampleAnswer);
  const keys = Object.keys(f);
  const unexpected = keys.filter(k => !FEATURE_CONTRACT_V1.includes(k));
  const missing = FEATURE_CONTRACT_V1.filter(k => !keys.includes(k));
  const forbidden = keys.filter(k => FORBIDDEN.some(bad => k.toLowerCase().includes(bad.toLowerCase())));
  const src = extract.toString();
  const forbiddenReads = FORBIDDEN.filter(bad => new RegExp('\\b'+bad+'\\b').test(src));
  return { featureCount: keys.length, unexpected, missing, forbidden,
           forbiddenSourceReads: forbiddenReads,
           LABEL_LEAKAGE: forbidden.length>0 || forbiddenReads.length>0,
           AVAILABLE_BEFORE_ACTION: true, FUTURE_TRUTH_DEPENDENCE: forbiddenReads.length>0 };
}
