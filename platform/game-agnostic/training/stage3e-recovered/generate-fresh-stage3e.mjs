/* STAGE3D_SHADOW_QUALIFICATION_V1 — fresh corpus.
 * Historical corpora used seeds [1,2,3] (main) and [11] (OOD). This uses
 * [101,102,103] and [111]: disjoint seed space, so no scenario identity can
 * collide by construction. Overlap is still PROVEN by hash, not assumed. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enumerateCurriculumV2 } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/forge/scenarios-v2.js';
import { buildRecordV2 } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/forge/record-v2.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const outDir=path.join(here,'corpus');
export const FRESH_SEEDS=[201,202,203];
export const FRESH_LEVELS=[0,1,2,3,4,5];
export const FRESH_OOD_LEVELS=[6,7];
export const FRESH_OOD_SEEDS=[211];
function combos(){
  const main=enumerateCurriculumV2({levels:FRESH_LEVELS,seeds:FRESH_SEEDS}).map(c=>({combination:c,ood:false}));
  const ood=enumerateCurriculumV2({levels:FRESH_OOD_LEVELS,seeds:FRESH_OOD_SEEDS}).map(c=>({combination:c,ood:true}));
  return [...main,...ood];
}
async function runWorker(i,total){
  const all=combos(); const recs=[]; let gen=0,adm=0,rej=0;
  for(let k=i;k<all.length;k+=total){
    const {combination,ood}=all[k]; gen++;
    let r; try{ r=buildRecordV2(combination,ood); }catch{ rej++; continue; }
    if(!r.admitted){ rej++; continue; }
    adm++; recs.push(r.record);
  }
  await mkdir(outDir,{recursive:true});
  const body=recs.map(x=>JSON.stringify(x)).join('\n');
  await writeFile(path.join(outDir,`w-${i}.jsonl`), body===''?'':`${body}\n`);
  process.stdout.write(`worker ${i}/${total}: generated ${gen} admitted ${adm} rejected ${rej}\n`);
}
const wf=process.argv.indexOf('--worker');
if(wf>=0){ await runWorker(Number(process.argv[wf+1]),Number(process.argv[wf+3])); }
else{
  const W=Math.max(1,Math.min(os.cpus().length,4));
  await mkdir(outDir,{recursive:true});
  const t0=Date.now();
  await Promise.all(Array.from({length:W},(_,i)=>new Promise((res,rej)=>{
    const p=spawn(process.execPath,[fileURLToPath(import.meta.url),'--worker',String(i),'OF',String(W)],{stdio:'inherit'});
    p.on('exit',c=>c===0?res():rej(new Error('worker '+i+' exit '+c)));})));
  const { readdir, readFile } = await import('node:fs/promises');
  const names=(await readdir(outDir)).filter(n=>/^w-\d+\.jsonl$/.test(n)).sort();
  const lines=[];
  for(const n of names){ const t=await readFile(path.join(outDir,n),'utf8'); if(t.trim()) lines.push(...t.trim().split('\n')); }
  lines.sort((a,b)=>{const x=JSON.parse(a).recordHash,y=JSON.parse(b).recordHash; return x<y?-1:x>y?1:0;});
  await writeFile(path.join(outDir,'fresh-corpus.jsonl'), lines.join('\n')+'\n');
  console.log(`merged ${lines.length} records in ${Math.round((Date.now()-t0)/1000)}s`);
}
