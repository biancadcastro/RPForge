{ Site controls.css: Pixelify, #e9843d primary, #ffd0a5 rim,
  graphite secondary and pale border. Native buttons keep their
  captions, keyboard behavior, default/cancel actions and enabled state. }
var
  ForgeButtonImages: array[0..2] of TBitmap;
  ForgeButtonStates: array[0..2] of String;
  ForgeButtonTimer: LongWord;

procedure ForgeRefreshDocumentStyles; forward;

function ForgeGetButtonStyle(WindowHandle: HWND; Index: Integer): LongWord;
  external 'GetWindowLongW@user32.dll stdcall';
function ForgeSetButtonStyle(WindowHandle: HWND; Index: Integer; Value: LongWord): LongWord;
  external 'SetWindowLongW@user32.dll stdcall';
function ForgeButtonTheme(WindowHandle: HWND; SubApp, SubId: String): Integer;
  external 'SetWindowTheme@uxtheme.dll stdcall';
function ForgeSetButtonTimer(WindowHandle: HWND; TimerID, Interval, Callback: LongWord): LongWord;
  external 'SetTimer@user32.dll stdcall';
function ForgeKillButtonTimer(WindowHandle: HWND; TimerID: LongWord): Boolean;
  external 'KillTimer@user32.dll stdcall';

function ForgeNavigationButton(Index: Integer): TNewButton;
begin
  case Index of
    0: Result := WizardForm.BackButton;
    1: Result := WizardForm.NextButton;
    2: Result := WizardForm.CancelButton;
  end;
end;

procedure ForgePaintNavigation(Index: Integer);
var Button: TNewButton; Image: TBitmap; Caption, State: String;
    W, H, X, Y, BottomEdge: Integer; Style: LongWord;
    Fill, Rim, Shadow, Ink: TColor;
begin
  Button := ForgeNavigationButton(Index);
  Style := ForgeGetButtonStyle(Button.Handle, -16);
  if (Style and $8080) <> $8080 then begin
    ForgeSetButtonStyle(Button.Handle, -16, Style or $8080);
    ForgeButtonStates[Index] := '';
  end;
  Caption := Button.Caption;
  StringChangeEx(Caption, '&', '', True);
  StringChangeEx(Caption, '>', '', True);
  Caption := Trim(Caption);
  State := Caption + ':' + IntToStr(Button.Width) + ':' + IntToStr(Button.Height);
  if Button.Enabled then State := State + ':enabled';
  if State = ForgeButtonStates[Index] then Exit;
  ForgeButtonStates[Index] := State;
  W := Button.Width - ScaleX(4);
  H := Button.Height - ScaleY(4);
  Image := ForgeButtonImages[Index];
  Image.Width := W;
  Image.Height := H;
  Fill := $002D2325; Rim := $0092878C; Shadow := $00181112; Ink := $00E7F0F7;
  if Index = 1 then begin
    Fill := $003D84E9; Rim := $00A5D0FF; Shadow := $00214488; Ink := $00EEF8FF;
  end;
  if not Button.Enabled then begin
    Fill := $002D2B32; Rim := $005A555F; Shadow := $00181112; Ink := $00B7A9AA;
  end;
  Image.Canvas.Pen.Style := psSolid;
  Image.Canvas.Pen.Width := 1;
  Image.Canvas.Brush.Color := $00181212;
  Image.Canvas.Pen.Color := $00181212;
  Image.Canvas.Rectangle(0, 0, W, H);
  BottomEdge := H - ScaleY(4);
  Image.Canvas.Brush.Color := Shadow;
  Image.Canvas.Pen.Color := Rim;
  Image.Canvas.Rectangle(0, ScaleY(3), W, H);
  Image.Canvas.Brush.Color := Fill;
  Image.Canvas.Pen.Width := ScaleX(2);
  Image.Canvas.Rectangle(1, 1, W - 1, BottomEdge);
  Image.Canvas.Font.Name := 'Pixelify Sans';
  Image.Canvas.Font.Size := 13;
  Image.Canvas.Font.Style := [];
  Image.Canvas.Font.Color := Ink;
  X := (W - Image.Canvas.TextWidth(Caption)) div 2;
  Y := (BottomEdge - Image.Canvas.TextHeight(Caption)) div 2;
  Image.Canvas.TextOut(X, Y, Caption);
  SendMessage(Button.Handle, $00F7, 0, Image.Handle);
  Button.Invalidate;
end;

procedure ForgeRefreshNavigation;
var Index: Integer;
begin
  for Index := 0 to 2 do ForgePaintNavigation(Index);
end;

procedure ForgeNavigationTimer(WindowHandle: HWND; Message, TimerID, Time: LongWord);
begin
  ForgeRefreshNavigation;
  ForgeRefreshDocumentStyles;
end;

procedure ForgeInitializeNavigation;
var Index, RightEdge, Top: Integer; Button: TNewButton;
begin
  RightEdge := WizardForm.CancelButton.Left + WizardForm.CancelButton.Width;
  Top := WizardForm.CancelButton.Top - ScaleY(12);
  WizardForm.CancelButton.SetBounds(RightEdge - ScaleX(108), Top, ScaleX(108), ScaleY(40));
  WizardForm.NextButton.SetBounds(WizardForm.CancelButton.Left - ScaleX(156), Top, ScaleX(144), ScaleY(40));
  WizardForm.BackButton.SetBounds(WizardForm.NextButton.Left - ScaleX(120), Top, ScaleX(108), ScaleY(40));
  for Index := 0 to 2 do begin
    Button := ForgeNavigationButton(Index);
    Button.StyleElements := [];
    ForgeButtonTheme(Button.Handle, '', '');
    ForgeButtonImages[Index] := TBitmap.Create;
  end;
  ForgeRefreshNavigation;
  ForgeButtonTimer := ForgeSetButtonTimer(0, 0, 100, CreateCallback(@ForgeNavigationTimer));
end;

procedure ForgeReleaseNavigation;
var Index: Integer;
begin
  if ForgeButtonTimer <> 0 then ForgeKillButtonTimer(0, ForgeButtonTimer);
  for Index := 0 to 2 do
    if ForgeButtonImages[Index] <> nil then begin
      SendMessage(ForgeNavigationButton(Index).Handle, $00F7, 0, 0);
      ForgeButtonImages[Index].Free;
    end;
end;
