using System;
using System.Diagnostics;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace RPFForge {
    // Keep the Explorer executable entry point while the new UI runs in Electron.
    static class ForgeWebLauncher {
        static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"").TrimEnd('\\') + (value.EndsWith("\\") ? "\\\\" : "") + "\""; }
        public static bool TryStart(string root, string[] args) {
            string project = Path.Combine(root, "desktop-web");
            string development = Path.Combine(root, "desktop-development.json");
            if (File.Exists(development)) {
                var settings = new JavaScriptSerializer().Deserialize<Dictionary<string, string>>(File.ReadAllText(development));
                string configured;
                if (settings != null && settings.TryGetValue("webProject", out configured) && Path.IsPathRooted(configured)) project = Path.GetFullPath(configured);
            }
            string electron = Path.Combine(project, "node_modules", "electron", "dist", "electron.exe");
            if (!File.Exists(electron) || !File.Exists(Path.Combine(project, "out", "index.html"))) return false;
            string arguments = Quote(project);
            foreach (string argument in args) arguments += " " + Quote(argument);
            var start = new ProcessStartInfo(electron, arguments) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = root };
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            Process.Start(start); return true;
        }
    }
}
