#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enforceCheckModeReadOnly } from '../certification/check-mode-guard.mjs';
const checkOnly=process.argv.includes('--check'); enforceCheckModeReadOnly({checkOnly});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'); const top=path.resolve(root,'../..');
const env={...process.env}; delete env.NODE_TEST_CONTEXT;
const reporter=/--test-reporter(=|\s)/.test(process.env.NODE_OPTIONS??'')?[]:['--test-reporter=tap'];
const run=(cwd,args)=> {const r=spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',maxBuffer:1<<29}); const n=k=>Number(new RegExp(`^# ${k} (\\d+)$`,'m').exec(r.stdout??'')?.[1]??-1); return {exitCode:r.status,pass:n('pass'),fail:n('fail'),skipped:n('skipped')};};
const inherited=[['stage3f','scripts/stage3f-freeze-certify.mjs'],['stage3g12','scripts/certify-stage3g-predictive-integrity.mjs'],['stage3g3','scripts/stage3g3/certify.mjs'],['stage3g4','scripts/stage3g4/certify.mjs']];
let inheritance={};
const onlyTests=process.argv.includes('--only-tests');
if(onlyTests){
  inheritance=JSON.parse(readFileSync(path.join(root,'artifacts/stage3g5-observable-model-search/stage3g5-inheritance-reproduction.json'),'utf8')).inheritance;
  if(inherited.some(([name,script])=>inheritance[name]?.script!==script || inheritance[name]?.exitCode!==0 || inheritance[name]?.reproduced!==true))throw new Error('Completed read-only inherited checks required before --only-tests');
}
for (const [name,script] of onlyTests?[]:inherited) {
  process.stderr.write(`[stage3g5 suite] reproduce ${name}\n`);
  const r=spawnSync(process.execPath,['scripts/reproducibility/run-canonical.mjs',script,'--check'],{cwd:root,env,encoding:'utf8',maxBuffer:1<<29});
  inheritance[name]={exitCode:r.status,reproduced:/"reproduced": true/.test(r.stdout),script};
}
process.stderr.write('[stage3g5 suite] full platform suite\n');
const platform=run(root,['--test',...reporter]);
process.stderr.write('[stage3g5 suite] full lab suite\n');
const files=readdirSync(path.join(top,'sgrid-lab/tests')).filter(f=>f.endsWith('.test.js')).sort().map(f=>`tests/${f}`);
const lab=run(path.join(top,'sgrid-lab'),['--test',...reporter,...files]);
process.stderr.write('[stage3g5 suite] root overlay suite\n');
const r=spawnSync(process.execPath,['tests/run-node-tests.js'],{cwd:top,env,encoding:'utf8',maxBuffer:1<<28});
const overlay={exitCode:r.status,pass:r.stdout.split('\n').filter(l=>l.startsWith('ok   ')).length,fail:r.stdout.split('\n').filter(l=>l.startsWith('FAIL ')).length,cause:/Cannot find module/.test(r.stderr)?'MISSING_SIBLING_PUBLIC_HTML_AZL_TREE':null};
const record={inheritance,platform,lab,overlay,policy:'Platform and inheritance gating; historical lab/root overlay outcomes fully disclosed, unchanged from inherited stages.'};
const target=path.join(root,'artifacts/stage3g5-observable-model-search/stage3g5-full-suite.json');
if(checkOnly) {const reproduced=JSON.stringify(JSON.parse(readFileSync(target,'utf8')))===JSON.stringify(record); console.log(JSON.stringify({reproduced,record})); if(!reproduced)process.exitCode=1;}
else {writeFileSync(target,`${JSON.stringify(record,null,2)}\n`);console.log(JSON.stringify(record,null,2));}
if(platform.fail!==0 || platform.pass<=0 || Object.values(inheritance).some(v=>v.exitCode!==0||!v.reproduced))process.exitCode=1;
