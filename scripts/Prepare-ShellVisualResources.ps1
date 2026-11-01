param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdk = Join-Path $root '.tools\windows-sdk-buildtools\bin\10.0.28000.0\x64'
$assets = Join-Path $Destination 'Assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
Copy-Item -Path (Join-Path $root 'shell\VisualAssets\*.png') -Destination $assets -Force
$config = Join-Path $root '.tools\shell-visual-priconfig.xml'
& (Join-Path $sdk 'makepri.exe') createconfig /cf $config /dq pt-BR /o
if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar o indice visual.' }
$settings = [xml][IO.File]::ReadAllText($config)
$settings.resources.packaging.RemoveAll()
foreach ($entry in @($settings.resources.index.'indexer-config')) {
    if ($entry.type -eq 'PRI') { $null = $entry.ParentNode.RemoveChild($entry) }
}
$settings.Save($config)
& (Join-Path $sdk 'makepri.exe') new /pr $Destination /cf $config /of (Join-Path $Destination 'resources.pri') /o
if ($LASTEXITCODE -ne 0) { throw 'Falha ao indexar icones transparentes do menu.' }
