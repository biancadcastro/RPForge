using System;
using System.Linq;
using System.Windows.Forms;

namespace RPFForge {
    sealed partial class ForgeWindow {
        static bool IsVehicle(System.Collections.Generic.Dictionary<string, object> item) {
            string kind = TextValue(Get(item, "kind")); return kind == "" || kind == "vehicle";
        }
        static string ContentLabel(System.Collections.Generic.Dictionary<string, object> item) {
            if (IsVehicle(item)) return "Veículo";
            return String.Join(" + ", TextValue(Get(item, "kind")).Split('+').Select(k => k == "map" ? "Mapa / interior" : k == "clothing" ? "Roupas" : k == "animation" ? "Animações" : k == "audio" ? "Áudio" : k == "ped" ? "Peds" : k == "weapon" ? "Armas" : "Modelos / texturas"));
        }
        void UpdateContentLabels() {
            bool onlyVehicles = preview.Values.All(IsVehicle);
            vehicles.Columns["current"].HeaderText = onlyVehicles ? "Nome original" : "Nome original / recurso";
            vehicles.Columns["target"].HeaderText = onlyVehicles ? "Nome no jogo" : "Spawn / nome do recurso";
            configurationLayout.GetControlFromPosition(0, 0).Text = onlyVehicles
                ? "Para alterar o spawn, clique no nome na coluna “Nome no jogo” e edite."
                : "Clique no nome para editar: spawn em veículos; nome do recurso nos demais conteúdos.";
            foreach (DataGridViewRow row in vehicles.Rows) {
                System.Collections.Generic.Dictionary<string, object> item;
                if (preview.TryGetValue(TextValue(row.Cells["archive"].Value), out item)) {
                    row.Cells["kind"].Value = ContentLabel(item);
                    row.Cells["target"].ToolTipText = IsVehicle(item) ? "Clique para editar o spawn e suas referências." : "Clique para alterar a pasta do recurso. Coleções e nomes internos são preservados.";
                }
            }
        }
    }
}
