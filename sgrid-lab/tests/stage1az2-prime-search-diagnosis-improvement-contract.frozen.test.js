#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const m=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az2-prime-search-diagnosis-improvement-manifest.json'),'utf8'));
const r=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/prime-search-diagnosis-improvement-registry.json'),'utf8'));
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
test('Stage 1A-Z.2 manifest phase',()=>assert.equal(m.phase,'Stage 1A-Z.2'));
test('Stage 1A-Z.2 manifest frozen',()=>assert.equal(m.status,'frozen'));
test('Sentinel Linux Darwin digests match',()=>assert.equal(m.verification.sentinel_linux_portability_digest,m.verification.sentinel_darwin_portability_digest));
test('ZekNova Linux Darwin digests match',()=>assert.equal(m.verification.zeknova_linux_portability_digest,m.verification.zeknova_darwin_portability_digest));
test('Sentinel digest exact',()=>assert.equal(m.verification.sentinel_linux_portability_digest,'68b4a8ce6356d95e4b556620084ab5c9bdb74ff8c9bd7a5dc91ecff636e7704a'));
test('ZekNova digest exact',()=>assert.equal(m.verification.zeknova_linux_portability_digest,'67666dab0578d78bd2a060428ae95ac6a4922c7b053c963a3b945854c579c09e'));
test('frozen report exact',()=>assert.equal(r.canonicalEvaluation.reportId,'zkpdi-report:v1:c471fc9eb54c0418'));
test('search improvement gates passed',()=>assert.equal(r.canonicalEvaluation.searchImprovementGates.allSearchImprovementGatesPassed,true));
test('frozen authority remains false',()=>assert.equal(r.claims.sentinelAuthority,false));
test('frozen competence remains false',()=>assert.equal(r.claims.strategicCompetence,false));
console.log(`STAGE 1A-Z.2 PRIME SEARCH IMPROVEMENT FROZEN CERTIFICATION PASS (${checks}/${checks})`);
