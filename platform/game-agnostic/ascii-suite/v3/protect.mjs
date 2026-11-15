import {readFileSync,writeFileSync,readdirSync,statSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';import {resolve,dirname,relative} from 'node:path';import {fileURLToPath} from 'node:url';
import {verify as verifyH2,read as readH2,verifyClosure} from '../../stage3h2-development/guard.mjs';
import {verifyBaseline,sourceManifest as temporalSources} from '../v21/freeze.mjs';
export const DIR=dirname(fileURLToPath(import.meta.url)),GA=resolve(DIR,'../..');
export const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export const raw=p=>hash(readFileSync(p));export const read=p=>JSON.parse(readFileSync(resolve(DIR,p),'utf8'));
export function save(p,v){const file=resolve(DIR,p);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(v,null,2)+'\n',{flag:'wx'});}
const walk=p=>readdirSync(p).sort().flatMap(n=>{const f=resolve(p,n);return statSync(f).isDirectory()?walk(f):[f];});
export function inheritance(){const h2=verifyH2();verifyClosure(readH2('validation-freeze.json').source);const baseline=verifyBaseline(),temporal=temporalSources();if(temporal.sourceHash!=='6558b0f7d4a5a1e5965e8b7baa6599bc121246e877ae9335a15c058b3d7db902')throw Error('ASCII_21_SOURCE_CHANGED');return{h2,baseline,temporalSourceHash:temporal.sourceHash,temporalFiles:temporal.files,priorConclusions:raw(resolve(GA,'stage3h2-development/result.json')),semanticReproduction:'Prior fresh F/G and H1/H2 read-only reproductions retained under currently verified exact predecessor/source closure; this is a new byte-integrity check, not a fresh semantic certification run.'};}
export function verify(){const old=read('inheritance.json'),now=inheritance();if(hash(old)!==hash(now))throw Error('V3_PREDECESSOR_CLOSURE_CHANGED');return{unchanged:true,protectedFiles:now.h2.count,hash:hash(now),stage3f:now.baseline.stage3f,stage3g:now.baseline.stage3g};}
export function sourceClosure(){const fs=walk(DIR).filter(p=>!p.includes('/results/')&&!p.includes('/screenshots/')&&!p.endsWith('.log')&&!p.endsWith('.md')&&!['freeze.json','registration.json','inheritance.json','browser-evidence.json'].includes(p.split('/').at(-1)));const files=Object.fromEntries(fs.map(p=>[relative(DIR,p),raw(p)]));return{files,hash:hash(files)};}
export function checkSource(s){for(const[p,h]of Object.entries(s.files))if(raw(resolve(DIR,p))!==h)throw Error('FROZEN_V3_SOURCE_CHANGED:'+p);if(hash(s.files)!==s.hash)throw Error('SOURCE_MANIFEST_CHANGED');}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.includes('--capture'))save('inheritance.json',inheritance());console.log(JSON.stringify(verify()));}
