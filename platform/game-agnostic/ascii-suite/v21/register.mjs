import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { PLAN } from './plan.mjs';
import { hash, sourceManifest, verifyBaseline } from './freeze.mjs';
if (!existsSync(new URL('./results/dev5/summary.json', import.meta.url))) throw Error('DEVELOPMENT_COMPARISON_NOT_COMPLETE');
const dev = JSON.parse(readFileSync(new URL('./results/dev5/summary.json', import.meta.url)));
const registration = { schema: PLAN.schema, registeredAt: new Date().toISOString(), registeredBefore: 'first access to fresh heldout families A/B', plan: PLAN,
  planHash: hash(PLAN), source: sourceManifest(), protected: verifyBaseline(), developmentEpisodes: dev.length,
  inheritedVerification: { gameplayTests: '44/44 PASS', stage3gBoundaryTests: '6/6 PASS', stage3gCertificate: 'EXACT_CANONICAL_REPRODUCTION_PASS', stage3fFreshReproduction: 'PASS; 20/20 tests; trackedWriteAttempts=0' } };
writeFileSync(new URL('./registration.json', import.meta.url), JSON.stringify({ ...registration, preregistrationHash: hash(registration) }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ preregistrationHash: hash(registration), sourceHash: registration.source.sourceHash, heldoutStatus: 'UNTOUCHED_AT_REGISTRATION' }));
