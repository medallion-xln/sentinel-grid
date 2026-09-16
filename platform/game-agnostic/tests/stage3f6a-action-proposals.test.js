import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync } from 'node:fs';

import {
  DECLARED_ACTION_COST_MODEL, DEPLOYABLE_ACTION_PROPOSAL_CONTRACT, DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH,
  DEPLOYABLE_PROPOSAL_PRODUCERS, ProposalStatus, objectiveTargetingProposal, observedThreatStructure,
  proposeAll, randomLegalProposal, resourcePreservingProposal, threatCoveringProposal,
} from '../src/stage3f/deployable-action-proposal-v1.js';
import { STAGE3F6A_PRODUCERS } from '../scripts/generate-stage3f6a-proposals.mjs';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { sha256 } from '../src/core/determinism.js';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const hex = (value) => createHash('sha256').update(value).digest('hex');
const PROPOSALS = 'artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz';
const MANIFEST = 'artifacts/stage3f6a-action-proposals/action-proposals-manifest.json';
const ready = existsSync(file(PROPOSALS)) && existsSync(file(MANIFEST));
const manifest = ready ? JSON.parse(readFileSync(file(MANIFEST), 'utf8')) : null;
const rows = ready ? gunzipSync(readFileSync(file(PROPOSALS))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const certifierSource = readFileSync(file('scripts/certify-stage3f6a-action-proposals.mjs'), 'utf8');

const stage3f6c = JSON.parse(readFileSync(file('artifacts/stage3f6c-deployable-router/stage3f6c-certification-result.json'), 'utf8'));
const stage3f6s = JSON.parse(readFileSync(file('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'), 'utf8'));

/** A real decision point, rebuilt deterministically. */
function decisionPoint(index = 0) {
  const seeds = [401, 402, 403];
  for (const seed of seeds) {
    for (const shape of ['tree', 'chain', 'mesh', 'star', 'layers']) {
      try {
        const built = buildRecordV2({ shape, roles: 'populated', objectives: 'supply_and_defend',
          horizonBand: 'H0', level: 3, seed }, false);
        if (!built.admitted) continue;
        const state = forgeAdapterState(built.world);
        const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
        const legalActions = forgeLegalActions(state.world).map((a) => ({
          actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null,
        }));
        if (legalActions.length === 0) continue;
        if (index-- > 0) continue;
        return { built, state, observation, legalActions };
      } catch { /* invalid axis combination; try the next */ }
    }
  }
  return null;
}

/* ---------------- A. contract ---------------- */

test('1. the proposal contract declares every required field', () => {
  for (const field of ['proposalId', 'producerId', 'action', 'confidence', 'provenance',
    'requiredCapabilities', 'decisionTime', 'epistemicBasis']) {
    assert.ok(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.requiredProposalFields.includes(field), field);
  }
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.contractId, 'SENTINEL_DEPLOYABLE_ACTION_PROPOSAL_V1');
  assert.equal(typeof DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH, 'string');
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH.length, 64);
});

test('2. contract hash is invariant to key order', () => {
  const reorder = (value) => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort().reverse()) out[key] = reorder(value[key]);
      return out;
    }
    return value;
  };
  assert.equal(sha256(reorder(JSON.parse(JSON.stringify(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT)))),
    DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH);
});

test('3. every producer objective is distinct — no reward maximiser under another name', () => {
  const objectives = DEPLOYABLE_PROPOSAL_PRODUCERS.map((p) => p.objective);
  assert.equal(new Set(objectives).size, objectives.length);
  assert.equal(objectives.includes('MAXIMIZE_IMMEDIATE_TRANSITION_VALUE'), false);
});

test('4. no deployable producer requires simulator, V2B, rollout, or future information', () => {
  for (const producer of STAGE3F6A_PRODUCERS.filter((p) => p.deployable)) {
    assert.equal(producer.requiresSimulator, false, producer.id);
    assert.equal(producer.requiresV2B, false, producer.id);
    assert.equal(producer.requiresMultiStepRollout, false, producer.id);
    assert.equal(producer.requiresFutureInformation, false, producer.id);
    assert.equal(producer.availableInGeneralEnvironment, true, producer.id);
  }
});

test('5. non-deployable producers are inventoried with an explicit exclusion reason', () => {
  for (const producer of STAGE3F6A_PRODUCERS.filter((p) => p.evaluated === false)) {
    assert.ok(producer.exclusionReason && producer.exclusionReason.length > 0, producer.id);
  }
  const prime = STAGE3F6A_PRODUCERS.find((p) => p.id === 'PRIME_ROOT_PUCT');
  assert.equal(prime.requiresMultiStepRollout, true);
  assert.equal(prime.deployable, false);
  const v2b = STAGE3F6A_PRODUCERS.find((p) => p.id === 'V2B');
  assert.equal(v2b.requiresV2B, true);
  assert.equal(v2b.deployable, false);
});

/* ---------------- B. abstention is never a fabricated action ---------------- */

test('6. a producer with no legal actions abstains rather than inventing one', () => {
  for (const produce of [resourcePreservingProposal, objectiveTargetingProposal, threatCoveringProposal, randomLegalProposal]) {
    const proposal = produce({ observation: { metadata: { canonicalState: { entities: [], relationships: [] }, worldHash: 'a'.repeat(64) } }, legalActions: [] });
    assert.equal(proposal.status, ProposalStatus.ABSTAIN);
    assert.equal(proposal.action, null);
    assert.equal(proposal.confidence, 0);
    assert.ok(proposal.abstainReason);
  }
});

test('7. an unknown action cost abstains instead of assuming zero', () => {
  const proposal = resourcePreservingProposal({ legalActions: [{ actionId: 'a'.repeat(64), actionType: 'NOT_A_DECLARED_TYPE', targetEntityId: null }] });
  assert.equal(proposal.status, ProposalStatus.ABSTAIN);
  assert.equal(proposal.action, null);
  assert.match(proposal.abstainReason, /ACTION_COST_UNKNOWN/);
  assert.equal(DECLARED_ACTION_COST_MODEL.unknownCostPolicy, 'ABSTAIN_RATHER_THAN_ASSUME_ZERO');
});

/* ---------------- C. policy behaviour ---------------- */

test('8. the declared action cost model matches observed energy deltas', () => {
  const point = decisionPoint();
  assert.ok(point, 'no decision point could be rebuilt');
  const descriptors = forgeWorldAdapter.legalActions(point.state, FORGE_OBSERVER_ID);
  const actions = forgeLegalActions(point.state.world);
  let verified = 0;
  for (let i = 0; i < actions.length; i += 1) {
    const before = point.state.world.constraints.energy ?? 0;
    const isolated = forgeWorldAdapter.cloneState(point.state);
    const result = forgeWorldAdapter.step(isolated, descriptors[i], { observerId: FORGE_OBSERVER_ID });
    const delta = before - (result.state.world.constraints.energy ?? 0);
    const declared = DECLARED_ACTION_COST_MODEL.cost[actions[i].actionType];
    assert.equal(declared, delta, `${actions[i].actionType}: declared ${declared} but observed ${delta}`);
    verified += 1;
  }
  assert.ok(verified > 0);
});

test('9. RESOURCE_PRESERVING selects a minimum declared-cost action', () => {
  const point = decisionPoint();
  const proposal = resourcePreservingProposal({ legalActions: point.legalActions });
  assert.equal(proposal.status, ProposalStatus.PROPOSED);
  const costs = point.legalActions.map((a) => DECLARED_ACTION_COST_MODEL.cost[a.actionType]);
  const chosenCost = DECLARED_ACTION_COST_MODEL.cost[proposal.action.actionType];
  assert.equal(chosenCost, Math.min(...costs));
  assert.equal(proposal.usesSimulator, false);
  assert.equal(proposal.usesFutureInformation, false);
});

test('10. OBJECTIVE_TARGETING only proposes actions on observed critical entities', () => {
  const point = decisionPoint();
  const proposal = objectiveTargetingProposal({ observation: point.observation, legalActions: point.legalActions });
  const structure = observedThreatStructure(point.observation.metadata.canonicalState);
  if (proposal.status === ProposalStatus.PROPOSED) {
    assert.ok(structure.criticalIds.has(proposal.action.targetEntityId), 'proposed a non-critical target');
  } else {
    assert.match(proposal.abstainReason, /CRITICAL_ENTITY|NO_LEGAL_ACTIONS/);
  }
});

test('11. THREAT_COVERING only proposes actions on observed unsupported threats', () => {
  const point = decisionPoint();
  const proposal = threatCoveringProposal({ observation: point.observation, legalActions: point.legalActions });
  const structure = observedThreatStructure(point.observation.metadata.canonicalState);
  if (proposal.status === ProposalStatus.PROPOSED) {
    assert.ok(structure.unsupportedThreatened.has(proposal.action.targetEntityId));
  } else {
    assert.match(proposal.abstainReason, /UNSUPPORTED_THREAT|NO_LEGAL_ACTIONS/);
  }
});

test('12. every producer is deterministic', () => {
  const point = decisionPoint();
  const a = proposeAll({ observation: point.observation, legalActions: point.legalActions });
  const b = proposeAll({ observation: point.observation, legalActions: point.legalActions });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('13. RANDOM_LEGAL abstains without an observed digest rather than guessing', () => {
  const point = decisionPoint();
  const withoutDigest = randomLegalProposal({ observation: { metadata: {} }, legalActions: point.legalActions });
  assert.equal(withoutDigest.status, ProposalStatus.ABSTAIN);
  assert.match(withoutDigest.abstainReason, /DETERMINISTIC_SEED/);
});

test('14. proposals never carry simulator, rollout, V2B or future-information flags', () => {
  const point = decisionPoint();
  for (const proposal of proposeAll({ observation: point.observation, legalActions: point.legalActions })) {
    assert.equal(proposal.usesSimulator, false, proposal.producerId);
    assert.equal(proposal.usesMultiStepRollout, false, proposal.producerId);
    assert.equal(proposal.usesV2B, false, proposal.producerId);
    assert.equal(proposal.usesFutureInformation, false, proposal.producerId);
    assert.equal(proposal.decisionTime, true, proposal.producerId);
  }
});

/* ---------------- D. artifact integrity ---------------- */

test('15. the proposals artifact matches its manifest and covers the corpus', () => {
  assert.ok(ready, 'run npm run stage3f6a:generate first');
  const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  assert.equal(hex(content), manifest.contentHash);
  const corpusManifest = JSON.parse(readFileSync(file('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json'), 'utf8'));
  assert.equal(manifest.sourceCorpusHash, corpusManifest.contentHash);
  assert.ok(rows.length >= corpusManifest.admitted * 0.98,
    `proposals cover only ${rows.length} of ${corpusManifest.admitted} corpus rows`);
});

test('16. every proposal row records an action or an explicit null for each producer', () => {
  for (const row of rows.slice(0, 500)) {
    for (const producer of STAGE3F6A_PRODUCERS.filter((p) => p.evaluated !== false).map((p) => p.id)) {
      assert.ok(Object.hasOwn(row.chosen, producer), `${row.recordHash} missing ${producer}`);
      const chosen = row.chosen[producer];
      assert.ok(chosen === null || typeof chosen === 'string');
      if (chosen === null) assert.equal(row.correct[producer], null);
      else assert.ok(row.correct[producer] === 0 || row.correct[producer] === 1);
    }
  }
});

/* ---------------- E. discipline ---------------- */

test('17. sealed partitions are unreachable until the policy freeze is written', () => {
  assert.match(certifierSource, /SEALED_PARTITION_ACCESS_BEFORE_FREEZE/);
  const freezeIndex = certifierSource.indexOf('policyFreeze = { ...freezePayload');
  const holdoutIndex = certifierSource.indexOf("partitionRows('HOLDOUT')");
  const oodIndex = certifierSource.indexOf("partitionRows('OOD')");
  assert.ok(freezeIndex > 0 && holdoutIndex > freezeIndex, 'HOLDOUT opened before the freeze');
  assert.ok(oodIndex > freezeIndex, 'OOD opened before the freeze');
});

test('18. no router is trained and no threshold is tuned in this stage', () => {
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.routerTrainedInThisStage, false);
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.thresholdsTunedInThisStage, false);
  assert.equal(/fitLogisticRegression/.test(certifierSource), false, 'the certifier fits a model');
  assert.equal(/selectTiers/.test(certifierSource), false, 'the certifier evaluates routing tiers');
});

test('19. the acceptance rule is established on DEV/CAL only', () => {
  assert.match(certifierSource, /establishedOn: 'DEV_CAL_ONLY'/);
  assert.match(certifierSource, /STRICTLY_BETTER_THAN_RANDOM_LEGAL_CONTROL/);
});

test('20. prior certifications remain intact', () => {
  assert.equal(stage3f6c.status, 'PASS');
  assert.equal(stage3f6c.certificationHash, '40ae3b415eeca2c1774a5f4ce2e2904bb189d4d83f98f26c1614eccce5dd0051');
  assert.equal(stage3f6s.status, 'PASS');
  assert.equal(stage3f6c.capabilityLimitation.CORE_CAN_COMPUTE_GREEDY_ACTION, false);
});

test('21. authority stays R0, shadow-only, non-dispatching', () => {
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.tier, 'R0');
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.canDispatch, false);
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.canMutateLiveWorld, false);
  assert.equal(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT.authority.shadowOnly, true);
  assert.equal(/canDispatch:\s*true/.test(certifierSource), false);
});

test('22. importing the generator does not trigger a corpus pass', () => {
  // The certifier imports the producer inventory from the generator; an unguarded top-level
  // main() would silently re-run a full 20,000-record generation on import.
  const generatorSource = readFileSync(file('scripts/generate-stage3f6a-proposals.mjs'), 'utf8');
  assert.match(generatorSource, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/);
  assert.ok(Array.isArray(STAGE3F6A_PRODUCERS) && STAGE3F6A_PRODUCERS.length > 0);
});
