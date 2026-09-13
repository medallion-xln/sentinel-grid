/* Stage 3D scorer over fresh splits. Reuses the repo's own scoring functions. */
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluatePolicy, scoreAnswer, nexusFor, nexusRelationalSelector,
         randomLegalBaseline, heuristicGreedyBaseline } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/lab/stage3c-learned-nexus.js';
import { orderedBranches } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/build-v2.mjs';
export function loadSplit(name){
  return readFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/split-'+name+'.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
}
export function learnedFor(name){
  const g=new Map();
  for(const l of readFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/gen-'+name+'.jsonl','utf8').split('\n')){
    if(!l.trim())continue; const x=JSON.parse(l); g.set(x.recordHash,x);}
  return (r)=>{const a=g.get(r.recordHash)?.answer;
    if(!a||typeof a.actionIndex!=='number')return null;
    const o=orderedBranches(r);
    return (a.actionIndex>=0&&a.actionIndex<o.length)
      ? {actionId:o[a.actionIndex].actionKey,confidence:1,abstain:false}
      : {actionId:null,confidence:1,abstain:false};};
}
const nxC=new Map();
export function nexusOut(r){ if(!nxC.has(r.recordHash)) nxC.set(r.recordHash,nexusFor(r)); return nxC.get(r.recordHash); }
export function selectorFor(){ return (r)=>{const n=nexusOut(r); return n?nexusRelationalSelector(r,n):null;}; }
export const greedy=heuristicGreedyBaseline, random=randomLegalBaseline;
export function summarise(recs,pol){
  const e=evaluatePolicy(recs,pol);
  return {acc:e.optimalSetAccuracy,regret:e.meanRegret,median:e.medianRegret,
          parse:e.parseSuccessRate,legal:e.legalActionRate,illegal:e.illegalActionCount,
          scored:e.scored,n:e.cases,abstain:e.abstentionRate};
}
export function byHorizon(recs,pol){
  const out={};
  for(const cls of ['HORIZON_ALIGNED','HORIZON_DEPENDENT']){
    const s=recs.filter(r=>r.horizonClass===cls);
    out[cls]={n:s.length,...summarise(s,pol)};
  }
  return out;
}
if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]??'').href) {
  const SPLIT=process.argv[2];
  const recs=loadSplit(SPLIT); const learned=learnedFor(SPLIT); const selector=selectorFor();
  const out={split:SPLIT,n:recs.length,
    whole:{NEXUS:summarise(recs,selector),LEARNED_V2B:summarise(recs,learned),
           GREEDY:summarise(recs,greedy),RANDOM:summarise(recs,random)},
    horizon:{NEXUS:byHorizon(recs,selector),LEARNED_V2B:byHorizon(recs,learned),
             GREEDY:byHorizon(recs,greedy)}};
  writeFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/baselines-'+SPLIT+'.json',JSON.stringify(out,null,2));
  console.log(SPLIT, JSON.stringify({whole:Object.fromEntries(Object.entries(out.whole).map(([k,v])=>[k,v.acc]))},null,0));
  for(const [k,v] of Object.entries(out.horizon))
    console.log('  '+k.padEnd(12), 'aligned',v.HORIZON_ALIGNED.acc,'(n='+v.HORIZON_ALIGNED.n+')  dependent',v.HORIZON_DEPENDENT.acc,'(n='+v.HORIZON_DEPENDENT.n+')');
}
