// Clean-clone reproduction of every witness from COMMITTED evidence only (no dev-runs, no search shards needed):
// rebuilds both worlds of each witness from the dossier's seed, axes and hidden spec, then checks world hashes, full
// public history identity, frozen-connector decisions and the frozen evaluator's regrets and introduction flags.
// Usage (from the lane): node closure/reproduce-witnesses.mjs   (prints JSON; writes nothing)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCounterfactualsSymmetricV1 } from '../../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { potentialIntroduction } from '../../stage3h-activation-readiness-v2/runner-design.mjs';
import { nativeLock } from '../../stage3h-owner-governed-v1/connector.mjs';
import { nativeWorld, publicHistory } from '../twins.mjs';
import { loadExclusionIndex, excludedWorld, validateSeedRange } from './exclusions.mjs';

const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dossier = JSON.parse(readFileSync(resolve(LANE, 'evidence/closure/WITNESS_DOSSIER.json'), 'utf8')), idx = loadExclusionIndex();
const results = dossier.witnesses.map((w) => {
  const combo = { seed: w.seed, ...w.axes }, W1 = nativeWorld(combo, w.hiddenSpecs.w1), W2 = nativeWorld(combo, w.hiddenSpecs.w2);
  const H1 = publicHistory(W1.seed, W1.config, W1.warmupTicks), H2 = publicHistory(W2.seed, W2.config, W2.warmupTicks);
  const f1 = nativeLock(W1.view, W1.band), f2 = nativeLock(W2.view, W2.band), menu = f1.menu, ix = (ids) => ids.map((id) => menu.indexOf(id));
  const lab = (W) => { const t = evaluateCounterfactualsSymmetricV1(W.world, { horizon: W.horizon }), u = menu.map((id) => t.branches.find((b) => b.actionKey === id).totalScalar), truth = u.map((x, i) => ({ id: i, utility: x }));
    return { u, nB: potentialIntroduction(ix(f1.selections.N), ix(f1.selections.B), truth), bN: potentialIntroduction(ix(f1.selections.B), ix(f1.selections.N), truth) }; };
  const L1 = lab(W1), L2 = lab(W2);
  return { set: w.set, idx: w.idx, valid: w.validInSearch, hashes: W1.worldHash === w.worldHashes.w1 && W2.worldHash === w.worldHashes.w2,
    publicHistoryIdentical: W1.content === W2.content && H1.contents.length === H2.contents.length && H1.contents.every((c, t) => c === H2.contents[t]),
    decisionsIdentical: JSON.stringify(f1.selections) === JSON.stringify(f2.selections) && JSON.stringify(ix(f1.selections.B)) === JSON.stringify(w.decisions.B) && JSON.stringify(ix(f1.selections.N)) === JSON.stringify(w.decisions.N),
    utilitiesReproduce: JSON.stringify(L1.u) === JSON.stringify(w.utilities.w1) && JSON.stringify(L2.u) === JSON.stringify(w.utilities.w2),
    labelReversal: L1.nB && !L1.bN && L2.bN && !L2.nB, worldsExcluded: !!excludedWorld(idx, W1.worldHash) && !!excludedWorld(idx, W2.worldHash) };
});
const valid = results.filter((r) => r.valid);
console.log(JSON.stringify({ witnesses: results.length, valid: valid.length,
  allValidReproduce: valid.every((r) => r.hashes && r.publicHistoryIdentical && r.decisionsIdentical && r.utilitiesReproduce && r.labelReversal && r.worldsExcluded),
  spentBlocksRejected: [951, 952].every((b) => !validateSeedRange(idx, b * 1e9, 12768).ok), results }));
