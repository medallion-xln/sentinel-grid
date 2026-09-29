#!/usr/bin/env node
/* STAGE_3G_1/3G_2 — writes the pre-registered analysis plan (scripts/stage3g/plan.mjs) as a committed artifact.
 *
 *   node scripts/stage3g-plan.mjs           write artifacts/stage3g-predictive-integrity/stage3g-analysis-plan.json
 *   node scripts/stage3g-plan.mjs --check   rebuild and require byte identity; never writes (check-mode guard)
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enforceCheckModeReadOnly } from './certification/check-mode-guard.mjs';
import { OUT, PLAN, PLAN_HASH, PLAN_PATH, SEED_PLAN_HASH } from './stage3g/plan.mjs';

const checkOnly = process.argv.includes('--check');
enforceCheckModeReadOnly({ checkOnly });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (f) => path.join(root, f);

export const planDocument = () => ({ schemaVersion: 1, planHash: PLAN_HASH, seedPlanHash: SEED_PLAN_HASH, plan: PLAN });
const text = `${JSON.stringify(planDocument(), null, 2)}\n`;

if (checkOnly) {
  const reproduced = existsSync(at(PLAN_PATH)) && readFileSync(at(PLAN_PATH), 'utf8') === text;
  console.log(JSON.stringify({ check: 'STAGE3G_ANALYSIS_PLAN', reproduced, planHash: PLAN_HASH }, null, 2));
  if (!reproduced) process.exitCode = 1;
} else {
  await mkdir(at(OUT), { recursive: true });
  await writeFile(at(PLAN_PATH), text);
  console.log(JSON.stringify({ planHash: PLAN_HASH, seedPlanHash: SEED_PLAN_HASH, path: PLAN_PATH }, null, 2));
}
