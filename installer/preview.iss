; Visual harness only: no payload, registry, certificate, integration or installation.
#ifndef PresentationDir
  #error PresentationDir is required
#endif
#ifndef PreviewOutput
  #error PreviewOutput is required
#endif
#ifndef AppVersion
  #error AppVersion is required; run scripts/Preview-Installer.ps1 (reads package.json)
#endif
[Setup]
AppName=RPForge — prévia visual
AppVersion={#AppVersion}
AppId=RPForgeInstallerPresentationPreview
AppPublisher=Bianca de Castro
DefaultDirName={tmp}\RPForge-visual-preview
CreateAppDir=no
Uninstallable=no
CreateUninstallRegKey=no
PrivilegesRequired=lowest
OutputDir={#PreviewOutput}
OutputBaseFilename=RPForge-Installer-VisualPreview
; Same icon as the real setup: Build-Shell.ps1 copies this file to shell\rpforge-mark-v3.ico.
SetupIconFile={#AddBackslash(SourcePath)}..\desktop\assets\rpforge.ico
Compression=lzma2
SolidCompression=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
#include "presentation-setup.iss"
[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
[Files]
#include "presentation-files.iss"
[Code]
#include "presentation-code.iss"
procedure InitializeWizard;
begin
  ForgeInitializePresentation;
end;
function ShouldSkipPage(PageID: Integer): Boolean;
var PreviewPage: String;
begin
  PreviewPage := ExpandConstant('{param:PreviewPage|welcome}');
  Result := ((PreviewPage = 'license') and (PageID = wpWelcome)) or
    ((PreviewPage = 'documents') and ((PageID = wpWelcome) or (PageID = wpLicense)));
end;
procedure CurPageChanged(CurPageID: Integer);
var ReviewDirectory: String; Index: Integer;
begin
  ForgeUpdatePresentation(CurPageID);
  if CurPageID = wpReady then begin
    WizardForm.PageNameLabel.Caption := 'Prévia concluída';
    WizardForm.PageDescriptionLabel.Caption := 'Esta prévia não instala o aplicativo nem altera o Windows.';
    WizardForm.ReadyMemo.Text := 'Tema, termos, licença, privacidade e avisos de terceiros conferidos.';
    WizardForm.NextButton.Caption := 'Fechar prévia';
  end;
  ForgeRefreshNavigation;
  ReviewDirectory := ExpandConstant('{param:ReviewButtons|}');
  if ReviewDirectory <> '' then begin
    ForceDirectories(ReviewDirectory);
    ForgeButtonImages[0].SaveToFile(ReviewDirectory + '\back.bmp');
    ForgeButtonImages[1].SaveToFile(ReviewDirectory + '\next.bmp');
    ForgeButtonImages[2].SaveToFile(ReviewDirectory + '\cancel.bmp');
    SaveStringToFile(ReviewDirectory + '\state.txt',
      'Page=' + IntToStr(CurPageID) + #13#10 +
      'NextEnabled=' + IntToStr(Ord(WizardForm.NextButton.Enabled)) + #13#10 +
      'NativeBitmap=' + IntToStr(Ord((ForgeGetButtonStyle(WizardForm.NextButton.Handle, -16) and $80) <> 0)), False);
    if CurPageID = ForgeLegalPage.ID then begin
      for Index := 0 to 3 do begin
        ForgeChooseDocument(ForgeDocumentOptions[Index]);
        if ForgeDocumentText.Lines.Count = 0 then RaiseException('Documento vazio na prévia.');
        SaveStringToFile(ReviewDirectory + '\state.txt', #13#10 +
          'Document' + IntToStr(Index) + '=' + IntToStr(ForgeDocumentText.Lines.Count), True);
      end;
      ForgeChooseDocument(ForgeDocumentOptions[0]);
      ForgeDocumentImages[0].SaveToFile(ReviewDirectory + '\select.bmp');
      ForgeDocumentImages[1].SaveToFile(ReviewDirectory + '\selected-option.bmp');
      SaveStringToFile(ReviewDirectory + '\state.txt', #13#10 +
        'BodyFont=' + ForgeDocumentText.Font.Name + #13#10 +
        'BodySize=' + IntToStr(ForgeDocumentText.Font.Size), True);
    end;
  end;
end;
function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if ForgeConfirmOpenDocument then begin
    Result := False;
    Exit;
  end;
  Result := CurPageID <> wpReady;
  if not Result then WizardForm.Close;
end;
procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if (ForgeDocumentPopup <> nil) and ForgeDocumentPopup.Visible then begin
    ForgeCloseDocumentPopup;
    WizardForm.ActiveControl := ForgeDocumentSelector;
    Cancel := False;
  end;
  Confirm := False;
end;
procedure DeinitializeSetup;
begin
  ForgeReleasePresentation;
end;
