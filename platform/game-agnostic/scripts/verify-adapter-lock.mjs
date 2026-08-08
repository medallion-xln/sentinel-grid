import { discoverAdapterPackages } from '../src/sdk/package-discovery.js';
import { readAdapterLock, verifyDescriptorAgainstLock } from '../src/sdk/lockfile.js';
import { productionAdapterRoot, lockFile } from './production-context.mjs';

const descriptors = await discoverAdapterPackages({ roots: [productionAdapterRoot] });
const lock = await readAdapterLock(lockFile);
for (const descriptor of descriptors) verifyDescriptorAgainstLock(descriptor, lock);
const discovered = new Set(descriptors.map((entry) => `${entry.packageName}:${entry.adapterId}`));
const locked = new Set(lock.packages.map((entry) => `${entry.packageName}:${entry.adapterId}`));
const missing = [...locked].filter((identity) => !discovered.has(identity));
const extra = [...discovered].filter((identity) => !locked.has(identity));
const pass = missing.length === 0 && extra.length === 0;
console.log(JSON.stringify({ pass, lockHash: lock.lockHash, adapterCount: descriptors.length, missing, extra }, null, 2));
if (!pass) process.exitCode = 1;
