// Stage 3G.9 inherited certificates. Each is reproduced by its own --check under run-canonical.
export const INHERITED=Object.freeze({
 stage3f:{script:'scripts/stage3f-freeze-certify.mjs',certificate:'artifacts/stage3f-freeze/stage3f-freeze-certification-result.json',hash:'0fe5d3e24f71015b76f5997771f2474712d2764bc049fc2e90e0144f8d2a08ce',expectedSeconds:3550},
 stage3g12:{script:'scripts/certify-stage3g-predictive-integrity.mjs',certificate:'artifacts/stage3g-predictive-integrity/stage3g-certification-result.json',hash:'7f39253507a4219dac0a0c4a83cfe7d14b2d37fa1498ebb2767560bdea695100',expectedSeconds:1577},
 stage3g3:{script:'scripts/stage3g3/certify.mjs',certificate:'artifacts/stage3g3-temporal-attribution/stage3g3-certification-result.json',hash:'6f58040133deae625e61c636f881b9283da62458581387b0dbe9afee6b4a8c69',expectedSeconds:1966},
 stage3g4:{script:'scripts/stage3g4/certify.mjs',certificate:'artifacts/stage3g4-level-replication/stage3g4-certification-result.json',hash:'259195ba9c2d223010d8302579c665c67fd20b666f43b35c9ae539e6e70cb4c8',expectedSeconds:3869},
 stage3g5:{script:'scripts/stage3g5/certify.mjs',certificate:'artifacts/stage3g5-observable-model-search/stage3g5-certification-result.json',hash:'d472f04f00560229f20020f030722fdf3981f91155424d0a7a2004662be768da',expectedSeconds:30},
 stage3g6:{script:'scripts/stage3g6/certify.mjs',certificate:'artifacts/stage3g6-action-surface-audit/stage3g6-certification-result.json',hash:'291e8ac8f681cb6b38983ff1abcd25cd0352b6a4ebeda0c8aab8442b9929d766',expectedSeconds:45},
 stage3g7:{script:'scripts/stage3g7/certify.mjs',certificate:'artifacts/stage3g7-target-contract/stage3g7-certification-result.json',hash:'ec5ae9c1d2f011791ed93f6bfa2879756905647a4098fcb9c4a9cd42e87e79b6',expectedSeconds:15},
 stage3g8:{script:'stage3g8/certify.mjs',certificate:'artifacts/stage3g8-projection-disclosure/stage3g8-certification-result.json',hash:'0e91ab6c21137fdd0cb29ca258bdf076fc8bbeaa52d0c017de61f1983c78e2e7',expectedSeconds:120},
});
export const OUT='artifacts/stage3g9-c2-requalification';
export const INHERITANCE_PATH=OUT+'/stage3g9-inheritance-reproduction.json';
