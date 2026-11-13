# Releasing Umless

Each release has three downloads, built by `.github/workflows/release.yml`. Their names are
fixed because the website links to `https://github.com/jatinbishla/Umless/releases/latest/download/<name>`:

| File | What it is | Built by |
|---|---|---|
| `Umless-mac-arm64.dmg` | `Umless.app` (Apple Silicon, macOS 13+) and a link to Applications | `scripts/make-dmg.sh` (macos-15) |
| `Umless-windows-x64-setup.exe` | Inno Setup installer: `umless.exe`, the sherpa-onnx and onnxruntime DLLs and the Visual C++ runtime, per user in `%LOCALAPPDATA%\Programs\Umless`, with a Start menu entry. No admin prompt. | `scripts/make-windows-installer.ps1` (windows-latest) |
| `Umless-linux-x86_64.AppImage` | `umless` and the sherpa-onnx and onnxruntime `.so` files. GTK 3, WebKitGTK 4.1, AppIndicator and ALSA come from the system. | `scripts/make-appimage.sh` (ubuntu-latest) |

The release also gets `SHA256SUMS.txt`.

None of the downloads includes models. The first time Umless starts, its window asks which
tier to download (Lite, Standard or Max, with the download size, suggesting one for the
machine's memory as `install.sh` does) and shows the download's progress. The download uses
the same code as `umless models install`. The models go in a per-user folder:

- macOS: `~/Library/Application Support/Umless/models`
- Windows: `%LOCALAPPDATA%\Umless\models`
- Linux: `~/.local/share/umless/models` (`$XDG_DATA_HOME/umless/models`)

Source installs don't change. `install.sh` and `install.ps1` still use the clone's `models/`.
`umless` uses `./models` when it has models in it, or when the binary is a cargo build
(`target/release/umless`). Otherwise it uses the per-user folder. `--models` and
`UMLESS_MODELS` still override both. More tiers can be downloaded later from
Settings → Models.

## Cutting a release

1. Set `version` in the root `Cargo.toml` (e.g. `0.2.0`), run `cargo build` so `Cargo.lock`
   follows, and commit.
2. Tag the commit and push the tag: `git tag v0.2.0 && git push origin v0.2.0`. The workflow
   checks that the tag matches `Cargo.toml`.
3. When the three build jobs finish, a **draft** release named `Umless 0.2.0` holds the files.
   Download each one, try it (see the checks below), edit the notes and press **Publish**.
   `releases/latest/download/…` only points at published releases.

Running the workflow by hand (Actions → Release → Run workflow) builds the three files as
workflow artifacts and creates no release. Use it to test packaging changes.

Building locally works too. Each script writes to `dist/release/` (`UMLESS_RELEASE_DIR`
changes that). Each script only builds on its own OS:

```sh
scripts/make-dmg.sh                                              # Apple Silicon Mac
powershell -ExecutionPolicy Bypass -File scripts\make-windows-installer.ps1   # Windows + Inno Setup 6
scripts/make-appimage.sh                                         # x86_64 Linux
```

### Checks before publishing

- **Mac:** open the dmg, drag Umless to Applications and open it. Get past Gatekeeper (below).
  The window should open on "Welcome to Umless" with the tier picker. Download Lite, and
  Umless restarts into the permission setup. To try it without touching your own data:
  `HOME=$(mktemp -d) /path/to/Umless.app/Contents/MacOS/Umless`. That run uses an empty
  models folder, history and dictionary.
- **Windows:** run the setup and get past SmartScreen (below). Start Umless from the Start
  menu, download a tier and hold Ctrl + Win to dictate. Then uninstall it from Settings → Apps.
- **Linux:** `chmod +x Umless-linux-x86_64.AppImage && ./Umless-linux-x86_64.AppImage`.
  Download a tier and hold Ctrl + Super. This needs the `input` group, as with `install.sh`.

## What users see while the builds are unsigned

### macOS: Gatekeeper

The app is signed ad hoc and not notarised, so macOS won't open it on the first try.

**macOS 15 (Sequoia) and later:**
1. Open the dmg and drag **Umless** onto **Applications**.
2. Open Umless from Applications. macOS says *"Umless" Not Opened*. Click **Done**.
3. Open **System Settings → Privacy & Security** and scroll down to *Security*. Next to
   *"Umless" was blocked to protect your Mac*, click **Open Anyway**.
4. In the dialog, click **Open Anyway** again and enter your password (or use Touch ID).
   macOS remembers this choice for this copy of Umless.

**macOS 13 and 14:** in Applications, Control-click (or right-click) **Umless**, choose
**Open**, then click **Open** in the dialog.

Then the usual setup follows: Microphone, Accessibility and Input Monitoring, as with a
source install.

### Windows: SmartScreen

- **Edge** may say the file *isn't commonly downloaded*. Click **…** → **Keep**, then
  **Show more** → **Keep anyway**.
- Running the setup shows *Windows protected your PC*. Click **More info**, then
  **Run anyway**. Without a signature the publisher shows as *Unknown publisher*.
- Windows 11 Smart App Control, when it's on, blocks unsigned apps and has no
  "Run anyway". Those users need a signed build or must turn Smart App Control off.

### Linux

An AppImage needs no install. The user makes the file executable once. In GNOME Files:
right-click → **Properties** → turn on **Executable as Program**. In a terminal:
`chmod +x Umless-linux-x86_64.AppImage`. Then double-click it.

- The AppImage needs FUSE to mount itself. Ubuntu 22.04+ and Fedora have it.
  `APPIMAGE_EXTRACT_AND_RUN=1 ./Umless-…AppImage` works without it.
- System packages, if missing (Ubuntu names): `libgtk-3-0 libwebkit2gtk-4.1-0
  libayatana-appindicator3-1 libasound2`. Typing also needs `xdotool xclip` (X11) or
  `wl-clipboard wtype` (Wayland; on GNOME, `ydotool`). Seeing the hold key needs
  `sudo usermod -aG input $USER`, then logging out and back in. The setup screen explains
  each one.
- It's built on `ubuntu-latest` (24.04), so it needs glibc 2.39 or newer (Ubuntu 24.04+,
  Debian 13, Fedora 40+). Building on `ubuntu-22.04` instead would cover Ubuntu 22.04 and
  similar distros too.
- The AppImage adds no app-menu entry. AppImageLauncher or Gear Lever can add one, and
  Settings → Launch at login starts it at login.

## Updates and macOS permissions

Umless doesn't update itself yet. Users download the new version and replace the old one.
Models, history, dictionary and settings live outside the app, so they stay.

On macOS, Input Monitoring and Accessibility are granted to a **code signature**, not to a
file name. That's why the source install creates "Umless Local Signing"
(`scripts/make-signing-cert.sh`): every rebuild is signed by the same certificate, so macOS
treats it as the same app.

An **ad-hoc** signature has no certificate. macOS identifies the app by the hash of that
exact build, so **every new release counts as a different app**. After an update:

- macOS may ask for the microphone again.
- Input Monitoring and Accessibility still show Umless switched on, but they don't work.
  Umless opens on its setup screen. The user clicks **On but still not allowed? Reset** for
  each one, which clears the old entry, and allows it again. Input Monitoring then needs a
  restart (the button is there).

Two ways to fix this:

1. **Now, at no cost: a self-signed release certificate.** Make one certificate and sign
   every release with it. macOS then recognises updates as the same app and keeps the
   permissions. Gatekeeper's first-open warning stays the same. This is expected to work
   because it's how the local certificate already works on this Mac, but it hasn't been
   tried across a real update yet, so check it on the first one. To set it up:
   ```sh
   # make-signing-cert.sh's two openssl commands, with CN = Umless Release Signing,
   # cert.cnf as that script writes it; stop after the .p12 (no keychain import):
   /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
     -keyout key.pem -out cert.pem -config cert.cnf
   /usr/bin/openssl pkcs12 -export -inkey key.pem -in cert.pem \
     -name "Umless Release Signing" -out umless-release.p12
   base64 -i umless-release.p12 | pbcopy   # paste as the MACOS_SIGN_P12 secret
   ```
   Then add repository secrets `MACOS_SIGN_P12`, `MACOS_SIGN_P12_PASSWORD` (the export
   password) and `MACOS_SIGN_IDENTITY` = `Umless Release Signing`. Keep the `.p12` safe: a
   new certificate means one more round of re-granting.
   Users of earlier ad-hoc releases re-grant once more when they move to the first signed release.
2. **Later: an Apple Developer ID** (Apple Developer Program, $99/year). It removes the
   Gatekeeper warning and keeps permissions across updates.

## When a Developer ID exists (macOS)

1. In Xcode or on developer.apple.com, create a **Developer ID Application** certificate
   and export it with its key as a `.p12`.
2. Set the secrets `MACOS_SIGN_P12` (base64 of the `.p12`), `MACOS_SIGN_P12_PASSWORD` and
   `MACOS_SIGN_IDENTITY` = `Developer ID Application: <Name> (<TEAMID>)`.
   `make-dmg.sh` sees the `Developer ID Application` prefix. It then turns on the hardened
   runtime and a secure timestamp, and adds `packaging/macos/Umless.entitlements` (the
   microphone entitlement the hardened runtime needs).
3. For notarisation, add an app-specific password and these steps to the macOS job before
   "Build the dmg":
   ```yaml
   - name: Notary credentials
     if: runner.os == 'macOS'
     run: |
       xcrun notarytool store-credentials umless --apple-id "${{ secrets.APPLE_ID }}" \
         --team-id "${{ secrets.APPLE_TEAM_ID }}" --password "${{ secrets.APPLE_APP_PASSWORD }}" \
         --keychain "$RUNNER_TEMP/umless-sign.keychain-db"
       echo "UMLESS_NOTARY_PROFILE=umless" >> "$GITHUB_ENV"
   ```
   `make-dmg.sh` then submits the dmg, waits and staples the ticket. Not yet tested: confirm
   on the first notarised build that the hardened runtime doesn't break Metal or the
   microphone. (`notarytool submit` may also need `--keychain` with the same path. If so,
   add it in `make-dmg.sh`.)
4. Users moving from an ad-hoc or self-signed release re-grant Input Monitoring and
   Accessibility once. After that, updates keep them.

## When a Windows code-signing certificate exists

`make-windows-installer.ps1` signs `umless.exe` and the setup with `signtool` when
`UMLESS_SIGN_PFX` points at a `.pfx`. In CI, set the secrets `WINDOWS_SIGN_PFX` (base64 of
the `.pfx`) and `WINDOWS_SIGN_PFX_PASSWORD`. Since 2023, OV and EV certificates are issued on
hardware tokens or cloud HSMs and usually can't be exported as a `.pfx`. With **Azure
Trusted Signing** (the cheapest option for individuals) or a cloud HSM, replace the `Sign`
function in the script with that service's signing step (e.g. the
`azure/trusted-signing-action`), for both files. A signature names the publisher. An EV
certificate or Trusted Signing also builds SmartScreen reputation faster, so the warning
disappears sooner.

## Untested parts

The Windows installer and the AppImage were written without a Windows or Linux machine. The
first run of the workflow is their first test. Check especially that Inno Setup installs or
is found on `windows-latest`, the DLL list in the setup, the console window briefly flashing
when the Start-menu entry starts Umless, `appimagetool` 1.9.0's download URL and the
AppImage starting on a desktop. The macOS dmg was built and its first-run screen checked on
an Apple Silicon Mac.
