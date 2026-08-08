import { pathToFileURL } from 'node:url';
import { validateAdapter, validateAdapterManifest } from '../core/contracts.js';
import { ContractError } from '../core/errors.js';
import { deepFreeze, sha256 } from '../core/determinism.js';
import { runAdapterConformance } from '../lab/conformance.js';
import { discoverAdapterPackages } from './package-discovery.js';
import { resolveAdapterConfiguration } from './config-schema.js';
import { validateProfileCompatibility } from './certification-profiles.js';
import { validateAdapterLock, verifyDescriptorAgainstLock } from './lockfile.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

function augmentCertificationReport(report, registration, profile) {
  const packageCheck = {
    name: 'production-package-lock',
    pass: true,
    packageName: registration.packageName,
    packageVersion: registration.packageVersion,
    packageSha256: registration.packageSha256,
    entrySha256: registration.entrySha256,
    configSchemaSha256: registration.configSchemaSha256,
    configurationHash: registration.configurationHash,
    lockHash: registration.lockHash,
  };
  const profileCheck = {
    name: 'certification-profile',
    pass: true,
    profileName: registration.certificationProfile,
    profileVersion: profile.profileVersion,
    requiredAuthority: profile.requiredAuthority,
    requiredCapabilities: profile.requiredCapabilities,
    requiresSnapshotIngestion: profile.requiresSnapshotIngestion,
  };
  const snapshotContractCheck = {
    name: 'snapshot-ingestion-contract',
    pass: true,
    formatCount: registration.snapshotFormats.length,
    importerMethods: [...new Set(registration.snapshotFormats.map((format) => format.importerMethod))].sort(),
  };
  const snapshotLockCheck = {
    name: 'snapshot-format-lock',
    pass: true,
    snapshotFormatsHash: registration.snapshotFormatsHash,
    formats: registration.snapshotFormats.map((format) => ({
      formatId: format.formatId,
      formatVersion: format.formatVersion,
      schemaSha256: format.schemaSha256,
      importerMethod: format.importerMethod,
    })),
  };
  return {
    ...report,
    certification: {
      packageName: registration.packageName,
      packageVersion: registration.packageVersion,
      packageSha256: registration.packageSha256,
      entrySha256: registration.entrySha256,
      configSchemaSha256: registration.configSchemaSha256,
      configurationHash: registration.configurationHash,
      lockHash: registration.lockHash,
      profileName: registration.certificationProfile,
      profileVersion: profile.profileVersion,
      snapshotFormatsHash: registration.snapshotFormatsHash,
    },
    checks: [packageCheck, profileCheck, snapshotContractCheck, snapshotLockCheck, ...report.checks],
  };
}

export class ProductionAdapterRegistry {
  #lock;
  #registrations = new Map();

  constructor({ lock }) {
    this.#lock = deepFreeze(structuredClone(validateAdapterLock(lock)));
  }

  get lockHash() { return this.#lock.lockHash; }

  async discover({ roots }) {
    return discoverAdapterPackages({ roots });
  }

  async registerPackage(descriptor) {
    const locked = verifyDescriptorAgainstLock(descriptor, this.#lock);
    const configuration = resolveAdapterConfiguration(descriptor.configurationSchema, locked.configuration);
    assert(sha256(configuration) === locked.configurationHash, 'Resolved configuration does not match lock');

    const moduleUrl = `${pathToFileURL(descriptor.entryAbsolute).href}?integrity=${descriptor.entrySha256}`;
    const imported = await import(moduleUrl);
    const factory = imported[descriptor.factoryExport];
    assert(typeof factory === 'function', `Adapter factory export not found: ${descriptor.factoryExport}`);
    const adapter = await factory(configuration);
    const { manifest } = validateAdapter(adapter);
    validateAdapterManifest(manifest);
    assert(manifest.gameId === descriptor.gameId, 'Loaded adapter gameId does not match package metadata');
    assert(manifest.adapterId === descriptor.adapterId, 'Loaded adapter adapterId does not match package metadata');
    assert(manifest.adapterVersion === descriptor.adapterVersion, 'Loaded adapter version does not match package metadata');
    const profile = validateProfileCompatibility(manifest, descriptor.certificationProfile);

    const snapshotFormats = descriptor.snapshotFormats.map((format) => {
      assert(typeof adapter[format.importerMethod] === 'function',
        `Adapter snapshot importer method not found: ${format.importerMethod}`);
      return deepFreeze({
        formatId: format.formatId,
        formatVersion: format.formatVersion,
        schema: format.schema,
        schemaSha256: format.schemaSha256,
        schemaDocument: structuredClone(format.schemaDocument),
        importerMethod: format.importerMethod,
      });
    });
    assert(!profile.requiresSnapshotIngestion || snapshotFormats.length > 0,
      `Profile ${descriptor.certificationProfile} requires snapshot ingestion support`);

    const identity = `${manifest.gameId}:${manifest.adapterId}`;
    assert(!this.#registrations.has(identity), 'Adapter is already registered', { identity });
    const registration = deepFreeze({
      identity,
      adapter,
      manifest,
      configuration,
      configurationHash: locked.configurationHash,
      packageName: descriptor.packageName,
      packageVersion: descriptor.packageVersion,
      packageSha256: descriptor.packageSha256,
      entrySha256: descriptor.entrySha256,
      configSchemaSha256: descriptor.configSchemaSha256,
      certificationProfile: descriptor.certificationProfile,
      profile,
      snapshotFormats,
      snapshotFormatsHash: locked.snapshotFormatsHash,
      lockHash: this.#lock.lockHash,
    });
    this.#registrations.set(identity, registration);
    return registration;
  }

  get(identity) {
    const registration = this.#registrations.get(identity);
    assert(registration, `Adapter is not registered: ${identity}`);
    return registration;
  }

  list() {
    return deepFreeze([...this.#registrations.values()].map((registration) => ({
      identity: registration.identity,
      gameId: registration.manifest.gameId,
      adapterId: registration.manifest.adapterId,
      adapterVersion: registration.manifest.adapterVersion,
      packageName: registration.packageName,
      packageVersion: registration.packageVersion,
      certificationProfile: registration.certificationProfile,
      configurationHash: registration.configurationHash,
      snapshotFormatCount: registration.snapshotFormats.length,
      snapshotFormatsHash: registration.snapshotFormatsHash,
    })).sort((a, b) => a.identity.localeCompare(b.identity)));
  }

  certify(identity, options = {}) {
    const registration = this.get(identity);
    const conformance = registration.profile.conformance;
    const report = runAdapterConformance(registration.adapter, {
      simulations: options.simulations ?? conformance.simulations,
      cPuct: options.cPuct ?? conformance.cPuct,
      seed: options.seed ?? 1n,
      observerId: options.observerId ?? 'observer-1',
    });
    return augmentCertificationReport(report, registration, registration.profile);
  }
}
