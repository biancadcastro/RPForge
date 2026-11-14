param([string]$GamePath, [string]$CodeWalkerPath, [string]$Pattern, [string]$OutDir, [string]$Clips = '')
# Preparação offline (pesquisa): lê os dicionários de clipes do jogo instalado e grava, por clipe, as trilhas de
# cada osso amostradas quadro a quadro (posição/rotação locais + mover). CodeWalker só aqui, nunca no produto.
$ErrorActionPreference = 'Stop'
foreach ($r in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) { [Reflection.Assembly]::LoadFrom((Join-Path $CodeWalkerPath $r)) | Out-Null }
$src = @'
using System; using System.IO; using System.Text; using System.Globalization; using System.Text.RegularExpressions; using System.Collections.Generic; using CodeWalker.GameFiles;
public static class YcdSample {
  static string F(float v) { return v.ToString("0.#####", CultureInfo.InvariantCulture); }
  static void Walk(RpfFile f, Regex rx, string outDir, Regex clipRx, StringBuilder log) {
    foreach (var e in f.AllEntries) {
      var fe = e as RpfFileEntry; if (fe == null || !rx.IsMatch(fe.Name)) continue;
      var ycd = new YcdFile(); ycd.Load(f.ExtractFile(fe), fe);
      var sb = new StringBuilder(); sb.Append("{\"dict\":\"" + fe.Name.Replace(".ycd", "") + "\",\"clips\":[");
      bool first = true;
      foreach (var cme in ycd.ClipMapEntries) {
        var parts = new List<Tuple<Animation, float, float>>(); string name = cme.Clip != null ? (cme.Clip.ShortName ?? cme.Clip.Name) : "?"; float dur = 0;
        var ca = cme.Clip as ClipAnimation; var cl = cme.Clip as ClipAnimationList;
        if (ca != null && ca.Animation != null) { parts.Add(Tuple.Create(ca.Animation, ca.StartTime, ca.EndTime)); dur = ca.EndTime - ca.StartTime; }
        else if (cl != null && cl.Animations != null) { foreach (var en in cl.Animations.Data) if (en.Animation != null) parts.Add(Tuple.Create(en.Animation, en.StartTime, en.EndTime)); dur = cl.Duration; }
        if (parts.Count == 0) { log.AppendLine(fe.Name + "	" + name + "	(sem animação)"); continue; }
        int frames = Math.Max(2, (int)Math.Round(dur * 30) + 1);
        log.AppendLine(fe.Name + "	" + name + "	dur " + F(dur) + "	frames30 " + frames + "	partes " + parts.Count);
        if (clipRx == null || !clipRx.IsMatch(name)) continue;
        if (!first) sb.Append(","); first = false;
        sb.Append("{\"name\":\"" + name + "\",\"frames\":" + frames + ",\"duration\":" + F(dur) + ",\"tracks\":[");
        var seen = new HashSet<int>(); bool firstTrack = true;
        foreach (var part in parts) {
          var anim = part.Item1;
          for (int b = 0; b < anim.BoneIds.data_items.Length; b++) {
            var id = anim.BoneIds.data_items[b]; int key = id.BoneId * 16 + id.Track; if (!seen.Add(key)) continue;
            if (!firstTrack) sb.Append(","); firstTrack = false;
            sb.Append("{\"tag\":" + id.BoneId + ",\"track\":" + id.Track + ",\"v\":[");
            for (int k = 0; k < frames; k++) {
              float t = part.Item2 + (part.Item3 - part.Item2) * k / (frames - 1);
              var fp = anim.GetFramePosition(t); if (k > 0) sb.Append(",");
              if (id.Track == 1 || id.Track == 6) { var q = anim.EvaluateQuaternion(fp, b, true); sb.Append(F(q.X) + "," + F(q.Y) + "," + F(q.Z) + "," + F(q.W)); }
              else { var v = anim.EvaluateVector4(fp, b, true); sb.Append(F(v.X) + "," + F(v.Y) + "," + F(v.Z)); }
            }
            sb.Append("]}");
          }
        }
        sb.Append("]}");
      }
      sb.Append("]}");
      if (outDir != "") File.WriteAllText(Path.Combine(outDir, fe.Name.Replace(".ycd", ".json")), sb.ToString());
    }
    if (f.Children != null) foreach (var c in f.Children) Walk(c, rx, outDir, clipRx, log);
  }
  public static string Run(string game, string pattern, string outDir, string clips) {
    GTA5Keys.LoadFromPath(game);
    var rx = new Regex(pattern, RegexOptions.IgnoreCase); var clipRx = clips == "" ? null : new Regex(clips, RegexOptions.IgnoreCase); var log = new StringBuilder();
    var roots = new List<string>(Directory.GetFiles(game, "x64*.rpf"));
    foreach (var root in roots) { var rpf = new RpfFile(root, root.Substring(game.Length).TrimStart('\\')); rpf.ScanStructure(null, null); Walk(rpf, rx, outDir, clipRx, log); }
    return log.ToString();
  }
}
'@
$netstandard = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'netstandard.dll'
Add-Type -TypeDefinition $src -ReferencedAssemblies @((Join-Path $CodeWalkerPath 'CodeWalker.Core.dll'), (Join-Path $CodeWalkerPath 'SharpDX.dll'), (Join-Path $CodeWalkerPath 'SharpDX.Mathematics.dll'), 'System.Core.dll', $netstandard)
if ($OutDir) { New-Item -ItemType Directory -Force $OutDir | Out-Null }
[YcdSample]::Run($GamePath, $Pattern, $OutDir, $Clips)
