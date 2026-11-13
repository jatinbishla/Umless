# Builds the downloadable Windows release: Umless-windows-x64-setup.exe (Inno Setup).
# Unlike install.ps1 (the source install) it downloads no models: on first start Umless asks
# which tier to download, into %LOCALAPPDATA%\Umless\models.
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-windows-installer.ps1
#   -> dist\release\Umless-windows-x64-setup.exe
#
# Needs what install.ps1 needs to build (Rust, VS C++ build tools, cmake, LLVM) plus
# Inno Setup 6 (choco install innosetup, or winget install JRSoftware.InnoSetup).
#
# Environment:
#   UMLESS_RELEASE_DIR        output folder (default dist\release)
#   UMLESS_SIGN_PFX           a code-signing certificate (.pfx): signs umless.exe and the setup
#   UMLESS_SIGN_PFX_PASSWORD  its password
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)

if (-not $env:LIBCLANG_PATH -and (Test-Path "$env:ProgramFiles\LLVM\bin\libclang.dll")) {
  $env:LIBCLANG_PATH = "$env:ProgramFiles\LLVM\bin"
}
cargo build --release --locked
if ($LASTEXITCODE) { throw 'The build failed.' }

$version = (Select-String -Path Cargo.toml -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1).Matches[0].Groups[1].Value
$out = if ($env:UMLESS_RELEASE_DIR) { $env:UMLESS_RELEASE_DIR } else { 'dist\release' }
$stage = Join-Path $out 'windows'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item target\release\umless.exe $stage
# sherpa-onnx (speech) and onnxruntime are DLLs on Windows (the `shared` feature): they
# go next to the exe, as install.ps1 does.
$dlls = Get-ChildItem target\release -Filter *.dll
if (-not $dlls) { throw 'No DLLs in target\release: the sherpa-onnx shared libraries are missing.' }
$dlls | Copy-Item -Destination $stage

# The Visual C++ runtime, app-local, so a PC without the VC++ Redistributable still starts
# Umless (llama.cpp and sherpa-onnx link it dynamically).
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = if (Test-Path $vswhere) { & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
$crt = if ($vs) {
  Get-ChildItem "$vs\VC\Redist\MSVC\*\x64\Microsoft.VC14*.CRT" -Directory -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
}
if ($crt) {
  Copy-Item "$($crt.FullName)\*.dll" $stage
  Write-Host "Bundled the VC++ runtime from $($crt.FullName)"
} else {
  Write-Warning 'VC++ runtime DLLs not found: PCs without the VC++ Redistributable will not start Umless.'
}
Copy-Item LICENSE (Join-Path $stage 'LICENSE.txt')
Write-Host 'Staged:'; Get-ChildItem $stage | ForEach-Object { Write-Host "  $($_.Name)" }

function Sign($file) {
  if (-not $env:UMLESS_SIGN_PFX) { return }
  $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $signtool) { throw 'signtool.exe not found (Windows SDK).' }
  & $signtool.FullName sign /f $env:UMLESS_SIGN_PFX /p $env:UMLESS_SIGN_PFX_PASSWORD `
    /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $file
  if ($LASTEXITCODE) { throw "Signing $file failed." }
}
Sign (Join-Path $stage 'umless.exe')

$iscc = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
  $iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $iscc) { throw 'Inno Setup 6 is not installed: choco install innosetup (or winget install JRSoftware.InnoSetup).' }

New-Item -ItemType Directory -Force $out | Out-Null
& $iscc /Qp "/DAppVersion=$version" "/DSourceDir=$((Resolve-Path $stage).Path)" "/O$((Resolve-Path $out).Path)" packaging\windows\umless.iss
if ($LASTEXITCODE) { throw 'Inno Setup failed.' }
$setup = Join-Path $out 'Umless-windows-x64-setup.exe'
Sign $setup
Write-Host "Built $setup ($([math]::Round((Get-Item $setup).Length / 1MB)) MB), Umless $version"
