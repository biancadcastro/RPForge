using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace RPFForge {
    sealed class ForgeWindow : Form {
        readonly ForgeShell shell = new ForgeShell();
        ForgeConverter converter;
        bool renderOnly;
        readonly string initialFolder;
        readonly bool generateYtyp;
        protected override bool ShowWithoutActivation { get { return renderOnly; } }
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); ForgeChrome.Apply(Handle); }

        public ForgeWindow(string root, string folder, bool ytyp = false) {
            initialFolder = folder; generateYtyp = ytyp;
            Text = "RPForge"; ClientSize = new Size(1280, 860); MinimumSize = new Size(1024, 700); StartPosition = FormStartPosition.CenterScreen;
            BackColor = ForgeTheme.Background; ForeColor = ForgeTheme.Text; Font = ForgeBodyFonts.Body(11); AutoScaleMode = AutoScaleMode.Dpi; Icon = BrandAssets.AppIcon();
            shell.Register(new ForgeToolRegistration("converter", "Converter RPFs", "Converta veículos, roupas e mapas em recursos FiveM. Revise os nomes e a saída antes de gravar.", "GTA V → FiveM", delegate { converter = new ForgeConverter(root); return converter; }, ".rpf"));
            shell.StateChanged += delegate { AcceptButton = shell.DefaultAction; };
            Controls.Add(shell);
            if (!String.IsNullOrEmpty(initialFolder)) shell.TryOpen("converter");
            Shown += async delegate {
                if (!renderOnly && Directory.Exists(initialFolder)) { shell.TryOpen("converter"); await converter.OpenInitial(initialFolder, generateYtyp); }
            };
        }

        protected override void OnFormClosing(FormClosingEventArgs e) {
            if (shell.Busy) e.Cancel = true;
            base.OnFormClosing(e);
        }

        public void SelfTest() {
            ForgeShellChecks.Run();
            shell.TryOpen("converter"); converter.SelfTest();
            converter.VerifyBusyGuards(delegate {
                var closing = new FormClosingEventArgs(CloseReason.UserClosing, false); OnFormClosing(closing);
                if (!closing.Cancel || shell.TryOpen(null) || shell.ShowHelp()) throw new Exception("Running operations must prevent closing or leaving their tool.");
            });
            shell.ShowHelp(); if (AcceptButton != null) throw new Exception("Help must not trigger a hidden tool on Enter.");
            shell.TryOpen(null); if (shell.DefaultAction != null) throw new Exception("Home must not retain a tool's primary action.");
            shell.TryOpen("converter"); if (!Object.ReferenceEquals(converter, shell.ActiveTool)) throw new Exception("Tool state was replaced during navigation.");
        }

        public async Task WorkflowTest(string fixtures) {
            shell.TryOpen("converter"); await converter.WorkflowTest(fixtures);
            shell.TryOpen("converter"); if (!Object.ReferenceEquals(converter, shell.ActiveTool)) throw new Exception("Navigation changed the converter instance.");
        }

        public void PrepareBackgroundTest() { renderOnly = true; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-30000, -30000); }
        public void RenderBitmap(string destination) {
            PrepareBackgroundTest(); Show(); PerformLayout(); Application.DoEvents();
            using (var image = new Bitmap(shell.Width, shell.Height)) { shell.DrawToBitmap(image, new Rectangle(Point.Empty, shell.Size)); image.Save(destination, System.Drawing.Imaging.ImageFormat.Png); }
            Hide();
        }
        public void RenderSuite(string directory) {
            Directory.CreateDirectory(directory); PrepareBackgroundTest();
            RenderBitmap(Path.Combine(directory, "00-ferramentas.png"));
            ClientSize = new Size(1024, 700); RenderBitmap(Path.Combine(directory, "00-inicio-compacto.png"));
            ClientSize = new Size(1280, 860); shell.TryOpen("converter"); converter.RenderSuite(directory);
            shell.ShowHelp(); RenderBitmap(Path.Combine(directory, "11-como-usar.png"));
        }
    }
}
