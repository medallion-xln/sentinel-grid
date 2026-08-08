import { ContractError } from '../core/errors.js';
import { deepFreeze } from '../core/determinism.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

const PROFILE_DEFINITIONS = {
  'universal-r0': {
    profileVersion: 4,
    description: 'Universal deterministic R0 adapter certification.',
    requiredAuthority: 'R0',
    requiredCapabilities: {},
    requiresSnapshotIngestion: false,
    conformance: { simulations: 96, cPuct: 1.25 },
  },
  'production-r0': {
    profileVersion: 4,
    description: 'Production package, lock, configuration, snapshot ingestion, and universal R0 conformance.',
    requiredAuthority: 'R0',
    requiredCapabilities: {},
    requiresSnapshotIngestion: true,
    conformance: { simulations: 128, cPuct: 1.25 },
  },
  'imperfect-information-r0': {
    profileVersion: 4,
    description: 'Production R0 certification requiring imperfect-information and snapshot ingestion support.',
    requiredAuthority: 'R0',
    requiredCapabilities: { imperfectInformation: true },
    requiresSnapshotIngestion: true,
    conformance: { simulations: 128, cPuct: 1.25 },
  },
  'stochastic-r0': {
    profileVersion: 4,
    description: 'Production R0 certification requiring seeded stochastic transitions and snapshot ingestion.',
    requiredAuthority: 'R0',
    requiredCapabilities: { stochasticTransitions: true },
    requiresSnapshotIngestion: true,
    conformance: { simulations: 128, cPuct: 1.25 },
  },
  'zeknova-parity-r0': {
    profileVersion: 4,
    description: 'ZekNova Stage 1A-Z R0 certification requiring fixed 592-feature faction-private observations, seeded detached transitions, snapshot ingestion, and behavioral parity evidence.',
    requiredAuthority: 'R0',
    requiredCapabilities: {
      imperfectInformation: true,
      stochasticTransitions: true,
      simultaneousActions: false,
      variableObservationSize: false,
    },
    requiresSnapshotIngestion: true,
    conformance: { simulations: 320, cPuct: 1.25 },
  },
  'production-scale-r0': {
    profileVersion: 4,
    description: 'Production-scale R0 certification requiring private information, seeded stochasticity, simultaneous action bundles, variable observations, and snapshot ingestion.',
    requiredAuthority: 'R0',
    requiredCapabilities: {
      imperfectInformation: true,
      stochasticTransitions: true,
      simultaneousActions: true,
      variableObservationSize: true,
    },
    requiresSnapshotIngestion: true,
    conformance: { simulations: 160, cPuct: 1.25 },
  },
};

export const CERTIFICATION_PROFILES = deepFreeze(structuredClone(PROFILE_DEFINITIONS));

export function getCertificationProfile(name) {
  assert(typeof name === 'string' && name.length > 0, 'Certification profile name is required');
  const profile = CERTIFICATION_PROFILES[name];
  assert(profile, `Unknown certification profile: ${name}`);
  return profile;
}

export function validateProfileCompatibility(manifest, profileName) {
  const profile = getCertificationProfile(profileName);
  assert(manifest.authority?.tier === profile.requiredAuthority, `Profile ${profileName} requires authority ${profile.requiredAuthority}`);
  for (const [capability, expected] of Object.entries(profile.requiredCapabilities)) {
    assert(manifest.capabilities?.[capability] === expected, `Profile ${profileName} requires capability ${capability}=${expected}`);
  }
  return profile;
}
