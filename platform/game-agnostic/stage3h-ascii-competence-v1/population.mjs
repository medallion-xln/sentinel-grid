// Seed populations, declared before any benchmark run of this lane.
// DEVELOPMENT seeds are used in this task for harness validation only and are SPENT for any confirmatory purpose.
// CALIBRATION / HOLDOUT / STRUCTURAL_OOD namespaces are PROPOSED: they are derivation rules, not materialized
// seed lists; no world from them is created by any file in this lane (tested). Allocation requires authorization.
export const STRIDE = 7919;
export const derive = (base, i) => (base + STRIDE * i) >>> 0;

// Prefix 0x5e3a: unused anywhere in platform/game-agnostic (*.mjs/*.js survey, 2026-10-20) before this lane.
export const DEV_BASE = 0x5e3a0000;
export const DEV_FAMILY = 'S3H_ASCII_DEV';
export const DEV_SEEDS = Object.freeze([0, 1, 2].map((i) => derive(DEV_BASE, i)));
// Pre-design exploratory probes (disclosed): seed 0x7c000000 (v33.1 FRESH_DEV, already development) and DEV_SEEDS[0]
// were used to inspect Nexus outputs and hidden-field shapes before the arms and protocol were written.
export const DISCLOSED_PRE_DESIGN_PROBES = Object.freeze([0x7c000000, DEV_SEEDS[0]]);

// Proposed prospective namespaces (prefix 0xb7: unused anywhere before this lane). Replication A and B are disjoint.
export const PROPOSED = Object.freeze({
  CALIBRATION: { A: 0xb7100000, B: 0xb7180000, family: 'S3H_ASCII_CALIBRATION', use: 'variance planning only; never confirmatory' },
  HOLDOUT: { A: 0xb7200000, B: 0xb7280000, family: 'S3H_ASCII_HOLDOUT', use: 'in-distribution confirmatory' },
  OOD_MIRRORED_GEOMETRY: { A: 0xb7300000, B: 0xb7380000, family: 'S3H_ASCII_OOD_MIRRORED', use: 'factory only: native MIRROR layout reflection (family string contains MIRROR)' },
  OOD_SENSOR_DELAYED: { A: 0xb7400000, B: 0xb7480000, family: 'S3H_ASCII_OOD_SENSOR', sensor: 'DELAYED', use: 'native observation-channel shift' },
  OOD_SENSOR_PARTIAL: { A: 0xb7500000, B: 0xb7580000, family: 'S3H_ASCII_OOD_SENSOR', sensor: 'PARTIAL', use: 'native observation-channel shift' },
  OOD_SENSOR_MISSING: { A: 0xb7600000, B: 0xb7680000, family: 'S3H_ASCII_OOD_SENSOR', sensor: 'MISSING', use: 'native observation-channel shift' },
});
export const PROPOSED_STATUS = 'PROPOSED_NOT_ALLOCATED_NOT_MATERIALIZED';

// Known prior seed sets that must never be reused as unseen data (development-only or spent).
export const PRIOR_DENY = Object.freeze({
  v32Splits: [0xa1200000, 0xa2300000, 0xa3400000, 0xa4500000, 0xa5600000],
  v33Seeds: Array.from({ length: 12 }, (_, i) => 271828 + i),
  v331FreshDev: [0, 1, 2].map((i) => (0x7c000000 + 7907 * i) >>> 0),
  v331Acceptance: Array.from({ length: 12 }, (_, i) => (0x7c100000 + 7919 * i) >>> 0),
  asciiWorlds2Holdout: [...Array.from({ length: 10 }, (_, i) => 81001 + i), ...Array.from({ length: 5 }, (_, i) => 81101 + i)],
});
// Prospective seeds are consecutive inside a namespace: seed_i = base + i, i < NAMESPACE_SPAN. Namespaces are 0x80000 apart.
export const NAMESPACE_SPAN = 0x80000;
export const prospectiveSeed = (base, i) => { if (!Number.isInteger(i) || i < 0 || i >= NAMESPACE_SPAN) throw Error('OUTSIDE_NAMESPACE'); return (base + i) >>> 0; };
export function namespacesDisjoint() {
  const bases = Object.values(PROPOSED).flatMap((n) => [n.A, n.B]).sort((a, b) => a - b);
  for (let i = 1; i < bases.length; i++) if (bases[i] - bases[i - 1] < NAMESPACE_SPAN) return false;
  const deny = Object.values(PRIOR_DENY).flat().concat(DEV_SEEDS, DISCLOSED_PRE_DESIGN_PROBES);
  return !deny.some((s) => bases.some((b) => s >= b && s < b + NAMESPACE_SPAN));
}
