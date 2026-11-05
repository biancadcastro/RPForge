using System.Drawing.Text;
using System.Windows.Forms;

namespace RPFForge {
    sealed class ForgeLabel : Label {
        public ForgeLabel() { UseCompatibleTextRendering = true; }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            base.OnPaint(e);
        }
    }
}
