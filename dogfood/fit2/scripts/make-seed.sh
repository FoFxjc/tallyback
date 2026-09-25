#!/usr/bin/env bash
# make-seed.sh <fixture> <dest>: fixture seed + the skill at the pinned SHA, deterministic commit.
set -euo pipefail
FIT="$(cd "$(dirname "$0")/.." && pwd)"; DOG="$(cd "$FIT/.." && pwd)"; REPO="$(cd "$DOG/.." && pwd)"
: "${TB_SHA:?set TB_SHA (the pinned Tallyback commit)}"; SHA="$TB_SHA"
F="$1"; D="$2"
[ ! -e "$D" ] || { echo "refusing to overwrite $D" >&2; exit 2; }
mkdir -p "$D"; cp -r "$DOG/fixtures/$F/seed/." "$D/"
find "$D" \( -name __pycache__ -o -name .pytest_cache \) -type d -prune -exec rm -r {} +
mkdir -p "$D/.claude/skills/tallyback"
git -C "$REPO" show "$SHA:bridge/claude-code/skills/tallyback/SKILL.md" > "$D/.claude/skills/tallyback/SKILL.md"
find "$D" -type d -exec chmod 755 {} + && find "$D" -type f -exec chmod 644 {} +
export GIT_AUTHOR_NAME="Tallyback Dogfood" GIT_AUTHOR_EMAIL="dogfood@tallyback.invalid"
export GIT_COMMITTER_NAME="Tallyback Dogfood" GIT_COMMITTER_EMAIL="dogfood@tallyback.invalid"
export GIT_AUTHOR_DATE="2026-09-25T00:00:00+00:00" GIT_COMMITTER_DATE="2026-09-25T00:00:00+00:00"
git -C "$D" init -q -b main && git -C "$D" add -A && git -C "$D" -c commit.gpgsign=false commit -q -m "seed: $F"
git -C "$D" rev-parse HEAD
