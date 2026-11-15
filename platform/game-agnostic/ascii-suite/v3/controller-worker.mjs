import {parentPort} from 'node:worker_threads';
import {controllerState,decide} from './controllers.mjs';
let state;
parentPort.on('message',m=>{try{if(m.type==='RESET'){state=controllerState(m.kind,m.options);parentPort.postMessage({id:m.id,ready:true});}else{const decision=decide(m.packet,state);state=decision.state;const {state:privateMemory,...publicDecision}=decision;parentPort.postMessage({id:m.id,decision:publicDecision});}}catch(error){parentPort.postMessage({id:m.id,error:error.message});}});
