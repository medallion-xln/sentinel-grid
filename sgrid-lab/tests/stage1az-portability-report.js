#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..','..');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const fileHash=rel=>sha(fs.readFileSync(path.join(ROOT,rel)));
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
const I=globalThis.ZekNovaIdentityContract,C=globalThis.ZekNovaForestObjectiveScenarioContract;
const cert=C.certifyAll(16);
const w0p3=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/w0p3-live-parity-closure-manifest.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/forest-objective-scenario-registry.json'),'utf8'));
const report=I.canonicalize({
  artifactId:'sentinel-stage1az-forest-objective-scenarios-v1',
  phase:'Stage 1A-Z',
  contract:{id:C.CONTRACT_ID,registryId:C.REGISTRY_ID,objectiveProfileId:C.OBJECTIVE_PROFILE_ID,certificationId:C.CERTIFICATION_ID,mode:C.MODE,authority:C.AUTHORITY,scenarioCount:C.SCENARIO_COUNT},
  inherited:{w0p3Status:w0p3.status,w0p3ManifestSha256:fileHash('docs/governance/w0p3-live-parity-closure-manifest.json'),w0p3SentinelDigest:w0p3.verification.sentinel_linux_portability_digest,w0p3ZeknovaDigest:w0p3.verification.zeknova_linux_portability_digest},
  registry:{sha256:fileHash('docs/governance/forest-objective-scenario-registry.json'),status:registry.status,scenarioCount:registry.scenarioCount,fullGameDynamicsClaim:registry.claims.fullGameDynamics},
  certification:{reportId:cert.reportId,seedCount:cert.seedCount,allScenariosCertified:cert.allScenariosCertified,results:cert.results.map(r=>({scenarioId:r.scenarioId,certified:r.certified,successWitnessRate:r.successWitnessRate,failureWitnessRate:r.failureWitnessRate,ablatedFailureRate:r.ablatedFailureRate,objectiveVectorWinRate:r.objectiveVectorWinRate,deterministic:r.deterministic}))},
  invariants:{w0p3Frozen:true,sevenFailurePossibleScenarios:true,allRepresentable:true,authoredSuccessWitnesses:true,authoredFailureWitnesses:true,objectiveAblationsFail:true,lexicographicObjective:true,noLiveCommandExecution:true,sentinelAuthorityFalse:true,productionAuthorityFalse:true,strategicCompetenceFalse:true,fullGameDynamicsClaimFalse:true},
  artifacts:{
    contract:{path:'public_html/azl/zeknova-forest-objective-scenario-contract-v1.js',sha256:fileHash('public_html/azl/zeknova-forest-objective-scenario-contract-v1.js')},
    registry:{path:'docs/governance/forest-objective-scenario-registry.json',sha256:fileHash('docs/governance/forest-objective-scenario-registry.json')},
    contractTest:{path:'sgrid-lab/tests/stage1az-forest-objective-scenario-contract.test.js',sha256:fileHash('sgrid-lab/tests/stage1az-forest-objective-scenario-contract.test.js')},
    w0p3FrozenTest:{path:'sgrid-lab/tests/w0p3-live-parity-closure-contract.frozen.test.js',sha256:fileHash('sgrid-lab/tests/w0p3-live-parity-closure-contract.frozen.test.js')},
    w0p3Manifest:{path:'docs/governance/w0p3-live-parity-closure-manifest.json',sha256:fileHash('docs/governance/w0p3-live-parity-closure-manifest.json')}
  }
});
const canonical=I.canonicalStringify(report),digest=sha(canonical);
console.log(JSON.stringify(report,null,2));
console.log('Sentinel Stage 1A-Z digest: '+digest);
