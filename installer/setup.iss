#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef PayloadDir
  #error PayloadDir is required
#endif
#ifndef ReleaseDir
  #error ReleaseDir is required
#endif

[Setup]
AppId={{5B15119A-256C-4285-A0F0-AF8435859EA1}
AppName=RPF to FiveM
AppVersion={#AppVersion}
AppPublisher=Bianca de Castro
DefaultDirName={localappdata}\Programs\RPF to FiveM
DefaultGroupName=RPF to FiveM
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
DisableProgramGroupPage=yes
DisableDirPage=no
LicenseFile={#PayloadDir}\LICENSE
OutputDir={#ReleaseDir}
OutputBaseFilename=RPF-to-FiveM-Setup-{#AppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\runtime\node.exe
SetupLogging=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM"; ValueType: string; ValueData: "Converter RPF para FiveM"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\runtime\node.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM\command"; ValueType: string; ValueData: """{app}\runtime\node.exe"" ""{app}\src\cli.js"" --interactive ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM"; ValueType: string; ValueData: "Converter RPF para FiveM"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\runtime\node.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM\command"; ValueType: string; ValueData: """{app}\runtime\node.exe"" ""{app}\src\cli.js"" --interactive ""%V"""

[Icons]
Name: "{group}\Como usar RPF to FiveM"; Filename: "{app}\LEIA-ME.txt"
Name: "{group}\Desinstalar RPF to FiveM"; Filename: "{uninstallexe}"
