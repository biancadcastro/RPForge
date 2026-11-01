using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace RPFForge {
    sealed class ForgeButton : Button {
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(Enabled ? BackColor : Color.FromArgb(31, 34, 41));
            using (var border = new Pen(Focused ? Color.FromArgb(220, 90, 108) : Color.FromArgb(65, 71, 83))) e.Graphics.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
            TextRenderer.DrawText(e.Graphics, Text, Font, ClientRectangle, Enabled ? ForeColor : Color.FromArgb(124, 134, 151), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        }
    }
    static class Program {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [STAThread] static int Main(string[] args) {
            SetProcessDPIAware(); Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            string root = AppDomain.CurrentDomain.BaseDirectory;
            while (!File.Exists(Path.Combine(root, "src", "cli.js"))) {
                DirectoryInfo parent = Directory.GetParent(root.TrimEnd(Path.DirectorySeparatorChar));
                if (parent == null) { MessageBox.Show("Os arquivos do RPF Forge não foram encontrados.", "RPF Forge"); return 1; }
                root = parent.FullName;
            }
            if (args.Contains("--self-test")) {
                try { using (var form = new ForgeWindow(root, "")) { form.SelfTest(); } return 0; }
                catch (Exception error) { File.WriteAllText(Path.Combine(root, ".tools", "desktop-test-error.txt"), error.ToString()); return 1; }
            }
            if (args.Length == 2 && args[0] == "--render-test") {
                using (var form = new ForgeWindow(root, "")) { form.RenderBitmap(args[1]); }
                return 0;
            }
            if (args.Length == 2 && args[0] == "--workflow-test") {
                int code = 0;
                using (var form = new ForgeWindow(root, "")) {
                    form.PrepareBackgroundTest();
                    form.Shown += async delegate {
                        try { await form.WorkflowTest(args[1]); }
                        catch (Exception error) { code = 1; Directory.CreateDirectory(Path.Combine(root, ".tools")); File.WriteAllText(Path.Combine(root, ".tools", "desktop-test-error.txt"), error.ToString()); }
                        finally { form.Close(); }
                    };
                    Application.Run(form);
                }
                return code;
            }
            Application.Run(new ForgeWindow(root, args.Length > 0 ? args[0] : "")); return 0;
        }
    }

    sealed class ForgeWindow : Form {
        readonly string root;
        readonly TextBox folder = new TextBox();
        readonly Button browse = new ForgeButton(), analyze = new ForgeButton(), convert = new ForgeButton(), open = new ForgeButton();
        readonly Label summary = new Label(), status = new Label();
        readonly ProgressBar progress = new ProgressBar();
        readonly DataGridView vehicles = new DataGridView(), destinations = new DataGridView(), assets = new DataGridView();
        readonly TextBox details = new TextBox();
        readonly TabControl tabs = new TabControl();
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
        readonly Color background = Color.FromArgb(20, 22, 27), surface = Color.FromArgb(29, 32, 39), foreground = Color.FromArgb(232, 235, 241), muted = Color.FromArgb(160, 169, 184), red = Color.FromArgb(190, 44, 61);
        readonly Dictionary<string, Dictionary<string, object>> preview = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
        bool busy, rendering, previewValid, renderOnly;
        protected override bool ShowWithoutActivation { get { return renderOnly; } }
        string boundFolder = "", lastOutput = "";

        static Dictionary<string, object> Map(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        static object Get(Dictionary<string, object> map, string key) { object result; return map.TryGetValue(key, out result) ? result : null; }
        static string TextValue(object value) { return value == null ? "" : Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture); }
        static object[] ArrayValue(object value) { return value as object[] ?? new object[0]; }
        static bool Yes(object value) { return value is bool && (bool)value; }
        static double Number(object value) { return value == null ? 0 : Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture); }
        static string FormatSize(object value) { return (Number(value) / 1048576.0).ToString("N2") + " MiB"; }
        static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"").TrimEnd('\\') + (value.EndsWith("\\") ? "\\\\" : "") + "\""; }

        public ForgeWindow(string appRoot, string initialFolder) {
            root = appRoot; Text = "RPF Forge"; Size = new Size(1120, 790); MinimumSize = new Size(850, 620);
            StartPosition = FormStartPosition.CenterScreen; BackColor = background; ForeColor = foreground;
            Font = new Font("Segoe UI", 10); AutoScaleMode = AutoScaleMode.Dpi;
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 7 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 75)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 49));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 27)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 49));
            var heading = new Panel { Dock = DockStyle.Fill };
            heading.Controls.Add(new Label { Text = "RPF FORGE", Font = new Font("Segoe UI", 25, FontStyle.Bold), AutoSize = true, Location = new Point(0, 0), ForeColor = foreground });
            heading.Controls.Add(new Label { Text = "Converta, revise e organize seus veículos para FiveM.", AutoSize = true, Location = new Point(2, 47), ForeColor = muted });
            layout.Controls.Add(heading, 0, 0);
            var pathRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
            pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
            folder.Dock = DockStyle.Fill; folder.Margin = new Padding(0, 7, 12, 0); folder.BackColor = surface; folder.ForeColor = foreground; folder.BorderStyle = BorderStyle.FixedSingle; folder.AccessibleName = "Pasta que contém os arquivos RPF";
            ConfigureButton(browse, "Escolher pasta", false); browse.Dock = DockStyle.Fill;
            pathRow.Controls.Add(folder, 0, 0); pathRow.Controls.Add(browse, 1, 0); layout.Controls.Add(pathRow, 0, 1);
            summary.Text = "Escolha uma pasta com arquivos .rpf e clique em Analisar."; summary.Dock = DockStyle.Fill; summary.TextAlign = ContentAlignment.MiddleLeft; summary.ForeColor = muted;
            layout.Controls.Add(summary, 0, 2);
            tabs.Dock = DockStyle.Fill; tabs.Font = new Font("Segoe UI", 10);
            tabs.DrawMode = TabDrawMode.OwnerDrawFixed; tabs.ItemSize = new Size(172, 34); tabs.SizeMode = TabSizeMode.Fixed;
            tabs.DrawItem += delegate(object sender, DrawItemEventArgs e) {
                using (var brush = new SolidBrush(surface)) e.Graphics.FillRectangle(brush, e.Bounds);
                TextRenderer.DrawText(e.Graphics, tabs.TabPages[e.Index].Text, tabs.Font, e.Bounds, e.Index == tabs.SelectedIndex ? foreground : muted, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                if (e.Index == tabs.SelectedIndex) using (var pen = new Pen(red, 3)) e.Graphics.DrawLine(pen, e.Bounds.Left + 12, e.Bounds.Bottom - 2, e.Bounds.Right - 12, e.Bounds.Bottom - 2);
            };
            SetupGrid(vehicles); SetupGrid(destinations); SetupGrid(assets);
            AddTextColumn(vehicles, "archive", "Arquivo RPF", true, 30); AddTextColumn(vehicles, "current", "Spawn atual", true, 30); AddTextColumn(vehicles, "target", "Novo spawn (vazio = manter)", false, 40);
            destinations.Columns.Add(new DataGridViewCheckBoxColumn { Name = "selected", HeaderText = "Converter", Width = 75, AutoSizeMode = DataGridViewAutoSizeColumnMode.None });
            AddTextColumn(destinations, "archive", "Arquivo RPF", true, 30); AddTextColumn(destinations, "output", "Nome da pasta de saída", false, 30); AddTextColumn(destinations, "exists", "Destino", true, 20);
            var choice = new DataGridViewComboBoxColumn { Name = "policy", HeaderText = "Se a pasta já existir", FillWeight = 35, FlatStyle = FlatStyle.Flat };
            choice.Items.AddRange("Cancelar", "Usar outro nome", "Backup e substituir"); destinations.Columns.Add(choice);
            AddTextColumn(assets, "archive", "RPF", true, 24); AddTextColumn(assets, "file", "Arquivo", true, 52); AddTextColumn(assets, "kind", "Tipo", true, 12); AddTextColumn(assets, "size", "Tamanho em disco", true, 18);
            assets.ReadOnly = true;
            details.Multiline = true; details.ReadOnly = true; details.ScrollBars = ScrollBars.Both; details.WordWrap = false; details.Dock = DockStyle.Fill; details.BackColor = surface; details.ForeColor = foreground; details.BorderStyle = BorderStyle.None; details.Font = new Font("Consolas", 10);
            details.Text = "A análise não altera os arquivos.\r\n\r\nVocê poderá revisar spawns, destinos, referências e peças de tuning antes de converter.\r\nO peso exibido é o tamanho em disco; não estima VRAM ou ganho de FPS.";
            AddTab("Veículos", vehicles); AddTab("Destinos", destinations); AddTab("Prévia e validação", details); AddTab("Arquivos por peso", assets);
            layout.Controls.Add(tabs, 0, 3);
            status.Dock = DockStyle.Fill; status.ForeColor = muted; status.TextAlign = ContentAlignment.MiddleLeft; status.Text = "Tudo é processado localmente."; status.AutoEllipsis = true; layout.Controls.Add(status, 0, 4);
            progress.Dock = DockStyle.Fill; progress.Margin = new Padding(0, 4, 0, 7); progress.Maximum = 100; layout.Controls.Add(progress, 0, 5);
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false };
            ConfigureButton(convert, "Converter selecionados", true); convert.Width = 210; ConfigureButton(analyze, "Analisar / atualizar prévia", false); analyze.Width = 235; ConfigureButton(open, "Abrir resultado", false); open.Width = 160;
            actions.Controls.Add(convert); actions.Controls.Add(analyze); actions.Controls.Add(open); layout.Controls.Add(actions, 0, 6);
            Controls.Add(layout); convert.Enabled = false; open.Enabled = false;
            browse.Click += delegate { using (var dialog = new FolderBrowserDialog { Description = "Selecione a pasta que contém os arquivos RPF", SelectedPath = Directory.Exists(folder.Text) ? folder.Text : "" }) { if (dialog.ShowDialog(this) == DialogResult.OK) folder.Text = dialog.SelectedPath; } };
            folder.TextChanged += delegate { if (!busy) InvalidatePreview(); };
            vehicles.CellValueChanged += delegate { if (!rendering) InvalidatePreview(); };
            destinations.CellValueChanged += delegate { if (!rendering) InvalidatePreview(); };
            destinations.CurrentCellDirtyStateChanged += delegate { if (destinations.IsCurrentCellDirty) destinations.CommitEdit(DataGridViewDataErrorContexts.Commit); };
            destinations.DataError += delegate(object sender, DataGridViewDataErrorEventArgs e) { e.ThrowException = false; };
            analyze.Click += async delegate { await Analyze(); };
            convert.Click += async delegate { await ConvertSelection(); };
            open.Click += delegate { if (Directory.Exists(lastOutput)) Process.Start("explorer.exe", Quote(lastOutput)); };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; status.Text = "Aguarde a operação terminar antes de fechar, para preservar os arquivos."; } };
            folder.Text = initialFolder;
            Shown += async delegate { if (Directory.Exists(folder.Text)) await Analyze(); };
        }

        void ConfigureButton(Button button, string label, bool primary) {
            button.Text = label; button.Height = 38; button.FlatStyle = FlatStyle.Flat; button.FlatAppearance.BorderColor = primary ? red : Color.FromArgb(65, 71, 83);
            button.BackColor = primary ? red : surface; button.ForeColor = foreground; button.Margin = new Padding(10, 6, 0, 0); button.Cursor = Cursors.Hand;
        }
        void SetupGrid(DataGridView grid) {
            grid.Dock = DockStyle.Fill; grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill; grid.AllowUserToAddRows = false; grid.AllowUserToDeleteRows = false; grid.AllowUserToResizeRows = false; grid.RowHeadersVisible = false;
            grid.BackgroundColor = surface; grid.BorderStyle = BorderStyle.None; grid.EnableHeadersVisualStyles = false; grid.ColumnHeadersHeight = 38; grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(39, 43, 52); grid.ColumnHeadersDefaultCellStyle.ForeColor = foreground; grid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            grid.DefaultCellStyle.BackColor = surface; grid.DefaultCellStyle.ForeColor = foreground; grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(70, 42, 54); grid.DefaultCellStyle.SelectionForeColor = Color.White; grid.DefaultCellStyle.Padding = new Padding(8, 0, 4, 0); grid.RowTemplate.Height = 34;
            grid.GridColor = Color.FromArgb(48, 53, 63); grid.SelectionMode = DataGridViewSelectionMode.CellSelect;
        }
        void AddTextColumn(DataGridView grid, string name, string header, bool readOnly, float weight) { grid.Columns.Add(new DataGridViewTextBoxColumn { Name = name, HeaderText = header, ReadOnly = readOnly, FillWeight = weight, SortMode = DataGridViewColumnSortMode.NotSortable }); }
        void AddTab(string label, Control content) { var tab = new TabPage(label) { BackColor = surface, Padding = new Padding(12) }; tab.Controls.Add(content); tabs.TabPages.Add(tab); }
        void InvalidatePreview() { previewValid = false; convert.Enabled = false; if (preview.Count > 0) status.Text = "Alterações pendentes. Clique em Analisar / atualizar prévia antes de converter."; }
        void SetBusy(bool value, string message) {
            busy = value; browse.Enabled = !value; analyze.Enabled = !value; folder.Enabled = !value; vehicles.Enabled = !value; destinations.Enabled = !value; convert.Enabled = !value && previewValid;
            status.Text = message; progress.Style = value ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous; if (!value) progress.Value = 0;
        }
        Dictionary<string, object> Requests(bool includeHash) {
            var result = new Dictionary<string, object>();
            if (!String.Equals(boundFolder, folder.Text, StringComparison.OrdinalIgnoreCase)) return result;
            foreach (DataGridViewRow row in destinations.Rows) {
                string archive = TextValue(row.Cells["archive"].Value); var config = new Dictionary<string, object>();
                config["selected"] = Yes(row.Cells["selected"].Value);
                config["existing"] = TextValue(row.Cells["policy"].Value) == "Backup e substituir" ? "backup" : TextValue(row.Cells["policy"].Value) == "Usar outro nome" ? "rename" : "cancel";
                string name = TextValue(row.Cells["output"].Value).Trim();
                if (name.Length > 0 && name != TextValue(row.Tag)) config["outputName"] = name;
                var spawns = new Dictionary<string, object>();
                foreach (DataGridViewRow vehicle in vehicles.Rows) if (TextValue(vehicle.Cells["archive"].Value) == archive) {
                    string target = TextValue(vehicle.Cells["target"].Value).Trim();
                    if (target.Length > 0) spawns[TextValue(vehicle.Cells["current"].Value)] = target;
                }
                config["spawns"] = spawns;
                if (includeHash && preview.ContainsKey(archive)) config["expectedSource"] = Get(preview[archive], "sourceHash");
                result[archive] = config;
            }
            return result;
        }
        async Task<object[]> Execute(string action, Dictionary<string, object> requestArchives) {
            string selectedFolder = folder.Text;
            return await Task.Factory.StartNew(delegate {
                string requestDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RPFForge", "requests");
                Directory.CreateDirectory(requestDir); string requestPath = Path.Combine(requestDir, Guid.NewGuid().ToString("N") + ".json");
                File.WriteAllText(requestPath, json.Serialize(new Dictionary<string, object> { { "action", action }, { "folder", selectedFolder }, { "archives", requestArchives } }), new UTF8Encoding(false));
                try {
                    string node = Path.Combine(root, "runtime", "node.exe"); if (!File.Exists(node)) node = "node.exe";
                    var info = new ProcessStartInfo(node, Quote(Path.Combine(root, "src", "cli.js")) + " --bridge " + Quote(requestPath)) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8, WorkingDirectory = root };
                    using (var process = new Process { StartInfo = info }) {
                        var stderr = new StringBuilder(); process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) stderr.AppendLine(e.Data); };
                        process.Start(); process.BeginErrorReadLine(); object[] result = null; string error = null; string line;
                        while ((line = process.StandardOutput.ReadLine()) != null) {
                            var message = Map(json.DeserializeObject(line)); string type = TextValue(Get(message, "type"));
                            if (type == "result") result = ArrayValue(Get(message, "data"));
                            else if (type == "error") error = TextValue(Get(message, "message"));
                            else if (type == "progress") { var snapshot = message; BeginInvoke((Action)delegate { ShowProgress(snapshot); }); }
                        }
                        process.WaitForExit();
                        if (error != null) throw new Exception(error);
                        if (result == null || process.ExitCode != 0) throw new Exception("Não foi possível concluir a operação. Confira o acesso à pasta e tente analisar novamente.");
                        return result;
                    }
                } finally { if (File.Exists(requestPath)) File.Delete(requestPath); }
            });
        }
        void ShowProgress(Dictionary<string, object> message) {
            string phase = TextValue(Get(message, "phase"));
            string label = phase == "read" ? "Lendo RPF" : phase == "write" ? "Gravando addon" : phase == "verify" ? "Conferindo arquivos gravados" : phase == "audit" ? "Validando referências" : phase == "convert" ? "Convertendo" : "Preparando prévia";
            status.Text = label + ": " + TextValue(Get(message, "label"));
            double total = Number(Get(message, "total"));
            if (total > 0) { progress.Style = ProgressBarStyle.Continuous; progress.Value = Math.Max(0, Math.Min(100, (int)(100 * Number(Get(message, "current")) / total))); }
        }
        async Task Analyze() {
            if (busy) return; vehicles.EndEdit(); destinations.EndEdit();
            var requests = Requests(false); SetBusy(true, "Preparando a prévia; os originais permanecem intactos.");
            try { RenderPreview(await Execute("preview", requests), requests); }
            catch (Exception error) { previewValid = false; details.Text = error.Message + "\r\n\r\nSelecione uma pasta válida ou tente analisar novamente."; tabs.SelectedIndex = 2; summary.Text = "A análise não foi concluída."; }
            finally { SetBusy(false, previewValid ? "Prévia pronta. Revise as abas e clique em Converter selecionados." : "Revise os avisos ou corrija a pasta e analise novamente."); }
        }
        void RenderPreview(object[] results, Dictionary<string, object> requests) {
            rendering = true;
            try {
                preview.Clear(); vehicles.Rows.Clear(); destinations.Rows.Clear(); assets.Rows.Clear(); boundFolder = folder.Text;
                int cars = 0, errors = 0, warnings = 0; double weight = 0; var text = new StringBuilder();
                var weighted = new List<Tuple<string, Dictionary<string, object>>>(); bool eligible = false, selectedError = false;
                foreach (object item in results) {
                    var result = Map(item); string archive = TextValue(Get(result, "archive")); preview[archive] = result;
                    var requested = Map(Get(requests, archive)); bool selected = !requested.ContainsKey("selected") || Yes(Get(requested, "selected"));
                    text.AppendLine(archive.ToUpperInvariant());
                    if (!Yes(Get(result, "ok"))) { errors++; text.AppendLine("ERRO: " + TextValue(Get(result, "error"))); text.AppendLine(); destinations.Rows.Add(false, archive, "", "Falha na leitura", "Cancelar"); continue; }
                    var audit = Map(Get(result, "audit")); errors += (int)Number(Get(audit, "errors")); warnings += (int)Number(Get(audit, "warnings")); weight += Number(Get(audit, "diskBytes"));
                    var spawns = Map(Get(requested, "spawns"));
                    foreach (object model in ArrayValue(Get(result, "models"))) { string name = TextValue(model); vehicles.Rows.Add(archive, name, TextValue(Get(spawns, name))); cars++; }
                    string policy = TextValue(Get(requested, "existing")); policy = policy == "backup" ? "Backup e substituir" : policy == "rename" ? "Usar outro nome" : "Cancelar";
                    int row = destinations.Rows.Add(selected, archive, TextValue(Get(result, "outputName")), Yes(Get(result, "exists")) ? "Já existe" : "Livre", policy); destinations.Rows[row].Tag = TextValue(Get(result, "defaultName"));
                    if (selected) { eligible = true; if (!Yes(Get(audit, "ok"))) selectedError = true; }
                    text.AppendLine("Saída: " + TextValue(Get(result, "output")) + (Yes(Get(result, "exists")) ? " [pasta existente: escolha o tratamento na aba Destinos]" : ""));
                    text.AppendLine("Spawns finais: " + String.Join(", ", ArrayValue(Get(result, "finalModels")).Select(TextValue)));
                    text.AppendLine("Arquivos de streaming: " + FormatSize(Get(audit, "diskBytes")) + " em disco. RPF original: " + FormatSize(Get(result, "sourceBytes")) + ".");
                    if (Number(Get(result, "mergedSources")) > 0) text.AppendLine("Metas unificados: " + TextValue(Get(result, "mergedSources")) + " arquivos adicionais combinados.");
                    var removed = ArrayValue(Get(result, "removedTuning")); if (removed.Length > 0) text.AppendLine("Tuning sem modelo que será removido: " + String.Join(", ", removed.Select(TextValue)));
                    var skipped = ArrayValue(Get(result, "skipped")); if (skipped.Length > 0) text.AppendLine("Arquivos que serão ignorados: " + String.Join(", ", skipped.Select(TextValue)));
                    foreach (object problem in ArrayValue(Get(audit, "issues"))) { var issue = Map(problem); text.AppendLine((TextValue(Get(issue, "severity")) == "error" ? "ERRO: " : "AVISO: ") + TextValue(Get(issue, "message"))); }
                    if (Number(Get(audit, "errors")) == 0 && Number(Get(audit, "warnings")) == 0) text.AppendLine("Validação estrutural aprovada, sem conflitos encontrados.");
                    text.AppendLine();
                    foreach (object file in ArrayValue(Get(audit, "assets"))) weighted.Add(Tuple.Create(archive, Map(file)));
                }
                foreach (var file in weighted.OrderByDescending(p => Number(Get(p.Item2, "diskBytes"))).Take(200)) assets.Rows.Add(file.Item1, TextValue(Get(file.Item2, "path")), TextValue(Get(file.Item2, "kind")), FormatSize(Get(file.Item2, "diskBytes")));
                text.AppendLine("Peso = espaço em disco, sem estimativa de VRAM ou FPS. A aba de peso apresenta até 200 arquivos, do maior para o menor.");
                details.Text = text.ToString(); summary.Text = cars + " veículos  ·  " + results.Length + " RPFs  ·  " + FormatSize(weight) + " em streaming  ·  " + errors + " erros  ·  " + warnings + " avisos";
                previewValid = eligible && !selectedError; convert.Enabled = previewValid && !busy;
                if (errors > 0) tabs.SelectedIndex = 2;
            } finally { rendering = false; }
        }
        async Task ConvertSelection() {
            if (busy || !previewValid) return; vehicles.EndEdit(); destinations.EndEdit();
            if (!previewValid) return;
            var request = Requests(true); SetBusy(true, "Convertendo os veículos selecionados.");
            try { RenderResults(await Execute("convert", request)); }
            catch (Exception error) { details.Text = error.Message; tabs.SelectedIndex = 2; summary.Text = "A conversão não foi concluída. Seus dados anteriores foram preservados."; }
            finally { previewValid = false; SetBusy(false, "Confira o resultado na aba Prévia e validação. Para repetir, analise novamente."); }
        }
        void RenderResults(object[] results) {
            var text = new StringBuilder(); int success = 0, cancelled = 0, failed = 0;
            foreach (object item in results) {
                var result = Map(item); text.AppendLine(TextValue(Get(result, "archive")));
                if (Yes(Get(result, "ok"))) {
                    success++; lastOutput = TextValue(Get(result, "output")); text.AppendLine("CONCLUÍDO: " + lastOutput); text.AppendLine("server.cfg: ensure " + TextValue(Get(result, "resource")));
                    if (Get(result, "backup") != null) text.AppendLine("Backup preservado: " + TextValue(Get(result, "backup")));
                    foreach (object problem in ArrayValue(Get(Map(Get(result, "audit")), "issues"))) text.AppendLine("AVISO: " + TextValue(Get(Map(problem), "message")));
                } else { if (Yes(Get(result, "cancelled"))) cancelled++; else failed++; text.AppendLine(TextValue(Get(result, "error"))); }
                text.AppendLine();
            }
            details.Text = text.ToString(); summary.Text = success + " addons concluídos  ·  " + cancelled + " cancelados  ·  " + failed + " falhas. Valide os veículos no FiveM.";
            tabs.SelectedIndex = 2; open.Enabled = Directory.Exists(lastOutput);
        }
        public void SelfTest() {
            if (convert.Enabled || open.Enabled) throw new Exception("Initial actions should be disabled.");
            folder.Text = Path.GetTempPath();
            string sample = "[{\"archive\":\"dlc.rpf\",\"ok\":true,\"models\":[\"car\"],\"finalModels\":[\"car\"],\"defaultName\":\"car\",\"outputName\":\"car\",\"output\":\"car\",\"exists\":false,\"sourceHash\":\"abc\",\"sourceBytes\":10,\"audit\":{\"ok\":true,\"errors\":0,\"warnings\":0,\"diskBytes\":10,\"issues\":[],\"assets\":[]},\"removedTuning\":[],\"skipped\":[]}]";
            RenderPreview(ArrayValue(json.DeserializeObject(sample)), new Dictionary<string, object>());
            if (!previewValid || vehicles.Rows.Count != 1 || destinations.Rows.Count != 1) throw new Exception("Valid preview not rendered.");
            vehicles.Rows[0].Cells["target"].Value = "AITOM8";
            if (previewValid || convert.Enabled) throw new Exception("Editing must invalidate preview.");
            SetBusy(true, "test"); if (browse.Enabled || analyze.Enabled || vehicles.Enabled) throw new Exception("Busy actions not disabled."); SetBusy(false, "test");
            RenderPreview(ArrayValue(json.DeserializeObject(sample.Replace("\"errors\":0", "\"errors\":1").Replace("\"ok\":true,\"errors\"", "\"ok\":false,\"errors\""))), new Dictionary<string, object>());
            if (previewValid) throw new Exception("Audit error must block conversion.");
            RenderPreview(new object[0], new Dictionary<string, object>()); if (previewValid) throw new Exception("Empty preview must not convert.");
        }
        public void RenderBitmap(string destination) {
            renderOnly = true; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-30000, -30000);
            Show(); PerformLayout(); Application.DoEvents();
            using (var image = new Bitmap(Width, Height)) { DrawToBitmap(image, new Rectangle(Point.Empty, Size)); image.Save(destination, System.Drawing.Imaging.ImageFormat.Png); }
            Hide();
        }
        public void PrepareBackgroundTest() { renderOnly = true; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-30000, -30000); }
        public async Task WorkflowTest(string fixtureFolder) {
            folder.Text = fixtureFolder;
            await Analyze();
            if (!previewValid || vehicles.Rows.Count != 1 || assets.Rows.Count == 0) throw new Exception("Initial GUI preview failed: " + details.Text);
            vehicles.Rows[0].Cells["target"].Value = "DESKTOPTEST";
            if (previewValid) throw new Exception("Edits must invalidate GUI preview.");
            await Analyze();
            if (!previewValid || !details.Text.Contains("DESKTOPTEST")) throw new Exception("Renamed GUI preview failed: " + details.Text);
            await ConvertSelection();
            string output = Path.Combine(fixtureFolder, "DESKTOPTEST");
            if (!File.Exists(Path.Combine(output, "fxmanifest.lua")) || !File.ReadAllText(Path.Combine(output, "data", "vehicles.meta")).Contains("<modelName>DESKTOPTEST</modelName>")) throw new Exception("GUI conversion failed: " + details.Text);
            if (File.Exists(Path.Combine(output, "conversion-report.json"))) throw new Exception("Unexpected report in addon.");
            File.WriteAllText(Path.Combine(output, "keep.txt"), "preserve old output");
            destinations.Rows[0].Cells["policy"].Value = "Backup e substituir";
            await Analyze(); if (!previewValid) throw new Exception("Backup preview failed: " + details.Text);
            await ConvertSelection();
            string[] backups = Directory.GetDirectories(fixtureFolder, "DESKTOPTEST.backup-*");
            if (backups.Length != 1 || File.ReadAllText(Path.Combine(backups[0], "keep.txt")) != "preserve old output") throw new Exception("GUI backup failed: " + details.Text);
            if (!open.Enabled) throw new Exception("Successful GUI conversion must allow opening output.");
            string empty = Path.Combine(fixtureFolder, "empty"); Directory.CreateDirectory(empty); folder.Text = empty; await Analyze();
            if (previewValid || convert.Enabled) throw new Exception("Empty-folder GUI state must not convert.");
        }
    }
}
