#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const LAB=path.resolve(__dirname,'..'),ROOT=path.resolve(LAB,'..'),FROZEN=path.join(LAB,'results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN,'stage1az-forest-objective-scenario-contract.test.js');
function fingerprint(){const files=[];(function walk(d){for(const n of fs.readdirSync(d).sort()){const p=path.join(d,n);fs.statSync(p).isDirectory()?walk(p):files.push(p)}})(FROZEN);const h=crypto.createHash('sha256');for(const p of files){h.update(path.relative(FROZEN,p));h.update(fs.readFileSync(p))}return{count:files.length,digest:h.digest('hex')}}
const before=fingerprint();
for(const file of [
  'zeknova-identity-contract-v1.js',
  'zeknova-perception-event-contract-v1.js',
  'zeknova-knowledge-ledger-contract-v1.js',
  'zeknova-faction-observation-contract-v1.js',
  'zeknova-forest-defensive-action-contract-v1.js',
  'zeknova-forest-defensive-command-contract-v2.js',
  'zeknova-live-parity-closure-contract-v1.js',
  'zeknova-forest-objective-scenario-contract-v1.js',
]) vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public_html/azl',file),'utf8'),{filename:file});
const C=globalThis.ZekNovaForestObjectiveScenarioContract;
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/forest-objective-scenario-registry.json'),'utf8'));
const w0p3=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/w0p3-live-parity-closure-manifest.json'),'utf8'));
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
function throws(n,fn,re){test(n,()=>assert.throws(fn,re))}

test('contract identity',()=>assert.equal(C.CONTRACT_ID,'zeknova-forest-objective-scenario-contract-v1'));
test('registry identity',()=>assert.equal(C.REGISTRY_ID,'zeknova-forest-objective-scenarios-v1-development'));
test('objective profile identity',()=>assert.equal(C.OBJECTIVE_PROFILE_ID,'zeknova-forest-defensive-objective-v1'));
test('certification identity',()=>assert.equal(C.CERTIFICATION_ID,'zeknova-forest-defensive-scenario-certification-v1'));
test('mode evaluation only',()=>assert.equal(C.MODE,'evaluation-only-no-live-command-execution'));
test('authority none',()=>assert.equal(C.AUTHORITY,'none-no-live-command-execution'));
test('seven scenarios',()=>assert.equal(C.SCENARIO_COUNT,7));
test('nine objective priorities',()=>assert.equal(C.OBJECTIVE_PROFILE.priorities.length,9));
test('settlement survival priority zero',()=>assert.equal(C.OBJECTIVE_PROFILE.priorities[0].key,'settlement_survival'));
test('deescalation priority eight',()=>assert.equal(C.OBJECTIVE_PROFILE.priorities[8].key,'deescalation'));
test('lexicographic comparison',()=>assert.equal(C.OBJECTIVE_PROFILE.comparison,'lexicographic-no-weighted-tradeoff'));
test('scenario ids unique',()=>assert.equal(new Set(C.SCENARIOS.map(x=>x.id)).size,7));
test('all scenario versions one',()=>assert.equal(C.SCENARIOS.every(x=>x.version===1),true));
test('all scenarios failure possible declarations',()=>assert.equal(C.SCENARIOS.every(x=>x.failurePlan.length>0),true));
test('all scenarios authored success declarations',()=>assert.equal(C.SCENARIOS.every(x=>x.successPlan.length>0),true));
test('all scenarios critical actions declared',()=>assert.equal(C.SCENARIOS.every(x=>x.criticalActions.length>0),true));
test('all scenarios require real actions',()=>assert.equal(C.SCENARIOS.every(x=>x.requiredActions.every(k=>globalThis.ZekNovaForestDefensiveActionContract.ACTIONS.some(a=>a.key===k))),true));
test('W0-P.3 inherited frozen',()=>assert.equal(w0p3.status,'frozen'));
test('W0-P.3 Sentinel digests match',()=>assert.equal(w0p3.verification.sentinel_linux_portability_digest,w0p3.verification.sentinel_darwin_portability_digest));
test('W0-P.3 ZekNova digests match',()=>assert.equal(w0p3.verification.zeknova_linux_portability_digest,w0p3.verification.zeknova_darwin_portability_digest));

test('registry contract matches',()=>assert.equal(registry.contractId,C.CONTRACT_ID));
test('registry objective matches',()=>assert.equal(registry.objectiveProfileId,C.OBJECTIVE_PROFILE_ID));
test('registry certification matches',()=>assert.equal(registry.certificationId,C.CERTIFICATION_ID));
test('registry scenario count seven',()=>assert.equal(registry.scenarioCount,7));
test('registry scenarios equal contract',()=>assert.deepEqual(registry.scenarios,C.SCENARIOS));
test('registry objective equals contract',()=>assert.deepEqual(registry.objectiveProfile,C.OBJECTIVE_PROFILE));
test('registry no Sentinel authority',()=>assert.equal(registry.claims.sentinelAuthority,false));
test('registry no production authority',()=>assert.equal(registry.claims.productionAuthority,false));
test('registry no strategic competence',()=>assert.equal(registry.claims.strategicCompetence,false));
test('registry no full game dynamics claim',()=>assert.equal(registry.claims.fullGameDynamics,false));

for(const s of C.SCENARIOS){
  const rep=C.representability(s.id);
  test(s.id+' representable',()=>assert.equal(rep.representable,true));
  test(s.id+' missing mechanics zero',()=>assert.equal(rep.missingMechanics.length,0));
  test(s.id+' command parity required',()=>assert.equal(rep.commandParityRequired,true));
}

const state=C.createScenarioState('multi-crisis-priority',18427);
test('state id canonical prefix',()=>assert.match(state.stateId,/^zksz:v1:/));
test('state validates',()=>assert.equal(C.validateState(state).stateId,state.stateId));
test('state deterministic',()=>assert.equal(C.createScenarioState('multi-crisis-priority',18427).stateId,state.stateId));
test('repair legal in multi crisis',()=>assert.equal(C.legalReason(state,'repair_known_structure'),null));
test('secure resource legal in multi crisis',()=>assert.equal(C.legalReason(state,'secure_known_resource'),null));
test('wrong target action blocked',()=>assert.equal(C.legalReason(state,'fortify_known_route'),'insufficient_materials'));
const repair=C.stepScenario(state,'repair_known_structure');
test('repair completes in multi crisis',()=>assert.equal(repair.completed,true));
test('repair clears structure damage',()=>assert.equal(repair.state.flags.structureDamaged,false));
test('repair preserves core',()=>assert.ok(repair.state.criticalStructureHealth>=70));
test('repair consumes exact material cost',()=>assert.equal(repair.state.capacities.materials,0));
test('repair advances three quanta',()=>assert.equal(repair.endQuantum,3));

for(const s of C.SCENARIOS){
  const good=C.runScenario(s.id,s.successPlan,19001),bad=C.runScenario(s.id,s.failurePlan,19001);
  test(s.id+' success witness completes',()=>assert.equal(good.objectiveComplete,true));
  test(s.id+' failure witness fails',()=>assert.equal(bad.objectiveComplete,false));
  test(s.id+' objective vector beats failure',()=>assert.equal(C.compareObjectiveVectors(good.finalObjectiveVector,bad.finalObjectiveVector),1));
  test(s.id+' deterministic run id',()=>assert.equal(good.runId,C.runScenario(s.id,s.successPlan,19001).runId));
}

const cert=C.certifyAll(16);
test('certification report prefix',()=>assert.match(cert.reportId,/^zksc:v1:/));
test('certification validates',()=>assert.equal(C.validateCertification(cert).reportId,cert.reportId));
test('all scenarios certified',()=>assert.equal(cert.allScenariosCertified,true));
test('seven certification results',()=>assert.equal(cert.results.length,7));
test('sixteen seeds',()=>assert.equal(cert.seedCount,16));
test('all success rates one',()=>assert.equal(cert.results.every(r=>r.successWitnessRate===1),true));
test('all failure rates one',()=>assert.equal(cert.results.every(r=>r.failureWitnessRate===1),true));
test('all ablation failure rates one',()=>assert.equal(cert.results.every(r=>r.ablatedFailureRate===1),true));
test('all vector win rates one',()=>assert.equal(cert.results.every(r=>r.objectiveVectorWinRate===1),true));
test('all scenario results deterministic',()=>assert.equal(cert.results.every(r=>r.deterministic),true));
test('strategic competence claim false',()=>assert.equal(cert.strategicCompetenceClaim,false));
test('production authority claim false',()=>assert.equal(cert.productionAuthorityClaim,false));
test('report no wall clock',()=>assert.equal(/generatedAt|timestamp|Date\(/.test(JSON.stringify(cert)),false));
test('repeated certification byte stable',()=>assert.equal(globalThis.ZekNovaIdentityContract.canonicalStringify(cert),globalThis.ZekNovaIdentityContract.canonicalStringify(C.certifyAll(16))));

throws('unknown scenario rejected',()=>C.createScenarioState('nope',1),/Unknown scenarioId/);
throws('invalid seed rejected',()=>C.createScenarioState('damaged-core',0),/seed/);
throws('unknown action rejected',()=>C.legalReason(state,'raid_settlement'),/Unknown Forest action/);
throws('illegal action execution rejected',()=>C.stepScenario(state,'fortify_known_route'),/Illegal scenario action/);
throws('empty plan rejected',()=>C.runScenario('damaged-core',[],1),/plan/);
throws('too many seeds rejected',()=>C.certifyAll(65),/seedCount/);
throws('tampered state rejected',()=>C.validateState({...state,patrolIntegrity:1}),/stateId mismatch/);
throws('tampered certification rejected',()=>C.validateCertification({...cert,allScenariosCertified:false}),/does not match/);

test('contract has no execute',()=>assert.equal(typeof C.execute,'undefined'));
test('contract has no dispatch',()=>assert.equal(typeof C.dispatch,'undefined'));
test('contract has no issue',()=>assert.equal(typeof C.issue,'undefined'));
test('contract has no apply',()=>assert.equal(typeof C.apply,'undefined'));
test('contract has no Prime executor',()=>assert.equal(typeof C.executePrimeRecommendation,'undefined'));
const after=fingerprint();test('frozen file count unchanged',()=>assert.equal(after.count,before.count));test('frozen digest unchanged',()=>assert.equal(after.digest,before.digest));
console.log(`STAGE 1A-Z FOREST OBJECTIVE SCENARIO CONTRACT TESTS PASS (${checks}/${checks})`);
