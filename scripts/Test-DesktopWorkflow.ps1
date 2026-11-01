param([string]$ExecutablePath)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$ExecutablePath) { $ExecutablePath = Join-Path $root '.tools\desktop\RPFForge.exe' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('forge-desktop-workflow-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
Push-Location $root
try {
    & node.exe scripts/Create-DesktopFixtures.mjs $fixture
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar fixtures sinteticas.' }
    $process = Start-Process -FilePath $ExecutablePath -ArgumentList @('--workflow-test', "`"$fixture`"") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Fluxo da janela falhou. Consulte .tools\desktop-test-error.txt.' }
    Write-Host "PASS: GUI -> bridge -> veiculos, roupas, mapas com YMF, backup e YTYP automatico sem sobrescrita. Fixture: $fixture"
} finally { Pop-Location }
