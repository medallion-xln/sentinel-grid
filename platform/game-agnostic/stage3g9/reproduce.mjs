#!/usr/bin/env node
/* STAGE_3G_9 reproduction proof (verification only; never changes a certified artifact).
 *   --two-checks          run the certifier --check twice under run-canonical; record hashes and tracked fingerprints.
 *   --clone=<dir>         fresh clone at HEAD; import only hash-verified ancestor raw inputs; rebuild Stage 3G.9 sealed rows,
 *                         OPEN and sealed evidence from source; run --verify-open, --check and the Stage 3G.9 tests there.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {trackedTreeFingerprint} from '../scripts/certification/check-mode-guard.mjs';
import {OUT,RESULT_PATH} from './plan.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),top=path.resolve(root,'../..'),hex=v=>createHash('sha256').update(v).digest('hex');
const sh=(cmd,args,cwd)=>{const start=performance.now(),r=spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:1<<29,env:{...process.env}});const log=(r.stdout??'')+(r.stderr??'');return {command:[path.basename(cmd)==='node'||cmd===process.execPath?'node':cmd,...args],exitCode:r.status,runtimeSeconds:(performance.now()-start)/1000,logSha256:hex(log),tail:log.slice(-900),log};};
const strip=({log,...x})=>x;const stored=JSON.parse(readFileSync(path.join(root,RESULT_PATH),'utf8')).certificationHash;
if(process.argv.includes('--two-checks')){const checks=[];for(let i=0;i<2;i++){const before=hex(trackedTreeFingerprint(top)),r=sh(process.execPath,['scripts/reproducibility/run-canonical.mjs','stage3g9/certify.mjs','--check'],root),after=hex(trackedTreeFingerprint(top));checks.push({...strip(r),beforeFingerprint:before,afterFingerprint:after,trackedStateUnchanged:before===after,reproduced:r.exitCode===0&&/"CERTIFICATION_REPRODUCED": true/.test(r.log)&&r.log.includes(stored)});}
 const doc={stage:'STAGE3G9',storedCertificationHash:stored,head:spawnSync('git',['-C',top,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),checks,CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE:checks.every(c=>c.trackedStateUnchanged),allReproduced:checks.every(c=>c.reproduced)};writeFileSync(path.join(root,OUT,'stage3g9-two-checks.json'),JSON.stringify(doc,null,2)+'\n');console.log(JSON.stringify({allReproduced:doc.allReproduced,readOnly:doc.CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE},null,2));if(!doc.allReproduced)process.exitCode=1;}
const cloneArg=process.argv.find(a=>a.startsWith('--clone='));
if(cloneArg){const dir=cloneArg.slice(8);if(existsSync(dir))rmSync(dir,{recursive:true,force:true});const head=spawnSync('git',['-C',top,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();const steps=[];steps.push(strip(sh('git',['clone','-q','--no-local',top,dir],top)));const ga=path.join(dir,'platform/game-agnostic');
 // Only ancestor raw inputs (gitignored payloads) are imported; each is verified against its tracked manifest by the code that reads it. No Stage 3G.9 payload or cache is copied.
 const listed=spawnSync('git',['-C',root,'ls-files','--others','--ignored','--exclude-standard','artifacts'],{encoding:'utf8'}).stdout.split('\n').filter(f=>f.endsWith('.jsonl.gz'));const ancestors=[...listed,'build/stage3g6/fit-set.jsonl.gz','build/stage3g6/sealed-partitions.jsonl.gz','build/stage3g7/fit-set.jsonl.gz','build/stage3g7/sealed-partitions.jsonl.gz','build/stage3g8/sealed-partitions.jsonl.gz'];
 const imported=ancestors.map(f=>{mkdirSync(path.dirname(path.join(ga,f)),{recursive:true});cpSync(path.join(root,f),path.join(ga,f));return {file:f,sha256:hex(readFileSync(path.join(root,f)))};});
 const cloneHead=spawnSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),noG8Build=!existsSync(path.join(ga,'build/stage3g9'));
 const gen=sh(process.execPath,['stage3g9/generate.mjs','--verify'],ga);steps.push(strip(gen));
 const vo=sh(process.execPath,['scripts/reproducibility/run-canonical.mjs','stage3g9/certify.mjs','--verify-open'],ga);steps.push(strip(vo));
 const ck=sh(process.execPath,['scripts/reproducibility/run-canonical.mjs','stage3g9/certify.mjs','--check'],ga);steps.push(strip(ck));
 const tests=sh(process.execPath,['--test','--test-reporter=tap','tests/stage3g9-c2-requalification.test.js'],ga);steps.push(strip(tests));
 const doc={stage:'STAGE3G9',head,cloneHead,storedCertificationHash:stored,importedAncestorRawInputs:imported,stage3g8BuildAbsentBeforeRebuild:noG8Build,steps,
  SEALED_REBUILT:gen.exitCode===0&&/"reproduced": true/.test(gen.log),OPEN_REPRODUCED:vo.exitCode===0&&/"OPEN_REPRODUCED":true/.test(vo.log),CERTIFICATION_REPRODUCED:ck.exitCode===0&&/"CERTIFICATION_REPRODUCED": true/.test(ck.log)&&ck.log.includes(stored),TESTS_PASS:tests.exitCode===0};
 doc.FRESH_CLONE_REPRODUCED=cloneHead===head&&noG8Build&&doc.SEALED_REBUILT&&doc.OPEN_REPRODUCED&&doc.CERTIFICATION_REPRODUCED&&doc.TESTS_PASS;writeFileSync(path.join(root,OUT,'stage3g9-reproduction-proof.json'),JSON.stringify(doc,null,2)+'\n');console.log(JSON.stringify({FRESH_CLONE_REPRODUCED:doc.FRESH_CLONE_REPRODUCED,SEALED_REBUILT:doc.SEALED_REBUILT,OPEN_REPRODUCED:doc.OPEN_REPRODUCED,CERTIFICATION_REPRODUCED:doc.CERTIFICATION_REPRODUCED,TESTS_PASS:doc.TESTS_PASS},null,2));if(!doc.FRESH_CLONE_REPRODUCED)process.exitCode=1;}
