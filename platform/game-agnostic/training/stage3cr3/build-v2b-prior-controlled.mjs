#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
const __root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const corpusPath = path.join(__root, "build/stage3b1-corpus/corpus.jsonl");

/* Stage 3C-R.3 Experiment B — PRIOR_CONTROL_POLICY_V1.
 *
 * Natural TRAIN targets: MOVE 87.42%, MOVE:EAST alone 45.68%. The shortcut that
 * V1 and V2A both learned is specifically MOVE:EAST (worth 65.32% on VALIDATION);
 * "any MOVE" is only worth 27.52%. So the intervention that matters is capping the
 * dominant FAMILY, which forces a direction choice that cannot be made without
 * reading the world.
 *
 * Rule (frozen before training):
 *   1. group eligible TRAIN rows by optimal-action family (actionType[:direction])
 *   2. CAP = floor(0.20 * 4459) = 891   (20% of the natural V2A dataset size)
 *   3. per family take min(natural, CAP) unique records, ordered by recordHash
 *   4. families below CAP may repeat up to min(CAP, 3 x natural)  -- declared bound
 *   5. VALIDATION / HOLDOUT / OOD are untouched and remain natural distribution
 */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadCorpus } from '../../src/lab/stage3b1-temporal-warmup.js';
import { measureRuleBaseRates, selectRelationalCases, buildTarget } from '../../src/lab/stage3c-learned-nexus.js';
import { sampleBalancedByTopology } from '../../src/lab/stage3cr-training-environment.js';
import { orderedBranches, buildInstructionV2 } from './build-v2-action-index.mjs';
const OUT=process.argv[2];
const sha=(s)=>createHash('sha256').update(s).digest('hex');
export const PRIOR_CONTROL_POLICY_V1='SENTINEL_PRIOR_CONTROL_V1_FAMILY_CAP_0.20_DUP_BOUND_3X';
const CAP_FRACTION=0.20, DUP_BOUND=3;

const c=await loadCorpus(corpusPath);
const train=c.records.filter(r=>r.split==='TRAIN');
const br=measureRuleBaseRates(train);
const sel=selectRelationalCases(train,br).filter(e=>e.relationallyMeaningful).map(e=>e.record);
const sampled=sampleBalancedByTopology(sel,{maxSharePerShape:0.12}).sampled;

const items=[];
for(const r of sampled){
  const t=buildTarget(r); if(!t.singleTargetSftEligible) continue;
  const opt=t.optimalSet[0]; if(opt===undefined) continue;
  const ord=orderedBranches(r); const idx=ord.findIndex(b=>b.actionKey===opt); if(idx<0) continue;
  const b=ord[idx];
  const family=b.actionType+(b.parameters?.direction?(':'+b.parameters.direction):'');
  items.push({r,idx,family});
}
const CAP=Math.floor(CAP_FRACTION*items.length);
const fam={}; for(const it of items)(fam[it.family]??=[]).push(it);
for(const k of Object.keys(fam)) fam[k].sort((a,b)=>a.r.recordHash<b.r.recordHash?-1:1);

const chosen=[]; const alloc={};
for(const [k,list] of Object.entries(fam).sort()){
  const budget=Math.min(CAP, DUP_BOUND*list.length);
  alloc[k]={natural:list.length,budget,unique:Math.min(list.length,budget),repeats:Math.max(0,budget-list.length)};
  for(let i=0;i<budget;i++) chosen.push(list[i%list.length]);
}
chosen.sort((a,b)=>{const x=a.r.recordHash+'|'+a.idx, y=b.r.recordHash+'|'+b.idx; return x<y?-1:x>y?1:0;});
const rows=chosen.map(it=>({instruction:buildInstructionV2(it.r),
  output:JSON.stringify({actionIndex:it.idx}),
  forge_metadata:{recordHash:it.r.recordHash,split:it.r.split,shape:it.r.shape,family:it.family}}));
const body=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
writeFileSync(OUT+'/nexus-sft-train-v2b.jsonl',body);

const cnt=(f)=>{const m={};for(const it of chosen){const k=String(f(it));m[k]=(m[k]??0)+1;}return m;};
const ent=(m)=>{const t=Object.values(m).reduce((a,b)=>a+b,0);
  return Math.round(-Object.values(m).reduce((s,x)=>s+(x/t)*Math.log2(x/t),0)*10000)/10000;};
const famD=cnt(x=>x.family), typD=cnt(x=>x.family.split(':')[0]), idxD=cnt(x=>x.idx);
const leak=[...new Set(chosen.map(x=>x.r.split))].filter(s=>s!=='TRAIN');
const summary={policy:PRIOR_CONTROL_POLICY_V1,
  policyHash:sha(PRIOR_CONTROL_POLICY_V1+'|CAP_FRACTION='+CAP_FRACTION+'|DUP_BOUND='+DUP_BOUND+'|'+JSON.stringify(alloc)),
  capFraction:CAP_FRACTION,dupBound:DUP_BOUND,CAP,
  naturalRows:items.length,rows:rows.length,
  uniqueSourceRecords:new Set(chosen.map(x=>x.r.recordHash)).size,
  effectiveTrainRecords:new Set(chosen.map(x=>x.r.recordHash)).size,
  sftHash:sha(body),trainingLeakageCount:leak.length,
  allocation:alloc,familyDistribution:famD,familyEntropy:ent(famD),
  actionTypeDistribution:typD,actionTypeEntropy:ent(typD),
  moveEastShare:Math.round((famD['MOVE:EAST']??0)*10000/rows.length)/10000,
  moveTotalShare:Math.round((typD['MOVE']??0)*10000/rows.length)/10000,
  targetIndexDistribution:idxD,targetIndexEntropy:ent(idxD),
  byTopology:cnt(x=>x.r.shape),byHorizon:cnt(x=>x.r.horizonClass),
  byLevel:cnt(x=>x.r.level),byGraphSize:cnt(x=>x.r.entityCount<=15?'a_small':x.r.entityCount<=25?'b_mid':'c_large'),
  byRelationCount:cnt(x=>x.r.relationCount<=20?'a<=20':x.r.relationCount<=35?'b21-35':'c>35')};
writeFileSync(OUT+'/v2b-dataset-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({rows:summary.rows,unique:summary.uniqueSourceRecords,CAP,
  sftHash:summary.sftHash,leakage:summary.trainingLeakageCount,
  moveEastShare:summary.moveEastShare,moveTotalShare:summary.moveTotalShare,
  familyEntropy:summary.familyEntropy,actionTypeDistribution:typD,allocation:alloc},null,1));
