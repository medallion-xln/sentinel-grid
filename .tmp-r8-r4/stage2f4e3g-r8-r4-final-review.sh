#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
REPO="$HOME/Desktop/zeknova-shared-gaming-experience"
SENTINEL="$HOME/Desktop/sentinel-grid"
WORKSPACE="$HOME/Desktop/SentinelGrid_Stage2F4E3_Offline_Patch_20260806T053118Z"
RUNTIME="$REPO/assets/index-02987539.js"
MAIN="$REPO/src/main.js"
CLOCK="$REPO/src/game/StrategicStateClock.js"
MISSIONS="$REPO/src/game/Missions.js"
GAME="$REPO/src/game/Game.js"
BOSS="$REPO/src/game/BossSystem.js"
SELF_TEST="$REPO/sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs"
COLLECTOR_CORE="$REPO/sentinel-grid/live-parity/runtime-collector/collector-core.mjs"
COLLECTORCTL="$REPO/sentinel-grid/live-parity/runtime-collector/collectorctl.sh"
TRACK="$SENTINEL/.tmp-r8-r3-r2"
TRACK1_REPORT="$TRACK/TRACK1_FORENSIC_0D6561A8.md"
PATCH="$TRACK/self-test-hydration.patch"
CANDIDATE="$TRACK/self-test.mjs.patched"
KERNEL="$SENTINEL/platform/game-agnostic"
PRIOR_MANIFEST="$SENTINEL/.tmp-r8-r4/frozen-runtime-20260809/manifest.json"
EXPECTED_PRIOR_MANIFEST="322f66b6f5a58bad63eb282c31eb1bf85ab1204f363854fe33312638029181c7"
EXPECTED_R7_RUNTIME="7c97573c60f2f04830ec72d5a9cf7ba7a9f4d2055c36458fac8ca46fdb4812a7"
EXPECTED_CURRENT_RUNTIME="0d6561a83905a6c263daa772ffdee690d8e623525def54a0eaf73f81aeb8017a"
EXPECTED_MAIN="1055917bf5f8b51bc009be8000e6ed5629f9a93d2dd4546932f8d3d6f4894c84"
EXPECTED_CLOCK="38744f6bb0f09a19cb879d1842c491c573ab9191e21089c46769f509c40d81dc"
EXPECTED_SELF_TEST_ORIGINAL="ecefd85ecb8f23f2606a93a20f6a3becb7c660871c2a209d80cf4a535406873e"
EXPECTED_SELF_TEST_CANDIDATE="d2e90525848064627e2fb136667912955779efb0be3d773d86890efe668a41f6"
EXPECTED_PATCH="61007865b01d0157ccd34932dad670f1af79aca6829864eed6823e16b83b1999"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$WORKSPACE/stage2f4e3g-r8-r4-final-review-$STAMP"
REPORTS="$OUT/reports"
EVIDENCE="$OUT/evidence"
TESTS="$OUT/tests"
REPORT="$REPORTS/220_stage2f4e3g_r8_r4.txt"
MANIFEST="$OUT/stage2f4e3g-r8-r4-review-manifest.json"
FINAL="$OUT/FINAL_RESULT.txt"
HASHES="$OUT/SHA256SUMS.txt"
ARCHIVE="$HOME/Desktop/SentinelGrid_Stage2F4E3G_R8_R4_Final_Review_$STAMP.tar.gz"
mkdir -p "$REPORTS" "$EVIDENCE" "$TESTS"
: > "$REPORT"
log() { printf '%s\n' "$*" | tee -a "$REPORT"; }
section() { log ""; log "================================================================"; log "$1"; log "================================================================"; }
sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
require_file() { [[ -f "$1" ]] || { log "Missing required file: $1"; exit 1; }; }
require_sha() { local label="$1"; local file="$2"; local expected="$3"; local actual; actual="$(sha256 "$file")"; log "$label=$actual"; if [[ "$actual" != "$expected" ]]; then log "FAIL | $label"; log "expected=$expected"; log "actual=$actual"; exit 1; fi; }
fail() { log ""; log "STAGE_2F4E3G_R8_R4_PROCEDURAL=FAIL"; log "STAGE_2F4E3G_R8_R4_SUBSTANTIVE=FAIL"; log "RUNTIME_REBASELINE_AUTHORIZED=false"; log "SELF_TEST_PATCH_AUTHORIZED=false"; log "SELF_TEST_PATCH_APPLIED=false"; log "COLLECTOR_STARTED=false"; log "QUALIFICATION_RESTARTED=false"; log "PRODUCTION_PROMOTION_ELIGIBLE=false"; log "REPOSITORY_MODIFIED_BY_GATE=false"; log "AUTHORITY=R0"; exit 1; }
trap fail ERR
section "STAGE 2F.4E.3G-R8-R4"
log "timestamp_utc=$STAMP"
log "mode=EXACT_REBASELINE_AND_SELF_TEST_APPLICATION_REVIEW"
log "repository=$REPO"
log "sentinel_repository=$SENTINEL"
log "authority=R0"
for file in "$RUNTIME" "$PRIOR_MANIFEST" "$MAIN" "$CLOCK" "$MISSIONS" "$GAME" "$BOSS" "$SELF_TEST" "$COLLECTOR_CORE" "$COLLECTORCTL" "$TRACK1_REPORT" "$PATCH" "$CANDIDATE"; do require_file "$file"; done
section "REQUIRE FROZEN LIVE SERVICES"
if lsof -nP -iTCP:8790 -sTCP:LISTEN > "$TESTS/port-8790.txt" 2>&1; then cat "$TESTS/port-8790.txt" | tee -a "$REPORT"; log "Runtime remains active."; false; fi
if lsof -nP -iTCP:43127 -sTCP:LISTEN > "$TESTS/port-43127.txt" 2>&1; then cat "$TESTS/port-43127.txt" | tee -a "$REPORT"; log "Collector remains active."; false; fi
set +e; trap - ERR; "$COLLECTORCTL" status > "$TESTS/collector-status.txt" 2>&1; COLLECTOR_EXIT=$?; trap fail ERR; set -e; cat "$TESTS/collector-status.txt" | tee -a "$REPORT"; log "collector_status_exit=$COLLECTOR_EXIT"; log "runtime_stopped=true"; log "collector_stopped=true"
section "CAPTURE REPOSITORY BEFORE STATE"
git -C "$REPO" status --porcelain=v1 -z --untracked-files=all > "$OUT/git-status-before.bin"
git -C "$REPO" status --porcelain=v1 --untracked-files=all > "$OUT/git-status-before.txt"
section "VERIFY EXACT RUNTIME LINEAGE"
require_sha "prior_frozen_manifest_sha256" "$PRIOR_MANIFEST" "$EXPECTED_PRIOR_MANIFEST"
grep -qF '"runtimeSha256": "a080f0cffbdf5666493eab50f9ba7879cb0847340eaae43f080fd822348033c6"' "$PRIOR_MANIFEST"
grep -qF '"r7Certified": "7c97573c60f2f04830ec72d5a9cf7ba7a9f4d2055c36458fac8ca46fdb4812a7"' "$PRIOR_MANIFEST"
require_sha "current_runtime_sha256" "$RUNTIME" "$EXPECTED_CURRENT_RUNTIME"
require_sha "main_sha256" "$MAIN" "$EXPECTED_MAIN"
require_sha "clock_sha256" "$CLOCK" "$EXPECTED_CLOCK"
wc -c "$RUNTIME" | tee "$EVIDENCE/runtime-byte-counts.txt" | tee -a "$REPORT"
section "VALIDATE TRACK 1 FORENSIC REPORT"
TRACK1_SHA="$(sha256 "$TRACK1_REPORT")"
log "track1_report=$TRACK1_REPORT"
log "track1_report_sha256=$TRACK1_SHA"
grep -qF "$EXPECTED_CURRENT_RUNTIME" "$TRACK1_REPORT"
grep -qF "FULL_REBUILD_WITH_R0_VISUAL_EXPERT_PLUS_MISSION_AND_RUNTIME_CHANGES" "$TRACK1_REPORT"
grep -qF "RUNTIME_REBASELINE_REVIEW_ELIGIBLE=false" "$TRACK1_REPORT"
log "PASS | Track 1 forensic report bound to current runtime"
section "VERIFY SENTINEL-CRITICAL RUNTIME ANCHORS"
python3 - "$RUNTIME" > "$REPORTS/221_runtime_anchor_review.json" <<'PY'
import json, sys
from pathlib import Path
current = Path(sys.argv[1]).read_text(errors="replace")
anchors = {"advisorTelemetryMethod": "zR.prototype.getAdvisorTelemetry=function(){","legacyBridge": "globalThis.ZekNovaLegacyBridge=Object.freeze({","globalGame": "globalThis.ZekNovaGame=_s",}
result = {"schemaVersion": 1, "anchors": {}}
for name, token in anchors.items():
    count = current.count(token)
    if count < 1: raise SystemExit(f"Required Sentinel anchor missing: {name}")
    result["anchors"][name] = {"current": count}
current_quantum = current.count("getStrategicStateQuantum")
if current_quantum != 0: raise SystemExit("Generated runtime strategic quantum method appeared.")
result["getStrategicStateQuantum"] = {"current": current_quantum}
for forbidden in ["canDispatch:true","canMutateLiveWorld:true",'authority:"R2"','authority:"R3"']: 
    if forbidden in current: raise SystemExit(f"Forbidden authority token found: {forbidden}")
result["authorityExpansionDetected"] = False; result["sentinelCriticalAnchorsRetained"] = True; result["authority"] = "R0"
print(json.dumps(result, indent=2))
PY
cat "$REPORTS/221_runtime_anchor_review.json" | tee -a "$REPORT"
section "VERIFY MISSION-AWARE SOURCE CHANGES"
python3 - "$MISSIONS" "$GAME" "$BOSS" > "$REPORTS/222_mission_source_review.json" <<'PY'
import json, sys
from pathlib import Path
missions = Path(sys.argv[1]).read_text(errors="replace")
game = Path(sys.argv[2]).read_text(errors="replace")
boss = Path(sys.argv[3]).read_text(errors="replace")
required = {"Missions.js": {"biomeVisit": "biomeVisit" in missions,"biomeResource": "biomeResource" in missions,"ZEKNOVAN_AID_TYPES": "ZEKNOVAN_AID_TYPES" in missions,},"Game.js": {"localQaOfficer": "localQaOfficer" in game,"qaRank": "qaRank" in game,"animationAuditRuntime": "animation-audit1" in game,},"BossSystem.js": {"InsectKing": "InsectKing" in boss or "insectKing" in boss or "insect-king" in boss or "wetlands_broodwarden" in boss or "Insect King" in boss,},}
for file_name, checks in required.items():
    for name, passed in checks.items():
        if not passed: raise SystemExit(f"Required mission-aware marker missing: {file_name}:{name}")
combined = "\n".join([missions, game, boss])
for forbidden in ["canDispatch: true","canDispatch:true","canMutateLiveWorld: true","canMutateLiveWorld:true"]:
    if forbidden in combined: raise SystemExit(f"Authority expansion marker found: {forbidden}")
print(json.dumps({"schemaVersion": 1,"requiredMarkers": required,"missionAwareChangesPresent": True,"authorityExpansionDetected": False,"authority": "R0",}, indent=2))
PY
cat "$REPORTS/222_mission_source_review.json" | tee -a "$REPORT"
section "RUN SOURCE STRUCTURAL CHECK"
node "$REPO/scripts/check-source.mjs" > "$TESTS/check-source.txt"
cat "$TESTS/check-source.txt" | tee -a "$REPORT"
section "VERIFY SELF-TEST PATCH ARTIFACTS"
require_sha "live_self_test_sha256" "$SELF_TEST" "$EXPECTED_SELF_TEST_ORIGINAL"
require_sha "candidate_self_test_sha256" "$CANDIDATE" "$EXPECTED_SELF_TEST_CANDIDATE"
require_sha "self_test_patch_sha256" "$PATCH" "$EXPECTED_PATCH"
git -C "$REPO" apply --check "$PATCH"
git -C "$REPO" apply --numstat "$PATCH" > "$TESTS/self-test-patch-numstat.txt"
cat "$TESTS/self-test-patch-numstat.txt" | tee -a "$REPORT"
PATCH_FILE_COUNT="$(grep -c '.' "$TESTS/self-test-patch-numstat.txt" | tr -d ' ')"; [[ "$PATCH_FILE_COUNT" -eq 1 ]]
grep -qF "sentinel-grid/live-parity/runtime-collector/tests/self-test.mjs" "$TESTS/self-test-patch-numstat.txt"
if grep -qF "collector-core.mjs" "$TESTS/self-test-patch-numstat.txt"; then log "collector-core.mjs unexpectedly included."; false; fi
log "self_test_patch_file_count=$PATCH_FILE_COUNT"; log "historical_fixture_files_in_patch=false"; log "collector_core_in_patch=false"
section "RUN STAGED SELF-TEST CANDIDATE"
cp "$CANDIDATE" "$SELF_TEST.patched.mjs" && node --check "$SELF_TEST.patched.mjs"
node "$SELF_TEST.patched.mjs" "$KERNEL" > "$TESTS/self-test-candidate.txt"
cat "$TESTS/self-test-candidate.txt" | tee -a "$REPORT"
python3 - "$TESTS/self-test-candidate.txt" <<'PY'
import json, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
start = text.find("{")
if start < 0: raise SystemExit("Candidate produced no JSON result.")
value, _ = json.JSONDecoder().raw_decode(text[start:])
assert value["pass"] is True
assert value["checks"] >= 18
authority = value["status"]["authority"]
assert authority["tier"] == "R0"
assert authority["canDispatch"] is False
assert authority["canMutateLiveWorld"] is False
print("Staged self-test candidate validation PASS")
PY
rm -f "$SELF_TEST.patched.mjs" 2>/dev/null || true
section "RUN AUTHORITY READINESS"
node "$REPO/tests/stage1az12-authority-readiness-contract.test.cjs" > "$TESTS/zeknova-authority.txt"
node "$SENTINEL/sgrid-lab/tests/stage1az12-authority-readiness-contract.test.js" > "$TESTS/sentinel-authority.txt"
grep -qF "STAGE 1A-Z.12 AUTHORITY READINESS TESTS PASS" "$TESTS/zeknova-authority.txt"
grep -qF "STAGE 1A-Z.12 AUTHORITY READINESS TESTS PASS" "$TESTS/sentinel-authority.txt"
log "PASS | Both authority-readiness suites"
section "VERIFY REPOSITORY UNCHANGED"
git -C "$REPO" status --porcelain=v1 -z --untracked-files=all > "$OUT/git-status-after.bin"
git -C "$REPO" status --porcelain=v1 --untracked-files=all > "$OUT/git-status-after.txt"
cmp -s "$OUT/git-status-before.bin" "$OUT/git-status-after.bin"
require_sha "current_runtime_final_sha256" "$RUNTIME" "$EXPECTED_CURRENT_RUNTIME"
require_sha "live_self_test_final_sha256" "$SELF_TEST" "$EXPECTED_SELF_TEST_ORIGINAL"
log "repository_modified_by_gate=false"
section "CREATE REVIEW MANIFEST"
python3 - "$MANIFEST" "$STAMP" "$EXPECTED_R7_RUNTIME" "$EXPECTED_CURRENT_RUNTIME" "$TRACK1_SHA" "$EXPECTED_SELF_TEST_ORIGINAL" "$EXPECTED_SELF_TEST_CANDIDATE" "$EXPECTED_PATCH" <<'PY'
import json, sys
from pathlib import Path
(output,timestamp,r7_runtime,current_runtime,forensic_report,self_test_original,self_test_candidate,patch,) = sys.argv[1:]
manifest = {"schemaVersion": 1,"artifactId": "sentinel-grid-stage2f4e3g-r8-r4-final-review-v1","stage": "Stage 2F.4E.3G-R8-R4","result": "PASS","timestampUtc": timestamp,"runtimeReview": {"previousCertifiedSha256": r7_runtime,"proposedRebaselineSha256": current_runtime,"classification": "FULL_REBUILD_WITH_R0_VISUAL_EXPERT_PLUS_MISSION_AND_RUNTIME_CHANGES","missionAwareReviewPassed": True,"sentinelCriticalAnchorsRetained": True,"authoritySemanticsChanged": False,"forensicReportSha256": forensic_report,"rebaselineRecommendation": "APPROVE_EXACT_HASH_BOUND_REBASELINE","rebaselineAuthorized": False,},"selfTestReview": {"liveOriginalSha256": self_test_original,"candidateSha256": self_test_candidate,"patchSha256": patch,"patchFileCount": 1,"historicalFixturesModified": False,"collectorCoreModified": False,"isolatedCandidatePassed": True,"applicationRecommendation": "APPROVE_EXACT_ONE_FILE_PATCH","patchAuthorized": False,"patchApplied": False,},"authority": {"tier": "R0","canDispatch": False,"canMutateLiveWorld": False,"liveCommandExecution": False,"worldMutation": False,"authorityIssuance": False,},"execution": {"repositoryModified": False,"collectorStarted": False,"qualificationRestarted": False,"productionPromotionEligible": False,},}
Path(output).write_text(json.dumps(manifest, indent=2) + "\n")
PY
MANIFEST_SHA="$(shasum -a 256 "$MANIFEST" | awk '{print $1}')"
section "FINAL R8-R4 DETERMINATION"
cat > "$FINAL" <<EOF
STAGE_2F4E3G_R8_R4
STAGE_2F4E3G_R8_R4_PROCEDURAL=PASS
STAGE_2F4E3G_R8_R4_SUBSTANTIVE=PASS

PREVIOUS_CERTIFIED_RUNTIME_SHA256=$EXPECTED_R7_RUNTIME
PROPOSED_RUNTIME_REBASELINE_SHA256=$EXPECTED_CURRENT_RUNTIME
RUNTIME_CLASSIFICATION=FULL_REBUILD_WITH_R0_VISUAL_EXPERT_PLUS_MISSION_AND_RUNTIME_CHANGES
MISSION_AWARE_RUNTIME_REVIEW_PASSED=true
SENTINEL_CRITICAL_ANCHORS_RETAINED=true
AUTHORITY_SEMANTICS_CHANGED=false
RUNTIME_REBASELINE_RECOMMENDATION=APPROVE_EXACT_HASH_BOUND_REBASELINE
RUNTIME_REBASELINE_AUTHORIZED=false

SELF_TEST_ORIGINAL_SHA256=$EXPECTED_SELF_TEST_ORIGINAL
SELF_TEST_CANDIDATE_SHA256=$EXPECTED_SELF_TEST_CANDIDATE
SELF_TEST_PATCH_SHA256=$EXPECTED_PATCH
SELF_TEST_PATCH_FILE_COUNT=1
SELF_TEST_CANDIDATE_PASSED=true
HISTORICAL_FIXTURES_MODIFIED=false
COLLECTOR_CORE_MODIFIED=false
SELF_TEST_PATCH_RECOMMENDATION=APPROVE_EXACT_ONE_FILE_PATCH
SELF_TEST_PATCH_AUTHORIZED=false
SELF_TEST_PATCH_APPLIED=false

COLLECTOR_STARTED=false
QUALIFICATION_RESTARTED=false
PRODUCTION_PROMOTION_ELIGIBLE=false
REPOSITORY_MODIFIED_BY_GATE=false
AUTHORITY=R0

MANIFEST=$MANIFEST
MANIFEST_SHA256=$MANIFEST_SHA
REPORT=$REPORT
ARCHIVE=$ARCHIVE
EOF
cat "$FINAL" | tee -a "$REPORT"
section "CREATE REVIEW ARCHIVE"
python3 - "$OUT" "$HASHES" <<'PY'
import hashlib, sys
from pathlib import Path
root = Path(sys.argv[1]).resolve()
manifest = Path(sys.argv[2]).resolve()
files = [path for path in root.rglob("*") if path.is_file() and path.resolve() != manifest]
with manifest.open("w") as handle:
    for path in sorted(files):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        handle.write(f"{digest}  {path.relative_to(root)}\n")
PY
tar -czf "$ARCHIVE" -C "$(dirname "$OUT")" "$(basename "$OUT")"
ARCHIVE_SHA="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"
printf '%s  %s\n' "$ARCHIVE_SHA" "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
trap - ERR
printf '\n'; printf 'archive=%s\n' "$ARCHIVE"; printf 'archive_sha256=%s\n' "$ARCHIVE_SHA"; printf '\n'; cat "$FINAL"
