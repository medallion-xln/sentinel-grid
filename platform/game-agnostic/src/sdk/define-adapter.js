import { validateAdapter } from '../core/contracts.js';

export function defineAdapter(definition) {
  validateAdapter(definition);
  return Object.freeze(definition);
}
