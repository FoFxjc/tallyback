#!/usr/bin/env bash
# Build a fixture's seed repository deterministically.
#
#   make-seed.sh <fixture> <dest-dir>
#
# The seed is the fixture's `seed/` tree plus the Tallyback Claude Code skill taken
# verbatim from the pinned Tallyback commit, committed once with a fixed author,
# committer, and date — so the same inputs always produce the same seed commit SHA.
set -euo pipefail

FIXTURE="$1"
DEST="$2"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TALLYBACK_REPO="$(cd "$HERE/.." && pwd)"
PINNED_SHA="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["tallyback"]["sha"])' "$HERE/benchmark-manifest.json")"

[ -d "$HERE/fixtures/$FIXTURE/seed" ] || { echo "unknown fixture: $FIXTURE" >&2; exit 2; }
[ ! -e "$DEST" ] || { echo "refusing to overwrite $DEST" >&2; exit 2; }

mkdir -p "$DEST"
cp -r "$HERE/fixtures/$FIXTURE/seed/." "$DEST/"
# Never carry interpreter caches from the fixture source into a seed.
find "$DEST" \( -name __pycache__ -o -name .pytest_cache \) -type d -prune -exec rm -r {} +
mkdir -p "$DEST/.claude/skills/tallyback"
git -C "$TALLYBACK_REPO" show "$PINNED_SHA:bridge/claude-code/skills/tallyback/SKILL.md" \
  > "$DEST/.claude/skills/tallyback/SKILL.md"
find "$DEST" -type d -exec chmod 755 {} + && find "$DEST" -type f -exec chmod 644 {} +

export GIT_AUTHOR_NAME="Tallyback Dogfood" GIT_AUTHOR_EMAIL="dogfood@tallyback.invalid"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_AUTHOR_DATE="2026-09-25T00:00:00+00:00"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
git -C "$DEST" init -q -b main
git -C "$DEST" -c core.fileMode=true add -A
git -C "$DEST" -c commit.gpgsign=false commit -q -m "seed: $FIXTURE"
git -C "$DEST" rev-parse HEAD
