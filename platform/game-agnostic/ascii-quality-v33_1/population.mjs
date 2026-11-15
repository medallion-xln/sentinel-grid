// Preregistered DEV populations for v33.1. Seeds are declared here BEFORE any run; the audit refuses other seeds.
// Fresh namespace 0x7c (2026-10-19), disjoint from every ASCII v32 smoke/pilot seed (0xa2.. family), the v33 seed 271828,
// the twelve v33 baseline seeds (replicated below from acceptance.mjs for the Platformer comparison), and all Stage 3H seeds.
export const V33_SEED = 271828;
// ascii-quality-v33/acceptance.mjs line 81: SEEDS = Array.from({length:12},(_,i)=>SEED+i) with SEED=271828 → 271828..271839.
// Reused verbatim so the v33 result STRONG 0/12 TIMEOUT is compared on the identical population.
export const V33_TWELVE = Object.freeze(Array.from({ length: 12 }, (_, i) => V33_SEED + i));
export const FRESH_DEV = Object.freeze(Array.from({ length: 3 }, (_, i) => (0x7c000000 + 7907 * i) >>> 0));
export const PLATFORMER_ACCEPTANCE_SEEDS = Object.freeze(Array.from({ length: 12 }, (_, i) => (0x7c100000 + 7919 * i) >>> 0));
export const FAMILY = 'V32_DEV_OFFSET';
