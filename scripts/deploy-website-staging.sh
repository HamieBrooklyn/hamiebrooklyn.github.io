#!/usr/bin/env bash
# Push the staging branch and sync the staging website repo (staging.pokepon.org).
#
# One-time setup:
#   gh repo create HamieBrooklyn/pokepon-org-staging --public --description "PokePon staging website"
#   GitHub → pokepon-org-staging → Settings → Pages → Custom domain: staging.pokepon.org
#   DNS: CNAME staging → HamieBrooklyn.github.io (or Pages host GitHub shows)
#
# Usage:
#   bash scripts/deploy-website-staging.sh
#   bash scripts/deploy-website-staging.sh --no-push-branch   # only sync site repo

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_REPO="${POKEPON_STAGING_SITE_REPO:-$HOME/Documents/GitHub/pokepon-org-staging}"
STAGING_REMOTE="${POKEPON_STAGING_SITE_REMOTE:-git@github.com:HamieBrooklyn/pokepon-org-staging.git}"
PUSH_BRANCH=true

for arg in "$@"; do
  case "$arg" in
    --no-push-branch) PUSH_BRANCH=false ;;
    -h|--help)
      echo "Usage: $0 [--no-push-branch]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: $ROOT" >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "staging" ]]; then
  if git show-ref --verify --quiet refs/heads/staging; then
    git checkout staging
  else
    echo "Creating staging branch from $(git branch --show-current)..."
    git checkout -b staging
  fi
fi

bash "$ROOT/scripts/patch-api-base-init.sh" 2>/dev/null || true

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ -t 0 ]]; then
    echo "Commit uncommitted website changes on staging before deploy? (y/n)"
    read -r ans
    if [[ "$ans" == "y" || "$ans" == "Y" ]]; then
      git add -A
      git commit -m "Website staging deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi
  else
    git add -A
    git commit -m "Website staging deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  fi
fi

if $PUSH_BRANCH; then
  echo "Pushing origin staging..."
  git push -u origin staging
fi

if [[ ! -d "$STAGING_REPO/.git" ]]; then
  echo "Cloning staging site repo into $STAGING_REPO ..."
  mkdir -p "$(dirname "$STAGING_REPO")"
  git clone "$STAGING_REMOTE" "$STAGING_REPO"
fi

echo "Syncing files to pokepon-org-staging (production pokepon.org untouched)..."
rsync -a --delete \
  --exclude .git \
  --exclude .cursor \
  --exclude scripts/deploy-website-staging.sh \
  "$ROOT/" "$STAGING_REPO/"

echo "staging.pokepon.org" >"$STAGING_REPO/CNAME"

cd "$STAGING_REPO"
git add -A
if git diff --cached --quiet; then
  echo "Staging site repo already up to date."
else
  git commit -m "Deploy website staging $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin main
  echo "Staging site pushed. GitHub Pages will update staging.pokepon.org shortly."
fi

echo ""
echo "Staging website: https://staging.pokepon.org/"
echo "Staging API:     https://api-staging.pokepon.org"
echo "Production site: https://pokepon.org/ (unchanged until you promote)"
