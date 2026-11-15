// Final assembly: reruns lane tests and the full observer audit live, reads the exclusive evidence files, and writes
// evidence/observer-audit.json, evidence/exit-matrix.json, RESULT.json and RESULT.txt (all exclusive). No new gameplay.
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { LANE, readJson, writeExclusive, assertSoleWriter, verifyInheritance, laneClosure, rawHash, ROSTER } from './guard.mjs';
import { GAMES } from './arms.mjs';
import { auditObserver } from './observer.mjs';
import { DEV_SEEDS, DEV_FAMILY } from './population.mjs';
import { buildProtocol, protocolHash } from './protocol.mjs';

const E = (f) => resolve(LANE, 'evidence', f);
function existingTests() {
  const dir = E('existing-tests'), out = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.tap'))) { const t = readFileSync(resolve(dir, f), 'utf8'); out[f] = { pass: +(t.match(/^# pass (\d+)/m)?.[1] ?? 0), fail: +(t.match(/^# fail (\d+)/m)?.[1] ?? 0) }; }
  return { suites: out, pass: Object.values(out).reduce((n, x) => n + x.pass, 0), fail: Object.values(out).reduce((n, x) => n + x.fail, 0) };
}
function laneTests() {
  let tap; try { tap = execFileSync(process.execPath, ['--test', '--test-reporter=tap', resolve(LANE, 'tests.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { tap = e.stdout ?? ''; }
  return { pass: +(tap.match(/^# pass (\d+)/m)?.[1] ?? 0), fail: +(tap.match(/^# fail (\d+)/m)?.[1] ?? 0), failed: [...tap.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1]) };
}

export function exitMatrix(dev, ex, protocolSha) {
  const nx = dev.summary.nexus, cov = nx.adapter.decisions ? nx.adapter.changed / nx.adapter.decisions : null;
  const devNote = `development fixtures only (${dev.seeds.length} seeds x 3 tiers + 4 factory stress strata): Nexus adapter changed ${nx.adapter.changed}/${nx.adapter.decisions} decisions; v31 Nexus fired ${nx.v31.fired}/${nx.v31.decisions}`;
  const row = (dimension, forgeWorld, ascii, status, needed) => ({ dimension, forgeWorldDomain: forgeWorld, asciiTestability: ascii, statuses: status, newEvidenceRequired: needed, developmentObservation: devNote });
  return {
    schema: 'STAGE3H_ASCII_EXIT_MATRIX_V1', protocolSha256: protocolSha, statusVocabulary: ['PROVEN_IN_EXISTING_FROZEN_DOMAIN', 'STRUCTURALLY_TESTABLE_IN_ASCII', 'NOT_TESTABLE_IN_ASCII', 'REQUIRES_NEW_PROSPECTIVE_EVIDENCE', 'QUALIFIED_BY_NEW_EVIDENCE'],
    noAutomaticTransfer: 'Forge World findings are not transferred to ASCII; ASCII development fixtures are not qualification evidence.',
    decisionCoverageDev: cov,
    rows: [
      row('1. Expert marginal decision value', 'Nexus at H0 inside the frozen rule: confirmed in registered 3H.1-D/F confirmations (PROVEN_IN_EXISTING_FROZEN_DOMAIN for that bounded rule; sealed V3 qualification not executed)', 'Nexus/factory only, via P1 (declared adapter over strongest native) and P3 (existing v31 path); every other expert-game pairing is INAPPLICABLE or NOT_IMPLEMENTED (expert-applicability.json)', ['STRUCTURALLY_TESTABLE_IN_ASCII', 'REQUIRES_NEW_PROSPECTIVE_EVIDENCE'], 'HOLDOUT A/B P1 and P3'),
      row('2. Complementarity', 'Nexus/S0 by declared horizon confirmed; S0 is a comparator, not an expert', 'Only one expert (Nexus) has any ASCII action authority, so expert-expert complementarity is NOT_TESTABLE_IN_ASCII. Nexus-plus-native-planner composition is measured by P1 and must not be reported as multi-expert complementarity', ['NOT_TESTABLE_IN_ASCII'], 'a second action-bound expert would be required (none exists; none created)'),
      row('3. Horizon-stratified competence', 'H0/H2 declared bands: confirmed for the fixed rule', 'ASCII games declare no planning-horizon bands; only public time-remaining labels (fighter timeLeft, rescue/factory/roguelike ticksRemaining, cards deckRemaining) exist. Decision coverage by EARLY/MIDDLE/LATE band is descriptive; it is not horizon competence', ['NOT_TESTABLE_IN_ASCII'], 'none possible without a source-declared horizon contract'),
      row('4. Regime-specific competence', 'OBSERVED_THREAT / NO_OBSERVED_THREAT proposed bounded scope (unapproved)', 'Observable regime labels exist for 7 games, but the only action-bound expert (Nexus/factory) can act only when a REPAIR is offered, i.e. only under OBSERVED_DISRUPTION; the regime contrast is degenerate by construction. Controller (not expert) competence by regime is descriptive (S3)', ['NOT_TESTABLE_IN_ASCII'], 'descriptive coverage only'),
      row('5. Ablation value', 'Nexus removal lost coverage (development); sealed not executed', 'Exact ablation SENTINEL_V31_AS_IS vs V31_FALLBACK_ABLATION (P2) and adapter vs its own fallback (P1)', ['STRUCTURALLY_TESTABLE_IN_ASCII', 'REQUIRES_NEW_PROSPECTIVE_EVIDENCE'], 'HOLDOUT A/B P2'),
      row('6. Prime synthesis value', 'experimental synthesis identical to Nexus on 218/218 rows; incumbent NOT_TESTABLE', 'Incumbent ROOT-PUCT needs known-simulator successors (parity violation) and exists only on the ASCII 2.0 engine; no Prime synthesis interface over ASCII packets. Not invented', ['NOT_TESTABLE_IN_ASCII'], 'none without a lawful public-information Prime interface'),
      row('7. False-selection harm', 'zero introduced catastrophes observed in 3H.1-D/F (structural at H2, empirical at H0)', 'Native catastrophic flag in every game; introduced-catastrophe veto with Clopper-Pearson bound, plus inferiority test, for every Sentinel arm', ['STRUCTURALLY_TESTABLE_IN_ASCII', 'REQUIRES_NEW_PROSPECTIVE_EVIDENCE'], 'HOLDOUT A/B catastrophe veto'),
    ],
    qualifiedByNewEvidence: [],
    fullStage3hCertified: false, boundedAsciiQualification: 'NOT_YET_EVALUATED (protocol proposed, not registered or executed)',
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assertSoleWriter(); const inh = verifyInheritance();
  const dev = readJson(E('dev-run.json')), ex = readJson(E('expert-applicability.json')), inv = readJson(E('inventory.json')), prot = readJson(E('protocol.json'));
  if (protocolHash(buildProtocol()) !== prot.protocolSha256) throw Error('PROTOCOL_SOURCE_CHANGED_AFTER_WRITE');
  const audits = []; for (const g of GAMES) for (const t of [1, 2, 3]) for (const s of DEV_SEEDS) audits.push(auditObserver(g, t, s, DEV_FAMILY));
  const auditOut = { schema: 'STAGE3H_ASCII_OBSERVER_AUDIT_V1', audits: audits.map((a) => ({ ...a })), pass: audits.filter((a) => a.pass).length, total: audits.length };
  writeExclusive(E('observer-audit.json'), auditOut);
  const lane = laneTests(), existing = existingTests(), matrix = exitMatrix(dev, ex, prot.protocolSha256);
  writeExclusive(E('exit-matrix.json'), matrix);
  const eng = dev.summary.engineering, nx = dev.summary.nexus;
  const engChecks = { shadowNonInterference: eng.shadowIdentical === eng.shadowTotal, ablationIdentityWhenSilent: eng.ablationIdenticalWhenSilent === eng.ablationSilentTotal, adapterIdentityWhenSilent: eng.adapterIdenticalWhenSilent === eng.adapterSilentTotal, replay: eng.replayFail === 0, invalidEpisodes: eng.invalid.length };
  const structuralPass = lane.pass + auditOut.pass + Object.values(engChecks).filter((v) => v === true).length, structuralFail = lane.fail + (auditOut.total - auditOut.pass) + Object.values(engChecks).filter((v) => v === false).length;
  const result = { schema: 'STAGE3H_ASCII_BENCHMARK_V1_RESULT', inheritance: { head: inh.head, protectedCount: inh.canonicalProtectedCount, asciiSourcesUnchanged: inh.asciiSourcesUnchanged, extraSourcesUnchanged: inh.extraSourcesUnchanged },
    existingTests: existing, laneTests: lane, observerAudit: { pass: auditOut.pass, total: auditOut.total }, engineeringChecks: engChecks, devNexus: nx, structuralPass, structuralFail,
    protocolSha256: prot.protocolSha256, laneClosure: laneClosure(), evidenceHashes: Object.fromEntries(['inventory.json', 'expert-applicability.json', 'dev-run.json', 'protocol.json', 'observer-audit.json', 'exit-matrix.json'].map((f) => [f, rawHash(E(f))])), authority: 'R0' };
  writeExclusive(resolve(LANE, 'RESULT.json'), result);
  console.log(JSON.stringify({ ...result, laneClosure: result.laneClosure.hash, devNexus: { adapter: nx.adapter, v31: nx.v31 } }, null, 1));
}
