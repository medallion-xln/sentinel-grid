"""Build an immutable local review snapshot. Never publishes or stages protected source bytes."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

LANE = Path(__file__).resolve().parent
ROOT = LANE.parent.parent.parent
V2_COMMIT = "250f51ad50046183b43c327ce59c89acce0a1147"
V2 = "platform/game-agnostic/stage3h-activation-readiness-v2/"
HANDOFF = "platform/game-agnostic/stage3h-final-review-handoff/"
sha = lambda raw: hashlib.sha256(raw).hexdigest()
payload, origins = {}, {}

def committed(path):
    payload[path] = subprocess.check_output(["git", "show", V2_COMMIT + ":" + path], cwd=ROOT)
    origins[path] = {"kind": "COMMITTED_BLOB", "commit": V2_COMMIT}

for prefix in [V2, "platform/game-agnostic/stage3h-qualification-readiness/"]:
    paths = subprocess.check_output(["git", "ls-tree", "-r", "--name-only", V2_COMMIT, "--", prefix], cwd=ROOT, text=True).splitlines()
    for path in paths:
        committed(path)

for relative in [
    "artifacts/stage3f-freeze/stage3f-freeze.json",
    "artifacts/stage3f-freeze/stage3f-freeze-certification-result.json",
    "artifacts/stage3g-freeze/stage3g-freeze.json",
    "artifacts/stage3g-freeze/stage3g-freeze-certification-result.json",
    "artifacts/stage3f6cr-confirmatory-reconciliation/sentinel-decision-evaluation-contract-v1.json",
    "stage3h1c-development/confirmation-protocol.json",
    "stage3h1e-development/ood-preregistration.json",
    "stage3h1d-development/registration.json", "stage3h1d-development/RESULT.txt",
    "stage3h1f-development/registration.json", "stage3h1f-development/RESULT.txt",
    "stage3h2e2-development/RESULT.txt",
    "stage3h2r-development/NINE_EXPERT_INVENTORY_V1.json",
]:
    committed("platform/game-agnostic/" + relative)

source_archive = ROOT / V2 / "local-source-package.tar.gz"
source_record = json.loads((ROOT / V2 / "local-package-record.json").read_text())
assert sha(source_archive.read_bytes()) == source_record["sha256"]
payload[V2 + source_archive.name] = source_archive.read_bytes()
origins[V2 + source_archive.name] = {"kind": "LOCAL_HASH_BOUND_SOURCE_ARCHIVE_NOT_PUBLISHED"}
critical = "platform/game-agnostic/stage3h-critical-path/CRITICAL_PATH.md"
payload[critical] = (ROOT / critical).read_bytes()
origins[critical] = {"kind": "EXISTING_LOCAL_HASH_BOUND_AUDIT"}

excluded = {".writer-lease.json", "bundle-manifest.json", "bundle-record.json"}
for path in sorted(LANE.iterdir()):
    if path.is_file() and path.name not in excluded and not path.name.endswith(".tar.gz"):
        relative = HANDOFF + path.name
        payload[relative] = path.read_bytes()
        origins[relative] = {"kind": "ADDITIVE_HANDOFF_METADATA_NO_PROTOCOL_AMENDMENT"}

manifest = {
    "id": "STAGE3H_FINAL_REVIEW_HANDOFF_MANIFEST_V1", "authority": "R0",
    "v2Commit": V2_COMMIT,
    "originalV2ReviewTargetHash": "7cb0cb326f275182d694386bd7947f0de6c4b321e9d05cddce8b9c7b80492060",
    "status": "IMMUTABLE_LOCAL_HANDOFF_REVIEW_PENDING_NOT_PUBLISHED",
    "sourceArchiveSha256": source_record["sha256"],
    "sourceDependencyFiles": 75,
    "files": {path: {"sha256": sha(raw), "bytes": len(raw), **origins[path]} for path, raw in sorted(payload.items())},
    "protectedSourcePublicationAuthorized": False,
    "sealedCasesIncluded": False, "checkpointFilesIncluded": False,
    "independentReviewerAppointed": False, "humanScopeApproved": False,
    "scientificProtocolAmendments": 0,
}
manifest_raw = (json.dumps(manifest, indent=2) + "\n").encode()
(LANE / "bundle-manifest.json").write_bytes(manifest_raw)
payload["HANDOFF_MANIFEST.json"] = manifest_raw
raw_archive = io.BytesIO()
with gzip.GzipFile(filename="", fileobj=raw_archive, mode="wb", mtime=0) as zipped:
    with tarfile.open(fileobj=zipped, mode="w") as tar:
        for relative, raw in sorted(payload.items()):
            item = tarfile.TarInfo(relative)
            item.size, item.mode, item.mtime = len(raw), 0o644, 0
            item.uid = item.gid = 0
            item.uname = item.gname = ""
            tar.addfile(item, io.BytesIO(raw))
archive_bytes = raw_archive.getvalue()
archive_hash = sha(archive_bytes)
archive_name = "stage3h-review-handoff-" + archive_hash + ".tar.gz"
archive_path = LANE / archive_name
if archive_path.exists():
    assert archive_path.read_bytes() == archive_bytes
else:
    with archive_path.open("xb") as output:
        output.write(archive_bytes)
record = {
    "id": "STAGE3H_FINAL_REVIEW_HANDOFF_RECORD_V1", "archive": archive_name,
    "archiveSha256": archive_hash, "manifestSha256": sha(manifest_raw),
    "archiveBytes": len(archive_bytes), "payloadFiles": len(manifest["files"]),
    "sourceDependencyFiles": 75, "sourceArchiveSha256": source_record["sha256"],
    "v2Commit": V2_COMMIT, "localOnly": True,
    "sourcePackagePublished": False, "protectedSourcesCommitted": False,
    "reviewStatus": "REVIEW_PENDING", "humanScopeApproval": False,
    "registrationActive": False, "seedsAllocated": False, "campaignExecuted": False,
}
(LANE / "bundle-record.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"archive": archive_name, "archiveBytes": len(archive_bytes), "payloadFiles": record["payloadFiles"], "published": False}))
