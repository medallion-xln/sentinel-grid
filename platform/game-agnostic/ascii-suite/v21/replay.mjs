import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { verifyReplay } from './harness.mjs';
import { advanceWorld } from './scenarios.mjs';
import { hash } from './freeze.mjs';
const path = process.argv[2]; if (!path) throw Error('Usage: node ascii-suite/v21/replay.mjs PATH.json[.gz]');
const bytes = readFileSync(path), replay = JSON.parse(path.endsWith('.gz') ? gunzipSync(bytes) : bytes);
if (replay.schema === 'SENTINEL_ASCII_TEMPORAL_REPLAY_V1') {
  let s = replay.initialState;
  for (const a of replay.actions) { s = advanceWorld(s, a.action, a.opponentAction); if (hash(s) !== a.stateHash) throw Error('FORENSIC_REPLAY_MISMATCH_TICK_' + s.tick); }
  if (hash(s) !== replay.finalStateHash) throw Error('FINAL_FORENSIC_REPLAY_MISMATCH');
} else verifyReplay(replay);
console.log(JSON.stringify({ status: 'EXACT_FORENSIC_REPLAY_PASS', ticks: replay.actions.length, evidenceStatus: 'DIAGNOSTIC_NOT_CERTIFICATE' }));
