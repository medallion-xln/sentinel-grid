import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {verify,checkSource,read as oldRead} from '../v3/protect.mjs';
import {manifest,raw,digest,read,save,checkManifest} from '../training-dev-v1/io.mjs';
export const DIR=dirname(fileURLToPath(import.meta.url)),GA=resolve(DIR,'../..');
export function capture(){
 const inherited=verify();checkSource(oldRead('freeze.json').source);
 const roots=['worlds','controllers','v21','v31','training-dev-v1'];
 const files={};for(const r of roots)for(const [p,h]of Object.entries(manifest(resolve(DIR,'..',r),p=>!p.includes('/runs/')&&!p.includes('/results/')&&!p.includes('/screenshots/'))))files[r+'/'+p]=h;
 for(const p of ['games.mjs','render.mjs','training-dev-v1/runs/ascii3-offline-dev-001/FINAL_RESULT.md','training-dev-v1/runs/ascii3-offline-dev-001/model-freeze.json','training-dev-v1/runs/ascii3-offline-dev-001/postflight-qualification.json'])files[p]=raw(resolve(DIR,'..',p));
 const current=execFileSync('git',['status','--short'],{cwd:GA,encoding:'utf8'});
 return{schema:'ASCII_3_2_INHERITANCE_V1',inherited,v3:oldRead('freeze.json').source,files,sourceHash:digest(files),dirtyWorktree:current,readonly:true,sealedDataAccessed:false,retainedNegative:'V1 codec cardinal gap; Rogue memory new catastrophes under delayed/stale; Rescue→Rogue zero gain; no qualified canonical ASCII MoE gain'};
}
export function verifyLocal(){const b=read(resolve(DIR,'inheritance.json'));checkSource(b.v3);return checkManifest(resolve(DIR,'..'),b.files);}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.includes('--capture'))save(resolve(DIR,'inheritance.json'),capture());console.log(JSON.stringify(verifyLocal()));}
