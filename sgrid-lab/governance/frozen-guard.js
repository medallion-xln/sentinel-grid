/* frozen-guard.js — attested-evidence write containment (GUARDRAILS-v2 §7, W0-G.1)
 *
 * Protected roots are DERIVED from grandfathering attestations plus an external
 * registry. No marker file is ever written inside attested evidence: adding bytes
 * to an attested directory to announce that it is frozen would itself break the
 * "original evidence never modified" claim.
 *
 * Symlink safety: a target that does not exist yet is resolved through its nearest
 * existing ancestor, so a new file inside a frozen directory (or a symlink that
 * lands inside one) cannot slip past the comparison.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REGISTRY = 'docs/governance/frozen-paths.json';

/* Resolve symlinks as far as the path exists, then re-append the missing tail. */
function realpathDeep(p) {
  let abs = path.resolve(p);
  const tail = [];
  let cur = abs;
  for (;;) {
    if (fs.existsSync(cur)) break;
    const parent = path.dirname(cur);
    if (parent === cur) return abs;            // nothing on this path exists
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  const real = fs.realpathSync(cur);
  return tail.length ? path.join(real, ...tail) : real;
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

/* Build the protected set from attestations named by the registry, plus extras. */
function loadGovernanceContext(root) {
  root = path.resolve(root);
  const regPath = path.join(root, REGISTRY);
  const roots = [];
  const sources = [];
  if (fs.existsSync(regPath)) {
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    for (const rel of reg.attestation_sources || []) {
      const ap = path.join(root, rel);
      if (!fs.existsSync(ap)) continue;
      const att = JSON.parse(fs.readFileSync(ap, 'utf8'));
      sources.push(rel);
      if (att.witness_path_base) roots.push(path.join(root, att.witness_path_base));
      if (att.historical_manifest_source) {
        roots.push(path.join(root, att.historical_manifest_source));
        roots.push(path.dirname(path.join(root, att.historical_manifest_source)));
      }
    }
    for (const rel of reg.additional_frozen_paths || []) roots.push(path.join(root, rel));
  }
  const frozenRoots = [...new Set(roots.map(realpathDeep))];
  return { root, registry: regPath, attestation_sources: sources, frozenRoots };
}

/* Non-throwing form — returns {writable, reason, matchedRoot, resolved}. */
function checkWritableEvidenceTarget(targetPath, ctx) {
  const resolved = realpathDeep(targetPath);
  for (const fr of ctx.frozenRoots) {
    if (isInside(resolved, fr)) {
      return {
        writable: false,
        resolved,
        matchedRoot: fr,
        reason: 'target resolves inside attested frozen evidence: ' +
          path.relative(ctx.root, fr) + ' (GUARDRAILS-v2 §7)'
      };
    }
  }
  return { writable: true, resolved, matchedRoot: null, reason: null };
}

/* Throwing form. Performs no filesystem mutation on either path. */
function assertWritableEvidenceTarget(targetPath, ctx) {
  const v = checkWritableEvidenceTarget(targetPath, ctx);
  if (!v.writable) {
    const e = new Error('FROZEN_WRITE_REFUSED: ' + v.reason);
    e.code = 'FROZEN_WRITE_REFUSED';
    e.matchedRoot = v.matchedRoot;
    e.resolved = v.resolved;
    throw e;
  }
  return v.resolved;
}

module.exports = {
  REGISTRY, realpathDeep, isInside,
  loadGovernanceContext, checkWritableEvidenceTarget, assertWritableEvidenceTarget
};
