/* AZL - AlphaZero-Light configuration. Single source of truth for paths + tunables.
 * Attach pattern: everything lives on globalThis.AZL (works on main thread, workers, Node). */
(function (g) {
  'use strict';
  var AZL = g.AZL = g.AZL || {};
  AZL.CONFIG = {
    BASE: (g.AZL_BASE || '/azl'),            // frontend module base path (override via window.AZL_BASE)
    API_BASE: (g.AZL_API_BASE || '/api/azl'),// PHP proxy base path
    STATE_SCHEMA_V: 1,
    NORM_V: 1,
    ACTION_SPACE_V: 1,                        // bump when adapter action list changes
    RING_SIZE: 32,                            // temporal snapshots kept for Oracle
    ORACLE_EMB: 16,
    ORACLE_ALARMS: 6,
    RELATIONAL_EMB: 16,
    // Search
    MCTS: {
      cPuct: 1.6, fpu: 0.10, maxNodes: 20000,
      dirichletAlpha: 0.6, dirichletEps: 0.25,
      simBudget: { low: 120, mid: 320, high: 800 },     // per decision, scaled by governor tier
      msBudget:  { low: 25,  mid: 60,  high: 140 },
      temperatureAdvise: 0.0,   // argmax visits for advisor
      temperatureSelfPlay: 1.0, // sample for exploration (annealed by move count in selfplay)
      reuseTree: true
    },
    // Router hard bounds (search retains authority)
    ROUTER: {
      searchMin: 0.50, strategistMax: 0.35, scoutRootMax: 0.20,
      relationalAdjMax: 0.15,      // bounded per-action log-space adjustment
      oracleValueAdjMax: 0.10,     // bounded root-value adjustment
      staleHalfLifeMs: { oracle: 4000, relational: 6000 },
      fusionTemperature: 1.0, epsilon: 1e-6
    },
    // Heuristic safety floor: value = alpha*learned + (1-alpha)*heuristic
    HEURISTIC_FLOOR: { alphaStart: 0.25, alphaMax: 0.85, samplesForMax: 50000 },
    // Replay / sample priority multipliers (configurable per spec)
    PRIORITY: {
      overrideAndWin: 5.0, followAndLose: 4.0, overrideAndLose: 1.5, followAndWin: 1.0,
      confidentWrongBonus: 2.0, noveltyBonus: 1.5, disagreementBonus: 1.5,
      selfPlayBase: 0.7, perSessionCap: 400, perClientDailyCap: 5000
    },
    OUTCOME_HORIZONS: { m5Ticks: 300, m30Ticks: 1800 }, // adapter maps ticks->time
    TRAINING: {
      lr: 1e-3, l2: 1e-4, clipNorm: 5.0, entropyBeta: 0.01,
      batch: 64, stepsPerRound: 40, minTuplesToTrain: 256,
      huberDelta: 1.0, valueHeadWeights: { now: 1.0, m5: 0.7, m30: 0.5, session: 1.0 }
    },
    FEDERATED: {
      deltaClipNorm: 5.0, maxUploadBytes: 4 * 1024 * 1024,
      minClientsToAggregate: 3, maxUpdatesPerRun: 8,
      uploadCooldownMs: 10 * 60 * 1000
    },
    PROMOTION: { minGames: 40, winRateGate: 0.53, lcbGate: 0.50, canaryPct: 10, canaryMinHours: 12 },
    GOVERNOR: {
      frameP95BudgetMs: 22, sampleWindow: 120,
      trainOnlyWhenHiddenOrIdle: true, idleMsBeforeSelfPlay: 15000
    },
    SYNC: { replayBatch: 200, flushMs: 30000 },
    DIAG: { verbose: false }
  };
})(typeof self !== 'undefined' ? self : globalThis);
