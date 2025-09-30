#!/usr/bin/env bash
set -euo pipefail
BRANCH=${1:-dev}
FILE=/tmp/patch-$$.diff
cat > "$FILE"
git checkout "$BRANCH" >/dev/null 2>&1 || git checkout -b "$BRANCH"
git pull --rebase origin "$BRANCH" || true
git apply --whitespace=fix "$FILE"
git add -A
git commit -m "apply patch"
git push -u origin "$BRANCH"
echo "✅ Patch pushed to branch: $BRANCH"
echo "➡️  Check Vercel for the new Preview deployment for branch '$BRANCH'."
