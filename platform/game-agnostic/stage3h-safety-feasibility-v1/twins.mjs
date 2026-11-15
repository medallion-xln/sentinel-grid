// Source-grounded public-equivalent twins. A twin changes ONLY hidden draws of the frozen V2 generator, inside the
// generator's own ranges (scenarios-v2.js generateScenarioV2):
//   structural node value          2 + randomInt(0, valueSpread + 2)   -> [2, valueSpread + 3]   (primary objective node fixed at 12 + valueSpread)
//   structural node initial health index % 4 === 0 ? 20 + randomInt(0, 30) : 100 -> [20, 49]   (failed restore node fixed at 0)
// The perturbation is applied to the scenario config the frozen generator builds for (seed, axes), and the world is then
// produced by the frozen calibrated warm-up and native admission exactly as for a native world. Seed, axes, topology,
// geometry, roles, relations, objectives, channels and energy are untouched.
import { createWorld, hashWorld, isTerminal, legalActions, step } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { devLock } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { publicContent } from './contract.mjs';

const STRUCTURAL = new Set(['POWER_SOURCE', 'DEPOT', 'REPAIR_TARGET', 'INFRASTRUCTURE']);
const ok = (v, m) => { if (!v) throw Error(m); };
export const axesOf = (combo) => { const { seed, population, cell, panel, idx, ...axes } = combo; return { seed, axes }; };
const build = (seed, axes, perturb) => (warmupTicks) => perturb(generateScenarioSymmetricV1({ ...axes, seed, warmupTicks }));

/** Hidden coordinates of a scenario config, with a check that every drawn value lies in the generator's support. */
export function hiddenSupport(config) {
  const spread = config.curriculumParameters.valueSpread, vmax = spread + 3, primary = config.objectives.find((o) => o.id === 'objective-primary').entityId;
  const structural = config.entities.filter((e) => STRUCTURAL.has(e.type)), coords = [], violations = [];
  structural.forEach((e, index) => {
    ok(e.id === 'n' + index, 'STRUCTURAL_INDEX_NOT_RECOVERABLE');
    if (e.id === primary) { if (e.value !== 12 + spread) violations.push(e.id + ':primaryValue'); }
    else { if (!(e.value >= 2 && e.value <= vmax)) violations.push(e.id + ':value'); coords.push({ id: e.id, field: 'value', min: 2, max: vmax, original: e.value }); }
    if (e.health === 0) return; // failed restore node: fixed by the generator
    if (index % 4 === 0) { if (!(e.health >= 20 && e.health <= 49)) violations.push(e.id + ':health'); coords.push({ id: e.id, field: 'health', min: 20, max: 49, original: e.health }); }
    else if (e.health !== 100) violations.push(e.id + ':health100');
  });
  return { coords, violations, inSupport: violations.length === 0 };
}

/** A perturbation spec: {id, field, value}[]. Returns a config transformer that applies it to a fresh generator config. */
export function perturbation(spec) {
  return (config) => {
    const c = structuredClone(config);
    for (const { id, field, value } of spec) { const e = c.entities.find((x) => x.id === id); ok(e && STRUCTURAL.has(e.type), 'BAD_COORD'); e[field] = value; }
    return c;
  };
}

/** Native construction of a (possibly perturbed) world: frozen generator, perturbation, calibrated warm-up, admission. */
export function nativeWorld(combo, spec = []) {
  const { seed, axes } = axesOf(combo), buildScenario = build(seed, axes, perturbation(spec));
  const warm = runCalibratedWarmup(seed, buildScenario), config = warm.scenarioConfig;
  const valid = validateScenarioV2(createWorld(seed, config), config).valid;
  if (!valid || isTerminal(warm.world) || !warm.taskPreserved) return { rejected: !valid ? 'VALIDATOR_INVALID' : isTerminal(warm.world) ? 'TERMINAL_AFTER_WARMUP' : 'TASK_NOT_PRESERVED' };
  const band = config.horizon + 1 === 1 ? 'H0' : config.horizon + 1 === 4 ? 'H2' : null;
  if (band !== axes.horizonBand) return { rejected: 'PACKET_HORIZON_MISMATCH' };
  const view = observableView(warm.world), menu = view.surface.map((e) => e.actionId);
  if (!menu.length || new Set(menu).size !== menu.length) return { rejected: 'NATIVE_MENU_INVALID' };
  return { world: warm.world, config, seed, view, band, horizon: config.horizon, warmupTicks: warm.warmupTicks, worldHash: hashWorld(warm.world), content: publicContent(view) };
}

/** Public view at every warm-up tick (createWorld + WAIT steps, as runTemporalWarmup), for full-history equivalence. */
export function publicHistory(seed, config, ticks) {
  let w = createWorld(seed, config); const out = [publicContent(observableView(w))];
  for (let t = 0; t < ticks; t++) { const wait = legalActions(w).find((a) => a.actionType === 'WAIT'); ok(wait, 'NO_WAIT'); w = step(w, wait).state; out.push(publicContent(observableView(w))); }
  return { contents: out, finalHash: hashWorld(w) };
}

/** Decisions of both frozen arms on a public view (menu indices). */
export function decisions(view, band) {
  const lock = devLock(view, band), menu = lock.menu, ix = (ids) => ids.map((id) => menu.indexOf(id));
  return { B: ix(lock.selections.B), N: ix(lock.selections.N), nexusAbstain: lock.nexus.abstain, nexusCodes: lock.nexus.codes, menu };
}

/** Deterministic twin family of a base world: global corners, single-coordinate extremes, product-support draws. */
export function twinFamily(coords, rnd, draws = 24) {
  const fam = [], pick = (c, which) => ({ id: c.id, field: c.field, value: which === 'min' ? c.min : c.max });
  const H = coords.filter((c) => c.field === 'health'), V = coords.filter((c) => c.field === 'value');
  for (const h of [null, 'min', 'max']) for (const v of [null, 'min', 'max']) {
    if (h === null && v === null) continue;
    const spec = [...(h ? H.map((c) => pick(c, h)) : []), ...(v ? V.map((c) => pick(c, v)) : [])];
    if (spec.length) fam.push({ kind: `CORNER_H${h ?? '='}_V${v ?? '='}`, spec });
  }
  for (const c of coords) for (const w of ['min', 'max']) if (pick(c, w).value !== c.original) fam.push({ kind: `SINGLE_${c.field}_${w}`, spec: [pick(c, w)] });
  for (let k = 0; k < draws; k++) fam.push({ kind: 'DRAW', spec: coords.map((c) => ({ id: c.id, field: c.field, value: c.min + Math.floor(rnd() * (c.max - c.min + 1)) })) });
  return fam;
}
