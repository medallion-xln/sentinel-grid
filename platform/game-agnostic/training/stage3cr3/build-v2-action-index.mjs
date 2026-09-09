#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
const __root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const corpusPath = path.join(__root, "build/stage3b1-corpus/corpus.jsonl");

/* Stage 3C-R.3 — LEARNED_NEXUS_ACTION_INDEX_V2 dataset + shortcut baselines.
 * Dataset V2 is NOT mutated; this derives a training/eval VIEW only. */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadCorpus } from '../../src/lab/stage3b1-temporal-warmup.js';
import { measureRuleBaseRates, selectRelationalCases, buildTarget } from '../../src/lab/stage3c-learned-nexus.js';
import { sampleBalancedByTopology } from '../../src/lab/stage3cr-training-environment.js';

const IS_MAIN = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
const OUT = IS_MAIN ? process.argv[2] : null;
const sha = (s) => createHash('sha256').update(s).digest('hex');

/* ---- ACTION_ORDER_POLICY_V2 ------------------------------------------------
 * Deterministic per-record permutation seeded from recordHash. Reproducible,
 * varies across records, and independent of optimality, reward and split:
 * nothing but the record's own identity hash feeds the shuffle. */
export const ACTION_ORDER_POLICY_V2 = 'SENTINEL_ACTION_ORDER_V2_RECORDHASH_FISHER_YATES';
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
export function orderedBranches(record) {
  const canonical = [...(record.branches ?? [])].sort((a,b)=> a.actionKey<b.actionKey?-1:1);
  const rnd = mulberry32(parseInt(record.recordHash.slice(0,8),16));
  const arr = canonical.slice();
  for (let i=arr.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}
const describe = (b) => {
  const t = b.targetId ? ` -> ${b.targetId}` : '';
  const p = b.parameters && b.parameters.direction ? ` ${b.parameters.direction.toLowerCase()}` : '';
  return `${b.actionType}${p}${t}`;
};
export function buildInstructionV2(record) {
  const ord = orderedBranches(record);
  const lines = ord.map((b,i)=>`  [${i}] ${describe(b)}`).join('\n');
  return [
    'You are a relational intervention specialist. Choose exactly one legal action.','',
    `objective: ${record.objectives}   topology: ${record.shape}   level: L${record.level}`,
    `entities: ${record.entityCount}   relations: ${record.relationCount}   energy: ${record.energy}`,
    `tick: ${record.tick}/${record.maxTicks}   open objectives: ${record.objectiveCount}`,'',
    'legal actions:', lines, '',
    'Answer with JSON: {"actionIndex": <integer>}',
  ].join('\n');
}
/* Identical eligibility and identical target ACTION to V1's buildSftRow: only the
 * way that action is named changes (canonical hash -> local index). Anything else
 * would confound the representation experiment with a data change. */
export function targetIndex(record) {
  const target = buildTarget(record);
  if (!target.singleTargetSftEligible) return -1;
  const optimal = target.optimalSet[0];
  if (optimal === undefined) return -1;
  const ord = orderedBranches(record);
  return ord.findIndex((b) => b.actionKey === optimal);
}

if (OUT) {
  const corpus = await loadCorpus(corpusPath);
  const train = corpus.records.filter(r=>r.split==='TRAIN');
  const baseRates = measureRuleBaseRates(train);
  const sel = selectRelationalCases(train, baseRates).filter(e=>e.relationallyMeaningful).map(e=>e.record);
  const sampled = sampleBalancedByTopology(sel, { maxSharePerShape: 0.12 }).sampled;   // identical selection to V1
  const rows = [];
  for (const r of sampled) {
    const idx = targetIndex(r); if (idx < 0) continue;
    rows.push({ instruction: buildInstructionV2(r), output: JSON.stringify({actionIndex: idx}),
                forge_metadata:{ recordHash:r.recordHash, split:r.split, shape:r.shape } });
  }
  const body = rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
  writeFileSync(OUT+'/nexus-sft-train-v2.jsonl', body);
  const leak = [...new Set(sampled.map(r=>r.split))].filter(s=>s!=='TRAIN');
  // target index distribution + positional shortcut check
  const dist={}, legalCounts={};
  for (const r of sampled){ const i=targetIndex(r); if(i<0) continue;
    dist[i]=(dist[i]??0)+1; const n=(r.branches??[]).length; legalCounts[n]=(legalCounts[n]??0)+1; }
  const tot=Object.values(dist).reduce((a,b)=>a+b,0);
  const ent=-Object.values(dist).reduce((s,c)=>s+(c/tot)*Math.log2(c/tot),0);
  const top=Object.entries(dist).sort((a,b)=>b[1]-a[1])[0];
  const summary={ policy:ACTION_ORDER_POLICY_V2,
    policyHash: sha(ACTION_ORDER_POLICY_V2+'|'+buildInstructionV2.toString()+'|'+orderedBranches.toString()),
    rows: rows.length, sftHash: sha(body), trainingLeakageCount: leak.length,
    targetIndexDistribution: dist, targetIndexEntropyBits: Math.round(ent*1000)/1000,
    mostCommonIndex: Number(top[0]), mostCommonIndexShare: Math.round(top[1]*10000/tot)/10000,
    legalActionCountDistribution: legalCounts };
  writeFileSync(OUT+'/v2-dataset-summary.json', JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2).slice(0,1200));
}
