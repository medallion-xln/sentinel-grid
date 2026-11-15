// SK1 advisory evidence for Forge World — contract SK1_ADVISORY_EVIDENCE_V1.
// Expert outputs reach the kernel ONLY as identity-free projections, as the H-W1 comparator-input rule requires:
//   S0     the frozen public baseline: one public score per menu action and its top set (stable under relabelling)
//   NEXUS  the expert's recommendation projected to its ACTION TYPE, plus its rationale codes and reason
// The specific action Nexus names is NOT used: its choice among equally scored actions is decided by a lexical
// handle tie-break and changes under relabelling (measured at H-W1 I-0), so only the type-level projection is stable.
// No action handle, entity id or menu-independent identity survives canonicalisation. Pure: no imports.

export const EVIDENCE_CONTRACT = 'SK1_ADVISORY_EVIDENCE_V1';

/** Harness side: raw expert outputs (which carry handles) -> canonical, handle-free evidence aligned with the menu. */
export function canonicalEvidence({ menuHandles, menuTypes, s0, nexus }) {
  const at = new Map(menuHandles.map((h, i) => [h, i]));
  const S0 = s0 ? { kind: 'PUBLIC_SCORE', scores: [...s0.scores], topSet: s0.selected.map((h) => at.get(h)).sort((a, b) => a - b) } : null;
  const NEXUS = nexus ? { kind: 'RECOMMENDATION_PROJECTION', abstain: nexus.abstain === true, recommendedType: nexus.abstain || nexus.action == null ? null : menuTypes[at.get(nexus.action)] ?? 'UNKNOWN_ACTION',
    rationaleCodes: [...(nexus.codes ?? [])].map(String).sort(), reason: nexus.reason == null ? null : String(nexus.reason) } : null;
  return { contract: EVIDENCE_CONTRACT, experts: { ...(S0 ? { S0 } : {}), ...(NEXUS ? { NEXUS } : {}) } };
}

/** Kernel side: is the evidence usable? Unsupported or contradictory evidence is reported, never repaired or trusted. */
export function validateEvidence(evidence, legalActions) {
  if (evidence === null || evidence === undefined) return { status: 'ABSENT', issues: [], summary: null };
  const issues = [], n = legalActions.length, ex = evidence.experts;
  if (evidence.contract !== EVIDENCE_CONTRACT) issues.push('UNSUPPORTED_EVIDENCE_CONTRACT');
  if (!ex || typeof ex !== 'object') return { status: 'INVALID', issues: [...issues, 'EXPERTS_MISSING'], summary: null };
  const unknown = Object.keys(ex).filter((k) => k !== 'S0' && k !== 'NEXUS'); if (unknown.length) issues.push('UNSUPPORTED_EXPERT_OUTPUT:' + unknown.sort().join(','));
  const s = ex.S0, x = ex.NEXUS;
  if (!s) issues.push('S0_MISSING');
  else {
    if (!Array.isArray(s.scores) || s.scores.length !== n || s.scores.some((v) => typeof v !== 'number' || !Number.isFinite(v))) issues.push('S0_SCORES_MALFORMED');
    else if (!Array.isArray(s.topSet) || !s.topSet.length || s.topSet.some((i) => !Number.isInteger(i) || i < 0 || i >= n) || new Set(s.topSet).size !== s.topSet.length) issues.push('S0_TOPSET_MALFORMED');
    else { const inTop = new Set(s.topSet), lowTop = Math.min(...s.topSet.map((i) => s.scores[i])), highRest = Math.max(-Infinity, ...s.scores.filter((_, i) => !inTop.has(i))); if (highRest > lowTop) issues.push('S0_TOPSET_CONTRADICTS_SCORES'); }
  }
  if (!x) issues.push('NEXUS_MISSING');
  else {
    if (typeof x.abstain !== 'boolean') issues.push('NEXUS_ABSTAIN_MALFORMED');
    if (!Array.isArray(x.rationaleCodes) || x.rationaleCodes.some((c) => typeof c !== 'string')) issues.push('NEXUS_CODES_MALFORMED');
    if (x.abstain === false) { if (typeof x.recommendedType !== 'string') issues.push('NEXUS_TYPE_MISSING'); else if (!legalActions.some((a) => a.type === x.recommendedType)) issues.push('NEXUS_TYPE_NOT_IN_LEGAL_MENU'); }
    if (x.abstain === true && x.recommendedType != null) issues.push('NEXUS_ABSTAINS_BUT_RECOMMENDS');
  }
  const fatal = issues.filter((i) => !i.startsWith('UNSUPPORTED_EXPERT_OUTPUT'));
  const summary = !fatal.length ? { s0TopSize: s.topSet.length, s0TopTypes: [...new Set(s.topSet.map((i) => legalActions[i].type))].sort(), nexusAbstain: x.abstain, nexusRecommendedType: x.recommendedType ?? null, nexusRationaleCodes: x.rationaleCodes, nexusReason: x.reason ?? null,
    expertsAgreeOnType: x.abstain ? null : s.topSet.some((i) => legalActions[i].type === x.recommendedType) } : null;
  // an unrecognised extra expert is ignored (and reported); a malformed or contradictory known expert invalidates the evidence
  return { status: fatal.length ? 'INVALID' : issues.length ? 'PARTIAL' : 'VALID', issues, summary };
}
