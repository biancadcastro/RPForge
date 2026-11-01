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
AppName=RPF Forge
AppVersion={#AppVersion}
AppPublisher=Bianca de Castro
DefaultDirName={localappdata}\Programs\RPF to FiveM
DefaultGroupName=RPF Forge
UsePreviousGroup=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
DisableProgramGroupPage=yes
DisableDirPage=no
LicenseFile={#PayloadDir}\LICENSE
OutputDir={#ReleaseDir}
OutputBaseFilename=RPF-Forge-Setup-{#AppVersion}-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\runtime\node.exe
SetupLogging=yes
ChangesAssociations=yes

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
Name: "{group}\RPF Forge"; Filename: "{app}\RPFForge.exe"
Name: "{group}\Como usar RPF Forge"; Filename: "{app}\LEIA-ME.txt"
Name: "{group}\Desinstalar RPF Forge"; Filename: "{uninstallexe}"

[Code]
var ModernMenuFailed: Boolean;

function GetCustomSetupExitCode(): Integer;
begin
  if ModernMenuFailed then Result := 20 else Result := 0;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer;
begin
  if CurStep = ssPostInstall then begin
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\windows\Register-ModernMenu.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then begin
      ModernMenuFailed := True;
      RaiseException('Nao foi possivel registrar o menu moderno. Para esta versao local, o certificado RPF Forge Local Test precisa ser autorizado pelo usuario antes de instalar.');
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
    Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\windows\Register-ModernMenu.ps1') + '" -Unregister', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
