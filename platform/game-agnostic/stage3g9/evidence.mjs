// STAGE_3G_9 per-row evidence. Observable column blocks come from observable modules; labels, hidden target facts and
// kernel rewiring are audit-only fields that never enter the S0/S2 vectors. Deterministic; caches only under build/stage3g9.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256,stableStringify} from '../src/core/determinism.js';
import {rebuildWorld,TWIN_TRANSFORMS} from '../scripts/stage3f6p1asym-evidence.mjs';
import {observableView,renameObservation,poisonPrivileged} from '../scripts/stage3g/evidence.mjs';
import {buildObservableEntityState,privilegedKeyScan} from '../src/stage3g/observable-entity-state-v1.js';
import {deriveActionSemantics} from '../src/stage3g/action-semantics-v1.js';
import {observableColumns,eligibility} from '../src/stage3g7/target-eligibility-contract-v1.js';
import {hashWorld} from '../src/forge/kernel.js';
import {symmetricStep} from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import {canonicalActionKey,orientWorld,orientAction,INVERSE_ORIENTATION,TRANSFORM_EQUIVALENT} from '../src/forge-symmetric/orientation-symmetric-v1.js';
import {enforceCheckModeReadOnly} from '../scripts/certification/check-mode-guard.mjs';
import {projectObjectiveProgress,objectiveProgressColumns} from '../stage3g8/objective-progress-v1.mjs';
import {verifyDisclosure,coarseSubstitute,typedRelationColumns,baseColumns as g8TypedColumns,UNKNOWN} from '../stage3g8/typed-relation-disclosure-v1.mjs';
import {discloseTypedRelations} from '../stage3g8/typed-relation-source.mjs';
import {semanticColumns,semanticRootBypass,ROOT_COLUMN_COUNT} from './typed-relation-semantic-channel-v1.mjs';
import {PLAN,PLAN_HASH,BUILD} from './plan.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
/** Transitive relative-import closure of root-relative entry files (same rule as Stage 3G.8). */
export function importClosure(entries){const seen=new Set(),stack=[...entries];while(stack.length){const f=stack.pop();if(seen.has(f))continue;seen.add(f);const text=readFileSync(path.join(root,f),'utf8');for(const m of text.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){const r=path.relative(root,path.resolve(path.dirname(path.join(root,f)),m[1])).split(path.sep).join('/');if(!seen.has(r))stack.push(r);}}return [...seen].sort();}
export const evidenceSourceHash=()=>sha256(Object.fromEntries(importClosure(['stage3g9/evidence.mjs']).map(f=>[f,sha256(readFileSync(path.join(root,f)).toString())])));
const K16=k=>k.slice(0,16),targetOf=a=>a.target?.id??a.targetEntityId??null;
const byFrom=(a,b)=>a.from<b.from?-1:a.from>b.from?1:a.to<b.to?-1:a.to>b.to?1:0;
/** The S2 vector blocks (semantic G7 + OP) for every candidate; used for integrity transforms. */
export function s2Blocks(v,d,progress){return v.surface.map(e=>({SEM:semanticColumns(v,e.action,{disclosure:d}).features,OP:objectiveProgressColumns(progress,e.action)}));}
function privileged(world,a){const e=world.entities.find(e=>e.id===targetOf(a));return e?[e.health,e.available?1:0,e.flags?.planned?1:0,e.flags?.acceptsMaterial?1:0,e.flags?.protected?1:0,e.value??0]:[0,0,0,0,0,0];}
function bypassAudit(world,v,d){return v.surface.filter(e=>e.actionType==='BYPASS').map(e=>{const t=targetOf(e.action),dep=e.action.parameters.dependent,next=symmetricStep(world,e.action).state,kernelDeps=next.relations.filter(r=>r.type==='dependsOn').map(r=>({from:r.from,to:r.to})).sort(byFrom),before=new Set(world.relations.filter(r=>r.type==='dependsOn'&&r.from===dep).map(r=>r.to)),fresh=next.relations.filter(r=>r.type==='dependsOn'&&r.from===dep&&!before.has(r.to)).map(r=>r.to),actual=fresh.length===1?fresh[0]:'AMBIGUOUS',p=semanticRootBypass(v,d,e.action),coarse=coarseSubstitute(v,t);
 return {target:t,dependent:dep,actual,semantic:p.substitute,substituteExact:p.substitute===actual,rewireExact:stableStringify(p.dependsOn)===stableStringify(kernelDeps),coarse,coarseIdentifiable:coarse!==UNKNOWN,coarseExact:coarse===actual};});}
function integrity(world,v,d,progress,blocks){const out={};
 let d4=true;for(const t of TWIN_TRANSFORMS){const o=TRANSFORM_EQUIVALENT[t],tw=orientWorld(o,world),tv=observableView(tw),tb=s2Blocks(tv,discloseTypedRelations(tw),projectObjectiveProgress(tv.observation)),m=new Map(tv.surface.map((e,i)=>[K16(canonicalActionKey('R0',orientAction(INVERSE_ORIENTATION[o],e.action,world.grid.width),world.grid.width)),tb[i]]));for(let i=0;i<v.surface.length;i++)if(stableStringify(blocks[i])!==stableStringify(m.get(K16(v.surface[i].actionId))))d4=false;}out.d4=d4;
 const ids=v.visibleMap.entities.map(e=>e.id).sort(),mono=new Map(ids.map((id,i)=>[id,'m-'+String(i).padStart(4,'0')])),name=id=>mono.get(id)??id,rn=renameObservation(v,name);rn.surface.reverse();for(const e of rn.surface)if(e.action.parameters?.dependent!==undefined)e.action={...e.action,parameters:{...e.action.parameters,dependent:name(e.action.parameters.dependent)}};rn.state=buildObservableEntityState(rn);rn.semantics=deriveActionSemantics({state:rn.state,visibleMap:rn.visibleMap,legalActions:rn.surface});
 const rd={relations:d.relations.map(r=>({from:name(r.from),to:name(r.to),type:r.type}))},rb=s2Blocks(rn,rd,projectObjectiveProgress(rn.observation));out.monotoneRenameAndOrder=blocks.every((b,i)=>stableStringify(b)===stableStringify(rb[rb.length-1-i]));
 const pw=poisonPrivileged(world),pv=observableView(pw);out.poison=stableStringify(s2Blocks(pv,discloseTypedRelations(pw),projectObjectiveProgress(pv.observation)))===stableStringify(blocks);
 out.deterministic=stableStringify(s2Blocks(v,d,progress))===stableStringify(blocks);out.privilegedKeyScanClean=privilegedKeyScan({disclosure:d,blocks}).length===0;return out;}
export function rowEvidence(row){const start=Date.now(),world=rebuildWorld(row),v=observableView(world),d=discloseTypedRelations(world),progress=projectObjectiveProgress(v.observation),maxR=Math.max(...Object.values(row.actions).map(x=>x.r));
 const blocks=[],candidates=v.surface.map(e=>{const key=K16(e.actionId),label=row.actions[key];if(!label)throw Error('FULL_ROOT_LABEL_MISSING');const g7=observableColumns(v,e.action),sem=semanticColumns(v,e.action,{disclosure:d}),off=semanticColumns(v,e.action),op=objectiveProgressColumns(progress,e.action);blocks.push({SEM:sem.features,OP:op});
  return {key,type:e.actionType,o:label.o,r:label.r,maxR,features:{G7:g7.features,SEM:sem.features,OP:op,TYPED8:g8TypedColumns(v,e.action,{disclosure:d}).features,TR:typedRelationColumns(v,d,e.action)},privilegedAudit:privileged(world,e.action),
   checks:{semanticOffParity:stableStringify(off)===stableStringify(g7),rootColumnsIdentical:stableStringify(sem.features.slice(0,ROOT_COLUMN_COUNT))===stableStringify(g7.features.slice(0,ROOT_COLUMN_COUNT)),dimension:sem.features.length===g7.features.length,semanticChangesSearch:stableStringify(sem.features)!==stableStringify(g7.features),g7Truncated:g7.audit.truncated,semTruncated:sem.audit.truncated,guaranteedFutureBranches:g7.audit.guaranteedFutureBranches+sem.audit.guaranteedFutureBranches,futureEligibility:eligibility(v.state,e.action,[],{future:true}).status}};});
 const keep=candidates.map((c,i)=>candidates.findIndex(x=>x.key===c.key)===i),cands=candidates.filter((_,i)=>keep[i]),rootTypes=[...new Set(cands.map(c=>c.type))];
 const evidence={recordHash:row.recordHash,partition:row.partition,worldFidelity:hashWorld(world)===row.worldHash,level:row.combination.level,horizon:row.horizon,horizonClass:row.label.horizonClass,retreat:cands.some(c=>c.type==='RETREAT'&&c.o===1),rootTypes,targetBearing:cands.some(c=>!['MOVE','RETREAT','WAIT','PROTECT'].includes(c.type)),bypassOffered:rootTypes.includes('BYPASS'),labelComplete:cands.length===Object.keys(row.actions).length,
  disclosureConsistent:verifyDisclosure(v.observation,d).consistent,bypass:bypassAudit(world,v,d),candidates:cands,integrity:row.equivariance!==null?integrity(world,v,d,progress,blocks):null};
 if(Date.now()-start>PLAN.feasibility.maxSecondsPerRow*1000)throw Error('ROW_RUNTIME_LIMIT_UNRESOLVED');return evidence;}
export function transportEvidence(x){if(typeof x==='number'){if(!Number.isFinite(x))throw Error('NONFINITE_EVIDENCE');return x===0?0:x;}if(x===undefined)throw Error('UNDEFINED_EVIDENCE');if(Array.isArray(x))return x.map(transportEvidence);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,transportEvidence(v)]));return x;}
const partFile=(key,p,P)=>path.join(root,BUILD,`evidence-${key}-part${p}of${P}.gz`);
function computePart(rows,key,p,P){const file=partFile(key,p,P),indices=rows.map((_,i)=>i).filter(i=>i%P===p),evidence=[];for(const i of indices){evidence.push(transportEvidence(rowEvidence(rows[i])));if(evidence.length%50===0)process.stderr.write(`[G9 evidence ${key.slice(0,8)} part ${p}] ${evidence.length}/${indices.length}\n`);}writeFileSync(file+'.tmp',gzipSync(JSON.stringify({key,part:p,parts:P,indices,evidenceHash:sha256(evidence),evidence})));renameSync(file+'.tmp',file);}
function loadPart(key,p,P,n){const f=partFile(key,p,P);if(!existsSync(f))return null;const d=JSON.parse(gunzipSync(readFileSync(f)));if(d.key!==key||d.part!==p||d.parts!==P||sha256(d.evidence)!==d.evidenceHash||d.indices.length!==Math.ceil((n-p)/P))throw Error('EVIDENCE_CACHE_DRIFT');return d;}
export async function prepare(rows,label){const P=PLAN.feasibility.evidenceParts,source=evidenceSourceHash(),input=sha256(rows),key=sha256({source,input,plan:PLAN_HASH,label});mkdirSync(path.join(root,BUILD),{recursive:true});
 const missing=[...Array(P).keys()].filter(p=>!existsSync(partFile(key,p,P)));if(missing.length){const rowsFile=path.join(root,BUILD,`rows-${key}.json.gz`);writeFileSync(rowsFile,gzipSync(JSON.stringify(rows)));const start=Date.now();
  await Promise.all(missing.map(p=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(here,'evidence.mjs'),'--worker',rowsFile,label,key,String(p),String(P)],{cwd:root,env:process.env,stdio:['ignore','inherit','inherit']});c.on('close',code=>code===0?resolve():reject(Error(`EVIDENCE_WORKER_${p}_EXIT_${code}`)));})));
  process.stderr.write(`[G9 evidence ${label}] ${rows.length} rows in ${((Date.now()-start)/1000).toFixed(0)}s\n`);}
 const merged=Array(rows.length);for(let p=0;p<P;p++){const d=loadPart(key,p,P,rows.length);d.indices.forEach((i,k)=>{merged[i]=d.evidence[k];});}if(merged.some(x=>!x))throw Error('EVIDENCE_PART_MISSING');
 return {sourceHash:source,inputHash:input,key,evidenceHash:sha256(merged),evidence:merged};}
if(process.argv[2]==='--worker'){enforceCheckModeReadOnly({checkOnly:process.env.SENTINEL_READONLY==='1'});const [,,,rowsFile,label,key,p,P]=process.argv;const rows=JSON.parse(gunzipSync(readFileSync(rowsFile)));if(sha256({source:evidenceSourceHash(),input:sha256(rows),plan:PLAN_HASH,label})!==key)throw Error('EVIDENCE_WORKER_KEY_MISMATCH');computePart(rows,key,Number(p),Number(P));}
