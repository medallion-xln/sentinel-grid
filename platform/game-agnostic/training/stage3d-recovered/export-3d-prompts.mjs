import { writeFileSync, readFileSync } from 'node:fs';
import { buildInstructionV2 } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/build-v2.mjs';
for (const s of ['ROUTER_DEV','ROUTER_CAL','ROUTER_HOLDOUT','ROUTER_OOD']) {
  const recs=readFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/split-'+s+'.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
  writeFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/prompts-'+s+'.jsonl',
    recs.map(r=>JSON.stringify({recordHash:r.recordHash,instruction:buildInstructionV2(r)})).join('\n')+'\n');
  console.log(s, recs.length);
}
