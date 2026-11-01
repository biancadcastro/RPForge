param([string]$ExecutablePath)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$ExecutablePath) { $ExecutablePath = Join-Path $root '.tools\desktop\RPFForge.exe' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('forge-desktop-workflow-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
Push-Location $root
try {
    & node.exe --input-type=module -e "import {writeFile} from 'node:fs/promises'; import {vehicleArchive} from './tests/fixture.js'; await writeFile(process.argv[1],vehicleArchive());" (Join-Path $fixture 'dlc.rpf')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar RPF sintetico.' }
    $process = Start-Process -FilePath $ExecutablePath -ArgumentList @('--workflow-test', "`"$fixture`"") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Fluxo da janela falhou. Consulte .tools\desktop-test-error.txt.' }
    Write-Host "PASS: GUI -> bridge -> previa, spawn, conversao, backup e pasta vazia. Fixture: $fixture"
} finally { Pop-Location }
