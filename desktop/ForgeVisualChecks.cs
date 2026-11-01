using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace RPFForge {
    sealed partial class ForgeWindow {
        public void RenderSuite(string directory) {
            Directory.CreateDirectory(directory); PrepareBackgroundTest();
            RenderBitmap(Path.Combine(directory, "01-inicio.png"));
            folder.Text = @"C:\Mods\Pacote de veículos";
            var model = new Dictionary<string, object> {
                { "archive", "esportivos.rpf" }, { "ok", true }, { "models", new object[] { "sultanrs", "elegy2" } }, { "finalModels", new object[] { "sultanrs", "elegy2" } },
                { "defaultName", "elegy2_pack" }, { "outputName", "elegy2_pack" }, { "output", @"C:\Mods\Pacote de veículos\elegy2_pack" }, { "exists", true }, { "sourceHash", "synthetic-preview" }, { "sourceBytes", 10485760 },
                { "audit", new Dictionary<string, object> { { "ok", true }, { "errors", 0 }, { "warnings", 1 }, { "diskBytes", 15728640 },
                    { "issues", new object[] { new Dictionary<string, object> { { "severity", "warning" }, { "message", "Dicionário de textura externo: confira a dependência no FiveM." } } } },
                    { "assets", new object[] { new Dictionary<string, object> { { "path", "stream/sultanrs.ytd" }, { "kind", "texture" }, { "diskBytes", 10485760 } }, new Dictionary<string, object> { { "path", "stream/sultanrs.yft" }, { "kind", "model" }, { "diskBytes", 5242880 } } } } } },
                { "removedTuning", new object[] { "sultanrs_bumper_missing" } }, { "skipped", new object[] { "shop_vehicle.meta" } }
            };
            RenderPreview(new object[] { model }, new Dictionary<string, object> { { "esportivos.rpf", new Dictionary<string, object> { { "selected", true }, { "existing", "backup" }, { "reviewedExisting", true } } } });
            tabs.SelectedIndex = 0; RenderBitmap(Path.Combine(directory, "02-veiculos.png"));
            tabs.SelectedIndex = 0; RenderBitmap(Path.Combine(directory, "03-destinos.png"));
            reviewed = previewValid; tabs.SelectedIndex = 1; stage.Text = "02 / REVISAR"; RenderBitmap(Path.Combine(directory, "04-previa.png"));
            tabs.SelectedIndex = 3; RenderBitmap(Path.Combine(directory, "05-espaco.png"));
            ClientSize = new Size(1024, 700); tabs.SelectedIndex = 0; RenderBitmap(Path.Combine(directory, "06-compacto.png"));
            tabs.SelectedIndex = 4; RenderBitmap(Path.Combine(directory, "07-ajuda.png"));
            helpView.ScrollTo(Int32.MaxValue); RenderBitmap(Path.Combine(directory, "10-ajuda-final.png"));
            File.WriteAllText(Path.Combine(directory, "scroll-check.txt"), "extent=" + helpView.ContentExtent + ", view=" + helpView.Height + ", position=" + helpView.ScrollPosition);
            if (helpView.ScrollPosition <= 0) throw new Exception("Help document cannot scroll to the licensing action.");
            RenderResults(new object[] { new Dictionary<string, object> { { "archive", "broken.rpf" }, { "ok", false }, { "error", "O RPF mudou depois da prévia. Analise os arquivos novamente." } } });
            RenderBitmap(Path.Combine(directory, "08-erro.png"));
            RenderResults(new object[] { new Dictionary<string, object> { { "archive", "esportivos.rpf" }, { "ok", true }, { "output", @"C:\Mods\elegy2_pack" }, { "resource", "elegy2_pack" }, { "audit", new Dictionary<string, object> { { "issues", new object[0] } } } } });
            RenderBitmap(Path.Combine(directory, "09-resultado.png"));
        }
    }
}
