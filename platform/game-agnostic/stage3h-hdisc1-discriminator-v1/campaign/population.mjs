import {readFileSync,writeFileSync,mkdirSync,statSync,chmodSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {sha256,stable} from '../discriminator/canonical.mjs';
export const digest=x=>sha256(stable(x));
export function exclusive(file,value){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
export function writePopulation(root,result){
 const p=result.population;if(!['EXPLORATION','VALIDATION'].includes(p))throw Error('POPULATION_INVALID');
 const dir=resolve(root,p);mkdirSync(dir,{recursive:true});const payload=JSON.stringify(result.classes)+'\n',data=resolve(dir,'classes.json');writeFileSync(data,payload,{flag:'wx',mode:0o600});
 const body={schema:'HDISC1_POPULATION_V1',population:p,allocationDigest:result.allocationDigest,ids:result.classes.map(c=>c.id),families:result.classes.map(c=>c.family),entries:result.classes.map(c=>({id:c.id,block:c.block,k:c.k,worldHash:c.worldHash,family:c.family})),classListDigest:digest(result.classes.map(c=>c.id)),data:{file:'classes.json',sha256:sha256(payload)},classes:result.classes.length};
 if(p==='VALIDATION')chmodSync(data,0);
 exclusive(resolve(dir,'manifest.json'),{...body,digest:digest(body)});return body;
}
export function manifest(root,p){
 if(!['EXPLORATION','VALIDATION'].includes(p))throw Error('POPULATION_INVALID');
 const dir=resolve(root,p),m=JSON.parse(readFileSync(resolve(dir,'manifest.json'),'utf8')),{digest:expected,...body}=m;
 if(m.schema!=='HDISC1_POPULATION_V1'||m.population!==p||expected!==digest(body)||m.classes!==m.ids?.length||m.classes!==m.families?.length||new Set(m.ids).size!==m.classes||m.classListDigest!==digest(m.ids))throw Error('POPULATION_MANIFEST_INVALID');
 const file=resolve(dir,m.data.file),rel=relative(dir,file);if(rel.startsWith('..')||rel.startsWith('/')||lstatSync(file).isSymbolicLink()||realpathSync(file)!==resolve(realpathSync(dir),m.data.file)||lstatSync(dir).isSymbolicLink())throw Error('POPULATION_PATH_INVALID');
 return {m,file};
}
export function readPopulation(root,p,phase){
 const {m,file}=manifest(root,p),marker=resolve(root,'validation-start.json'),result=resolve(root,'validation-result.json');
 if(p==='VALIDATION'){
  if(phase!=='RUN'&&phase!=='CHECK')throw Error('VALIDATION_OUTCOMES_LOCKED');
  if(!existsSync(marker)||phase==='RUN'&&existsSync(result)||phase==='CHECK'&&!existsSync(result))throw Error('VALIDATION_LIFECYCLE_INVALID');
  const started=JSON.parse(readFileSync(marker,'utf8'));if(started.populationDigest!==m.digest)throw Error('RUN_MARKER_POPULATION_MISMATCH');
 }else if(phase!=='DEVELOPMENT')throw Error('EXPLORATION_PHASE_INVALID');
 const mode=statSync(file).mode&0o777;let raw;try{if(p==='VALIDATION')chmodSync(file,0o400);raw=readFileSync(file,'utf8');}finally{if(p==='VALIDATION')chmodSync(file,mode);}
 if(sha256(raw)!==m.data.sha256)throw Error('POPULATION_DATA_CHANGED');const classes=JSON.parse(raw);
 if(digest(classes.map(c=>c.id))!==m.classListDigest||classes.some(c=>c.population!==p)||stable(classes.map(c=>c.family))!==stable(m.families))throw Error('POPULATION_RECORDS_MISMATCH');return classes;
}
export function checkDisjoint(root){const a=manifest(root,'EXPLORATION').m,b=manifest(root,'VALIDATION').m,f=new Set(a.families);if(b.families.some(x=>f.has(x)))throw Error('POPULATIONS_SHARE_ORIGIN_FAMILY');if(a.allocationDigest!==b.allocationDigest)throw Error('POPULATION_ALLOCATION_MISMATCH');return true;}
