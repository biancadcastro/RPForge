param([Parameter(Mandatory=$true)][string]$First, [Parameter(Mandatory=$true)][string]$Second, [switch]$AllowDirty)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
$a = Get-Content -LiteralPath (Join-Path $First 'build-manifest.json') -Raw | ConvertFrom-Json
$b = Get-Content -LiteralPath (Join-Path $Second 'build-manifest.json') -Raw | ConvertFrom-Json
if ($a.revision -ne $b.revision -or $a.sourceTreeSha256 -ne $b.sourceTreeSha256 -or $a.toolchainLockSha256 -ne $b.toolchainLockSha256) { throw 'As duas compilacoes nao usam a mesma revisao, arvore de fontes e toolchain.' }
if (!$AllowDirty -and ($a.dirty -or $b.dirty)) { throw 'Comparacao de origem limpa exige builds sem alteracoes locais.' }
foreach ($name in @('RPFForge.exe','ForgeShell.dll')) {
    if ((Get-ForgeSha256 (Join-Path $First $name)) -ne (Get-ForgeSha256 (Join-Path $Second $name))) { throw "Binarios nao reproduziveis: $name" }
}
foreach ($folder in @($First,$Second)) {
    if (Get-ChildItem -LiteralPath $folder -Recurse -File | Where-Object { $_.Extension -in @('.msix','.msi','.appx','.pfx','.p12','.key') -or $_.Name -match 'Setup.*\.exe$' }) { throw 'O bundle de preparacao contem instalador ou material de chave.' }
}
Write-Host "PASS: binarios identicos por SHA-256 para a mesma arvore, revisao e toolchain. Revisao: $($a.revision)"
