#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..','..');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const required=[
  'public_html/azl/zeknova-forest-objective-scenario-contract-v1.js',
  'docs/governance/forest-objective-scenario-registry.json',
  'docs/governance/w0p3-live-parity-closure-manifest.json',
  'docs/governance/stage1az-forest-objective-scenario-manifest.json',
  'sgrid-lab/tests/w0p3-live-parity-closure-contract.frozen.test.js',
  'sgrid-lab/tests/stage1az-forest-objective-scenario-contract.test.js',
  'sgrid-lab/tests/stage1az-portability-report.js'
];
let fail=0;
for(const rel of required){const p=path.join(ROOT,rel);if(!fs.existsSync(p)){console.log('  FAIL '+rel);fail++;}else console.log('  OK   '+rel+'  '+sha(fs.readFileSync(p)).slice(0,16)+'…')}
if(!fail){
  const reg=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/forest-objective-scenario-registry.json'),'utf8'));
  const old=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/w0p3-live-parity-closure-manifest.json'),'utf8'));
  const m=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az-forest-objective-scenario-manifest.json'),'utf8'));
  const contract=fs.readFileSync(path.join(ROOT,'public_html/azl/zeknova-forest-objective-scenario-contract-v1.js'));
  function ok(name,cond){if(cond)console.log('  OK   '+name);else{console.log('  FAIL '+name);fail++;}}
  ok('inherited W0-P.3 manifest is frozen',old.status==='frozen');
  ok('Stage 1A-Z manifest is frozen',m.status==='frozen');
  ok('Stage 1A-Z Sentinel Linux/Darwin digests match',m.verification.sentinel_linux_portability_digest===m.verification.sentinel_darwin_portability_digest);
  ok('Stage 1A-Z ZekNova Linux/Darwin digests match',m.verification.zeknova_linux_portability_digest===m.verification.zeknova_darwin_portability_digest);
  ok('Stage 1A-Z inherits exact W0-P.3 manifest hash',m.inherits.w0p3_manifest_sha256===sha(fs.readFileSync(path.join(ROOT,'docs/governance/w0p3-live-parity-closure-manifest.json'))));
  ok('registry contract hash matches',reg.contractSha256===sha(contract));
  ok('manifest contract hash matches',m.implementation.shared_contract.sha256===sha(contract));
  ok('seven failure-possible scenarios declared',reg.scenarioCount===7&&reg.scenarios.length===7);
  ok('objective has nine lexicographic priorities',reg.objectiveProfile.priorities.length===9&&reg.objectiveProfile.comparison==='lexicographic-no-weighted-tradeoff');
  ok('scenario witnesses and ablations declared',reg.claims.allScenariosFailurePossible===true&&reg.claims.allScenariosSolvableByAuthoredWitness===true&&reg.claims.allScenariosRequireObjectiveRelevantActions===true);
  ok('no Sentinel authority',reg.claims.sentinelAuthority===false&&m.claims.sentinel_authority===false);
  ok('no production authority',reg.claims.productionAuthority===false&&m.claims.production_authority===false);
  ok('no strategic competence claim',reg.claims.strategicCompetence===false&&m.claims.strategic_competence===false);
  ok('no full game dynamics claim',reg.claims.fullGameDynamics===false&&m.claims.full_game_dynamics===false);
}
if(fail){console.error(`\nSTAGE 1A-Z INSTALL CHECK FAIL (${fail})`);process.exit(1)}
console.log('\nSTAGE 1A-Z INSTALL CHECK PASS');
