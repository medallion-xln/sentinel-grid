import {
  CONTRACT_VERSION,
  PROHIBITED_EXECUTION_SURFACE,
  REQUIRED_ADAPTER_METHODS,
} from './constants.js';
import { ContractError } from './errors.js';
import { deepFreeze, stableStringify } from './determinism.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateJsonValue(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} must contain only finite JSON numbers`);
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`));
    return value;
  }
  assert(isRecord(value), `${path} must be JSON-compatible`);
  for (const [key, entry] of Object.entries(value)) {
    assert(typeof key === 'string', `${path} contains an invalid key`);
    validateJsonValue(entry, `${path}.${key}`);
  }
  return value;
}

function validateIdentifier(value, path) {
  assert(typeof value === 'string' && value.length > 0, `${path} is required`);
  assert(value.length <= 256, `${path} must not exceed 256 characters`);
  assert(!value.includes('\u0000'), `${path} must not contain NUL`);
  return value;
}

export function validateAdapterManifest(manifest) {
  assert(isRecord(manifest), 'Adapter manifest must be an object');
  assert(manifest.contractVersion === CONTRACT_VERSION, `manifest.contractVersion must equal ${CONTRACT_VERSION}`);
  validateIdentifier(manifest.gameId, 'manifest.gameId');
  validateIdentifier(manifest.adapterId, 'manifest.adapterId');
  validateIdentifier(manifest.adapterVersion, 'manifest.adapterVersion');
  assert(manifest.deterministic === true, 'Stage 0/1 adapters must declare deterministic=true');
  assert(Array.isArray(manifest.observationSchemas) && manifest.observationSchemas.length > 0, 'manifest.observationSchemas must be non-empty');
  const schemaKeys = new Set();
  for (const schema of manifest.observationSchemas) {
    assert(isRecord(schema), 'Each observation schema descriptor must be an object');
    validateIdentifier(schema.schemaId, 'observationSchemas[].schemaId');
    assert(Number.isInteger(schema.schemaVersion) && schema.schemaVersion >= 1, 'schemaVersion must be a positive integer');
    assert(typeof schema.variableSize === 'boolean', 'schema.variableSize must be boolean');
    const key = `${schema.schemaId}@${schema.schemaVersion}`;
    assert(!schemaKeys.has(key), 'Duplicate observation schema descriptor', { key });
    schemaKeys.add(key);
  }
  assert(isRecord(manifest.capabilities), 'manifest.capabilities is required');
  for (const name of [
    'imperfectInformation',
    'stochasticTransitions',
    'simultaneousActions',
    'variableObservationSize',
  ]) {
    assert(typeof manifest.capabilities[name] === 'boolean', `manifest.capabilities.${name} must be boolean`);
  }
  assert(isRecord(manifest.authority), 'manifest.authority is required');
  assert(manifest.authority.tier === 'R0', 'Stage 0/1 adapter authority must be R0');
  assert(manifest.authority.executionInterface === false, 'Adapter must declare executionInterface=false');
  if ('metadata' in manifest) validateJsonValue(manifest.metadata, 'manifest.metadata');
  return manifest;
}

export function validateObservationPacket(packet, manifest = undefined) {
  assert(isRecord(packet), 'ObservationPacket must be an object');
  assert(packet.contractVersion === CONTRACT_VERSION, `ObservationPacket.contractVersion must equal ${CONTRACT_VERSION}`);
  validateIdentifier(packet.gameId, 'ObservationPacket.gameId');
  validateIdentifier(packet.schemaId, 'ObservationPacket.schemaId');
  assert(Number.isInteger(packet.schemaVersion) && packet.schemaVersion >= 1, 'ObservationPacket.schemaVersion must be a positive integer');
  validateIdentifier(packet.observerId, 'ObservationPacket.observerId');
  assert(Number.isInteger(packet.sequence) && packet.sequence >= 0, 'ObservationPacket.sequence must be a non-negative integer');
  assert(Array.isArray(packet.features), 'ObservationPacket.features must be an array');
  assert(packet.features.every(Number.isFinite), 'ObservationPacket.features must contain only finite numbers');
  if ('featureShape' in packet) {
    assert(Array.isArray(packet.featureShape), 'ObservationPacket.featureShape must be an array');
    assert(packet.featureShape.every((dimension) => Number.isInteger(dimension) && dimension >= 0), 'featureShape dimensions must be non-negative integers');
    const product = packet.featureShape.reduce((total, dimension) => total * dimension, 1);
    assert(product === packet.features.length, 'featureShape product must match features.length');
  }
  assert(isRecord(packet.metadata), 'ObservationPacket.metadata is required');
  validateJsonValue(packet.metadata, 'ObservationPacket.metadata');

  if (manifest) {
    validateAdapterManifest(manifest);
    assert(packet.gameId === manifest.gameId, 'ObservationPacket.gameId must match manifest.gameId');
    const schema = manifest.observationSchemas.find(
      (candidate) => candidate.schemaId === packet.schemaId && candidate.schemaVersion === packet.schemaVersion,
    );
    assert(schema, 'ObservationPacket schema is not declared by the adapter manifest');
  }
  return packet;
}

export function validateActionDescriptor(action) {
  assert(isRecord(action), 'ActionDescriptor must be an object');
  validateIdentifier(action.actionId, 'ActionDescriptor.actionId');
  assert(action.actorId === null || typeof action.actorId === 'string', 'ActionDescriptor.actorId must be a string or null');
  if (typeof action.actorId === 'string') validateIdentifier(action.actorId, 'ActionDescriptor.actorId');
  assert('target' in action, 'ActionDescriptor.target is required and may be null');
  validateJsonValue(action.target, 'ActionDescriptor.target');
  assert(isRecord(action.parameters), 'ActionDescriptor.parameters must be an object');
  validateJsonValue(action.parameters, 'ActionDescriptor.parameters');
  if ('metadata' in action) {
    assert(isRecord(action.metadata), 'ActionDescriptor.metadata must be an object');
    validateJsonValue(action.metadata, 'ActionDescriptor.metadata');
  }
  return action;
}

export function actionKey(action) {
  validateActionDescriptor(action);
  return stableStringify([
    action.actionId,
    action.actorId,
    action.target,
    action.parameters,
  ]);
}

export function validateLegalActions(actions, { terminal = false } = {}) {
  assert(Array.isArray(actions), 'legalActions must return an array');
  if (!terminal) assert(actions.length > 0, 'legalActions must be non-empty for non-terminal decision states');
  if (terminal) assert(actions.length === 0, 'legalActions must be empty for terminal states');
  const identities = new Set();
  for (const action of actions) {
    validateActionDescriptor(action);
    const key = actionKey(action);
    assert(!identities.has(key), 'legalActions contains duplicate action descriptors', { key });
    identities.add(key);
  }
  return actions;
}

export function validateTransitionResult(result) {
  assert(isRecord(result), 'TransitionResult must be an object');
  assert(Object.hasOwn(result, 'state'), 'TransitionResult.state is required');
  assert(Number.isFinite(result.reward), 'TransitionResult.reward must be finite');
  assert(typeof result.terminal === 'boolean', 'TransitionResult.terminal must be boolean');
  assert(Array.isArray(result.events), 'TransitionResult.events must be an array');
  validateJsonValue(result.events, 'TransitionResult.events');
  assert(isRecord(result.info), 'TransitionResult.info is required');
  validateJsonValue(result.info, 'TransitionResult.info');
  return result;
}

export function validateOutcomePacket(packet) {
  assert(isRecord(packet), 'OutcomePacket must be an object');
  assert(Number.isFinite(packet.scalar), 'OutcomePacket.scalar must be finite');
  assert(typeof packet.terminal === 'boolean', 'OutcomePacket.terminal must be boolean');
  assert(isRecord(packet.vector), 'OutcomePacket.vector must be an object');
  for (const [key, value] of Object.entries(packet.vector)) {
    validateIdentifier(key, 'OutcomePacket.vector key');
    assert(Number.isFinite(value), `OutcomePacket.vector.${key} must be finite`);
  }
  assert(isRecord(packet.metadata), 'OutcomePacket.metadata is required');
  validateJsonValue(packet.metadata, 'OutcomePacket.metadata');
  return packet;
}

export function findProhibitedExecutionMembers(adapter) {
  if (!adapter || (typeof adapter !== 'object' && typeof adapter !== 'function')) return [];
  return Reflect.ownKeys(adapter)
    .filter((key) => typeof key === 'string')
    .filter((key) => PROHIBITED_EXECUTION_SURFACE.some((pattern) => pattern.test(key)));
}

export function validateAdapter(adapter) {
  assert(adapter && (typeof adapter === 'object' || typeof adapter === 'function'), 'Adapter must be an object');
  for (const method of REQUIRED_ADAPTER_METHODS) {
    assert(typeof adapter[method] === 'function', `Adapter method ${method} is required`);
  }
  const prohibited = findProhibitedExecutionMembers(adapter);
  assert(prohibited.length === 0, 'Adapter exposes prohibited execution-surface members', { prohibited });
  const manifest = validateAdapterManifest(adapter.manifest());
  return { adapter, manifest: deepFreeze(structuredClone(manifest)) };
}

export function assertActionIsLegal(action, legalActions) {
  const selectedKey = actionKey(action);
  const legal = legalActions.some((candidate) => actionKey(candidate) === selectedKey);
  assert(legal, 'Action is not present in the adapter-provided legal action set', { selectedKey });
  return true;
}

export { validateJsonValue };
