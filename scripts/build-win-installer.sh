#!/usr/bin/env bash
# Build the Windows NSIS installer on Linux (no Wine required).
#
# Steps:
#   1. electron-vite build              -> out/
#   2. electron-builder --win dir       -> dist/win-unpacked/ (native deps rebuilt for win32)
#   3. substitute version into the NSIS template
#   4. compile with electron-builder's own bundled NSIS (3.0.4.1)
#
# The result is dist/SOP-Builder-Setup-<version>.exe. Copy it into releases/
# to publish.
#
# Why the bundled NSIS and not the system one: the system makensis produced
# installers that failed Windows' NSIS integrity check, and an earlier
# hand-written script used a Windows-style backslash glob ("win-unpacked\*.*")
# which the Linux compiler silently treated as a literal, bundling almost no
# files. Using forward slashes + the exact toolchain electron-builder ships
# avoids both traps.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
VERSION="$(node -p "require('$ROOT/package.json').version")"

# Locate electron-builder's bundled NSIS (downloaded on first --win run).
NSIS_DIR="$(find "$HOME/.cache/electron-builder/nsis" -maxdepth 1 -type d -name 'nsis-3*' 2>/dev/null | sort | tail -1 || true)"

echo "==> Building renderer/main/preload (electron-vite)"
( cd "$ROOT" && npx electron-vite build )

echo "==> Packaging win-unpacked (electron-builder --win dir)"
( cd "$ROOT" && npx electron-builder --win dir )

if [ -z "$NSIS_DIR" ] || [ ! -x "$NSIS_DIR/linux/makensis" ]; then
  echo "ERROR: electron-builder's bundled NSIS not found under ~/.cache/electron-builder/nsis." >&2
  echo "       Run 'npx electron-builder --win' once to trigger its download, then re-run." >&2
  exit 1
fi
echo "==> Using NSIS at: $NSIS_DIR"

echo "==> Generating dist/installer.nsi (version $VERSION)"
sed -e "s|@APP_VERSION@|$VERSION|g" \
    -e "s|@DIST_DIR@|$DIST|g" \
    "$ROOT/build/installer.nsi.tmpl" > "$DIST/installer.nsi"

echo "==> Compiling installer"
chmod +x "$NSIS_DIR/linux/makensis"
( cd "$DIST" && "$NSIS_DIR/linux/makensis" -DNSISDIR="$NSIS_DIR" installer.nsi )

OUT="$DIST/SOP-Builder-Setup-$VERSION.exe"
echo "==> Done: $OUT ($(du -h "$OUT" | cut -f1))"
echo "    Copy to releases/ to publish:  cp '$OUT' '$ROOT/releases/'"
