#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enforceCheckModeReadOnly } from '../certification/check-mode-guard.mjs';
const checkOnly=process.argv.includes('--check'), phaseOpen=process.argv.includes('--phase=open'), dryRun=process.argv.includes('--dry-run');
enforceCheckModeReadOnly({checkOnly:checkOnly||dryRun});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),repo=path.resolve(root,'../..');
const at=f=>path.join(root,f), json=f=>JSON.parse(readFileSync(at(f),'utf8')), hex=v=>createHash('sha256').update(v).digest('hex');
const git=(...a)=>spawnSync('git',['-C',repo,...a],{encoding:'utf8',maxBuffer:1<<28});
const log=s=>process.stderr.write(`[stage3g5] ${s}\n`);
const numerics=await import('../../src/core/canonical-numerics-v1.js');
if(Math.exp!==numerics.exp)throw new Error('Stage3G5 requires canonical runtime');
const P=await import('./plan.mjs');
const {stage3g5Evidence,isEligible}=await import('./evidence.mjs');
const {EVALUATION_FILES,priorLineage,readFitRows,seedAudit,frozenGate}=await import('./generate.mjs');
const {readCorpus}=await import('../generate-stage3f6p1e-policy-evidence.mjs');
const {STAGE3F6P1ASYM_STATE_FEATURES}=await import('../stage3f6p1asym-analysis-plan.mjs');
const {fitCandidateLogit,scoreCandidates,topSet,modelHash,materialGain}=await import('../../src/stage3f/free-action-sufficiency-v1.js');
const {bootstrapMean,bootstrapPlan}=await import('../../src/stage3f/policy-requalification-v1.js');
const {ACTION_MODEL_SCHEMA_HASH}=await import('../../src/stage3g/deployable-action-model-v1.js');
const {ABLATION_KERNEL_HASH}=await import('./privileged.mjs');
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const round=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1e6)/1e6:v;
const rounded=v=>Array.isArray(v)?v.map(rounded):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rounded(x)])):round(v);
const PARTIAL=(it,d)=>it.row.horizon+1>d+1;
const OWNERS=EVALUATION_FILES.filter(f=>!f.startsWith('artifacts/'));
const sourceHashes=Object.fromEntries(OWNERS.map(f=>[f,hex(readFileSync(at(f)))]));
// Only deterministic memoized evidence lives here. Certificate binds its exact content. Fresh clone rebuilds it.
const cacheKey=hex(JSON.stringify({sourceHashes,planHash:P.PLAN_HASH}));
function prepare(rows,label,privileged=true) {
  const eligible=rows.filter(isEligible); const inputHash=hex(JSON.stringify(eligible));
  const cache=at(`build/stage3g5/${cacheKey}-${label}-${inputHash}.json.gz`);
  let evidence;
  if(existsSync(cache)) { log(`verified memoized ${label}`); evidence=JSON.parse(gunzipSync(readFileSync(cache))); }
  else { evidence=eligible.map((r,i)=>{if(i%100===0)log(`${label} ${i}/${eligible.length}`);return stage3g5Evidence(r,{privileged,depth3:i%16===0});});mkdirSync(path.dirname(cache),{recursive:true});writeFileSync(cache,gzipSync(JSON.stringify(evidence))); }
  const evidenceHash=hex(JSON.stringify(evidence));
  const items=eligible.map((r,i)=>{const ev=evidence[i];if(ev.candidates.some(c=>!r.actions[c.key]))throw new Error('EVIDENCE_CANDIDATE_DRIFT');return {row:r,ev,state:STAGE3F6P1ASYM_STATE_FEATURES.featureIds.map(k=>r.core[k]),level:r.combination.level,retreat:ev.candidates.some(c=>c.o===1&&c.type==='RETREAT'),horizonDependent:ev.candidates.some(c=>c.o===1&&c.i<Math.max(...ev.candidates.map(x=>x.i)))};});
  return {items,evidenceHash,inputHash};
}
function columns(it,kind) {
  const spec=kind==='INTERACTION'?P.SPECS.interaction:P.SPECS.linear;
  const field=kind.startsWith('KNOWN')?'known':kind.startsWith('NO_ENV')?'noEnv':kind.startsWith('NO_HOSTILE')?'noHostile':kind.startsWith('NO_HAZARD')?'noHazard':null;
  const depth=Number(kind.at(-1));
  const vals=field?it.ev.candidates.map(c=>c[field][depth]):null;
  return it.ev.candidates.map(c=>{
    const cand=[...c.blocks.TYPE,...c.blocks.CANDIDATE,...c.blocks.GEOMETRY,...c.GP];
    const x=[...cand];
    if(spec.main.includes('PAIRS'))for(let a=0;a<cand.length;a++)for(let b=a+1;b<cand.length;b++)x.push(cand[a]*cand[b]);
    for(const b of spec.interact)for(const v of c.blocks[b]??[])for(const s of it.state)x.push(v*s);
    if(kind.startsWith('DEPLOYABLE'))x.push(...c.deployable[depth]);
    if(field)x.push(c[field][depth]-Math.max(...vals),c[field][depth]-mean(vals));
    return x;
  });
}
const fit=(items,kind)=>fitCandidateLogit(items.map(it=>({X:columns(it,kind),y:it.ev.candidates.map(c=>c.o)})));
const TRAIN=prepare(readFitRows(),'FIT');
const DEV=prepare(readCorpus().filter(r=>r.partition==='DEV'),'DEV',false);
function fitOpen(){
  const models={};log('fit frozen Stage3G3_LINEAR'); models.FROZEN=fit(DEV.items,'LINEAR');
  for(const kind of ['LINEAR','INTERACTION',...Array.from({length:4},(_,d)=>`DEPLOYABLE_D${d}`),'KNOWN_D2','KNOWN_D3']){
    log(`fit ${kind}`); const d=Number(kind.at(-1)); const use=Number.isInteger(d)?TRAIN.items.filter(it=>PARTIAL(it,d)&&(d!==3||it.ev.depth3)):TRAIN.items;
    if(!use.length)throw new Error(`NO_TRAINING_ROWS:${kind}`); models[kind]=fit(use,kind);
  }
  const hashes=Object.fromEntries(Object.entries(models).map(([k,m])=>[k,modelHash(m)]));
  const old=json('artifacts/stage3g3-temporal-attribution/stage3g3-open-phase-report.json');
  const report={stage:P.PLAN.stage,planHash:P.PLAN_HASH,actionModelSchemaHash:ACTION_MODEL_SCHEMA_HASH,numericsProfile:numerics.CANONICAL_NUMERICS_ID,fitContentHash:json(P.FIT_MANIFEST_PATH).contentHash,
    inputHashes:{FIT:TRAIN.inputHash,DEV:DEV.inputHash},evidenceHashes:{FIT:TRAIN.evidenceHash,DEV:DEV.evidenceHash},modelHashes:hashes,models,
    FROZEN_MODEL_REPRODUCED:hashes.FROZEN===old.modelHashes.NEW_LINEAR,trainingEligibleByLevel:Object.fromEntries(P.LEVELS.map(l=>[l,TRAIN.items.filter(it=>it.level===l).length])),noSealedRowsRead:true};
  return {...report,reportHash:hex(JSON.stringify(report))};
}
let open;
if(phaseOpen||process.argv.includes('--refit'))open=fitOpen();
else {open=json(P.OPEN_REPORT_PATH);const {reportHash,...body}=open;if(hex(JSON.stringify(body))!==reportHash)throw new Error('OPEN_REPORT_HASH_DRIFT');}
if(phaseOpen){if(existsSync(at(P.SEALED_MANIFEST_PATH)))throw new Error('OPEN_REFIT_AFTER_SEAL_FORBIDDEN');writeFileSync(at(P.OPEN_REPORT_PATH),`${JSON.stringify(open,null,2)}\n`);console.log(JSON.stringify({phase:'OPEN',reportHash:open.reportHash,FROZEN_MODEL_REPRODUCED:open.FROZEN_MODEL_REPRODUCED,eligible:open.trainingEligibleByLevel}));process.exit(0);}
if(!checkOnly&&!dryRun&&existsSync(at(P.RESULT_PATH)))throw new Error('SEALED_EVALUATION_ONCE_ONLY: use --check');
const dryOut=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(dryRun&&(!dryOut||path.resolve(dryOut).startsWith(repo+path.sep)))throw new Error('dry-run requires --out outside repository');
let manifest,rows;
if(dryRun)rows=readFitRows().map((r,i)=>({...r,partition:i%2?'STAGE3G5_B':'STAGE3G5_A'}));
else {manifest=json(P.SEALED_MANIFEST_PATH);const text=gunzipSync(readFileSync(at(P.SEALED_PATH))).toString();if(hex(text)!==manifest.contentHash)throw new Error('SEALED_HASH_DRIFT');rows=text.trim().split('\n').map(l=>JSON.parse(l));}
const prepared={A:prepare(rows.filter(r=>r.partition==='STAGE3G5_A'),'A'),B:prepare(rows.filter(r=>r.partition==='STAGE3G5_B'),'B')};
const ITEMS=Object.entries(prepared).flatMap(([family,p])=>p.items.map(it=>({...it,family})));
const models={...open.models};for(const d of [2,3])for(const name of ['NO_ENV','NO_HOSTILE','NO_HAZARD'])models[`${name}_D${d}`]=models[`KNOWN_D${d}`];
const NAMES=Object.keys(models);
function decide(it,name){if(name.endsWith('D3')&&!it.ev.depth3)return null;if(name==='FROZEN')return topSet(scoreCandidates(models[name],columns(it,'LINEAR')).scores);return topSet(scoreCandidates(models[name],columns(it,name)).scores);}
function outcome(it,idx){if(idx===null)return null;const c=it.ev.candidates;return {hit:mean(idx.map(i=>c[i].o)),regret:mean(idx.map(i=>c[i].r)),nreg:mean(idx.map(i=>c[i].maxR>0?c[i].r/c[i].maxR:0))};}
const decisions=Object.fromEntries(NAMES.map(k=>[k,ITEMS.map(it=>decide(it,k))]));
const outcomes=Object.fromEntries(NAMES.map(k=>[k,ITEMS.map((it,i)=>outcome(it,decisions[k][i]))]));
for(const d of [2,3]){const name=`RAW_KNOWN_D${d}`;decisions[name]=ITEMS.map(it=>d===3&&!it.ev.depth3?null:topSet(it.ev.candidates.map(c=>c.known[d])));outcomes[name]=ITEMS.map((it,i)=>outcome(it,decisions[name][i]));}
const summarise=(name,ix0)=>{const ix=ix0.filter(i=>outcomes[name][i]!==null);return ({n:ix.length,OPTIMAL_SET_HIT:mean(ix.map(i=>outcomes[name][i].hit)),REGRET:mean(ix.map(i=>outcomes[name][i].regret)),NORMALIZED_REGRET:mean(ix.map(i=>outcomes[name][i].nreg))});};
function compare(a,b,ix,label){
  if(!ix.length)return {n:0,MATERIAL:false,top1Difference:null,top1Ci95:null,nregDifference:null,nregCi95:null,regretReduction:null,relativeRegretReduction:null,decisionFlipRate:null};
  const h=ix.map(i=>outcomes[a][i].hit-outcomes[b][i].hit),n=ix.map(i=>outcomes[a][i].nreg-outcomes[b][i].nreg);const p=bootstrapPlan(ix.length,`STAGE3G5:${label}`),w=ix.map(()=>1);
  const base=mean(ix.map(i=>outcomes[b][i].regret)),after=mean(ix.map(i=>outcomes[a][i].regret));
  const diff={n:ix.length,top1Difference:mean(h),top1Ci95:bootstrapMean(p,h,w),nregDifference:mean(n),nregCi95:bootstrapMean(p,n,w)};
  return {...diff,...materialGain(diff),regretReduction:base-after,relativeRegretReduction:base>0?(base-after)/base:null,
    decisionFlipRate:mean(ix.map(i=>decisions[a][i].map(j=>ITEMS[i].ev.candidates[j].key).sort().join()!==decisions[b][i].map(j=>ITEMS[i].ev.candidates[j].key).sort().join()?1:0))};
}
const filters={ALL:()=>true,...Object.fromEntries(Object.entries(P.BANDS).map(([k,l])=>[k,it=>l.includes(it.level)])),...Object.fromEntries(P.LEVELS.map(l=>[`L${l}`,it=>it.level===l])),RETREAT_OPTIMAL:it=>it.retreat,NON_RETREAT:it=>!it.retreat,HORIZON_DEPENDENT:it=>it.horizonDependent};
const index=(family,stratum,d=null)=>ITEMS.map((it,i)=>(family==='POOLED'||it.family===family)&&filters[stratum](it)&&(d===null||PARTIAL(it,d))&&(d!==3||it.ev.depth3)?i:-1).filter(i=>i>=0);
const cells={};
for(const family of ['A','B','POOLED']){cells[family]={};for(const stratum of Object.keys(filters)){
  log(`evaluate ${family} ${stratum}`);const all=index(family,stratum);const guarded=index(family,stratum,2);
  const cell={n:all.length,descriptive:Object.fromEntries(Object.keys(outcomes).map(k=>[k,summarise(k,all)])),PRIMARY_LB:compare('LINEAR','FROZEN',all,`${family}:${stratum}:LB`),INTERACTION_VS_LINEAR:compare('INTERACTION','LINEAR',all,`${family}:${stratum}:interaction`),depths:{}};
  for(const d of [0,1,2,3]){const ix=index(family,stratum,d);cell.depths[d]={n:ix.length,deployable:summarise(`DEPLOYABLE_D${d}`,ix),vsLevelBalanced:compare(`DEPLOYABLE_D${d}`,'LINEAR',ix,`${family}:${stratum}:dep${d}`)};
    if(d>=2)Object.assign(cell.depths[d],{known:summarise(`KNOWN_D${d}`,ix),rawKnown:summarise(`RAW_KNOWN_D${d}`,ix),lb:summarise('LINEAR',ix),knownVsLB:compare(`KNOWN_D${d}`,'LINEAR',ix,`${family}:${stratum}:knownLB${d}`),
      ENVIRONMENT_DYNAMICS_VALUE_UPPER_BOUND:compare(`KNOWN_D${d}`,`DEPLOYABLE_D${d}`,ix,`${family}:${stratum}:gap${d}`),
      MATCHED_ENVIRONMENT_DYNAMICS:compare(`KNOWN_D${d}`,`NO_ENV_D${d}`,ix,`${family}:${stratum}:env${d}`),
      privateActionSurfaceResidual:compare(`NO_ENV_D${d}`,`DEPLOYABLE_D${d}`,ix,`${family}:${stratum}:private${d}`)});
  }
  let weight=0,separated=0;for(const i of guarded){const it=ITEMS[i];const bad=decisions.LINEAR[i].filter(j=>!it.ev.candidates[j].o);const wt=1-outcomes.LINEAR[i].hit;if(wt<=0)continue;weight+=wt;const opt=it.ev.candidates.filter(c=>c.o);if(Math.min(...opt.map(c=>c.known[2]))>Math.max(...bad.map(j=>it.ev.candidates[j].known[2])))separated+=wt;}
  cell.CAD={residualWeight:weight,separatedWeight:separated,fraction:weight>0?separated/weight:null,class:'PRIVILEGED_UPPER_BOUND'};
  cells[family][stratum]=cell;
}}
const integrity={
  evidenceFidelity:ITEMS.every(it=>it.ev.worldFidelity===1&&it.ev.candidateSetFidelity===1&&it.ev.knownFidelity===1),
  unknownPropagation:ITEMS.every(it=>it.ev.UNKNOWN_PROPAGATION===1),
  D4:ITEMS.filter(it=>it.ev.deployableD4!==null).every(it=>Object.values(it.ev.deployableD4).every(v=>v===1)),
  identityRenaming:ITEMS.filter(it=>it.ev.deployableIdOrder!==null).every(it=>it.ev.deployableIdOrder===1&&it.ev.idPermutationNew===1),
  observableBoundary:ITEMS.every(it=>it.ev.newScanHits===0),
  poisonInvariant:ITEMS.filter(it=>it.ev.poisonInvariant!==null).every(it=>it.ev.poisonInvariant===1),
  candidateOrder:Object.fromEntries(NAMES.map(name=>[name,ITEMS.every((it,i)=>{const rev={...it,ev:{...it.ev,candidates:[...it.ev.candidates].reverse()}};if(decisions[name][i]===null)return decide(rev,name)===null;return decide(rev,name).map(j=>rev.ev.candidates[j].key).sort().join()===decisions[name][i].map(j=>it.ev.candidates[j].key).sort().join();})])),
  symmetrySample:ITEMS.filter(it=>it.ev.deployableD4!==null).length,
};
const integrityOk=Object.entries(integrity).every(([k,v])=>k==='candidateOrder'?Object.values(v).every(Boolean):k==='symmetrySample'?v>0:v===true);
const dynGate=(f,s)=>{const d=cells[f][s].depths[2],e=d.MATCHED_ENVIRONMENT_DYNAMICS;return d.n>=100&&d.ENVIRONMENT_DYNAMICS_VALUE_UPPER_BOUND.MATERIAL&&e.MATERIAL&&e.relativeRegretReduction>=.2&&e.nregCi95[1]<0;};
const dynStrata=['ALL','MID','HIGH','RETREAT_OPTIMAL'].filter(s=>['A','B'].every(f=>dynGate(f,s)));
const sufficientSample=['A','B'].every(f=>cells[f].RETREAT_OPTIMAL.depths[2].n>=100);
const sufficient=sufficientSample?['A','B'].every(f=>['ALL','MID','HIGH','RETREAT_OPTIMAL'].every(s=>!cells[f][s].depths[2].ENVIRONMENT_DYNAMICS_VALUE_UPPER_BOUND.MATERIAL)):'NOT_TESTABLE';
const lbRep=['A','B'].every(f=>cells[f].HIGH.PRIMARY_LB.MATERIAL&&cells[f].HIGH.PRIMARY_LB.nregCi95[1]<0);
const highClosed=lbRep&&['A','B'].every(f=>!cells[f].HIGH.depths[2].knownVsLB.MATERIAL);
const flags={coverage:['A','B'].every(f=>cells[f].RETREAT_OPTIMAL.PRIMARY_LB.MATERIAL),actionModel:['A','B'].every(f=>cells[f].RETREAT_OPTIMAL.depths[2].privateActionSurfaceResidual.MATERIAL),environment:['A','B'].every(f=>dynGate(f,'RETREAT_OPTIMAL'))};
const active=Object.keys(flags).filter(k=>flags[k]);const classification=active.length>1?'RETREAT_MIXED':active[0]==='coverage'?'RETREAT_LEVEL_COVERAGE_LIMITED':active[0]==='actionModel'?'RETREAT_ACTION_MODEL_LIMITED':active[0]==='environment'?'RETREAT_ENVIRONMENT_DYNAMICS_LIMITED':'INSUFFICIENT_EVIDENCE';
const gapIx=index('POOLED','ALL',2);const positiveRegret=i=>Math.max(0,outcomes.DEPLOYABLE_D2[i].regret-outcomes.KNOWN_D2[i].regret);
const positive=gapIx.reduce((s,i)=>s+positiveRegret(i),0);const retreatConcentration=positive>0?gapIx.filter(i=>ITEMS[i].retreat).reduce((s,i)=>s+positiveRegret(i),0)/positive:null;
const material=dynStrata.length>0;const transition=material&&integrityOk&&sufficient!==true;const worldModel=false; // Navigation-only conditional search cannot rule out all deterministic target-action alternatives.
const conclusions={LEVEL_BALANCED_PRIMARY_REPLICATED:lbRep,HIGH_LEVEL_GAP_CLOSED:highClosed,DEPLOYABLE_ACTION_MODEL_IMPLEMENTED:true,DEPLOYABLE_BOUNDED_SEARCH_VALUE_MEASURED:true,DEPLOYABLE_BOUNDED_SEARCH_SUFFICIENT:sufficient,
  ENVIRONMENT_DYNAMICS_VALUE_MEASURED:true,ENVIRONMENT_DYNAMICS_VALUE_MATERIAL:material,ENVIRONMENT_DYNAMICS_VALUE_OOD_STABLE:material,environmentMaterialStrata:dynStrata,
  RETREAT_RESIDUAL_CLASSIFIED:classification!=='INSUFFICIENT_EVIDENCE',RETREAT_CLASSIFICATION:classification,retreatFlags:flags,RETREAT_SPECIALIST:flags.environment&&!['A','B'].every(f=>dynGate(f,'NON_RETREAT'))&&retreatConcentration>=.8,
  retreatPositiveRegretConcentration:retreatConcentration,TRANSITION_PREDICTION_NOW_JUSTIFIED:transition,WORLD_MODEL_WORK_NOW_JUSTIFIED:worldModel,DETERMINISTIC_TARGET_ACTION_ALTERNATIVES_RULED_OUT:false,ORACLE_TEMPORAL_CAPABILITY_NOW_REQUIRED:transition,READY_FOR_3G_COUNTERFACTUAL_PREDICTION:transition,
  STAGE3G_STATUS:'STAGE3G5_COMPLETE',NEXT_RECOMMENDED_ACTION:transition?'Stage 3G.6 — Full E1 action-surface sufficiency and attributed counterfactual prediction qualification':'Stage 3G.6 — Observable planning and action-surface sufficiency audit (no learned world model)',
  BLOCKERS:classification==='INSUFFICIENT_EVIDENCE'?['Retreat attribution does not pass a replicated materiality gate']:[],
};
const effects=['HOSTILE_ATTACK','HAZARD_DAMAGE','SERVICE_REVERSAL','ENTITY_STATE_CHANGE','RESOURCE_STATE_CHANGE','OTHER'];
const attribution=Object.fromEntries(effects.map(effect=>{
  const ix=gapIx.filter(i=>ITEMS[i].ev.effects[effect]);const causal=['HOSTILE_ATTACK','HAZARD_DAMAGE'].includes(effect);const masked=effect==='HOSTILE_ATTACK'?'NO_HOSTILE_D2':'NO_HAZARD_D2';
  return [effect,{n:ix.length,frequency:gapIx.length?ix.length/gapIx.length:null,retreatConcentration:ix.length?ix.filter(i=>ITEMS[i].retreat).length/ix.length:null,
    method:causal?'MATCHED_LEAVE_ONE_MECHANISM_OUT, all guarded rows; frequency is root exposure':'OVERLAPPING_OBSERVATIONAL_ROOT_STRATUM; noncausal, nonadditive',
    decisionValue:compare('KNOWN_D2',causal?masked:'DEPLOYABLE_D2',causal?gapIx:ix,`attr:${effect}`),
    byFamily:Object.fromEntries(['A','B'].map(f=>[f,compare('KNOWN_D2',causal?masked:'DEPLOYABLE_D2',(causal?gapIx:ix).filter(i=>ITEMS[i].family===f),`attr:${effect}:${f}`)]))}];
}));
function selfHash(doc,field){const {[field]:h,...body}=doc;return h===hex(JSON.stringify(body));}
const inheritance={};for(const [name,rule] of Object.entries(P.PLAN.inheritance)){const c=json(rule.CERTIFICATE_FILE);const expected=rule.CERTIFICATION_HASH??rule.STAGE3F_CERTIFICATION_HASH;inheritance[name]={hash:c.certificationHash,expected,bound:c.certificationHash===expected&&selfHash(c,'certificationHash')&&c.status==='PASS'};}
const g4=json(P.PLAN.inheritance.stage3g4.CERTIFICATE_FILE);
const inheritedConclusions=g4.conclusions.TRANSITION_PREDICTION_NOW_JUSTIFIED===false&&g4.conclusions.WORLD_MODEL_WORK_NOW_JUSTIFIED===false&&g4.conclusions.DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT===true;
const protectedChanges=git('diff','--name-only','78de734','--','platform/game-agnostic/src/stage3f','platform/game-agnostic/src/forge','platform/game-agnostic/src/forge-symmetric','platform/game-agnostic/src/core','platform/game-agnostic/scripts/stage3g3','platform/game-agnostic/scripts/stage3g4','platform/game-agnostic/artifacts/stage3g3-temporal-attribution','platform/game-agnostic/artifacts/stage3g4-level-replication','platform/game-agnostic/scripts/reproducibility','platform/game-agnostic/scripts/certification').stdout.trim();
let data={dryRun:true},freeze={dryRun:true};
if(!dryRun){
 const prior=priorLineage();const fit=readFitRows();const all=[...prior.rows,...fit];const overlaps={};const duplicates={};
 for(const key of ['recordHash','worldHash','topologyHash']){const seen=new Set(all.map(r=>r[key]));overlaps[key]=rows.filter(r=>seen.has(r[key])).length;duplicates[key]=rows.length-new Set(rows.map(r=>r[key])).size;}
 const balance={};for(const r of rows){const key=`${r.partition}:L${r.combination.level}:${r.combination.horizonBand}`;balance[key]=(balance[key]??0)+1;}
 data={rows:rows.length,contentHash:manifest.contentHash,overlaps,duplicates,balance,seedAudit:seedAudit(prior.rows),planBound:manifest.planHash===P.PLAN_HASH,seedPlanBound:manifest.seedPlanHash===P.SEED_PLAN_HASH,balanced:Object.keys(balance).length===80&&Object.values(balance).every(v=>v===P.SEED_PLAN.quotas.sealedPerFamilyLevelBand)};
 const g=f=>`platform/game-agnostic/${f}`;const gen=manifest.generatedAtHead;
 const drift=EVALUATION_FILES.filter(f=>{const r=spawnSync('git',['-C',repo,'show',`${gen}:${g(f)}`],{encoding:'buffer',maxBuffer:1<<28});return r.status!==0||hex(r.stdout)!==hex(readFileSync(at(f)));});
 freeze={generationCommit:gen,planOpenFitAtGeneration:drift.length===0,drift,FROZEN_BEFORE_SEALED:drift.length===0&&frozenGate().length===0};
}
const suitePath=`${P.OUT}/stage3g5-full-suite.json`;const suite=existsSync(at(suitePath))?json(suitePath):null;
const reporter=/--test-reporter(=|\s)/.test(process.env.NODE_OPTIONS??'')?[]:['--test-reporter=tap'];
const testRun=spawnSync(process.execPath,['--test',...reporter,'tests/stage3g5-observable-model-search.test.js'],{cwd:root,encoding:'utf8',maxBuffer:1<<26});
const n=k=>Number(new RegExp(`^# ${k} (\\d+)$`,'m').exec(testRun.stdout??'')?.[1]??-1);
const tests={exitCode:testRun.status,pass:n('pass'),fail:n('fail')};if(testRun.status!==0)log(testRun.stdout+testRun.stderr);
const checks={CANONICAL_NUMERICS:true,INHERITANCE_BOUND:Object.values(inheritance).every(x=>x.bound)&&inheritedConclusions&&protectedChanges==='',
  OPEN_PHASE_BOUND:open.planHash===P.PLAN_HASH&&open.actionModelSchemaHash===ACTION_MODEL_SCHEMA_HASH&&open.fitContentHash===json(P.FIT_MANIFEST_PATH).contentHash&&open.FROZEN_MODEL_REPRODUCED&&open.evidenceHashes.FIT===TRAIN.evidenceHash&&open.evidenceHashes.DEV===DEV.evidenceHash,
  FROZEN_BEFORE_SEALED:!dryRun&&freeze.FROZEN_BEFORE_SEALED,SEALED_INTEGRITY:!dryRun&&data.planBound&&data.seedPlanBound&&data.balanced&&Object.values(data.overlaps).every(v=>v===0)&&Object.values(data.duplicates).every(v=>v===0)&&data.seedAudit.priorRowOverlap.length===0,
  INTEGRITY:integrityOk,TESTS_PASS:tests.exitCode===0&&tests.fail===0&&tests.pass>0,FULL_SUITE_PASS:suite!==null&&suite.platform.exitCode===0&&suite.platform.fail===0&&Object.values(suite.inheritance).every(x=>x.exitCode===0&&x.reproduced),AUTHORITY_R0:P.PLAN.authority.tier==='R0'&&Object.entries(P.PLAN.authority).filter(([k])=>k!=='tier').every(([,v])=>v===false)};
const result=rounded({stage:P.PLAN.stage,status:Object.values(checks).every(Boolean)?'PASS':'FAIL',planHash:P.PLAN_HASH,openPhaseReportHash:open.reportHash,actionModelSchemaHash:ACTION_MODEL_SCHEMA_HASH,numericsProfile:numerics.CANONICAL_NUMERICS_ID,
  modelHashes:open.modelHashes,evidenceHashes:{FIT:TRAIN.evidenceHash,DEV:DEV.evidenceHash,A:prepared.A.evidenceHash,B:prepared.B.evidenceHash},cells,attribution,conclusions,integrity,inheritance,inheritedConclusions,protectedChanges,data,freeze,tests,suite,checks,sourceHashes,ablationKernelHash:ABLATION_KERNEL_HASH,authority:P.PLAN.authority,scope:P.PLAN.scope,
  evaluationContract:P.PLAN.evaluationContract,disclosures:{privileged:'KNOWN, RAW_KNOWN and dynamics interventions are PRIVILEGED_UPPER_BOUNDS; only LB/FROZEN/DEPLOYABLE use decision-time inputs',unknown:'Future conditional navigation is an action-effect envelope, not a guaranteed future action menu',gap:'Known/deployable gap includes private values, continuation surface and scorer fit. Forecasting gate additionally requires matched dynamics benefit.',ood:P.SEED_PLAN.ood,attribution:'Root event frequencies are descriptive; attack/hazard causal interventions cover every step. Other effects overlap; regret is not additive.',linear:'No nonlinear scorer or environment predictor fitted. Linear ranking models only.',memoization:'Hash-bound deterministic evidence cache; fresh clone reconstructs from corpus/source. --refit reproduces OPEN model weights.'}});
result.certificationHash=hex(JSON.stringify(result));
if(dryRun){writeFileSync(dryOut,`${JSON.stringify(result,null,2)}\n`);console.log(JSON.stringify({dryRun:true,failedChecks:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),conclusions},null,2));}
else if(checkOnly){const stored=json(P.RESULT_PATH);const reproduced=JSON.stringify(stored)===JSON.stringify(result);console.log(JSON.stringify({reproduced,status:result.status,storedHash:stored.certificationHash,recomputedHash:result.certificationHash,tests},null,2));if(!reproduced||result.status!=='PASS')process.exitCode=1;}
else {writeFileSync(at(P.RESULT_PATH),`${JSON.stringify(result,null,2)}\n`);console.log(JSON.stringify({status:result.status,certificationHash:result.certificationHash,failedChecks:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),conclusions},null,2));if(result.status!=='PASS')process.exitCode=1;}
