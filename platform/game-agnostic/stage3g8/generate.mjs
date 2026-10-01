#!/usr/bin/env node
/* STAGE_3G_8 sealed generation: population families A/B and BYPASS-conditional cohorts, one single generation.
 * Unmodified corpusRecord. --verify rebuilds the payload without tracked writes and compares the committed manifest.
 * Default generation requires every evaluation file committed unchanged at HEAD.
 */
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
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
import {priorLineage as g7PriorLineage,readFitRows as g7FitRows} from '../scripts/stage3g7/generate.mjs';
import {SEED_PLAN as G7_SEEDS} from '../scripts/stage3g7/plan.mjs';
import {BUILD,COHORT_BANDS,HORIZON_BANDS,LEVELS,PLAN_HASH,PLAN_PATH,OPEN_REPORT_PATH,SEALED_MANIFEST_PATH,SEALED_PATH,SEED_PLAN,SEED_PLAN_HASH} from './plan.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.resolve(root,'../..'),at=f=>path.join(root,f);
const hex=v=>createHash('sha256').update(v).digest('hex');
export const G7_SEALED='build/stage3g7/sealed-partitions.jsonl.gz',G7_SEALED_MANIFEST='artifacts/stage3g7-target-contract/sealed-partitions-manifest.json';
export const EVALUATION_FILES=Object.freeze([PLAN_PATH,OPEN_REPORT_PATH,'stage3g8/plan.mjs','stage3g8/inherited.mjs','stage3g8/generate.mjs','stage3g8/evidence.mjs','stage3g8/certify.mjs','stage3g8/fixtures.mjs','stage3g8/statistics.mjs','stage3g8/full-suite.mjs','stage3g8/objective-progress-v1.mjs','stage3g8/typed-relation-disclosure-v1.mjs','stage3g8/typed-relation-source.mjs','stage3g8/observation-boundary-v2.mjs','tests/stage3g8-projection-disclosure.test.js']);
const readGzRows=f=>{const t=gunzipSync(readFileSync(at(f))).toString('utf8');return {text:t,rows:t.split('\n').filter(Boolean).map(l=>JSON.parse(l))};};
/** Prior lineage: the Stage 3G.7 lineage, its OPEN fit set and its sealed families, each content-hash verified. */
export function priorLineage(){const p=g7PriorLineage(),fit=g7FitRows(),m=JSON.parse(readFileSync(at(G7_SEALED_MANIFEST),'utf8')),{text,rows}=readGzRows(G7_SEALED);if(hex(text)!==m.contentHash)throw Error('Stage 3G.7 sealed payload does not match its manifest');
 return {rows:[...p.rows,...fit,...rows],sources:[...p.sources,{name:'STAGE3G7_OPEN_FIT_PLUS_SEALED',rows:fit.length+rows.length,verified:true,sealedContentHash:m.contentHash,fitContentHash:JSON.parse(readFileSync(at('artifacts/stage3g7-target-contract/fit-set-manifest.json'),'utf8')).contentHash}]};}
export const fitRows=()=>g7FitRows();
const ALL_SEEDS=()=>[...SEED_PLAN.families.A,...SEED_PLAN.families.B,...SEED_PLAN.cohorts.BYPASS_A,...SEED_PLAN.cohorts.BYPASS_B];
export function seedAudit(prior){const seeds=ALL_SEEDS(),used=new Set(prior.map(r=>r.combination.seed)),prev=new Set([...SEED_PLAN.priorSeedSpaces,...G7_SEEDS.familySeedPanels.A,...G7_SEEDS.familySeedPanels.B,G7_SEEDS.fit]);
 return {seeds,priorRowOverlap:seeds.filter(s=>used.has(s)),priorSeedSpaceOverlap:seeds.filter(s=>prev.has(s)),stillReservedTouched:seeds.filter(s=>SEED_PLAN.reservedUntouched.includes(s)),partitionsDistinct:new Set(seeds).size===seeds.length};}
const headHash=f=>{const r=spawnSync('git',['-C',repo,'show',`HEAD:platform/game-agnostic/${f}`],{encoding:'buffer',maxBuffer:1<<28});return r.status===0?hex(r.stdout):null;};
export function frozenGate(){const failures=EVALUATION_FILES.filter(f=>!existsSync(at(f))||headHash(f)!==hex(readFileSync(at(f)))).map(f=>`${f} is not committed unchanged at HEAD`);
 if(existsSync(at(PLAN_PATH))&&JSON.parse(readFileSync(at(PLAN_PATH),'utf8')).planHash!==PLAN_HASH)failures.push('plan file differs from the plan module');
 if(existsSync(at(OPEN_REPORT_PATH))&&JSON.parse(readFileSync(at(OPEN_REPORT_PATH),'utf8')).planHash!==PLAN_HASH)failures.push('open-phase report is bound to another plan');return failures;}
// Stage 3G.7 traversal: each eight-row round covers every objective; (role,shape) pairs rotate by declared index only.
const cellCombos=(seed,level,horizonBand)=>{const out=[];for(let round=0;round<FORGE_ROLE_COMPOSITION_IDS.length*FORGE_TOPOLOGY_SHAPE_IDS.length;round++)for(let j=0;j<FORGE_OBJECTIVE_COMPOSITION_IDS.length;j++)out.push({shape:FORGE_TOPOLOGY_SHAPE_IDS[(Math.floor(round/FORGE_ROLE_COMPOSITION_IDS.length)+j)%FORGE_TOPOLOGY_SHAPE_IDS.length],roles:FORGE_ROLE_COMPOSITION_IDS[(round+j)%FORGE_ROLE_COMPOSITION_IDS.length],objectives:FORGE_OBJECTIVE_COMPOSITION_IDS[j],horizonBand,level,seed});return out;};
const bump=(o,k)=>{o[k]=(o[k]??0)+1;};
function build(spec,claimed){
 const checkpoint=at(`${BUILD}/generation-${spec.partition}.json`);mkdirSync(at(BUILD),{recursive:true});const key=hex(readFileSync(new URL('./generate.mjs',import.meta.url)))+SEED_PLAN_HASH+spec.partition;const saved=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint)):null;if(saved&&saved.key!==key)throw Error('GENERATOR_CHECKPOINT_SOURCE_DRIFT');const savedRows=new Map((saved?.rows??[]).map(r=>[r.combinationIndex,r]));
 const rows=[],stats={cells:{},attempted:0,admitted:0,screened:0};let index=0;
 for(const level of LEVELS)for(const band of spec.bands){const combos=spec.panel.flatMap(s=>cellCombos(s,level,band)),cell={available:combos.length,attempted:0,admitted:0,screened:0,rejected:{}},perObjective={};
  for(let i=0;i<combos.length&&cell.admitted<spec.quota;i++){const c=combos[i],ix=index++;
   if(spec.objectiveQuota&&(perObjective[c.objectives]??0)>=spec.objectiveQuota){bump(cell.rejected,'OBJECTIVE_QUOTA_FILLED');continue;}
   if(spec.requireBypass){cell.screened++;stats.screened++;if(!symmetricLegalActions(rebuildWorld({combination:c})).some(a=>a.actionType==='BYPASS')){bump(cell.rejected,'NO_BYPASS_OFFERED');continue;}}
   cell.attempted++;stats.attempted++;const row=savedRows.get(ix)??corpusRecord(spec.partition,c,ix,{withEquivariance:ix%25===0});
   const reason=!row.admitted?row.reason:claimed.record.has(row.recordHash)?'RECORD_HASH_CLAIMED':claimed.world.has(row.worldHash)?'WORLD_HASH_CLAIMED':claimed.topology.has(row.topologyHash)?'TOPOLOGY_HASH_CLAIMED':null;
   if(reason){bump(cell.rejected,reason);continue;}
   claimed.record.add(row.recordHash);claimed.world.add(row.worldHash);claimed.topology.add(row.topologyHash);rows.push(row);cell.admitted++;stats.admitted++;bump(perObjective,c.objectives);
   if(rows.length%20===0){writeFileSync(checkpoint+'.tmp',JSON.stringify({key,rows}));renameSync(checkpoint+'.tmp',checkpoint);}}
  if(!spec.allowShortfall&&cell.admitted!==spec.quota)throw Error(`STAGE3G8 ${spec.partition} L${level} ${band}: ${cell.admitted}/${spec.quota}`);
  cell.shortfall=spec.quota-cell.admitted;stats.cells[`L${level}:${band}`]=cell;process.stderr.write(`[stage3g8 ${spec.partition}] L${level} ${band} ${cell.admitted}/${spec.quota}\n`);}
 return {rows,stats};}
export const PARTITIONS=()=>[
 {partition:'STAGE3G8_A',panel:SEED_PLAN.families.A,bands:HORIZON_BANDS,quota:SEED_PLAN.quotas.sealedPerFamilyLevelBand,objectiveQuota:SEED_PLAN.quotas.objectivePerFamilyLevelBand},
 {partition:'STAGE3G8_B',panel:SEED_PLAN.families.B,bands:HORIZON_BANDS,quota:SEED_PLAN.quotas.sealedPerFamilyLevelBand,objectiveQuota:SEED_PLAN.quotas.objectivePerFamilyLevelBand},
 {partition:'STAGE3G8_BYPASS_A',panel:SEED_PLAN.cohorts.BYPASS_A,bands:COHORT_BANDS,quota:SEED_PLAN.quotas.cohortPerLevelBand,requireBypass:true,allowShortfall:true},
 {partition:'STAGE3G8_BYPASS_B',panel:SEED_PLAN.cohorts.BYPASS_B,bands:COHORT_BANDS,quota:SEED_PLAN.quotas.cohortPerLevelBand,requireBypass:true,allowShortfall:true}];
export function readSealed(){const m=JSON.parse(readFileSync(at(SEALED_MANIFEST_PATH),'utf8')),{text,rows}=readGzRows(SEALED_PATH);if(hex(text)!==m.contentHash)throw Error('SEALED_DRIFT');return {manifest:m,rows};}
async function main({verify}){
 enforceCheckModeReadOnly({checkOnly:verify});const head=spawnSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
 const failures=frozenGate();if(failures.length)throw Error(`STAGE3G8_SEALED_GATE_CLOSED: ${failures.join('; ')}`);
 if(!verify&&existsSync(at(SEALED_MANIFEST_PATH)))throw Error('STAGE3G8_SINGLE_GENERATION_ONLY: use --verify for reproduction');
 const prior=priorLineage(),audit=seedAudit(prior.rows);if(audit.priorRowOverlap.length||audit.priorSeedSpaceOverlap.length||audit.stillReservedTouched.length||!audit.partitionsDistinct)throw Error(`STAGE3G8 seed collision: ${JSON.stringify(audit)}`);
 const claimed={record:new Set(prior.rows.map(r=>r.recordHash)),world:new Set(prior.rows.map(r=>r.worldHash)),topology:new Set(prior.rows.map(r=>r.topologyHash))};
 const rows=[],stats={};for(const spec of PARTITIONS()){const r=build(spec,claimed);rows.push(...r.rows);stats[spec.partition]=r.stats;}
 const content=`${rows.map(r=>JSON.stringify(r)).join('\n')}\n`;mkdirSync(at(BUILD),{recursive:true});
 if(verify){const stored=JSON.parse(readFileSync(at(SEALED_MANIFEST_PATH),'utf8')),reproduced=stored.contentHash===hex(content)&&JSON.stringify(stored.stats)===JSON.stringify(stats);if(reproduced&&!existsSync(at(SEALED_PATH)))writeFileSync(at(SEALED_PATH),gzipSync(Buffer.from(content,'utf8'),{level:9}));console.log(JSON.stringify({verify:true,reproduced,contentHash:hex(content),storedContentHash:stored.contentHash,generatedAtHead:stored.generatedAtHead,head},null,2));if(!reproduced)process.exitCode=1;return;}
 const manifest={schemaVersion:1,stage:'STAGE_3G_8',kind:'SEALED',planHash:PLAN_HASH,seedPlanHash:SEED_PLAN_HASH,generatedAtHead:head,benchmark:benchmarkBinding(),priorLineage:prior.sources,seedAudit:audit,stats,rows:rows.length,partitions:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v.admitted])),contentHash:hex(content),generator:'stage3g8/generate.mjs',recordBuilder:'scripts/generate-stage3f6p1d-symmetric-corpus.mjs#corpusRecord (unmodified)'};
 writeFileSync(at(SEALED_PATH),gzipSync(Buffer.from(content,'utf8'),{level:9}));writeFileSync(at(SEALED_MANIFEST_PATH),`${JSON.stringify(manifest,null,2)}\n`);
 console.log(JSON.stringify({rows:manifest.rows,partitions:manifest.partitions,contentHash:manifest.contentHash,seedAudit:audit,generatedAtHead:head},null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main({verify:process.argv.includes('--verify')});
