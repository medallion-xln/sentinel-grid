import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,existsSync,openSync,writeSync,closeSync} from 'node:fs';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const DIR=dirname(fileURLToPath(import.meta.url)),GA=resolve(DIR,'../..');
export const digest=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export const raw=p=>digest(readFileSync(p));
export const read=p=>JSON.parse(readFileSync(p,'utf8'));
export function save(p,v){mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});}
export function jsonl(p,rows){mkdirSync(dirname(p),{recursive:true});writeFileSync(p,rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});}
export const rows=p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
export function writer(p){mkdirSync(dirname(p),{recursive:true});const fd=openSync(p,'wx');let count=0;return{push(v){writeSync(fd,JSON.stringify(v)+'\n');count++;},close(){closeSync(fd);return{path:p,count,hash:raw(p)};}};}
export const walk=p=>readdirSync(p).sort().flatMap(n=>{const f=resolve(p,n);return statSync(f).isDirectory()?walk(f):[f];});
export const manifest=(p,filter=()=>true)=>Object.fromEntries(walk(p).filter(filter).map(f=>[relative(p,f),raw(f)]));
export function checkManifest(root,files){for(const[p,h]of Object.entries(files))if(!existsSync(resolve(root,p))||raw(resolve(root,p))!==h)throw Error('PROTECTED_FILE_CHANGED:'+p);return{pass:true,count:Object.keys(files).length,hash:digest(files)};}
