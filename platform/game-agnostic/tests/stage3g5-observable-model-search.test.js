import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forgeWorldAdapter } from '../src/forge/adapter.js';
import { symmetricStep } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { orientWorld, orientAction } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { ACTION_SEMANTICS_CONTRACT } from '../src/stage3g/action-semantics-v1.js';
import { ACTION_MODEL_SCHEMA, ACTION_MODEL_SCHEMA_HASH, UNKNOWN, projectAction, deployableSearch } from '../src/stage3g/deployable-action-model-v1.js';
import { sha256, stableStringify } from '../src/core/determinism.js';
import { observableView, poisonPrivileged, renameObservation } from '../scripts/stage3g/evidence.mjs';
import { buildObservableEntityState } from '../src/stage3g/observable-entity-state-v1.js';
import { deriveActionSemantics } from '../src/stage3g/action-semantics-v1.js';
import { readCorpus } from '../scripts/generate-stage3f6p1e-policy-evidence.mjs';
import { rebuildWorld, isEligible } from '../scripts/stage3f6p1asym-evidence.mjs';
import { searchValues } from '../scripts/stage3g4/evidence.mjs';
import { boundedValues, privilegedTransition } from '../scripts/stage3g5/privileged.mjs';
import { PLAN, PLAN_HASH, SEED_PLAN, PLAN_PATH } from '../scripts/stage3g5/plan.mjs';
const at=f=>new URL(`../${f}`,import.meta.url);
const rows=readCorpus().filter(r=>r.partition==='DEV'&&isEligible(r));
const sample=rows.filter((r,i)=>i%Math.max(1,Math.floor(rows.length/15))===0).slice(0,15);
test('pre-registration binds fresh balanced seeds and preserves every authority prohibition',()=>{
  assert.equal(JSON.parse(readFileSync(at(PLAN_PATH))).planHash,PLAN_HASH);
  assert.equal(sha256(ACTION_MODEL_SCHEMA),ACTION_MODEL_SCHEMA_HASH);
  assert.deepEqual(SEED_PLAN.families,{A:7021,B:7031});
  for(const s of [6012,7021,7031])assert.ok(!SEED_PLAN.priorSeedSpaces.includes(s));
  assert.deepEqual(SEED_PLAN.stillReserved.stage3g3,[5023,5033]);
  assert.deepEqual(PLAN.authority,{tier:'R0',canDispatch:false,canMutateLiveWorld:false,onlineLearningEnabled:false,promotedToLiveRuntime:false});
});
test('E1 effects agree with frozen kernel execution; EU effects are never promoted',()=>{
  let checks=0;
  for(const row of sample){const w=rebuildWorld(row);const v=observableView(w);
    v.semantics.forEach((s,i)=>{const p=projectAction(v.state,s);const out=symmetricStep(w,v.surface[i].action).state; const a=out.entities.find(e=>e.type==='ACTOR');
      for(const effect of s.deterministicImmediateEffects.filter(e=>e.class==='E1')) {
        checks+=1;assert.ok(p.applied.includes(effect.effect));
        if(effect.effect==='ACTOR_DISPLACEMENT')assert.deepEqual(p.projection.position,a.position);
        if(effect.effect==='ENERGY_DELTA')assert.equal(p.projection.energy,out.constraints.energy);
        if(effect.effect==='TICK_ADVANCE')assert.equal(p.projection.tick,out.tick);
        if(effect.effect==='TARGET_LEAVES_SERVICE')assert.equal(out.entities.find(e=>e.id===s.target).available,false);
        if(effect.effect==='TARGET_PROTECTED')assert.equal(out.entities.find(e=>e.id===s.target).flags.protected,true);
        if(effect.effect==='CARRIED_MATERIAL_TO_ZERO')assert.equal(a.resources.material??0,0);
      }
      for(const e of s.deterministicImmediateEffects.filter(e=>e.class!=='E1'))assert.ok(!p.applied.includes(e.effect));
    });
  }assert.ok(checks>30);
  assert.ok(ACTION_SEMANTICS_CONTRACT.RESTORE.effects.some(e=>e.effect==='TARGET_RETURNS_TO_SERVICE'&&e.class==='EU'));
});
test('UNKNOWN propagates at all depths and private changes cannot alter the envelope',()=>{
  for(const row of sample.slice(0,3)){const w=rebuildWorld(row);const v=observableView(w);const pv=observableView(poisonPrivileged(w));
    v.semantics.forEach((s,i)=>{for(let d=0;d<=3;d++){
      const a=deployableSearch(v.state,v.visibleMap,s,d);const b=deployableSearch(pv.state,pv.visibleMap,pv.semantics[i],d);
      assert.equal(a.root.actualNext.actorHealth,UNKNOWN); assert.equal(a.root.actualNext.legality,UNKNOWN);
      if(d>0)assert.equal(a.conditionalLegality,UNKNOWN);
      assert.equal(stableStringify(a.features),stableStringify(b.features));
      assert.equal(stableStringify(a),stableStringify(deployableSearch(v.state,v.visibleMap,s,d)));
    }});
  }
});
test('D4 equivariance, identity renaming and candidate order invariance',()=>{
  for(const row of sample.slice(0,3)){const w=rebuildWorld(row);const v=observableView(w);const signatures=v.semantics.map(s=>deployableSearch(v.state,v.visibleMap,s,3).features);
    const tv=observableView(orientWorld('R90',w));
    v.surface.forEach((e,i)=>{const a=orientAction('R90',e.action,w.grid.width); const j=tv.surface.findIndex(x=>x.action.actionType===a.actionType&&JSON.stringify(x.action.parameters)===JSON.stringify(a.parameters)&&x.action.target?.id===a.target?.id); if(j>=0)assert.deepEqual(deployableSearch(tv.state,tv.visibleMap,tv.semantics[j],3).features,signatures[i]);});
    const rn=renameObservation(v,id=>`x-${v.visibleMap.entities.findIndex(e=>e.id===id)}`);
    const state=buildObservableEntityState({observation:rn.observation,visibleMap:rn.visibleMap});
    const sem=deriveActionSemantics({state,visibleMap:rn.visibleMap,legalActions:[...rn.surface].reverse()});
    sem.forEach((s,i)=>assert.deepEqual(deployableSearch(state,rn.visibleMap,s,3).features,signatures[signatures.length-1-i]));
  }
});
test('privileged control reproduces G4 search; no-environment interventions retain action semantics',()=>{
  for(const row of sample.slice(0,2)){const w=rebuildWorld(row);const v=observableView(w);
    for(const e of v.surface){ assert.deepEqual(boundedValues(w,e.action,2),searchValues(w,e.action,2));
      const a=privilegedTransition(w,e.action,'NO_ENV'); const b=privilegedTransition(w,e.action);
      assert.equal(a.state.tick,b.state.tick);assert.equal(a.state.constraints.energy,b.state.constraints.energy);
      assert.deepEqual(a.state.entities.find(e=>e.type==='ACTOR').position,b.state.entities.find(e=>e.type==='ACTOR').position);
      assert.ok(!a.events.some(e=>e.type==='DEGRADED'||e.type==='HAZARD_DAMAGE'));
    }
  }
});
test('deployable module has no privileged imports; each entry point installs the strict check-mode guard',()=>{
  const source=readFileSync(at('src/stage3g/deployable-action-model-v1.js'),'utf8');
  assert.ok(![...source.matchAll(/from '([^']+)'/g)].some(m=>/kernel|reward|counterfactual|stage3g5|symmetric/.test(m[1])));
  for(const f of ['plan-cli','generate','certify','full-suite']){const s=readFileSync(at(`scripts/stage3g5/${f}.mjs`),'utf8');assert.match(s,/enforceCheckModeReadOnly/);assert.match(s,/checkOnly/);}
});
