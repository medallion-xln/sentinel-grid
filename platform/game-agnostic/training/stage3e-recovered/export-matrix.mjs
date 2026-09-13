import { readFileSync, writeFileSync } from 'node:fs';
const SC="/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad", R="/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic";
const { extractV2 } = await import(SC+'/3e/features-v2.mjs');
const { orderedBranches } = await import(SC+'/build-v2.mjs');
const { heuristicGreedyBaseline, scoreAnswer } = await import(R+'/src/lab/stage3c-learned-nexus.js');
const S=process.argv[2];
const recs=readFileSync(SC+'/3e/split-'+S+'.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
const g=new Map();
for(const l of readFileSync(SC+'/3e/gen-'+S+'.jsonl','utf8').split('\n')){
  if(!l.trim())continue; const x=JSON.parse(l); g.set(x.recordHash,x);}
const learned=(r)=>{const a=g.get(r.recordHash)?.answer;
  if(!a||typeof a.actionIndex!=='number')return null;
  const o=orderedBranches(r);
  return (a.actionIndex>=0&&a.actionIndex<o.length)?{actionId:o[a.actionIndex].actionKey,confidence:1,abstain:false}:null;};
const rows=recs.map(r=>{
  const l=learned(r), gs=scoreAnswer(r,heuristicGreedyBaseline(r)), ls=scoreAnswer(r,l);
  return {recordHash:r.recordHash, y:(gs.scored&&gs.inOptimalSet)?1:0,
          greedyOk:(gs.scored&&gs.inOptimalSet)?1:0, greedyReg:gs.scored?gs.regret:null,
          learnedOk:(ls.scored&&ls.inOptimalSet)?1:0, learnedReg:ls.scored?ls.regret:null,
          learnedScored:ls.scored?1:0, greedyScored:gs.scored?1:0,
          f:extractV2(r,l)};});
writeFileSync(SC+'/3e/matrix-'+S+'.json',JSON.stringify(rows));
console.log(S,'rows',rows.length,'features',Object.keys(rows[0].f).length,'prevalence',(rows.filter(r=>r.y===1).length/rows.length).toFixed(4));
