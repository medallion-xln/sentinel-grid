"""Local, deterministic source-byte package only. No imports of Sentinel game code."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import re
import subprocess
import tarfile

LANE = Path(__file__).resolve().parent
GA = LANE.parent
ROOT = GA.parent.parent
snapshot = json.loads((LANE / "inheritance.json").read_text())
entries = ["stage3h-canonical-v1/" + name for name in [
    "adapters.mjs", "baseline.mjs", "evidence.mjs", "metrics.mjs",
    "nexus-selector-v1-port.mjs", "plan.mjs", "synthesis.mjs",
]] + ["stage3h1d-development/confirm-core.mjs"] + [
    "stage3h-activation-readiness-v2/" + name
    for name in ["analysis.mjs", "runner-design.mjs", "synthetic-check.mjs"]
]
# Anchored source import/export declarations; do not parse prose containing 'import/from'.
imports = re.compile(r'''^\s*import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s*)?['"]([^'"]+)['"]''', re.M)
exports = re.compile(r'''^\s*export\s+(?:\{[^}]*\}|\*)\s+from\s*['"]([^'"]+)['"]''', re.M)
urls = re.compile(r'''new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)''')
pending = [GA / p for p in entries]
data, edges, builtins, readers = {}, {}, set(), []
while pending:
    path = pending.pop().resolve()
    if str(path.relative_to(ROOT)) in data:
        continue
    assert path.is_relative_to(ROOT) and path.is_file(), path
    relative = str(path.relative_to(ROOT))
    raw = path.read_bytes()
    data[relative] = raw
    if path.suffix not in [".js", ".mjs"]:
        continue
    text = raw.decode()
    dependencies = []
    for spec in imports.findall(text) + exports.findall(text) + urls.findall(text):
        if spec.startswith("."):
            dependency = (path.parent / spec).resolve()
            assert dependency.is_relative_to(ROOT), dependency
            dependencies.append(str(dependency.relative_to(ROOT)))
            pending.append(dependency)
        else:
            builtins.add(spec)
    edges[relative] = sorted(set(dependencies))
    if "readFileSync" in text:
        readers.append(relative)
assert all(spec.startswith("node:") for spec in builtins), builtins
for relative in entries[:7]:
    assert hashlib.sha256(data["platform/game-agnostic/" + relative]).hexdigest() == snapshot["sourceHashes"][relative]
# Preserve the tracked package metadata, not the unrelated working-tree package edit.
metadata_path = "platform/game-agnostic/package.json"
data[metadata_path] = subprocess.check_output(["git", "show", snapshot["head"] + ":" + metadata_path], cwd=ROOT)
manifest = {
    "id": "STAGE3H_SOURCE_PACKAGE_MANIFEST_V2",
    "status": "LOCAL_REVIEW_PACKAGE_PUBLICATION_NOT_AUTHORIZED",
    "localPackagingAuthorization": "Current user Phase 4 requests an exact byte-preserving dependency package. No existing untracked sources are staged or published.",
    "baseCommit": snapshot["head"],
    "entrypoints": ["platform/game-agnostic/" + p for p in entries],
    "files": {p: {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        "origin": "PINNED_GIT_BLOB" if p == metadata_path else "SOURCE_BYTES_UNCHANGED"}
        for p, raw in sorted(data.items())},
    "staticEdges": dict(sorted(edges.items())),
    "nodeBuiltins": sorted(builtins),
    "sourceFilesWithReadFileSync": sorted(readers),
    "priorSevenFrozenHashesVerified": True,
    "externalNpmPackages": [], "checkpointFilesIncluded": [],
    "sealedDataAccessed": False, "nativeWorldsInstantiated": 0,
    "limitations": [
        "Static module imports/exports and literal source-relative new URL dependencies inventoried; dynamic native adapter behavior is not exercised.",
        "The only imported runtime data file is the public OPEN model report; no sealed rows are packaged.",
        "Clone/synthetic tests do not constitute performance, canonical numerical certification, independent review or authorization.",
    ],
}
manifest_raw = (json.dumps(manifest, indent=2) + "\n").encode()
(LANE / "source-package-manifest.json").write_bytes(manifest_raw)
data["SOURCE_PACKAGE_MANIFEST.json"] = manifest_raw
archive = LANE / "local-source-package.tar.gz"
with archive.open("wb") as output:
    with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as tar:
            for relative, raw in sorted(data.items()):
                item = tarfile.TarInfo(relative)
                item.size, item.mode, item.mtime = len(raw), 0o644, 0
                item.uid = item.gid = 0
                item.uname = item.gname = ""
                tar.addfile(item, io.BytesIO(raw))
record = {"archive": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "bytes": archive.stat().st_size, "files": len(manifest["files"]),
    "sourcePackageCommitted": False, "published": False, "worldsInstantiated": 0}
(LANE / "local-package-record.json").write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record))
