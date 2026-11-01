using System;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace RPFForge {
    sealed partial class ForgeWindow {
        async Task GenerateYtyp() {
            if (busy) return;
            previewValid = false; reviewed = false; hasResults = false;
            SetBusy(true, "Gerando YTYPs a partir dos modelos desta pasta.");
            try {
                var results = await Execute("ytyp", new System.Collections.Generic.Dictionary<string, object>());
                hasResults = true; lastOutput = folder.Text; resultView.ClearDocument();
                foreach (var value in results) {
                    var item = Map(value);
                    resultView.AddSection("YTYP gerado", "Modelos registrados: " + ArrayValue(Get(item, "models")).Length + ". Os arquivos originais foram preservados.", false, ForgeTheme.Success);
                    foreach (var file in ArrayValue(Get(item, "generated"))) resultView.AddSection("Arquivo criado", TextValue(file));
                    foreach (var issue in ArrayValue(Get(Map(Get(item, "audit")), "issues"))) resultView.AddSection("Confira no jogo", TextValue(Get(Map(issue), "message")), false, ForgeTheme.Warning);
                }
                summary.Text = "Geração concluída. Nenhum arquivo existente foi substituído."; stage.Text = "YTYP / CONCLUÍDO";
            } catch (Exception error) {
                hasResults = true; lastOutput = ""; resultView.ClearDocument();
                resultView.AddSection("Não foi possível gerar o YTYP", error.Message, false, ForgeTheme.Error);
                summary.Text = "Confira os modelos e selecione a pasta novamente."; stage.Text = "YTYP / INTERROMPIDO";
            } finally { tabs.SelectedIndex = 2; SetBusy(false, "Use Abrir resultado para localizar os arquivos."); }
        }
    }
}
