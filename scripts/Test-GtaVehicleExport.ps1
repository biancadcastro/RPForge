param([Parameter(Mandatory=$true)][string]$CodeWalkerPath, [Parameter(Mandatory=$true)][string]$Folder, [ValidatePattern('^[a-z][a-z0-9_]{0,31}$')][string]$Spawn = 'rpamggtsc')
$ErrorActionPreference = 'Stop'
$assembly = Join-Path $CodeWalkerPath 'CodeWalker.Core.dll'
[Reflection.Assembly]::LoadFrom($assembly) | Out-Null
$netstandard = Get-ChildItem -LiteralPath (Join-Path $env:WINDIR 'Microsoft.NET\assembly\GAC_MSIL\netstandard') -Filter netstandard.dll -Recurse | Select-Object -First 1 -ExpandProperty FullName
Add-Type -ReferencedAssemblies @($assembly, (Join-Path $CodeWalkerPath 'SharpDX.dll'), (Join-Path $CodeWalkerPath 'SharpDX.Mathematics.dll'), $netstandard) -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using CodeWalker.GameFiles;
public static class ForgeVehicleAudit {
    static void Count(DrawableBase drawable, HashSet<DrawableGeometry> geometries, ref long triangles) {
        if (drawable == null || drawable.AllModels == null) return;
        foreach (var model in drawable.AllModels) {
            if (model == null || model.Geometries == null) continue;
            foreach (var geometry in model.Geometries) {
                if (geometry != null && geometries.Add(geometry)) {
                    if (geometry.IndicesCount % 3 != 0 || geometry.TrianglesCount != geometry.IndicesCount / 3) throw new Exception("Contagem de triângulos inconsistente.");
                    triangles += geometry.IndicesCount / 3;
                }
            }
        }
    }
    public static long[] Inspect(string file) {
        var yft = new YftFile(); yft.Load(File.ReadAllBytes(file));
        var frag = yft.Fragment;
        if (frag == null || frag.Drawable == null || frag.Drawable.Skeleton == null) throw new Exception("Fragmento sem drawable ou skeleton.");
        var bones = frag.Drawable.Skeleton.BonesCount;
        if (bones > 128) throw new Exception("O arquivo exportado excede 128 bones.");
        var names = new HashSet<string>();
        foreach (var bone in frag.Drawable.Skeleton.Bones.Items) names.Add(bone.Name);
        foreach (var name in new[]{"chassis", "wheel_lf", "wheel_rf", "wheel_lr", "wheel_rr"}) if (!names.Contains(name)) throw new Exception("Bone obrigatório ausente: " + name);
        long triangles = 0; var seen = new HashSet<DrawableGeometry>(); Count(frag.Drawable, seen, ref triangles);
        var lod = frag.PhysicsLODGroup == null ? null : frag.PhysicsLODGroup.PhysicsLOD1;
        if (lod == null || lod.Children == null || lod.Children.data_items.Length < 5) throw new Exception("Física do chassis e rodas ausente.");
        foreach (var child in lod.Children.data_items) { Count(child.Drawable1, seen, ref triangles); Count(child.Drawable2, seen, ref triangles); }
        if (triangles <= 0 || triangles > 800000) throw new Exception("Polígonos do YFT fora do limite: " + triangles);
        return new[]{(long)bones, triangles, (long)lod.Children.data_items.Length};
    }
    public static int Textures(string file) {
        var ytd = new YtdFile(); ytd.Load(File.ReadAllBytes(file));
        if (ytd.TextureDict == null || ytd.TextureDict.Textures == null) throw new Exception("Dicionário de texturas inválido.");
        return ytd.TextureDict.Textures.data_items.Length;
    }
    public static string[] TextureProfiles(string file) {
        var ytd = new YtdFile(); ytd.Load(File.ReadAllBytes(file));
        var profiles = new List<string>();
        foreach (var texture in ytd.TextureDict.Textures.data_items) profiles.Add(texture.Format.ToString() + ":" + texture.Levels);
        return profiles.ToArray();
    }
    public static long[] Topology(string file) {
        var yft = new YftFile(); yft.Load(File.ReadAllBytes(file)); long invalid=0, duplicate=0;
        foreach (var model in yft.Fragment.Drawable.AllModels) foreach (var geometry in model.Geometries) {
            var seen = new HashSet<ulong>(); var indices=geometry.IndexBuffer.Indices;
            for (int i=0; i<indices.Length; i+=3) {
                ushort a=indices[i], b=indices[i+1], c=indices[i+2], t;
                if (a==b || a==c || b==c) invalid++;
                if (a>b) {t=a;a=b;b=t;} if (b>c) {t=b;b=c;c=t;} if (a>b) {t=a;a=b;b=t;}
                ulong key=((ulong)a<<32)|((ulong)b<<16)|c; if(!seen.Add(key)) duplicate++;
            }
        }
        return new[]{invalid,duplicate};
    }
}
'@
$results = foreach ($name in @($Spawn, ($Spawn + '_hi'))) {
    $file = Join-Path $Folder ($name + '.yft')
    $stats = [ForgeVehicleAudit]::Inspect($file)
    $topology = [ForgeVehicleAudit]::Topology($file)
    [pscustomobject]@{ file = [IO.Path]::GetFileName($file); bones = $stats[0]; triangles = $stats[1]; physicsChildren = $stats[2]; degenerateIndices = $topology[0]; duplicateTriangles = $topology[1] }
}
$textures = [ForgeVehicleAudit]::Textures((Join-Path $Folder ($Spawn + '.ytd')))
if ($textures -le 0) { throw 'O YTD exportado está vazio.' }
$textureProfiles = [ForgeVehicleAudit]::TextureProfiles((Join-Path $Folder ($Spawn + '.ytd')))
[pscustomobject]@{ ok = $true; assets = @($results); textures = $textures; textureProfiles = @($textureProfiles); testedInGame = $false } | ConvertTo-Json -Depth 5
