"""Read-only final checks; no native execution and no scientific self-approval."""
from pathlib import Path
import hashlib
import json
import subprocess

lane = Path(__file__).resolve().parent
root = lane.parents[4]
sha = lambda b: hashlib.sha256(b).hexdigest()
J = lambda p: json.loads(p.read_text())
run = lambda args: subprocess.check_output(args, cwd=root, text=True)
target = J(lane / 'review-target.json')
assert sha(json.dumps(target['bindings'], sort_keys=True, separators=(',', ':')).encode()) == target['amendmentHash']
for p, h in target['bindings'].items():
    if not p.startswith('@'): assert sha((lane / p).read_bytes()) == h, p
inherited = J(lane / 'inheritance.json')
assert sha(subprocess.check_output(['git', 'diff', '--binary'], cwd=root)) == inherited['trackedDiffSha256']
for p, h in inherited['priorFiles'].items(): assert sha((root / p).read_bytes()) == h, p
for commit, folder in [('250f51ad', 'stage3h-activation-readiness-v2'), ('fcb9e8b9', 'stage3h-final-review-handoff')]:
    paths = run(['git', 'ls-tree', '-r', '--name-only', commit, '--', 'platform/game-agnostic/' + folder]).splitlines()
    for p in paths:
        original = subprocess.check_output(['git', 'show', commit + ':' + p], cwd=root)
        assert original == (root / p).read_bytes(), p
legacy = json.loads(run(['node', 'platform/game-agnostic/stage3h-final-review-handoff/integrity-check.mjs']))
assert legacy['check'] == 'PASS' and legacy['protectedState']['count'] == 14447
bundle = json.loads(run(['python3', 'platform/game-agnostic/stage3h-final-review-handoff/verify-bundle.py']))
assert bundle['check'] == 'PASS' and bundle['sourceDependencyFiles'] == 75
clone = J(lane / 'clone-verification.json')
assert clone['amendmentHash'] == target['amendmentHash'] and clone['check'] == 'PASS' and clone['syntheticFail'] == 0
assert not clone['canonicalNativeRuntimeCertified'] and not clone['sealedCampaignExecuted'] and clone['nativeWorldsInstantiated'] == 0
c, m, s = [J(lane / p) for p in ['contract-v3.json', 'exit-matrix-v3.json', 'scope-approval-record.json']]
assert c['ruleHash'] == 'c53826da908510a6eceae626a3c7463195b648c95962f32b9e2774b8324be021'
assert not c['sealedRegistrationActive'] and not c['seedsAllocated'] and not c['campaignExecuted'] and c['oraclePath'] == 'CLOSED_CONTRACT_NOT_TESTABLE'
assert len(m['rows']) == 7 and not m['boundedQualificationImpliesStageCertification']
assert all(not d['approved'] and d['actualDisposition'] is None and d['signatureOrTrustedApprovalReference'] is None for d in s['decisions'].values())
assert s['reviewerIdentity'] is None and s['reviewStatus'] == 'REVIEW_PENDING' and not s['distributionAuthorized']
result = {'check': 'PASS', 'amendmentHash': target['amendmentHash'],
          'authority': 'R0', 'inheritanceVerified': True, 'protectedFilesUnchanged': True, 'protectedFileCount': 14447,
          'priorV2AndHandoffBytesUnchanged': True, 'priorTrackedChangesUnchanged': True,
          'nineCanonicalExperts': legacy['nineCanonicalExperts'], 'originalReviewPackageHashVerified': True,
          'author01': 'RESOLVED_LOCALLY_PENDING_REVIEW_CLOSURE',
          'author02': 'RESOLVED_LOCALLY_STRICT_EQUIVALENCE_BOUNDARY_PENDING_APPROVAL',
          'syntheticPass': clone['syntheticPass'], 'syntheticFail': clone['syntheticFail'],
          'sourcePackageReproducible': 'PASS_LOCAL_CLONE_SYNTHETIC_ONLY',
          'sourcePublished': False, 'privateDistributionAuthorized': False,
          'nativeReplayCertified': False, 'canonicalRuntimeCertified': False,
          'independentReview': 'REVIEW_PENDING', 'scopeApproval': 'ALL_FIVE_PENDING_HUMAN_AUTHORITY',
          'sealedRegistrationActive': False, 'sealedSeedsAllocated': False, 'sealedCampaignExecuted': False,
          'trainingExecuted': False, 'nativeWorldsInstantiated': 0, 'stage3hCertified': False, 'stage3iStarted': False,
          'canDispatch': False, 'canMutateLiveWorld': False}
print(json.dumps(result, indent=2))
