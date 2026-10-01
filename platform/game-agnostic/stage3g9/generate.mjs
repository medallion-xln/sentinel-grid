#!/usr/bin/env node
/* STAGE_3G_9 sealed generation (single generation). Unmodified corpusRecord.
 * Workers (--warm=<partition>:<level>) pre-compute pure records for one block into a cache; the single canonical
 * admission pass in the parent decides every admitted row in partition order with cumulative claims, computing any
 * record the cache lacks. The payload is therefore identical with or without caches. --verify rebuilds and compares.
 */
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {enforceCheckModeReadOnly} from '../scripts/certification/check-mode-guard.mjs';
import {FORGE_TOPOLOGY_SHAPE_IDS} from '../src/forge/topology.js';
import {FORGE_OBJECTIVE_COMPOSITION_IDS,FORGE_ROLE_COMPOSITION_IDS} from '../src/forge/scenarios-v2.js';
import {symmetricLegalActions} from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import {benchmarkBinding,corpusRecord} from '../scripts/generate-stage3f6p1d-symmetric-corpus.mjs';
import {rebuildWorld} from '../scripts/stage3f6p1asym-evidence.mjs';
import {priorLineage as g8PriorLineage,readSealed as g8ReadSealed,fitRows as g8FitRows} from '../stage3g8/generate.mjs';
import {BUILD,COHORT_BANDS,HORIZON_BANDS,LEVELS,PLAN_HASH,PLAN_PATH,OPEN_REPORT_PATH,SEALED_MANIFEST_PATH,SEALED_PATH,SEED_PLAN,SEED_PLAN_HASH} from './plan.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(root,'../..'),at=f=>path.join(root,f);
const hex=v=>createHash('sha256').update(v).digest('hex');
export const EVALUATION_FILES=Object.freeze([PLAN_PATH,OPEN_REPORT_PATH,'stage3g9/plan.mjs','stage3g9/inherited.mjs','stage3g9/generate.mjs','stage3g9/evidence.mjs','stage3g9/certify.mjs','stage3g9/fixtures.mjs','stage3g9/statistics.mjs','stage3g9/full-suite.mjs','stage3g9/typed-relation-semantic-channel-v1.mjs','tests/stage3g9-c2-requalification.test.js']);
/** Prior lineage: the Stage 3G.8 lineage plus the Stage 3G.8 sealed families and cohorts, content-hash verified. */
export function priorLineage(){const p=g8PriorLineage(),s=g8ReadSealed();return {rows:[...p.rows,...s.rows],sources:[...p.sources,{name:'STAGE3G8_SEALED',rows:s.rows.length,verified:true,contentHash:s.manifest.contentHash}]};}
export const fitRows=()=>g8FitRows();
const ALL_SEEDS=()=>[...SEED_PLAN.families.A,...SEED_PLAN.families.B,...SEED_PLAN.cohorts.BYPASS_A,...SEED_PLAN.cohorts.BYPASS_B];
export function seedAudit(prior){const seeds=ALL_SEEDS(),used=new Set(prior.map(r=>r.combination.seed)),prev=new Set(SEED_PLAN.priorSeedSpaces);return {seeds,priorRowOverlap:seeds.filter(s=>used.has(s)),priorSeedSpaceOverlap:seeds.filter(s=>prev.has(s)),stillReservedTouched:seeds.filter(s=>SEED_PLAN.reservedUntouched.includes(s)),partitionsDistinct:new Set(seeds).size===seeds.length};}
const headHash=f=>{const r=spawnSync('git',['-C',repo,'show',`HEAD:platform/game-agnostic/${f}`],{encoding:'buffer',maxBuffer:1<<28});return r.status===0?hex(r.stdout):null;};
export function frozenGate(){const failures=EVALUATION_FILES.filter(f=>!existsSync(at(f))||headHash(f)!==hex(readFileSync(at(f)))).map(f=>`${f} is not committed unchanged at HEAD`);
 if(existsSync(at(PLAN_PATH))&&JSON.parse(readFileSync(at(PLAN_PATH),'utf8')).planHash!==PLAN_HASH)failures.push('plan file differs from the plan module');
 if(existsSync(at(OPEN_REPORT_PATH))&&JSON.parse(readFileSync(at(OPEN_REPORT_PATH),'utf8')).planHash!==PLAN_HASH)failures.push('open-phase report is bound to another plan');return failures;}
const cellCombos=(seed,level,horizonBand)=>{const out=[];for(let round=0;round<FORGE_ROLE_COMPOSITION_IDS.length*FORGE_TOPOLOGY_SHAPE_IDS.length;round++)for(let j=0;j<FORGE_OBJECTIVE_COMPOSITION_IDS.length;j++)out.push({shape:FORGE_TOPOLOGY_SHAPE_IDS[(Math.floor(round/FORGE_ROLE_COMPOSITION_IDS.length)+j)%FORGE_TOPOLOGY_SHAPE_IDS.length],roles:FORGE_ROLE_COMPOSITION_IDS[(round+j)%FORGE_ROLE_COMPOSITION_IDS.length],objectives:FORGE_OBJECTIVE_COMPOSITION_IDS[j],horizonBand,level,seed});return out;};
export const PARTITIONS=()=>[
 {partition:'STAGE3G9_A',panel:SEED_PLAN.families.A,bands:HORIZON_BANDS,quota:SEED_PLAN.quotas.sealedPerFamilyLevelBand,objectiveQuota:SEED_PLAN.quotas.objectivePerFamilyLevelBand},
 {partition:'STAGE3G9_B',panel:SEED_PLAN.families.B,bands:HORIZON_BANDS,quota:SEED_PLAN.quotas.sealedPerFamilyLevelBand,objectiveQuota:SEED_PLAN.quotas.objectivePerFamilyLevelBand},
 {partition:'STAGE3G9_BYPASS_A',panel:SEED_PLAN.cohorts.BYPASS_A,bands:COHORT_BANDS,quota:SEED_PLAN.quotas.cohortPerLevelBand,requireBypass:true,allowShortfall:true},
 {partition:'STAGE3G9_BYPASS_B',panel:SEED_PLAN.cohorts.BYPASS_B,bands:COHORT_BANDS,quota:SEED_PLAN.quotas.cohortPerLevelBand,requireBypass:true,allowShortfall:true}];
/** Canonical enumeration: cells in (level, band) order; global index g is independent of admissions. */
function cells(spec){const out=[];let g=0;for(const level of LEVELS)for(const band of spec.bands){const combos=spec.panel.flatMap(s=>cellCombos(s,level,band)).map(c=>({c,g:g++}));out.push({level,band,combos});}return out;}
const bump=(o,k)=>{o[k]=(o[k]??0)+1;};
/** The canonical admission pass for one spec (optionally restricted to one level). Mutates claimed. */
function admit(spec,claimed,cache,{onlyLevel=null}={}){const rows=[],stats={cells:{},attempted:0,admitted:0,screened:0};
 for(const cell of cells(spec)){if(onlyLevel!==null&&cell.level!==onlyLevel)continue;const s={available:cell.combos.length,attempted:0,admitted:0,screened:0,rejected:{}},perObjective={};
  for(const {c,g} of cell.combos){if(s.admitted>=spec.quota)break;
   if(spec.objectiveQuota&&(perObjective[c.objectives]??0)>=spec.objectiveQuota){bump(s.rejected,'OBJECTIVE_QUOTA_FILLED');continue;}
   if(spec.requireBypass){s.screened++;stats.screened++;let ok=cache.screen.get(g);if(ok===undefined){ok=symmetricLegalActions(rebuildWorld({combination:c})).some(a=>a.actionType==='BYPASS');cache.screen.set(g,ok);}if(!ok){bump(s.rejected,'NO_BYPASS_OFFERED');continue;}}
   s.attempted++;stats.attempted++;let row=cache.record.get(g);if(!row){row=corpusRecord(spec.partition,c,g,{withEquivariance:g%25===0});cache.record.set(g,row);cache.misses=(cache.misses??0)+1;}
   const reason=!row.admitted?row.reason:claimed.record.has(row.recordHash)?'RECORD_HASH_CLAIMED':claimed.world.has(row.worldHash)?'WORLD_HASH_CLAIMED':claimed.topology.has(row.topologyHash)?'TOPOLOGY_HASH_CLAIMED':null;
   if(reason){bump(s.rejected,reason);continue;}claimed.record.add(row.recordHash);claimed.world.add(row.worldHash);claimed.topology.add(row.topologyHash);rows.push(row);s.admitted++;stats.admitted++;bump(perObjective,c.objectives);}
  if(onlyLevel===null&&!spec.allowShortfall&&s.admitted!==spec.quota)throw Error(`STAGE3G9 ${spec.partition} L${cell.level} ${cell.band}: ${s.admitted}/${spec.quota}`);s.shortfall=spec.quota-s.admitted;stats.cells[`L${cell.level}:${cell.band}`]=s;}
 return {rows,stats};}
const cacheKey=()=>hex(readFileSync(new URL('./generate.mjs',import.meta.url)))+hex(readFileSync(at('scripts/generate-stage3f6p1d-symmetric-corpus.mjs')))+SEED_PLAN_HASH;
const cacheFile=(p,l)=>at(`${BUILD}/record-cache-${p}-L${l}.json.gz`),claimedFile=()=>at(`${BUILD}/claimed-prior.json.gz`);
function warm(partition,level){const spec=PARTITIONS().find(s=>s.partition===partition),c=JSON.parse(gunzipSync(readFileSync(claimedFile())));if(c.key!==cacheKey())throw Error('CLAIMED_FILE_DRIFT');
 const claimed={record:new Set(c.record),world:new Set(c.world),topology:new Set(c.topology)},cache={record:new Map(),screen:new Map()};admit(spec,claimed,cache,{onlyLevel:level});
 const f=cacheFile(partition,level);writeFileSync(f+'.tmp',gzipSync(JSON.stringify({key:cacheKey(),records:[...cache.record],screens:[...cache.screen]})));renameSync(f+'.tmp',f);process.stderr.write(`[G9 warm] ${partition} L${level} records=${cache.record.size}\n`);}
async function warmAll(prior){mkdirSync(at(BUILD),{recursive:true});const key=cacheKey();writeFileSync(claimedFile(),gzipSync(JSON.stringify({key,record:prior.rows.map(r=>r.recordHash),world:prior.rows.map(r=>r.worldHash),topology:prior.rows.map(r=>r.topologyHash)})));
 const blocks=PARTITIONS().flatMap(s=>LEVELS.map(l=>[s.partition,l])).filter(([p,l])=>{const f=cacheFile(p,l);return !existsSync(f)||JSON.parse(gunzipSync(readFileSync(f))).key!==key;});const width=8;let next=0;
 await Promise.all(Array.from({length:width},async()=>{while(next<blocks.length){const [p,l]=blocks[next++];await new Promise((res,rej)=>{const ch=spawn(process.execPath,[fileURLToPath(import.meta.url),`--warm=${p}:${l}`],{cwd:root,env:process.env,stdio:['ignore','inherit','inherit']});ch.on('close',code=>code===0?res():rej(Error(`WARM_${p}_${l}_EXIT_${code}`)));});}}));}
function loadCache(partition){const cache={record:new Map(),screen:new Map()};for(const l of LEVELS){const f=cacheFile(partition,l);if(!existsSync(f))continue;const d=JSON.parse(gunzipSync(readFileSync(f)));if(d.key!==cacheKey())continue;for(const [g,r] of d.records)cache.record.set(g,r);for(const [g,s] of d.screens)cache.screen.set(g,s);}return cache;}
export function readSealed(){const m=JSON.parse(readFileSync(at(SEALED_MANIFEST_PATH),'utf8')),t=gunzipSync(readFileSync(at(SEALED_PATH))).toString('utf8');if(hex(t)!==m.contentHash)throw Error('SEALED_DRIFT');return {manifest:m,rows:t.split('\n').filter(Boolean).map(l=>JSON.parse(l))};}
async function main({verify}){
 enforceCheckModeReadOnly({checkOnly:verify});const head=spawnSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
 const failures=frozenGate();if(failures.length)throw Error(`STAGE3G9_SEALED_GATE_CLOSED: ${failures.join('; ')}`);
 if(!verify&&existsSync(at(SEALED_MANIFEST_PATH)))throw Error('STAGE3G9_SINGLE_GENERATION_ONLY: use --verify for reproduction');
 const prior=priorLineage(),audit=seedAudit(prior.rows);if(audit.priorRowOverlap.length||audit.priorSeedSpaceOverlap.length||audit.stillReservedTouched.length||!audit.partitionsDistinct)throw Error(`STAGE3G9 seed collision: ${JSON.stringify(audit)}`);
 const start=Date.now();await warmAll(prior);const warmSeconds=(Date.now()-start)/1000;
 const claimed={record:new Set(prior.rows.map(r=>r.recordHash)),world:new Set(prior.rows.map(r=>r.worldHash)),topology:new Set(prior.rows.map(r=>r.topologyHash))};
 const rows=[],stats={},misses={};for(const spec of PARTITIONS()){const cache=loadCache(spec.partition),r=admit(spec,claimed,cache);rows.push(...r.rows);stats[spec.partition]=r.stats;misses[spec.partition]=cache.misses??0;process.stderr.write(`[stage3g9 ${spec.partition}] ${r.stats.admitted} rows, ${cache.misses??0} cache misses\n`);}
 const content=`${rows.map(r=>JSON.stringify(r)).join('\n')}\n`;
 if(verify){const stored=JSON.parse(readFileSync(at(SEALED_MANIFEST_PATH),'utf8')),reproduced=stored.contentHash===hex(content)&&JSON.stringify(stored.stats)===JSON.stringify(stats);if(reproduced&&!existsSync(at(SEALED_PATH)))writeFileSync(at(SEALED_PATH),gzipSync(Buffer.from(content,'utf8'),{level:9}));console.log(JSON.stringify({verify:true,reproduced,contentHash:hex(content),storedContentHash:stored.contentHash,generatedAtHead:stored.generatedAtHead,head,cacheMisses:misses,warmSeconds},null,2));if(!reproduced)process.exitCode=1;return;}
 const manifest={schemaVersion:1,stage:'STAGE_3G_9',kind:'SEALED',planHash:PLAN_HASH,seedPlanHash:SEED_PLAN_HASH,generatedAtHead:head,benchmark:benchmarkBinding(),priorLineage:prior.sources,seedAudit:audit,stats,rows:rows.length,partitions:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v.admitted])),contentHash:hex(content),generator:'stage3g9/generate.mjs',recordBuilder:'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)',orchestration:{warmWorkers:8,warmSeconds,cacheMisses:misses,note:'cache-only parallelism; admission is the single canonical pass'}};
 writeFileSync(at(SEALED_PATH),gzipSync(Buffer.from(content,'utf8'),{level:9}));writeFileSync(at(SEALED_MANIFEST_PATH),`${JSON.stringify(manifest,null,2)}\n`);
 console.log(JSON.stringify({rows:manifest.rows,partitions:manifest.partitions,contentHash:manifest.contentHash,cacheMisses:misses,warmSeconds,generatedAtHead:head},null,2));}
const warmArg=process.argv.find(a=>a.startsWith('--warm='));
if(warmArg){enforceCheckModeReadOnly({checkOnly:process.env.SENTINEL_READONLY==='1'});const [p,l]=warmArg.slice(7).split(':');warm(p,Number(l));}
else if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main({verify:process.argv.includes('--verify')});
