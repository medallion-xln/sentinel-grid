/* Sentinel Forge World — Oracle head vocabulary surface.
 *
 * Stage 3B.1 measured a second corpus-construction defect while repairing the
 * first, and it is worth stating precisely because it is easy to misread as an
 * Oracle deficiency:
 *
 *   ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED.
 *
 * `evaluateOracle` reads whatever channel names it is given — Forge's `primary`
 * included. The EIGHT-HEAD assembly does not: every head in it reads
 * `frame.channels.alpha` and nothing else, because that is the channel name the
 * Stage 2I corpora were written in. Handed a Forge frame it computes over an empty
 * series, reports coverage zero, and abstains — at any history length. So the
 * per-head Oracle axis would have stayed dark after the warm-up too, and the cause
 * would have looked like insufficient history when it was a vocabulary mismatch.
 *
 * The fix is adapter work, exactly as the Oracle's own contract says it should be:
 * "Oracle knows nothing about resources, threat or biomes. It reads named numeric
 * channels. Mapping a game's state onto channels is adapter work." Nothing in the
 * Oracle, or in any head, is modified here.
 */

import { deepFreeze } from '../core/determinism.js';
import { FORGE_CHANNEL_DOMAIN_MAX, FORGE_CHANNEL_DOMAIN_MIN } from './scenarios-v3.js';

export const FORGE_ORACLE_SURFACE_VERSION = 'FORGE_ORACLE_CHANNEL_MAPPING_V1';

/** The name every Stage 2I head reads. Not a Forge concept; a head-side constant. */
export const ORACLE_HEAD_CHANNEL_NAME = 'alpha';

export const FORGE_ORACLE_CHANNEL_MAPPING = deepFreeze({
  id: FORGE_ORACLE_SURFACE_VERSION,
  from: 'forge channel (integer, declared domain 0..100)',
  to: `${ORACLE_HEAD_CHANNEL_NAME} (unit interval, the head vocabulary)`,
  normalization: 'value / (domainMax - domainMin), against the DECLARED domain, never against the observed range',
  normalizationRationale:
    'Normalizing by the observed minimum and maximum would let the series being measured set its own scale, so two worlds with different volatility would normalize to the same spread. The declared domain is fixed at scenario construction and identical in every world.',
  headsAreUnmodified: true,
});

const domainSpan = FORGE_CHANNEL_DOMAIN_MAX - FORGE_CHANNEL_DOMAIN_MIN;

/** One Forge channel, expressed in the head vocabulary. */
export function toOracleHeadInput(observationHistory, channelId, channelSemantics = null) {
  const frames = observationHistory.map((frame) => {
    const raw = frame.channels?.[channelId];
    const channels = {};
    if (Number.isFinite(raw)) {
      channels[ORACLE_HEAD_CHANNEL_NAME] = Number(((raw - FORGE_CHANNEL_DOMAIN_MIN) / domainSpan).toFixed(6));
    }
    return { tick: frame.tick, channels };
  });

  const input = { observationHistory: frames };
  if (channelSemantics !== null) {
    input.channelSemantics = {
      [ORACLE_HEAD_CHANNEL_NAME]: {
        threshold: Number(((channelSemantics.threshold - FORGE_CHANNEL_DOMAIN_MIN) / domainSpan).toFixed(6)),
        polarity: channelSemantics.polarity,
      },
    };
  }
  return input;
}
