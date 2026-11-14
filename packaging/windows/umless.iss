; Inno Setup script for Umless-windows-x64-setup.exe. Built by scripts/make-windows-installer.ps1,
; which stages umless.exe, the sherpa-onnx / onnxruntime DLLs and the VC++ runtime in SourceDir.
;
; Installs per user (no admin prompt) to %LOCALAPPDATA%\Programs\Umless, adds a Start menu
; entry and offers to start Umless. Models are not in the installer: on first start Umless asks
; which tier to download, into %LOCALAPPDATA%\Umless\models. Uninstalling leaves the models,
; history and dictionary (%LOCALAPPDATA%\Umless, %APPDATA%\Umless) in place.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\dist\release\windows"
#endif

[Setup]
AppId={{1D8F8533-81BD-41D9-90E0-2255D8B31E11}
AppName=Umless
AppVersion={#AppVersion}
AppVerName=Umless {#AppVersion}
AppPublisher=Umless
AppPublisherURL=https://github.com/jatinbishla/Umless
AppSupportURL=https://github.com/jatinbishla/Umless/issues
DefaultDirName={localappdata}\Programs\Umless
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=Umless-windows-x64-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Brand artwork from scripts/make-icons.sh (paths are relative to this script). Each image
; comes at 100% and 200% so Inno Setup picks the sharper one on high-DPI screens.
SetupIconFile=umless.ico
WizardImageFile=wizard.bmp,wizard-2x.bmp
WizardSmallImageFile=wizard-small.bmp,wizard-small-2x.bmp
AppComments=Talk messy. It types clean.
UninstallDisplayName=Umless
UninstallDisplayIcon={app}\umless.exe
; Umless lives in the tray: close it before files are replaced.
CloseApplications=force
RestartApplications=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Umless"; Filename: "{app}\umless.exe"; Parameters: "app --window"; WorkingDir: "{app}"; Comment: "Local voice dictation"

[Run]
Filename: "{app}\umless.exe"; Parameters: "app --window"; WorkingDir: "{app}"; Description: "Start Umless"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im umless.exe"; Flags: runhidden; RunOnceId: "StopUmless"

[Registry]
; Launch at Login (set from the app) writes this value; remove it with the app.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "Umless"; Flags: dontcreatekey uninsdeletevalue
