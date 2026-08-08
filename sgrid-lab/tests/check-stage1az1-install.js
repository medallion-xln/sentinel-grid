#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..','..'),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const required=[
 'public_html/azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js',
 'docs/governance/sentinel-prime-policy-evaluation-registry.json',
 'docs/governance/stage1az-forest-objective-scenario-manifest.json',
 'docs/governance/stage1az1-sentinel-prime-policy-evaluation-manifest.json',
 'sgrid-lab/tests/stage1az-forest-objective-scenario-contract.frozen.test.js',
 'sgrid-lab/tests/stage1az1-sentinel-prime-policy-evaluation-contract.test.js',
 'sgrid-lab/tests/stage1az1-portability-report.js'
];
let fail=0;for(const rel of required){const p=path.join(ROOT,rel);if(!fs.existsSync(p)){console.log('  FAIL '+rel);fail++;}else console.log('  OK   '+rel+'  '+sha(fs.readFileSync(p)).slice(0,16)+'…')}
function ok(n,c){if(c)console.log('  OK   '+n);else{console.log('  FAIL '+n);fail++;}}
if(!fail){
 const r=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/sentinel-prime-policy-evaluation-registry.json'),'utf8'));
 const old=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az-forest-objective-scenario-manifest.json'),'utf8'));
 const m=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az1-sentinel-prime-policy-evaluation-manifest.json'),'utf8'));
 const contract=fs.readFileSync(path.join(ROOT,'public_html/azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js'));
 ok('inherited Stage 1A-Z manifest is frozen',old.status==='frozen');
 ok('Stage 1A-Z.1 manifest is provisional',m.status==='provisional-linux-only');
 ok('Stage 1A-Z.1 inherits exact Stage 1A-Z manifest hash',m.inherits.stage1az_manifest_sha256===sha(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az-forest-objective-scenario-manifest.json'))));
 ok('registry contract hash matches',r.contractSha256===sha(contract));
 ok('manifest contract hash matches',m.implementation.shared_contract.sha256===sha(contract));
 ok('eighteen policies declared',r.policyCount===18);
 ok('thirteen spam controls declared',r.spamPolicyIds.length===13);
 ok('Prime has 96 simulations',r.prime.simulationsPerDecision===96);
 ok('canonical report id exact',r.canonicalEvaluation.reportId==='zkpe-report:v1:3f4d58e9410a80a7');
 ok('Prime development gates fail honestly',r.canonicalEvaluation.primeGates.allDevelopmentGatesPassed===false);
 ok('incumbent comparison proxy only',r.incumbentComparison.actualLivePlannerBound===false);
 ok('no strategic competence claim',r.claims.strategicCompetence===false&&m.claims.strategic_competence===false);
 ok('no actual incumbent outperformance claim',r.claims.primeOutperformsActualIncumbent===false&&m.claims.prime_outperforms_actual_incumbent===false);
 ok('no Sentinel authority',r.claims.sentinelAuthority===false&&m.claims.sentinel_authority===false);
 ok('no production authority',r.claims.productionAuthority===false&&m.claims.production_authority===false);
}
if(fail){console.error(`\nSTAGE 1A-Z.1 INSTALL CHECK FAIL (${fail})`);process.exit(1)}
console.log('\nSTAGE 1A-Z.1 INSTALL CHECK PASS');
