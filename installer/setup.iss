#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef PayloadDir
  #error PayloadDir is required
#endif
#ifndef ReleaseDir
  #error ReleaseDir is required
#endif
#ifndef LocalCertificateHash
  #error LocalCertificateHash is required
#endif
#ifndef PresentationDir
  #error PresentationDir is required; run scripts/Prepare-InstallerPresentation.mjs
#endif

[Setup]
AppId={code:GetInstallationId}
AppName=RPForge
AppVersion={#AppVersion}
AppPublisher=Bianca de Castro
DefaultDirName={localappdata}\Programs\RPForge
DefaultGroupName=RPForge
UsePreviousGroup=no
UsePreviousAppDir=no
UsePreviousLanguage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
DisableProgramGroupPage=yes
DisableDirPage=no
OutputDir={#ReleaseDir}
OutputBaseFilename=RPForge-Setup-{#AppVersion}-x64
#ifdef LocalInstallerTest
Compression=lzma2/fast
#else
Compression=lzma2
#endif
SolidCompression=yes
#include "presentation-setup.iss"
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\RPFForge.exe
SetupIconFile={#PayloadDir}\shell\rpforge-mark-v3.ico
SetupLogging=yes
ChangesAssociations=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
#include "presentation-files.iss"
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PresentationDir}\terms-license.txt"; DestDir: "{app}\legal"; DestName: "TERMOS-E-LICENCA.txt"; Flags: ignoreversion
Source: "{#PresentationDir}\privacy.txt"; DestDir: "{app}\legal"; DestName: "PRIVACIDADE.txt"; Flags: ignoreversion
Source: "{#PresentationDir}\third-party.txt"; DestDir: "{app}\legal"; DestName: "AVISOS-DE-TERCEIROS.txt"; Flags: ignoreversion
Source: "{#PresentationDir}\chromium-notices.txt"; DestDir: "{app}\legal"; DestName: "CHROMIUM-LICENSES.txt"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM"; ValueType: string; ValueData: "Converter RPFs com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RpfToFiveM\command"; ValueType: string; ValueData: """{app}\runtime\node.exe"" ""{app}\src\cli.js"" --interactive ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM"; ValueType: string; ValueData: "Converter RPFs com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RpfToFiveM\command"; ValueType: string; ValueData: """{app}\runtime\node.exe"" ""{app}\src\cli.js"" --interactive ""%V"""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeYtyp"; ValueType: string; ValueData: "Gerar YTYP com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeYtyp"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeYtyp\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --ytyp ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeYtyp"; ValueType: string; ValueData: "Gerar YTYP com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeYtyp"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeYtyp\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --ytyp ""%V"""

Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj"; ValueType: string; ValueData: "Roupas para OBJ com RPForge"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj"; ValueType: string; ValueName: "MultiSelectModel"; ValueData: "Single"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --obj ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeObj"; ValueType: string; ValueData: "Roupas para OBJ com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeObj"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeObj\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --obj-folder ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeObj"; ValueType: string; ValueData: "Roupas para OBJ com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeObj"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeObj\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --obj-folder ""%V"""

Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeNeon"; ValueType: string; ValueData: "Roupas para Neon com RPForge"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeNeon"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeNeon\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --neon ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeNeon"; ValueType: string; ValueData: "Roupas para Neon com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeNeon"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeNeon\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --neon-folder ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeNeon"; ValueType: string; ValueData: "Roupas para Neon com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeNeon"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeNeon\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --neon-folder ""%V"""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeSkin"; ValueType: string; ValueData: "Separar pele com RPForge"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeSkin"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeSkin\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --skin ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeSkin"; ValueType: string; ValueData: "Separar pele com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeSkin"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeSkin\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --skin-folder ""%1"""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeSkin"; ValueType: string; ValueData: "Separar pele com RPForge"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeSkin"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\RPFForge.exe"",0"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeSkin\command"; ValueType: string; ValueData: """{app}\RPFForge.exe"" --skin-folder ""%V"""

Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{3C9EE5A7-895C-46E2-931B-13A51EA7A842}"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeObj"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{3C9EE5A7-895C-46E2-931B-13A51EA7A842}"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeObj"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeObj"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{3C9EE5A7-895C-46E2-931B-13A51EA7A842}"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeObj"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeNeon"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{86A7BF51-2C9E-4B80-94F2-8920FB8F4299}"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeNeon"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeNeon"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{86A7BF51-2C9E-4B80-94F2-8920FB8F4299}"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeNeon"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeNeon"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{86A7BF51-2C9E-4B80-94F2-8920FB8F4299}"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeNeon"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeSkin"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{B91E247D-60A8-4CE3-99B7-F3D44D1EAD50}"
Root: HKCU; Subkey: "Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeSkin"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeSkin"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{B91E247D-60A8-4CE3-99B7-F3D44D1EAD50}"
Root: HKCU; Subkey: "Software\Classes\Directory\shell\RPForgeSkin"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeSkin"; ValueType: string; ValueName: "CommandStateHandler"; ValueData: "{{B91E247D-60A8-4CE3-99B7-F3D44D1EAD50}"
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\RPForgeSkin"; ValueType: string; ValueName: "LegacyDisable"; ValueData: ""

[Icons]
Name: "{group}\RPForge"; Filename: "{app}\RPFForge.exe"
Name: "{group}\Como usar RPForge"; Filename: "{app}\LEIA-ME.txt"
Name: "{group}\Desinstalar RPForge"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\RPFForge.exe"; Description: "Abrir o RPForge"; Flags: nowait postinstall skipifsilent

[Code]
#include "presentation-code.iss"
var
  ModernMenuFailed: Boolean;
  LocalTrustPage: TInputOptionWizardPage;

procedure InitializeWizard();
begin
  LocalTrustPage := CreateInputOptionPage(wpLicense, 'Confiança local do RPForge',
    'Revise esta alteração de segurança antes de instalar.',
    'Para ativar o menu principal do Explorer, o instalador pode adicionar o certificado público RPF Forge Local Test em TrustedPeople para todos os usuários deste computador.' + #13#10#13#10 +
    'Isso permite confiar também em outros arquivos assinados com a mesma chave. Não é um certificado público validado e não garante remover alertas do SmartScreen ou do antivírus. Nenhum certificado raiz será instalado.' + #13#10#13#10 +
    'Ao autorizar, a importação será automática após a confirmação de administrador. Sem autorização, o aplicativo será instalado com o menu clássico em Mostrar mais opções. A desinstalação não revoga essa confiança automaticamente.', False, False);
  LocalTrustPage.Add('Autorizo instalar o certificado local para todos os usuários e ativar o menu moderno.');
  LocalTrustPage.Values[0] := False;
  ForgeInitializePresentation;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  ForgeUpdatePresentation(CurPageID);
end;

procedure DeinitializeSetup;
begin
  ForgeReleasePresentation;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if (ForgeDocumentPopup <> nil) and ForgeDocumentPopup.Visible then begin
    ForgeCloseDocumentPopup;
    WizardForm.ActiveControl := ForgeDocumentSelector;
    Cancel := False;
    Confirm := False;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if WizardSilent then Result := True
  else Result := not ForgeConfirmOpenDocument;
end;

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
    { Silent installations must never grant certificate trust. }
    if WizardSilent or not LocalTrustPage.Values[0] then Exit;
    if not ShellExec('runas', ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\windows\Trust-InstallerCertificate.ps1') + '" -CertificatePath "' + ExpandConstant('{app}\shell\RPFForge.LocalTest.cer') + '" -ExpectedSha256 {#LocalCertificateHash}',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then begin
      ModernMenuFailed := True;
      MsgBox('A confiança local não foi instalada. O RPForge continua disponível pelo aplicativo e pelo menu clássico em Mostrar mais opções.', mbInformation, MB_OK);
      Exit;
    end;
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\windows\Register-ModernMenu.ps1') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then begin
      ModernMenuFailed := True;
      MsgBox('Não foi possível ativar o menu moderno. O RPForge continua disponível pelo aplicativo e pelo menu clássico em Mostrar mais opções.', mbInformation, MB_OK);
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
