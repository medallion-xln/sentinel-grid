// The successor loader really forbids everything SK1 consumed, and still everything before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSuccessorExclusions, blockFailures, admission, LEDGER_FILE } from './exclusions-v2.mjs';

const ctx = loadSuccessorExclusions(), tmp = mkdtempSync(join(tmpdir(), 'sk1-succ-')); test.after(() => rmSync(tmp, { recursive: true, force: true }));
test('every SK1 block (screened, retired reserve, rejected) is forbidden', () => { for (let b = 801; b <= 837; b++) assert.match(blockFailures(ctx, b)[0], /^FORBIDDEN_BLOCK_\d+:(SPENT_SK1_SCREENED|RETIRED_SK1_RESERVE_NEVER_GENERATED|REPOSITORY_TEXT_HIT)$/, String(b));
  assert.equal(Object.values(ctx.forbidden).filter((v) => v === 'SPENT_SK1_SCREENED').length, 26); assert.equal(Object.values(ctx.forbidden).filter((v) => v === 'RETIRED_SK1_RESERVE_NEVER_GENERATED').length, 10); });
test('earlier spent and retired blocks are still forbidden', () => { for (const b of [901, 910, 911, 914, 941, 960, 977, 731, 951]) assert.ok(blockFailures(ctx, b).length > 0, String(b)); assert.equal(blockFailures(ctx, 838).length, 0); });
test('every SK1 identity — exploration, validation and screened-but-unused — is rejected', () => { assert.equal(ctx.regs.length, 10);
  for (const name of ['SK1_EXPLORATION', 'SK1_VALIDATION', 'SK1_SCREENED_UNUSED']) { const reg = ctx.regs.find((r) => r.name === name); assert.ok(reg, name); for (const e of [reg.entries[0], reg.entries[reg.entries.length - 1]]) { assert.equal(admission(ctx, 'f'.repeat(64), { fine: e.fine, coarse: 'f'.repeat(64) }).reason, 'PCD_FINE_MATCH'); assert.equal(admission(ctx, 'e'.repeat(64), { fine: 'e'.repeat(64), coarse: e.coarse }).reason, 'PCD_COARSE_MATCH'); } }
  assert.equal(ctx.regs.find((r) => r.name === 'SK1_EXPLORATION').count + ctx.regs.find((r) => r.name === 'SK1_VALIDATION').count, 1600); });
test('fails closed on a missing or thinned ledger', () => { assert.throws(() => loadSuccessorExclusions({ ledgerFile: join(tmp, 'none.json') }), /SK1_SPEND_LEDGER_MISSING/);
  const led = JSON.parse(readFileSync(LEDGER_FILE, 'utf8')); led.blocks.screenedAndSpent.pop(); writeFileSync(join(tmp, 'thin.json'), JSON.stringify(led)); assert.throws(() => loadSuccessorExclusions({ ledgerFile: join(tmp, 'thin.json') }), /SK1_SPEND_LEDGER_BLOCK_LIST_CHANGED/);
  const led2 = JSON.parse(readFileSync(LEDGER_FILE, 'utf8')); led2.unusedRegistry.sha256 = '0'.repeat(64); writeFileSync(join(tmp, 'reg.json'), JSON.stringify(led2)); assert.throws(() => loadSuccessorExclusions({ ledgerFile: join(tmp, 'reg.json') }), /SK1_REGISTRY_FILE_CHANGED/); });
