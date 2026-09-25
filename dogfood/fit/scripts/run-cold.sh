#!/usr/bin/env bash
# run-cold.sh <modelA-alias> <modelB-alias> [fixture]
# Session A works until it has dispatched, recorded its Fit Decision, and changed the
# implementation file — then its process group is killed. Session B starts fresh (no
# transcript, same prompt) in the same workspace.
set -uo pipefail
: "${FITBENCH:?}"
FIT="$(cd "$(dirname "$0")/.." && pwd)"; DOG="$(cd "$FIT/.." && pwd)"
A="$1"; B="$2"; FX="${3:-config-migrate}"
model() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["models"][sys.argv[2]])' "$FIT/manifest.json" "$1"; }
IMPL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fixtures"][sys.argv[2]]["implementation_file"])' "$FIT/manifest.json" "$FX")"
OUT="$FIT/runs/cold-return-$FX-$A-to-$B"; [ ! -e "$OUT" ] || { echo "exists: $OUT" >&2; exit 2; }
mkdir -p "$OUT/session-a" "$OUT/session-b" "$FITBENCH/w"; WS="$(mktemp -d "$FITBENCH/w/XXXXXXXX")/repo"
SEED="$("$FIT/scripts/make-seed.sh" "$FX" "$WS")"
PROMPT="$(cat "$DOG/prompt.txt")"

S=$(date +%s)
setsid "$FIT/scripts/claude-run.sh" "$WS" "$(model "$A")" "$OUT/session-a/transcript.jsonl" "$PROMPT" &
APID=$!
fit_recorded() { python3 - "$WS/.tallyback/state.json" <<'PY'
import json,sys
try: s=json.load(open(sys.argv[1]))
except Exception: sys.exit(1)
att={a["attempt_id"] for a in s.get("attempts",[])}
ok=any(d.get("role")=="execution_choice" and d["subject"]["kind"]=="attempt" and d["subject"]["id"] in att for d in s.get("decisions",[]))
sys.exit(0 if att and ok else 1)
PY
}
has_attempt() { python3 -c 'import json,sys;sys.exit(0 if json.load(open(sys.argv[1])).get("attempts") else 1)' "$WS/.tallyback/state.json" 2>/dev/null; }
REASON="session A ended on its own"; FIRST_EDIT=""
while kill -0 $APID 2>/dev/null; do
  sleep 1
  if ! git -C "$WS" diff --quiet -- "$IMPL" 2>/dev/null && has_attempt; then
    [ -n "$FIRST_EDIT" ] || FIRST_EDIT=$(date +%s)
    if fit_recorded; then REASON="killed: attempt + Fit Decision + implementation edited"; break; fi
    if [ $(( $(date +%s) - FIRST_EDIT )) -ge 60 ]; then REASON="killed: attempt + implementation edited, NO Fit Decision within 60s"; break; fi
  fi
done
if kill -0 $APID 2>/dev/null; then kill -TERM -- -$APID 2>/dev/null; sleep 2; kill -KILL -- -$APID 2>/dev/null; fi
wait $APID 2>/dev/null
K=$(date +%s)
# Snapshot of what session A left behind.
git -C "$WS" status --short --untracked-files=all > "$OUT/session-a/git-status-at-kill.txt"
git -C "$WS" diff > "$OUT/session-a/git-diff-at-kill.patch"
cp -r "$WS/.tallyback" "$OUT/session-a/ledger-at-kill" 2>/dev/null; find "$OUT/session-a/ledger-at-kill" -name '*.lock' -delete 2>/dev/null
"$FITBENCH/bin/tallyback" view --project-root "$WS" > "$OUT/session-a/view-at-kill.json" 2>/dev/null
echo "$REASON" > "$OUT/session-a/termination.txt"

# Session B: fresh session, same prompt, nothing else.
"$FIT/scripts/claude-run.sh" "$WS" "$(model "$B")" "$OUT/session-b/transcript.jsonl" "$PROMPT"
E=$(date +%s)
python3 - "$OUT/run.json" <<PY
import json,sys
json.dump({"run_id":"cold-return-$FX-$A-to-$B","fixture":"$FX","model_a":"$(model "$A")","model_b":"$(model "$B")",
 "seed_sha":"$SEED","workspace":"$WS","termination":"$REASON","session_a_seconds":$K-$S,"session_b_seconds":$E-$K},open(sys.argv[1],"w"),indent=2)
PY
# collect.sh expects a transcript at the run root: evaluate session B's; A's is kept separately.
cp "$OUT/session-b/transcript.jsonl" "$OUT/transcript.jsonl"
"$FIT/scripts/collect.sh" "$OUT" "$WS" >/dev/null 2>&1
python3 "$DOG/scripts/extract.py" "$OUT/session-a" "$FITBENCH" >/dev/null 2>&1 || true
echo "cold-return $A->$B: $REASON; A $((K-S))s"
