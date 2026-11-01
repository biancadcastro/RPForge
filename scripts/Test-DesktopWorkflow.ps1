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
    & node.exe --input-type=module -e "import {mkdir,writeFile} from 'node:fs/promises';import{deflateRawSync}from'node:zlib';import path from'node:path';const folder=process.argv[1];await mkdir(folder);const raw=Buffer.alloc(512);raw.writeFloatLE(2,44);for(const at of[48,52,56])raw.writeFloatLE(-1,at);for(const at of[64,68,72])raw.writeFloatLE(1,at);const header=Buffer.alloc(16);header.write('RSC7');header.writeUInt32LE(165,4);await writeFile(path.join(folder,'sample.ydr'),Buffer.concat([header,deflateRawSync(raw)]));" (Join-Path $fixture 'props')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar YDR sintetico.' }
    $process = Start-Process -FilePath $ExecutablePath -ArgumentList @('--workflow-test', "`"$fixture`"") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Fluxo da janela falhou. Consulte .tools\desktop-test-error.txt.' }
    Write-Host "PASS: GUI -> bridge -> conversao, backup, pasta vazia e YTYP automatico sem sobrescrita. Fixture: $fixture"
} finally { Pop-Location }
