#!/usr/bin/env node
/* STAGE_3G_9 Phase 0: reproduce the eight inherited certificates with their own --check criteria.
 * Each check runs under the canonical read-only wrapper. A check passes only with exit 0, a reproduced flag in its
 * own output, the stored certificate hash in its output, and an unchanged tracked tree. Long checks run concurrently;
 * concurrency is orchestration only and changes no criterion.
 */
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,createWriteStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {trackedTreeFingerprint} from '../scripts/certification/check-mode-guard.mjs';
import {INHERITED,OUT,INHERITANCE_PATH} from './inherited.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),top=path.resolve(root,'../..');
const hex=v=>createHash('sha256').update(v).digest('hex');
const fingerprint=()=>hex(trackedTreeFingerprint(top));
const head=()=>spawnSync('git',['-C',top,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
const logs=path.join(root,'build/stage3g9/inherit-logs');mkdirSync(logs,{recursive:true});
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const width=Number(process.argv.find(a=>a.startsWith('--parallel='))?.slice(11)??4);
const run=(name,spec)=>new Promise(resolve=>{const command=[process.execPath,'scripts/reproducibility/run-canonical.mjs',spec.script,'--check'],logPath=path.join(logs,name+'.log'),out=createWriteStream(logPath),before=fingerprint(),start=performance.now();process.stderr.write(`[G9 inherit] start ${name}\n`);
 const child=spawn(command[0],command.slice(1),{cwd:root,env:{...process.env},stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',d=>{text+=d;out.write(d);});child.stderr.on('data',d=>{text+=d;out.write(d);});
 child.on('close',code=>{out.end();const after=fingerprint(),stored=JSON.parse(readFileSync(path.join(root,spec.certificate),'utf8')).certificationHash;const reproducedFlag=/"(reproduced|CERTIFICATION_REPRODUCED)":\s*true/.test(text);const record={command:['node',...command.slice(1)],exitCode:code,runtimeSeconds:(performance.now()-start)/1000,scriptSha256:hex(readFileSync(path.join(root,spec.script))),logSha256:hex(text),logPath:path.relative(root,logPath),beforeFingerprint:before,afterFingerprint:after,trackedStateUnchanged:before===after,certificatePath:spec.certificate,certificateFileSha256:hex(readFileSync(path.join(root,spec.certificate))),storedCertificationHash:stored,expectedCertificationHash:spec.hash,storedMatchesExpected:stored===spec.hash,hashInOutput:text.includes(spec.hash),reproducedFlag,tail:text.slice(-1200)};record.reproduced=code===0&&reproducedFlag&&record.hashInOutput&&record.storedMatchesExpected&&record.trackedStateUnchanged;process.stderr.write(`[G9 inherit] done ${name} exit=${code} reproduced=${record.reproduced} ${Math.round(record.runtimeSeconds)}s\n`);resolve([name,record]);});});
const names=Object.keys(INHERITED).filter(n=>!only||only.includes(n));const queue=[...names].sort((a,b)=>INHERITED[b].expectedSeconds-INHERITED[a].expectedSeconds),results={};const startHead=head(),startFingerprint=fingerprint();
await Promise.all(Array.from({length:Math.min(width,queue.length)},async()=>{while(queue.length){const n=queue.shift();const [k,v]=await run(n,INHERITED[n]);results[k]=v;}}));
const checks=Object.fromEntries(names.map(n=>[n,results[n]]));const record={stage:'STAGE3G9',checks,INHERITANCE_INTACT:names.length===Object.keys(INHERITED).length&&Object.values(checks).every(c=>c.reproduced),STAGE3G8_CERTIFICATION_HASH:INHERITED.stage3g8.hash,trackedState:{head:startHead,headAfter:head(),beforeFingerprint:startFingerprint,afterFingerprint:fingerprint()},orchestration:{parallel:width,note:'Concurrent execution of independent read-only checks; criteria unchanged. Untracked Stage 3G.9 files may exist during the run; no ancestor scans the stage3g9 directory.'},runtime:`Node.js ${process.versions.node} with SENTINEL_CANONICAL_NUMERICS_V1 via run-canonical`};
record.trackedState.unchanged=record.trackedState.beforeFingerprint===record.trackedState.afterFingerprint&&record.trackedState.head===record.trackedState.headAfter;record.INHERITANCE_INTACT&&=record.trackedState.unchanged;
const file=only?path.join(root,`build/stage3g9/inheritance-partial-${only.join('-')}.json`):path.join(root,INHERITANCE_PATH);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({INHERITANCE_INTACT:record.INHERITANCE_INTACT,checks:Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,{exit:v.exitCode,reproduced:v.reproduced,seconds:Math.round(v.runtimeSeconds)}]))},null,2));if(!record.INHERITANCE_INTACT)process.exitCode=1;
