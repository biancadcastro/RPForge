using System;
using System.Drawing;
using System.Windows.Forms;

namespace RPFForge {
    sealed class ForgeScrollRail : Control {
        public int ContentHeight, ViewHeight, Position;
        public event Action<int> PositionChanged;
        int dragOffset; bool dragging;
        public ForgeScrollRail() { DoubleBuffered = true; Width = 14; TabStop = true; AccessibleName = "Rolagem vertical"; AccessibleRole = AccessibleRole.ScrollBar; }
        int Range { get { return Math.Max(0, ContentHeight - ViewHeight); } }
        Rectangle Thumb { get { int height = Math.Min(Height, Math.Max(32, ContentHeight == 0 ? Height : Height * ViewHeight / ContentHeight)); int top = Range == 0 ? 0 : (Height - height) * Position / Range; return new Rectangle(4, top, 6, height); } }
        void Change(int value) { if (PositionChanged != null) PositionChanged(Math.Max(0, Math.Min(Range, value))); }
        protected override void OnPaint(PaintEventArgs e) { e.Graphics.Clear(ForgeTheme.Surface); using (var track = new SolidBrush(ForgeTheme.Raised)) e.Graphics.FillRectangle(track, 5, 0, 4, Height); using (var thumb = new SolidBrush(Focused || dragging ? ForgeTheme.Orange : ForgeTheme.Muted)) e.Graphics.FillRectangle(thumb, Thumb); }
        protected override void OnMouseDown(MouseEventArgs e) { Focus(); if (Thumb.Contains(e.Location)) { dragging = true; dragOffset = e.Y - Thumb.Top; Capture = true; } else Change(Position + (e.Y < Thumb.Top ? -ViewHeight : ViewHeight)); Invalidate(); }
        protected override void OnMouseMove(MouseEventArgs e) { if (dragging && Height > Thumb.Height) Change((e.Y - dragOffset) * Range / (Height - Thumb.Height)); }
        protected override void OnMouseUp(MouseEventArgs e) { dragging = false; Capture = false; Invalidate(); }
        protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
        protected override void OnLostFocus(EventArgs e) { base.OnLostFocus(e); Invalidate(); }
        protected override bool IsInputKey(Keys key) { return true; }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Down) Change(Position + 40); else if (e.KeyCode == Keys.Up) Change(Position - 40); else if (e.KeyCode == Keys.PageDown) Change(Position + ViewHeight); else if (e.KeyCode == Keys.PageUp) Change(Position - ViewHeight); else if (e.KeyCode == Keys.Home) Change(0); else if (e.KeyCode == Keys.End) Change(Range); base.OnKeyDown(e); }
        protected override void OnMouseWheel(MouseEventArgs e) { Change(Position - e.Delta / 120 * 72); }
    }

    sealed class ForgeDocument : UserControl {
        readonly Panel viewport = new Panel();
        readonly FlowLayoutPanel content = new FlowLayoutPanel();
        readonly ForgeScrollRail rail = new ForgeScrollRail();
        int position; bool arranging;
        public ForgeDocument() {
            Dock = DockStyle.Fill; BackColor = ForgeTheme.Surface; TabStop = true;
            rail.Dock = DockStyle.Right; rail.PositionChanged += ScrollTo;
            viewport.Dock = DockStyle.Fill; viewport.BackColor = BackColor;
            content.FlowDirection = FlowDirection.TopDown; content.WrapContents = false; content.AutoSize = true; content.AutoSizeMode = AutoSizeMode.GrowAndShrink; content.Margin = Padding.Empty; content.Padding = new Padding(0, 0, 6, 12); content.BackColor = BackColor;
            viewport.Controls.Add(content); Controls.Add(viewport); Controls.Add(rail);
            viewport.SizeChanged += delegate { Arrange(); }; content.SizeChanged += delegate { UpdateRail(); };
            content.MouseWheel += Wheel; viewport.MouseWheel += Wheel; MouseWheel += Wheel;
        }
        void Wheel(object sender, MouseEventArgs e) { ScrollTo(position - e.Delta / 120 * 72); }
        public void ClearDocument() { while (content.Controls.Count > 0) content.Controls[0].Dispose(); ScrollTo(0); }
        public void AddSection(string title, string body, bool technical, Color color) {
            var card = new ForgeTextCard(title, body, technical, color); content.Controls.Add(card); card.MouseWheel += Wheel; foreach (Control control in card.Controls) control.MouseWheel += Wheel; Arrange();
        }
        public void AddSection(string title, string body) { AddSection(title, body, false, ForgeTheme.Text); }
        public void AddAction(string title, Action action) {
            var button = new ForgeButton { Text = title, Font = ForgeFonts.Pixel(12), Height = 44, Width = 240, ForeColor = ForgeTheme.Text, BackColor = ForgeTheme.Surface, Margin = new Padding(0, 4, 0, 12), Cursor = Cursors.Hand };
            button.Click += delegate { action(); }; content.Controls.Add(button); Arrange();
        }
        void Arrange() {
            if (arranging) return; arranging = true;
            try { int width = Math.Max(160, viewport.ClientSize.Width - 8); content.SuspendLayout(); foreach (Control control in content.Controls) { var card = control as ForgeTextCard; if (card != null) card.SetWidth(width); else control.Width = Math.Min(300, width); } content.ResumeLayout(true); UpdateRail(); }
            finally { arranging = false; }
        }
        void UpdateRail() { rail.ContentHeight = content.Height; rail.ViewHeight = viewport.ClientSize.Height; rail.Visible = content.Height > viewport.Height; ScrollTo(position); }
        public void ScrollTo(int value) { position = Math.Max(0, Math.Min(Math.Max(0, content.Height - viewport.ClientSize.Height), value)); content.Location = new Point(0, -position); rail.Position = position; rail.Invalidate(); }
        public int ScrollPosition { get { return position; } }
        public int ContentExtent { get { return content.Height; } }
        protected override bool IsInputKey(Keys key) { return key == Keys.Down || key == Keys.Up || key == Keys.PageDown || key == Keys.PageUp || key == Keys.Home || key == Keys.End || base.IsInputKey(key); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Down) ScrollTo(position + 40); else if (e.KeyCode == Keys.Up) ScrollTo(position - 40); else if (e.KeyCode == Keys.PageDown) ScrollTo(position + viewport.Height); else if (e.KeyCode == Keys.PageUp) ScrollTo(position - viewport.Height); else if (e.KeyCode == Keys.Home) ScrollTo(0); else if (e.KeyCode == Keys.End) ScrollTo(content.Height); base.OnKeyDown(e); }
    }

    sealed class ForgeTextCard : Panel {
        readonly Label heading = new Label(), body = new Label();
        public ForgeTextCard(string title, string text, bool technical, Color color) {
            DoubleBuffered = true; BackColor = ForgeTheme.Surface; Margin = new Padding(0, 0, 0, 12);
            heading.Text = title; heading.Font = ForgeFonts.Pixel(15, FontStyle.Bold); heading.ForeColor = color; heading.AutoSize = true; heading.Location = new Point(16, 12);
            body.Text = text; body.Font = technical ? new Font("Consolas", 11) : ForgeFonts.Pixel(12); body.ForeColor = ForgeTheme.Muted; body.AutoSize = true;
            Controls.Add(heading); Controls.Add(body);
        }
        public void SetWidth(int width) { Width = width; heading.MaximumSize = new Size(Math.Max(80, width - 32), 0); body.MaximumSize = heading.MaximumSize; body.Location = new Point(16, heading.Bottom + 8); Height = body.Bottom + 16; }
        protected override void OnPaint(PaintEventArgs e) { base.OnPaint(e); using (var pen = new Pen(ForgeTheme.Border)) e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1); }
    }
}
