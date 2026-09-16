/* Positive control for the portability guard.
 *
 * Binds fs through a normal ESM named import (exactly how project modules do) and deliberately touches an ephemeral
 * path. If the guard cannot see this read, the guard's negative results are meaningless and the portability report
 * must say so rather than claim proof.
 */
import { existsSync, readdirSync } from 'node:fs';

const target = '/private/tmp/claude-501/__sentinel_portability_positive_control__';
existsSync(target);
try { readdirSync(target); } catch { /* expected: the path does not exist */ }
process.stdout.write('POSITIVE_CONTROL_TOUCHED\n');
