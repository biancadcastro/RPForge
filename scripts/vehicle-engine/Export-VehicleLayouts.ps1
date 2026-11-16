param(
  [Parameter(Mandatory=$true)][string]$GamePath,       # pasta do GTA V instalado
  [Parameter(Mandatory=$true)][string]$CodeWalkerPath, # pasta com CodeWalker.Core.dll
  [Parameter(Mandatory=$true)][string]$OutDirectory,   # FORA do repo (dados do jogo nao vao para o repo)
  [string]$NamePattern = '^(vehiclelayouts.*|vehicles)\.meta$'
)
# ORACULO OFFLINE DE PESQUISA (CodeWalker.Core, MIT). NAO roda no produto RPForge:
# o motor do RPForge nunca carrega CodeWalker. Uso: levantar a estrutura real de
# vehiclelayouts.meta / vehicles.meta do jogo instalado para documentacao.
# Windows PowerShell 5.1 (powershell.exe). Le common.rpf, update\update*.rpf e
# update\x64\dlcpacks\*\dlc.rpf (e RPFs aninhados), extrai SOMENTE os .meta cujo nome
# casa com $NamePattern, convertendo PSO/RBF para XML quando preciso, e grava cada
# um como <OutDirectory>\<rpf-relativo com '\' -> '__'>.xml mais um index.tsv.
$ErrorActionPreference = 'Stop'
$lib = [IO.Path]::GetFullPath($CodeWalkerPath)
$refs = @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll') | ForEach-Object { Join-Path $lib $_ }
foreach ($r in $refs) { [Reflection.Assembly]::LoadFrom($r) | Out-Null }
$source = @'
using System; using System.IO; using System.Linq; using System.Text; using System.Text.RegularExpressions;
using System.Collections.Generic; using CodeWalker.GameFiles;
public static class LayoutOracle {
  public static string Run(string game, string outDir, string pattern) {
    GTA5Keys.LoadFromPath(game);
    var rx = new Regex(pattern, RegexOptions.IgnoreCase);
    var roots = new List<string>();
    roots.Add(Path.Combine(game, "common.rpf"));
    // x64*.rpf: os DLCs antigos (mpbeach, mpbusiness, mppilot...) ficam aninhados aqui.
    foreach (var x in Directory.GetFiles(game, "x64*.rpf")) roots.Add(x);
    foreach (var u in Directory.GetFiles(Path.Combine(game, "update"), "update*.rpf")) roots.Add(u);
    var dlcDir = Path.Combine(game, "update", "x64", "dlcpacks");
    if (Directory.Exists(dlcDir)) foreach (var d in Directory.GetDirectories(dlcDir)) { var f = Path.Combine(d, "dlc.rpf"); if (File.Exists(f)) roots.Add(f); }
    var dlcDir2 = Path.Combine(game, "x64", "dlcpacks");
    if (Directory.Exists(dlcDir2)) foreach (var d in Directory.GetDirectories(dlcDir2)) { var f = Path.Combine(d, "dlc.rpf"); if (File.Exists(f)) roots.Add(f); }
    Directory.CreateDirectory(outDir);
    var index = new StringBuilder();
    foreach (var root in roots) {
      var rel = root.Substring(game.Length).TrimStart('\\');
      var rpf = new RpfFile(root, rel);
      rpf.ScanStructure(null, null);
      // AllEntries nao inclui RPFs aninhados (ex.: x64w.rpf\dlcpacks\mpbeach\dlc.rpf): percorre Children.
      var stack = new Stack<RpfFile>(); stack.Push(rpf);
      var entries = new List<RpfEntry>();
      while (stack.Count > 0) { var cur = stack.Pop(); if (cur.AllEntries != null) entries.AddRange(cur.AllEntries); if (cur.Children != null) foreach (var c in cur.Children) stack.Push(c); }
      foreach (var e in entries) {
        var fe = e as RpfFileEntry; if (fe == null || !rx.IsMatch(fe.Name)) continue;
        string xml = null, kind = "";
        try {
          var data = fe.File.ExtractFile(fe);
          if (data == null) { index.AppendLine(fe.Path + "\tERRO\textract"); continue; }
          if (PsoFile.IsPSO(new MemoryStream(data))) { var p = new PsoFile(); p.Load(data); xml = PsoXml.GetXml(p); kind = "PSO"; }
          else if (RbfFile.IsRBF(new MemoryStream(data))) { var r = new RbfFile(); r.Load(data); xml = RbfXml.GetXml(r); kind = "RBF"; }
          else { xml = Encoding.UTF8.GetString(data).Trim((char)0, (char)0xFEFF); kind = "XML"; }
        } catch (Exception ex) { index.AppendLine(fe.Path + "\tERRO\t" + ex.Message); continue; }
        var name = Regex.Replace(fe.Path.ToLowerInvariant(), @"[\\/:]", "__") + ".xml";
        File.WriteAllText(Path.Combine(outDir, name), xml, new UTF8Encoding(false));
        index.AppendLine(fe.Path + "\t" + kind + "\t" + name);
      }
    }
    File.WriteAllText(Path.Combine(outDir, "index.tsv"), index.ToString(), new UTF8Encoding(false));
    return index.ToString();
  }
}
'@
$netstandard = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'netstandard.dll'
Add-Type -TypeDefinition $source -ReferencedAssemblies ($refs + @('System.Core.dll', 'System.Xml.dll', $netstandard))
[LayoutOracle]::Run([IO.Path]::GetFullPath($GamePath).TrimEnd('\'), [IO.Path]::GetFullPath($OutDirectory), $NamePattern)
