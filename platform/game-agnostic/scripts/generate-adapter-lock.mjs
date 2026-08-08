import path from 'node:path';
import { discoverAdapterPackages } from '../src/sdk/package-discovery.js';
import { createAdapterLock, writeAdapterLock } from '../src/sdk/lockfile.js';
import { productionAdapterRoot, lockFile, readJson, root } from './production-context.mjs';

const descriptors = await discoverAdapterPackages({ roots: [productionAdapterRoot] });
const configurations = await readJson(path.join(root, 'config/adapter-configurations.json'));
const lock = createAdapterLock(descriptors, configurations);
await writeAdapterLock(lockFile, lock);
console.log(JSON.stringify({ pass: true, adapterCount: lock.packages.length, lockHash: lock.lockHash }, null, 2));
