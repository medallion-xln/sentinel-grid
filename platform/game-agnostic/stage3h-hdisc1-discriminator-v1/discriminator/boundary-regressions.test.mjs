import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscriminator, MODES} from './index.mjs';
import {makeSyntheticEncoder} from './encoder.mjs';
import {additiveScoreWitness} from '../witness/nonadditivity.mjs';
const encoder=makeSyntheticEncoder({id:'SYNTHETIC_BOUNDARY',descriptor:['suit']});
const state={observationContract:{id:encoder.schema.id,version:'1'}};
const menu=[0,1].map(suit=>({key:'k'+suit,type:'SYNTH',descriptor:{suit}}));
test('caller parameter mutation cannot change frozen inference or identity',()=>{
 const parameters=additiveScoreWitness([0,1]),d=createDiscriminator({encoder,parameters,mode:MODES.SYNTHETIC});
 const before=d.compare(state,menu),t=parameters.bags[0].trees[0];for(let i=0;i<t.v.length;i++)if(t.f[i]<0)t.v[i]=-t.v[i];
 assert.deepEqual(d.compare(state,menu),before);
});
test('untrained singleton and unsupported trained singleton both abstain',()=>{
 for(const parameters of [null,additiveScoreWitness([0,1])]) {
  const d=createDiscriminator({encoder,parameters,mode:MODES.SYNTHETIC});
  const r=d.compare(state,[{key:'u',type:'SYNTH',descriptor:{}}]);assert.equal(r.decision.kind,'ABSTAIN');assert.equal(r.rankedActions[0].comparisonSupported,false);
 }
 assert.equal(createDiscriminator({encoder,mode:MODES.SYNTHETIC}).compare(state,[menu[0]]).decision.kind,'ABSTAIN');
 assert.equal(createDiscriminator({encoder,parameters:additiveScoreWitness([0,1]),mode:MODES.SYNTHETIC}).compare(state,[menu[0]]).decision.kind,'TOP_SET');
});
