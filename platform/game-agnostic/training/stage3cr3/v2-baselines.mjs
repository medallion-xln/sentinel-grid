#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
const __root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const corpusPath = path.join(__root, "build/stage3b1-corpus/corpus.jsonl");

/* Stage 3C-R.3 Phases 5-9: index/prior shortcut baselines + RELATIONAL_CHALLENGE_V1.
 * All frozen BEFORE V2 exists. No learned prediction is consulted anywhere here. */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadCorpus } from '../../src/lab/stage3b1-temporal-warmup.js';
import { evaluatePolicy, scoreAnswer, buildTarget, nexusFor, nexusRelationalSelector,
         randomLegalBaseline, heuristicGreedyBaseline } from '../../src/lab/stage3c-learned-nexus.js';
import { orderedBranches } from './build-v2-action-index.mjs';
const SPLIT=process.argv[2], OUTDIR=process.argv[3], V1GEN=process.argv[4];
const sha=(s)=>createHash('sha256').update(s).digest('hex');
const KEY='3491a81feab1f17f';
const c=await loadCorpus(corpusPath);
const R_=c.records.filter(r=>r.split===SPLIT);
const pick=(r,i)=>{const o=orderedBranches(r); return (i>=0&&i<o.length)
  ?{actionId:o[i].actionKey,confidence:1,abstain:false}:{actionId:null,confidence:0,abstain:true};};
/* Phase 5 — fixed-position baselines */
const idx0=(r)=>pick(r,0), idx1=(r)=>pick(r,1), idx4=(r)=>pick(r,4);
const randIdx=(r)=>{const o=orderedBranches(r);
  return o.length?{actionId:o[parseInt(r.recordHash.slice(8,12),16)%o.length].actionKey,confidence:1,abstain:false}
                 :{actionId:null,confidence:0,abstain:true};};
/* Phase 6 — FIND_MOVE_THEN_SELECT_IT: reads action semantics only, never world state */
const findMove=(r)=>{const o=orderedBranches(r); const m=o.find(b=>b.actionType==='MOVE');
  return m?{actionId:m.actionKey,confidence:1,abstain:false}
          :(o.length?{actionId:o[0].actionKey,confidence:1,abstain:false}:{actionId:null,confidence:0,abstain:true});};
/* Phase 7 — shallow prior baselines */
const TYPE_RANK=['MOVE','WAIT','RETREAT','PROTECT','REINFORCE','REPAIR','SUBSTITUTE','TRANSFER','COLLECT','ATTACK','BYPASS'];
const byTypeRank=(r)=>{const o=orderedBranches(r);
  for(const t of TYPE_RANK){const b=o.find(x=>x.actionType===t); if(b) return {actionId:b.actionKey,confidence:1,abstain:false};}
  return o.length?{actionId:o[0].actionKey,confidence:1,abstain:false}:{actionId:null,confidence:0,abstain:true};};
const constKey=(r)=>{const b=(r.branches??[]).find(x=>x.actionKey===KEY);
  if(b) return {actionId:KEY,confidence:1,abstain:false};
  const s=[...(r.branches??[])].sort((a,b)=>a.actionKey<b.actionKey?-1:1);
  return s.length?{actionId:s[0].actionKey,confidence:1,abstain:false}:{actionId:null,confidence:0,abstain:true};};
const nxC=new Map(); const selector=(r)=>{if(!nxC.has(r.recordHash))nxC.set(r.recordHash,nexusFor(r));
  const n=nxC.get(r.recordHash); return n?nexusRelationalSelector(r,n):null;};
/* The true index-space analog of V1's shortcut. V1 memorised one specific MOVE
 * variant (MOVE EAST), not "a MOVE": records carry 3-4 MOVE directions, so
 * "first MOVE" only lands on east ~25-33% of the time and understates the bar.
 * This policy reads only the presented action text, never world state. */
const findMoveEast=(r)=>{const o=orderedBranches(r);
  const m=o.find(b=>b.actionType==='MOVE'&&(b.parameters?.direction==='EAST'));
  return m?{actionId:m.actionKey,confidence:1,abstain:false}
          :(o.length?{actionId:o[0].actionKey,confidence:1,abstain:false}:{actionId:null,confidence:0,abstain:true});};
const POL={ALWAYS_INDEX_0:idx0,FIND_MOVE_EAST_THEN_SELECT:findMoveEast,ALWAYS_INDEX_1:idx1,MOST_COMMON_INDEX_4:idx4,RANDOM_INDEX:randIdx,
  FIND_MOVE_THEN_SELECT:findMove,ACTION_TYPE_PRIOR:byTypeRank,CONSTANT_WITH_FALLBACK:constKey,
  RANDOM_LEGAL:randomLegalBaseline,GREEDY:heuristicGreedyBaseline,NEXUS_SELECTOR:selector};
const run=(recs)=>Object.fromEntries(Object.entries(POL).map(([n,p])=>{
  const e=evaluatePolicy(recs,p); return [n,{acc:e.optimalSetAccuracy,regret:e.meanRegret,scored:e.scored}];}));
const whole=run(R_);
/* Phase 8 — RELATIONAL_CHALLENGE_V1, predeclared rule, no learned input */
const challenge=R_.filter(r=>{
  const t=buildTarget(r); const br=r.branches??[];
  const keyB=br.find(x=>x.actionKey===KEY);
  const keyLegalNonOptimal = !!keyB && !t.optimalSet.includes(KEY);      // dominant prior legal but wrong
  const types=new Set(br.map(x=>x.actionType));
  return keyLegalNonOptimal && types.size>=2 && (t.rewardGap??0)>0;
});
const chIds=challenge.map(r=>r.recordHash);
const spec={version:'RELATIONAL_CHALLENGE_V1',split:SPLIT,
  rule:'dominantKeyLegalButNotOptimal AND distinctActionTypes>=2 AND rewardGap>0',
  dominantKey:KEY,n:chIds.length,recordIds:chIds,hash:sha(chIds.join('\n')),
  usesLearnedPredictions:false};
const ch=run(challenge);
const out={split:SPLIT,n:R_.length,wholeDistribution:whole,challenge:{spec:{...spec,recordIds:undefined},metrics:ch}};
if (V1GEN && existsSync(V1GEN)) {
  const g=new Map(); for(const l of readFileSync(V1GEN,'utf8').split('\n')){if(!l.trim())continue;const x=JSON.parse(l);g.set(x.recordHash,x);}
  const v1=(r)=>g.get(r.recordHash)?.answer??null;
  out.wholeDistribution.V1_LEARNED={...(()=>{const e=evaluatePolicy(R_,v1);return{acc:e.optimalSetAccuracy,regret:e.meanRegret,scored:e.scored};})()};
  out.challenge.metrics.V1_LEARNED={...(()=>{const e=evaluatePolicy(challenge,v1);return{acc:e.optimalSetAccuracy,regret:e.meanRegret,scored:e.scored};})()};
}
writeFileSync(OUTDIR+'/baselines-'+SPLIT+'.json', JSON.stringify(out,null,2));
writeFileSync(OUTDIR+'/challenge-'+SPLIT+'.json', JSON.stringify(spec,null,2));
console.log(SPLIT,'challenge n =',chIds.length,'hash',spec.hash.slice(0,16));
console.log(JSON.stringify({whole:Object.fromEntries(Object.entries(out.wholeDistribution).map(([k,v])=>[k,v.acc])),
  challenge:Object.fromEntries(Object.entries(ch).map(([k,v])=>[k,v.acc]))},null,1));
