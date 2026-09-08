/* Sentinel Forge World — ASCII renderer.
 *
 * A PRESENTATION layer, and the file is arranged so that staying one is testable
 * rather than merely intended:
 *
 *   - every function here is a pure read of structured state;
 *   - nothing here is imported by the kernel, the oracle, the scenario
 *     generators or the exporters;
 *   - renderWorld is never an input to hashWorld, so changing a symbol changes
 *     what a human sees and nothing a certification depends on.
 *
 * The last point is asserted by a test that renders a world, mutates the symbol
 * table, renders again, and requires the world hash to be identical.
 */

import {
  FORGE_ENTITY_TYPES,
  FORGE_TERRAIN_BY_CODE,
  assertForge,
} from './contract.js';

export const FORGE_RENDER_VERSION = 'forge-render-v1';

/* When two entities share a cell the higher precedence wins the glyph. Fixed and
 * total, so a shared cell renders the same way every time. */
const PRECEDENCE = Object.freeze([
  'ACTOR', 'HOSTILE', 'CIVILIAN', 'CRITICAL_TARGET', 'REPAIR_TARGET', 'SUBSTITUTE',
  'INFRASTRUCTURE', 'POWER_SOURCE', 'DEPOT', 'BARRIER', 'RESOURCE', 'HAZARD',
]);

export function entitySymbol(entity) {
  const spec = FORGE_ENTITY_TYPES[entity.type];
  assertForge(spec !== undefined, 'Cannot render an unknown entity type', { type: entity.type });
  /* Lower case marks an entity that is present but not in service. The reader can
   * see the difference between "gone" and "down", which is the distinction most
   * of the Nexus scenario families turn on. */
  return entity.available && entity.health > 0 ? spec.symbol : spec.symbol.toLowerCase();
}

export function renderWorld(world, { legend = false, header = false } = {}) {
  const { width, height, cells } = world.grid;
  const glyphs = [];
  for (let y = 0; y < height; y += 1) {
    const row = [];
    for (let x = 0; x < width; x += 1) {
      row.push(FORGE_TERRAIN_BY_CODE[cells[y * width + x]].symbol);
    }
    glyphs.push(row);
  }

  const occupants = new Map();
  for (const entity of world.entities) {
    const key = `${entity.position.x},${entity.position.y}`;
    const existing = occupants.get(key);
    const rank = PRECEDENCE.indexOf(entity.type);
    if (existing === undefined || rank < existing.rank
      || (rank === existing.rank && entity.id < existing.entity.id)) {
      occupants.set(key, { entity, rank });
    }
  }
  for (const [key, { entity }] of occupants) {
    const [x, y] = key.split(',').map(Number);
    glyphs[y][x] = entitySymbol(entity);
  }

  const border = '#'.repeat(width + 2);
  const lines = [border, ...glyphs.map((row) => `#${row.join('')}#`), border];

  if (header) {
    lines.unshift(
      `tick ${world.tick}/${world.maxTicks}  energy ${world.constraints.energy ?? 0}  family ${world.scenarioFamily}  L${world.scenarioLevel}`,
    );
  }
  if (legend) {
    lines.push('');
    lines.push('legend:');
    for (const type of PRECEDENCE) {
      lines.push(`  ${FORGE_ENTITY_TYPES[type].symbol} = ${type.toLowerCase().replace(/_/g, ' ')} (${FORGE_ENTITY_TYPES[type].description})`);
    }
    lines.push('  lower case = present but out of service');
    for (const [name, spec] of Object.entries(FORGE_TERRAIN_BY_CODE)) {
      lines.push(`  ${spec.symbol} = ${spec.name.toLowerCase().replace(/_/g, ' ')}`);
    }
  }
  return lines.join('\n');
}

/** A human-readable dependency view. Also presentation; also never authoritative. */
export function renderRelations(world) {
  return [...world.relations]
    .map((relation) => `${relation.from} --${relation.type}--> ${relation.to}`)
    .sort()
    .join('\n');
}

export function renderObjectives(world) {
  return world.objectives
    .map((objective) => `${objective.id}: ${objective.deliveredValue}/${objective.requiredValue} at ${objective.entityId}`)
    .join('\n');
}
