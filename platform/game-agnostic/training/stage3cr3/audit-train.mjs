#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
const __root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const corpusPath = path.join(__root, "build/stage3b1-corpus/corpus.jsonl");

import { writeFileSync } from 'node:fs';
import { loadCorpus } from '../../src/lab/stage3b1-temporal-warmup.js';
import { measureRuleBaseRates, selectRelationalCases, buildTarget } from '../../src/lab/stage3c-learned-nexus.js';
import { sampleBalancedByTopology } from '../../src/lab/stage3cr-training-environment.js';
const c=await loadCorpus(corpusPath);
const train=c.records.filter(r=>r.split==='TRAIN');
const br=measureRuleBaseRates(train);
const sel=selectRelationalCases(train,br).filter(e=>e.relationallyMeaningful).map(e=>e.record);
const sampled=sampleBalancedByTopology(sel,{maxSharePerShape:0.12}).sampled;
const rows=[];
for(const r of sampled){const t=buildTarget(r);
  if(!t.singleTargetSftEligible) continue;
  const opt=t.optimalSet[0]; if(opt===undefined) continue;
  const b=(r.branches??[]).find(x=>x.actionKey===opt); if(!b) continue;
  rows.push({r,key:opt,type:b.actionType,dir:b.parameters?.direction??null,
    family:b.actionType+(b.parameters?.direction?(':'+b.parameters.direction):'')});}
const cnt=(f)=>{const m={};for(const x of rows){const k=String(f(x));m[k]=(m[k]??0)+1;}return m;};
const ent=(m)=>{const t=Object.values(m).reduce((a,b)=>a+b,0);
  return Math.round(-Object.values(m).reduce((s,x)=>s+(x/t)*Math.log2(x/t),0)*10000)/10000;};
const topShare=(m)=>{const t=Object.values(m).reduce((a,b)=>a+b,0);return Math.round(Math.max(...Object.values(m))*10000/t)/10000;};
const byKey=cnt(x=>x.key), byType=cnt(x=>x.type), byFam=cnt(x=>x.family);
const a={rows:rows.length,
  canonical:{unique:Object.keys(byKey).length,entropy:ent(byKey),topShare:topShare(byKey),
    top:Object.entries(byKey).sort((a,b)=>b[1]-a[1]).slice(0,6)},
  actionType:{dist:byType,entropy:ent(byType),topShare:topShare(byType)},
  family:{dist:byFam,entropy:ent(byFam),topShare:topShare(byFam),
    top:Object.entries(byFam).sort((a,b)=>b[1]-a[1]).slice(0,8)},
  moveEastShare:Math.round((byFam['MOVE:EAST']??0)*10000/rows.length)/10000,
  moveTotalShare:Math.round((byType['MOVE']??0)*10000/rows.length)/10000,
  byTopology:cnt(x=>x.r.shape), byHorizon:cnt(x=>x.r.horizonClass),
  byLevel:cnt(x=>x.r.level), byObjective:cnt(x=>x.r.objectives)};
writeFileSync(process.argv[2] ?? path.join(__root,'build/stage3cr3/train-audit.json'),JSON.stringify(a,null,2));
console.log(JSON.stringify({rows:a.rows,canonicalUnique:a.canonical.unique,canonicalEntropy:a.canonical.entropy,
  canonicalTopShare:a.canonical.topShare,moveEastShare:a.moveEastShare,moveTotalShare:a.moveTotalShare,
  actionTypeDist:a.actionType.dist,familyTop:a.family.top,familyEntropy:a.family.entropy},null,1));
