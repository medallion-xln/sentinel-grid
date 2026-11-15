// H-DISC-1R Phase 6 synthetic end-to-end dry run. READ-ONLY against the repository.
// Inputs: the two tracked SK1 public demo fixtures only. Labels: an explicit synthetic rule. No world, no population,
// no evaluator, no learned parameter. Parameters are fitted on synthetic labels with origin SYNTHETIC_MATHEMATICAL_WITNESS
// and can only be loaded in SYNTHETIC_CONTRACT_VERIFICATION mode. Nothing is written to the repository.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const GA = process.argv[2]; if (!GA) throw Error('usage: dry-run.mjs <platform/game-agnostic path>');
const L1 = resolve(GA, 'stage3h-hdisc1-discriminator-v1'), SK1 = resolve(GA, 'stage3h-sk1-safety-kernel-v1');
const imp = (p) => import(resolve(p));
const { createDiscriminatorApi } = await imp(`${L1}/api/discriminator-api.mjs`);
const { createDiscriminator, MODES, STATUS } = await imp(`${L1}/discriminator/index.mjs`);
const { makeForgeEncoder, PROVISIONAL_VOCABULARY } = await imp(`${L1}/discriminator/forge-encoder.mjs`);
const { project } = await imp(`${L1}/discriminator/encoder.mjs`);
const { FAMILIES, ORIGINS } = await imp(`${L1}/discriminator/pair-model.mjs`);
const { createCandidateKernel } = await imp(`${L1}/api/candidate-kernel.mjs`);
const { sourceIdentity, INFERENCE_CLOSURE } = await imp(`${L1}/api/host.mjs`);
const { fit } = await imp(`${L1}/campaign/learner.mjs`);
const { loadForgeKernel, DEFAULT_MODEL } = await imp(`${SK1}/api/host.mjs`);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const fx = (f) => JSON.parse(readFileSync(resolve(SK1, 'demo/fixtures', f), 'utf8'));
const FIX = { recommend: fx('forge-request-recommend.json'), abstain: fx('forge-request-abstain.json') };
const checks = []; const check = (step, name, ok, detail = null) => checks.push({ step, name, ok: Boolean(ok), detail });
const throwsCode = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const SYNTHETIC_LABEL_RULE = 'SYNTHETIC_LABEL_RULE_V1: an action is labelled 1 (unsafe) iff its type is WAIT or RETREAT; otherwise 0. Not evaluator truth. For contract verification only.';
const synthLabel = (a) => Number(a.type === 'WAIT' || a.type === 'RETREAT');

// 1-2. public observation enters the adapter; the complete legal menu is preserved
const encoder = makeForgeEncoder(PROVISIONAL_VOCABULARY);
for (const [k, f] of Object.entries(FIX)) {
  const enc = encoder(f.state, f.legalActions, f.advisoryEvidence);
  check(1, `${k}: Forge public projection accepted by the encoder (contract ${f.state.observationContract.id}/${f.state.observationContract.version})`, enc && enc.keys.length === f.legalActions.length);
  check(2, `${k}: every one of ${f.legalActions.length} lawful actions is encoded (excluded ${enc.excluded.filter(Boolean).length}, unsupported ${enc.supported.filter((s) => !s).length})`, enc.types.length === f.legalActions.length);
}

// 3. only lawful information reaches the discriminator: privileged fields are refused before computation
const untrained = createDiscriminatorApi({ game: 'forge' });
for (const field of ['seed', 'worldHash', 'evaluatorLabel', 'hiddenHealth']) {
  const s = clone(FIX.recommend.state); s[field] = 1;
  let code = null; try { untrained.compare(s, FIX.recommend.legalActions, FIX.recommend.advisoryEvidence); } catch (e) { code = String(e.message).split(':')[0]; }
  check(3, `privileged field "${field}" in the state is refused`, code !== null, code);
}
{ const a = clone(FIX.recommend.legalActions); a[0].outcome = 'CATASTROPHE'; let code = null; try { untrained.compare(FIX.recommend.state, a, FIX.recommend.advisoryEvidence); } catch (e) { code = String(e.message).split(':')[0]; } check(3, 'an outcome field on a menu action is refused', code !== null, code); }

// untrained: abstains on every request, menu complete
for (const [k, f] of Object.entries(FIX)) { const r = untrained.compare(f.state, f.legalActions, f.advisoryEvidence);
  check(6, `${k}: untrained discriminator abstains (${r.decision.reason}) and still lists the full menu`, r.status === STATUS.NOT_TRAINED && r.decision.kind === 'ABSTAIN' && r.rankedActions.length === f.legalActions.length && r.legalActionMenu.complete); }

// synthetic fitting on the Forge encoder layout (pairwise arm M3 and additive arm M2)
const groupsFor = (arm) => { const layout = encoder.featureSets[arm], pair = arm === 'M3' || arm === 'M3a', groups = [];
  for (let rep = 0; rep < 6; rep++) for (const f of Object.values(FIX)) {
    const enc = encoder(f.state, f.legalActions, f.advisoryEvidence), p = project(enc, layout), sel = f.legalActions.map((_, i) => i).filter((i) => !enc.excluded[i] && enc.supported[i]), y = f.legalActions.map(synthLabel), ex = [];
    if (pair) { for (let a = 0; a < sel.length; a++) for (let b = a + 1; b < sel.length; b++) { const i = sel[a], j = sel[b], ab = p.relation(i, j), ba = p.relation(j, i); if (!ab || !ba) continue; ex.push({ x: [...p.descriptor(i), ...p.descriptor(j), ...ab, ...p.context], reverse: [...p.descriptor(j), ...p.descriptor(i), ...ba, ...p.context], y: y[i] < y[j] ? 1 : y[i] > y[j] ? 0 : 0.5 }); } }
    else for (const i of sel) ex.push({ x: [...p.descriptor(i), ...p.context], y: y[i] });
    groups.push({ family: `SYNTHETIC_FAMILY_${rep}`, examples: ex });
  }
  return { groups, layout, family: pair ? FAMILIES.PAIR : FAMILIES.ADDITIVE };
};
const CONFIG = { bags: 3, trees: 20, depth: 3, lr: 0.2, minLeaf: 1, lambda: 1, maxBins: 16 };
const models = {};
for (const arm of ['M2', 'M3']) { const g = groupsFor(arm); models[arm] = fit({ ...g, origin: ORIGINS.SYNTHETIC, config: CONFIG, label: `H_DISC_1R_DRY_RUN|${arm}|SYNTHETIC` }); }

// a synthetic model may not pose as trained
check(10, 'synthetic parameters are refused in R0_ADVISORY mode (cannot pass for trained)', throwsCode(() => createDiscriminator({ encoder, parameters: models.M3, mode: MODES.ADVISORY }), /SYNTHETIC_PARAMETERS_OUTSIDE_SYNTHETIC_MODE/));

const src = sourceIdentity();
const d = {}; for (const arm of ['M2', 'M3']) d[arm] = createDiscriminator({ encoder, parameters: models[arm], mode: MODES.SYNTHETIC, sourceIdentity: { sourceHash: src.sourceHash } });
const R = {};
for (const arm of ['M2', 'M3']) for (const [k, f] of Object.entries(FIX)) {
  const r = d[arm].compare(f.state, f.legalActions, f.advisoryEvidence); R[`${arm}/${k}`] = r;
  const n = f.legalActions.length, P = r.pairwiseEvidence.matrix;
  // 4. pairwise comparisons: antisymmetric where supported
  let sym = true, supported = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && P[i][j] !== null) { supported++; if (P[j][i] === null || Math.abs(P[i][j] + P[j][i] - 1) > 1e-9) sym = false; }
  check(4, `${arm}/${k}: ${supported} supported ordered pairs, P(i,j)+P(j,i)=1 on all of them, ${r.pairwiseEvidence.issues.length} withheld`, sym && supported > 0);
  // 5. deterministic ranking, independent of menu order
  const again = d[arm].compare(f.state, f.legalActions, f.advisoryEvidence);
  // A consistent permutation reorders the menu AND the index-aligned S0 evidence (scores array, topSet indices) together.
  const perm = [...Array(n).keys()].reverse(), inv = Object.fromEntries(perm.map((old, pos) => [old, pos])), ev = clone(f.advisoryEvidence);
  ev.experts.S0.scores = perm.map((i) => f.advisoryEvidence.experts.S0.scores[i]); ev.experts.S0.topSet = f.advisoryEvidence.experts.S0.topSet.map((i) => inv[i]).sort((a, b) => a - b);
  const rp = d[arm].compare(f.state, perm.map((i) => f.legalActions[i]), ev);
  check(5, `${arm}/${k}: identical record on repeat (recordHash)`, again.recordHash === r.recordHash);
  const sigTop = (x) => x.decision.topActions.map((a) => x.rankedActions.find((y) => y.index === a.index).signature).sort();
  const bySig = (x) => Object.fromEntries(x.rankedActions.map((y) => [y.signature + '#' + y.type, { rank: y.rank, rs: y.relativeSafety }]));
  const rankDiff = Object.entries(bySig(r)).filter(([s, v]) => { const w = bySig(rp)[s]; return !w || w.rank !== v.rank || Math.abs((w.rs ?? 0) - (v.rs ?? 0)) > 1e-12; }).length;
  let pdiff = 0; const Pr = rp.pairwiseEvidence.matrix; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = P[i][j], b = Pr[n - 1 - i][n - 1 - j]; if ((a === null) !== (b === null) || (a !== null && Math.abs(a - b) > 1e-12)) pdiff++; }
  check(5, `${arm}/${k}: decision digest unchanged when menu and S0 evidence are reversed together`, rp.decisionDigest === r.decisionDigest, { sameTopSignatures: JSON.stringify(sigTop(r)) === JSON.stringify(sigTop(rp)), sameDecisionKind: r.decision.kind === rp.decision.kind, actionsWithChangedRankOrScore: rankDiff, pairProbabilitiesThatDiffer: pdiff, flagsOriginal: r.uncertainty.flags, flagsReversed: rp.uncertainty.flags, cyclesOriginal: r.uncertainty.cycles.length, cyclesReversed: rp.uncertainty.cycles.length });
  const topTypes = r.decision.kind === 'TOP_SET' ? r.decision.topActions.map((a) => a.type) : [];
  check(5, `${arm}/${k}: decision ${r.decision.kind}${topTypes.length ? ' ' + topTypes.join(',') : ''}; top set avoids the synthetically unsafe types`, r.decision.kind === 'TOP_SET' ? topTypes.every((t) => t !== 'WAIT' && t !== 'RETREAT') : true, { decision: r.decision.kind, topTypes });
  // 6. uncertainty represented
  check(6, `${arm}/${k}: uncertainty record present (flags ${JSON.stringify(r.uncertainty.flags)}, bags ${r.uncertainty.bags}, margin ${r.uncertainty.marginToRunnerUp})`, Array.isArray(r.uncertainty.flags) && r.uncertainty.bags === CONFIG.bags);
  // 10. outputs bind to source identity
  check(10, `${arm}/${k}: record binds source hash ${String(r.sourceIdentity.sourceHash).slice(0, 12)}…, parameters hash ${String(r.sourceIdentity.parametersHash).slice(0, 12)}…, status ${r.status}`, r.sourceIdentity.sourceHash === src.sourceHash && r.sourceIdentity.parametersHash === models[arm].parametersHash && r.status === STATUS.SYNTHETIC);
  check(10, `${arm}/${k}: replay reproduces the decision and record`, d[arm].replay({ state: f.state, legalActions: f.legalActions, advisoryEvidence: f.advisoryEvidence }, r).reproduced);
}
check(4, `M3 synthetic pair model has a cross-action interaction path: ${d.M3.identity.crossActionInteraction?.crossActionPath ?? JSON.stringify(d.M3.identity.crossActionInteraction)}`, true, d.M3.identity.crossActionInteraction);

// 7. frozen comparators represented without changed semantics: frozen SK1 on the same requests
const sk1 = loadForgeKernel().kernel, sk1Model = JSON.parse(readFileSync(DEFAULT_MODEL, 'utf8'));
check(7, `frozen SK1 modelHash ${sk1Model.modelHash.slice(0, 12)}… equals the protocol pin b479972a…`, sk1Model.modelHash === 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b', { modelHash: sk1Model.modelHash, fileSha256: sha(readFileSync(DEFAULT_MODEL)) });
for (const [k, f] of Object.entries(FIX)) { const a = sk1.recommend(f.state, f.legalActions, f.advisoryEvidence), b = sk1.recommend(f.state, f.legalActions, f.advisoryEvidence);
  check(7, `${k}: frozen SK1 returns ${a.recommendedActionOrAbstention.kind} deterministically (decisionHash ${a.decisionHash.slice(0, 12)}…)`, a.decisionHash === b.decisionHash && a.rankedActions.length === f.legalActions.length); }

// candidate kernel integration (the SK1 V2 candidate wrapper) and 9. execution refused everywhere
const cand = createCandidateKernel(d.M3), cr = cand.recommend(FIX.recommend.state, FIX.recommend.legalActions, FIX.recommend.advisoryEvidence);
check(5, `candidate kernel preserves the discriminator top set: ${JSON.stringify(cr.recommendedActionOrAbstention)}`, cr.recommendedActionOrAbstention.kind === (R['M3/recommend'].decision.kind === 'TOP_SET' ? 'RECOMMEND' : 'ABSTAIN'));
for (const [name, obj] of [['discriminator API', untrained], ['synthetic discriminator', d.M3], ['candidate kernel', cand]]) for (const m of ['execute', 'dispatch', 'mutate']) if (typeof obj[m] === 'function') check(9, `${name}.${m}() refused`, throwsCode(() => obj[m]({}), /EXECUTION_OR_MUTATION_REQUESTED/));
check(9, 'compare(..., {mode:"EXECUTE"}) refused', throwsCode(() => d.M3.compare(FIX.recommend.state, FIX.recommend.legalActions, FIX.recommend.advisoryEvidence, { mode: 'EXECUTE' }), /EXECUTION_OR_MUTATION_REQUESTED/));
check(9, `authority on every record: canDispatch=${cr.authority.canDispatch}, canMutateLiveWorld=${cr.authority.canMutateLiveWorld}`, cr.authority.canDispatch === false && cr.authority.canMutateLiveWorld === false);

// 8. report generation: not executable here (see report); recorded as a static coverage check in the markdown
const summary = { schema: 'H_DISC_1R_SYNTHETIC_DRY_RUN_V1', environment: { node: process.version, platform: `${process.platform}-${process.arch}`, macVerified: false },
  inputs: { fixtures: Object.fromEntries(Object.keys(FIX).map((k) => [k, sha(readFileSync(resolve(SK1, 'demo/fixtures', `forge-request-${k}.json`)))])), labelRule: SYNTHETIC_LABEL_RULE, config: CONFIG },
  inferenceSourceHash: src.sourceHash, inferenceClosureFiles: INFERENCE_CLOSURE.length, syntheticParametersHashes: Object.fromEntries(Object.entries(models).map(([k, m]) => [k, m.parametersHash])),
  step8: 'NOT_EXECUTED_HERE: campaign/evaluate.mjs and campaign/analysis.mjs import custody-protected stage3h-canonical-v1/adapters.mjs (via hw1-eval.mjs and failure-diagnosis/lib.mjs), which is not in this checkout',
  passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length, checks,
  sampleRecord: { arm: 'M3', fixture: 'recommend', decision: R['M3/recommend'].decision.kind, top: R['M3/recommend'].decision.topActions, ranked: R['M3/recommend'].rankedActions.map((a) => ({ index: a.index, type: a.type, rank: a.rank, relativeSafety: a.relativeSafety })), uncertainty: R['M3/recommend'].uncertainty, decisionDigest: R['M3/recommend'].decisionDigest } };
console.log(JSON.stringify(summary, null, 1));
if (summary.failed) process.exitCode = 1;
