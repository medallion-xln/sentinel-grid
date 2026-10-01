#!/usr/bin/env node
/* STAGE_3G_FREEZE_V1 builder. Deterministic: every certified input is read at CANONICAL_PARENT_COMMIT through git,
 * every bound value is resolved from its certified source and must equal the frozen value, and live schema modules
 * must hash to their certified hashes. Writes the freeze artifact (default) or compares it byte for byte (--verify).
 * No experiment is run and no scientific conclusion is produced.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha256} from '../src/core/determinism.js';
import {enforceCheckModeReadOnly} from '../scripts/certification/check-mode-guard.mjs';
import {EPISTEMIC_SCHEMA_ID,EPISTEMIC_SCHEMA_HASH} from '../src/stage3g/epistemic-provenance-v1.js';
import {OBSERVABLE_ENTITY_STATE_ID,OBSERVABLE_ENTITY_STATE_SCHEMA_HASH} from '../src/stage3g/observable-entity-state-v1.js';
import {ACTION_SEMANTICS_ID,ACTION_SEMANTICS_SCHEMA_HASH} from '../src/stage3g/action-semantics-v1.js';
import {ACTION_MODEL_SCHEMA,ACTION_MODEL_SCHEMA_HASH} from '../src/stage3g/deployable-action-model-v1.js';
import {ACTION_SURFACE_SCHEMA,ACTION_SURFACE_HASH} from '../src/stage3g/observable-action-surface-v1.js';
import {PREDICTION_LIFECYCLE_SCHEMA,PREDICTION_LIFECYCLE_SCHEMA_HASH} from '../src/stage3g/prediction-lifecycle-v1.js';
import {CONTRACT as TARGET_CONTRACT,CONTRACT_HASH as TARGET_CONTRACT_HASH} from '../src/stage3g7/target-eligibility-contract-v1.js';
import {CURRENT_OBSERVATION_BOUNDARY_V2,CURRENT_OBSERVATION_BOUNDARY_V2_HASH} from '../stage3g8/observation-boundary-v2.mjs';
import {TYPED_RELATION_DISCLOSURE_SCHEMA,TYPED_RELATION_DISCLOSURE_SCHEMA_HASH} from '../stage3g8/typed-relation-disclosure-v1.mjs';
import {SEMANTIC_CHANNEL_SCHEMA,SEMANTIC_CHANNEL_SCHEMA_HASH} from '../stage3g9/typed-relation-semantic-channel-v1.mjs';
import * as P from './plan.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),top=path.resolve(root,'../..'),GA='platform/game-agnostic/';
const hex=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>{const r=spawnSync('git',['-C',top,...a],{encoding:'buffer',maxBuffer:1<<29});if(r.status!==0)throw Error('GIT '+a.join(' ')+': '+r.stderr);return r.stdout;};
const atParent=f=>git('show',`${P.CANONICAL_PARENT_COMMIT}:${GA}${f}`);
const jsonAtParent=f=>JSON.parse(atParent(f).toString('utf8'));
const get=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o);
const mods={'src/stage3g/prediction-lifecycle-v1.js':{PREDICTION_LIFECYCLE_SCHEMA},'stage3g8/typed-relation-disclosure-v1.mjs':{TYPED_RELATION_DISCLOSURE_SCHEMA}};
function mismatch(what,expected,actual){throw Error(`FREEZE_BINDING_MISMATCH ${what}: expected ${JSON.stringify(expected)} certified ${JSON.stringify(actual)}`);}

export function buildFreeze(){
 const parent=P.CANONICAL_PARENT_COMMIT,firstParent=new Set(git('rev-list','--first-parent',parent).toString().trim().split('\n'));
 // ---- lineage and certificates (read at the parent commit)
 const certs={},stages={};
 for(const [k,f] of Object.entries(P.STAGES)){const raw=atParent(f),doc=JSON.parse(raw.toString('utf8')),touches=git('log','--format=%H',parent,'--',GA+f).toString().trim().split('\n').filter(Boolean),added=touches.at(-1);
  if(doc.status!=='PASS')mismatch(k+'.status','PASS',doc.status);if(doc.certificationHash!==P.INHERITED[k].hash)mismatch(k+'.certificationHash',P.INHERITED[k].hash,doc.certificationHash);
  certs[k]=doc;stages[k]={certificate:f,BOUND_SEMANTIC_HASH:{field:'certificationHash',value:doc.certificationHash},RAW_FILE_SHA256:hex(raw),certificationCommit:added,commitsTouchingCertificate:touches.length,onCanonicalFirstParentLineage:firstParent.has(added),unchangedSinceCertification:touches.length===1};}
 const f3=jsonAtParent(P.STAGE3F_FREEZE),f3raw=atParent(P.STAGE3F_FREEZE),f3cert=jsonAtParent('artifacts/stage3f-freeze/stage3f-freeze-certification-result.json'),g12=certs.stage3g12.stage3fInheritance;
 const lineage={CANONICAL_BRANCH:P.CANONICAL_BRANCH,CANONICAL_PARENT_COMMIT:parent,stages,stage3f:{STAGE3F_FREEZE_HASH:f3.freezeHash,STAGE3F_FREEZE_RAW_FILE_SHA256:hex(f3raw),STAGE3F_CERTIFICATION_HASH:f3cert.certificationHash,FREEZE_COMMIT:g12.FREEZE_COMMIT,FREEZE_CERTIFICATION_COMMIT:g12.FREEZE_CERTIFICATION_COMMIT,freezeCommitsOnLineage:firstParent.has(g12.FREEZE_COMMIT)&&firstParent.has(g12.FREEZE_CERTIFICATION_COMMIT),boundByStage3g12:g12.STAGE3F_FREEZE_HASH===f3.freezeHash&&g12.STAGE3F_CERTIFICATION_HASH===f3cert.certificationHash}};
 lineage.CANONICAL_STAGE3G_LINEAGE_VALID=Object.values(stages).every(s=>s.onCanonicalFirstParentLineage&&s.unchangedSinceCertification)&&lineage.stage3f.freezeCommitsOnLineage&&lineage.stage3f.boundByStage3g12&&firstParent.has(parent);
 if(!lineage.CANONICAL_STAGE3G_LINEAGE_VALID)mismatch('lineage',true,lineage);
 // ---- reproduction record (Phase 1)
 const repRaw=readFileSync(path.join(root,P.INHERITANCE_PATH)),rep=JSON.parse(repRaw);const reproduction={file:P.INHERITANCE_PATH,RAW_FILE_SHA256:hex(repRaw),checks:Object.fromEntries(Object.entries(rep.checks).map(([k,c])=>[k,{reproduced:c.reproduced,exitCode:c.exitCode,certificationHash:c.storedCertificationHash,trackedStateUnchanged:c.trackedStateUnchanged,runtimeSeconds:Math.round(c.runtimeSeconds)}])),head:rep.trackedState.head,trackedStateUnchanged:rep.trackedState.unchanged};
 reproduction.ALL_STAGE3G_CERTIFICATES_REPRODUCED=rep.INHERITANCE_INTACT===true&&Object.keys(rep.checks).length===9&&Object.keys(P.INHERITED).every(k=>rep.checks[k]?.reproduced===true&&rep.checks[k].storedCertificationHash===P.INHERITED[k].hash);reproduction.CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE=Object.values(rep.checks).every(c=>c.trackedStateUnchanged)&&reproduction.trackedStateUnchanged&&rep.trackedState.head===parent;
 if(!reproduction.ALL_STAGE3G_CERTIFICATES_REPRODUCED||!reproduction.CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE)mismatch('reproduction',true,reproduction);
 // ---- conclusions (Phase 2): every value resolved from its certified source
 const docCache={},resolve=(src)=>{if(src.kind==='CERTIFICATE_FIELD'){if(src.path.includes('{A,B}')){const [pre,post]=src.path.split('{A,B}');const rows=['A','B'].map(f=>get(certs[src.stage],pre+f+post));return rows.every(n=>n===0)?false:rows.every(n=>n>0)?true:'PARTIAL';}let v=get(certs[src.stage],src.path);if(src.equals!==undefined)v=v===src.equals;return v;}
  if(src.kind==='CERTIFIED_STAGE_DOCUMENT'){const t=docCache[src.file]??=atParent(src.file).toString('utf8'),m=new RegExp(`^\\| ${src.row} \\| (true|false)`,'m').exec(t);if(!m)mismatch(src.row,'row',null);if(get(certs[src.binding.stage],src.binding.path)!==src.binding.expect)mismatch(src.row+' binding',src.binding.expect,get(certs[src.binding.stage],src.binding.path));return m[1]==='true';}
  if(src.kind==='CERTIFIED_SCHEMA_RULE'){const [name,...rest]=src.field.split('.'),v=get(mods[src.module][name],rest.join('.'));if(src.certifiedHash&&get(certs[src.certifiedHash.stage],src.certifiedHash.path)!==PREDICTION_LIFECYCLE_SCHEMA_HASH)mismatch(src.field+' hash',PREDICTION_LIFECYCLE_SCHEMA_HASH,get(certs[src.certifiedHash.stage],src.certifiedHash.path));return src.mustContain!==undefined?String(v).includes(src.mustContain):v;}throw Error('SOURCE_KIND');};
 const conclusions={};for(const [group,entries] of Object.entries(P.CONCLUSIONS)){conclusions[group]={};for(const [name,[value,source]] of Object.entries(entries)){const certified=resolve(source);if(certified!==value)mismatch(name,value,certified);conclusions[group][name]={value,source};}}
 // ---- closure (Phase 3)
 const cond=get(certs.stage3g9,P.CLOSURE.source.path),s9=certs.stage3g9.science;const closure={conditions:Object.fromEntries(P.CLOSURE.conditions.map(k=>[k,cond[k]])),C2_OBSERVABLE_STATE_SUFFICIENT_FOR_DEMONSTRATED_TASKS:s9.C2_OBSERVABLE_STATE_SUFFICIENT_FOR_DEMONSTRATED_TASKS,qualification:P.QUALIFICATION,STAGE3G_SCIENTIFICALLY_COMPLETE:s9.CLOSURE.STAGE3G_SCIENTIFICALLY_COMPLETE,STAGE3G_STATUS:s9.STAGE3G_STATUS,READY_FOR_STAGE3H:s9.READY_FOR_STAGE3H,REMAINING_3G_BLOCKER:s9.CLOSURE.REMAINING_3G_BLOCKER,source:P.CLOSURE.source};
 if(!P.CLOSURE.conditions.every(k=>cond[k]===true)||closure.C2_OBSERVABLE_STATE_SUFFICIENT_FOR_DEMONSTRATED_TASKS!==true||closure.STAGE3G_SCIENTIFICALLY_COMPLETE!==true||closure.STAGE3G_STATUS!=='COMPLETE'||closure.READY_FOR_STAGE3H!==true||closure.REMAINING_3G_BLOCKER!=='NONE')mismatch('closure',true,closure);
 const closureCandidate=jsonAtParent('artifacts/stage3g9-c2-requalification/stage3g-closure-candidate.json');closure.candidate={file:'artifacts/stage3g9-c2-requalification/stage3g-closure-candidate.json',candidateHash:closureCandidate.candidateHash,statusBeforeFreeze:closureCandidate.status};
 // ---- limitations (Phase 4)
 const limitations={rule:P.LIMITATIONS.rule};for(const [k,e] of Object.entries(P.LIMITATIONS)){if(k==='rule'||k==='scopeNotes')continue;const v=resolve(e.source),bound=e.value;const certified=k==='BYPASS_HIDDEN_STATE_SPECIALIST_LIMITATION'?v==='MATERIAL':v;if(certified!==bound)mismatch(k,bound,v);limitations[k]={value:bound,source:e.source};}
 limitations.scopeNotes={};for(const [k,e] of Object.entries(P.LIMITATIONS.scopeNotes)){const v=resolve(e.source);if(v!==e.value)mismatch(k,e.value,v);limitations.scopeNotes[k]={value:e.value,source:e.source};}
 // ---- observation boundary (Phase 5)
 if(certs.stage3g8.boundary.hash!==CURRENT_OBSERVATION_BOUNDARY_V2_HASH)mismatch('boundary V2',certs.stage3g8.boundary.hash,CURRENT_OBSERVATION_BOUNDARY_V2_HASH);
 const B=CURRENT_OBSERVATION_BOUNDARY_V2,observationBoundary={boundaryId:'STAGE3G_OBSERVATION_BOUNDARY_FINAL',baseBoundary:{id:B.boundaryId,hash:CURRENT_OBSERVATION_BOUNDARY_V2_HASH,certifiedBy:'stage3g8'},OBSERVED:B.OBSERVED,DERIVED:[...B.DERIVED,...P.OBSERVATION_BOUNDARY_ADDITIONS.DERIVED],UNKNOWN:B.UNKNOWN,PROSPECTIVE_AUDIT_ONLY:B.PROSPECTIVE_AUDIT_ONLY,PRIVILEGED:B.PRIVILEGED,rule:P.OBSERVATION_BOUNDARY_ADDITIONS.rule,promotedUnknownFields:[]};
 const boundaryHash=sha256(observationBoundary);
 // ---- prediction lifecycle (Phase 6)
 if(certs.stage3g3.lifecycleSchemaHash!==PREDICTION_LIFECYCLE_SCHEMA_HASH)mismatch('lifecycle',certs.stage3g3.lifecycleSchemaHash,PREDICTION_LIFECYCLE_SCHEMA_HASH);
 const lifecycle={schemaId:PREDICTION_LIFECYCLE_SCHEMA.schemaId,statuses:PREDICTION_LIFECYCLE_SCHEMA.statuses,terminal:PREDICTION_LIFECYCLE_SCHEMA.terminal,isolation:PREDICTION_LIFECYCLE_SCHEMA.isolation,schemaHash:PREDICTION_LIFECYCLE_SCHEMA_HASH,certifiedBy:{stage:'stage3g3',path:'lifecycleSchemaHash'}};
 if(JSON.stringify(lifecycle.statuses)!==JSON.stringify(['VALID','STALE','INVALID','RESOLVED_CONFIRMED','RESOLVED_REFUTED']))mismatch('lifecycle statuses','five',lifecycle.statuses);
 // ---- action semantics (Phase 7)
 const sh=certs.stage3g12.schemaHashes,checksAS={ACTION_SEMANTICS_V1:[ACTION_SEMANTICS_ID,ACTION_SEMANTICS_SCHEMA_HASH,sh.actionSemantics,'stage3g12 schemaHashes.actionSemantics'],DEPLOYABLE_ACTION_MODEL_V1:[ACTION_MODEL_SCHEMA.schemaId,ACTION_MODEL_SCHEMA_HASH,certs.stage3g5.actionModelSchemaHash,'stage3g5 actionModelSchemaHash'],ACTION_SURFACE_V1:[ACTION_SURFACE_SCHEMA.schemaId,ACTION_SURFACE_HASH,certs.stage3g6.actionSurfaceHash,'stage3g6 actionSurfaceHash'],TARGET_ELIGIBILITY_CONTRACT_V1:[TARGET_CONTRACT.id,TARGET_CONTRACT_HASH,certs.stage3g7.contractHash,'stage3g7 contractHash'],TYPED_RELATION_SEMANTIC_CHANNEL_V1:[SEMANTIC_CHANNEL_SCHEMA.schemaId,SEMANTIC_CHANNEL_SCHEMA_HASH,certs.stage3g9.science.SEMANTIC_TYPED_RELATIONS.SCHEMA_HASH,'stage3g9 science.SEMANTIC_TYPED_RELATIONS.SCHEMA_HASH']};
 const actionSemantics={schemas:{}};for(const [k,[id,live,cert,where]] of Object.entries(checksAS)){if(id!==k||live!==cert)mismatch(k,cert,{id,live});actionSemantics.schemas[k]={schemaHash:live,certifiedBy:where};}
 actionSemantics.supporting={EPISTEMIC:{id:EPISTEMIC_SCHEMA_ID,hash:EPISTEMIC_SCHEMA_HASH,certified:sh.epistemic===EPISTEMIC_SCHEMA_HASH},OBSERVABLE_ENTITY_STATE:{id:OBSERVABLE_ENTITY_STATE_ID,hash:OBSERVABLE_ENTITY_STATE_SCHEMA_HASH,certified:sh.observableEntityState===OBSERVABLE_ENTITY_STATE_SCHEMA_HASH},TYPED_RELATION_DISCLOSURE_CANDIDATE_V1:{hash:TYPED_RELATION_DISCLOSURE_SCHEMA_HASH,certified:certs.stage3g8.schemas.TYPED_RELATION_DISCLOSURE_CANDIDATE_V1===TYPED_RELATION_DISCLOSURE_SCHEMA_HASH,status:TYPED_RELATION_DISCLOSURE_SCHEMA.status,runtimeApproved:TYPED_RELATION_DISCLOSURE_SCHEMA.runtimeApproved}};
 if(!Object.values(actionSemantics.supporting).every(x=>x.certified))mismatch('supporting schemas',true,actionSemantics.supporting);actionSemantics.rule=P.ACTION_SEMANTICS_RULE;
 // ---- inherited Stage 3F sections (Phases 8-11), byte-identical to the Stage 3F freeze
 const S=f3.sections,decisionEvaluationContract={inheritedFrom:{freeze:P.STAGE3F_FREEZE,freezeHash:f3.freezeHash,section:'decisionEvaluationContract',sectionHash:sha256(S.decisionEvaluationContract)},contractId:S.decisionEvaluationContract.contractId,contractHash:S.decisionEvaluationContract.record.BOUND_SEMANTIC_HASH.value,metrics:S.decisionEvaluationContract.metrics,principles:S.decisionEvaluationContract.principles,canonicalRule:S.decisionEvaluationContract.canonicalRule,reassertions:P.DECISION_CONTRACT_REASSERTIONS,modifiedByStage3G:false};
 const contractRaw=atParent(S.decisionEvaluationContract.record.file);if(hex(contractRaw)!==S.decisionEvaluationContract.record.RAW_FILE_SHA256)mismatch('decision contract raw',S.decisionEvaluationContract.record.RAW_FILE_SHA256,hex(contractRaw));
 const amendments=git('ls-tree','-r','--name-only',parent,GA+'artifacts').toString().split('\n').filter(f=>/artifacts\/stage3g[^/]*\/[^/]*(amendment|erratum|errata)[^/]*\.json$/.test(f)).sort().map(f=>({file:f.slice(GA.length),RAW_FILE_SHA256:hex(atParent(f.slice(GA.length)))}));
 const reproducibilityContract={inheritedFrom:{freeze:P.STAGE3F_FREEZE,section:'reproducibilityContract',sectionHash:sha256(S.reproducibilityContract)},SENTINEL_CANONICAL_NUMERICS_V1_REQUIRED:S.reproducibilityContract.SENTINEL_CANONICAL_NUMERICS_V1_REQUIRED,SCIENTIFIC_REPRODUCIBILITY:S.reproducibilityContract.SCIENTIFIC_REPRODUCIBILITY,BYTE_REPRODUCIBILITY:S.reproducibilityContract.BYTE_REPRODUCIBILITY,BYTE_REPRODUCIBILITY_CONDITION:S.reproducibilityContract.BYTE_REPRODUCIBILITY_CONDITION,HOST_NATIVE_MATH_BYTE_CANONICAL:S.reproducibilityContract.HOST_NATIVE_MATH_BYTE_CANONICAL,CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE:true,checkModeInvariantSectionHash:sha256(S.checkModeInvariant),
  historicalDisclosedAmendments:amendments,retrofitRule:'Frozen historical certifiers are not retrofitted; any change that would alter a certified hash is forbidden. Disclosed amendments remain as certified.',stage3gSourceCoupling:'The Stage 3G.7 certifier hashes every .js/.mjs under src/ and scripts/; Stage 3G.8+ code therefore lives outside those trees (stage3g8/, stage3g9/, stage3g-freeze/).'};
 const architecture={inheritedFrom:{freeze:P.STAGE3F_FREEZE,section:'architectureRoster',sectionHash:sha256(S.architectureRoster)},rosterId:S.architectureRoster.rosterId,EXPERT_COUNT:S.architectureRoster.EXPERT_COUNT,experts:S.architectureRoster.experts,infrastructureNotExperts:S.architectureRoster.infrastructureNotExperts,rules:S.architectureRoster.rules,EXPERT_10_ADDED:false,modifiedByStage3G:false};
 if(architecture.EXPERT_COUNT!==9||architecture.experts.length!==9)mismatch('roster',9,architecture.experts);
 const authority={...P.AUTHORITY,verifiedAgainst:Object.fromEntries(Object.entries(certs).map(([k,c])=>{const a=c.authority??{};const t=a.tier??a.AUTHORITY;return [k,t==='R0'&&(a.canDispatch??a.CAN_DISPATCH)===false&&(a.canMutateLiveWorld??a.CAN_MUTATE_LIVE_WORLD)===false&&(a.onlineLearningEnabled??a.ONLINE_LEARNING_ENABLED)===false&&(a.promotedToLiveRuntime??a.PROMOTED_TO_LIVE_RUNTIME)===false];})),stage3fAuthoritySectionHash:sha256(S.authorityState)};
 if(!Object.values(authority.verifiedAgainst).every(Boolean))mismatch('authority',true,authority.verifiedAgainst);
 // ---- assemble
 const sections={lineage,reproduction,scientificConclusions:conclusions,closure,limitations,observationBoundary,predictionLifecycle:lifecycle,actionSemantics,decisionEvaluationContract,reproducibilityContract,architectureRoster:architecture,authorityState:authority,stage3hEntryRequirements:P.STAGE3H_ENTRY};
 const bound={CANONICAL_PARENT_COMMIT:parent,...Object.fromEntries(Object.keys(P.STAGES).map(k=>[`${k.toUpperCase()}_CERTIFICATE_HASH`,stages[k].BOUND_SEMANTIC_HASH.value])),STAGE3F_FREEZE_HASH:f3.freezeHash,
  OBSERVATION_BOUNDARY_HASH:boundaryHash,PREDICTION_LIFECYCLE_HASH:PREDICTION_LIFECYCLE_SCHEMA_HASH,ACTION_SEMANTICS_HASH:ACTION_SEMANTICS_SCHEMA_HASH,DEPLOYABLE_ACTION_MODEL_HASH:ACTION_MODEL_SCHEMA_HASH,ACTION_SURFACE_HASH,TARGET_ELIGIBILITY_CONTRACT_HASH:TARGET_CONTRACT_HASH,TYPED_RELATION_SEMANTIC_CHANNEL_HASH:SEMANTIC_CHANNEL_SCHEMA_HASH,
  STAGE3G_CLOSURE_FACTS_HASH:sha256(closure),SCIENTIFIC_CONCLUSIONS_HASH:sha256(conclusions),LIMITATIONS_HASH:sha256(limitations),DECISION_EVALUATION_CONTRACT_HASH:decisionEvaluationContract.contractHash,STAGE3H_ENTRY_REQUIREMENTS_HASH:sha256(P.STAGE3H_ENTRY),REPRODUCIBILITY_CONTRACT_HASH:sha256(reproducibilityContract),ARCHITECTURE_ROSTER_HASH:sha256(architecture),AUTHORITY_STATE_HASH:sha256(authority),REPRODUCTION_RECORD_RAW_FILE_SHA256:reproduction.RAW_FILE_SHA256};
 const body={schemaVersion:1,stage:'STAGE3G',STAGE3G_FREEZE_VERSION:P.FREEZE_VERSION,purpose:'Canonical immutable Stage 3G inheritance boundary for Stage 3H. Verify, bind, canonicalize, freeze, certify only.',newScientificEvidence:false,stage3hStarted:false,
  hashTypes:{BOUND_SEMANTIC_HASH:'the certificationHash a certified document embeds (its own certifier hashing rule)',RAW_FILE_SHA256:'sha256 of the file bytes at CANONICAL_PARENT_COMMIT; integrity only',SECTION_HASH:'src/core/determinism.js sha256 of the canonical JSON section'},bound,sections,onCertificationPass:P.ON_PASS};
 return {...body,freezeHash:sha256(body)};}
const text=d=>JSON.stringify(d,null,2)+'\n';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const verify=process.argv.includes('--verify');enforceCheckModeReadOnly({checkOnly:verify});const doc=buildFreeze(),file=path.join(root,P.FREEZE_PATH);
 if(verify){const ok=existsSync(file)&&readFileSync(file,'utf8')===text(doc);console.log(JSON.stringify({FREEZE_REBUILT_BYTE_IDENTICAL:ok,freezeHash:doc.freezeHash}));if(!ok)process.exitCode=1;}
 else{if(existsSync(file))throw Error('FREEZE_EXISTS: use --verify');mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,text(doc));console.log(JSON.stringify({freezeHash:doc.freezeHash,bound:doc.bound},null,2));}}
