#!/usr/bin/env node
/* Stage 3C-R.2 — evaluate a learned Nexus candidate against every deterministic
 * baseline on one split, using the repo's own scoring functions.
 *
 *   node scripts/evaluate-stage3cr2-candidate.mjs <SPLIT> <generations.jsonl> <out.json> [tau]
 *
 * <generations.jsonl> comes from training/stage3cr2/infer.py. Nothing here loads a
 * model: it maps recordHash -> parsed answer and scores it exactly as every baseline
 * is scored. Pass [tau] AFTER the model is frozen to pin one confidence gate instead
 * of sweeping the grid.
 *
 * PRIME_N env var (default 1200) subsamples the Prime MCTS baseline, which costs
 * ~61 ms/record; every other policy is evaluated on the full split.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusPath = path.join(root, 'build/stage3b1-corpus/corpus.jsonl');
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCorpus } from '../src/lab/stage3b1-temporal-warmup.js';
import {
  nexusFor, primeBaseline, nexusRelationalSelector, randomLegalBaseline,
  heuristicGreedyBaseline, evaluatePolicy, scoreAnswer, buildTarget,
} from '../src/lab/stage3c-learned-nexus.js';

const SPLIT = process.argv[2], GEN = process.argv[3], OUT = process.argv[4];
const TAU = process.argv[5] ? Number(process.argv[5]) : null;   // frozen confidence gate, if given

const corpus = await loadCorpus(corpusPath);
const records = corpus.records.filter(r => r.split === SPLIT);

const gen = new Map();
for (const line of readFileSync(GEN,'utf8').split('\n')) {
  if (!line.trim()) continue;
  const g = JSON.parse(line);
  gen.set(g.recordHash, g);
}
const covered = records.filter(r => gen.has(r.recordHash));
console.error(`${SPLIT}: ${records.length} records, ${covered.length} with generations`);

const learnedPolicy = (r) => { const g = gen.get(r.recordHash); return g ? g.answer : null; };

// deterministic Nexus selector, memoised
const nexusCache = new Map();
const nexusOut = (r) => {
  if (!nexusCache.has(r.recordHash)) nexusCache.set(r.recordHash, nexusFor(r));
  return nexusCache.get(r.recordHash);
};
const selectorPolicy = (r) => { const n = nexusOut(r); return n ? nexusRelationalSelector(r, n) : null; };

const res = {};
res.learned  = evaluatePolicy(covered, learnedPolicy);
res.random   = evaluatePolicy(covered, randomLegalBaseline);
res.greedy   = evaluatePolicy(covered, heuristicGreedyBaseline);
res.selector = evaluatePolicy(covered, selectorPolicy);

// ---- hybrids (bounded, predefined family) ----
const agree = (r) => { const l=learnedPolicy(r), s=selectorPolicy(r);
  return l&&s&&!s.abstain&&l.actionId===s.actionId; };
const H = {
  H1_learned_alone:   learnedPolicy,
  H2_selector_alone:  selectorPolicy,
  H3_selector_veto:   (r) => { const l=learnedPolicy(r), s=selectorPolicy(r);
                               return (s && !s.abstain) ? s : l; },
  H4_nexus_guided:    (r) => { const l=learnedPolicy(r), s=selectorPolicy(r);
                               if (!s || s.abstain || !l) return l;
                               const top = (s.ranking??[]).slice(0,3).map(x=>x.actionId);
                               return top.includes(l.actionId) ? l : s; },
  H5_agreement_only:  (r) => agree(r) ? learnedPolicy(r) : { actionId:null, confidence:0, abstain:true },
};
if (TAU !== null) {
  H['H6_confidence_gate'] = (r) => { const l=learnedPolicy(r), s=selectorPolicy(r);
    if (l && typeof l.confidence==='number' && l.confidence>=TAU) return l;
    return (s && !s.abstain) ? s : l; };
} else {
  for (const t of [0.5,0.6,0.7,0.8,0.9,0.95,1.0]) {
    H[`H6_confidence_gate_tau${t}`] = (r) => { const l=learnedPolicy(r), s=selectorPolicy(r);
      if (l && typeof l.confidence==='number' && l.confidence>=t) return l;
      return (s && !s.abstain) ? s : l; };
  }
}
res.hybrids = {};
for (const [k,p] of Object.entries(H)) {
  const e = evaluatePolicy(covered, p);
  res.hybrids[k] = { optimalSetAccuracy:e.optimalSetAccuracy, meanRegret:e.meanRegret,
    medianRegret:e.medianRegret, worstRegret:e.worstRegret, scored:e.scored,
    parseSuccessRate:e.parseSuccessRate, abstentionRate:e.abstentionRate };
}

// ---- complementarity: learned vs deterministic selector ----
const comp = { LEARNED_ONLY_CORRECT:0, NEXUS_ONLY_CORRECT:0, BOTH_CORRECT:0, BOTH_WRONG:0,
               LEARNED_LOWER_REGRET:0, NEXUS_LOWER_REGRET:0, REGRET_TIE:0,
               SELECTOR_ABSTAINED:0, COMPARABLE:0 };
for (const r of covered) {
  const ls = scoreAnswer(r, learnedPolicy(r));
  const ss = scoreAnswer(r, selectorPolicy(r));
  if (!ss.scored) { comp.SELECTOR_ABSTAINED++; continue; }
  if (!ls.scored) continue;
  comp.COMPARABLE++;
  if (ls.inOptimalSet && ss.inOptimalSet) comp.BOTH_CORRECT++;
  else if (ls.inOptimalSet) comp.LEARNED_ONLY_CORRECT++;
  else if (ss.inOptimalSet) comp.NEXUS_ONLY_CORRECT++;
  else comp.BOTH_WRONG++;
  if (ls.regret < ss.regret) comp.LEARNED_LOWER_REGRET++;
  else if (ss.regret < ls.regret) comp.NEXUS_LOWER_REGRET++;
  else comp.REGRET_TIE++;
}
res.complementarity = comp;

// ---- breakdowns ----
const bucket = (keyFn) => {
  const m = {};
  for (const r of covered) {
    const k = String(keyFn(r));
    (m[k] ??= []).push(r);
  }
  const out = {};
  for (const [k,rs] of Object.entries(m)) {
    const e = evaluatePolicy(rs, learnedPolicy);
    const s = evaluatePolicy(rs, selectorPolicy);
    out[k] = { n: rs.length, learnedAcc: e.optimalSetAccuracy, learnedRegret: e.meanRegret,
               selectorAcc: s.optimalSetAccuracy, selectorRegret: s.meanRegret };
  }
  return out;
};
res.byShape       = bucket(r => r.shape);
res.byLevel       = bucket(r => r.level);
res.bySupervision = bucket(r => r.supervisionClass);
res.byHorizonClass= bucket(r => r.horizonClass);
res.byGraphSize   = bucket(r => r.entityCount<=15?'small<=15':r.entityCount<=25?'mid16-25':'large>25');
res.byLegalCount  = bucket(r => r.legalActionCount<=8?'<=8':r.legalActionCount<=14?'9-14':'>14');

// ---- confidence calibration ----
const buckets = {};
for (const r of covered) {
  const l = learnedPolicy(r); if (!l || typeof l.confidence!=='number') continue;
  const b = (Math.floor(l.confidence*10)/10).toFixed(1);
  const s = scoreAnswer(r,l);
  (buckets[b] ??= {n:0,correct:0,regret:[]});
  buckets[b].n++;
  if (s.scored){ if(s.inOptimalSet) buckets[b].correct++; buckets[b].regret.push(s.regret); }
}
res.confidence = Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,{
  n:v.n, accuracy: v.n? Math.round(v.correct*10000/v.n)/10000 : null,
  meanRegret: v.regret.length? Math.round(v.regret.reduce((a,b)=>a+b,0)*100/v.regret.length)/100 : null }]));

// ---- error taxonomy on learned failures ----
const tax = {};
for (const r of covered) {
  const l = learnedPolicy(r); const s = scoreAnswer(r,l);
  if (!s.valid) { tax[s.code] = (tax[s.code]??0)+1; continue; }
  if (s.scored && !s.inOptimalSet) {
    const key = `WRONG_ACTION__${r.shape}`;
    tax[key]=(tax[key]??0)+1;
    if (r.greedyRegret===0) tax.WRONG_WHERE_GREEDY_WOULD_BE_RIGHT=(tax.WRONG_WHERE_GREEDY_WOULD_BE_RIGHT??0)+1;
    if (r.horizonClass==='HORIZON_DEPENDENT') tax.WRONG_ON_HORIZON_DEPENDENT=(tax.WRONG_ON_HORIZON_DEPENDENT??0)+1;
  }
}
res.errorTaxonomy = tax;

// ---- Prime offline (subsampled deterministically for cost) ----
const PRIME_N = Number(process.env.PRIME_N ?? 1200);
const primeRecs = covered.filter((_,i)=> i % Math.max(1,Math.ceil(covered.length/PRIME_N)) === 0);
const primeRows = primeBaseline(primeRecs, { simulations: 24 });
let pOpt=0,pScored=0,mismatch=0;
for (const row of primeRows) {
  if (row.mismatch || !row.answer) { mismatch++; continue; }
  const s = scoreAnswer(row.record,row.answer);
  if (s.scored){ pScored++; if(s.inOptimalSet) pOpt++; }
}
const primeSub = { n: primeRecs.length, scored: pScored, mismatch,
  optimumRate: pScored? Math.round(pOpt*10000/pScored)/10000 : null };
const lSub = evaluatePolicy(primeRecs, learnedPolicy);
const sSub = evaluatePolicy(primeRecs, selectorPolicy);
res.primeOffline = { prime: primeSub,
  learnedOnSameSubset: { optimumRate: lSub.optimalSetAccuracy, meanRegret: lSub.meanRegret },
  selectorOnSameSubset:{ optimumRate: sSub.optimalSetAccuracy, meanRegret: sSub.meanRegret } };

for (const k of ['learned','random','greedy','selector']) delete res[k].rows;
res.meta = { split: SPLIT, records: records.length, evaluated: covered.length, tau: TAU };
writeFileSync(OUT, JSON.stringify(res,null,2));
console.error('wrote ' + OUT);
