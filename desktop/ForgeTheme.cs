using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace RPFForge {
    sealed class ForgePages : Panel {
        public readonly List<Panel> TabPages = new List<Panel>();
        int selectedIndex;
        public event EventHandler SelectedIndexChanged;
        public int SelectedIndex {
            get { return selectedIndex; }
            set { if (value < 0 || value >= TabPages.Count) return; selectedIndex = value; for (int i = 0; i < TabPages.Count; i++) TabPages[i].Visible = i == value; if (SelectedIndexChanged != null) SelectedIndexChanged(this, EventArgs.Empty); }
        }
        public void AddPage(string title, Control content) {
            var page = new Panel { Text = title, Dock = DockStyle.Fill, BackColor = ForgeTheme.Surface, Visible = TabPages.Count == selectedIndex, Margin = Padding.Empty };
            page.Controls.Add(content); TabPages.Add(page); Controls.Add(page);
        }
    }
    static class ForgeTheme {
        public static readonly Color Background = ColorTranslator.FromHtml("#14141B");
        public static readonly Color Surface = ColorTranslator.FromHtml("#1C1C26");
        public static readonly Color Raised = ColorTranslator.FromHtml("#252531");
        public static readonly Color Border = ColorTranslator.FromHtml("#34344A");
        public static readonly Color Text = ColorTranslator.FromHtml("#F4F1EA");
        public static readonly Color Muted = ColorTranslator.FromHtml("#B1AEBB");
        public static readonly Color Orange = ColorTranslator.FromHtml("#FF7A32");
        public static readonly Color Warning = ColorTranslator.FromHtml("#FFD166");
        public static readonly Color Error = ColorTranslator.FromHtml("#FF7676");
        public static readonly Color Success = ColorTranslator.FromHtml("#4ADE80");
    }

    sealed class ForgeProgress : Control {
        readonly Timer timer = new Timer { Interval = 50 };
        int value, offset; ProgressBarStyle style;
        public int Maximum { get; set; }
        public int Value { get { return value; } set { this.value = value; Invalidate(); } }
        public ProgressBarStyle Style { get { return style; } set { style = value; timer.Enabled = value == ProgressBarStyle.Marquee; Invalidate(); } }
        public ForgeProgress() {
            DoubleBuffered = true; Maximum = 100;
            AccessibleName = "Progresso da operação"; AccessibleRole = AccessibleRole.ProgressBar;
            timer.Tick += delegate { offset = (offset + 7) % Math.Max(1, Width); Invalidate(); };
        }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(ForgeTheme.Raised);
            using (var brush = new SolidBrush(ForgeTheme.Orange)) {
                if (Style == ProgressBarStyle.Marquee) e.Graphics.FillRectangle(brush, offset, 0, Math.Max(40, Width / 5), Height);
                else e.Graphics.FillRectangle(brush, 0, 0, (int)(Width * Math.Max(0, Math.Min(Maximum, Value)) / (double)Math.Max(1, Maximum)), Height);
            }
        }
        protected override void Dispose(bool disposing) { if (disposing) timer.Dispose(); base.Dispose(disposing); }
    }

    sealed partial class ForgeWindow {
        readonly Label stage = new Label(), pageTitle = new Label(), pageHelp = new Label();
        readonly Label countCars = new Label(), countArchives = new Label(), countWarnings = new Label(), countWeight = new Label();
        readonly Panel empty = new Panel();
        TableLayoutPanel mainLayout;
        ForgeSurface workspacePanel;
        TableLayoutPanel configurationLayout;
        readonly Label emptyTitle = new Label(), emptyHelp = new Label();
        readonly Button[] navigation = new Button[4];
        readonly ToolTip hints = new ToolTip();
        readonly string[] titles = { "1. Configurar", "2. Revisar", "3. Resultado", "Ajuda" };
        readonly string[] descriptions = {
            "Confira os nomes e o tipo de conteúdo identificado.",
            "Confira os nomes e a pasta de saída antes de converter.",
            "Confira o resultado da operação e abra a pasta gerada.",
            "Respostas rápidas para usar o RPForge."
        };

        void BuildInterface() {
            Text = "RPForge"; ClientSize = new Size(1280, 860); MinimumSize = new Size(1024, 700);
            StartPosition = FormStartPosition.CenterScreen; BackColor = background; ForeColor = foreground;
            Font = ForgeFonts.Pixel(12); AutoScaleMode = AutoScaleMode.Dpi;
            Icon = BrandAssets.AppIcon();
            var shell = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty };
            shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 220)); shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            var side = new TableLayoutPanel { Dock = DockStyle.Fill, BackColor = surface, Padding = new Padding(16, 24, 16, 20), ColumnCount = 1, RowCount = 8 };
            side.RowStyles.Add(new RowStyle(SizeType.Absolute, 70)); side.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
            for (int i = 0; i < navigation.Length; i++) side.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
            side.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); side.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));
            var brand = new PictureBox { Image = BrandAssets.Logo(), SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Fill, AccessibleName = "RPForge", Margin = Padding.Empty };
            side.Controls.Add(brand, 0, 0);
            side.Controls.Add(new Label { Text = "", Dock = DockStyle.Fill, ForeColor = muted, Font = ForgeFonts.Pixel(11), Padding = new Padding(4, 8, 0, 0) }, 0, 1);
            for (int i = 0; i < navigation.Length; i++) {
                int index = i; var button = new ForgeButton { Navigation = true, Text = titles[i], Dock = DockStyle.Fill, Margin = new Padding(0, 4, 0, 4), AccessibleName = titles[i], TabIndex = i };
                ConfigureButton(button, button.Text, false); button.Dock = DockStyle.Fill; button.Margin = new Padding(0, 4, 0, 4);
                button.Click += async delegate { if (index == 1) await ReviewConfiguration(); else if (index != 2 || hasResults) tabs.SelectedIndex = index; }; navigation[i] = button; side.Controls.Add(button, 0, i + 2);
            }
            side.Controls.Add(new Label { Text = "", Dock = DockStyle.Fill, ForeColor = muted, Font = ForgeFonts.Pixel(11), Padding = new Padding(4, 12, 0, 0) }, 0, 7);
            shell.Controls.Add(side, 0, 0);
            var main = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24, 20, 24, 16), ColumnCount = 1, RowCount = 7 };
            mainLayout = main;
            foreach (int height in new[] { 80, 84, 84, -1, 42, 8, 64 }) main.RowStyles.Add(new RowStyle(height == -1 ? SizeType.Percent : SizeType.Absolute, height == -1 ? 100 : height));
            var heading = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2, Margin = Padding.Empty };
            heading.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); heading.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 225));
            heading.RowStyles.Add(new RowStyle(SizeType.Absolute, 42)); heading.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            heading.Controls.Add(new Label { Text = "Converter RPFs", Font = ForgeFonts.Pixel(24, FontStyle.Bold), AutoSize = true, ForeColor = foreground, Margin = Padding.Empty }, 0, 0);
            heading.Controls.Add(new Label { Text = "RPFs para FiveM. YTYPs automáticos para pastas com YDRs.", Dock = DockStyle.Fill, ForeColor = muted, Font = ForgeFonts.Pixel(11), Margin = Padding.Empty }, 0, 1);
            stage.Text = "01 / ORIGEM"; stage.Dock = DockStyle.Fill; stage.TextAlign = ContentAlignment.MiddleRight; stage.ForeColor = red; stage.Font = new Font("Consolas", 10, FontStyle.Bold); heading.Controls.Add(stage, 1, 0);
            main.Controls.Add(heading, 0, 0);
            var pathRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 3, Margin = Padding.Empty };
            pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
            pathRow.RowStyles.Add(new RowStyle(SizeType.Absolute, 24)); pathRow.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            pathRow.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            pathRow.Controls.Add(new Label { Text = "Pasta com RPFs ou modelos YDR", ForeColor = muted, AutoSize = true, Font = ForgeFonts.Pixel(11), Margin = Padding.Empty }, 0, 0);
            folder.Dock = DockStyle.Fill; folder.Margin = new Padding(0, 5, 12, 0); folder.BackColor = ForgeTheme.Raised; folder.ForeColor = foreground; folder.BorderStyle = BorderStyle.FixedSingle; folder.Font = new Font("Consolas", 10); folder.AccessibleName = "Pasta de origem com arquivos RPF";
            ((ForgeButton)browse).FlatFrame = true; ConfigureButton(browse, "Selecionar &pasta", false); browse.Dock = DockStyle.Fill; browse.Margin = Padding.Empty;
            var inputFrame = new ForgeInputFrame(folder) { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 12, 0) };
            pathRow.Controls.Add(inputFrame, 0, 1); pathRow.Controls.Add(browse, 1, 1); main.Controls.Add(pathRow, 0, 1);
            var stats = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 1, Margin = new Padding(0, 4, 0, 8) };
            foreach (var entry in new[] { Tuple.Create("ITENS", countCars), Tuple.Create("ARQUIVOS RPF", countArchives), Tuple.Create("AVISOS / ERROS", countWarnings), Tuple.Create("ARQUIVOS EM DISCO", countWeight) }) {
                stats.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25)); var panel = new Panel { Dock = DockStyle.Fill, BackColor = surface, Margin = new Padding(0, 0, 8, 0), Padding = new Padding(12, 8, 12, 4) };
                entry.Item2.Text = "—"; entry.Item2.Dock = DockStyle.Fill; entry.Item2.Font = ForgeFonts.Pixel(22, FontStyle.Bold); entry.Item2.ForeColor = foreground;
                panel.Controls.Add(entry.Item2); panel.Controls.Add(new Label { Text = entry.Item1, Dock = DockStyle.Top, Height = 20, ForeColor = muted, Font = ForgeFonts.Pixel(10, FontStyle.Bold) }); stats.Controls.Add(panel);
            }
            main.Controls.Add(stats, 0, 2);
            var workspace = new ForgeSurface { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, BackColor = surface, Padding = new Padding(16), Margin = Padding.Empty };
            workspacePanel = workspace;
            workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 32)); workspace.RowStyles.Add(new RowStyle(SizeType.Absolute, 48)); workspace.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            pageTitle.Dock = DockStyle.Fill; pageTitle.Font = ForgeFonts.Pixel(19, FontStyle.Bold); pageTitle.Margin = Padding.Empty;
            pageHelp.Dock = DockStyle.Fill; pageHelp.ForeColor = muted; pageHelp.Font = ForgeFonts.Pixel(11); pageHelp.Margin = Padding.Empty;
            workspace.Controls.Add(pageTitle, 0, 0); workspace.Controls.Add(pageHelp, 0, 1);
            tabs.Dock = DockStyle.Fill; tabs.Margin = Padding.Empty; tabs.TabStop = false;
            SetupGrid(vehicles); SetupGrid(destinations);
            vehicles.EditMode = DataGridViewEditMode.EditOnEnter;
            AddTextColumn(vehicles, "archive", "Arquivo RPF", true, 28); AddTextColumn(vehicles, "current", "Nome original", true, 28); AddTextColumn(vehicles, "target", "Nome no jogo", false, 44); AddTextColumn(vehicles, "kind", "Conteúdo", true, 24);
            vehicles.CellPainting += PaintEditableCell;
            destinations.Columns.Add(new DataGridViewCheckBoxColumn { Name = "selected", HeaderText = "Converter", Width = 78, AutoSizeMode = DataGridViewAutoSizeColumnMode.None });
            AddTextColumn(destinations, "archive", "Arquivo RPF", true, 28); AddTextColumn(destinations, "output", "Pasta de saída", false, 30); AddTextColumn(destinations, "exists", "Destino", true, 18);
            var choice = new DataGridViewTextBoxColumn { Name = "policy", HeaderText = "Como continuar", FillWeight = 34, ReadOnly = true }; destinations.Columns.Add(choice);
            destinations.CellClick += delegate(object sender, DataGridViewCellEventArgs e) { if (e.RowIndex >= 0 && e.ColumnIndex == destinations.Columns["policy"].Index) OpenPolicyMenu(e.RowIndex); };
            destinations.KeyDown += delegate(object sender, KeyEventArgs e) { if (destinations.CurrentCell != null && destinations.CurrentCell.ColumnIndex == destinations.Columns["policy"].Index && (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter || (e.Alt && e.KeyCode == Keys.Down))) { e.Handled = true; e.SuppressKeyPress = true; OpenPolicyMenu(destinations.CurrentCell.RowIndex); } };
            destinations.CellPainting += PaintEditableCell;
            destinations.EditingControlShowing += delegate(object sender, DataGridViewEditingControlShowingEventArgs e) { e.Control.BackColor = ForgeTheme.Raised; e.Control.ForeColor = foreground; var combo = e.Control as ComboBox; if (combo != null) combo.FlatStyle = FlatStyle.Flat; };
            vehicles.AccessibleName = "Veículos e edição de spawns"; destinations.AccessibleName = "Destinos e tratamento de pastas existentes";
            details.Multiline = true; details.ReadOnly = true; details.ScrollBars = ScrollBars.Both; details.WordWrap = false; details.Dock = DockStyle.Fill; details.BackColor = surface; details.ForeColor = foreground; details.BorderStyle = BorderStyle.None; details.Font = new Font("Consolas", 10); details.AccessibleName = "Prévia, validação e resultado da conversão";
            details.Text = "A análise não altera os arquivos.\r\n\r\nSelecione a pasta de origem e clique em Analisar arquivos.\r\nAs alterações previstas e os avisos aparecerão aqui.";
            var configuration = new TableLayoutPanel { Dock = DockStyle.Top, Height = 344, ColumnCount = 1, RowCount = 4, Margin = Padding.Empty };
            configurationLayout = configuration;
            configuration.RowStyles.Add(new RowStyle(SizeType.Absolute, 24)); configuration.RowStyles.Add(new RowStyle(SizeType.Absolute, 160)); configuration.RowStyles.Add(new RowStyle(SizeType.Absolute, 32)); configuration.RowStyles.Add(new RowStyle(SizeType.Absolute, 128));
            configuration.Controls.Add(new Label { Text = "Para alterar o spawn, clique no nome na coluna “Nome no jogo” e edite.", Dock = DockStyle.Fill, ForeColor = muted, Font = ForgeFonts.Pixel(10) }, 0, 0);
            configuration.Controls.Add(vehicles, 0, 1);
            configuration.Controls.Add(new Label { Text = "Já existe uma pasta com esse nome. Escolha como continuar.", Dock = DockStyle.Fill, ForeColor = muted, Font = ForgeFonts.Pixel(10), Padding = new Padding(0, 8, 0, 0) }, 0, 2);
            configuration.Controls.Add(destinations, 0, 3);
            reviewDetails.Multiline = true; reviewDetails.ReadOnly = true; reviewDetails.ScrollBars = ScrollBars.Both; reviewDetails.WordWrap = false; reviewDetails.Dock = DockStyle.Fill; reviewDetails.BackColor = surface; reviewDetails.ForeColor = foreground; reviewDetails.BorderStyle = BorderStyle.None; reviewDetails.Font = new Font("Consolas", 10); reviewDetails.AccessibleName = "Resumo da conversão a confirmar";
            var configurationScroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true }; configurationScroll.Controls.Add(configuration);
            AddTab(titles[0], configurationScroll); AddTab(titles[1], reviewView); AddTab(titles[2], resultView);
            AddTab(titles[3], BuildHelpDocument());
            BuildEmptyState(); tabs.TabPages[0].Controls.Add(empty); empty.BringToFront(); vehicles.Visible = false;
            tabs.SelectedIndexChanged += delegate { RefreshNavigation(); }; RefreshNavigation();
            workspace.Controls.Add(tabs, 0, 2); main.Controls.Add(workspace, 0, 3);
            summary.Dock = DockStyle.Fill; summary.ForeColor = muted; summary.TextAlign = ContentAlignment.MiddleLeft; summary.AutoEllipsis = true; summary.Text = "Escolha a pasta que contém os RPFs para começar."; main.Controls.Add(summary, 0, 4);
            progress.Dock = DockStyle.Fill; progress.Margin = new Padding(0, 0, 0, 4); progress.Maximum = 100; main.Controls.Add(progress, 0, 5);
            var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty }; footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 570));
            status.Dock = DockStyle.Fill; status.ForeColor = muted; status.TextAlign = ContentAlignment.MiddleLeft; status.Font = ForgeFonts.Pixel(11); status.Text = ""; status.AccessibleName = "Estado da operação";
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Margin = Padding.Empty };
            ConfigureButton(convert, "&Converter selecionados", true); convert.Width = 205; ConfigureButton(analyze, "&Escolher pasta", true); analyze.Width = 250; ConfigureButton(open, "Abrir &resultado", false); open.Width = 165;
            ConfigureButton(back, "← &Voltar", false); back.Width = 140; back.Click += delegate { tabs.SelectedIndex = 0; };
            actions.Controls.Add(convert); actions.Controls.Add(analyze); actions.Controls.Add(open); actions.Controls.Add(back); footer.Controls.Add(status, 0, 0); footer.Controls.Add(actions, 1, 0); main.Controls.Add(footer, 0, 6);
            shell.Controls.Add(main, 1, 0); Controls.Add(shell); convert.Enabled = false; open.Enabled = false;
            SetWorkspaceReady(false); RefreshActions();
            summary.Text = "Nenhum arquivo analisado.";
            AcceptButton = analyze; hints.SetToolTip(analyze, "Analisa os RPFs e atualiza a prévia sem gravar o addon."); hints.SetToolTip(convert, "Converte somente os RPFs selecionados na aba Destinos, usando a prévia atual."); hints.SetToolTip(open, "Abre a pasta do último addon concluído nesta operação.");
        }
        void BuildEmptyState() {
            empty.Dock = DockStyle.Fill; empty.BackColor = surface;
            var center = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 5, Padding = new Padding(24) };
            center.RowStyles.Add(new RowStyle(SizeType.Percent, 50)); center.RowStyles.Add(new RowStyle(SizeType.Absolute, 96)); center.RowStyles.Add(new RowStyle(SizeType.Absolute, 38)); center.RowStyles.Add(new RowStyle(SizeType.Absolute, 60)); center.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
            center.Controls.Add(new PictureBox { Image = BrandAssets.Symbol(), SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 16), AccessibleName = "Bigorna e faísca RPForge" }, 0, 1);
            emptyTitle.Text = "Comece pela pasta de origem"; emptyTitle.Dock = DockStyle.Fill; emptyTitle.TextAlign = ContentAlignment.MiddleCenter; emptyTitle.Font = ForgeFonts.Pixel(19, FontStyle.Bold); center.Controls.Add(emptyTitle, 0, 2);
            emptyHelp.Text = "Escolha uma pasta com arquivos .rpf. A análise começa automaticamente.\nVocê poderá revisar tudo antes de converter."; emptyHelp.Dock = DockStyle.Fill; emptyHelp.TextAlign = ContentAlignment.MiddleCenter; emptyHelp.ForeColor = muted; center.Controls.Add(emptyHelp, 0, 3); empty.Controls.Add(center);
        }
        void RefreshNavigation() {
            RefreshActions();
            int index = Math.Max(0, tabs.SelectedIndex); pageTitle.Text = titles[index]; pageHelp.Text = descriptions[index];
            if (!busy && index == 0 && preview.Count > 0) stage.Text = "01 / CONFIGURAR";
            bool header = index != 0 || vehicles.Rows.Count > 0;
            if (workspacePanel != null) { workspacePanel.RowStyles[0].Height = header ? 32 : 0; workspacePanel.RowStyles[1].Height = header ? 48 : 0; pageTitle.Visible = header; pageHelp.Visible = header; }
            for (int i = 0; i < navigation.Length; i++) { navigation[i].BackColor = i == index ? ForgeTheme.Raised : surface; navigation[i].ForeColor = i == index ? red : muted; navigation[i].AccessibleDescription = i == index ? "Página selecionada" : "Abrir página"; navigation[i].Invalidate(); }
        }
        void UpdateCounts(int cars, int archives, int warnings, int errors, double bytes) {
            SetWorkspaceReady(true);
            countCars.Text = cars.ToString(); countArchives.Text = archives.ToString(); countWarnings.Text = warnings + " / " + errors; countWarnings.ForeColor = errors > 0 ? ForgeTheme.Error : warnings > 0 ? ForgeTheme.Warning : foreground; countWeight.Text = FormatSize(bytes);
            empty.Visible = cars == 0; vehicles.Visible = cars > 0; emptyTitle.Text = errors > 0 ? "Não foi possível ler os RPFs" : "Nenhum conteúdo encontrado"; emptyHelp.Text = errors > 0 ? "Veja o diagnóstico em Prévia e resultado.\nCorrija a origem e analise novamente." : "Confira se a pasta contém RPFs abertos de GTA V Legacy.\nA busca não percorre subpastas do Windows.";
            RefreshNavigation();
        }
        void SetWorkspaceReady(bool ready) { if (mainLayout != null) { mainLayout.RowStyles[2].Height = ready ? 84 : 12; mainLayout.GetControlFromPosition(0, 2).Visible = ready; } }
        void ResetOrigin() {
            reviewed = false; hasResults = false;
            lastOutput = ""; boundFolder = ""; open.Enabled = false; preview.Clear();
            rendering = true;
            try { vehicles.Rows.Clear(); destinations.Rows.Clear(); } finally { rendering = false; }
            InvalidatePreview(); stage.Text = "01 / ORIGEM"; stage.ForeColor = red;
            foreach (var label in new[] { countCars, countArchives, countWarnings, countWeight }) { label.Text = "—"; label.ForeColor = foreground; }
            vehicles.Visible = false; empty.Visible = true; emptyTitle.Text = "Analise a pasta de origem";
            SetWorkspaceReady(false); tabs.SelectedIndex = 0; RefreshNavigation();
            emptyHelp.Text = "Clique em Analisar arquivos para conferir os RPFs desta pasta.\nA análise não altera os arquivos originais.";
            summary.Text = "Pasta alterada. Analise os arquivos para preparar uma nova prévia.";
            details.Text = "Nenhuma prévia disponível para esta pasta.\r\nClique em Analisar arquivos para continuar.";
        }
        protected override void Dispose(bool disposing) { if (disposing) { hints.Dispose(); } base.Dispose(disposing); }
    }
}
