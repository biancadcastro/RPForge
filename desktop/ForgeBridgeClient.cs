using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
namespace RPFForge {
    sealed class ForgeBridgeClient {
        readonly string root;
        public ForgeBridgeClient(string appRoot) { root = appRoot; }
        static Dictionary<string, object> Map(object value) { return value as Dictionary<string, object> ?? new Dictionary<string, object>(); }
        static object Get(Dictionary<string, object> map, string key) { object result; return map.TryGetValue(key, out result) ? result : null; }
        static string TextValue(object value) { return value == null ? "" : Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture); }
        static object[] ArrayValue(object value) { return value as object[] ?? new object[0]; }
        static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"").TrimEnd('\\') + (value.EndsWith("\\") ? "\\\\" : "") + "\""; }

        public async Task<object[]> Execute(string action, string selectedFolder, Dictionary<string, object> requestArchives, Action<Dictionary<string, object>> onProgress) {

            return await Task.Factory.StartNew(delegate {
                var json = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
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
                            else if (type == "progress" && onProgress != null) onProgress(message);
                        }
                        process.WaitForExit();
                        if (error != null) throw new Exception(error);
                        if (result == null || process.ExitCode != 0) throw new Exception("Não foi possível concluir a operação. Confira o acesso à pasta e tente analisar novamente.");
                        return result;
                    }
                } finally { if (File.Exists(requestPath)) File.Delete(requestPath); }
            });
        }
    }
}
