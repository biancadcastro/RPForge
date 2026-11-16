param(
  [Parameter(Mandatory=$true)][string]$ListFile,      # one absolute .ycd path per line
  [Parameter(Mandatory=$true)][string]$OutDirectory,  # receives <n>.bin, oracle-<n>.ycd and oracle.json
  [Parameter(Mandatory=$true)][string]$LibraryDirectory,
  [int]$Save = 0                                       # 1: also re-save each file with the oracle
)
# OFFLINE DEVELOPMENT ORACLE ONLY (CodeWalker.Core, MIT). The animation engine never
# loads it. Windows PowerShell 5.1 (powershell.exe): CodeWalker.Core targets .NET Framework.
# For each input it records the oracle's own per-block, per-track evaluation
# (AnimSequence.EvaluateVector at every local frame) as float32 x,y,z,w.
$ErrorActionPreference = 'Stop'
$lib = [IO.Path]::GetFullPath($LibraryDirectory)
$refs = @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll') | ForEach-Object { Join-Path $lib $_ }
foreach ($r in $refs) { [Reflection.Assembly]::LoadFrom($r) | Out-Null }
$source = @'
using System; using System.IO; using System.Linq; using System.Text; using System.Collections.Generic;
using CodeWalker.GameFiles;
public static class YcdOracle {
  static string Esc(string s) { return s == null ? "" : s.Replace("\\", "\\\\").Replace("\"", "\\\""); }
  static string F(float f) { return f.ToString("R", System.Globalization.CultureInfo.InvariantCulture); }
  public static string Dump(string path, string binPath, string savePath) {
    var sb = new StringBuilder();
    var raw = File.ReadAllBytes(path);
    var data = (byte[])raw.Clone();
    var entry = RpfFile.CreateResourceFileEntry(ref data, 46);
    var plain = ResourceBuilder.Decompress(data);
    var y = new YcdFile(); y.Load(plain, entry);
    if (!string.IsNullOrEmpty(y.LoadException)) throw new Exception("LoadException: " + y.LoadException);
    sb.Append("{\"clips\":[");
    bool first = true;
    foreach (var kv in y.ClipMap.OrderBy(k => k.Key.Hash)) {
      var c = kv.Value.Clip; if (!first) sb.Append(","); first = false;
      var ca = c as ClipAnimation;
      sb.Append("{\"hash\":" + kv.Key.Hash + ",\"name\":\"" + Esc(c.Name) + "\",\"type\":" + (uint)c.Type);
      if (ca != null) sb.Append(",\"start\":" + F(ca.StartTime) + ",\"end\":" + F(ca.EndTime) + ",\"rate\":" + F(ca.Rate) + ",\"animation\":" + (ca.Animation != null ? ca.Animation.Hash.Hash.ToString() : "null"));
      sb.Append("}");
    }
    sb.Append("],\"animations\":[");
    first = true;
    using (var bw = new BinaryWriter(File.Create(binPath))) {
      foreach (var kv in y.AnimMap.OrderBy(k => k.Key.Hash)) {
        var a = kv.Value.Animation; if (!first) sb.Append(","); first = false;
        var bones = a.BoneIds.data_items;
        sb.Append("{\"hash\":" + kv.Key.Hash + ",\"frames\":" + a.Frames + ",\"limit\":" + a.SequenceFrameLimit + ",\"duration\":" + F(a.Duration) + ",\"flags\":" + a.Unknown_10h);
        sb.Append(",\"tracks\":[" + string.Join(",", bones.Select(b => "[" + b.BoneId + "," + b.Track + "," + b.Unk0 + "]")) + "]");
        sb.Append(",\"blocks\":[");
        var seqs = a.Sequences.data_items;
        for (int s = 0; s < seqs.Length; s++) {
          var seq = seqs[s]; if (s > 0) sb.Append(",");
          sb.Append("{\"frames\":" + seq.NumFrames + ",\"rootPos\":" + seq.RootPositionRefCount + ",\"rootRot\":" + seq.RootRotationRefCount + ",\"types\":[" +
            string.Join(",", Enumerable.Range(0, bones.Length).Select(i => (seq.Sequences != null && i < seq.Sequences.Length && seq.Sequences[i] != null && seq.Sequences[i].Channels != null) ? "\"" + string.Join("+", seq.Sequences[i].Channels.Select(ch => ch == null ? "null" : ch.Type.ToString())) + "\"" : "null")) + "]}");
          for (int i = 0; i < bones.Length; i++) {
            AnimSequence aseq = (seq.Sequences != null && i < seq.Sequences.Length) ? seq.Sequences[i] : null;
            for (int f = 0; f < seq.NumFrames; f++) {
              var v = aseq != null ? aseq.EvaluateVector(f) : new SharpDX.Vector4(float.NaN);
              bw.Write(v.X); bw.Write(v.Y); bw.Write(v.Z); bw.Write(v.W);
            }
          }
        }
        sb.Append("]}");
      }
    }
    sb.Append("]");
    if (!string.IsNullOrEmpty(savePath)) {
      var saved = y.Save();
      if (saved == null || saved.Length < 16) throw new Exception("Oracle Save returned no data");
      File.WriteAllBytes(savePath, saved);
      sb.Append(",\"saved\":\"" + Esc(Path.GetFileName(savePath)) + "\",\"savedBytes\":" + saved.Length);
    }
    sb.Append("}");
    return sb.ToString();
  }
}
'@
# CodeWalker.Core targets netstandard2.0: reference the framework's netstandard facade.
$netstandard = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'netstandard.dll'
Add-Type -TypeDefinition $source -ReferencedAssemblies ($refs + @('System.Core.dll', $netstandard))
$out = [IO.Path]::GetFullPath($OutDirectory)
[IO.Directory]::CreateDirectory($out) | Out-Null
$paths = [IO.File]::ReadAllLines([IO.Path]::GetFullPath($ListFile)) | Where-Object { $_.Trim() -ne '' }
$rows = New-Object System.Collections.Generic.List[string]
$n = 0; $failed = 0
foreach ($p in $paths) {
  $bin = Join-Path $out ("$n.bin")
  $savePath = if ($Save -eq 1) { Join-Path $out ("oracle-$n.ycd") } else { $null }
  $esc = $p.Replace('\','\\').Replace('"','\"')
  try {
    $json = [YcdOracle]::Dump($p, $bin, $savePath)
    $rows.Add("{`"index`":$n,`"path`":`"$esc`",`"ok`":true,`"result`":$json}")
  } catch {
    $failed++
    $msg = $_.Exception.InnerException; if ($null -eq $msg) { $msg = $_.Exception }
    $m = ($msg.GetType().Name + ': ' + $msg.Message).Replace('\','\\').Replace('"','\"').Replace("`r",' ').Replace("`n",' ')
    $rows.Add("{`"index`":$n,`"path`":`"$esc`",`"ok`":false,`"error`":`"$m`"}")
  }
  $n++
}
$asm = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq 'CodeWalker.Core' }
$sha = [Security.Cryptography.SHA256]::Create()
$hash = ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($asm.Location)))).Replace('-','').ToLowerInvariant()
$header = "{`"oracle`":{`"assembly`":`"CodeWalker.Core`",`"version`":`"$($asm.GetName().Version)`",`"sha256`":`"$hash`",`"runtime`":`"$($PSVersionTable.CLRVersion)`",`"role`":`"offline development oracle; not a runtime dependency`"},`"generatedAt`":`"$((Get-Date).ToString('o'))`",`"files`":["
[IO.File]::WriteAllText((Join-Path $out 'oracle.json'), $header + [string]::Join(",`n", $rows) + "]}")
Write-Output "oracle: $n file(s), $failed failure(s) -> $out"
if ($failed -gt 0) { exit 1 }
exit 0
