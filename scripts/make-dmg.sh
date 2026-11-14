#!/usr/bin/env bash
# Builds the downloadable Mac release: Umless-mac-arm64.dmg, holding Umless.app and a link
# to Applications. Unlike scripts/make-app.sh (the source install) it installs nothing and
# points at no checkout: on first launch the app asks which tier to download and keeps the
# models in ~/Library/Application Support/Umless/models.
#
#   scripts/make-dmg.sh                  # -> dist/release/Umless-mac-arm64.dmg
#
# Environment:
#   UMLESS_RELEASE_DIR     output folder (default dist/release)
#   UMLESS_SIGN_IDENTITY   codesign identity (default "-", ad hoc). A self-signed
#                          certificate keeps macOS permissions across updates (see
#                          docs/releasing.md); a "Developer ID Application: …" identity also
#                          turns on the hardened runtime and a secure timestamp.
#   UMLESS_NOTARY_PROFILE  a `xcrun notarytool store-credentials` profile: notarise and
#                          staple the dmg (needs a Developer ID identity).
set -euo pipefail
cd "$(dirname "$0")/.."

ID="io.github.jatinbishla.umless"
VERSION="$(grep -m1 '^version' Cargo.toml | cut -d'"' -f2)"
OUT="${UMLESS_RELEASE_DIR:-dist/release}"
IDENTITY="${UMLESS_SIGN_IDENTITY:--}"
DMG="$OUT/Umless-mac-arm64.dmg"
APP="$OUT/Umless.app"

[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] \
  || { echo "make-dmg.sh builds the Apple Silicon release on an Apple Silicon Mac" >&2; exit 1; }

for dir in "$HOME/.cargo/bin" /opt/homebrew/opt/rustup/bin /usr/local/opt/rustup/bin; do
  [ -x "$dir/cargo" ] && PATH="$dir:$PATH"
done
PATH="$PWD/.tools/cmake/bin:$PATH"
cargo build --release --locked

# Everything must come with the app: only system libraries may be linked dynamically.
if otool -L target/release/umless | tail -n +2 | grep -v -E '^\s+(/usr/lib/|/System/)'; then
  echo "umless links a library outside the system (above): it would be missing on other Macs" >&2
  exit 1
fi

rm -rf "$APP" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp target/release/umless "$APP/Contents/MacOS/Umless"
cp packaging/macos/Umless.icns "$APP/Contents/Resources/Umless.icns"  # from scripts/make-icons.sh

# As make-app.sh's, without LSEnvironment: no models folder or tier is baked in.
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$ID</string>
  <key>CFBundleName</key><string>Umless</string>
  <key>CFBundleDisplayName</key><string>Umless</string>
  <key>CFBundleExecutable</key><string>Umless</string>
  <key>CFBundleIconFile</key><string>Umless</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <!-- Menu-bar only: no Dock icon. -->
  <key>LSUIElement</key><true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>Umless listens only while you hold Fn, and turns your speech into text on this Mac.</string>
</dict>
</plist>
EOF

case "$IDENTITY" in
  "Developer ID Application"*)
    # Notarisation needs the hardened runtime; the microphone then needs its entitlement.
    codesign --force --sign "$IDENTITY" --identifier "$ID" --options runtime --timestamp \
      --entitlements packaging/macos/Umless.entitlements "$APP" ;;
  *)
    codesign --force --sign "$IDENTITY" --identifier "$ID" "$APP" ;;
esac
codesign --verify --strict "$APP"
echo "Signed Umless.app with identity: $IDENTITY"
codesign -d -r- "$APP" 2>&1 | grep designated || true

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# The dmg window: paper background with the wordmark and a red arrow to Applications, fixed
# icon positions and the app icon as the volume icon. dmgbuild (pinned, in a venv under
# .tools/) writes the Finder layout without scripting Finder, so it works headless. If it
# can't be installed or fails, the dmg is still built, just without the layout.
tiffutil -cathidpicheck packaging/macos/dmg-background.png packaging/macos/dmg-background@2x.png \
  -out "$STAGE/background.tiff" >/dev/null
VENV=.tools/dmgbuild-venv
if [ "${UMLESS_PLAIN_DMG:-}" != 1 ] && { [ -x "$VENV/bin/dmgbuild" ] \
     || { python3 -m venv "$VENV" && "$VENV/bin/pip" install -q dmgbuild==1.6.5; }; } \
   && "$VENV/bin/dmgbuild" -s packaging/macos/dmg-settings.py -D app="$APP" \
        -D background="$STAGE/background.tiff" -D volume_icon=packaging/macos/Umless.icns \
        "Umless" "$DMG"; then
  echo "Laid out the dmg window with dmgbuild"
else
  echo "dmgbuild unavailable or failed: building a plain dmg (no background or icon layout)" >&2
  rm -f "$DMG"
  ditto "$APP" "$STAGE/plain/Umless.app"
  ln -s /Applications "$STAGE/plain/Applications"
  hdiutil create -quiet -volname "Umless" -srcfolder "$STAGE/plain" -fs HFS+ -format UDZO -ov "$DMG"
fi

case "$IDENTITY" in
  -) ;;  # an ad hoc signature on a dmg means nothing to Gatekeeper
  "Developer ID Application"*) codesign --force --sign "$IDENTITY" --timestamp "$DMG" ;;
  *) codesign --force --sign "$IDENTITY" "$DMG" ;;
esac
if [ -n "${UMLESS_NOTARY_PROFILE:-}" ]; then
  xcrun notarytool submit "$DMG" --keychain-profile "$UMLESS_NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
fi

echo "Built $DMG ($(du -h "$DMG" | cut -f1)), Umless $VERSION"
