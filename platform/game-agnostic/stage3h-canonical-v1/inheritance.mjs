import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GA,rawHash } from './guard.mjs';
export function verifyInheritanceBindings(){
  const f=JSON.parse(readFileSync(resolve(GA,'artifacts/stage3f-freeze/stage3f-freeze-certification-result.json'))),g=JSON.parse(readFileSync(resolve(GA,'artifacts/stage3g-freeze/stage3g-freeze-certification-result.json')));
  if(f.status!=='PASS'||f.certificationHash!=='0fe5d3e24f71015b76f5997771f2474712d2764bc049fc2e90e0144f8d2a08ce'||f.freeze.freezeHash!=='41748ff68ff16e6a137b53b72eb7203cb62aa0e761bf15c19f7a13b73d4b79a9'||!f.reproduction.predecessorRunComplete)throw Error('STAGE3F_BINDING_BLOCKED');
  for(const [p,h]of Object.entries(f.sourceHashes))if(rawHash(resolve(GA,p))!==h)throw Error('STAGE3F_SOURCE_CHANGED:'+p);
  if(g.status!=='PASS'||g.certificationHash!=='38c5b1b2a89f1da27f367055009879dbc1c7b1e032b757a82f6a032e3abda58a'||g.STAGE3G_FREEZE_HASH!=='686805d655e94e4ecc24a98d965a4e2f33ed8c51c69e746fc11e96022b64f2f5')throw Error('STAGE3G_BINDING_BLOCKED');
  if(rawHash(resolve(GA,g.freezeFile))!==g.FREEZE_RAW_FILE_SHA256)throw Error('STAGE3G_FREEZE_BYTES_CHANGED');
  return {Stage3F:{status:'PASS_PREVIOUS_READ_ONLY_REPRODUCTION_COMPLETED',freezeHash:f.freeze.freezeHash,certificateHash:f.certificationHash,sourceHashesVerified:true},Stage3G:{status:'PASS_FRESH_READ_ONLY_REPRODUCTION',freezeHash:g.STAGE3G_FREEZE_HASH,certificateHash:g.certificationHash,freezeBytesVerified:true},
    note:'Read-only reproduction results observed during this chat; this function verifies bindings and protected files, not a replacement for those reproduction runs.'};
}
