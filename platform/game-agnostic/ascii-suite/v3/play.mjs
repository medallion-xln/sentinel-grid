import {createInterface} from 'node:readline/promises';
import {createWorld,packet,step,actorId} from './kernel.mjs';
const cli=createInterface({input:process.stdin,output:process.stdout});let w=createWorld(process.argv[2]??'rescue',Number(process.argv[3]??9001000),Number(process.argv[4]??1));
while(!w.terminal){const p=packet(w);console.log(JSON.stringify(p.observation,null,2));console.log(p.actions.map((a,i)=>`${i}: ${a.type} ${JSON.stringify(a.parameters)}`).join('\n'));const i=Number(await cli.question('Action number (Ctrl-C exits): '));if(p.actions[i])w=step(w,actorId(w),p.actions[i]);else console.log('Invalid selection; state unchanged.');}console.log(w.result);cli.close();
