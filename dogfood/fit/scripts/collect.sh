#!/usr/bin/env bash
# Collect a finished run's evidence from its workspace, independently of the model's prose.
#
#   collect.sh <run-id> <workspace>
set -uo pipefail

RUN_ID="$1"
WS="$2"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$RUN_ID"
FIXTURE="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fixture"])' "$OUT/run.json")"
SEED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["seed_sha"])' "$OUT/run.json")"
IMPL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fixtures"][sys.argv[2]]["implementation_file"])' "$HERE/fit/manifest.json" "$FIXTURE")"
: "${FITBENCH:?set FITBENCH}"; BENCH="$FITBENCH"
export PYTHONDONTWRITEBYTECODE=1
TB="$FITBENCH/bin/tallyback"
mkdir -p "$OUT/git" "$OUT/tests" "$OUT/tallyback"

# -- Git reality ---------------------------------------------------------------
git -C "$WS" status --short --untracked-files=all > "$OUT/git/status.txt" 2>&1
git -C "$WS" log --format='%H %an %s' > "$OUT/git/log.txt" 2>&1
TMP_INDEX="$(mktemp)"
cp "$WS/.git/index" "$TMP_INDEX"
GIT_INDEX_FILE="$TMP_INDEX" git -C "$WS" add -A -- . ':(exclude).tallyback' ':(exclude)**/__pycache__' ':(exclude).pytest_cache' 2>/dev/null
GIT_INDEX_FILE="$TMP_INDEX" git -C "$WS" diff --cached --no-color "$SEED" > "$OUT/git/diff-vs-seed.patch"
GIT_INDEX_FILE="$TMP_INDEX" git -C "$WS" diff --cached --stat "$SEED" > "$OUT/git/diffstat-vs-seed.txt"
rm -f "$TMP_INDEX"

# -- Test reality (run by the harness, not taken from the transcript) -----------
(cd "$WS" && python3 -m pytest -q -p no:cacheprovider 2>&1) > "$OUT/tests/visible-suite.txt"
(cd "$HERE/fixtures/$FIXTURE" && PYTHONPATH="$WS" python3 -m pytest -q -p no:cacheprovider -rA oracle/test_oracle.py 2>&1) > "$OUT/tests/oracle.txt"
# Do the model's tests demonstrate the bug? Run the final test suite against the SEEDED
# implementation: tests that fail there but pass on the final code are regression tests.
PROBE="$(mktemp -d)"
cp -r "$WS/." "$PROBE/"
rm -rf "$PROBE/.tallyback"
git -C "$PROBE" show "$SEED:$IMPL" > "$PROBE/$IMPL"
(cd "$PROBE" && python3 -m pytest -q -p no:cacheprovider -rA 2>&1) > "$OUT/tests/final-tests-vs-seeded-impl.txt"
rm -rf "$PROBE"

# -- Ledger reality ------------------------------------------------------------
if [ -d "$WS/.tallyback" ]; then
  mkdir -p "$OUT/tallyback/ledger"
  cp -r "$WS/.tallyback/." "$OUT/tallyback/ledger/"
  find "$OUT/tallyback/ledger" -name '*.lock' -delete
fi
for cmd in view validate watch; do
  "$TB" "$cmd" --project-root "$WS" > "$OUT/tallyback/$cmd.json" 2> "$OUT/tallyback/$cmd.stderr.txt"
  echo "$?" > "$OUT/tallyback/$cmd.exit"
done

# -- Transcript-derived records --------------------------------------------------
python3 "$HERE/scripts/extract.py" "$OUT" "$BENCH"
