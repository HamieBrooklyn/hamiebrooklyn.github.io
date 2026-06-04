#!/usr/bin/env bash
# Replace inline pokepon-api-base bootstraps with shared assets/api-base-init.js
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 <<'PY'
from pathlib import Path
import re

root = Path(".")
marker = 'src="/assets/api-base-init.js?v=1"'
replacement_block = (
    '  <script src="/assets/api-base-init.js?v=1"></script>\n'
)

# Match inline IIFE that sets window.POKEPON_API_BASE (varies slightly per page).
pattern = re.compile(
    r"  <script>\s*\n"
    r"(?:    //[^\n]*\n)*"
    r"    \(function \(\) \{[\s\S]*?window\.POKEPON_API_BASE[\s\S]*?\}\)\(\);\s*\n"
    r"  </script>\s*\n",
    re.MULTILINE,
)

changed = []
for path in sorted(root.rglob("*.html")):
    if ".git" in path.parts:
        continue
    text = path.read_text(encoding="utf-8")
    if marker in text:
        continue
    if "pokepon-api-base" not in text or "window.POKEPON_API_BASE" not in text:
        continue
    new_text, n = pattern.subn(replacement_block, text, count=1)
    if n:
        path.write_text(new_text, encoding="utf-8")
        changed.append(str(path))

if not changed:
    print("No HTML files needed patching (already using api-base-init.js).")
else:
    print("Patched:")
    for p in changed:
        print(" ", p)
PY
