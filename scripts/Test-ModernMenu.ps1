param([string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\RPF to FiveM'))
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Appx\Appx.psd1')
$package = Get-AppxPackage -Name 'RedHorn.RPFForge.Local'
if (!$package -or $package.Status -ne 'Ok') { throw 'Pacote moderno nao registrado ou com erro.' }
$manifest = Get-AppxPackageManifest -Package $package.PackageFullName
if ($manifest.Package.Properties.DisplayName -ne 'RPForge') { throw 'Nome do pacote incorreto.' }
if ($manifest.Package.Applications.Application.Executable -ne 'RPFForge.exe') { throw 'O agrupamento do menu deve usar o executavel RPForge, nunca o Node.' }
if ($manifest.Package.Properties.Logo -ne 'shell\rpforge-mark-v3.png') { throw 'Marca antiga no agrupamento do menu.' }
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
