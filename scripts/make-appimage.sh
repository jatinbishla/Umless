#!/usr/bin/env bash
# Builds the downloadable Linux release: Umless-linux-x86_64.AppImage. It carries umless and
# the sherpa-onnx / onnxruntime shared libraries; GTK 3, WebKitGTK 4.1, AppIndicator, ALSA
# and the typing tools (xdotool/xclip or wtype/wl-clipboard) come from the system, as with
# install.sh. Models aren't included: on first start Umless asks which tier to download,
# into ~/.local/share/umless/models.
#
#   scripts/make-appimage.sh          # -> dist/release/Umless-linux-x86_64.AppImage
#
# Environment:
#   UMLESS_RELEASE_DIR   output folder (default dist/release)
#   APPIMAGETOOL         path to appimagetool (default: downloaded into .tools/)
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] \
  || { echo "make-appimage.sh builds the x86_64 Linux release on x86_64 Linux" >&2; exit 1; }

OUT="${UMLESS_RELEASE_DIR:-dist/release}"
APPDIR="$OUT/Umless.AppDir"
IMAGE="$OUT/Umless-linux-x86_64.AppImage"
APPIMAGETOOL_VERSION=1.9.0

for dir in "$HOME/.cargo/bin"; do [ -x "$dir/cargo" ] && PATH="$dir:$PATH"; done
cargo build --release --locked

rm -rf "$APPDIR" "$IMAGE"
LIB="$APPDIR/usr/lib/umless"
mkdir -p "$LIB" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/icons/hicolor/scalable/apps"
install -m 755 target/release/umless "$LIB/umless"
# The speech libraries go next to the binary: its rpath is $ORIGIN (see docs/cross-platform.md).
cp -P target/release/*.so* "$LIB/" 2>/dev/null || true
ls "$LIB"/*.so* >/dev/null 2>&1 \
  || { echo "no sherpa-onnx shared libraries in target/release" >&2; exit 1; }

install -m 755 packaging/linux/AppRun "$APPDIR/AppRun"
install -m 644 packaging/linux/umless.desktop "$APPDIR/umless.desktop"
install -m 644 packaging/linux/umless.desktop "$APPDIR/usr/share/applications/umless.desktop"
install -m 644 packaging/linux/umless.svg "$APPDIR/umless.svg"
install -m 644 packaging/linux/umless.svg "$APPDIR/usr/share/icons/hicolor/scalable/apps/umless.svg"

# Every library umless needs must resolve, and the speech ones from inside the AppDir.
MISSING=$(LD_LIBRARY_PATH="$LIB" ldd "$LIB/umless" | grep 'not found' || true)
[ -z "$MISSING" ] || { echo "unresolved libraries:"$'\n'"$MISSING" >&2; exit 1; }
echo "Bundled libraries:"; LD_LIBRARY_PATH="$LIB" ldd "$LIB/umless" | grep "$LIB" || true

TOOL="${APPIMAGETOOL:-}"
if [ -z "$TOOL" ]; then
  TOOL="$PWD/.tools/appimagetool-$APPIMAGETOOL_VERSION-x86_64.AppImage"
  if [ ! -x "$TOOL" ]; then
    mkdir -p .tools
    curl -fsSL -o "$TOOL" \
      "https://github.com/AppImage/appimagetool/releases/download/$APPIMAGETOOL_VERSION/appimagetool-x86_64.AppImage"
    chmod +x "$TOOL"
  fi
fi
# Extract-and-run: CI runners (and containers) often have no FUSE.
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$TOOL" --no-appstream "$APPDIR" "$IMAGE"
chmod +x "$IMAGE"
echo "Built $IMAGE ($(du -h "$IMAGE" | cut -f1))"
