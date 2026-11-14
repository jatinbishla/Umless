#!/usr/bin/env bash
# Regenerates every icon, image and embedded font file from the brand sources in
# packaging/brand/ (see docs/releasing.md, "Brand assets"). The outputs are committed, so
# building Umless never needs this script. Needs Node 18+ and, for the .icns, macOS.
#
#   scripts/make-icons.sh            # rasters from the SVGs
#   scripts/make-icons.sh --outline  # first rewrite the SVGs from the font (design changes)
set -euo pipefail
cd "$(dirname "$0")/.."

TOOLS=packaging/brand/tools
command -v node >/dev/null || { echo "make-icons.sh needs Node.js (https://nodejs.org)" >&2; exit 1; }
# fontkit, wawoff2 and sharp, pinned in package-lock.json, installed inside the tools folder.
[ -d "$TOOLS/node_modules/sharp" ] || (cd "$TOOLS" && npm ci --no-audit --no-fund)

[ "${1:-}" = "--outline" ] && node "$TOOLS/outline.mjs"
node "$TOOLS/icons.mjs"

if command -v iconutil >/dev/null; then
  iconutil -c icns dist/brand/Umless.iconset -o packaging/macos/Umless.icns
  echo "  packaging/macos/Umless.icns ($(wc -c < packaging/macos/Umless.icns | tr -d ' ') bytes)"
else
  echo "iconutil not found (not macOS): packaging/macos/Umless.icns was left as it is" >&2
fi
