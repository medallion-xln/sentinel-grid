export const CONTRACT_VERSION = 1;
export const KERNEL_VERSION = '0.9.0';
export const RECOMMENDATION_VERSION = 1;
export const SNAPSHOT_CONTRACT_VERSION = 1;
export const ROOT_PUCT_ENGINE_ID = 'sentinel-prime-universal-root-puct-v0.9.0';

export const REQUIRED_ADAPTER_METHODS = Object.freeze([
  'manifest',
  'initialState',
  'cloneState',
  'observe',
  'legalActions',
  'step',
  'isTerminal',
  'outcome',
]);

export const PROHIBITED_EXECUTION_SURFACE = Object.freeze([
  /execute/i,
  /dispatch/i,
  /issuecommand/i,
  /sendcommand/i,
  /mutateworld/i,
  /writelive/i,
  /applylive/i,
  /authoritytoken/i,
  /escalateauthority/i,
]);
