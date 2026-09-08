/* ZekNova runtime root contract.
 *
 * WHY THIS EXISTS. Every Sentinel Grid entry point that needs the ZekNova runtime
 * previously wrote the same line:
 *
 *   const zeknovaRoot = process.env.ZEKNOVA_ROOT || '/Users/<someone>/Desktop/zeknova-...';
 *
 * The environment variable was already honoured, so the binding was never the
 * problem. The DEFAULT was: on any machine without that exact path, the fallback
 * pointed at nothing and the first readFile threw ENOENT — an accidental path
 * error dressed up as a test failure, which is precisely the failure mode a
 * certification system must never have. A missing dependency has to announce
 * itself, by name, at the boundary.
 *
 * WHAT PORTABILITY MEANS HERE, AND WHAT IT DOES NOT. It does not mean accepting
 * whatever runtime happens to be lying around. This module never searches the
 * filesystem for a plausible ZekNova, never falls back to a personal directory,
 * and never binds a root it cannot structurally verify. It means one explicit
 * binding, verified against the certified inventory, that fails closed with a
 * named reason when it cannot be satisfied.
 *
 * TWO QUESTIONS, KEPT SEPARATE. "Is this a ZekNova root at all?" is structural
 * and is answered here. "Is this the certified ZekNova lineage?" is a content
 * question answered by comparing hashes downstream — a legitimately updated
 * ZekNova must come back as DRIFTED, not as INVALID, or the contract would
 * refuse the very requalification it exists to enable.
 */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const ZEKNOVA_ROOT_ENV = 'ZEKNOVA_ROOT';
export const ZEKNOVA_ROOT_CONTRACT_VERSION = 'ZEKNOVA_ROOT_CONTRACT_V1';

export const ZEKNOVA_ROOT_STATUSES = Object.freeze([
  'BOUND', 'UNBOUND', 'INVALID_NOT_A_DIRECTORY', 'INVALID_MISSING_MARKERS', 'INVALID_UNREADABLE',
]);

/* Structural markers, drawn from four distinct subtrees so that a directory
 * carrying one coincidentally-named file cannot pass. Presence alone never
 * establishes lineage — that is a content question, deliberately not asked here. */
export const ZEKNOVA_ROOT_MARKERS = Object.freeze([
  'azl/zeknova-strategic-state-contract-v2.js',
  'src/world/PrimeShadow.js',
  'src/game/Stage2FStrategicProjectionV2.js',
  'sentinel-grid/live-parity/runtime-collector/collector-core.mjs',
]);

export class ZeknovaRootError extends Error {
  constructor(status, reason, detail = {}) {
    super(`${status}: ${reason}`);
    this.name = 'ZeknovaRootError';
    this.status = status;
    this.reason = reason;
    this.detail = detail;
  }
}

async function isDirectory(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function isReadableFile(candidate) {
  try {
    const info = await stat(candidate);
    if (!info.isFile()) return false;
    await readFile(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the ZekNova root from an explicit binding. Never throws; returns a
 * status a caller can act on. `env` is injectable so the resolution can be tested
 * without mutating the real process environment.
 */
export async function resolveZeknovaRoot({ env = process.env, markers = ZEKNOVA_ROOT_MARKERS } = {}) {
  const declared = env[ZEKNOVA_ROOT_ENV];
  const base = {
    contractVersion: ZEKNOVA_ROOT_CONTRACT_VERSION,
    variable: ZEKNOVA_ROOT_ENV,
    declared: declared ?? null,
    markersRequired: [...markers],
  };
  if (declared === undefined || declared === null || String(declared).trim() === '') {
    return {
      ...base,
      status: 'UNBOUND',
      root: null,
      bound: false,
      reason: `${ZEKNOVA_ROOT_ENV} is not set. ZekNova-dependent certification cannot run without an explicit binding; it is never inferred.`,
      markersPresent: [],
      markersMissing: [...markers],
    };
  }
  /* Relative paths and paths containing spaces are both legitimate; they are
   * resolved rather than rejected. What is never done is guessing. */
  const root = path.resolve(String(declared).trim());
  if (!(await isDirectory(root))) {
    return {
      ...base, status: 'INVALID_NOT_A_DIRECTORY', root, bound: false,
      reason: `${ZEKNOVA_ROOT_ENV} points at ${root}, which is not a readable directory.`,
      markersPresent: [], markersMissing: [...markers],
    };
  }
  const present = [];
  const missing = [];
  for (const marker of markers) {
    if (await isReadableFile(path.join(root, marker))) present.push(marker); else missing.push(marker);
  }
  if (missing.length > 0) {
    return {
      ...base, status: 'INVALID_MISSING_MARKERS', root, bound: false,
      reason: `${root} does not look like a ZekNova runtime root: ${missing.length} of ${markers.length} structural markers are missing.`,
      markersPresent: present, markersMissing: missing,
    };
  }
  return {
    ...base, status: 'BOUND', root, bound: true, reason: null,
    markersPresent: present, markersMissing: [],
  };
}

/**
 * Verify that every file the certified baseline expects is readable under the
 * bound root. Marker presence proves the shape; this proves the whole inventory
 * is actually there, which is what stops a decoy tree from binding.
 */
export async function verifyZeknovaInventoryReadable({ root, predecessorBaseline }) {
  const expected = predecessorBaseline.inventory.filter((entry) => entry.root === 'zeknova');
  const unreadable = [];
  for (const entry of expected) {
    if (!(await isReadableFile(path.join(root, entry.path)))) unreadable.push(entry.path);
  }
  return {
    expectedFiles: expected.length,
    readableFiles: expected.length - unreadable.length,
    unreadableFiles: unreadable,
    complete: unreadable.length === 0,
  };
}

/**
 * Fail-closed accessor. Throws a named ZeknovaRootError rather than letting a
 * downstream readFile produce an anonymous ENOENT.
 */
export async function requireZeknovaRoot(options = {}) {
  const resolution = await resolveZeknovaRoot(options);
  if (!resolution.bound) throw new ZeknovaRootError(resolution.status, resolution.reason, resolution);
  return resolution;
}

/** True when ZekNova-dependent work can run at all. Used to skip explicitly. */
export async function zeknovaAvailable(options = {}) {
  return (await resolveZeknovaRoot(options)).bound;
}
