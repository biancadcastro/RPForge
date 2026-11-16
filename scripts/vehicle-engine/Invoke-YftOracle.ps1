param(
  [Parameter(Mandatory=$true)][string]$ListFile,      # one absolute .yft path per line
  [Parameter(Mandatory=$true)][string]$OutDirectory,  # receives oracle-<n>.json (and oracle-<n>.yft with -Save 1)
  [Parameter(Mandatory=$true)][string]$LibraryDirectory,
  [int]$Save = 0,
  [int]$Blocks = 1                                    # 0: skip the block map (smaller dumps for corpus runs)
)
# OFFLINE DEVELOPMENT ORACLE ONLY (CodeWalker.Core, MIT). The vehicle engine never loads it.
# Windows PowerShell 5.1 (powershell.exe): CodeWalker.Core targets .NET Framework.
# Dumps, per YFT: every resource block CodeWalker reads (type, offset, length) and a
# semantic summary (bones, models per LOD, geometries, shaders, physics) to compare
# against src/vehicle-engine (scripts/vehicle-engine/compare-oracle.mjs).
$ErrorActionPreference = 'Stop'
$lib = [IO.Path]::GetFullPath($LibraryDirectory)
$refs = @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll') | ForEach-Object { Join-Path $lib $_ }
foreach ($r in $refs) { [Reflection.Assembly]::LoadFrom($r) | Out-Null }
$source = @'
using System; using System.IO; using System.Linq; using System.Text; using System.Collections.Generic;
using CodeWalker.GameFiles;
public static class YftOracle {
  static string E(string s) { return s == null ? "null" : "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
  static string F(float f) { return f.ToString("R", System.Globalization.CultureInfo.InvariantCulture); }
  static void Walk(IResourceBlock b, HashSet<IResourceBlock> seen, List<string> rows, int depth) {
    if (b == null || !seen.Add(b)) return;
    rows.Add("{\"t\":" + E(b.GetType().Name) + ",\"p\":" + b.FilePosition + ",\"l\":" + b.BlockLength + ",\"d\":" + depth + "}");
    var sb = b as IResourceSystemBlock;
    if (sb == null) return;
    IResourceBlock[] refs = null; try { refs = sb.GetReferences(); } catch {}
    if (refs != null) foreach (var r in refs) Walk(r, seen, rows, depth + 1);
    Tuple<long, IResourceBlock>[] parts = null; try { parts = sb.GetParts(); } catch {}
    if (parts != null) foreach (var p in parts) {
      if (p.Item2 == null || !seen.Add(p.Item2)) continue;
      var sub = p.Item2 as IResourceSystemBlock; if (sub == null) continue;
      IResourceBlock[] rr = null; try { rr = sub.GetReferences(); } catch {}
      if (rr != null) foreach (var r in rr) Walk(r, seen, rows, depth + 1);
    }
  }
  static string Models(DrawableModel[] ms) {
    if (ms == null) return "null";
    return "[" + string.Join(",", ms.Select(m => "{\"bone\":" + m.BoneIndex + ",\"skin\":" + m.HasSkin + ",\"mask\":" + m.RenderMask + ",\"geoms\":[" +
      string.Join(",", (m.Geometries ?? new DrawableGeometry[0]).Select((g, gi) => "{\"shader\":" + m.ShaderMapping[gi] + ",\"verts\":" + g.VerticesCount + ",\"idx\":" + g.IndicesCount + ",\"stride\":" + g.VertexStride +
        ",\"flags\":" + (g.VertexBuffer != null && g.VertexBuffer.Info != null ? g.VertexBuffer.Info.Flags : 0) + ",\"types\":\"" + (g.VertexBuffer != null && g.VertexBuffer.Info != null ? ((ulong)g.VertexBuffer.Info.Types).ToString("X16") : "0") + "\",\"boneIds\":" + g.BoneIdsCount + "}")) + "]}")) + "]";
  }
  static string Drawable(DrawableBase d) {
    if (d == null) return "null";
    var sb = new StringBuilder("{");
    var fd = d as FragDrawable; sb.Append("\"name\":" + E(fd != null ? fd.Name : null));
    var dm = d.DrawableModels;
    sb.Append(",\"lods\":{\"high\":" + Models(dm != null ? dm.High : null) + ",\"med\":" + Models(dm != null ? dm.Med : null) + ",\"low\":" + Models(dm != null ? dm.Low : null) + ",\"vlow\":" + Models(dm != null ? dm.VLow : null) + "}");
    sb.Append(",\"lodDist\":[" + F(d.LodDistHigh) + "," + F(d.LodDistMed) + "," + F(d.LodDistLow) + "," + F(d.LodDistVlow) + "]");
    var sk = d.Skeleton;
    if (sk != null && sk.Bones != null && sk.Bones.Items != null) {
      sb.Append(",\"bones\":[" + string.Join(",", sk.Bones.Items.Select(b => "{\"name\":" + E(b.Name) + ",\"tag\":" + b.Tag + ",\"index\":" + b.Index + ",\"parent\":" + b.ParentIndex + ",\"sibling\":" + b.NextSiblingIndex + ",\"flags\":" + (int)b.Flags + ",\"t\":[" + F(b.Translation.X) + "," + F(b.Translation.Y) + "," + F(b.Translation.Z) + "],\"r\":[" + F(b.Rotation.X) + "," + F(b.Rotation.Y) + "," + F(b.Rotation.Z) + "," + F(b.Rotation.W) + "]}")) + "]");
    }
    var sg = d.ShaderGroup;
    if (sg != null && sg.Shaders != null && sg.Shaders.data_items != null) {
      sb.Append(",\"shaders\":[" + string.Join(",", sg.Shaders.data_items.Select(s => {
        var ps = s.ParametersList; var parts = new List<string>();
        if (ps != null && ps.Parameters != null) for (int i = 0; i < ps.Parameters.Length; i++) {
          var p = ps.Parameters[i]; var tex = p.Data as TextureBase;
          parts.Add("{\"h\":" + (uint)ps.Hashes[i] + ",\"type\":" + p.DataType + (tex != null ? ",\"tex\":" + E(tex.Name) : "") + "}");
        }
        return "{\"name\":" + (uint)s.Name.Hash + ",\"file\":" + (uint)s.FileName.Hash + ",\"bucket\":" + s.RenderBucket + ",\"params\":[" + string.Join(",", parts) + "]}";
      })) + "]");
      var td = sg.TextureDictionary;
      sb.Append(",\"embedded\":" + (td != null && td.Textures != null && td.Textures.data_items != null ? "[" + string.Join(",", td.Textures.data_items.Select(t => E(t.Name))) + "]" : "[]"));
    }
    sb.Append("}"); return sb.ToString();
  }
  public static string Dump(string path, string savePath, bool blocks) {
    var raw = File.ReadAllBytes(path);
    var data = (byte[])raw.Clone();
    var entry = RpfFile.CreateResourceFileEntry(ref data, 0);
    var plain = ResourceBuilder.Decompress(data);
    var y = new YftFile(); y.Load(plain, entry);
    var f = y.Fragment;
    var re = (RpfResourceFileEntry)entry;
    var sb = new StringBuilder("{");
    sb.Append("\"file\":" + E(path) + ",\"version\":" + re.Version + ",\"name\":" + E(f.Name));
    sb.Append(",\"systemSize\":" + re.SystemSize + ",\"graphicsSize\":" + re.GraphicsSize);
    sb.Append(",\"drawable\":" + Drawable(f.Drawable));
    sb.Append(",\"drawableArray\":" + (f.DrawableArray != null && f.DrawableArray.data_items != null ? f.DrawableArray.data_items.Length : 0));
    sb.Append(",\"cloth\":" + (f.DrawableCloth != null ? "true" : "false"));
    sb.Append(",\"glassWindows\":" + f.GlassWindowsCount + ",\"vehicleGlassWindows\":" + (f.VehicleGlassWindows != null ? f.VehicleGlassWindows.ItemCount : 0));
    sb.Append(",\"lights\":" + (f.LightAttributes != null && f.LightAttributes.data_items != null ? f.LightAttributes.data_items.Length : 0));
    var lod = f.PhysicsLODGroup != null ? f.PhysicsLODGroup.PhysicsLOD1 : null;
    if (lod != null) {
      var groups = lod.Groups != null && lod.Groups.data_items != null ? lod.Groups.data_items : new FragPhysTypeGroup[0];
      var children = lod.Children != null && lod.Children.data_items != null ? lod.Children.data_items : new FragPhysTypeChild[0];
      sb.Append(",\"physics\":{\"groups\":[" + string.Join(",", groups.Select(g => "{\"name\":" + E(g.Name.ToString()) + ",\"parent\":" + g.ParentIndex + ",\"childIndex\":" + g.ChildIndex + ",\"childCount\":" + g.ChildCount + ",\"glass\":" + g.GlassWindowIndex + "}")) + "]");
      sb.Append(",\"children\":[" + string.Join(",", children.Select(c => "{\"group\":" + c.GroupIndex + ",\"boneTag\":" + c.BoneTag + ",\"mass\":" + F(c.PristineMass) + ",\"d1\":" + Drawable(c.Drawable1) + ",\"d2\":" + (c.Drawable2 != null ? "true" : "false") + "}")) + "]");
      var bc = lod.Bound as BoundComposite;
      if (bc != null && bc.Children != null && bc.Children.data_items != null)
        sb.Append(",\"boundChildren\":[" + string.Join(",", bc.Children.data_items.Select(c => { var g = c as BoundGeometry; var bv = c as BoundBVH;
          return c == null ? "null" : "{\"t\":" + E(c.Type.ToString()) + ",\"v\":" + (g != null ? (int)g.VerticesCount : -1) + ",\"p\":" + (g != null ? (int)g.PolygonsCount : -1) + ",\"m\":" + (g != null ? (int)g.MaterialsCount : -1) + ",\"bvh\":" + (bv != null && bv.BVH != null && bv.BVH.Nodes != null && bv.BVH.Nodes.data_items != null ? bv.BVH.Nodes.data_items.Length : -1) + "}"; })) + "]");
      sb.Append(",\"bound\":" + E(lod.Bound != null ? lod.Bound.Type.ToString() : null) + ",\"lod2\":" + (f.PhysicsLODGroup.PhysicsLOD2 != null ? "true" : "false") + "}");
    }
    var rows = new List<string>(); if (blocks) Walk(f, new HashSet<IResourceBlock>(), rows, 0);
    sb.Append(",\"blocks\":[" + string.Join(",", rows) + "]");
    sb.Append("}");
    if (!string.IsNullOrEmpty(savePath)) File.WriteAllBytes(savePath, y.Save());
    return sb.ToString();
  }
}
'@
# CodeWalker.Core targets netstandard2.0: reference the framework's netstandard facade.
$netstandard = Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'netstandard.dll'
Add-Type -TypeDefinition $source -ReferencedAssemblies ($refs + @('System.Core.dll', $netstandard))
$out = [IO.Path]::GetFullPath($OutDirectory)
$n = 0
foreach ($line in Get-Content -LiteralPath $ListFile -Encoding UTF8) {
  $p = $line.Trim(); if (-not $p) { continue }
  $savePath = $null; if ($Save -eq 1) { $savePath = Join-Path $out ("oracle-$n.yft") }
  try { $json = [YftOracle]::Dump($p, $savePath, ($Blocks -eq 1)) } catch { $json = '{"file":' + (ConvertTo-Json $p) + ',"error":' + (ConvertTo-Json ($_.Exception.ToString())) + '}' }
  [IO.File]::WriteAllText((Join-Path $out ("oracle-$n.json")), $json)
  Write-Output ("{0} {1}" -f $n, $p); $n++
}
