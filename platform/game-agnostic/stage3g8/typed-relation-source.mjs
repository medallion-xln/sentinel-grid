// STAGE_3G_8 audit-side producer of the prospective typed-relation candidate. It is the only Stage 3G.8 reader of a
// kernel world for disclosure purposes, through an explicit whitelist: world.relations[].{from,to,type}. It is never
// imported by the observable modules and is not a live adapter change.
import {deepFreeze} from '../src/core/determinism.js';
export const DISCLOSURE_SOURCE_WHITELIST=deepFreeze(['world.relations[].from','world.relations[].to','world.relations[].type']);
export function discloseTypedRelations(world){
 const relations=world.relations.map(r=>({from:r.from,to:r.to,type:r.type})).sort((a,b)=>{const ka=`${a.type} ${a.from} ${a.to}`,kb=`${b.type} ${b.from} ${b.to}`;return ka<kb?-1:ka>kb?1:0;});
 return deepFreeze({disclosureId:'TYPED_RELATION_DISCLOSURE_CANDIDATE_V1',status:'PROSPECTIVE_AUDIT_ONLY',relations});
}
