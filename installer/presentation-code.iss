var
  ForgeLegalPage: TWizardPage;
  ForgeDocumentText: TRichEditViewer;
  ForgeHeaderLogo: TBitmapImage;
  ForgeDisplayFont, ForgeBodyFont: String;

#include "presentation-buttons.iss"
#include "presentation-documents.iss"

function ForgeAddFont(FileName: String; Flags: DWORD; Reserved: LongWord): Integer;
  external 'AddFontResourceExW@gdi32.dll stdcall';
function ForgeRemoveFont(FileName: String; Flags: DWORD; Reserved: LongWord): Boolean;
  external 'RemoveFontResourceExW@gdi32.dll stdcall';

procedure ForgeStyleDocument(Viewer: TRichEditViewer);
begin
  { The dark VCL style changes the surface, but not the plain document's ink. }
  { These documents are plain text; avoid RichEdit's stored black formatting. }
  Viewer.UseRichEdit := False;
  Viewer.StyleElements := [seBorder];
  Viewer.BorderStyle := bsNone;
  Viewer.Color := $00271D1D;
  Viewer.Font.Name := 'Atkinson Hyperlegible';
  Viewer.Font.Size := 11;
  Viewer.Font.Color := $00E8F1F5;
end;

procedure ForgeReadDocument(Sender: TObject);
var FileName: String;
begin
  case ForgeDocumentIndex of
    0: FileName := 'privacy.txt';
    1: FileName := 'terms-license.txt';
    2: FileName := 'third-party.txt';
    3: FileName := 'chromium-notices.txt';
  end;
  ExtractTemporaryFile(FileName);
  ForgeDocumentText.Lines.LoadFromFile(ExpandConstant('{tmp}\') + FileName);
  ForgeStyleDocument(ForgeDocumentText);
  ForgeDocumentText.SelStart := 0;
end;

procedure ForgeChooseDocument(Sender: TObject);
var Index: Integer;
begin
  ForgeDocumentIndex := TBitmapButton(Sender).Tag;
  ForgeDocumentSelector.Caption := ForgeDocumentName(ForgeDocumentIndex);
  ForgePaintDocumentButton(ForgeDocumentSelector, ForgeDocumentImages[0], False, True);
  for Index := 0 to 3 do
    ForgePaintDocumentButton(ForgeDocumentOptions[Index], ForgeDocumentImages[Index + 1], Index = ForgeDocumentIndex, False);
  ForgeCloseDocumentPopup;
  ForgeReadDocument(nil);
  if ForgeDocumentSelector.CanFocus then WizardForm.ActiveControl := ForgeDocumentSelector;
end;

procedure ForgeDocumentBodyClick(Sender: TObject);
begin
  ForgeCloseDocumentPopup;
end;

procedure ForgeBrandImage(Parent: TWinControl; FileName: String; X, Y, W, H: Integer);
var Image: TBitmapImage;
begin
  ExtractTemporaryFile(FileName);
  Image := TBitmapImage.Create(WizardForm);
  Image.Parent := Parent;
  Image.SetBounds(X, Y, W, H);
  Image.BackColor := clNone;
  Image.Stretch := True;
  Image.PngImage.LoadFromFile(ExpandConstant('{tmp}\') + FileName);
  if Parent = WizardForm.MainPanel then ForgeHeaderLogo := Image;
end;

procedure ForgeAlignHeader;
var ContentLeft, ContentRight, TextWidth, HeaderBottom: Integer;
begin
  { The title, subtitle and document frame share the same content gutter. }
  ContentLeft := WizardForm.PageDescriptionLabel.Left;
  ContentRight := ContentLeft + ForgeLegalPage.SurfaceWidth;
  ForgeHeaderLogo.Left := ContentRight - ForgeHeaderLogo.Width;
  TextWidth := ForgeHeaderLogo.Left - ContentLeft - ScaleX(24);
  WizardForm.PageNameLabel.Left := ContentLeft;
  WizardForm.PageNameLabel.Width := TextWidth;
  WizardForm.PageDescriptionLabel.Width := TextWidth;
  HeaderBottom := WizardForm.PageDescriptionLabel.Top + ScaleY(18);
  ForgeHeaderLogo.Top := WizardForm.PageNameLabel.Top +
    (HeaderBottom - WizardForm.PageNameLabel.Top - ForgeHeaderLogo.Height) div 2;
end;

procedure ForgeInitializePresentation;
var Index: Integer;
begin
  ExtractTemporaryFile('forge-display.ttf');
  ExtractTemporaryFile('forge-body.ttf');
  ForgeDisplayFont := ExpandConstant('{tmp}\forge-display.ttf');
  ForgeBodyFont := ExpandConstant('{tmp}\forge-body.ttf');
  ForgeAddFont(ForgeDisplayFont, 16, 0);
  ForgeAddFont(ForgeBodyFont, 16, 0);
  WizardForm.Font.Name := 'Atkinson Hyperlegible';
  WizardForm.Font.Size := 10;
  WizardForm.Caption := 'Instalar RPForge';
  WizardForm.WelcomeLabel1.Font.Name := 'Pixelify Sans';
  WizardForm.WelcomeLabel1.Font.Size := 23;
  WizardForm.WelcomeLabel1.Font.Style := [];
  WizardForm.WelcomeLabel1.AutoSize := False;
  WizardForm.WelcomeLabel1.Height := ScaleY(86);
  WizardForm.WelcomeLabel2.Top := WizardForm.WelcomeLabel1.Top + WizardForm.WelcomeLabel1.Height + ScaleY(22);
  WizardForm.WelcomeLabel2.Height := WizardForm.WelcomePage.ClientHeight - WizardForm.WelcomeLabel2.Top - ScaleY(24);
  WizardForm.FinishedHeadingLabel.Font.Name := 'Pixelify Sans';
  WizardForm.FinishedHeadingLabel.Font.Size := 23;
  WizardForm.FinishedHeadingLabel.Font.Style := [];
  WizardForm.PageNameLabel.Font.Name := 'Pixelify Sans';
  WizardForm.PageNameLabel.Font.Size := 17;
  WizardForm.PageNameLabel.Font.Style := [];
  WizardForm.PageNameLabel.AutoSize := False;
  WizardForm.PageNameLabel.Height := ScaleY(32);
  WizardForm.PageNameLabel.WordWrap := False;
  WizardForm.PageDescriptionLabel.AutoSize := False;
  WizardForm.PageDescriptionLabel.Top := WizardForm.PageNameLabel.Top + ScaleY(34);
  WizardForm.PageDescriptionLabel.Height := ScaleY(30);
  WizardForm.FinishedHeadingLabel.AutoSize := False;
  WizardForm.FinishedHeadingLabel.Height := ScaleY(54);
  ForgeStyleDocument(WizardForm.LicenseMemo);
  WizardForm.NextButton.Font.Name := 'Pixelify Sans';
  WizardForm.NextButton.Font.Size := 12;
  WizardForm.BackButton.Font.Name := 'Atkinson Hyperlegible';
  WizardForm.CancelButton.Font.Name := 'Atkinson Hyperlegible';
  WizardForm.WizardBitmapImage.Visible := False;
  WizardForm.WizardBitmapImage2.Visible := False;
  WizardForm.WizardSmallBitmapImage.Visible := False;
  ForgeBrandImage(WizardForm.WelcomePage, 'forge-logo.png', ScaleX(24), ScaleY(30), ScaleX(150), ScaleY(53));
  ForgeBrandImage(WizardForm.WelcomePage, 'forge-symbol.png', ScaleX(47), ScaleY(130), ScaleX(104), ScaleY(135));
  ForgeBrandImage(WizardForm.FinishedPage, 'forge-logo.png', ScaleX(24), ScaleY(30), ScaleX(150), ScaleY(53));
  ForgeBrandImage(WizardForm.FinishedPage, 'forge-symbol.png', ScaleX(47), ScaleY(130), ScaleX(104), ScaleY(135));
  ForgeBrandImage(WizardForm.MainPanel, 'forge-logo.png', WizardForm.MainPanel.ClientWidth - ScaleX(137), ScaleY(15), ScaleX(111), ScaleY(39));
  WizardForm.PageNameLabel.Width := WizardForm.MainPanel.ClientWidth - ScaleX(170);
  WizardForm.PageDescriptionLabel.Width := WizardForm.PageNameLabel.Width;
  ForgeInitializeNavigation;
  ForgeLegalPage := CreateCustomPage(wpLicense, 'Privacidade e componentes', 'Documentos incluídos para leitura offline.');
  ForgeAlignHeader;
  for Index := 0 to 4 do ForgeDocumentImages[Index] := TBitmap.Create;
  ForgeDocumentSelector := TBitmapButton.Create(WizardForm);
  ForgeDocumentSelector.Parent := ForgeLegalPage.Surface;
  ForgeDocumentSelector.SetBounds(0, 0, ForgeLegalPage.SurfaceWidth, ScaleY(38));
  ForgeDocumentSelector.Caption := ForgeDocumentName(0);
  ForgeDocumentSelector.Hint := 'Escolher documento. Use Tab para navegar pelas opções.';
  ForgeDocumentSelector.ShowHint := True;
  ForgeDocumentSelector.OnClick := @ForgeToggleDocuments;
  ForgePaintDocumentButton(ForgeDocumentSelector, ForgeDocumentImages[0], False, True);
  ForgeDocumentFrame := TPanel.Create(WizardForm);
  ForgeDocumentFrame.Parent := ForgeLegalPage.Surface;
  ForgeDocumentFrame.StyleElements := [];
  ForgeDocumentFrame.Color := $00443434;
  ForgeDocumentFrame.BevelOuter := bvNone;
  ForgeDocumentFrame.SetBounds(0, ScaleY(52), ForgeLegalPage.SurfaceWidth, ForgeLegalPage.SurfaceHeight - ScaleY(52));
  ForgeDocumentSurface := TPanel.Create(WizardForm);
  ForgeDocumentSurface.Parent := ForgeDocumentFrame;
  ForgeDocumentSurface.StyleElements := [];
  ForgeDocumentSurface.Color := $00271D1D;
  ForgeDocumentSurface.BevelOuter := bvNone;
  ForgeDocumentSurface.SetBounds(1, 1, ForgeDocumentFrame.ClientWidth - 2, ForgeDocumentFrame.ClientHeight - 2);
  ForgeDocumentText := TRichEditViewer.Create(WizardForm);
  ForgeStyleDocument(ForgeDocumentText);
  ForgeDocumentText.Parent := ForgeDocumentSurface;
  ForgeDocumentText.SetBounds(ScaleX(16), ScaleY(14), ForgeDocumentSurface.ClientWidth - ScaleX(26), ForgeDocumentSurface.ClientHeight - ScaleY(28));
  ForgeDocumentText.ReadOnly := True;
  ForgeDocumentText.ScrollBars := ssVertical;
  ForgeDocumentText.Font.Name := 'Atkinson Hyperlegible';
  ForgeDocumentText.Font.Size := 11;
  ForgeDocumentText.OnClick := @ForgeDocumentBodyClick;
  ForgeDocumentPopup := TPanel.Create(WizardForm);
  ForgeDocumentPopup.Parent := ForgeLegalPage.Surface;
  ForgeDocumentPopup.StyleElements := [];
  ForgeDocumentPopup.BevelOuter := bvNone;
  ForgeDocumentPopup.Color := $004F4242;
  ForgeDocumentPopup.SetBounds(0, ScaleY(42), ForgeLegalPage.SurfaceWidth, ScaleY(154));
  for Index := 0 to 3 do begin
    ForgeDocumentOptions[Index] := TBitmapButton.Create(WizardForm);
    ForgeDocumentOptions[Index].Parent := ForgeDocumentPopup;
    ForgeDocumentOptions[Index].Tag := Index;
    ForgeDocumentOptions[Index].Caption := ForgeDocumentName(Index);
    ForgeDocumentOptions[Index].SetBounds(1, ScaleY(2 + Index * 37), ForgeDocumentPopup.ClientWidth - 2, ScaleY(37));
    ForgeDocumentOptions[Index].OnClick := @ForgeChooseDocument;
    ForgePaintDocumentButton(ForgeDocumentOptions[Index], ForgeDocumentImages[Index + 1], Index = 0, False);
  end;
  ForgeDocumentPopup.Visible := False;
  ForgePreviousKeyDown := WizardForm.OnKeyDown;
  WizardForm.KeyPreview := True;
  WizardForm.OnKeyDown := @ForgeDocumentKeys;
  ForgeReadDocument(nil);
end;

procedure ForgeUpdatePresentation(CurPageID: Integer);
begin
  ForgeCloseDocumentPopup;
  if CurPageID = wpLicense then ForgeStyleDocument(WizardForm.LicenseMemo);
  ForgeRefreshNavigation;
end;

procedure ForgeReleasePresentation;
begin
  ForgeReleaseNavigation;
  ForgeReleaseDocuments;
  if ForgeDisplayFont <> '' then ForgeRemoveFont(ForgeDisplayFont, 16, 0);
  if ForgeBodyFont <> '' then ForgeRemoveFont(ForgeBodyFont, 16, 0);
end;

