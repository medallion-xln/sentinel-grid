// H-DISC-1 host layer: the only inference-side file that touches the file system. It computes the source identity of
// the discriminator from the exact files of its inference closure. It reads those files and nothing else; it imports
// nothing from any evaluation, training or population module.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../discriminator/canonical.mjs';

export const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GA = resolve(LANE, '..');
// The complete inference closure, relative to platform/game-agnostic. The static audit (audit/inference-graph-audit.mjs)
// fails if the real import closure of the entry point differs from this list in either direction.
export const INFERENCE_CLOSURE = Object.freeze([
  'stage3h-hdisc1-discriminator-v1/api/discriminator-api.mjs', 'stage3h-hdisc1-discriminator-v1/api/host.mjs',
  'stage3h-hdisc1-discriminator-v1/discriminator/canonical.mjs', 'stage3h-hdisc1-discriminator-v1/discriminator/contract.mjs', 'stage3h-hdisc1-discriminator-v1/discriminator/encoder.mjs', 'stage3h-hdisc1-discriminator-v1/discriminator/forge-encoder.mjs',
  'stage3h-hdisc1-discriminator-v1/discriminator/index.mjs', 'stage3h-hdisc1-discriminator-v1/discriminator/pair-model.mjs',
  'stage3h-hdisc1-discriminator-v1/discriminator/forge-base/features.mjs', 'stage3h-hdisc1-discriminator-v1/discriminator/forge-base/projection-keys.mjs',
  'stage3h-sk1-safety-kernel-v1/adapters/forge/evidence.mjs', 'stage3h-sk1-safety-kernel-v1/kernel/contract.mjs',
]);
export const ENTRY_POINT = INFERENCE_CLOSURE[0];
/** Per-file hashes and the source hash of the closure. */
export function sourceIdentity(root = GA) {
  const files = INFERENCE_CLOSURE.map((f) => ({ file: f, sha256: sha256(readFileSync(resolve(root, f))) }));
  return { sourceHash: sha256(files.map((x) => `${x.file}:${x.sha256}`).sort().join('\n')), files };
}
