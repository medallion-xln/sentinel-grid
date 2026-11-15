// Evaluation-side native population construction. The runner checks the seven-condition gate before calling this module.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {schedule,scheduleHash} from '../../stage3h-owner-governed-v1/connector.mjs';
import {screenWorld} from '../../stage3h-hw1-dev-v1/i2-screen.mjs';
import {buildClass} from '../../stage3h-hw1-dev-v1/i2-build-class.mjs';
import {nativeWorld} from '../../stage3h-safety-feasibility-v1/twins.mjs';
import {projectPublic} from '../../stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs';
import {evidenceForView} from '../../stage3h-sk1-safety-kernel-v1/infra/evidence-source.mjs';
import {scanTextHits} from '../../stage3h-sk1-safety-kernel-v1/infra/allocator.mjs';
import {loadPortableExclusions,blockFailures,contextIdentity,contamination,BLOCK,PER_BLOCK} from '../../stage3h-hdisc0-design-v1/readiness/exclusions/portable-exclusions.mjs';
import {GA} from '../readiness/lib.mjs';
import {sha256,stable} from '../discriminator/canonical.mjs';
export const SPLIT={id:'HDISC1_FAMILY_SPLIT_V1',m:19,t:9};
export const populationOf=family=>parseInt(sha256(`${SPLIT.id}|${family}`).slice(0,8),16)%SPLIT.m<SPLIT.t?'VALIDATION':'EXPLORATION';
const familyOf=cell=>cell.split('/').slice(0,3).join('/');
const contract=()=>JSON.parse(readFileSync(resolve(GA,'stage3h-final-review-handoff/amendments/v3/contract-v3.json'),'utf8'));
export function allocation(blocks){
 if(!Array.isArray(blocks)||!blocks.length||new Set(blocks).size!==blocks.length||blocks.some(b=>!Number.isInteger(b)||b<100||b>999))throw Error('ALLOCATION_BLOCKS_INVALID');
 const ctx=loadPortableExclusions(),hits=scanTextHits(blocks),hashes={},families=new Set();
 for(const block of blocks){if(blockFailures(ctx,block).length||hits.get(block)>0)throw Error('NAMESPACE_EXCLUDED_OR_PREVIOUSLY_EXPOSED');
  const list=schedule(contract().populations,block*BLOCK);if(list.length!==PER_BLOCK)throw Error('SCHEDULE_SIZE_CHANGED');hashes[block]=scheduleHash(list);list.filter(c=>c.horizonBand==='H2').forEach(c=>families.add(familyOf(c.cell)));
 }
 const validationFamilies=[...families].filter(f=>populationOf(f)==='VALIDATION').length;if(validationFamilies<30)throw Error('INSUFFICIENT_SCHEDULED_VALIDATION_FAMILIES');
 const body={schema:'HDISC1_ALLOCATION_V1',blocks,scheduleHashes:hashes,exclusionContext:contextIdentity(ctx).identitySha256,split:SPLIT,targets:{EXPLORATION:1000,VALIDATION:900},validationFamilies,holdout:false};return {...body,digest:sha256(stable(body))};
}
export function verifyAllocation(a){const {digest,...body}=a;if(a.schema!=='HDISC1_ALLOCATION_V1'||digest!==sha256(stable(body))||stable(a.split)!==stable(SPLIT)||a.holdout!==false)throw Error('ALLOCATION_INVALID');return a;}
export function buildPopulation(a,population){
 verifyAllocation(a);if(!['EXPLORATION','VALIDATION'].includes(population))throw Error('POPULATION_NOT_AUTHORIZED');
 const ctx=loadPortableExclusions();if(contextIdentity(ctx).identitySha256!==a.exclusionContext)throw Error('EXCLUSION_CONTEXT_CHANGED');
 const target=population==='EXPLORATION'?1000:900,cap=Math.floor(.05*target),seen=new Set(),counts=new Map(),classes=[],funnel={},spent=[];
 for(const block of a.blocks){if(blockFailures(ctx,block).length)throw Error('ALLOCATED_BLOCK_NOW_EXCLUDED');const list=schedule(contract().populations,block*BLOCK);if(scheduleHash(list)!==a.scheduleHashes[block])throw Error('SCHEDULE_CHANGED');
  for(let k=0;k<list.length&&classes.length<target;k++){
   const combo={...list[k],k},family=familyOf(combo.cell);if(combo.horizonBand!=='H2'||populationOf(family)!==population)continue;
   if((counts.get(family)||0)>=cap)continue;
   if(!spent.includes(block))spent.push(block);
   const screened=screenWorld(combo,ctx,seen);funnel[screened.status]=(funnel[screened.status]||0)+1;if(screened.status!=='ADMITTED')continue;
   const id=`HD1${population==='EXPLORATION'?'E':'V'}-${String(classes.length+1).padStart(4,'0')}`,entry={...screened,id,block,k,family};
   const c=buildClass(entry,combo,ctx.strict);if(c.status!=='OK')throw Error('ADMITTED_CLASS_BUILD_FAILED:'+c.status);
   const w=nativeWorld(combo);if(w.rejected||w.worldHash!==entry.worldHash||stable(projectPublic(w.view))!==stable(c.projection))throw Error('PUBLIC_PROJECTION_REGENERATION_MISMATCH');
   const {evidence,lock}=evidenceForView(w.view,w.band),indices=ids=>ids.map(id=>lock.menu.indexOf(id)).sort((a,b)=>a-b),sorted=x=>[...x].sort((a,b)=>a-b);
   if(stable(indices(lock.selections.B))!==stable(sorted(c.B))||stable(indices(lock.selections.N))!==stable(sorted(c.N)))throw Error('COMPARATOR_BINDING_MISMATCH');
   Object.assign(c,{id,block,k,family,population,evidence,band:w.band});classes.push(c);counts.set(family,(counts.get(family)||0)+1);
  }if(classes.length===target)break;
 }
 if(classes.length!==target||population==='VALIDATION'&&counts.size<30)throw Error('STOP_SUPPLY');
 if(contamination(ctx,classes).length)throw Error('POPULATION_CONTAMINATED');
 return {classes,funnel,spent,allocationDigest:a.digest,population};
}

export function comboFor(a,entry){verifyAllocation(a);if(!a.blocks.includes(entry.block))throw Error('BLOCK_NOT_ALLOCATED');const list=schedule(contract().populations,entry.block*BLOCK);if(scheduleHash(list)!==a.scheduleHashes[entry.block])throw Error('SCHEDULE_CHANGED');const combo=list[entry.k];if(!combo||combo.horizonBand!=='H2')throw Error('INVALID_CLASS_SCHEDULE');return {...combo,k:entry.k};}
