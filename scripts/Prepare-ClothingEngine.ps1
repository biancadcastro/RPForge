param([Parameter(Mandatory=$true)][string]$CodeWalkerDirectory,[Parameter(Mandatory=$true)][string]$TextureConverter,[string]$SkinReference)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$destination=Join-Path $root '.tools\clothing-engine'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach($name in @('CodeWalker.Core.dll','SharpDX.Mathematics.dll','SharpDX.dll')) {
 $source=Join-Path $CodeWalkerDirectory $name
 if(!(Test-Path -LiteralPath $source -PathType Leaf)){throw "Componente ausente: $name"}
 Copy-Item -LiteralPath $source -Destination (Join-Path $destination $name)
}
Copy-Item -LiteralPath $TextureConverter -Destination (Join-Path $destination 'texconv.exe')
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler=Join-Path $framework 'csc.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll /reference:System.Core.dll ("/reference:$framework\netstandard.dll") ("/reference:$destination\CodeWalker.Core.dll") ("/reference:$destination\SharpDX.Mathematics.dll") ("/out:$destination\ClothingDecoder.exe") (Join-Path $PSScriptRoot 'clothing\ClothingDecoder.cs')
if($LASTEXITCODE -ne 0){throw 'Falha ao compilar leitor de roupas.'}
& $compiler /nologo /target:exe /main:ClothingNeon /platform:x64 /optimize+ /reference:System.Web.Extensions.dll /reference:System.Core.dll /reference:System.Xml.dll ("/reference:$framework\netstandard.dll") ("/reference:$destination\CodeWalker.Core.dll") ("/reference:$destination\SharpDX.Mathematics.dll") ("/reference:$destination\SharpDX.dll") ("/out:$destination\ClothingNeon.exe") (Join-Path $PSScriptRoot 'clothing\ClothingDecoder.cs') (Join-Path $PSScriptRoot 'clothing\ClothingNeon.cs')
if($LASTEXITCODE -ne 0){throw 'Falha ao compilar conversor Neon.'}
& $compiler /nologo /target:exe /main:ClothingSkin /platform:x64 /optimize+ /reference:System.Web.Extensions.dll /reference:System.Core.dll /reference:System.Xml.dll ("/reference:$framework\netstandard.dll") ("/reference:$destination\CodeWalker.Core.dll") ("/reference:$destination\SharpDX.Mathematics.dll") ("/reference:$destination\SharpDX.dll") ("/out:$destination\ClothingSkin.exe") (Join-Path $PSScriptRoot 'clothing\ClothingDecoder.cs') (Join-Path $PSScriptRoot 'clothing\ClothingSkin.cs')
if($LASTEXITCODE -ne 0){throw 'Falha ao compilar separador de pele.'}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'clothing\neon-shader.xml') -Destination $destination -Force
if($SkinReference){ & node (Join-Path $PSScriptRoot 'prepare-skin-check.mjs') $SkinReference (Join-Path $destination 'skin-triangles.json');if($LASTEXITCODE -ne 0){throw 'Falha ao preparar verificacao de pele.'} }
$records=@(Get-ChildItem -LiteralPath $destination -File | Where-Object { $_.Extension -in '.exe','.dll','.xml' -or $_.Name -eq 'skin-triangles.json' } | ForEach-Object { @{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
@{schema=1;developmentOnly=$true;files=$records} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding UTF8
Write-Output 'Motor de roupas de desenvolvimento preparado. Sem Blender, instalador ou alteração do acervo.'
