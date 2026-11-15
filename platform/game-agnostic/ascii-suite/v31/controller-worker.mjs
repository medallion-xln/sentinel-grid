import {parentPort} from 'node:worker_threads';
import {controllerState,decide} from '../v3/controllers.mjs';
import {SENTINEL,sentinelState,sentinelDecide} from './sentinel.mjs';
let state,kind;
parentPort.on('message',m=>{
  try {
    if(m.type==='RESET') {
      kind=m.kind;state=kind===SENTINEL?sentinelState(m.options):controllerState(kind,m.options);
      parentPort.postMessage({id:m.id,ready:true});
    } else {
      const decision=kind===SENTINEL?sentinelDecide(m.packet,state):decide(m.packet,state);
      state=decision.state;
      const {state:privateMemory,...publicDecision}=decision;
      parentPort.postMessage({id:m.id,decision:publicDecision});
    }
  } catch(error) {parentPort.postMessage({id:m.id,error:error.message});}
});
