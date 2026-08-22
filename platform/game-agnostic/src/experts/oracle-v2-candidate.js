import { deepFreeze, sha256 } from '../core/determinism.js';
import { normalizeExpertInput, SIGNAL_SCALE } from './expert-contract.js';

export const ORACLE_V2_CANDIDATE_ID = 'sentinel-oracle-temporal-v2-candidate';
export const ORACLE_V2_CANDIDATE_VERSION = 1;
export const ORACLE_V2_SEARCH_SPACE = deepFreeze([
  { id: 'recent-window-3', estimator: 'RECENT_SLOPE', window: 3, reversal: false, volatilityAbstention: false },
  { id: 'recent-window-5', estimator: 'RECENT_SLOPE', window: 5, reversal: false, volatilityAbstention: false },
  { id: 'majority-deltas', estimator: 'MAJORITY_DELTA', window: 8, reversal: false, volatilityAbstention: false },
  { id: 'recency-weighted', estimator: 'RECENCY_WEIGHTED', window: 8, reversal: true, volatilityAbstention: false },
  { id: 'robust-reversal', estimator: 'ROBUST_MEDIAN', window: 5, reversal: true, volatilityAbstention: false },
  { id: 'robust-reversal-volatility-abstention', estimator: 'ROBUST_MEDIAN', window: 5, reversal: true, volatilityAbstention: true },
]);

function median(values) { if (!values.length) return 0; const sorted=[...values].sort((a,b)=>a-b); const middle=Math.floor(sorted.length/2); return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2; }
function slope(values) { if(values.length<2)return 0;const mt=(values.length-1)/2;const my=values.reduce((a,b)=>a+b,0)/values.length;let n=0,d=0;for(let i=0;i<values.length;i++){n+=(i-mt)*(values[i]-my);d+=(i-mt)**2;}return d?n/d:0; }
function deltas(values) { return values.slice(1).map((value,index)=>value-values[index]); }
function sign(value, epsilon=.0025) { return value>epsilon?1:value<-epsilon?-1:0; }
function channelObservation(values, candidate) {
  const recent=values.slice(-candidate.window);const differences=deltas(recent);const fullSlope=slope(values);const recentSlope=slope(recent);const medianDelta=median(differences);const majority=differences.reduce((sum,value)=>sum+sign(value),0);const weighted=differences.reduce((sum,value,index)=>sum+value*(index+1),0)/Math.max(1,differences.reduce((sum,unused,index)=>sum+index+1,0));const volatility=median(differences.map(value=>Math.abs(value-medianDelta)));const recentDirection=sign(recentSlope);const fullDirection=sign(fullSlope);const reversal=recentDirection!==0&&fullDirection!==0&&recentDirection!==fullDirection;
  let estimate=recentSlope;if(candidate.estimator==='MAJORITY_DELTA')estimate=majority/Math.max(1,differences.length);if(candidate.estimator==='RECENCY_WEIGHTED')estimate=weighted;if(candidate.estimator==='ROBUST_MEDIAN')estimate=medianDelta;
  return { estimate, fullSlope, recentSlope, medianDelta, majority, weighted, volatility, reversal, recentDirection, fullDirection };
}

export function evaluateOracleV2Candidate(input, candidate) {
  if(!ORACLE_V2_SEARCH_SPACE.some(entry=>entry.id===candidate?.id))throw new TypeError('unknown Oracle v2 candidate');
  const normalized=normalizeExpertInput(input);const frames=normalized.observationHistory;const names=[...new Set(frames.flatMap(frame=>Object.keys(frame.channels)))].sort();const observations={};for(const name of names)observations[name]=channelObservation(frames.filter(frame=>frame.channels[name]!==undefined).map(frame=>frame.channels[name]),candidate);
  let interpretation='INSUFFICIENT_TEMPORAL_EVIDENCE';let addressedChannel=null;let abstentionReason=frames.length<3?'SHORT_OR_MISSING_HISTORY':'AMBIGUOUS_SIGNAL';let confidence=0;
  if(frames.length>=3&&names.length>=2){const ranked=names.map(name=>({name,estimate:observations[name].estimate})).sort((a,b)=>a.estimate-b.estimate||a.name.localeCompare(b.name));const gap=ranked[1].estimate-ranked[0].estimate;const chosen=observations[ranked[0].name];const estimatorsAgree=chosen.recentDirection===0||chosen.fullDirection===0||chosen.recentDirection===chosen.fullDirection||candidate.reversal;const volatile=chosen.volatility>.12;if(gap>.005&&estimatorsAgree&&!(candidate.volatilityAbstention&&volatile)){addressedChannel=ranked[0].name;interpretation=chosen.estimate<0?'WORSENING':'IMPROVING';abstentionReason=null;const sufficiency=Math.min(1,frames.length/16);const consistency=Math.min(1,Math.abs(chosen.majority)/Math.max(1,Math.min(candidate.window,frames.length)-1));const agreement=chosen.reversal?.5:1;const stability=Math.max(0,1-Math.min(1,chosen.volatility/.12));confidence=Math.round(SIGNAL_SCALE*sufficiency*consistency*agreement*(candidate.volatilityAbstention?stability:1));}}
  const body={expertId:ORACLE_V2_CANDIDATE_ID,expertVersion:ORACLE_V2_CANDIDATE_VERSION,candidateId:candidate.id,inputDigest:`sha256:${sha256(normalized)}`,observation:{channels:observations,historyFrames:frames.length},interpretation:{classification:interpretation,addressedChannel,abstentionReason},confidence,volatilitySemantics:'NON_DIRECTIONAL_UNCERTAINTY_ONLY',authority:{tier:'R0',canDispatch:false,canMutateLiveWorld:false,canIssueAuthorityTokens:false},advisoryOnly:true,productionPromoted:false};return deepFreeze({...body,outputDigest:`sha256:${sha256(body)}`});
}
