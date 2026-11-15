// SENTINEL SAFETY KERNEL — R0 shadow-mode demonstration (SK1). Recommendation only; nothing is executed.
// Runs from a clean checkout: it needs only committed files (kernel, adapters, api, models/, demo/fixtures/).
// It shows, for one stored public request: the canonical observation, the legal menu, the expert evidence, the kernel's
// analysis, the ranked recommendation with reasons, and a deterministic replay of the exact decision.
// This is NOT a production deployment and NOT evidence of qualified or game-agnostic decision gains.
//   /opt/homebrew/bin/node demo/demo.mjs [recommend|abstain] [--json]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecommendationApi } from '../api/recommend.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), which = process.argv[2] === 'abstain' ? 'abstain' : 'recommend';
const { note, ...request } = JSON.parse(readFileSync(resolve(HERE, `fixtures/forge-request-${which}.json`), 'utf8')), api = createRecommendationApi({ game: 'forge' }), d = api.describe();
const rec = api.recommend(request.state, request.legalActions, request.advisoryEvidence), replay = api.replay(request, rec.decisionHash);
let refused; try { api.recommend(request.state, request.legalActions, request.advisoryEvidence, { mode: 'EXECUTE' }); refused = false; } catch (e) { refused = e.code; }
if (process.argv.includes('--json')) { console.log(JSON.stringify({ fixture: which, decisionHash: rec.decisionHash, kind: rec.recommendedActionOrAbstention.kind, replayReproduced: replay.reproduced, executionRequest: refused, modelHash: d.model.modelHash, kernelSourceHash: d.sourceIdentity.kernelSourceHash, adapterSourceHash: d.sourceIdentity.adapterSourceHash, qualification: d.model.qualification.status })); process.exit(0); }
const P = request.state.projection, ev = request.advisoryEvidence.experts, pct = (x) => (x == null ? '  n/a' : (100 * x).toFixed(1).padStart(5) + '%'), line = (s = '') => console.log(s);
line('=== SENTINEL SAFETY KERNEL — R0 SHADOW-MODE DEMONSTRATION ===');
line(`kernel ${d.kernel.id} ${d.kernel.version} · api ${d.apiVersion} · model ${d.model.modelId} · ${d.model.qualification.status}`);
line(`authority ${d.authority.state} (${d.authority.mode}) · canDispatch=${d.authority.canDispatch} · canMutateLiveWorld=${d.authority.canMutateLiveWorld}`);
line(); line('1. CANONICAL PUBLIC OBSERVATION');
line(`   contract ${request.state.observationContract.id} / ${request.state.observationContract.version}`);
line(`   tick ${P.tick} · grid ${P.grid.width}x${P.grid.height} · actor energy ${P.actor.energy}, health ${P.actor.health}, ticks remaining ${P.actor.ticksRemaining}`);
line(`   ${P.nodes.length} visible entities: ` + Object.entries(P.nodes.reduce((o, n) => { o[n.kind] = (o[n.kind] ?? 0) + 1; return o; }, {})).map(([k, v]) => `${v} ${k}`).join(', '));
line(); line(`2. LEGAL ACTION MENU (${request.legalActions.length} lawful actions; every one is inspected)`);
request.legalActions.forEach((a, i) => line(`   [${i}] ${a.type.padEnd(9)} cost ${a.cost}  preconditions ${a.pre.length}  effects ${a.eff.map((e) => e.split(':')[0].toLowerCase()).join(', ')}`));
line(); line('3. ADVISORY EXPERT EVIDENCE (identity-free projections)');
line(`   S0     top set [${ev.S0.topSet.join(', ')}] · public scores ${ev.S0.scores.map((s) => s.toFixed(2)).join(' ')}`);
line(`   NEXUS  ${ev.NEXUS.abstain ? 'abstains' : 'recommends an action of type ' + ev.NEXUS.recommendedType} · reason ${ev.NEXUS.reason} · codes ${ev.NEXUS.rationaleCodes.join(', ') || 'none'}`);
line(`   evidence status ${rec.evidence.status}`);
line(); line('4. SAFETY KERNEL ANALYSIS');
line(`   risk criterion: upper bound <= ${rec.uncertainty.riskCriterion.tau} (tier width ${rec.uncertainty.riskCriterion.tierWidth}, mean + ${rec.uncertainty.riskCriterion.z} sd across bags)`);
line(`   supported estimates ${rec.uncertainty.supportedActions}/${request.legalActions.length} · actions outside the development envelope ${rec.uncertainty.actionsOutsideNumericEnvelope} · ${rec.safetyAssessment.status}`);
line(); line('5. RANKED ACTIONS (best first)   risk = empirical estimate, never a guarantee');
line('   rank  action        risk est.  upper bound  exp. regret  tier  notes');
for (const a of rec.rankedActions) line(`   ${String(a.rank + 1).padStart(3)}   [${a.index}] ${a.type.padEnd(9)} ${pct(a.risk?.estimate)}     ${pct(a.risk?.upperBound)}      ${a.expectedRegret ? a.expectedRegret.estimate.toFixed(3) : ' n/a '}     ${String(a.riskTier ?? '-').padStart(2)}   ${a.reasons.filter((r) => r !== 'RISK_ESTIMATED').join(', ')}`);
const r = rec.recommendedActionOrAbstention; line();
if (r.kind === 'RECOMMEND') line(`   RECOMMENDATION: ${r.decisionSet.map((a) => `[${a.index}] ${a.type}`).join(' or ')} — ${r.reason}${r.indistinguishableDistinctActions ? ' (indistinguishable alternatives returned together)' : ''}`);
else { line(`   ABSTENTION: ${r.reason}`); if (r.bestEffortNotRecommended) line(`   top-ranked, NOT recommended: ${r.bestEffortNotRecommended.decisionSet.map((a) => `[${a.index}] ${a.type}`).join(' or ')}`); }
line(`   ${rec.safetyAssessment.qualification.statement}`);
line(); line('6. DETERMINISTIC REPLAY');
line(`   decision hash ${rec.decisionHash}`); line(`   replay of the same request reproduces it: ${replay.reproduced}`);
line(`   model ${d.model.modelHash.slice(0, 16)}… · kernel source ${d.sourceIdentity.kernelSourceHash.slice(0, 16)}… · adapter source ${d.sourceIdentity.adapterSourceHash.slice(0, 16)}…`);
line(`   a request to EXECUTE is refused: ${refused}`);
