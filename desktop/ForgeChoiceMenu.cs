using System;
using System.Drawing;
using System.Windows.Forms;

namespace RPFForge {
    sealed class ForgeMenuColors : ProfessionalColorTable {
        public override Color MenuItemSelected { get { return Color.FromArgb(71, 45, 34); } }
        public override Color MenuItemBorder { get { return ForgeTheme.Orange; } }
        public override Color ToolStripDropDownBackground { get { return ForgeTheme.Raised; } }
        public override Color ImageMarginGradientBegin { get { return ForgeTheme.Raised; } }
        public override Color ImageMarginGradientMiddle { get { return ForgeTheme.Raised; } }
        public override Color ImageMarginGradientEnd { get { return ForgeTheme.Raised; } }
        public override Color MenuBorder { get { return ForgeTheme.Border; } }
        public override Color CheckBackground { get { return ForgeTheme.Orange; } }
        public override Color CheckSelectedBackground { get { return ForgeTheme.Orange; } }
    }
    sealed partial class ForgeConverter {
        void OpenPolicyMenu(int rowIndex) {
            if (busy || rowIndex < 0) return;
            var row = destinations.Rows[rowIndex]; var menu = new ContextMenuStrip { BackColor = ForgeTheme.Raised, ForeColor = foreground, Font = new Font("Segoe UI", 11), ShowImageMargin = false, Renderer = new ToolStripProfessionalRenderer(new ForgeMenuColors()), Padding = new Padding(4) };
            foreach (string choice in new[] { "Usar outro nome", "Backup e substituir", "Cancelar" }) {
                string selected = choice; var option = new ToolStripMenuItem(choice) { BackColor = ForgeTheme.Raised, ForeColor = foreground, Padding = new Padding(12, 10, 12, 10), Checked = TextValue(row.Cells["policy"].Value) == choice };
                option.Click += delegate { row.Cells["policy"].Value = selected; if (selected == "Usar outro nome") { destinations.CurrentCell = row.Cells["output"]; destinations.BeginEdit(true); } }; menu.Items.Add(option);
            }
            var bounds = destinations.GetCellDisplayRectangle(destinations.Columns["policy"].Index, rowIndex, true); menu.Closed += delegate { menu.Dispose(); }; menu.Show(destinations, new Point(bounds.Left, bounds.Bottom));
        }
    }
}
