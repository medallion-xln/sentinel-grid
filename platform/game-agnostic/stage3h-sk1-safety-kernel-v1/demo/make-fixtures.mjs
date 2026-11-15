// SK1 demo fixtures (run once, locally; needs the privileged EXPLORATION records). Copies the PUBLIC request of two
// EXPLORATION (development-side) classes — the public projection, its legal menu and the canonical advisory evidence —
// into demo/fixtures/. Nothing privileged is copied: no alias, seed, world hash, family, truth or outcome.
// The two classes are the first in manifest order for which the frozen kernel recommends, and the first for which it abstains.
//   /opt/homebrew/bin/node demo/make-fixtures.mjs [--write]
import { resolve } from 'node:path';
import { loadPopulation } from '../infra/population.mjs';
import { LANE, writeExclusive } from '../infra/common.mjs';
import { forgeRequest } from '../adapters/forge/features.mjs';
import { createRecommendationApi } from '../api/recommend.mjs';

const api = createRecommendationApi({ game: 'forge' }), { classes } = loadPopulation('EXPLORATION', 'DEVELOPMENT'), pick = {};
for (const c of classes) { const r = forgeRequest(c.projection, c.evidence), k = api.recommend(r.state, r.legalActions, r.advisoryEvidence).recommendedActionOrAbstention.kind; if (!pick[k]) pick[k] = r; if (pick.RECOMMEND && pick.ABSTAIN) break; }
for (const [k, r] of Object.entries(pick)) { const text = JSON.stringify(r); if (/"(seed|worldHash|truth|members|family|id)"/.test(text.replace(/"observationContract":\{"id"/, ''))) throw Error('FIXTURE_WOULD_LEAK_A_PRIVILEGED_FIELD');
  console.log(k, 'menu', r.legalActions.length, 'bytes', text.length); if (process.argv.includes('--write')) writeExclusive(resolve(LANE, `demo/fixtures/forge-request-${k.toLowerCase()}.json`), { note: 'PUBLIC request only: observation, legal menu, canonical advisory evidence. From an SK1 EXPLORATION (development) class; carries no identity.', ...r }); }
