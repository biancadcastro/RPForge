using System;
using System.Drawing;
using System.Windows.Forms;

namespace RPFForge {
    sealed partial class ForgeWindow {
        void PaintEditableCell(object sender, DataGridViewCellPaintingEventArgs e) {
            if (e.RowIndex < 0 || e.ColumnIndex < 0) return;
            var grid = (DataGridView)sender; string column = grid.Columns[e.ColumnIndex].Name;
            if (column != "target" && column != "output" && column != "policy" && column != "selected") return;
            e.PaintBackground(e.ClipBounds, true);
            if (column == "selected") {
                var check = new Rectangle(e.CellBounds.X + (e.CellBounds.Width - 16) / 2, e.CellBounds.Y + (e.CellBounds.Height - 16) / 2, 16, 16);
                bool selected = e.Value is bool && (bool)e.Value;
                using (var brush = new SolidBrush(selected ? ForgeTheme.Orange : ForgeTheme.Raised)) e.Graphics.FillRectangle(brush, check);
                using (var pen = new Pen(selected ? ForgeTheme.Orange : ForgeTheme.Muted)) e.Graphics.DrawRectangle(pen, check);
                if (selected) using (var pen = new Pen(ForgeTheme.Background, 2)) e.Graphics.DrawLines(pen, new[] { new Point(check.X + 3, check.Y + 8), new Point(check.X + 7, check.Y + 12), new Point(check.X + 13, check.Y + 4) });
            } else {
                var frame = Rectangle.Inflate(e.CellBounds, -4, -4);
                using (var brush = new SolidBrush(ForgeTheme.Raised)) e.Graphics.FillRectangle(brush, frame);
                using (var pen = new Pen(grid.CurrentCell != null && grid.CurrentCell.RowIndex == e.RowIndex && grid.CurrentCell.ColumnIndex == e.ColumnIndex ? ForgeTheme.Orange : ForgeTheme.Border)) e.Graphics.DrawRectangle(pen, frame);
                string value = TextValue(e.FormattedValue); bool placeholder = column == "target" && String.IsNullOrEmpty(value);
                var text = Rectangle.Inflate(frame, -8, 0); if (column == "policy") text.Width -= 18;
                TextRenderer.DrawText(e.Graphics, placeholder ? "manter original" : value, e.CellStyle.Font, text, placeholder ? ForgeTheme.Muted : ForgeTheme.Text, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
                if (column == "policy") using (var pen = new Pen(ForgeTheme.Orange, 2)) { int x = frame.Right - 14, y = frame.Top + frame.Height / 2; e.Graphics.DrawLines(pen, new[] { new Point(x - 4, y - 2), new Point(x, y + 2), new Point(x + 4, y - 2) }); }
            }
            e.Handled = true;
        }
    }
    sealed class ForgeInputFrame : Panel {
        readonly TextBox input;
        public ForgeInputFrame(TextBox textbox) {
            input = textbox; DoubleBuffered = true; BackColor = ForgeTheme.Raised;
            Padding = new Padding(14, 10, 14, 8); input.BorderStyle = BorderStyle.None; input.BackColor = BackColor; input.Dock = DockStyle.Fill; input.Margin = Padding.Empty;
            input.Enter += delegate { Invalidate(); }; input.Leave += delegate { Invalidate(); }; Controls.Add(input);
            var hint = new Label { Text = "Escolha a pasta que contém os arquivos .rpf", Dock = DockStyle.Fill, ForeColor = ForgeTheme.Muted, BackColor = BackColor, Font = input.Font, TextAlign = ContentAlignment.MiddleLeft, AutoEllipsis = true, TabStop = false, AccessibleRole = AccessibleRole.None };
            Controls.Add(hint); hint.BringToFront();
            Action refresh = delegate { hint.Visible = input.TextLength == 0 && !input.Focused; };
            input.TextChanged += delegate { refresh(); }; input.Enter += delegate { refresh(); }; input.Leave += delegate { refresh(); }; hint.Click += delegate { input.Focus(); };
        }
        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e);
            using (var pen = new Pen(input.Focused ? ForgeTheme.Orange : ForgeTheme.Border, input.Focused ? 2 : 1)) e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            using (var brush = new SolidBrush(input.Focused ? ForgeTheme.Orange : ForgeTheme.Border)) e.Graphics.FillRectangle(brush, 0, Height - 4, 4, 4);
        }
    }
    sealed class ForgeSurface : TableLayoutPanel {
        public ForgeSurface() { DoubleBuffered = true; }
        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e); using (var pen = new Pen(ForgeTheme.Border)) e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            using (var brush = new SolidBrush(ForgeTheme.Orange)) { e.Graphics.FillRectangle(brush, 0, 0, 4, 16); e.Graphics.FillRectangle(brush, 4, 0, 12, 4); }
        }
    }
}
