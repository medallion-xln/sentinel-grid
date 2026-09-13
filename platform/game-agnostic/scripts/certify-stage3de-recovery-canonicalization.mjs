#!/usr/bin/env node

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';

const result = await certifyRecoveredStage3DE();
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'PASS' ? 0 : 1;
