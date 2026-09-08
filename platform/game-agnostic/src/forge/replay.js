/* Sentinel Forge World — replay / training record.
 *
 * One record is everything needed to reconstruct a single decision: the state it
 * was made from, what was legal, what Sentinel said, what the world says is true,
 * and the provenance that binds those together.
 *
 * Identity rules, both enforced by tests rather than convention:
 *
 *   - NO ABSOLUTE FILESYSTEM PATH may appear in semantic identity. A record
 *     produced in two checkouts of the same commit must be byte-identical, which
 *     is the Stage 2M property applied to training data.
 *   - The record's own hash is SELF-EXCLUDING: a document cannot contain its own
 *     hash, so recordHash is computed over every field except recordHash.
 */

import { sha256 } from '../core/determinism.js';
import { FORGE_REWARD_VERSION, FORGE_WORLD_VERSION } from './contract.js';
import { FORGE_CURRICULUM_VERSION, FORGE_SCENARIO_VERSION } from './scenarios.js';
import { FORGE_KERNEL_VERSION, hashWorld, topologyHash } from './kernel.js';
import { FORGE_ORACLE_VERSION, counterfactualDigest } from './counterfactual.js';
import { FORGE_VALIDATOR_VERSION } from './validators.js';

export const FORGE_REPLAY_SCHEMA_VERSION = 1;
export const FORGE_REPLAY_RECORD_VERSION = 'FORGE_REPLAY_V1';

const ABSOLUTE_PATH_PATTERN = /(^|["'\s:])(\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\)/;

/**
 * Build one replay record.
 *
 * `sentinel` is optional: a record can be produced with no Sentinel evaluation at
 * all (pure world truth, which is what a dataset export mostly needs), and the
 * absence is recorded as null rather than as an empty object pretending to be a
 * result.
 */
export function buildReplayRecord({
  world,
  scenario,
  counterfactuals,
  validation,
  sentinel = null,
  executedActionKey = null,
  resultingState = null,
}) {
  const body = {
    recordVersion: FORGE_REPLAY_RECORD_VERSION,
    schemaVersion: FORGE_REPLAY_SCHEMA_VERSION,
    simulatorVersion: FORGE_WORLD_VERSION,
    kernelVersion: FORGE_KERNEL_VERSION,

    scenarioFamily: scenario.family,
    scenarioLevel: scenario.level,
    scenarioSeed: scenario.scenarioSeed,
    scenarioSurface: scenario.surface,

    state: {
      tick: world.tick,
      worldHash: hashWorld(world),
      topologyHash: topologyHash(world),
      entityCount: world.entities.length,
      relationCount: world.relations.length,
      objectives: world.objectives.map((objective) => ({ ...objective })),
      energy: world.constraints.energy ?? 0,
    },
    legalActions: counterfactuals.branches.map((branch) => ({
      actionKey: branch.actionKey,
      actionType: branch.action.actionType,
      targetId: branch.action.target === null ? null : branch.action.target.id,
      parameters: branch.action.parameters,
    })),
    legalActionCount: counterfactuals.branchCount,

    /* What Sentinel said, kept strictly separate from what the world says. The
     * two must never be merged into one "answer" field: the whole value of the
     * record is that a reader can tell them apart. */
    sentinel: sentinel === null ? null : {
      router: sentinel.router ?? null,
      expertEvidence: sentinel.expertEvidence ?? null,
      primeRecommendation: sentinel.primeRecommendation ?? null,
    },

    counterfactuals: counterfactuals.branches.map((branch) => ({
      actionKey: branch.actionKey,
      actionType: branch.action.actionType,
      nextStateHash: branch.resultingStateHash,
      horizonStateHash: branch.horizonStateHash,
      rewardVector: branch.totalRewardVector,
      immediateRewardVector: branch.immediateRewardVector,
      scalarReward: branch.totalScalar,
      terminal: branch.terminal,
      outcome: branch.outcome,
    })),
    optimalActionKey: counterfactuals.optimalActionKey,
    optimalUtility: counterfactuals.optimalScalar,
    utilitySpread: counterfactuals.utilitySpread,
    exactTie: counterfactuals.exactTie,
    tieCount: counterfactuals.tieCount,

    executedActionKey,
    resultingStateHash: resultingState === null ? null : hashWorld(resultingState),

    admission: {
      validatorVersion: validation.validatorVersion,
      admitted: validation.valid,
      checks: validation.checks.map((check) => ({ check: check.check, holds: check.holds })),
    },

    provenance: {
      worldHash: hashWorld(world),
      topologyHash: topologyHash(world),
      configHash: sha256({ family: scenario.family, level: scenario.level, seed: scenario.scenarioSeed }),
      counterfactualDigest: counterfactualDigest(counterfactuals),
      rewardVersion: FORGE_REWARD_VERSION,
      curriculumVersion: FORGE_CURRICULUM_VERSION,
      scenarioVersion: FORGE_SCENARIO_VERSION,
      validatorVersion: FORGE_VALIDATOR_VERSION,
      oracleVersion: FORGE_ORACLE_VERSION,
      continuationPolicy: counterfactuals.continuationPolicy,
      codeVersion: FORGE_WORLD_VERSION,
    },
  };
  return Object.freeze({ ...body, recordHash: sha256(body) });
}

/** Recompute the self-excluding hash. Returns true when the record is intact. */
export function verifyReplayRecord(record) {
  const { recordHash, ...body } = record;
  return sha256(body) === recordHash;
}

/**
 * Scan a record for absolute filesystem paths.
 *
 * Not a formality: an absolute path in a training record makes the dataset
 * machine-specific, which is exactly the defect Stage 2M spent a whole stage
 * removing from the runtime. It would be worse here, because a dataset outlives
 * the machine that produced it.
 */
export function findAbsolutePaths(record) {
  const found = [];
  const walk = (value, path) => {
    if (typeof value === 'string') {
      if (ABSOLUTE_PATH_PATTERN.test(value)) found.push({ path, value });
      return;
    }
    if (Array.isArray(value)) { value.forEach((entry, index) => walk(entry, `${path}[${index}]`)); return; }
    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (ABSOLUTE_PATH_PATTERN.test(key)) found.push({ path: `${path}.${key}`, value: key });
        walk(entry, `${path}.${key}`);
      }
    }
  };
  walk(record, '$');
  return found;
}

/** Identity of a whole replay set, order-independent. */
export function replaySetDigest(records) {
  return sha256([...records.map((record) => record.recordHash)].sort());
}
