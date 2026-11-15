// Successor exclusion loader (for whatever stage comes after SK1). Fail-closed. It is the SK1 context (every earlier
// forbidden block and sealed registry, the strict index) PLUS everything SK1 itself consumed, taken from the tracked
// spend ledger: the 26 screened blocks, the retired reserve, the rejected block, and the three SK1 registries.
// A later allocator must call loadSuccessorExclusions() instead of loadSk1Exclusions().
import { resolve } from 'node:path';
import { loadSk1Exclusions, blockFailures, admission, contamination } from '../infra/exclusions.mjs';
import { LANE, EVIDENCE, fileSha, readJ, fail, exists } from '../infra/common.mjs';

export const LEDGER_FILE = resolve(EVIDENCE, 'SK1_SPEND_LEDGER.json');
export function loadSuccessorExclusions({ ledgerFile = LEDGER_FILE } = {}) {
  if (!exists(ledgerFile)) fail('SK1_SPEND_LEDGER_MISSING');
  let led; try { led = readJ(ledgerFile); } catch { fail('SK1_SPEND_LEDGER_UNREADABLE'); }
  if (led.schema !== 'SK1_SPEND_LEDGER_V1') fail('SK1_SPEND_LEDGER_INVALID');
  const regs = [[led.populations.EXPLORATION.registry, led.populations.EXPLORATION.registrySha256], [led.populations.VALIDATION.registry, led.populations.VALIDATION.registrySha256], [led.unusedRegistry.file, led.unusedRegistry.sha256]];
  for (const [f, h] of regs) { const p = resolve(LANE, f); if (!exists(p)) fail('SK1_REGISTRY_MISSING:' + f); if (fileSha(p) !== h) fail('SK1_REGISTRY_FILE_CHANGED:' + f); }
  const listed = [...led.blocks.screenedAndSpent, ...led.blocks.reserveNeverGenerated, ...led.blocks.rejectedAtPreflight];
  if (listed.length !== 37 || listed.some((b) => typeof led.statuses[b] !== 'string')) fail('SK1_SPEND_LEDGER_BLOCK_LIST_CHANGED'); // 26 screened + 10 retired + 1 rejected
  const ctx = loadSk1Exclusions({ extraRegistries: regs.map(([f]) => resolve(LANE, f)) });
  return { ...ctx, forbidden: { ...ctx.forbidden, ...led.statuses }, successorOf: 'STAGE3H-SK1', ledgerSha256: fileSha(ledgerFile) };
}
export { blockFailures, admission, contamination };
