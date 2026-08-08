import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { discoverAdapterPackages } from '../src/sdk/package-discovery.js';
import { readAdapterLock } from '../src/sdk/lockfile.js';
import { ProductionAdapterRegistry } from '../src/sdk/adapter-registry.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const productionAdapterRoot = path.join(root, 'production-adapters');
export const lockFile = path.join(root, 'sentinel-grid.adapters.lock.json');

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadProductionRegistry() {
  const descriptors = await discoverAdapterPackages({ roots: [productionAdapterRoot] });
  const lock = await readAdapterLock(lockFile);
  const registry = new ProductionAdapterRegistry({ lock });
  for (const descriptor of descriptors) await registry.registerPackage(descriptor);
  return { descriptors, lock, registry };
}

export async function certifyProductionRegistry() {
  const { descriptors, lock, registry } = await loadProductionRegistry();
  const runs = await readJson(path.join(root, 'config/certification-runs.json'));
  const reports = registry.list().map((entry) => {
    const run = runs[entry.adapterId];
    if (!run) throw new Error(`Missing certification run configuration for ${entry.adapterId}`);
    return registry.certify(entry.identity, {
      observerId: run.observerId,
      seed: BigInt(run.seed),
      simulations: run.simulations,
    });
  });
  return { descriptors, lock, registry, reports };
}
