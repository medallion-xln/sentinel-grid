import {resolve} from 'node:path';
import {DIR,verifyLocal} from './inheritance.mjs';
import {raw,save,digest} from '../training-dev-v1/io.mjs';
import {createGame,observe,legalActions,ENGINE_VERSION} from '../games.mjs';
import {createWorld,packet} from '../v3/kernel.mjs';
import {LEVELS} from './catalog.mjs';
import {PLAN} from './plan.mjs';
const audited=PLAN.games.map(game=>{
 const legacy=['pong','platformer','fighter','racing'].includes(game),s=legacy?createGame(game,{seed:904721,difficulty:5}):createWorld(game,904721,5);
 const o=legacy?observe(s):packet(s).observation,a=legacy?legalActions(s):packet(s).actions;
 return{game,existingVersion:legacy?ENGINE_VERSION:'3.0.0 + interactive 3.1 adapters',source:legacy?'worlds/'+game+'.mjs':'v3/worlds/'+game+'.mjs',sourceHash:raw(resolve(DIR,'..',legacy?'worlds/'+game+'.mjs':'v3/worlds/'+game+'.mjs')),maxDifficulty:5,originalIds:[1,2,3,4,5],publicFields:Object.keys(o),legalActionCount:a.length,additiveLevels:LEVELS.filter(l=>l.game===game),authority:'R0',canonicalLearningClaim:false};
});
save(resolve(DIR,'baseline-audit.json'),{inheritance:verifyLocal(),games:audited});
save(resolve(DIR,'preregistration.json'),{plan:PLAN,planHash:digest(PLAN),catalogHash:digest(LEVELS),baselineAuditHash:raw(resolve(DIR,'baseline-audit.json')),beforeTraining:true,beforeNewLevelOutcomes:true,sealedDataAccessed:false});
console.log(JSON.stringify({games:audited.length,newLevels:LEVELS.length,preregistered:true}));
