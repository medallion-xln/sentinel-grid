#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
const __root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const corpusPath = path.join(__root, "build/stage3b1-corpus/corpus.jsonl");

/* Stage 3C-R.3 Experiment A scorer: resolve local index -> canonical action, then
 * score with the repo's own functions. node score-v2.mjs <SPLIT> <gen> <out> [v1gen] */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCorpus } from '../../src/lab/stage3b1-temporal-warmup.js';
import { evaluatePolicy, scoreAnswer, nexusFor, nexusRelationalSelector,
         randomLegalBaseline, heuristicGreedyBaseline } from '../../src/lab/stage3c-learned-nexus.js';
import { orderedBranches } from './build-v2-action-index.mjs';
const [SPLIT,GEN,OUT,V1GEN]=process.argv.slice(2);
const c=await loadCorpus(corpusPath);
const R_=c.records.filter(r=>r.split===SPLIT);
const g=new Map();
for(const l of readFileSync(GEN,'utf8').split('\n')){if(!l.trim())continue;const x=JSON.parse(l);g.set(x.recordHash,x);}
const stats={parsed:0,unparsed:0,inRange:0,outOfRange:0};
const v2=(r)=>{const a=g.get(r.recordHash)?.answer;
  if(!a||typeof a.actionIndex!=='number'||!Number.isInteger(a.actionIndex)){stats.unparsed++;return null;}
  stats.parsed++;
  const o=orderedBranches(r);
  if(a.actionIndex<0||a.actionIndex>=o.length){stats.outOfRange++;return {actionId:null,confidence:1,abstain:false};}
  stats.inRange++;
  return {actionId:o[a.actionIndex].actionKey,confidence:1,abstain:false};};
const nxC=new Map(); const selector=(r)=>{if(!nxC.has(r.recordHash))nxC.set(r.recordHash,nexusFor(r));
  const n=nxC.get(r.recordHash); return n?nexusRelationalSelector(r,n):null;};
let v1=null;
if(V1GEN){const m=new Map();
  for(const l of readFileSync(V1GEN,'utf8').split('\n')){if(!l.trim())continue;const x=JSON.parse(l);m.set(x.recordHash,x);}
  v1=(r)=>m.get(r.recordHash)?.answer??null;}
const summ=(recs,pol)=>{const e=evaluatePolicy(recs,pol);
  return {acc:e.optimalSetAccuracy,regret:e.meanRegret,median:e.medianRegret,worst:e.worstRegret,
          parse:e.parseSuccessRate,legal:e.legalActionRate,illegal:e.illegalActionCount,scored:e.scored,n:e.cases};};
const CHDIR=process.env.CHALLENGE_DIR ?? path.join(__root,'training/stage3cr3/identity');
const chSpec=JSON.parse(readFileSync(path.join(CHDIR,'challenge-'+SPLIT+'.json'),'utf8'));
const chSet=new Set(chSpec.recordIds);
const CH=R_.filter(r=>chSet.has(r.recordHash));
const out={split:SPLIT,n:R_.length,indexStats:stats,
  whole:{V2:summ(R_,v2),NEXUS:summ(R_,selector),GREEDY:summ(R_,heuristicGreedyBaseline),RANDOM:summ(R_,randomLegalBaseline)},
  challenge:{n:CH.length,hash:chSpec.hash,
    V2:summ(CH,v2),NEXUS:summ(CH,selector),GREEDY:summ(CH,heuristicGreedyBaseline),RANDOM:summ(CH,randomLegalBaseline)}};
if(v1){out.whole.V1=summ(R_,v1); out.challenge.V1=summ(CH,v1);}
/* diversity: resolved canonical action + raw index */
const idxC={},actC={},typC={};
for(const r of R_){const a=g.get(r.recordHash)?.answer; if(!a||typeof a.actionIndex!=='number')continue;
  idxC[a.actionIndex]=(idxC[a.actionIndex]??0)+1;
  const o=orderedBranches(r); const b=o[a.actionIndex];
  if(b){actC[b.actionKey]=(actC[b.actionKey]??0)+1; typC[b.actionType]=(typC[b.actionType]??0)+1;}}
const ent=(o)=>{const t=Object.values(o).reduce((a,b)=>a+b,0);
  return t?Math.round(-Object.values(o).reduce((s,x)=>s+(x/t)*Math.log2(x/t),0)*10000)/10000:null;};
const top=(o)=>{const t=Object.values(o).reduce((a,b)=>a+b,0);const m=Math.max(...Object.values(o));
  return t?Math.round(m*10000/t)/10000:null;};
out.diversity={uniqueIndices:Object.keys(idxC).length,indexEntropy:ent(idxC),topIndexShare:top(idxC),
  uniqueCanonicalActions:Object.keys(actC).length,canonicalEntropy:ent(actC),topActionShare:top(actC),
  actionTypes:typC,indexDistribution:idxC};
/* complementarity on both surfaces */
const comp=(recs)=>{const o={V2_ONLY_CORRECT:0,NEXUS_ONLY_CORRECT:0,BOTH_CORRECT:0,BOTH_WRONG:0,COMPARABLE:0,SELECTOR_ABSTAINED:0};
  for(const r of recs){const a=scoreAnswer(r,v2(r)),b=scoreAnswer(r,selector(r));
    if(!b.scored){o.SELECTOR_ABSTAINED++;continue;} if(!a.scored)continue; o.COMPARABLE++;
    if(a.inOptimalSet&&b.inOptimalSet)o.BOTH_CORRECT++; else if(a.inOptimalSet)o.V2_ONLY_CORRECT++;
    else if(b.inOptimalSet)o.NEXUS_ONLY_CORRECT++; else o.BOTH_WRONG++;}
  return o;};
out.complementarity={whole:comp(R_),challenge:comp(CH)};
const bucket=(fn,recs)=>{const m={};for(const r of recs)(m[String(fn(r))]??=[]).push(r);
  return Object.fromEntries(Object.entries(m).sort().map(([k,v])=>[k,{n:v.length,
    v2:evaluatePolicy(v,v2).optimalSetAccuracy, nexus:evaluatePolicy(v,selector).optimalSetAccuracy}]));};
out.byHorizonClass=bucket(r=>r.horizonClass,R_);
out.byTopology=bucket(r=>r.shape,R_);
writeFileSync(OUT,JSON.stringify(out,null,2));
console.log(JSON.stringify({whole:{V2:out.whole.V2.acc,V1:out.whole.V1?.acc,NEXUS:out.whole.NEXUS.acc,GREEDY:out.whole.GREEDY.acc},
 challenge:{n:out.challenge.n,V2:out.challenge.V2.acc,V1:out.challenge.V1?.acc,GREEDY:out.challenge.GREEDY.acc,NEXUS:out.challenge.NEXUS.acc},
 diversity:{uniqueIdx:out.diversity.uniqueIndices,topIdx:out.diversity.topIndexShare,entropy:out.diversity.indexEntropy,
 uniqueActions:out.diversity.uniqueCanonicalActions,topAction:out.diversity.topActionShare},
 indexStats:stats},null,1));
