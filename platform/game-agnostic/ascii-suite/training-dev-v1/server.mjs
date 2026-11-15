// Read-only local observatory. No inference, labels, replay, mutation or training endpoint.
import http from 'node:http';
import {readFileSync,createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {DIR,read} from './io.mjs';
import {PLAN} from './plan.mjs';
const root=resolve(DIR,'runs',PLAN.runId);
export function createServer(){return http.createServer(async(req,res)=>{
  const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
  try{const url=new URL(req.url,'http://localhost');if(req.method!=='GET')return json(405,{error:'READ_ONLY_OBSERVATORY'});
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(readFileSync(resolve(DIR,'ui/index.html')));return;}
    if(url.pathname==='/api/report'){const r=read(resolve(root,'observatory.json'));delete r.publicSamples;return json(200,r);}
    if(url.pathname==='/api/public-sample'){
      if(!PLAN.worlds.includes(url.searchParams.get('world')))return json(400,{error:'UNKNOWN_WORLD'});
      const r=read(resolve(root,'observatory.json')),sample=r.publicSamples.find(s=>s.world===url.searchParams.get('world')&&s.difficulty===Number(url.searchParams.get('difficulty')??1));
      if(!sample)return json(404,{error:'NO_PUBLIC_SAMPLE'});const stream=createReadStream(sample.path),lines=createInterface({input:stream,crlfDelay:Infinity}),records=[];
      try{for await(const line of lines){records.push(JSON.parse(line));if(records.length>=32)break;}}finally{lines.close();stream.destroy();}
      return json(200,{mode:'RECORDED_PUBLIC_TRAINING_TRAJECTORY_NOT_LIVE_INFERENCE',id:sample.id,records});
    }return json(404,{error:'NO_PRIVATE_STATE_OR_LABEL_ENDPOINT'});
  }catch(e){json(500,{error:e.message});}
});}
if(process.argv[1]===new URL(import.meta.url).pathname){const server=createServer(),port=Number(process.env.ASCII_TRAINING_PORT??4177);server.listen(port,'127.0.0.1',()=>console.log('Offline training observatory: http://127.0.0.1:'+port));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}
