#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LAB=path.resolve(__dirname,'..'),ROOT=path.resolve(LAB,'..'),FROZEN=path.join(LAB,'results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN,'stage1az-forest-objective-scenario-contract.frozen.test.js');
function fingerprint(){const files=[];(function walk(d){for(const n of fs.readdirSync(d).sort()){const p=path.join(d,n);fs.statSync(p).isDirectory()?walk(p):files.push(p)}})(FROZEN);const h=crypto.createHash('sha256');for(const p of files){h.update(path.relative(FROZEN,p));h.update(fs.readFileSync(p))}return{count:files.length,digest:h.digest('hex')}}
const before=fingerprint(),m=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az-forest-objective-scenario-manifest.json'),'utf8')),r=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/forest-objective-scenario-registry.json'),'utf8'));
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
test('Stage 1A-Z manifest phase',()=>assert.equal(m.phase,'Stage 1A-Z'));
test('Stage 1A-Z manifest frozen',()=>assert.equal(m.status,'frozen'));
test('Stage 1A-Z Sentinel Linux/Darwin digests match',()=>assert.equal(m.verification.sentinel_linux_portability_digest,m.verification.sentinel_darwin_portability_digest));
test('Stage 1A-Z ZekNova Linux/Darwin digests match',()=>assert.equal(m.verification.zeknova_linux_portability_digest,m.verification.zeknova_darwin_portability_digest));
test('Stage 1A-Z Sentinel digest exact',()=>assert.equal(m.verification.sentinel_linux_portability_digest,'16f0c5084636555d62fbff43fb08c15a299487ddaef308b4cd0673bfbb3d6c4d'));
test('Stage 1A-Z ZekNova digest exact',()=>assert.equal(m.verification.zeknova_linux_portability_digest,'4d8738e33385fc216f76caf029c135b759227af3863eae07eddfb6447dc15d98'));
test('seven scenarios frozen',()=>assert.equal(r.scenarioCount,7));
test('nine objective priorities frozen',()=>assert.equal(r.objectiveProfile.priorities.length,9));
test('scenario certification no authority',()=>assert.equal(r.claims.sentinelAuthority,false));
test('strategic competence remains false',()=>assert.equal(r.claims.strategicCompetence,false));
const after=fingerprint();test('frozen file count unchanged',()=>assert.equal(after.count,before.count));test('frozen digest unchanged',()=>assert.equal(after.digest,before.digest));
console.log(`STAGE 1A-Z FOREST OBJECTIVE SCENARIO FROZEN CERTIFICATION PASS (${checks}/${checks})`);
