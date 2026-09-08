#!/usr/bin/env node
/* Stage 3C-R.2 — export the frozen Nexus SFT training view and the evaluation prompts.
 *
 * Everything here is a deterministic function of the Stage 3B.1 corpus, so none of
 * it is committed: regenerate the corpus first, then run this.
 *
 *   node scripts/generate-stage3b1-corpus.mjs
 *   node scripts/generate-stage3b1-corpus.mjs --pilot
 *   node scripts/export-stage3cr2-sft-view.mjs <outDir>
 *
 * Verifies the SFT view against the frozen hash and refuses to write on drift.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from '../src/lab/stage3b1-temporal-warmup.js';
import { measureRuleBaseRates, selectRelationalCases } from '../src/lab/stage3c-learned-nexus.js';
import { sampleBalancedByTopology, buildSftRow, buildInstruction } from '../src/lab/stage3cr-training-environment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? path.join(root, 'build', 'stage3cr2');
const EXPECTED_SFT_HASH = '93c20fc679492cdbc5a7ee3e7dd289ecf942ae818151d17bfbd79f73cde8d9d5';
const EXPECTED_SFT_ROWS = 4459;

const corpus = await loadCorpus(path.join(root, 'build/stage3b1-corpus/corpus.jsonl'));
if (!corpus.present) {
  console.error('STAGE3CR2_BLOCKED=true reason=CORPUS_NOT_PRESENT');
  console.error('  Run: node scripts/generate-stage3b1-corpus.mjs (and --pilot)');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const train = corpus.records.filter((r) => r.split === 'TRAIN');
const baseRates = measureRuleBaseRates(train);
const selected = selectRelationalCases(train, baseRates)
  .filter((e) => e.relationallyMeaningful).map((e) => e.record);
const sampler = sampleBalancedByTopology(selected, { maxSharePerShape: 0.12 });
const sftRows = sampler.sampled.map(buildSftRow).filter((r) => r !== null);
const body = `${sftRows.map((r) => JSON.stringify(r)).join('\n')}\n`;
const hash = createHash('sha256').update(body).digest('hex');

const splits = [...new Set(sampler.sampled.map((r) => r.split))];
const leakage = splits.filter((s) => s !== 'TRAIN');
if (leakage.length > 0) {
  console.error(`STAGE3CR2_ABORT reason=TRAINING_LEAKAGE splits=${splits.join(',')}`);
  process.exit(3);
}
if (sftRows.length !== EXPECTED_SFT_ROWS || hash !== EXPECTED_SFT_HASH) {
  console.error('STAGE3CR2_ABORT reason=SFT_VIEW_DRIFT');
  console.error(`  rows ${sftRows.length} (expected ${EXPECTED_SFT_ROWS})`);
  console.error(`  hash ${hash}`);
  console.error(`  want ${EXPECTED_SFT_HASH}`);
  process.exit(4);
}
writeFileSync(path.join(outDir, 'nexus-sft-train.jsonl'), body);

for (const split of ['VALIDATION', 'HOLDOUT', 'OOD']) {
  const recs = corpus.records.filter((r) => r.split === split);
  const lines = recs.map((r) => JSON.stringify({ recordHash: r.recordHash, instruction: buildInstruction(r) }));
  writeFileSync(path.join(outDir, `prompts-${split}.jsonl`), `${lines.join('\n')}\n`);
  console.log(`${split}: ${recs.length} prompts`);
}
console.log(JSON.stringify({
  sftRows: sftRows.length, sftHash: hash, hashMatchesFrozen: true,
  trainingLeakageCount: 0, outDir,
}, null, 2));
