// SK1 shared infrastructure constants and rules (evaluation side; never imported by the kernel or its adapters).
import { readFileSync, openSync, writeSync, closeSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const LANE = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..');
// Privileged, gitignored working data (seeds, world hashes, evaluator truth). SK1_WORK lets a clean checkout of the
// committed code run against the working data of the main tree without copying it.
export const WORK = process.env.SK1_WORK ? resolve(process.env.SK1_WORK) : resolve(LANE, 'work'), EVIDENCE = resolve(LANE, 'evidence');
export const BLOCK = 1_000_000_000, PER_BLOCK = 12768, GIT = '/usr/bin/git';
export const sha = (b) => createHash('sha256').update(b).digest('hex'), fileSha = (p) => sha(readFileSync(p)), readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const fail = (m) => { throw Error(m); };
/** Exclusive create: refuses to overwrite. Every frozen record and every result is written through this. */
export function writeExclusive(path, value) { const fd = openSync(path, 'wx'); writeSync(fd, typeof value === 'string' ? value : JSON.stringify(value, null, 1) + '\n'); closeSync(fd); }
export const exists = existsSync;

export const POPULATIONS = Object.freeze(['EXPLORATION', 'VALIDATION']);
export const TARGET = Object.freeze({ EXPLORATION: 1000, VALIDATION: 600 }), MINIMUM = Object.freeze({ EXPLORATION: 600, VALIDATION: 300 }), CAP_FRACTION = 0.05;
export const familyOf = (cell) => cell.split('/').slice(0, 3).join('/');
// Origin-family separation: a family (topology / resource-role / objective) belongs to exactly ONE population, by a
// rule fixed before any world is generated. No family, and therefore no class, can appear on both sides.
export const FAMILY_SPLIT_RULE = 'SK1_FAMILY_SPLIT_V1: VALIDATION if parseInt(sha256("SK1_FAMILY_SPLIT_V1|" + family).slice(0, 8), 16) % 8 < 3, else EXPLORATION';
export const populationOfFamily = (family) => (parseInt(sha(`SK1_FAMILY_SPLIT_V1|${family}`).slice(0, 8), 16) % 8 < 3 ? 'VALIDATION' : 'EXPLORATION');
export const aliasOf = (population, rank) => `SK1${population[0]}-${String(rank).padStart(4, '0')}`;
