"""Standalone hash-only verifier. No extraction, native imports, worlds or publication."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import io
import json
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument("archive", nargs="?")
parser.add_argument("--record", default=str(Path(__file__).resolve().parent / "bundle-record.json"))
args = parser.parse_args()
record_path = Path(args.record).resolve()
record = json.loads(record_path.read_text())
archive = Path(args.archive).resolve() if args.archive else record_path.parent / record["archive"]
sha = lambda raw: hashlib.sha256(raw).hexdigest()
archive_raw = archive.read_bytes()
assert sha(archive_raw) == record["archiveSha256"], "ARCHIVE_HASH_MISMATCH"
with tarfile.open(fileobj=io.BytesIO(archive_raw), mode="r:gz") as tar:
    members = tar.getmembers()
    assert len(members) == len({m.name for m in members}), "DUPLICATE_MEMBER"
    assert all(m.isfile() and not PurePosixPath(m.name).is_absolute() and ".." not in PurePosixPath(m.name).parts for m in members), "UNSAFE_MEMBER"
    manifest_raw = tar.extractfile("HANDOFF_MANIFEST.json").read()
    assert sha(manifest_raw) == record["manifestSha256"], "MANIFEST_HASH_MISMATCH"
    manifest = json.loads(manifest_raw)
    assert {m.name for m in members} == set(manifest["files"]) | {"HANDOFF_MANIFEST.json"}, "UNLISTED_MEMBER"
    for name, info in manifest["files"].items():
        raw = tar.extractfile(name).read()
        assert sha(raw) == info["sha256"] and len(raw) == info["bytes"], name
    nested_path = "platform/game-agnostic/stage3h-activation-readiness-v2/local-source-package.tar.gz"
    nested = tar.extractfile(nested_path).read()
    assert sha(nested) == record["sourceArchiveSha256"] == manifest["sourceArchiveSha256"]
with tarfile.open(fileobj=io.BytesIO(nested), mode="r:gz") as source:
    source_members = source.getmembers()
    assert len(source_members) == len({m.name for m in source_members}), "DUPLICATE_SOURCE_MEMBER"
    sm = json.loads(source.extractfile("SOURCE_PACKAGE_MANIFEST.json").read())
    assert len(sm["files"]) == record["sourceDependencyFiles"] == 75
    assert {m.name for m in source_members} == set(sm["files"]) | {"SOURCE_PACKAGE_MANIFEST.json"}
    for name, info in sm["files"].items():
        raw = source.extractfile(name).read()
        assert sha(raw) == info["sha256"] and len(raw) == info["bytes"], name
assert record["sourcePackagePublished"] is False and record["registrationActive"] is False
print(json.dumps({"check": "PASS", "kind": "HASH_ONLY_REVIEW_BUNDLE_VERIFICATION", "payloadFiles": record["payloadFiles"], "sourceDependencyFiles": 75,
    "archiveSha256": record["archiveSha256"], "manifestSha256": record["manifestSha256"], "nativeWorldsGenerated": 0, "published": False,
    "independentReview": "REVIEW_PENDING"}))
