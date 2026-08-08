import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ContractError } from '../core/errors.js';
import { deepFreeze, sha256 } from '../core/determinism.js';
import { getCertificationProfile } from './certification-profiles.js';
import { validateConfigurationSchema } from './config-schema.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRelativeFile(value, field) {
  assert(typeof value === 'string' && value.length > 0, `${field} is required`);
  assert(!path.isAbsolute(value), `${field} must be relative`);
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  assert(normalized !== '..' && !normalized.startsWith('../'), `${field} may not escape the package root`);
  assert(!normalized.includes('\u0000'), `${field} must not contain NUL`);
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new ContractError(`Unable to read JSON: ${file}`, { cause: error.message });
  }
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function walkFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    const stat = await lstat(absolute);
    assert(!stat.isSymbolicLink(), 'Adapter packages may not contain symbolic links', { absolute });
    if (stat.isDirectory()) files.push(...await walkFiles(root, absolute));
    else if (stat.isFile()) files.push(absolute);
  }
  return files;
}

export async function computeAdapterPackageIntegrity(packageRoot) {
  const root = await realpath(packageRoot);
  const files = await walkFiles(root);
  const entries = [];
  for (const absolute of files) {
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    entries.push({ path: relative, sha256: await sha256File(absolute) });
  }
  return deepFreeze({ entries, packageSha256: sha256(entries) });
}

async function inspectSnapshotFormats(root, marker) {
  assert(Array.isArray(marker.snapshotFormats) && marker.snapshotFormats.length > 0,
    'sentinelGrid.adapter.snapshotFormats must be non-empty');
  const keys = new Set();
  const formats = [];
  for (let index = 0; index < marker.snapshotFormats.length; index += 1) {
    const candidate = marker.snapshotFormats[index];
    assert(isRecord(candidate), `snapshotFormats[${index}] must be an object`);
    assert(typeof candidate.formatId === 'string' && candidate.formatId.length > 0,
      `snapshotFormats[${index}].formatId is required`);
    assert(Number.isInteger(candidate.formatVersion) && candidate.formatVersion >= 1,
      `snapshotFormats[${index}].formatVersion must be a positive integer`);
    const schema = validateRelativeFile(candidate.schema, `snapshotFormats[${index}].schema`);
    const importerMethod = candidate.importerMethod ?? 'importSnapshot';
    assert(typeof importerMethod === 'string' && importerMethod.length > 0,
      `snapshotFormats[${index}].importerMethod must be a non-empty string`);
    const key = `${candidate.formatId}@${candidate.formatVersion}`;
    assert(!keys.has(key), 'Duplicate snapshot format declaration', { key });
    keys.add(key);

    const schemaAbsolute = await realpath(path.join(root, schema));
    assert(schemaAbsolute.startsWith(`${root}${path.sep}`), 'Snapshot schema escapes the package root');
    const schemaDocument = await readJson(schemaAbsolute);
    validateConfigurationSchema(schemaDocument, `$snapshotSchema[${key}]`);
    formats.push({
      formatId: candidate.formatId,
      formatVersion: candidate.formatVersion,
      schema,
      schemaAbsolute,
      schemaSha256: await sha256File(schemaAbsolute),
      schemaDocument,
      importerMethod,
    });
  }
  return formats.sort((a, b) => `${a.formatId}@${a.formatVersion}`.localeCompare(`${b.formatId}@${b.formatVersion}`));
}

export async function inspectAdapterPackage(packageRoot) {
  const root = await realpath(packageRoot);
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = await readJson(packageJsonPath);
  const marker = packageJson.sentinelGrid?.adapter;
  assert(isRecord(marker), 'package.json must contain sentinelGrid.adapter metadata', { packageRoot: root });
  assert(typeof packageJson.name === 'string' && packageJson.name.length > 0, 'Adapter package name is required');
  assert(typeof packageJson.version === 'string' && packageJson.version.length > 0, 'Adapter package version is required');
  assert(packageJson.type === 'module', 'Production adapters must use package type=module');

  const entry = validateRelativeFile(marker.entry, 'sentinelGrid.adapter.entry');
  const configSchema = validateRelativeFile(marker.configSchema, 'sentinelGrid.adapter.configSchema');
  const factoryExport = marker.factoryExport ?? 'createAdapter';
  assert(typeof factoryExport === 'string' && factoryExport.length > 0, 'factoryExport must be a non-empty string');
  for (const field of ['gameId', 'adapterId', 'adapterVersion', 'certificationProfile']) {
    assert(typeof marker[field] === 'string' && marker[field].length > 0, `sentinelGrid.adapter.${field} is required`);
  }
  getCertificationProfile(marker.certificationProfile);

  const entryAbsolute = await realpath(path.join(root, entry));
  const schemaAbsolute = await realpath(path.join(root, configSchema));
  assert(entryAbsolute.startsWith(`${root}${path.sep}`), 'Adapter entry escapes the package root');
  assert(schemaAbsolute.startsWith(`${root}${path.sep}`), 'Adapter configuration schema escapes the package root');
  const schema = await readJson(schemaAbsolute);
  validateConfigurationSchema(schema);
  const snapshotFormats = await inspectSnapshotFormats(root, marker);
  const integrity = await computeAdapterPackageIntegrity(root);

  return deepFreeze({
    packageRoot: root,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    gameId: marker.gameId,
    adapterId: marker.adapterId,
    adapterVersion: marker.adapterVersion,
    entry,
    entryAbsolute,
    entrySha256: await sha256File(entryAbsolute),
    factoryExport,
    configSchema,
    configSchemaAbsolute: schemaAbsolute,
    configSchemaSha256: await sha256File(schemaAbsolute),
    configurationSchema: schema,
    certificationProfile: marker.certificationProfile,
    snapshotFormats,
    packageSha256: integrity.packageSha256,
    packageFiles: integrity.entries,
  });
}

async function packageCandidates(root) {
  const absoluteRoot = await realpath(root);
  const directPackage = path.join(absoluteRoot, 'package.json');
  try {
    const stat = await lstat(directPackage);
    if (stat.isFile()) return [absoluteRoot];
  } catch {}

  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const child = path.join(absoluteRoot, entry.name);
    if (entry.name.startsWith('@')) {
      const scoped = await readdir(child, { withFileTypes: true });
      for (const packageEntry of scoped.sort((a, b) => a.name.localeCompare(b.name))) {
        if (packageEntry.isDirectory()) candidates.push(path.join(child, packageEntry.name));
      }
    } else candidates.push(child);
  }
  return candidates;
}

export async function discoverAdapterPackages({ roots }) {
  assert(Array.isArray(roots) && roots.length > 0, 'At least one adapter discovery root is required');
  const discovered = [];
  for (const root of roots) {
    for (const candidate of await packageCandidates(root)) {
      try {
        const packageJson = JSON.parse(await readFile(path.join(candidate, 'package.json'), 'utf8'));
        if (!packageJson.sentinelGrid?.adapter) continue;
      } catch { continue; }
      discovered.push(await inspectAdapterPackage(candidate));
    }
  }
  discovered.sort((a, b) => `${a.packageName}:${a.adapterId}`.localeCompare(`${b.packageName}:${b.adapterId}`));
  const identities = new Set();
  for (const descriptor of discovered) {
    const identity = `${descriptor.gameId}:${descriptor.adapterId}`;
    assert(!identities.has(identity), 'Duplicate discovered adapter identity', { identity });
    identities.add(identity);
  }
  return deepFreeze(discovered);
}
