$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$installed = Join-Path $env:LOCALAPPDATA 'Programs\RPForge'
# Compatibility with installations created before the RPForge directory name.
if (!(Test-Path -LiteralPath $installed)) { $installed = Join-Path $env:LOCALAPPDATA 'Programs\RPF to FiveM' }
if (!(Test-Path -LiteralPath (Join-Path $installed 'runtime\node.exe')) -or !(Test-Path -LiteralPath (Join-Path $installed 'src\cli.js'))) { throw 'Instalacao local existente nao encontrada.' }
foreach ($directory in @($installed, (Join-Path $installed 'src'))) {
    if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Atualizacao local nao aceita diretorios redirecionados.' }
}
$backup = Join-Path $root ('.tools\local-update-backups\' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
# Dependencies are copied before their importers. No registry or native shell changes.
foreach ($name in @('metadata.js', 'audit.js', 'output.js', 'spawns.js', 'prompts.js', 'rpf.js', 'tuning.js', 'content.js', 'ytyp.js', 'ytyp-template.json', 'convert.js', 'preview.js', 'bridge.js', 'cli.js')) {
    $source = Join-Path $root "src\$name"
    $target = Join-Path $installed "src\$name"
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) }
    Copy-Item -LiteralPath $source -Destination $target -Force
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($source)) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($target))) { throw "Falha ao verificar $name" }
}
$desktop = Join-Path $root '.tools\desktop\RPFForge.exe'
if (Test-Path -LiteralPath $desktop) {
    $target = Join-Path $installed 'RPFForge.exe'
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'RPFForge.exe') }
    Copy-Item -LiteralPath $desktop -Destination $target -Force
}
Write-Host "Codigo local atualizado. Backup: $backup"
