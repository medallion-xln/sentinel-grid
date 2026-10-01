// STAGE_3G_8 per-row evidence. Observable columns come from observable modules only; privileged values (labels,
// hidden target facts, kernel rewiring, oracle VOI) are kept in separately named audit fields and never enter the
// observable column blocks. Deterministic; caches only under build/stage3g8.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha256,stableStringify} from '../src/core/determinism.js';
import {rebuildWorld,TWIN_TRANSFORMS} from '../scripts/stage3f6p1asym-evidence.mjs';
import {observableView,renameObservation,poisonPrivileged} from '../scripts/stage3g/evidence.mjs';
import {policySurface} from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import {buildObservableEntityState,forgeVisibleMap,privilegedKeyScan} from '../src/stage3g/observable-entity-state-v1.js';
import {deriveActionSemantics} from '../src/stage3g/action-semantics-v1.js';
import {observableColumns,eligibility} from '../src/stage3g7/target-eligibility-contract-v1.js';
import {hashWorld,cloneWorld} from '../src/forge/kernel.js';
import {symmetricStep} from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import {evaluateCounterfactualsSymmetricV1} from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import {canonicalActionKey,orientWorld,orientAction,INVERSE_ORIENTATION,TRANSFORM_EQUIVALENT} from '../src/forge-symmetric/orientation-symmetric-v1.js';
import {seededUniform} from '../src/stage3f/policy-requalification-v1.js';
import {enforceCheckModeReadOnly} from '../scripts/certification/check-mode-guard.mjs';
import {projectObjectiveProgress,projectionLoss,objectiveProgressColumns} from './objective-progress-v1.mjs';
import {verifyDisclosure,typedSubstitute,coarseSubstitute,typedRelationColumns,baseColumns,typedRootLedger,COLLAPSE_GROUPS,UNKNOWN} from './typed-relation-disclosure-v1.mjs';
import {discloseTypedRelations} from './typed-relation-source.mjs';
import {PLAN,PLAN_HASH,BUILD} from './plan.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
/** Transitive relative-import closure of the given entry files (root-relative paths). */
export function importClosure(entries){const seen=new Set(),stack=[...entries];while(stack.length){const f=stack.pop();if(seen.has(f))continue;seen.add(f);const text=readFileSync(path.join(root,f),'utf8');for(const m of text.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){const r=path.relative(root,path.resolve(path.dirname(path.join(root,f)),m[1])).split(path.sep).join('/');if(!seen.has(r))stack.push(r);}}return [...seen].sort();}
const hashFiles=files=>sha256(Object.fromEntries(files.map(f=>[f,sha256(readFileSync(path.join(root,f)).toString())])));
export const EVIDENCE_ENTRIES=['stage3g8/evidence.mjs'];
export const evidenceSourceHash=()=>hashFiles(importClosure(EVIDENCE_ENTRIES));
const K16=k=>k.slice(0,16),targetOf=a=>a.target?.id??a.targetEntityId??null;

/** All column blocks for every candidate of one decision-time view. */
export function columnBlocks(v,d,progress){return v.surface.map(e=>{const g7=baseColumns(v,e.action),typed=baseColumns(v,e.action,{disclosure:d});return {G7:g7.features,TYPED:typed.features,OP:objectiveProgressColumns(progress,e.action),TR:typedRelationColumns(v,d,e.action),audit:{g7:g7.audit,typed:typed.audit}};});}
const blocksOnly=b=>b.map(x=>({G7:x.G7,TYPED:x.TYPED,OP:x.OP,TR:x.TR}));
function privileged(world,a){const e=world.entities.find(e=>e.id===targetOf(a));return e?[e.health,e.available?1:0,e.flags?.planned?1:0,e.flags?.acceptsMaterial?1:0,e.flags?.protected?1:0,e.value??0]:[0,0,0,0,0,0];}
const sameObservation=(a,b)=>stableStringify([a.observation.features,a.observation.metadata.canonicalState,a.observation.metadata.objectives,a.observation.metadata.observationHistory,a.observation.metadata.scenarioLevel,a.visibleMap])===stableStringify([b.observation.features,b.observation.metadata.canonicalState,b.observation.metadata.objectives,b.observation.metadata.observationHistory,b.observation.metadata.scenarioLevel,b.visibleMap]);
/** Oracle value-of-information of the relation subtype under a coarse-consistent, multiset-preserving retyping. Audit only. */
export function subtypeVOI(row,world,v){
 const groups=Object.values(COLLAPSE_GROUPS),idx=groups.map(g=>world.relations.map((r,i)=>g.includes(r.type)?i:-1).filter(i=>i>=0)),mixed=idx.some(ix=>new Set(ix.map(i=>world.relations[i].type)).size>1);
 if(!mixed)return {status:'NO_ALTERNATIVE',decisionRelevant:0,misbeliefHitLoss:0,misbeliefNregLoss:0};
 const rng=seededUniform('STAGE3G8:VOI:'+row.recordHash),menu=policySurface(world).map(e=>K16(e.actionId)).join('|');
 for(let attempt=0;attempt<8;attempt++){const w=cloneWorld(world);let changed=false;for(const ix of idx){const types=ix.map(i=>world.relations[i].type);for(let i=types.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[types[i],types[j]]=[types[j],types[i]];}ix.forEach((i,k)=>{if(w.relations[i].type!==types[k])changed=true;w.relations[i].type=types[k];});}
  if(!changed)continue;let alt;try{alt=observableView(w);}catch{continue;}if(!sameObservation(v,alt)||policySurface(w).map(e=>K16(e.actionId)).join('|')!==menu)continue;
  const ev=evaluateCounterfactualsSymmetricV1(w,{horizon:row.horizon}),opt=[...new Set(ev.optimalActionKeys.map(K16))],actual=Object.entries(row.actions).filter(([,x])=>x.o===1).map(([k])=>k).sort(),maxR=Math.max(...Object.values(row.actions).map(x=>x.r));
  if(opt.some(k=>!row.actions[k]))throw Error('VOI_KEY_MISMATCH');const hit=opt.reduce((s,k)=>s+row.actions[k].o,0)/opt.length,nreg=opt.reduce((s,k)=>s+(maxR>0?row.actions[k].r/maxR:0),0)/opt.length;
  return {status:'ALTERNATIVE_EVALUATED',attempt,decisionRelevant:actual.join('|')!==[...opt].sort().join('|')?1:0,misbeliefHitLoss:1-hit,misbeliefNregLoss:nreg};}
 return {status:'NO_CONSISTENT_ALTERNATIVE',decisionRelevant:0,misbeliefHitLoss:0,misbeliefNregLoss:0};}
function bypassAudit(world,v,d){return v.surface.filter(e=>e.actionType==='BYPASS').map(e=>{const t=targetOf(e.action),dep=e.action.parameters.dependent,before=new Set(world.relations.filter(r=>r.type==='dependsOn'&&r.from===dep).map(r=>r.to)),after=symmetricStep(world,e.action).state.relations.filter(r=>r.type==='dependsOn'&&r.from===dep).map(r=>r.to),fresh=after.filter(x=>!before.has(x)),actual=fresh.length===1?fresh[0]:fresh.length===0&&after.length?'UNCHANGED_EDGE_SET':'AMBIGUOUS';const typed=typedSubstitute(v,d,t),coarse=coarseSubstitute(v,t),ledger=typedRootLedger(v,d,e.action);
 return {target:t,dependent:dep,actual,typed,coarse,typedExact:typed===actual,coarseIdentifiable:coarse!==UNKNOWN,coarseExact:coarse===actual,ledgerSubstitute:ledger.rewiring[0].substitute,runtimeLedgerSubstitute:typedRootLedger(v,null,e.action).rewiring[0].substitute};});}
function integrity(world,v,d,progress,blocks){
 const out={};const flat=b=>blocksOnly(b);
 let d4=true;for(const t of TWIN_TRANSFORMS){const o=TRANSFORM_EQUIVALENT[t],tw=orientWorld(o,world),tv=observableView(tw),tb=columnBlocks(tv,discloseTypedRelations(tw),projectObjectiveProgress(tv.observation)),m=new Map(tv.surface.map((e,i)=>[K16(canonicalActionKey('R0',orientAction(INVERSE_ORIENTATION[o],e.action,world.grid.width),world.grid.width)),flat([tb[i]])[0]]));for(let i=0;i<v.surface.length;i++)if(stableStringify(flat([blocks[i]])[0])!==stableStringify(m.get(K16(v.surface[i].actionId))))d4=false;}out.d4=d4;
 const ids=v.visibleMap.entities.map(e=>e.id).sort(),renameView=(name)=>{const rn=renameObservation(v,name);rn.surface.reverse();rn.state=buildObservableEntityState(rn);rn.semantics=deriveActionSemantics({state:rn.state,visibleMap:rn.visibleMap,legalActions:rn.surface});const rd={relations:d.relations.map(r=>({from:name(r.from),to:name(r.to),type:r.type}))};return {rb:columnBlocks(rn,rd,projectObjectiveProgress(rn.observation)),rd,rn};};
 const mono=new Map(ids.map((id,i)=>[id,'m-'+String(i).padStart(4,'0')])),{rb}=renameView(id=>mono.get(id));out.monotoneRenameAndOrder=blocks.every((b,i)=>stableStringify(flat([b])[0])===stableStringify(flat([rb[rb.length-1-i]])[0]));
 const opaque=new Map(ids.map((id,i)=>[id,'opaque-'+i])),nm=renameView(id=>opaque.get(id)).rb,idIndependent=b=>({G7:b.G7,TYPED:b.TYPED,OP:b.OP,TR:b.TR.slice(0,23)});out.nonMonotoneRenameIdentityIndependentColumns=blocks.every((b,i)=>stableStringify(idIndependent(b))===stableStringify(idIndependent(nm[nm.length-1-i])));
 const pw=poisonPrivileged(world),pv=observableView(pw),pd=discloseTypedRelations(pw);out.poison=stableStringify(flat(blocks))===stableStringify(flat(columnBlocks(pv,pd,projectObjectiveProgress(pv.observation))))&&stableStringify(pd)===stableStringify(d);
 out.deterministic=stableStringify(flat(blocks))===stableStringify(flat(columnBlocks(v,d,progress)))&&stableStringify(projectObjectiveProgress(v.observation))===stableStringify(progress);
 out.privilegedKeyScanClean=privilegedKeyScan({progress,disclosure:d,blocks:flat(blocks)}).length===0;
 return out;}
export function rowEvidence(row){const start=Date.now(),world=rebuildWorld(row),v=observableView(world),d=discloseTypedRelations(world),progress=projectObjectiveProgress(v.observation),blocks=columnBlocks(v,d,progress);
 const packet=v.observation.metadata.objectives,objectiveFidelity={packetEqualsWorld:stableStringify(packet)===stableStringify(world.objectives.map(o=>({...o}))),noProjectionLoss:!projectionLoss(v.observation),remainingMatchesPacketFeature:progress.totals.remaining===v.observation.features[12],deliveredNonzero:packet.some(o=>o.deliveredValue>0),requiredValues:packet.map(o=>o.requiredValue)};
 const maxR=Math.max(...Object.values(row.actions).map(x=>x.r));
 const candidates=v.surface.map((e,i)=>{const key=K16(e.actionId),label=row.actions[key];if(!label)throw Error('FULL_ROOT_LABEL_MISSING');const frozen=observableColumns(v,e.action),{prunedBypassBranches,...g7audit}=blocks[i].audit.g7;
  return {key,type:e.actionType,o:label.o,r:label.r,maxR,features:{G7:blocks[i].G7,TYPED:blocks[i].TYPED,OP:blocks[i].OP,TR:blocks[i].TR},privilegedAudit:privileged(world,e.action),audit:{g7Truncated:blocks[i].audit.g7.truncated,typedTruncated:blocks[i].audit.typed.truncated,prunedBypassBranches:blocks[i].audit.typed.prunedBypassBranches,typedChangesSearch:stableStringify(blocks[i].G7)!==stableStringify(blocks[i].TYPED),guaranteedFutureBranches:blocks[i].audit.g7.guaranteedFutureBranches+blocks[i].audit.typed.guaranteedFutureBranches},
   frozenParity:stableStringify(frozen.features)===stableStringify(blocks[i].G7)&&stableStringify(frozen.audit)===stableStringify(g7audit),futureEligibility:eligibility(v.state,e.action,[],{future:true}).status};}).filter((c,i,a)=>a.findIndex(x=>x.key===c.key)===i);
 const rootTypes=[...new Set(candidates.map(c=>c.type))];
 const evidence={recordHash:row.recordHash,partition:row.partition,worldFidelity:hashWorld(world)===row.worldHash,level:row.combination.level,horizon:row.horizon,horizonClass:row.label.horizonClass,retreat:candidates.some(c=>c.type==='RETREAT'&&c.o===1),rootTypes,
  targetBearing:candidates.some(c=>!['MOVE','RETREAT','WAIT','PROTECT'].includes(c.type)),bypassOffered:rootTypes.includes('BYPASS'),labelComplete:candidates.length===Object.keys(row.actions).length,
  disclosure:{...verifyDisclosure(v.observation,d),relationTypes:Object.fromEntries(Object.entries(d.relations.reduce((m,r)=>(m[r.type]=(m[r.type]??0)+1,m),{})).sort())},objectiveFidelity,bypass:bypassAudit(world,v,d),voi:subtypeVOI(row,world,v),candidates,integrity:row.equivariance!==null?integrity(world,v,d,progress,blocks):null};
 if(evidence.integrity){const ev=evaluateCounterfactualsSymmetricV1(world,{horizon:row.horizon});evidence.integrity.oracleLabelsReproduced=stableStringify([...new Set(ev.optimalActionKeys.map(K16))].sort())===stableStringify(Object.entries(row.actions).filter(([,x])=>x.o===1).map(([k])=>k).sort());}
 if(Date.now()-start>PLAN.feasibility.maxSecondsPerRow*1000)throw Error('ROW_RUNTIME_LIMIT_UNRESOLVED');return evidence;}
// JSON erases signed zero and undefined; normalize before hashing/caching (Stage 3G.7 transport rule).
export function transportEvidence(x){if(typeof x==='number'){if(!Number.isFinite(x))throw Error('NONFINITE_EVIDENCE');return x===0?0:x;}if(x===undefined)throw Error('UNDEFINED_EVIDENCE');if(Array.isArray(x))return x.map(transportEvidence);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,transportEvidence(v)]));return x;}
const partFile=(key,p,P)=>path.join(root,BUILD,`evidence-${key}-part${p}of${P}.gz`);
function computePart(rows,key,p,P){const file=partFile(key,p,P);const indices=rows.map((_,i)=>i).filter(i=>i%P===p),evidence=[];for(const i of indices){evidence.push(transportEvidence(rowEvidence(rows[i])));if(evidence.length%25===0)process.stderr.write(`[G8 evidence ${key.slice(0,8)} part ${p}] ${evidence.length}/${indices.length}\n`);}const doc={key,part:p,parts:P,indices,evidenceHash:sha256(evidence),evidence};writeFileSync(file+'.tmp',gzipSync(JSON.stringify(doc)));renameSync(file+'.tmp',file);}
function loadPart(key,p,P,n){const f=partFile(key,p,P);if(!existsSync(f))return null;const d=JSON.parse(gunzipSync(readFileSync(f)));if(d.key!==key||d.part!==p||d.parts!==P||sha256(d.evidence)!==d.evidenceHash||d.indices.length!==Math.ceil((n-p)/P))throw Error('EVIDENCE_CACHE_DRIFT');return d;}
/** Evidence for rows, computed in P deterministic modulo parts by child processes; merged in row order. */
export async function prepare(rows,label){const P=PLAN.feasibility.evidenceParts,source=evidenceSourceHash(),input=sha256(rows),key=sha256({source,input,plan:PLAN_HASH,label});mkdirSync(path.join(root,BUILD),{recursive:true});
 const missing=[...Array(P).keys()].filter(p=>!existsSync(partFile(key,p,P)));if(missing.length){const rowsFile=path.join(root,BUILD,`rows-${key}.json.gz`);writeFileSync(rowsFile,gzipSync(JSON.stringify(rows)));const start=Date.now();
  await Promise.all(missing.map(p=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(here,'evidence.mjs'),'--worker',rowsFile,label,key,String(p),String(P)],{cwd:root,env:process.env,stdio:['ignore','inherit','inherit']});c.on('close',code=>code===0?resolve():reject(Error(`EVIDENCE_WORKER_${p}_EXIT_${code}`)));})));
  process.stderr.write(`[G8 evidence ${label}] ${rows.length} rows in ${((Date.now()-start)/1000).toFixed(0)}s\n`);}
 const merged=Array(rows.length);for(let p=0;p<P;p++){const d=loadPart(key,p,P,rows.length);d.indices.forEach((i,k)=>{merged[i]=d.evidence[k];});}if(merged.some(x=>!x))throw Error('EVIDENCE_PART_MISSING');
 return {sourceHash:source,inputHash:input,key,evidenceHash:sha256(merged),evidence:merged};}
if(process.argv[2]==='--worker'){enforceCheckModeReadOnly({checkOnly:process.env.SENTINEL_READONLY==='1'});const [,,,rowsFile,label,key,p,P]=process.argv;const rows=JSON.parse(gunzipSync(readFileSync(rowsFile)));if(sha256({source:evidenceSourceHash(),input:sha256(rows),plan:PLAN_HASH,label})!==key)throw Error('EVIDENCE_WORKER_KEY_MISMATCH');computePart(rows,key,Number(p),Number(P));}
