/* Sentinel Forge World — FORGE_DATASET_V2 lineage.
 *
 * A SUPERSEDING lineage, not a replacement. FORGE_DATASET_V1 — the Stage 3B
 * corpus, its 70,804 records, its splits and its certification — is immutable and
 * still reproduces from its own artifacts. V2 records what changed and why, so a
 * later reader can tell the two apart without having to diff them.
 *
 * The prompt builder and the three exporters are REUSED from the V1 module rather
 * than reimplemented: the supervision routing rules (a unique optimum gets one
 * completion; an equivalence names every equal optimum; no preference pair is ever
 * emitted between actions the world scores the same) are unchanged, and copying
 * them would create two places for them to drift apart. Only the tagging and the
 * split assignment are V2's own.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import {
  FORGE_DATASET_VERSION as FORGE_DATASET_V1_VERSION, OOD_SPEC,
  buildPrompt, exportPreferenceV2, exportRlV2, exportSftV2, measureLeakage,
} from './dataset.js';
import { FORGE_WARMUP_VERSION } from './warmup.js';
import { FORGE_ORACLE_SURFACE_VERSION } from './oracle-surface.js';
import { FORGE_SCENARIO_V3_VERSION } from './scenarios-v3.js';

export const FORGE_DATASET_V2_VERSION = 'FORGE_DATASET_V2';
export const FORGE_DATASET_V2_PARENT = FORGE_DATASET_V1_VERSION;
export const FORGE_SPLITS_V2 = Object.freeze(['TRAIN', 'VALIDATION', 'HOLDOUT']);

export const FORGE_DATASET_V2_LINEAGE = deepFreeze({
  version: FORGE_DATASET_V2_VERSION,
  parent: FORGE_DATASET_V2_PARENT,
  parentImmutable: true,
  parentArtifactsModified: false,
  simulatorVersion: FORGE_SCENARIO_V3_VERSION,
  warmupVersion: FORGE_WARMUP_VERSION,
  oracleSurfaceVersion: FORGE_ORACLE_SURFACE_VERSION,
  defectRepaired: 'ORACLE_AXIS_UNREACHABLE',
  secondaryDefectRepaired: 'ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED',
  changeClass: 'CORPUS_CONSTRUCTION',
  changeClassNote:
    'Every difference between V1 and V2 is a property of how the corpus was built. No model was trained, tuned, retuned or replaced, and no expert was modified. A V1-to-V2 difference in any Sentinel measurement is a dataset effect and must be reported as one.',
  differencesFromParent: deepFreeze([
    'decisions are captured after a temporal warm-up instead of at tick 0',
    'the horizon remaining at the decision point is preserved exactly, by calibrating the warm-up before the scenario is declared',
    'the temporal channel is declared across the whole observable timeline instead of 8 to 22 samples',
    'the scenario declares channel threshold semantics, without which the TIME_TO_THRESHOLD head is hard-suppressed',
    'world hashes therefore differ from V1 throughout; splits are recomputed rather than inherited',
  ]),
});

/**
 * Splits, recomputed for this lineage.
 *
 * Assignment is still by topology hash — a structure belongs to exactly one split
 * by construction, which is what keeps near-identical shapes off both sides of the
 * line. The digest is salted with the lineage name so V2 does not silently inherit
 * V1's split identities: the same structure may land in a different split, and any
 * comparison across lineages has to be made deliberately rather than by accident.
 */
export function splitForTopologyV2(topologyDigest) {
  const salted = sha256({ lineage: FORGE_DATASET_V2_VERSION, topologyDigest });
  const bucket = parseInt(salted.slice(0, 8), 16) % 100;
  if (bucket < 80) return 'TRAIN';
  if (bucket < 90) return 'VALIDATION';
  return 'HOLDOUT';
}

/** Every export row carries the lineage, so a training run cannot lose track of it. */
export function tagV2(exported, extra = {}) {
  const lines = exported.content === '' ? [] : exported.content.split('\n');
  const tagged = lines.map((line) => {
    const row = JSON.parse(line);
    row.forge_metadata = {
      ...row.forge_metadata,
      datasetVersion: FORGE_DATASET_V2_VERSION,
      parentDatasetVersion: FORGE_DATASET_V2_PARENT,
      warmupVersion: FORGE_WARMUP_VERSION,
      ...extra,
    };
    return JSON.stringify(row);
  });
  return { ...exported, content: tagged.join('\n'), count: tagged.length };
}

export { OOD_SPEC, buildPrompt, exportPreferenceV2, exportRlV2, exportSftV2, measureLeakage };
