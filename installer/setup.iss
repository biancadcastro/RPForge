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
AppId={code:GetInstallationId}
AppName=RPForge
AppVersion={#AppVersion}
AppPublisher=Bianca de Castro
DefaultDirName={localappdata}\Programs\RPF to FiveM
DefaultGroupName=RPForge
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
UninstallDisplayIcon={app}\RPFForge.exe
SetupIconFile={#PayloadDir}\shell\rpforge-mark-v3.ico
SetupLogging=yes
ChangesAssociations=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM"; ValueType: string; ValueData: "Converter com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM\command"; ValueType: string; ValueData: """{app}\runtime\node.exe"" ""{app}\src\cli.js"" --interactive ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM"; ValueType: string; ValueData: "Converter com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM\command"; ValueType: string; ValueData: """{app}\runtime\node.exe"" ""{app}\src\cli.js"" --interactive ""%V"""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeYtyp"; ValueType: string; ValueData: "Gerar YTYP com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeYtyp"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeYtyp\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --ytyp ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeYtyp"; ValueType: string; ValueData: "Gerar YTYP com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeYtyp"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeYtyp\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --ytyp ""%V"""

[Icons]
Name: "{group}\RPForge"; Filename: "{app}\RPFForge.exe"
Name: "{group}\Como usar RPForge"; Filename: "{app}\LEIA-ME.txt"
Name: "{group}\Desinstalar RPForge"; Filename: "{uninstallexe}"

[Code]
var ModernMenuFailed: Boolean;

function GetInstallationId(Param: String): String;
begin
  { The audit uses a separate uninstall entry and never upgrades the user's app. }
  if ExpandConstant('{param:AuditMode|0}') = '1' then
    Result := '{831755BE-B77D-467F-8926-089B00A8777F}'
  else Result := '{5B15119A-256C-4285-A0F0-AF8435859EA1}';
end;

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
  if CurUninstallStep = usUninstall then begin
    Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\windows\Register-ModernMenu.ps1') + '" -Unregister', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\windows\Uninstall-ContextMenu.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
