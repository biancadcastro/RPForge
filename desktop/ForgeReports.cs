using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace RPFForge {
    sealed partial class ForgeWindow {
        readonly ForgeDocument reviewView = new ForgeDocument(), resultView = new ForgeDocument();
        ForgeDocument helpView;
        void BuildReviewDocument() {
            reviewView.ClearDocument();
            if (!previewValid) {
                reviewView.AddSection("Precisamos corrigir uma informação", "Volte aos nomes dos veículos e confira os campos. Nenhum arquivo foi convertido.");
                reviewView.AddSection("O que aconteceu", details.Text, true, ForgeTheme.Error); return;
            }
            foreach (var pair in preview) {
                var item = pair.Value;
                reviewView.AddSection(System.IO.Path.GetFileName(pair.Key), "Nome no jogo: " + String.Join(", ", ArrayValue(Get(item, "finalModels")).Select(TextValue)) + "\nSalvar em: " + TextValue(Get(item, "output")));
                var audit = Map(Get(item, "audit"));
                foreach (var value in ArrayValue(Get(audit, "issues"))) {
                    var issue = Map(value); reviewView.AddSection("Atenção", TextValue(Get(issue, "message")), false, TextValue(Get(issue, "severity")) == "error" ? ForgeTheme.Error : ForgeTheme.Warning);
                }
                int removed = ArrayValue(Get(item, "removedTuning")).Length, skipped = ArrayValue(Get(item, "skipped")).Length;
                if (removed + skipped > 0) reviewView.AddSection("Ajustes automáticos", CountLabel(removed, "opção de tuning sem modelo será removida", "opções de tuning sem modelo serão removidas") + ".\n" + CountLabel(skipped, "arquivo auxiliar será ignorado", "arquivos auxiliares serão ignorados") + ".");
            }
            reviewView.AddSection("O original será mantido", "A conversão cria o addon na pasta indicada acima. Confira os nomes e clique em Converter agora.");
            AddDiagnostics(reviewView, details.Text);
        }
        void BuildResultDocument(object[] results) {
            resultView.ClearDocument();
            foreach (object value in results) {
                var item = Map(value); bool ok = Yes(Get(item, "ok"));
                resultView.AddSection(ok ? "Addon criado" : Yes(Get(item, "cancelled")) ? "Conversão cancelada" : "Não foi possível converter", ok ? "Pasta: " + TextValue(Get(item, "output")) + "\nAdicione ao server.cfg: ensure " + TextValue(Get(item, "resource")) : TextValue(Get(item, "error")), false, ok ? ForgeTheme.Success : ForgeTheme.Warning);
                if (Get(item, "backup") != null) resultView.AddSection("Backup preservado", TextValue(Get(item, "backup")));
                foreach (object problem in ArrayValue(Get(Map(Get(item, "audit")), "issues"))) resultView.AddSection("Confira no jogo", TextValue(Get(Map(problem), "message")), false, ForgeTheme.Warning);
            }
            AddDiagnostics(resultView, details.Text);
        }
        void AddDiagnostics(ForgeDocument document, string text) {
            bool expanded = false;
            document.AddAction("Ver detalhes técnicos", delegate { if (expanded) return; expanded = true; document.AddSection("Detalhes técnicos", text, true, ForgeTheme.Muted); });
        }
        Control BuildHelpDocument() {
            helpView = new ForgeDocument { AccessibleName = "Ajuda do RPForge" };
            helpView.AddSection("1. Selecione a pasta", "Escolha a pasta que contém os arquivos RPF. A análise começa automaticamente.");
            helpView.AddSection("2. Escolha o nome no jogo", "Para alterar o spawn, clique no nome na coluna “Nome no jogo” e edite. A pasta do addon acompanha esse nome.");
            helpView.AddSection("3. Confira e converta", "Clique em Revisar. Confira os nomes e avisos e use Converter agora. Ao terminar, abra a pasta do addon.");
            helpView.AddSection("Se a pasta já existir", "Você poderá usar outro nome, preservar um backup e substituir ou cancelar. Nada será sobrescrito sem sua escolha.");
            helpView.AddSection("O que o app aceita", "Veículos GTA V Legacy em RPF7 aberto, até 512 MiB por arquivo. RPFs internos são lidos; subpastas do Windows não são pesquisadas. Teste o addon no FiveM.");
            helpView.AddAction("Licenças", ShowLicenses);
            return helpView;
        }
        void ShowLicenses() {
            using (var window = new Form { Text = "RPForge — licenças", StartPosition = FormStartPosition.CenterParent, ClientSize = new Size(760, 580), MinimumSize = new Size(500, 400), BackColor = surface, ForeColor = foreground, Padding = new Padding(20), Font = new Font("Segoe UI", 10) }) {
                var document = new ForgeDocument(); document.AddSection("Pixelify Sans", ForgeFonts.License, true, foreground); window.Controls.Add(document); window.ShowDialog(this);
            }
        }
        void SimplifyConfiguration() {
            bool conflicts = false;
            foreach (DataGridViewRow row in destinations.Rows) { bool exists = TextValue(row.Cells["exists"].Value) == "Já existe"; row.Visible = exists; conflicts |= exists; }
            destinations.Visible = conflicts;
            configurationLayout.GetControlFromPosition(0, 2).Visible = conflicts;
            configurationLayout.RowStyles[2].Height = conflicts ? 32 : 0;
            configurationLayout.RowStyles[3].Height = conflicts ? 128 : 0;
            configurationLayout.Height = conflicts ? 344 : 184;
            vehicles.Columns["archive"].Visible = preview.Count > 1;
        }
    }
}
