param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
if (!$InstallDir) {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\RPForge'
    if (!(Test-Path -LiteralPath $InstallDir)) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\RPF to FiveM' }
}
Import-Module (Join-Path $PSHOME 'Modules\Appx\Appx.psd1')
$package = Get-AppxPackage -Name 'RedHorn.RPFForge.Local'
if (!$package -or $package.Status -ne 'Ok') { throw 'Pacote moderno nao registrado ou com erro.' }
$manifest = Get-AppxPackageManifest -Package $package.PackageFullName
if ($manifest.Package.Properties.DisplayName -ne 'RPForge') { throw 'Nome do pacote incorreto.' }
if ($manifest.Package.Applications.Application.Executable -ne 'RPFForge.exe') { throw 'O agrupamento do menu deve usar o executavel RPForge, nunca o Node.' }
if ($manifest.Package.Properties.Logo -ne 'Assets\StoreLogo.png') { throw 'Marca antiga no agrupamento do menu.' }
foreach ($logo in @('Assets\StoreLogo.png', 'Assets\LargeLogo.png', 'Assets\MenuLogo.png', 'resources.pri')) {
    if (!(Test-Path -LiteralPath (Join-Path $InstallDir $logo))) { throw "Recurso visual ausente na localizacao externa: $logo" }
}
Add-Type -AssemblyName System.Drawing
foreach ($size in @(16,20,24,32,48,256)) {
    $file = Join-Path $InstallDir "Assets\MenuLogo.targetsize-${size}_altform-unplated.png"
    if (!(Test-Path -LiteralPath $file)) { throw "Icone sem placa ausente: $size" }
    $bitmap = [Drawing.Bitmap]::FromFile($file)
    try {
        if ($bitmap.Width -ne $size -or $bitmap.Height -ne $size -or $bitmap.GetPixel(0,0).A -ne 0) { throw "Dimensoes ou transparencia incorretas: $size" }
    } finally { $bitmap.Dispose() }
}
foreach ($name in @('rpforge-mark-v3.png', 'rpforge-mark-v3.ico')) {
    if (!(Test-Path -LiteralPath (Join-Path $InstallDir ('shell\' + $name)))) { throw "Icone do menu ausente: $name" }
}
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('forge-activation-' + [guid]::NewGuid().ToString('N'))
$withRpf = Join-Path $fixture 'with RPF'
$empty = Join-Path $fixture 'empty'
New-Item -ItemType Directory -Path $withRpf,$empty -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $withRpf 'test.rpf'), 'synthetic')
& (Join-Path $root '.tools\TestForgeShell.exe') (Join-Path $InstallDir 'shell\ForgeShell.dll') $withRpf $empty --registered
if ($LASTEXITCODE -ne 0) { throw "Ativacao COM pelo Windows falhou: $LASTEXITCODE" }
Write-Host "PASS: identidade $($package.PackageFullName), ativacao COM registrada e visibilidade por pasta."
