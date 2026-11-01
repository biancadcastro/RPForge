using System;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace RPFForge {
    sealed partial class ForgeWindow {
        readonly Button back = new ForgeButton();
        readonly TextBox reviewDetails = new TextBox();
        bool reviewed, hasResults;

        async Task PrimaryAction() {
            if (busy) return;
            if (tabs.SelectedIndex == 2 && hasResults) {
                ResetOrigin(); tabs.SelectedIndex = 0; browse.PerformClick(); return;
            }
            if (tabs.SelectedIndex >= 3) { tabs.SelectedIndex = 0; return; }
            if (preview.Count == 0) {
                if (System.IO.Directory.Exists(folder.Text)) await SelectOrigin(folder.Text); else browse.PerformClick();
                return;
            }
            await ReviewConfiguration();
        }

        async Task ReviewConfiguration() {
            if (busy || preview.Count == 0) return;
            vehicles.EndEdit(); destinations.EndEdit();
            if (!previewValid) await Analyze();
            foreach (DataGridViewRow row in destinations.Rows) {
                if (Yes(row.Cells["selected"].Value) && TextValue(row.Cells["exists"].Value) == "Já existe" && TextValue(row.Cells["policy"].Value) == "Escolha uma ação") {
                    tabs.SelectedIndex = 0; status.Text = "A pasta já existe. Escolha outro nome, backup ou cancelamento na linha destacada.";
                    destinations.CurrentCell = row.Cells["policy"]; destinations.Focus(); reviewed = false; RefreshActions(); return;
                }
            }
            reviewDetails.Text = details.Text;
            reviewed = previewValid; tabs.SelectedIndex = 1;
            stage.Text = previewValid ? "02 / REVISAR" : "CORRIJA OS ERROS";
            status.Text = previewValid ? "Confira o que será gerado. Converter inicia a gravação dos addons." : "A conversão está bloqueada. Volte para corrigir a configuração ou escolha outra origem.";
            RefreshActions();
        }

        void RefreshActions() {
            if (navigation[0] == null) return;
            bool hasPreview = preview.Count > 0;
            navigation[0].Enabled = !busy;
            navigation[1].Enabled = !busy && hasPreview;
            navigation[2].Enabled = !busy && hasResults;
            navigation[3].Enabled = !busy && hasPreview;
            navigation[4].Enabled = true;
            back.Visible = tabs.SelectedIndex == 1;
            back.Enabled = !busy;
            analyze.Visible = tabs.SelectedIndex != 1;
            analyze.Enabled = !busy;
            analyze.Text = tabs.SelectedIndex == 2 && hasResults ? "Nov&a conversão" : tabs.SelectedIndex >= 3 ? "Volt&ar à configuração" : hasPreview ? "Revis&ar conversão →" : "Escolher p&asta";
            convert.Visible = tabs.SelectedIndex == 1;
            convert.Enabled = !busy && previewValid && reviewed;
            convert.Text = "&Converter agora";
            open.Visible = tabs.SelectedIndex == 2 && hasResults;
            open.Enabled = !busy && System.IO.Directory.Exists(lastOutput);
            AcceptButton = tabs.SelectedIndex == 1 ? null : analyze;
        }
    }
}
