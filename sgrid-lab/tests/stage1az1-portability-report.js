#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..','..');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),fileHash=rel=>sha(fs.readFileSync(path.join(ROOT,rel)));
for(const f of ['zeknova-identity-contract-v1.js','zeknova-perception-event-contract-v1.js','zeknova-knowledge-ledger-contract-v1.js','zeknova-faction-observation-contract-v1.js','zeknova-forest-defensive-action-contract-v1.js','zeknova-forest-defensive-command-contract-v2.js','zeknova-live-parity-closure-contract-v1.js','zeknova-forest-objective-scenario-contract-v1.js','zeknova-sentinel-prime-policy-evaluation-contract-v1.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT,'public_html/azl',f),'utf8'),{filename:f});
const I=globalThis.ZekNovaIdentityContract,C=globalThis.ZekNovaSentinelPrimePolicyEvaluationContract;
const report=C.evaluateAll(16),stage=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/stage1az-forest-objective-scenario-manifest.json'),'utf8')),registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/sentinel-prime-policy-evaluation-registry.json'),'utf8'));
const primary=report.policyResults.filter(r=>C.PRIMARY_POLICY_IDS.includes(r.policyId)).map(r=>({policyId:r.policyId,objectiveSuccessRate:r.objectiveSuccessRate,settlementSurvivalRate:r.settlementSurvivalRate,illegalProposalRate:r.illegalProposalRate,scenarioResults:r.scenarioResults.map(s=>({scenarioId:s.scenarioId,objectiveSuccessRate:s.objectiveSuccessRate,settlementSurvivalRate:s.settlementSurvivalRate}))}));
const out=I.canonicalize({
 artifactId:'sentinel-stage1az1-prime-policy-evaluation-v1',phase:'Stage 1A-Z.1',
 contract:{id:C.CONTRACT_ID,registryId:C.REGISTRY_ID,evaluationId:C.EVALUATION_ID,mode:C.MODE,authority:C.AUTHORITY,policyCount:C.POLICY_COUNT,primeSimulations:C.PRIME_SIMULATIONS},
 inherited:{stage1azStatus:stage.status,stage1azManifestSha256:fileHash('docs/governance/stage1az-forest-objective-scenario-manifest.json'),stage1azSentinelDigest:stage.verification.sentinel_linux_portability_digest,stage1azZeknovaDigest:stage.verification.zeknova_linux_portability_digest},
 evaluation:{reportId:report.reportId,seedCount:report.seedCount,totalRunCount:report.totalRunCount,primaryPolicies:primary,primePairwise:report.primePairwise,primeGates:report.primeGates,strategicCompetenceCertified:report.strategicCompetenceCertified,primeOutperformsActualIncumbentClaim:report.primeOutperformsActualIncumbentClaim,incumbentComparisonStatus:report.incumbentComparisonStatus},
 registry:{sha256:fileHash('docs/governance/sentinel-prime-policy-evaluation-registry.json'),status:registry.status,canonicalReportId:registry.canonicalEvaluation.reportId},
 invariants:{stage1azFrozen:true,eighteenPolicies:true,thirteenSpamControls:true,uniformPriorPuct:true,noAuthoredWitnessPlanReads:true,primeLegal:true,primeDevelopmentGatesPassed:false,noLiveCommandExecution:true,sentinelAuthorityFalse:true,productionAuthorityFalse:true,strategicCompetenceFalse:true,actualIncumbentOutperformanceClaimFalse:true,fullGameDynamicsClaimFalse:true},
 artifacts:{
  contract:{path:'public_html/azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js',sha256:fileHash('public_html/azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js')},
  registry:{path:'docs/governance/sentinel-prime-policy-evaluation-registry.json',sha256:fileHash('docs/governance/sentinel-prime-policy-evaluation-registry.json')},
  contractTest:{path:'sgrid-lab/tests/stage1az1-sentinel-prime-policy-evaluation-contract.test.js',sha256:fileHash('sgrid-lab/tests/stage1az1-sentinel-prime-policy-evaluation-contract.test.js')},
  stage1azFrozenTest:{path:'sgrid-lab/tests/stage1az-forest-objective-scenario-contract.frozen.test.js',sha256:fileHash('sgrid-lab/tests/stage1az-forest-objective-scenario-contract.frozen.test.js')},
  stage1azManifest:{path:'docs/governance/stage1az-forest-objective-scenario-manifest.json',sha256:fileHash('docs/governance/stage1az-forest-objective-scenario-manifest.json')}
 }
});
const canonical=I.canonicalStringify(out),digest=sha(canonical);console.log(JSON.stringify(out,null,2));console.log('Sentinel Stage 1A-Z.1 digest: '+digest);
