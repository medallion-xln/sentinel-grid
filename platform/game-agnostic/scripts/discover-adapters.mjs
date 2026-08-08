import { discoverAdapterPackages } from '../src/sdk/package-discovery.js';
import { productionAdapterRoot } from './production-context.mjs';

const roots = process.argv.slice(2);
const descriptors = await discoverAdapterPackages({ roots: roots.length ? roots : [productionAdapterRoot] });
console.log(JSON.stringify({
  pass: true,
  adapterCount: descriptors.length,
  adapters: descriptors.map((entry) => ({
    packageName: entry.packageName,
    packageVersion: entry.packageVersion,
    packageSha256: entry.packageSha256,
    gameId: entry.gameId,
    adapterId: entry.adapterId,
    adapterVersion: entry.adapterVersion,
    certificationProfile: entry.certificationProfile,
    entry: entry.entry,
    entrySha256: entry.entrySha256,
    configSchema: entry.configSchema,
    configSchemaSha256: entry.configSchemaSha256,
    snapshotFormats: entry.snapshotFormats.map((format) => ({
      formatId: format.formatId,
      formatVersion: format.formatVersion,
      schema: format.schema,
      schemaSha256: format.schemaSha256,
      importerMethod: format.importerMethod,
    })),
  })),
}, null, 2));
