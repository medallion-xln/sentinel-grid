import { CONTRACT_VERSION } from '../../core/constants.js';
import { actionKey } from '../../core/contracts.js';
import { createSeededRandom, randomInt } from '../../core/determinism.js';
import { defineAdapter } from '../../sdk/define-adapter.js';

const GAME_ID = 'reference-grid-rescue';
const SCHEMA_ID = 'reference-grid-rescue/observation';
const OBSERVER = 'controller';

function assertObserver(observerId) {
  if (observerId !== OBSERVER) throw new Error(`Unknown observer: ${observerId}`);
}

function terminal(state) {
  return state.turn >= state.maxTurns || state.sites.every((site) => site.rescued);
}

function legalFor(state, observerId) {
  assertObserver(observerId);
  if (terminal(state)) return [];
  const actions = [];
  const unknown = state.sites.filter((site) => !site.known);
  if (unknown.length > 0 && state.energy >= 1) {
    actions.push({
      actionId: 'reference.grid-rescue/scan',
      actorId: observerId,
      target: null,
      parameters: { energyCost: 1 },
      metadata: { category: 'information' },
    });
  }
  for (const site of state.sites.filter((candidate) => candidate.known && !candidate.rescued)) {
    if (state.energy >= 2) {
      actions.push({
        actionId: 'reference.grid-rescue/assist',
        actorId: observerId,
        target: { kind: 'site', id: site.id },
        parameters: { energyCost: 2 },
        metadata: { category: 'rescue' },
      });
    }
  }
  actions.push({
    actionId: 'reference.grid-rescue/rest',
    actorId: observerId,
    target: null,
    parameters: { energyGain: 2 },
    metadata: { category: 'recovery' },
  });
  return actions;
}

export const referenceRescueAdapter = defineAdapter({
  manifest() {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      adapterId: 'reference-grid-rescue-adapter',
      adapterVersion: '1.0.0',
      deterministic: true,
      observationSchemas: [
        { schemaId: SCHEMA_ID, schemaVersion: 1, variableSize: true },
      ],
      capabilities: {
        imperfectInformation: true,
        stochasticTransitions: true,
        simultaneousActions: false,
        variableObservationSize: true,
      },
      authority: { tier: 'R0', executionInterface: false },
      metadata: { purpose: 'second structurally different Adapter SDK proof' },
    };
  },

  initialState(seed = 1n) {
    const random = createSeededRandom(seed);
    return {
      turn: 0,
      maxTurns: 5,
      energy: 3,
      sites: [
        { id: 'north', known: true, rescued: false, risk: randomInt(random, 1, 4) },
        { id: 'east', known: false, rescued: false, risk: randomInt(random, 1, 4) },
        { id: 'south', known: false, rescued: false, risk: randomInt(random, 1, 4) },
      ],
    };
  },

  cloneState(state) {
    return structuredClone(state);
  },

  observe(state, observerId) {
    assertObserver(observerId);
    const knownSites = state.sites.filter((site) => site.known);
    const features = [state.turn, state.maxTurns, state.energy, knownSites.length];
    for (const site of knownSites) features.push(site.risk, site.rescued ? 1 : 0);
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      schemaId: SCHEMA_ID,
      schemaVersion: 1,
      observerId,
      sequence: state.turn,
      features,
      featureShape: [features.length],
      metadata: {
        informationModel: 'partial-information',
        knownSiteIds: knownSites.map((site) => site.id),
      },
    };
  },

  legalActions(state, observerId) {
    return legalFor(state, observerId);
  },

  step(state, action, { observerId, random }) {
    assertObserver(observerId);
    const legal = legalFor(state, observerId);
    if (!new Set(legal.map(actionKey)).has(actionKey(action))) throw new Error('Illegal action');

    const events = [];
    let reward = 0;
    if (action.actionId === 'reference.grid-rescue/scan') {
      state.energy -= action.parameters.energyCost;
      const unknown = state.sites.filter((site) => !site.known);
      const selected = unknown[Math.floor(random() * unknown.length)];
      selected.known = true;
      reward = 0.05;
      events.push({ type: 'site-discovered', siteId: selected.id });
    } else if (action.actionId === 'reference.grid-rescue/assist') {
      state.energy -= action.parameters.energyCost;
      const site = state.sites.find((candidate) => candidate.id === action.target.id);
      site.rescued = true;
      reward = site.risk / 3;
      events.push({ type: 'site-rescued', siteId: site.id, risk: site.risk });
    } else {
      state.energy = Math.min(5, state.energy + action.parameters.energyGain);
      reward = -0.02;
      events.push({ type: 'energy-restored', energy: state.energy });
    }
    state.turn += 1;

    return {
      state,
      reward,
      terminal: terminal(state),
      events,
      info: { appliedActionKey: actionKey(action) },
    };
  },

  isTerminal(state) {
    return terminal(state);
  },

  outcome(state, observerId) {
    assertObserver(observerId);
    const rescuedRisk = state.sites.filter((site) => site.rescued).reduce((sum, site) => sum + site.risk, 0);
    const totalRisk = state.sites.reduce((sum, site) => sum + site.risk, 0);
    return {
      scalar: totalRisk === 0 ? 0 : rescuedRisk / totalRisk,
      terminal: terminal(state),
      vector: {
        rescuedSites: state.sites.filter((site) => site.rescued).length,
        rescuedRisk,
        remainingEnergy: state.energy,
      },
      metadata: { objective: 'rescue the highest total risk before the horizon' },
    };
  },
});
