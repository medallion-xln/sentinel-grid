// HDISC_PORTABLE_EXCLUSIONS_V1 — equivalence with the historical successor loader, measured (not asserted).
//   node readiness/exclusions/equivalence.mjs
// The historical loaders import only where the custody-protected overlay is present. Where they cannot be imported this
// reports { available: false } and the pinned identities (input-pins.json) stand in for the comparison.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './portable-exclusions.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function runEquivalence() {
  let H, alloc, pcd, reg, common, closure, strict, sk1;
  try { H = await import('../../../stage3h-sk1-safety-kernel-v1/successor/exclusions-v2.mjs'); sk1 = await import('../../../stage3h-sk1-safety-kernel-v1/infra/exclusions.mjs'); alloc = await import('../../../stage3h-owner-governed-v1/allocate-namespaces-v4.mjs'); pcd = await import('../../../stage3h-hw1-dev-v1/i2-pcd.mjs'); reg = await import('../../../stage3h-hw1-dev-v1/i2-registry.mjs');
    common = await import('../../../stage3h-sk1-safety-kernel-v1/infra/common.mjs'); closure = await import('../../../stage3h-safety-feasibility-v1/closure/exclusions.mjs'); strict = await import('../../../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs'); }
  catch (e) { return { available: false, reason: 'the historical loaders cannot be imported here: ' + String(e.message).split('\n')[0].slice(0, 120) }; }
  const constants = { EXCLUDED_BLOCKS: same(Object.keys(alloc.EXCLUDED_BLOCKS).map(Number), [...P.EXCLUDED_BLOCKS_0364164C]), PCD_VERSION: pcd.PCD_VERSION === P.PCD_VERSION, PCD_REGISTRY_SCHEMA: reg.REGISTRY_SCHEMA === P.PCD_REGISTRY_SCHEMA, BLOCK: common.BLOCK === P.BLOCK && closure.BLOCK === P.BLOCK, PER_BLOCK: common.PER_BLOCK === P.PER_BLOCK,
    EXCLUSION_FILES: same({ ...closure.EXCLUSION_FILES }, { ...P.EXCLUSION_FILES }), INDEX_FORMAT: strict.INDEX_FORMAT === P.INDEX_FORMAT, SK1_REGISTRY_SCHEMA: sk1.REGISTRY_SCHEMA === P.SK1_REGISTRY_SCHEMA };
  const p = P.loadPortableExclusions(), h = H.loadSuccessorExclusions(), ip = P.contextIdentity(p), ih = P.contextIdentity(h);
  const groups = {}, mismatches = [], probe = (group, a, b, what) => { const g = (groups[group] ??= { probes: 0, mismatches: 0 }); g.probes++; if (!same(a, b)) { g.mismatches++; if (mismatches.length < 10) mismatches.push(`${group}:${what}`); } };
  for (let b = 90; b <= 1010; b++) probe('BLOCK', P.blockFailures(p, b), H.blockFailures(h, b), b);
  for (const b of [0, -3, 12.5, NaN, 1e12, '801']) probe('BLOCK', P.blockFailures(p, b), H.blockFailures(h, b), String(b));
  for (const b of new Set([...p.strict.index.seeds.keys()].map((s) => Math.floor(s / P.BLOCK)))) probe('SEED_BLOCK', P.blockFailures(p, b), H.blockFailures(h, b), b);
  const clean = { fine: 'a'.repeat(64), coarse: 'b'.repeat(64) }, bySource = new Map();
  for (const [hash, src] of p.strict.sources) { const k = src.join('+'), a = bySource.get(k) ?? bySource.set(k, []).get(k); if (a.length < 60) a.push(hash); }
  for (const [k, hashes] of bySource) for (const w of hashes) probe('WORLD', P.admission(p, w, clean), H.admission(h, w, clean), k);
  for (const r of p.regs) { const step = Math.max(1, Math.floor(r.entries.length / 40));
    for (let i = 0; i < r.entries.length; i += step) { const e = r.entries[i]; probe('IDENTITY_COARSE', P.admission(p, 'c'.repeat(64), { fine: 'd'.repeat(64), coarse: e.coarse }), H.admission(h, 'c'.repeat(64), { fine: 'd'.repeat(64), coarse: e.coarse }), r.name);
      if (e.fine) probe('IDENTITY_FINE', P.admission(p, 'c'.repeat(64), { fine: e.fine, coarse: 'd'.repeat(64) }), H.admission(h, 'c'.repeat(64), { fine: e.fine, coarse: 'd'.repeat(64) }), r.name); } }
  for (const w of ['e'.repeat(64), 'f'.repeat(64), 'not-a-hash', 'E'.repeat(64), null]) probe('CLEAN_OR_MALFORMED', P.admission(p, w, clean), H.admission(h, w, clean), String(w).slice(0, 8));
  const e0 = p.regs[p.regs.length - 1].entries[0], prior = [...p.strict.sources.keys()][0], row = (id, x) => ({ id, block: 100, worldHash: 'e'.repeat(64), fine: clean.fine, coarse: clean.coarse, ...x });
  const pop = [row('A', {}), row('B', { block: 905 }), row('C', { worldHash: prior }), row('D', { memberHashes: [prior] }), row('E', { fine: e0.fine, coarse: e0.coarse }), row(e0.id, { fine: e0.fine, coarse: e0.coarse, ownRegistry: e0.source }), row('G', { block: 731 })];
  probe('POPULATION', P.contamination(p, pop), H.contamination(h, pop), 'seven-row population');
  const probes = Object.values(groups).reduce((s, g) => s + g.probes, 0), bad = Object.values(groups).reduce((s, g) => s + g.mismatches, 0);
  return { available: true, constantsEqual: Object.values(constants).every(Boolean), constants, contextIdentityEqual: ip.identitySha256 === ih.identitySha256 && same(ip, ih), portableIdentitySha256: ip.identitySha256, historicalIdentitySha256: ih.identitySha256,
    forbiddenBlocks: ip.forbiddenBlocks, registries: ip.registries.length, distinctExcludedWorlds: p.strict.index.worlds.size, excludedSeeds: p.strict.index.seeds.size, publicClassKeys: { fine: p.pcdIndex.fine.size, coarse: p.pcdIndex.coarse.size },
    probeVectors: probes, probeMismatches: bad, byGroup: groups, firstMismatches: mismatches, identical: Object.values(constants).every(Boolean) && ip.identitySha256 === ih.identitySha256 && bad === 0 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const r = await runEquivalence(); console.log(JSON.stringify(r, null, 1)); console.log(!r.available ? 'HDISC_EXCLUSION_EQUIVALENCE_NOT_MEASURABLE_HERE' : r.identical ? 'HDISC_EXCLUSION_EQUIVALENCE_IDENTICAL' : 'HDISC_EXCLUSION_EQUIVALENCE_DIFFERS'); if (r.available && !r.identical) process.exitCode = 1; }
