import { ContractError } from '../core/errors.js';
import { deepFreeze } from '../core/determinism.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const SUPPORTED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

export function validateConfigurationSchema(schema, path = '$schema') {
  assert(isRecord(schema), `${path} must be an object`);
  if ('type' in schema) {
    assert(typeof schema.type === 'string' && SUPPORTED_TYPES.has(schema.type), `${path}.type is unsupported`);
  }
  if ('enum' in schema) assert(Array.isArray(schema.enum) && schema.enum.length > 0, `${path}.enum must be non-empty`);
  if ('const' in schema) validateSchemaValue(schema.const, {}, `${path}.const`, { applyDefaults: false });
  if ('default' in schema) validateSchemaValue(schema.default, schema, `${path}.default`, { applyDefaults: false });
  if (schema.type === 'object' || 'properties' in schema || 'required' in schema) {
    if ('properties' in schema) {
      assert(isRecord(schema.properties), `${path}.properties must be an object`);
      for (const [key, child] of Object.entries(schema.properties)) validateConfigurationSchema(child, `${path}.properties.${key}`);
    }
    if ('required' in schema) {
      assert(Array.isArray(schema.required), `${path}.required must be an array`);
      for (const key of schema.required) assert(typeof key === 'string' && key.length > 0, `${path}.required entries must be strings`);
    }
    if ('additionalProperties' in schema) {
      assert(
        typeof schema.additionalProperties === 'boolean' || isRecord(schema.additionalProperties),
        `${path}.additionalProperties must be boolean or schema`,
      );
      if (isRecord(schema.additionalProperties)) validateConfigurationSchema(schema.additionalProperties, `${path}.additionalProperties`);
    }
  }
  if (schema.type === 'array' || 'items' in schema) {
    if ('items' in schema) validateConfigurationSchema(schema.items, `${path}.items`);
    for (const key of ['minItems', 'maxItems']) {
      if (key in schema) assert(Number.isInteger(schema[key]) && schema[key] >= 0, `${path}.${key} must be a non-negative integer`);
    }
    if ('uniqueItems' in schema) assert(typeof schema.uniqueItems === 'boolean', `${path}.uniqueItems must be boolean`);
  }
  for (const key of ['minimum', 'maximum']) {
    if (key in schema) assert(Number.isFinite(schema[key]), `${path}.${key} must be finite`);
  }
  for (const key of ['minLength', 'maxLength']) {
    if (key in schema) assert(Number.isInteger(schema[key]) && schema[key] >= 0, `${path}.${key} must be a non-negative integer`);
  }
  if ('pattern' in schema) {
    assert(typeof schema.pattern === 'string', `${path}.pattern must be a string`);
    try { new RegExp(schema.pattern); } catch { assert(false, `${path}.pattern must be a valid regular expression`); }
  }
  return schema;
}

function typeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isRecord(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function validateSchemaValue(value, schema, path = '$document', { applyDefaults = false } = {}) {
  if (value === undefined && applyDefaults && 'default' in schema) value = clone(schema.default);
  if (value === undefined) return undefined;

  if (schema.type) assert(typeMatches(value, schema.type), `${path} must be ${schema.type}`);
  if ('const' in schema) {
    assert(JSON.stringify(value) === JSON.stringify(schema.const), `${path} must equal the schema const`);
  }
  if (schema.enum) {
    const encoded = JSON.stringify(value);
    assert(schema.enum.some((candidate) => JSON.stringify(candidate) === encoded), `${path} is not an allowed value`);
  }

  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} must be finite`);
    if ('minimum' in schema) assert(value >= schema.minimum, `${path} must be >= ${schema.minimum}`);
    if ('maximum' in schema) assert(value <= schema.maximum, `${path} must be <= ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if ('minLength' in schema) assert(value.length >= schema.minLength, `${path} is too short`);
    if ('maxLength' in schema) assert(value.length <= schema.maxLength, `${path} is too long`);
    if ('pattern' in schema) assert(new RegExp(schema.pattern).test(value), `${path} does not match the required pattern`);
  }
  if (Array.isArray(value)) {
    if ('minItems' in schema) assert(value.length >= schema.minItems, `${path} has too few items`);
    if ('maxItems' in schema) assert(value.length <= schema.maxItems, `${path} has too many items`);
    if (schema.uniqueItems) {
      const encoded = value.map((entry) => JSON.stringify(entry));
      assert(new Set(encoded).size === encoded.length, `${path} must contain unique items`);
    }
    return value.map((entry, index) => schema.items
      ? validateSchemaValue(entry, schema.items, `${path}[${index}]`, { applyDefaults })
      : clone(entry));
  }
  if (isRecord(value)) {
    const output = {};
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    for (const [key, childSchema] of Object.entries(properties)) {
      const resolved = validateSchemaValue(value[key], childSchema, `${path}.${key}`, { applyDefaults });
      if (resolved !== undefined) output[key] = resolved;
      if (required.has(key)) assert(resolved !== undefined, `${path}.${key} is required`);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) continue;
      assert(schema.additionalProperties !== false, `${path}.${key} is not allowed`);
      output[key] = isRecord(schema.additionalProperties)
        ? validateSchemaValue(entry, schema.additionalProperties, `${path}.${key}`, { applyDefaults })
        : clone(entry);
    }
    return output;
  }
  return clone(value);
}

export function validateJsonDocument(schema, document, path = '$document') {
  validateConfigurationSchema(schema);
  return deepFreeze(validateSchemaValue(document, schema, path, { applyDefaults: false }));
}

export function resolveAdapterConfiguration(schema, configuration = {}) {
  validateConfigurationSchema(schema);
  const resolved = validateSchemaValue(configuration, schema, '$config', { applyDefaults: true });
  return deepFreeze(resolved ?? {});
}
