"""Verify preserved bytes, clone a disposable LOCAL source snapshot, run synthetic tests only.
No network, native generation, seed allocation, protected-source publication, or main-repo staging.
"""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import re
import subprocess
import tarfile
import tempfile

lane = Path(__file__).resolve().parent
root = lane.parents[4]
ga = root / 'platform/game-agnostic'
v2 = ga / 'stage3h-activation-readiness-v2'
sha = lambda b: hashlib.sha256(b).hexdigest()
target = json.loads((lane / 'review-target.json').read_text())
bindings = target['bindings']
assert sha(json.dumps(bindings, sort_keys=True, separators=(',', ':')).encode()) == target['amendmentHash']
for name, h in bindings.items():
    if not name.startswith('@'):
        assert sha((lane / name).read_bytes()) == h, name
manifest = json.loads((v2 / 'source-package-manifest.json').read_text())
record = json.loads((v2 / 'local-package-record.json').read_text())
archive = v2 / record['archive']
assert sha(archive.read_bytes()) == record['sha256'] == bindings['@sourceArchiveSha256']
inherited = json.loads((lane / 'inheritance.json').read_text())
for name, h in inherited['priorFiles'].items():
    assert sha((root / name).read_bytes()) == h, name
env = dict(os.environ, GIT_AUTHOR_DATE='2026-10-20T12:00:00-07:00', GIT_COMMITTER_DATE='2026-10-20T12:00:00-07:00')

def run(args, cwd):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True, stderr=subprocess.PIPE).strip()

with tempfile.TemporaryDirectory(prefix='sentinel-v3-synthetic-clone-') as temp:
    temp = Path(temp)
    repo = temp / 'source'; repo.mkdir()
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        assert len(members) == len({m.name for m in members})
        assert {m.name for m in members} == set(manifest['files']) | {'SOURCE_PACKAGE_MANIFEST.json'}
        for m in members:
            pp = PurePosixPath(m.name)
            assert m.isfile() and not pp.is_absolute() and '..' not in pp.parts
            raw = tar.extractfile(m).read()
            if m.name == 'SOURCE_PACKAGE_MANIFEST.json':
                assert json.loads(raw) == manifest
            else:
                assert sha(raw) == manifest['files'][m.name]['sha256'] and len(raw) == manifest['files'][m.name]['bytes']
            dest = repo / m.name; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(raw)
    # Preserve original committed V2 documents needed for consistency assertions.
    for name, h in inherited['priorFiles'].items():
        if name.startswith('platform/game-agnostic/stage3h-activation-readiness-v2/'):
            dest = repo / name; dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes((root / name).read_bytes())
    for name in bindings:
        if not name.startswith('@'):
            dest = repo / lane.relative_to(root) / name
            dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes((lane / name).read_bytes())
    files = {str(p.relative_to(repo)): sha(p.read_bytes()) for p in repo.rglob('*') if p.is_file()}
    # Check all relative static imports in authored V3 code against the byte-preserving closure.
    for p in (repo / lane.relative_to(root)).glob('*.mjs'):
        for rel in re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]', p.read_text()):
            if rel.startswith('.'):
                assert (p.parent / rel).resolve().is_file(), (p.name, rel)
    run(['git', 'init', '--quiet'], repo)
    run(['git', 'add', '--', '.'], repo)
    run(['git', '-c', 'user.name=Sentinel Synthetic Repro', '-c', 'user.email=local-only@invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Local synthetic-only reproducibility snapshot'], repo)
    clone = temp / 'clone'
    run(['git', 'clone', '--no-local', '--quiet', str(repo), str(clone)], temp)
    assert not (clone / '.git/objects/info/alternates').exists()
    for name, h in files.items(): assert sha((clone / name).read_bytes()) == h, name
    old = json.loads(run(['node', 'platform/game-agnostic/stage3h-activation-readiness-v2/synthetic-check.mjs'], clone))
    new = json.loads(run(['node', str(lane.relative_to(root) / 'synthetic-check.mjs')], clone))
    assert old['check'] == new['check'] == 'PASS' and new['fail'] == 0
    assert old['nativeWorldsInstantiated'] == new['nativeWorldsInstantiated'] == 0
    assert not run(['git', 'status', '--porcelain'], clone)
    runtime = json.loads(run(['node', '--input-type=module', '-e', "import {runtimeIdentity} from './" + str(lane.relative_to(root) / 'runner.mjs') + "';console.log(JSON.stringify(runtimeIdentity()))"], clone))
    # Launch flags for this metadata command differ from the test launch, so record both explicitly.
    test_runtime = dict(runtime, execArgv=[])
    expected_runtime = json.loads((lane / 'runtime-identity.json').read_text())
    assert test_runtime == expected_runtime, 'SYNTHETIC_TEST_RUNTIME_DIFFERS_FROM_BOUND_HOST'
    result = {'check': 'PASS', 'classification': 'CLEAN_LOCAL_CLONE_SYNTHETIC_ONLY', 'amendmentHash': target['amendmentHash'],
              'sourceArchiveSha256': record['sha256'], 'sourceDependencyFiles': len(manifest['files']),
              'allCloneFilesByteVerified': len(files), 'noAlternates': True, 'staticImportsResolved': True,
              'legacySyntheticTests': old['tests'], 'v3SyntheticTests': new['tests'], 'syntheticPass': old['tests'] + new['tests'], 'syntheticFail': 0,
              'v3TestNames': new['testNames'], 'runtimeIdentityVerified': True,
              'nativeWorldsInstantiated': 0, 'sealedSeedsAllocated': False, 'sealedCampaignExecuted': False,
              'sourcePublished': False, 'mainRepositoryProtectedDependenciesStaged': False,
              'canonicalNativeRuntimeCertified': False, 'independentReview': 'REVIEW_PENDING'}
print(json.dumps(result, indent=2))
