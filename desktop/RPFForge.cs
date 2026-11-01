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
        bool hovered, pressed;
        public bool Navigation { get; set; }
        protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Space) { pressed = true; Invalidate(); } base.OnKeyDown(e); }
        protected override void OnKeyUp(KeyEventArgs e) { pressed = false; Invalidate(); base.OnKeyUp(e); }
        protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hovered = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnPaint(PaintEventArgs e) {
            e.Graphics.Clear(ForgeTheme.Background);
            bool primary = BackColor == ForgeTheme.Orange, selected = Navigation && ForeColor == ForgeTheme.Orange;
            Color fill = !Enabled ? ForgeTheme.Surface : primary ? (pressed ? Color.FromArgb(220, 92, 30) : hovered ? Color.FromArgb(255, 150, 83) : ForgeTheme.Orange) : selected ? Color.FromArgb(49, 34, 30) : hovered ? Color.FromArgb(49, 49, 64) : ForgeTheme.Surface;
            int down = pressed ? 2 : 0;
            var body = new Rectangle(0, down, Width - 1, Height - 4);
            using (var brush = new SolidBrush(fill)) e.Graphics.FillRectangle(brush, body);
            using (var border = new Pen(Focused || selected ? ForgeTheme.Orange : primary && Enabled ? Color.FromArgb(255, 175, 118) : ForgeTheme.Border)) e.Graphics.DrawRectangle(border, body);
            if (!pressed && Enabled && !Navigation) using (var shadow = new SolidBrush(primary ? Color.FromArgb(155, 65, 24) : Color.FromArgb(16, 16, 22))) e.Graphics.FillRectangle(shadow, 2, Height - 3, Width - 3, 3);
            if (selected) using (var marker = new SolidBrush(ForgeTheme.Orange)) e.Graphics.FillRectangle(marker, 0, 12, 4, Height - 28);
            if (Focused) { using (var pen = new Pen(primary ? ForgeTheme.Background : ForgeTheme.Orange)) e.Graphics.DrawRectangle(pen, 4, 4 + down, Width - 9, Height - 12); }
            var textBounds = new Rectangle(Navigation ? 14 : 6, down, Width - (Navigation ? 20 : 12), Height - 4);
            TextRenderer.DrawText(e.Graphics, Text, Font, textBounds, Enabled ? ForeColor : Color.FromArgb(110, 108, 125), (Navigation ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter) | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
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
            if (args.Length == 2 && args[0] == "--render-suite") {
                using (var form = new ForgeWindow(root, "")) { form.RenderSuite(args[1]); }
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
            var window = new ForgeWindow(root, args.Length > 0 && args[0] != "--preview" ? args[0] : "");
            if (args.Contains("--preview")) window.Text = "RPForge — prévia de desenvolvimento";
            Application.Run(window); return 0;
        }
    }

    sealed partial class ForgeWindow : Form {
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);
        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); int dark = 1; try { DwmSetWindowAttribute(Handle, 20, ref dark, 4); } catch (DllNotFoundException) { } catch (EntryPointNotFoundException) { } }
        readonly string root;
        readonly TextBox folder = new TextBox();
        readonly Button browse = new ForgeButton(), analyze = new ForgeButton(), convert = new ForgeButton(), open = new ForgeButton();
        readonly Label summary = new Label(), status = new Label();
        readonly ForgeProgress progress = new ForgeProgress();
        readonly DataGridView vehicles = new DataGridView(), destinations = new DataGridView(), assets = new DataGridView();
        readonly TextBox details = new TextBox();
        readonly ForgePages tabs = new ForgePages();
        readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
        readonly Color background = ForgeTheme.Background, surface = ForgeTheme.Surface, foreground = ForgeTheme.Text, muted = ForgeTheme.Muted, red = ForgeTheme.Orange;
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
        static string CountLabel(int value, string singular, string plural) { return value + " " + (value == 1 ? singular : plural); }
        static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"").TrimEnd('\\') + (value.EndsWith("\\") ? "\\\\" : "") + "\""; }

        public ForgeWindow(string appRoot, string initialFolder) {
            root = appRoot; BuildInterface();
            browse.Click += async delegate {
                string selected;
                try { selected = ForgeFolderPicker.Choose(Handle, folder.Text); }
                catch (Exception error) { status.Text = "Não foi possível abrir a pasta. Você também pode digitar o caminho no campo de origem."; details.Text = error.Message; tabs.SelectedIndex = 2; return; }
                await SelectOrigin(selected);
            };
            folder.TextChanged += delegate { if (!busy) ResetOrigin(); };
            vehicles.CellValueChanged += delegate { if (!rendering) InvalidatePreview(); };
            destinations.CellValueChanged += delegate { if (!rendering) InvalidatePreview(); };
            destinations.CurrentCellDirtyStateChanged += delegate { if (destinations.IsCurrentCellDirty) destinations.CommitEdit(DataGridViewDataErrorContexts.Commit); };
            destinations.DataError += delegate(object sender, DataGridViewDataErrorEventArgs e) { e.ThrowException = false; };
            analyze.Click += async delegate { await PrimaryAction(); };
            convert.Click += async delegate { await ConvertSelection(); };
            open.Click += delegate { if (!busy && Directory.Exists(lastOutput)) Process.Start("explorer.exe", Quote(lastOutput)); };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; status.Text = "Aguarde a operação terminar antes de fechar, para preservar os arquivos."; } };
            folder.Text = initialFolder;
            Shown += async delegate { if (Directory.Exists(folder.Text)) await Analyze(); };
        }

        async Task SelectOrigin(string selected) {
            if (busy || selected == null) return;
            folder.Text = selected;
            tabs.SelectedIndex = 0;
            await Analyze();
        }

        void ConfigureButton(Button button, string label, bool primary) {
            button.Text = label; button.Height = 44; button.Font = ForgeFonts.Pixel(12); button.FlatStyle = FlatStyle.Flat; button.FlatAppearance.BorderColor = primary ? red : ForgeTheme.Border;
            button.BackColor = primary ? red : surface; button.ForeColor = primary ? background : foreground; button.Margin = new Padding(8, 8, 0, 0); button.Cursor = Cursors.Hand;
        }
        void SetupGrid(DataGridView grid) {
            grid.Dock = DockStyle.Fill; grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill; grid.AllowUserToAddRows = false; grid.AllowUserToDeleteRows = false; grid.AllowUserToResizeRows = false; grid.RowHeadersVisible = false;
            grid.BackgroundColor = surface; grid.BorderStyle = BorderStyle.None; grid.EnableHeadersVisualStyles = false; grid.ColumnHeadersHeight = 38; grid.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            grid.ColumnHeadersDefaultCellStyle.BackColor = ForgeTheme.Raised; grid.ColumnHeadersDefaultCellStyle.ForeColor = foreground; grid.ColumnHeadersDefaultCellStyle.Font = ForgeFonts.Pixel(12, FontStyle.Bold);
            grid.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single; grid.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
            grid.DefaultCellStyle.BackColor = surface; grid.DefaultCellStyle.ForeColor = foreground; grid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(71, 45, 34); grid.DefaultCellStyle.SelectionForeColor = Color.White; grid.DefaultCellStyle.Padding = new Padding(8, 0, 4, 0); grid.RowTemplate.Height = 36; grid.DefaultCellStyle.Font = new Font("Consolas", 10); grid.StandardTab = true; grid.MultiSelect = false;
            grid.GridColor = ForgeTheme.Border; grid.SelectionMode = DataGridViewSelectionMode.CellSelect;
        }
        void AddTextColumn(DataGridView grid, string name, string header, bool readOnly, float weight) { grid.Columns.Add(new DataGridViewTextBoxColumn { Name = name, HeaderText = header, ReadOnly = readOnly, FillWeight = weight, SortMode = DataGridViewColumnSortMode.NotSortable }); }
        void AddTab(string label, Control content) { tabs.AddPage(label, content); }
        void InvalidatePreview() { previewValid = false; reviewed = false; stage.Text = "01 / CONFIGURAR"; if (preview.Count > 0) status.Text = "Ao continuar, as alterações serão validadas automaticamente."; RefreshActions(); }
        void SetBusy(bool value, string message) {
            busy = value; open.Enabled = !value && Directory.Exists(lastOutput); browse.Enabled = !value; analyze.Enabled = !value; folder.Enabled = !value; vehicles.Enabled = !value; destinations.Enabled = !value; convert.Enabled = !value && previewValid;
            status.Text = message; progress.Style = value ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous; if (!value) progress.Value = 0; progress.AccessibleDescription = message; RefreshActions();
        }
        Dictionary<string, object> Requests(bool includeHash) {
            var result = new Dictionary<string, object>();
            if (!String.Equals(boundFolder, folder.Text, StringComparison.OrdinalIgnoreCase)) return result;
            foreach (DataGridViewRow row in destinations.Rows) {
                string archive = TextValue(row.Cells["archive"].Value); var config = new Dictionary<string, object>();
                config["selected"] = Yes(row.Cells["selected"].Value);
                config["policyPending"] = TextValue(row.Cells["policy"].Value) == "Escolha uma ação";
                config["reviewedExisting"] = TextValue(row.Cells["exists"].Value) == "Já existe";
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
            if (!busy) return;
            string phase = TextValue(Get(message, "phase"));
            stage.Text = phase == "verify" || phase == "audit" ? "VALIDANDO" : phase == "write" || phase == "convert" ? "CONVERTENDO" : "ANALISANDO";
            string label = phase == "read" ? "Lendo RPF" : phase == "write" ? "Gravando addon" : phase == "verify" ? "Conferindo arquivos gravados" : phase == "audit" ? "Validando referências" : phase == "convert" ? "Convertendo" : "Preparando prévia";
            status.Text = label + ": " + TextValue(Get(message, "label")); progress.AccessibleDescription = status.Text;
            double total = Number(Get(message, "total"));
            if (total <= 0) progress.Style = ProgressBarStyle.Marquee;
            if (total > 0) { progress.Style = ProgressBarStyle.Continuous; progress.Value = Math.Max(0, Math.Min(100, (int)(100 * Number(Get(message, "current")) / total))); }
        }
        async Task Analyze() {
            if (busy) return; vehicles.EndEdit(); destinations.EndEdit();
            reviewed = false; hasResults = false; lastOutput = ""; open.Enabled = false; stage.Text = "ANALISANDO PASTA";
            var requests = Requests(false); SetBusy(true, "Preparando a prévia; os originais permanecem intactos.");
            try { RenderPreview(await Execute("preview", requests), requests); }
            catch (Exception error) { previewValid = false; details.Text = error.Message + "\r\n\r\nSelecione uma pasta válida ou tente analisar novamente."; reviewDetails.Text = details.Text; tabs.SelectedIndex = 1; summary.Text = "A análise não foi concluída."; stage.Text = "ANÁLISE INTERROMPIDA"; stage.ForeColor = ForgeTheme.Error; }
            finally { SetBusy(false, previewValid ? "Configure os nomes e as pastas; depois clique em Revisar conversão." : "Revise o diagnóstico ou escolha outra pasta."); }
        }
        void RenderPreview(object[] results, Dictionary<string, object> requests) {
            rendering = true;
            try {
                var previous = new Dictionary<string, Dictionary<string, object>>(preview, StringComparer.OrdinalIgnoreCase);
                preview.Clear(); vehicles.Rows.Clear(); destinations.Rows.Clear(); assets.Rows.Clear(); boundFolder = folder.Text;
                int cars = 0, errors = 0, warnings = 0; double weight = 0; var text = new StringBuilder();
                var weighted = new List<Tuple<string, Dictionary<string, object>>>(); bool eligible = false, selectedError = false;
                foreach (object item in results) {
                    var result = Map(item); string archive = TextValue(Get(result, "archive")); preview[archive] = result;
                    var requested = Map(Get(requests, archive)); bool selected = !requested.ContainsKey("selected") || Yes(Get(requested, "selected"));
                    text.AppendLine(archive.ToUpperInvariant());
                    if (!Yes(Get(result, "ok"))) {
                        errors++; text.AppendLine("ERRO: " + TextValue(Get(result, "error"))); text.AppendLine();
                        Dictionary<string, object> prior;
                        if (previous.TryGetValue(archive, out prior) && ArrayValue(Get(prior, "models")).Length > 0) {
                            // Keep the editable form after validation fails; it is not a valid preview.
                            preview[archive] = prior;
                            var requestedSpawns = Map(Get(requested, "spawns"));
                            foreach (object model in ArrayValue(Get(prior, "models"))) { string name = TextValue(model); vehicles.Rows.Add(archive, name, TextValue(Get(requestedSpawns, name))); cars++; }
                            string requestedPolicy = TextValue(Get(requested, "existing")); string policyLabel = Yes(Get(requested, "policyPending")) ? "Escolha uma ação" : requestedPolicy == "backup" ? "Backup e substituir" : requestedPolicy == "rename" ? "Usar outro nome" : "Cancelar";
                            int invalidRow = destinations.Rows.Add(selected, archive, requested.ContainsKey("outputName") ? TextValue(Get(requested, "outputName")) : TextValue(Get(prior, "outputName")), Yes(Get(prior, "exists")) ? "Já existe" : "Livre", policyLabel);
                            destinations.Rows[invalidRow].Tag = TextValue(Get(prior, "defaultName"));
                            if (selected) selectedError = true;
                        } else destinations.Rows.Add(false, archive, "", "Falha na leitura", "Cancelar");
                        continue;
                    }
                    var audit = Map(Get(result, "audit")); errors += (int)Number(Get(audit, "errors")); warnings += (int)Number(Get(audit, "warnings")); weight += Number(Get(audit, "diskBytes"));
                    var spawns = Map(Get(requested, "spawns"));
                    foreach (object model in ArrayValue(Get(result, "models"))) { string name = TextValue(model); vehicles.Rows.Add(archive, name, TextValue(Get(spawns, name))); cars++; }
                    foreach (object model in ArrayValue(Get(result, "models"))) { string name = TextValue(model), target = TextValue(Get(spawns, name)); if (target.Length > 0 && target != name) text.AppendLine("Renomeação: " + name + " → " + target + " (arquivos e referências correspondentes nos metas)"); }
                    string policy = TextValue(Get(requested, "existing")); policy = policy == "backup" ? "Backup e substituir" : policy == "rename" ? "Usar outro nome" : "Cancelar";
                    if (Yes(Get(result, "exists")) && (Yes(Get(requested, "policyPending")) || !requested.ContainsKey("existing") || (!Yes(Get(requested, "reviewedExisting")) && TextValue(Get(requested, "existing")) == "cancel"))) policy = "Escolha uma ação";
                    int row = destinations.Rows.Add(selected, archive, TextValue(Get(result, "outputName")), Yes(Get(result, "exists")) ? "Já existe" : "Livre", policy); destinations.Rows[row].Tag = TextValue(Get(result, "defaultName"));
                    if (selected) { eligible = true; if (!Yes(Get(audit, "ok"))) selectedError = true; }
                    text.AppendLine("Saída: " + TextValue(Get(result, "output")) + (Yes(Get(result, "exists")) ? " [pasta existente — ação: " + policy + "]" : ""));
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
                details.Text = text.ToString(); summary.Text = CountLabel(cars, "veículo", "veículos") + "  ·  " + CountLabel(results.Length, "RPF", "RPFs") + "  ·  " + FormatSize(weight) + " em streaming  ·  " + CountLabel(errors, "erro", "erros") + "  ·  " + CountLabel(warnings, "aviso", "avisos");
                reviewDetails.Text = details.Text;
                UpdateCounts(cars, results.Length, warnings, errors, weight);
                stage.Text = errors > 0 ? "REVISE OS ERROS" : results.Length == 0 ? "NENHUM RPF ENCONTRADO" : "01 / CONFIGURAR"; stage.ForeColor = errors > 0 ? ForgeTheme.Error : red;
                previewValid = eligible && !selectedError; convert.Enabled = previewValid && !busy;
                if (errors > 0) tabs.SelectedIndex = 1;
                RefreshActions();
            } finally { rendering = false; }
        }
        async Task ConvertSelection() {
            if (busy || !previewValid || !reviewed) return; vehicles.EndEdit(); destinations.EndEdit();
            if (!previewValid || !reviewed) return;
            lastOutput = ""; open.Enabled = false; stage.Text = "03 / CONVERSÃO";
            var request = Requests(true); SetBusy(true, "Convertendo os veículos selecionados.");
            try { RenderResults(await Execute("convert", request)); }
            catch (Exception error) { hasResults = true; reviewed = false; details.Text = error.Message; tabs.SelectedIndex = 2; summary.Text = "A conversão não foi concluída. Confira o diagnóstico antes de tentar novamente."; stage.Text = "CONVERSÃO INTERROMPIDA"; stage.ForeColor = ForgeTheme.Error; }
            finally { previewValid = false; SetBusy(false, "Confira o resultado. Use Nova conversão para começar outro pacote."); }
        }
        void RenderResults(object[] results) {
            previewValid = false; reviewed = false; hasResults = true; convert.Enabled = false;
            lastOutput = ""; var text = new StringBuilder(); int success = 0, cancelled = 0, failed = 0, warnings = 0;
            foreach (object item in results) {
                var result = Map(item); text.AppendLine(TextValue(Get(result, "archive")));
                if (Yes(Get(result, "ok"))) {
                    success++; lastOutput = TextValue(Get(result, "output")); text.AppendLine("CONCLUÍDO: " + lastOutput); text.AppendLine("server.cfg: ensure " + TextValue(Get(result, "resource")));
                    if (Get(result, "backup") != null) text.AppendLine("Backup preservado: " + TextValue(Get(result, "backup")));
                    foreach (object problem in ArrayValue(Get(Map(Get(result, "audit")), "issues"))) { warnings++; text.AppendLine("AVISO: " + TextValue(Get(Map(problem), "message"))); }
                } else { if (Yes(Get(result, "cancelled"))) cancelled++; else failed++; text.AppendLine(TextValue(Get(result, "error"))); }
                text.AppendLine();
            }
            details.Text = text.ToString(); summary.Text = CountLabel(success, "addon concluído", "addons concluídos") + "  ·  " + CountLabel(cancelled, "cancelado", "cancelados") + "  ·  " + CountLabel(failed, "falha", "falhas") + ". Valide os veículos no FiveM.";
            stage.Text = failed > 0 ? "CONCLUÍDO COM FALHAS" : success == 0 ? "NENHUM ADDON GERADO" : warnings > 0 ? "CONCLUÍDO COM AVISOS" : "03 / CONCLUÍDO";
            stage.ForeColor = failed > 0 ? ForgeTheme.Error : warnings > 0 || success == 0 ? ForgeTheme.Warning : ForgeTheme.Success;
            tabs.SelectedIndex = 2; open.Enabled = !busy && Directory.Exists(lastOutput);
        }
        public void SelfTest() {
            ForgeFolderPicker.SelfTest();
            if (convert.Enabled || open.Enabled) throw new Exception("Initial actions should be disabled.");
            if (tabs.TabPages.Count != 5 || Text != "RPForge" || Icon == null) throw new Exception("Branded navigation missing.");
            if (Font.FontFamily.Name != "Pixelify Sans" || convert.Font.FontFamily.Name != "Pixelify Sans") throw new Exception("Portfolio font was not loaded.");
            tabs.SelectedIndex = 4;
            if (pageTitle.Text != "Ajuda") throw new Exception("Navigation did not update heading.");
            tabs.SelectedIndex = 0;
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
            if (countCars.Text != "0" || countArchives.Text != "0") throw new Exception("Empty preview kept stale counters.");
            lastOutput = Path.GetTempPath(); open.Enabled = true;
            SetBusy(true, "test"); if (open.Enabled) throw new Exception("Opening old output must be blocked while busy."); SetBusy(false, "test");
            RenderResults(new object[] { new Dictionary<string, object> { { "archive", "broken.rpf" }, { "ok", false }, { "error", "Synthetic failure" } } });
            if (lastOutput.Length != 0 || open.Enabled || stage.Text != "CONCLUÍDO COM FALHAS") throw new Exception("Failed result kept a stale successful output.");
            lastOutput = Path.GetTempPath(); open.Enabled = true;
            folder.Text = Path.Combine(Path.GetTempPath(), "different-folder");
            if (open.Enabled || lastOutput.Length != 0) throw new Exception("Changing origin must clear the previous result.");
            ClientSize = new Size(1024, 700); PerformLayout();
            if (convert.Width <= 0 || analyze.Width <= 0 || convert.Parent.Width < convert.Right) throw new Exception("Actions overflow compact layout.");
        }
        public void RenderBitmap(string destination) {
            renderOnly = true; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-30000, -30000);
            Show(); PerformLayout(); Application.DoEvents();
            using (var image = new Bitmap(Width, Height)) { DrawToBitmap(image, new Rectangle(Point.Empty, Size)); image.Save(destination, System.Drawing.Imaging.ImageFormat.Png); }
            Hide();
        }
        public void PrepareBackgroundTest() { renderOnly = true; ShowInTaskbar = false; StartPosition = FormStartPosition.Manual; Location = new Point(-30000, -30000); }
        public async Task WorkflowTest(string fixtureFolder) {
            await SelectOrigin(fixtureFolder);
            if (!previewValid || vehicles.Rows.Count != 1 || assets.Rows.Count == 0) throw new Exception("Initial GUI preview failed: " + details.Text);
            await ConvertSelection();
            if (Directory.Exists(Path.Combine(fixtureFolder, "car"))) throw new Exception("Conversion must not run before review.");
            string analyzedFolder = folder.Text;
            await SelectOrigin(null);
            if (!previewValid || folder.Text != analyzedFolder || vehicles.Rows.Count != 1) throw new Exception("Cancelling the picker must preserve the existing preview.");
            vehicles.Rows[0].Cells["target"].Value = "DESKTOPTEST";
            if (previewValid) throw new Exception("Edits must invalidate GUI preview.");
            vehicles.Rows[0].Cells["target"].Value = "invalid name!";
            await ReviewConfiguration();
            if (previewValid || convert.Enabled || vehicles.Rows.Count != 1 || TextValue(vehicles.Rows[0].Cells["target"].Value) != "invalid name!") throw new Exception("Invalid spawn must remain editable without enabling conversion.");
            tabs.SelectedIndex = 0; vehicles.Rows[0].Cells["target"].Value = "DESKTOPTEST";
            await ReviewConfiguration();
            if (!previewValid || !reviewDetails.Text.Contains("DESKTOPTEST")) throw new Exception("Review must automatically validate renamed spawns: " + details.Text);
            if (!reviewed || tabs.SelectedIndex != 1 || !convert.Enabled) throw new Exception("Review step did not authorize conversion.");
            await ConvertSelection();
            string output = Path.Combine(fixtureFolder, "DESKTOPTEST");
            if (!File.Exists(Path.Combine(output, "fxmanifest.lua")) || !File.ReadAllText(Path.Combine(output, "data", "vehicles.meta")).Contains("<modelName>DESKTOPTEST</modelName>")) throw new Exception("GUI conversion failed: " + details.Text);
            if (File.Exists(Path.Combine(output, "conversion-report.json"))) throw new Exception("Unexpected report in addon.");
            File.WriteAllText(Path.Combine(output, "keep.txt"), "preserve old output");
            await SelectOrigin(fixtureFolder); await ReviewConfiguration();
            if (reviewed || tabs.SelectedIndex != 0 || convert.Enabled) throw new Exception("Existing destination must require an explicit choice.");
            destinations.Rows[0].Cells["policy"].Value = "Backup e substituir";
            await ReviewConfiguration();
            await ConvertSelection();
            string[] backups = Directory.GetDirectories(fixtureFolder, "DESKTOPTEST.backup-*");
            if (backups.Length != 1 || File.ReadAllText(Path.Combine(backups[0], "keep.txt")) != "preserve old output") throw new Exception("GUI backup failed: " + details.Text);
            if (!open.Enabled) throw new Exception("Successful GUI conversion must allow opening output.");
            string empty = Path.Combine(fixtureFolder, "empty"); Directory.CreateDirectory(empty); await SelectOrigin(empty);
            if (previewValid || convert.Enabled) throw new Exception("Empty-folder GUI state must not convert.");
        }
    }
}
