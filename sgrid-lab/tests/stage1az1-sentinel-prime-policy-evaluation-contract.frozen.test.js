#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const m=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az1-sentinel-prime-policy-evaluation-manifest.json'),'utf8'));
const r=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/sentinel-prime-policy-evaluation-registry.json'),'utf8'));
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
test('Stage 1A-Z.1 manifest phase',()=>assert.equal(m.phase,'Stage 1A-Z.1'));
test('Stage 1A-Z.1 manifest frozen',()=>assert.equal(m.status,'frozen'));
test('Sentinel Linux Darwin digests match',()=>assert.equal(m.verification.sentinel_linux_portability_digest,m.verification.sentinel_darwin_portability_digest));
test('ZekNova Linux Darwin digests match',()=>assert.equal(m.verification.zeknova_linux_portability_digest,m.verification.zeknova_darwin_portability_digest));
test('Sentinel digest exact',()=>assert.equal(m.verification.sentinel_linux_portability_digest,'1e1c565d3817ba2cc5d8d5bb68ce4e6ea016340fa603992b7fbe32b7d7736897'));
test('ZekNova digest exact',()=>assert.equal(m.verification.zeknova_linux_portability_digest,'fadf30db72caf7cdafc1d834f4ff279af24e78879b2d6ac0a78378ba1da034c9'));
test('frozen report exact',()=>assert.equal(r.canonicalEvaluation.reportId,'zkpe-report:v1:3f4d58e9410a80a7'));
test('frozen Prime gates failed',()=>assert.equal(r.canonicalEvaluation.primeGates.allDevelopmentGatesPassed,false));
test('frozen authority remains false',()=>assert.equal(r.claims.sentinelAuthority,false));
test('frozen competence remains false',()=>assert.equal(r.claims.strategicCompetence,false));
console.log(`STAGE 1A-Z.1 SENTINEL PRIME POLICY EVALUATION FROZEN CERTIFICATION PASS (${checks}/${checks})`);
