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
$webProject = Join-Path $root 'desktop-web'
$installedWeb = Join-Path $installed 'desktop-web'
$active = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installedWeb + '\', [StringComparison]::OrdinalIgnoreCase) })
if ($active.Count) { throw 'O desktop instalado esta em uso. Feche o RPForge antes de atualizar.' }
$newWeb = Join-Path $root ('.tools\local-desktop-payload\' + [guid]::NewGuid().ToString('N'))
& (Join-Path $PSScriptRoot 'Prepare-DesktopPayload.ps1') -Destination $newWeb
$clothingEngine = Join-Path $root '.tools\clothing-engine'
$clothingManifest = Get-Content -LiteralPath (Join-Path $clothingEngine 'manifest.json') -Raw | ConvertFrom-Json
foreach ($name in @('ClothingDecoder.exe','ClothingNeon.exe','ClothingSkin.exe','CodeWalker.Core.dll','SharpDX.Mathematics.dll','SharpDX.dll','neon-shader.xml','skin-triangles.json','texconv.exe')) {
    $record = $clothingManifest.files | Where-Object name -EQ $name
    if (!$record -or (Get-FileHash -LiteralPath (Join-Path $clothingEngine $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256) { throw "Componente de roupas divergente: $name" }
}
$installedEngines = Join-Path $installed 'engines'
New-Item -ItemType Directory -Path $installedEngines -Force | Out-Null
if ((Get-Item -LiteralPath $installedEngines).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Diretorio de motores redirecionado.' }
$installedClothing = Join-Path $installedEngines 'clothing'
if (Test-Path -LiteralPath $installedClothing) {
    if ((Get-Item -LiteralPath $installedClothing).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Motor de roupas redirecionado.' }
    Move-Item -LiteralPath $installedClothing -Destination (Join-Path $backup 'clothing-engine')
}
Copy-Item -LiteralPath $clothingEngine -Destination $installedClothing -Recurse
if (Test-Path -LiteralPath $installedWeb) {
    $resolvedWeb = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $installedWeb).Path)
    if ($resolvedWeb -ne [IO.Path]::GetFullPath((Join-Path $installed 'desktop-web')) -or ((Get-Item -LiteralPath $installedWeb).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Desktop instalado redirecionado; atualizacao recusada.' }
    Move-Item -LiteralPath $installedWeb -Destination (Join-Path $backup 'desktop-web')
}
try { Move-Item -LiteralPath $newWeb -Destination $installedWeb }
catch {
    if (!(Test-Path -LiteralPath $installedWeb) -and (Test-Path -LiteralPath (Join-Path $backup 'desktop-web'))) { Move-Item -LiteralPath (Join-Path $backup 'desktop-web') -Destination $installedWeb }
    throw
}
# Dependencies are copied before their importers. No registry or native shell changes.
foreach ($name in @('user-error.js', 'rsc7.js', 'publication.js', 'metadata.js', 'audit.js', 'output.js', 'spawns.js', 'prompts.js', 'rpf.js', 'tuning.js', 'content.js', 'ytyp.js', 'ytyp-template.json', 'clothing.js', 'clothing-neon.js', 'clothing-skin.js', 'convert.js', 'preview.js', 'bridge.js', 'cli.js')) {
    $source = Join-Path $root "src\$name"
    $target = Join-Path $installed "src\$name"
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) }
    Copy-Item -LiteralPath $source -Destination $target -Force
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($source)) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($target))) { throw "Falha ao verificar $name" }
}
$desktop = Join-Path $root '.tools\desktop\RPFForge.exe'
if ((Test-Path -LiteralPath $desktop) -and (Get-Item -LiteralPath $desktop).VersionInfo.ProductVersion -eq (Get-Item -LiteralPath (Join-Path $installed 'RPFForge.exe')).VersionInfo.ProductVersion) {
    $target = Join-Path $installed 'RPFForge.exe'
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'RPFForge.exe') }
    Copy-Item -LiteralPath $desktop -Destination $target -Force
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($desktop)) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($target))) { throw 'Falha ao validar o executavel local.' }
}
if ((Test-Path -LiteralPath (Join-Path $webProject 'out\index.html')) -and (Test-Path -LiteralPath (Join-Path $webProject 'node_modules\electron\dist\electron.exe'))) {
    $development = Join-Path $installed 'desktop-development.json'
    if (Test-Path -LiteralPath $development) { Copy-Item -LiteralPath $development -Destination (Join-Path $backup 'desktop-development.json') }
    [IO.File]::WriteAllText($development, (@{ webProject = $installedWeb } | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
}
& node (Join-Path $PSScriptRoot 'Prepare-InstallerPresentation.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar os documentos locais.' }
$installedLegal = Join-Path $installed 'legal'
if (Test-Path -LiteralPath $installedLegal) { Copy-Item -LiteralPath $installedLegal -Destination (Join-Path $backup 'legal') -Recurse }
New-Item -ItemType Directory -Path $installedLegal -Force | Out-Null
foreach ($name in @('terms-license.txt','privacy.txt','third-party.txt','chromium-notices.txt')) { Copy-Item -LiteralPath (Join-Path $root ".tools\installer-presentation\$name") -Destination $installedLegal -Force }
foreach ($name in @('LICENSE','NOTICE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json')) {
    $target = Join-Path $installed $name
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) }
    Copy-Item -LiteralPath (Join-Path $root $name) -Destination $target -Force
}
Write-Host "Codigo local atualizado. Backup: $backup"
foreach ($name in @('Register-ClothingMenu.ps1','Uninstall-ContextMenu.ps1')) {
    $target = Join-Path $installed "windows\$name"
    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination (Join-Path $backup $name) }
    Copy-Item -LiteralPath (Join-Path $root "windows\$name") -Destination $target -Force
}
& (Join-Path $installed 'windows\Register-ClothingMenu.ps1') -InstallRoot $installed
