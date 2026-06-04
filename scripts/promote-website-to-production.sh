#!/usr/bin/env bash
# Merge staging → main and push production website (pokepon.org).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git show-ref --verify --quiet refs/heads/staging; then
  echo "No staging branch. Create one: git checkout -b staging" >&2
  exit 1
fi

git checkout main
git pull --ff-only origin main 2>/dev/null || true
git merge staging -m "Promote website staging to production"

echo "Pushing origin main (updates https://pokepon.org/)..."
git push origin main

echo "Done. Production site will refresh from GitHub Pages in ~1–2 minutes."
