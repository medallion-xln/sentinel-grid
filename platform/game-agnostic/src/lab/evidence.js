import os from 'node:os';
import { CONTRACT_VERSION, KERNEL_VERSION } from '../core/constants.js';
import { deepFreeze, sha256 } from '../core/determinism.js';

export const DETERMINISTIC_EVIDENCE_VERSION = 7;
export const EXECUTION_DIAGNOSTICS_VERSION = 1;

const CHECK_DIAGNOSTIC_KEYS = new Set([
  'durationMs',
  'startedAt',
  'finishedAt',
  'completedAt',
  'generatedAt',
  'timestamp',
  'runtime',
  'node',
  'platform',
  'arch',
  'hostname',
  'pid',
  'cwd',
  'localPath',
  'absolutePath',
  'memoryUsage',
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Removes execution-only fields from conformance check details.
 * Adapter manifests and game-defined packets are not passed through this
 * function, so game metadata remains intact.
 */
export function stripExecutionDiagnostics(value) {
  if (Array.isArray(value)) return value.map(stripExecutionDiagnostics);
  if (!isPlainObject(value)) return value;

  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (CHECK_DIAGNOSTIC_KEYS.has(key)) continue;
    output[key] = stripExecutionDiagnostics(value[key]);
  }
  return output;
}

export function buildAdapterDeterministicEvidence(report) {
  if (!report || typeof report !== 'object') throw new TypeError('report must be an object');
  if (!Array.isArray(report.checks)) throw new TypeError('report.checks must be an array');

  const payload = {
    evidenceVersion: DETERMINISTIC_EVIDENCE_VERSION,
    adapter: report.adapter ?? null,
    certification: report.certification ? stripExecutionDiagnostics(report.certification) : null,
    pass: Boolean(report.pass),
    checks: report.checks.map((check) => stripExecutionDiagnostics(check)),
  };

  return deepFreeze({
    ...payload,
    deterministicEvidenceHash: sha256(payload),
  });
}

export function buildDeterministicEvidence(reports, {
  kernelVersion = KERNEL_VERSION,
  kernelScope = 'game-agnostic',
  authority = 'R0',
} = {}) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new TypeError('reports must be a non-empty array');
  }

  const canonicalReports = reports.map(buildAdapterDeterministicEvidence);
  const payload = {
    evidenceVersion: DETERMINISTIC_EVIDENCE_VERSION,
    contractVersion: CONTRACT_VERSION,
    kernelVersion,
    kernelScope,
    authority,
    pass: canonicalReports.every((report) => report.pass),
    evidenceReportCount: canonicalReports.length,
    checkCount: canonicalReports.reduce((sum, report) => sum + report.checks.length, 0),
    failedCheckCount: canonicalReports.reduce(
      (sum, report) => sum + report.checks.filter((check) => !check.pass).length,
      0,
    ),
    reports: canonicalReports,
  };

  return deepFreeze({
    ...payload,
    deterministicEvidenceHash: sha256(payload),
  });
}

function finiteDuration(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function defaultRuntime() {
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    pid: process.pid,
  };
}

export function buildExecutionDiagnostics(reports, {
  deterministicEvidenceHash,
  runtime = defaultRuntime(),
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new TypeError('reports must be a non-empty array');
  }
  if (typeof deterministicEvidenceHash !== 'string' || !/^[a-f0-9]{64}$/.test(deterministicEvidenceHash)) {
    throw new TypeError('deterministicEvidenceHash must be a SHA-256 hex string');
  }

  const adapterReports = reports.map((report) => {
    const checkDurations = report.checks.map((check) => ({
      name: check.name,
      durationMs: finiteDuration(check.durationMs),
    }));
    const finiteDurations = checkDurations
      .map((entry) => entry.durationMs)
      .filter((duration) => duration !== null);

    return {
      gameId: report.adapter?.gameId ?? null,
      adapterId: report.adapter?.adapterId ?? null,
      pass: Boolean(report.pass),
      totalDurationMs: Number(finiteDurations.reduce((sum, duration) => sum + duration, 0).toFixed(3)),
      checkDurations,
    };
  });

  if (typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) {
    throw new TypeError('generatedAt must be an ISO-compatible date-time string');
  }
  const runtimeSnapshot = structuredClone(runtime);

  const payload = {
    diagnosticsVersion: EXECUTION_DIAGNOSTICS_VERSION,
    deterministicEvidenceHash,
    generatedAt,
    runtime: runtimeSnapshot,
    adapterReports,
  };

  return deepFreeze({
    ...payload,
    executionReportHash: sha256(payload),
  });
}

export function createVerificationReport(reports, options = {}) {
  const deterministicEvidence = buildDeterministicEvidence(reports, options);
  const executionDiagnostics = buildExecutionDiagnostics(reports, {
    deterministicEvidenceHash: deterministicEvidence.deterministicEvidenceHash,
    runtime: options.runtime,
    generatedAt: options.generatedAt,
  });

  return deepFreeze({
    pass: deterministicEvidence.pass,
    evidenceReportCount: deterministicEvidence.evidenceReportCount,
    // Backward-compatible alias for callers that treated reports as adapters.
    adapterCount: deterministicEvidence.evidenceReportCount,
    checkCount: deterministicEvidence.checkCount,
    failedCheckCount: deterministicEvidence.failedCheckCount,
    deterministicEvidenceHash: deterministicEvidence.deterministicEvidenceHash,
    executionReportHash: executionDiagnostics.executionReportHash,
    deterministicEvidence,
    executionDiagnostics,
  });
}
