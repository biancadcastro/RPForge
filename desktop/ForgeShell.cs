using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace RPFForge {
    // Navigation and tool lifecycle are independent of the converter workflow.
    sealed class ForgeShell : UserControl {
        readonly List<ForgeToolRegistration> registrations = new List<ForgeToolRegistration>();
        readonly Dictionary<string, IForgeTool> instances = new Dictionary<string, IForgeTool>();
        readonly Panel workspace = new Panel { Dock = DockStyle.Fill, Margin = Padding.Empty };
        readonly Panel home = new Panel { Dock = DockStyle.Fill, AutoScroll = true, Margin = Padding.Empty };
        readonly FlowLayoutPanel cards = new FlowLayoutPanel { Dock = DockStyle.Top, FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true, Margin = Padding.Empty };
        readonly ForgeButton homeButton = Nav("Início", 82), toolsButton = Nav("Ferramentas ▾", 152), helpButton = Nav("Como usar", 116);
        readonly ForgeButton siteButton = new ForgeButton { Text = "Abrir o site ↗", Width = 172, Height = 48, Margin = new Padding(20, 0, 0, 0) };
        readonly ForgeDocument help = new ForgeDocument { Dock = DockStyle.Fill, Padding = new Padding(40, 28, 40, 24), AccessibleName = "Como usar o RPForge" };
        readonly Panel homeContent = new Panel { Dock = DockStyle.Top, Height = 600, Padding = new Padding(40, 20, 40, 24) };
        ForgeToolMenu toolsMenu;
        string activeId;
        bool showingHelp;
        public event EventHandler StateChanged;
        public string ActiveId { get { return activeId; } }
        public int LoadedCount { get { return instances.Count; } }
        public bool Busy { get { return ActiveTool != null && ActiveTool.Busy; } }
        public IForgeTool ActiveTool { get { return activeId != null ? instances[activeId] : null; } }
        public IButtonControl DefaultAction { get { return ActiveTool == null ? null : ActiveTool.DefaultAction; } }

        static ForgeButton Nav(string title, int width) { return new ForgeButton { Text = title, Navigation = true, Width = width, Height = 48, Font = ForgeBodyFonts.Body(11), Margin = Padding.Empty }; }

        public ForgeShell() {
            Dock = DockStyle.Fill; BackColor = ForgeTheme.Background; ForeColor = ForgeTheme.Text; Font = ForgeBodyFonts.Body(11);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = Padding.Empty };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 94)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            var header = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Padding = new Padding(40, 20, 40, 22), Margin = Padding.Empty };
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 166)); header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 542));
            header.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            header.Paint += delegate(object sender, PaintEventArgs e) { using (var pen = new Pen(ForgeTheme.Border)) e.Graphics.DrawLine(pen, 0, header.Height - 1, header.Width, header.Height - 1); };
            var brand = new PictureBox { Image = BrandAssets.Logo(), SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Fill, Margin = Padding.Empty, AccessibleName = "RPForge", Cursor = Cursors.Hand };
            brand.Click += delegate { TryOpen(null); }; header.Controls.Add(brand, 0, 0);
            var links = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Margin = Padding.Empty };
            homeButton.AccessibleName = "Início — todas as ferramentas";
            homeButton.Click += delegate { TryOpen(null); };
            toolsButton.AccessibleName = "Abrir menu de ferramentas";
            toolsButton.Click += delegate { ShowToolsMenu(); };
            helpButton.Click += delegate { ShowHelp(); };
            siteButton.Click += delegate { System.Diagnostics.Process.Start("https://rpforge.dev"); };
            links.Controls.Add(homeButton); links.Controls.Add(toolsButton); links.Controls.Add(helpButton); links.Controls.Add(siteButton); header.Controls.Add(links, 2, 0);
            BuildHome(); BuildHelp(); workspace.Controls.Add(home); workspace.Controls.Add(help); help.Visible = false;
            layout.Controls.Add(header, 0, 0); layout.Controls.Add(workspace, 0, 1); Controls.Add(layout);
            RefreshState();
        }

        void BuildHome() {
            var hero = new TableLayoutPanel { Dock = DockStyle.Top, Height = 342, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty };
            hero.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58)); hero.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
            var copy = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Padding = new Padding(0, 20, 0, 12), Margin = Padding.Empty };
            copy.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            foreach (int height in new[] { 30, 126, 76, 64 }) copy.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
            copy.Controls.Add(new ForgeLabel { Text = "●  SUAS CRIAÇÕES, PRONTAS PARA O SERVIDOR", ForeColor = ForgeTheme.Muted, Font = ForgeBodyFonts.Body(9), Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 0);
            copy.Controls.Add(new ForgeLabel { Text = "Do RPF ao FiveM,\ncom menos trabalho.", Font = ForgeFonts.Pixel(32, FontStyle.Bold), ForeColor = ForgeTheme.Text, Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 1);
            copy.Controls.Add(new ForgeLabel { Text = "Você cria. O RPForge organiza.\nConverta seus arquivos, escolha o spawn e confira\ntudo antes de levar ao servidor.", Font = ForgeBodyFonts.Body(12), ForeColor = ForgeTheme.Muted, Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 2);
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Margin = Padding.Empty, Padding = new Padding(0, 5, 0, 0) };
            var start = new ForgeButton { Text = "Abrir conversor →", Width = 228, Height = 50, BackColor = ForgeTheme.Orange, Margin = new Padding(0, 0, 16, 0) };
            start.Click += delegate { if (registrations.Count > 0) TryOpen(registrations[0].Id); };
            var manual = new ForgeButton { Text = "Como usar", Width = 158, Height = 50, Margin = Padding.Empty };
            manual.Click += delegate { ShowHelp(); }; actions.Controls.Add(start); actions.Controls.Add(manual); copy.Controls.Add(actions, 0, 3);
            hero.Controls.Add(copy, 0, 0); hero.Controls.Add(new ForgeBrandArt { Dock = DockStyle.Fill, Margin = Padding.Empty }, 1, 0);
            var section = new TableLayoutPanel { Dock = DockStyle.Top, Height = 76, ColumnCount = 2, RowCount = 1, Padding = new Padding(0, 22, 0, 8), Margin = Padding.Empty };
            section.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50)); section.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            section.Paint += delegate(object sender, PaintEventArgs e) { using (var pen = new Pen(ForgeTheme.Border)) e.Graphics.DrawLine(pen, 0, 0, section.Width, 0); };
            section.Controls.Add(new ForgeLabel { Text = "Suas ferramentas", Font = ForgeFonts.Pixel(22, FontStyle.Bold), Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 0);
            section.Controls.Add(new ForgeLabel { Text = "Escolha o que você precisa fazer agora.", ForeColor = ForgeTheme.Muted, Font = ForgeBodyFonts.Body(11), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleRight, Margin = Padding.Empty }, 1, 0);
            var catalog = new Panel { Dock = DockStyle.Top, Height = 200, Margin = Padding.Empty };
            catalog.Controls.Add(cards);
            homeContent.Controls.Add(catalog); homeContent.Controls.Add(section); homeContent.Controls.Add(hero); home.Controls.Add(homeContent);
            cards.SizeChanged += delegate { catalog.Height = cards.Height; homeContent.Height = hero.Height + section.Height + cards.Height + homeContent.Padding.Vertical; };
            catalog.SizeChanged += delegate { foreach (Control card in cards.Controls) card.Width = Math.Max(280, catalog.ClientSize.Width); };
        }

        void BuildHelp() {
            help.AddSection("Como usar o RPForge", "Escolha uma ferramenta no menu Ferramentas. Você pode voltar ao início e retomar a configuração sem perder as alterações da sessão.");
            help.AddSection("1. Escolha a pasta", "No conversor, selecione a pasta que contém os RPFs. A análise começa automaticamente e preserva os arquivos originais.");
            help.AddSection("2. Configure e revise", "Edite o spawn ou o nome do recurso. Se o destino já existir, escolha outro nome, backup ou cancelamento. Confira a revisão antes de converter.");
            help.AddSection("3. Leve ao servidor", "Abra a pasta do resultado, copie o recurso para o servidor e adicione o ensure no server.cfg. Confira os avisos e teste no FiveM.");
            help.AddSection("Modelos YDR e YTYP", "Ao selecionar uma pasta com YDRs e sem RPFs, o conversor gera o YTYP automaticamente. O atalho Gerar YTYP com RPForge no Windows também continua disponível, inclusive em pastas com ambos os formatos.");
        }

        public void Register(ForgeToolRegistration registration) {
            if (registrations.Exists(item => item.Id == registration.Id)) throw new ArgumentException("Duplicate tool id: " + registration.Id);
            registrations.Add(registration);
            var card = new ForgeSurface { ColumnCount = 3, RowCount = 1, BackColor = ForgeTheme.Surface, Width = 1000, Height = 146, Padding = new Padding(24), Margin = new Padding(0, 0, 0, 16) };
            card.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 56)); card.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); card.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 222));
            card.Controls.Add(new ForgeLabel { Text = registration.Badge, ForeColor = ForgeTheme.Orange, Font = ForgeFonts.Pixel(16), Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Margin = Padding.Empty }, 0, 0);
            var description = new TableLayoutPanel { ColumnCount = 1, RowCount = 2, Dock = DockStyle.Fill, Margin = new Padding(10, 0, 24, 0) };
            description.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); description.RowStyles.Add(new RowStyle(SizeType.Absolute, 37)); description.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            description.Controls.Add(new ForgeLabel { Text = registration.Title, Font = ForgeFonts.Pixel(20, FontStyle.Bold), Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 0);
            description.Controls.Add(new ForgeLabel { Text = registration.Description, ForeColor = ForgeTheme.Muted, Font = ForgeBodyFonts.Body(11), Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 1);
            var launch = new ForgeButton { Text = "Abrir ferramenta →", Width = 218, Height = 50, Anchor = AnchorStyles.Right, Margin = Padding.Empty, AccessibleName = "Abrir " + registration.Title };
            launch.Click += delegate { TryOpen(registration.Id); }; card.Controls.Add(description, 1, 0); card.Controls.Add(launch, 2, 0); cards.Controls.Add(card);
            if (toolsMenu != null) { toolsMenu.Dispose(); toolsMenu = null; }
            RefreshState();
        }

        void ShowToolsMenu() {
            if (Busy) return;
            if (toolsMenu == null) toolsMenu = new ForgeToolMenu(registrations, delegate(string id) { TryOpen(id); });
            toolsMenu.Show(toolsButton, new Point(0, toolsButton.Height + 8));
        }

        public bool ShowHelp() {
            if (Busy) return false;
            if (ActiveTool != null) ActiveTool.View.Visible = false;
            activeId = null; showingHelp = true; home.Visible = false; help.Visible = true; help.BringToFront(); RefreshState(); return true;
        }

        public bool TryOpen(string id) {
            if (id == activeId && !showingHelp) return true;
            if (Busy) return false;
            ForgeToolRegistration registration = id == null ? null : registrations.Find(item => item.Id == id);
            if (id != null && registration == null) return false;
            IForgeTool next = null;
            if (id != null && !instances.TryGetValue(id, out next)) {
                next = registration.Create();
                if (next == null || next.View == null) throw new InvalidOperationException("Tool factory returned no view: " + id);
                next.View.Dock = DockStyle.Fill; next.View.Visible = false; next.StateChanged += delegate { RefreshState(); };
                workspace.Controls.Add(next.View); instances.Add(id, next);
            }
            if (ActiveTool != null) ActiveTool.View.Visible = false;
            activeId = id; showingHelp = false; help.Visible = false; home.Visible = id == null;
            if (next != null) { next.View.Visible = true; next.View.BringToFront(); next.Activate(); } else home.BringToFront();
            RefreshState(); return true;
        }

        void RefreshState() {
            homeButton.Enabled = toolsButton.Enabled = helpButton.Enabled = !Busy;
            homeButton.ForeColor = activeId == null && !showingHelp ? ForgeTheme.Orange : ForgeTheme.Text;
            toolsButton.ForeColor = activeId != null ? ForgeTheme.Orange : ForgeTheme.Text;
            helpButton.ForeColor = showingHelp ? ForgeTheme.Orange : ForgeTheme.Text;
            homeButton.Invalidate(); toolsButton.Invalidate(); helpButton.Invalidate();
            if (StateChanged != null) StateChanged(this, EventArgs.Empty);
        }
        protected override void Dispose(bool disposing) { if (disposing && toolsMenu != null) toolsMenu.Dispose(); base.Dispose(disposing); }
    }

    sealed class ForgeToolMenu : ToolStripDropDown {
        readonly FlowLayoutPanel list = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, FlowDirection = FlowDirection.TopDown, WrapContents = false, Margin = Padding.Empty };
        readonly List<ForgeToolRegistration> registrations;
        readonly Action<string> open;
        public ForgeToolMenu(List<ForgeToolRegistration> items, Action<string> onOpen) {
            registrations = items; open = onOpen; AutoSize = false; Size = new Size(354, 300); Padding = new Padding(1); BackColor = ForgeTheme.Border;
            var content = new TableLayoutPanel { Size = new Size(352, 298), BackColor = ForgeTheme.Surface, Padding = new Padding(12), ColumnCount = 1, RowCount = 3, Margin = Padding.Empty };
            content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); content.RowStyles.Add(new RowStyle(SizeType.Absolute, 30)); content.RowStyles.Add(new RowStyle(SizeType.Absolute, 44)); content.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            content.Controls.Add(new ForgeLabel { Text = "Ferramentas", Font = ForgeFonts.Pixel(16, FontStyle.Bold), ForeColor = ForgeTheme.Text, Dock = DockStyle.Fill, Margin = Padding.Empty }, 0, 0);
            var search = new TextBox { Font = new Font("Segoe UI", 11), BackColor = ForgeTheme.Background, ForeColor = ForgeTheme.Text, BorderStyle = BorderStyle.FixedSingle, Dock = DockStyle.Top, AccessibleName = "Buscar ferramentas", Margin = new Padding(0, 6, 0, 8) };
            search.TextChanged += delegate { Filter(search.Text); }; content.Controls.Add(search, 0, 1); content.Controls.Add(list, 0, 2);
            var host = new ToolStripControlHost(content) { AutoSize = false, Size = content.Size, Margin = Padding.Empty, Padding = Padding.Empty }; Items.Add(host);
            Filter(""); Opened += delegate { search.Focus(); };
        }
        public void Filter(string query) {
            while (list.Controls.Count > 0) list.Controls[0].Dispose();
            foreach (var item in registrations) {
                if ((item.Title + " " + item.Description + " " + item.Category).IndexOf(query.Trim(), StringComparison.CurrentCultureIgnoreCase) < 0) continue;
                string id = item.Id;
                var button = new ForgeButton { Text = item.Title, Navigation = true, Font = ForgeBodyFonts.Body(12), Width = 304, Height = 48, Margin = new Padding(0, 0, 0, 6), AccessibleName = "Abrir " + item.Title };
                button.Click += delegate { Close(); open(id); }; list.Controls.Add(button);
            }
            if (list.Controls.Count == 0) list.Controls.Add(new ForgeLabel { Text = "Nenhuma ferramenta encontrada.", ForeColor = ForgeTheme.Muted, Font = ForgeBodyFonts.Body(11), Width = 300, Height = 52 });
        }
    }

    sealed class ForgeBrandArt : Control {
        readonly Image symbol = BrandAssets.Symbol();
        public ForgeBrandArt() { DoubleBuffered = true; TabStop = false; AccessibleRole = AccessibleRole.Graphic; AccessibleName = "Bigorna e faísca RPForge"; }
        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e);
            int size = Math.Min(260, Math.Min(Width - 40, Height - 50));
            if (size <= 0) return;
            e.Graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
            e.Graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;
            e.Graphics.DrawImage(symbol, new Rectangle((Width - size) / 2, (Height - size) / 2 - 6, size, size));
        }
        protected override void Dispose(bool disposing) { if (disposing) symbol.Dispose(); base.Dispose(disposing); }
    }
}
