var
  ForgeDocumentIndex: Integer;
  ForgeDocumentSelector: TBitmapButton;
  ForgeDocumentPopup: TPanel;
  ForgeDocumentOptions: array[0..3] of TBitmapButton;
  ForgeDocumentImages: array[0..4] of TBitmap;
  ForgeDocumentFrame, ForgeDocumentSurface: TPanel;
  ForgePreviousKeyDown: TKeyEvent;
  ForgeDocumentFocus: Integer;

procedure ForgeChooseDocument(Sender: TObject); forward;
procedure ForgeToggleDocuments(Sender: TObject); forward;

function ForgeDocumentName(Index: Integer): String;
begin
  case Index of
    0: Result := 'Privacidade no aplicativo';
    1: Result := 'Termos de uso e licença do RPForge';
    2: Result := 'Avisos de terceiros e licenças dos componentes';
    3: Result := 'Chromium — avisos e licenças completos';
  end;
end;

procedure ForgePaintDocumentButton(Button: TBitmapButton; Image: TBitmap; Selected, Selector: Boolean);
var W, H, X, Y: Integer; Fill: TColor;
begin
  Button.StyleElements := [];
  Button.AutoSize := False;
  W := Button.Width - ScaleX(4); H := Button.Height - ScaleY(4);
  Image.Width := W; Image.Height := H;
  Fill := $00271D1D;
  Button.BackColor := Fill;
  Image.Canvas.Brush.Color := Fill;
  Image.Canvas.Pen.Color := Fill;
  if Selector then Image.Canvas.Pen.Color := $004F4242;
  Image.Canvas.Pen.Width := 1;
  Image.Canvas.Rectangle(0, 0, W, H);
  if Selected and not Selector then begin
    Image.Canvas.Brush.Color := $00257BFF;
    Image.Canvas.Pen.Color := $00257BFF;
    Image.Canvas.Rectangle(0, 0, ScaleX(3), H);
    Image.Canvas.Brush.Color := Fill;
  end;
  Image.Canvas.Font.Name := 'Atkinson Hyperlegible';
  Image.Canvas.Font.Size := 11;
  Image.Canvas.Font.Style := [];
  Image.Canvas.Font.Color := $00E8F1F5;
  if Selected then Image.Canvas.Font.Color := $00257BFF;
  X := ScaleX(14); Y := (H - Image.Canvas.TextHeight(Button.Caption)) div 2;
  Image.Canvas.TextOut(X, Y, Button.Caption);
  if Selector then begin
    Image.Canvas.Pen.Color := $00257BFF;
    Image.Canvas.Pen.Width := ScaleX(2);
    X := W - ScaleX(22); Y := H div 2;
    Image.Canvas.MoveTo(X - ScaleX(4), Y - ScaleY(2));
    Image.Canvas.LineTo(X, Y + ScaleY(2));
    Image.Canvas.LineTo(X + ScaleX(4), Y - ScaleY(2));
  end;
  Button.Bitmap := Image;
  Button.Invalidate;
end;

procedure ForgeCloseDocumentPopup;
begin
  if ForgeDocumentPopup <> nil then ForgeDocumentPopup.Visible := False;
end;

function ForgeConfirmOpenDocument: Boolean;
var Index: Integer;
begin
  Result := (ForgeDocumentPopup <> nil) and ForgeDocumentPopup.Visible;
  if not Result and (WizardForm.ActiveControl = ForgeDocumentSelector) then begin
    ForgeToggleDocuments(nil);
    Result := True;
    Exit;
  end;
  if not Result then Exit;
  for Index := 0 to 3 do
    if WizardForm.ActiveControl = ForgeDocumentOptions[Index] then begin
      ForgeChooseDocument(ForgeDocumentOptions[Index]);
      Exit;
    end;
  ForgeCloseDocumentPopup;
end;

procedure ForgeToggleDocuments(Sender: TObject);
begin
  ForgeDocumentPopup.Visible := not ForgeDocumentPopup.Visible;
  if ForgeDocumentPopup.Visible then begin
    ForgeDocumentPopup.BringToFront;
    WizardForm.ActiveControl := ForgeDocumentOptions[ForgeDocumentIndex];
  end;
end;

procedure ForgeReleaseDocuments;
var Index: Integer;
begin
  for Index := 0 to 4 do
    if ForgeDocumentImages[Index] <> nil then ForgeDocumentImages[Index].Free;
end;

procedure ForgeRefreshDocumentStyles;
var Index, FocusIndex: Integer;
begin
  if ForgeDocumentSelector = nil then Exit;
  FocusIndex := -1;
  if ForgeDocumentSelector.Focused then FocusIndex := 4;
  for Index := 0 to 3 do
    if (ForgeDocumentOptions[Index] <> nil) and ForgeDocumentOptions[Index].Focused then FocusIndex := Index;
  if FocusIndex = ForgeDocumentFocus then Exit;
  ForgeDocumentFocus := FocusIndex;
  ForgePaintDocumentButton(ForgeDocumentSelector, ForgeDocumentImages[0], False, True);
  for Index := 0 to 3 do
    if ForgeDocumentOptions[Index] <> nil then
      ForgePaintDocumentButton(ForgeDocumentOptions[Index], ForgeDocumentImages[Index + 1], Index = ForgeDocumentIndex, False);
end;

procedure ForgeDocumentKeys(Sender: TObject; var Key: Word; Shift: TShiftState);
var Index, FocusIndex: Integer;
begin
  if ForgeDocumentPopup <> nil then begin
    if not ForgeDocumentPopup.Visible and (WizardForm.ActiveControl = ForgeDocumentSelector) and
      ((Key = 38) or (Key = 40) or (Key = 13) or (Key = 32)) then begin
      ForgeToggleDocuments(nil);
      Key := 0;
    end else if ForgeDocumentPopup.Visible then begin
      FocusIndex := ForgeDocumentIndex;
      for Index := 0 to 3 do
        if WizardForm.ActiveControl = ForgeDocumentOptions[Index] then FocusIndex := Index;
      if Key = 38 then begin
        WizardForm.ActiveControl := ForgeDocumentOptions[(FocusIndex + 3) mod 4];
        Key := 0;
      end else if Key = 40 then begin
        WizardForm.ActiveControl := ForgeDocumentOptions[(FocusIndex + 1) mod 4];
        Key := 0;
      end else if Key = 13 then begin
        ForgeChooseDocument(ForgeDocumentOptions[FocusIndex]);
        Key := 0;
      end else if Key = 27 then begin
        ForgeCloseDocumentPopup;
        WizardForm.ActiveControl := ForgeDocumentSelector;
        Key := 0;
      end;
    end;
  end;
  if (Key <> 0) and (ForgePreviousKeyDown <> nil) then ForgePreviousKeyDown(Sender, Key, Shift);
end;
