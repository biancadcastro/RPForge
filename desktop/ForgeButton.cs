using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

namespace RPFForge {
    // Shared with the raised pixel controls at the end of RPForge-Site/app/controls.css.
    sealed class ForgeButton : Button {
        bool hovered, pressed;
        public bool Navigation { get; set; }
        public bool FlatFrame { get; set; }
        public ForgeButton() {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            Font = ForgeFonts.Pixel(13); BackColor = ForgeTheme.Surface; ForeColor = ForgeTheme.Text;
            FlatStyle = FlatStyle.Flat; Cursor = Cursors.Hand; UseVisualStyleBackColor = false;
        }
        protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
        protected override void OnLostFocus(EventArgs e) { pressed = false; base.OnLostFocus(e); Invalidate(); }
        protected override void OnMouseCaptureChanged(EventArgs e) { if (!Capture) pressed = false; base.OnMouseCaptureChanged(e); Invalidate(); }
        protected override void OnMouseDown(MouseEventArgs e) { if (e.Button == MouseButtons.Left) pressed = true; base.OnMouseDown(e); Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs e) { pressed = false; base.OnMouseUp(e); Invalidate(); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Space) pressed = true; base.OnKeyDown(e); Invalidate(); }
        protected override void OnKeyUp(KeyEventArgs e) { pressed = false; base.OnKeyUp(e); Invalidate(); }
        protected override void OnMouseEnter(EventArgs e) { hovered = true; base.OnMouseEnter(e); Invalidate(); }
        protected override void OnMouseLeave(EventArgs e) { hovered = false; base.OnMouseLeave(e); Invalidate(); }

        static Color Hex(string value) { return ColorTranslator.FromHtml(value); }
        protected override void OnPaint(PaintEventArgs e) {
            Color parent = Parent == null ? ForgeTheme.Background : Parent.BackColor;
            e.Graphics.Clear(parent);
            bool primary = BackColor == ForgeTheme.Orange, selected = Navigation && ForeColor == ForgeTheme.Orange;
            int down = pressed && !Navigation && !FlatFrame ? 3 : 0;
            int bottom = Navigation || FlatFrame ? 1 : 6;
            var bounds = new Rectangle(1, 1 + down, Math.Max(1, Width - 3), Math.Max(1, Height - bottom - down - 1));
            Color fill = Navigation ? hovered && Enabled ? Hex("#1D1D27") : parent : primary ? hovered && Enabled ? Hex("#F59852") : Hex("#E9843D") : hovered && Enabled ? Hex("#34303D") : Hex("#25232D");
            Color rim = !Enabled ? ForgeTheme.Border : primary ? Hex("#FFD0A5") : hovered ? Hex("#C6BCCB") : Hex("#8C8792");
            if (!Enabled && !Navigation) fill = ForgeTheme.Surface;
            if (!Navigation && !FlatFrame) {
                using (var shadow = new SolidBrush(primary && Enabled ? Hex("#884421") : Hex("#121118"))) e.Graphics.FillRectangle(shadow, bounds.Left + 1, bounds.Bottom, bounds.Width - 2, 3);
                using (var pen = new Pen(rim, 2)) e.Graphics.DrawLine(pen, bounds.Left + 1, bounds.Bottom + (pressed ? 1 : 4), bounds.Right - 1, bounds.Bottom + (pressed ? 1 : 4));
            }
            using (var brush = new SolidBrush(fill)) e.Graphics.FillRectangle(brush, bounds);
            if (!Navigation) {
                using (var pen = new Pen(FlatFrame ? ForgeTheme.Border : rim, FlatFrame ? 1 : 2)) e.Graphics.DrawRectangle(pen, bounds);
                if (!FlatFrame && Enabled) using (var pen = new Pen(primary ? Hex("#FFB878") : Hex("#403A48"))) e.Graphics.DrawLine(pen, bounds.Left + 2, bounds.Top + 2, bounds.Right - 2, bounds.Top + 2);
            } else if (selected) using (var pen = new Pen(ForgeTheme.Orange, 2)) e.Graphics.DrawLine(pen, 12, Height - 2, Width - 12, Height - 2);
            if (Focused && ShowFocusCues) using (var pen = new Pen(ForgeTheme.Warning)) e.Graphics.DrawRectangle(pen, 4, 4 + down, Width - 9, Math.Max(1, Height - bottom - 8));
            var textBounds = new Rectangle(12, down, Math.Max(1, Width - 24), Math.Max(1, Height - bottom));
            e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            using (var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap, HotkeyPrefix = ShowKeyboardCues ? HotkeyPrefix.Show : HotkeyPrefix.Hide })
            using (var brush = new SolidBrush(!Enabled ? Hex("#777582") : Navigation ? ForeColor : primary ? Hex("#FFF8EE") : ForgeTheme.Text)) e.Graphics.DrawString(Text, Font, brush, textBounds, format);
        }
    }
}
