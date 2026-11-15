import test from 'node:test';import assert from 'node:assert/strict';
import {encodeAction,normalizeType} from './action-codec.mjs';
import {TYPES,actionFeatures,historyState,remember} from '../features.mjs';
import {initial,publicPacket} from '../scenarios.mjs';
test('every offered cardinal action is represented without altering legality or geometry',()=>{
  for(const game of ['rescue','factory','roguelike']){
    const p=publicPacket(initial({game,seed:2012345678,difficulty:3})),s=historyState();remember(p.observation,s);
    for(const a of p.actions.filter(a=>a.type.startsWith('MOVE_'))){const before=JSON.stringify(a),old=actionFeatures(p,s,a),v2=encodeAction(p,s,a);assert.ok(v2.typeSupported);assert.equal(v2.features[1+TYPES.indexOf(normalizeType(a.type))],1);assert.equal(v2.features.slice(1,1+TYPES.length).reduce((a,b)=>a+b,0),1);assert.deepEqual(v2.features.slice(1+TYPES.length),old.slice(1+TYPES.length));assert.equal(JSON.stringify(a),before);}
  }
});
test('unknown action type is explicitly unsupported',()=>{const p=publicPacket(initial({game:'factory',seed:2012345678,difficulty:1})),s=historyState();assert.equal(encodeAction(p,s,{type:'UNKNOWN',parameters:{}}).typeSupported,false);});
