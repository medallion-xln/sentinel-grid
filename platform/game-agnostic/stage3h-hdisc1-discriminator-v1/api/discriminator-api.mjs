// SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1 — R0 comparison API, version HDISC1_R0_API_V1. THE INFERENCE ENTRY POINT.
//   const api = createDiscriminatorApi({ game: 'forge' });            // untrained: abstains on every request
//   const record = api.compare(canonicalPublicState, legalActions, advisoryEvidence);
// The API compares and ranks. It has no method that executes, dispatches or mutates and refuses any request for one.
// It is separate from the frozen SK1 recommendation API and does not replace it.
import { createDiscriminator, MODES, STATUS, ContractRejection } from '../discriminator/index.mjs';
import { makeForgeEncoder, PROVISIONAL_VOCABULARY } from '../discriminator/forge-encoder.mjs';
import { sourceIdentity } from './host.mjs';

export const API_VERSION = 'HDISC1_R0_API_V1';
/** game: 'forge' builds the Forge encoder; pass `encoder` to supply another (a synthetic encoder needs mode SYNTHETIC_CONTRACT_VERIFICATION). */
export function createDiscriminatorApi({ game = 'forge', encoder = null, encoderConfig = PROVISIONAL_VOCABULARY, parameters = null, provenance = null, mode = MODES.ADVISORY } = {}) {
  const enc = encoder ?? (game === 'forge' ? makeForgeEncoder(encoderConfig) : null); if (!enc) throw new ContractRejection('UNKNOWN_GAME_ENCODER', String(game));
  const source = sourceIdentity(), d = createDiscriminator({ encoder: enc, parameters, provenance, mode, sourceIdentity: { sourceHash: source.sourceHash } });
  const compare = (canonicalPublicState, legalActions, advisoryEvidence = null, options = {}) => Object.freeze({ apiVersion: API_VERSION, ...d.compare(canonicalPublicState, legalActions, advisoryEvidence, options) });
  return Object.freeze({ compare, replay: d.replay, describe: () => ({ apiVersion: API_VERSION, ...d.describe(), sourceFiles: source.files }), status: d.status, execute: d.execute, dispatch: d.dispatch, mutate: d.mutate, apply: d.apply, commit: d.commit, act: d.act });
}
export { MODES, STATUS };
