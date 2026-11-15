"""Clone the local source-package repository in a disposable directory; run synthetic checks only."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tarfile
import tempfile

lane = Path(__file__).resolve().parent
manifest = json.loads((lane / "source-package-manifest.json").read_text())
record = json.loads((lane / "local-package-record.json").read_text())
archive = lane / record["archive"]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == record["sha256"]
env = dict(os.environ)
env.update({"GIT_AUTHOR_DATE": "2026-10-20T12:00:00-07:00", "GIT_COMMITTER_DATE": "2026-10-20T12:00:00-07:00"})

def run(args, cwd):
    return subprocess.check_output(args, cwd=cwd, env=env, text=True, stderr=subprocess.PIPE).strip()

with tempfile.TemporaryDirectory(prefix="sentinel-stage3h-package-clone-") as temp:
    temp = Path(temp).resolve()
    package_repo = temp / "package-repository"
    package_repo.mkdir()
    with tarfile.open(archive) as tar:
        for item in tar:
            target = (package_repo / item.name).resolve()
            assert target.is_relative_to(package_repo) and item.isfile(), item.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(tar.extractfile(item).read())
    for path, info in manifest["files"].items():
        assert hashlib.sha256((package_repo / path).read_bytes()).hexdigest() == info["sha256"], path
    # This is a disposable local package repository, not staging/publication in the user's Sentinel repository.
    run(["git", "init", "--quiet"], package_repo)
    run(["git", "add", "--", "."], package_repo)
    run(["git", "-c", "user.name=Sentinel Package Preflight", "-c", "user.email=local-preflight@invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Local immutable source-package preflight snapshot"], package_repo)
    package_commit = run(["git", "rev-parse", "HEAD"], package_repo)
    clone = temp / "clean-clone"
    run(["git", "clone", "--no-local", "--quiet", str(package_repo), str(clone)], temp)
    assert not (clone / ".git/objects/info/alternates").exists()
    for path, info in manifest["files"].items():
        assert hashlib.sha256((clone / path).read_bytes()).hexdigest() == info["sha256"], path
    synthetic = json.loads(run(["node", "platform/game-agnostic/stage3h-activation-readiness-v2/synthetic-check.mjs"], clone))
    assert synthetic["check"] == "PASS" and synthetic["nativeWorldsInstantiated"] == 0
    # Load definitions only. In particular no evaluateCombo, generator, expert or simulator function is invoked.
    modules = [p for p in manifest["entrypoints"] if not p.endswith("synthetic-check.mjs")]
    code = "const paths=" + json.dumps(modules) + ";for(const p of paths)await import('./'+p);console.log(JSON.stringify({moduleDefinitionsLoaded:paths.length,nativeWorldsInstantiated:0}));"
    loading = json.loads(run(["node", "--input-type=module", "-e", code], clone))
    assert not run(["git", "status", "--porcelain"], clone)
    result = {
        "id": "STAGE3H_PACKAGE_CLEAN_CLONE_PREFLIGHT_V2", "status": "PASS_PACKAGE_CLONE_SYNTHETIC_ONLY",
        "sourceArchiveSha256": record["sha256"], "packageRepositoryCommit": package_commit,
        "filesByteVerified": len(manifest["files"]), "cloneUsesAlternates": False,
        "syntheticChecks": synthetic, "moduleLoadCheck": loading,
        "sentinelRepositoryUntrackedDependenciesCommitted": False, "published": False,
        "fullSentinelHistoryClonePerformed": False, "nativeReplayOrPerformanceRun": False,
        "canonicalNumericsExecutionCertified": False, "independentMethodReview": "REVIEW_PENDING",
        "note": "Disposable clean clone of the byte-preserving local dependency package, not independent review or a full historical campaign reproduction. Original repository and frozen dependencies were never staged or changed by this preflight.",
    }
(lane / "clean-clone-preflight.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"status": result["status"], "files": result["filesByteVerified"], "syntheticTests": synthetic["tests"], "worldsInstantiated": 0}))
