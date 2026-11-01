param([string]$InstallerPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (!$InstallerPath) { $InstallerPath = Join-Path $projectRoot 'release\RPF-to-FiveM-Setup-0.1.0-x64.exe' }
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('rpf-installer-test-' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $testRoot 'installed app'
$inputDir = Join-Path $testRoot 'input & spaces'
$menuKey = 'HKCU:\Software\Classes\Directory\shell\RpfToFiveM'
$backup = @{}
if (Test-Path -LiteralPath $menuKey) {
    foreach ($suffix in @('', '\command')) {
        $key = Get-Item -LiteralPath "$menuKey$suffix"
        $values = @{}
        foreach ($name in $key.GetValueNames()) { $values[$name] = $key.GetValue($name) }
        $backup[$suffix] = $values
    }
}
New-Item -ItemType Directory -Path $inputDir -Force | Out-Null
$installed = $false
Push-Location $projectRoot
try {
    $fixtureScript = "import {writeFile} from 'node:fs/promises'; import {vehicleArchive} from './tests/fixture.js'; await writeFile(process.argv[1],vehicleArchive());"
    & node.exe --input-type=module -e $fixtureScript (Join-Path $inputDir 'vehicle.rpf')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar fixture.' }
    $process = Start-Process -FilePath $InstallerPath -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$installDir`"", "/LOG=`"$(Join-Path $testRoot 'install.log')`"") -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Instalacao falhou: $($process.ExitCode). Logs em $testRoot" }
    $installed = $true
    $runtime = Join-Path $installDir 'runtime\node.exe'
    $cli = Join-Path $installDir 'src\cli.js'
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Runtime nao instalado.' }
    $command = (Get-Item -LiteralPath "$menuKey\command").GetValue('')
    if (!$command.Contains($runtime) -or !$command.Contains($cli)) { throw 'Menu aponta para outro programa.' }
    # No Node, npm or other executable can be found through PATH during conversion.
    $previousPath = $env:PATH
    try {
        $env:PATH = ''
        & $runtime $cli $inputDir
        if ($LASTEXITCODE -ne 0) { throw 'Conversao pelo runtime incluido falhou.' }
    } finally { $env:PATH = $previousPath }
    $output = Join-Path $inputDir 'vehicle_fivem\fxmanifest.lua'
    if (!(Test-Path -LiteralPath $output)) { throw 'Addon nao foi criado.' }
    $uninstaller = Join-Path $installDir 'unins000.exe'
    $process = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Desinstalacao falhou.' }
    $installed = $false
    if (Test-Path -LiteralPath $menuKey) { throw 'Menu permaneceu apos desinstalar.' }
    if (Test-Path -LiteralPath $runtime) { throw 'Runtime permaneceu apos desinstalar.' }
    if (!(Test-Path -LiteralPath $output) -or !(Test-Path -LiteralPath (Join-Path $inputDir 'vehicle.rpf'))) { throw 'Dados de usuario foram removidos.' }
    Write-Host "PASS: instalacao, menu, runtime sem PATH, conversao e desinstalacao. Logs: $testRoot"
} finally {
    if ($installed) {
        $uninstaller = Join-Path $installDir 'unins000.exe'
        if (Test-Path -LiteralPath $uninstaller) { Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -WindowStyle Hidden -Wait | Out-Null }
    }
    # Restore the development context menu that existed before the lifecycle test.
    foreach ($suffix in @('', '\command')) {
        if (!$backup.ContainsKey($suffix)) { continue }
        if (!(Test-Path -LiteralPath "$menuKey$suffix")) { New-Item -Path "$menuKey$suffix" -Force | Out-Null }
        foreach ($name in $backup[$suffix].Keys) {
            if ($name -eq '') { Set-Item -LiteralPath "$menuKey$suffix" -Value $backup[$suffix][$name] }
            else { New-ItemProperty -LiteralPath "$menuKey$suffix" -Name $name -Value $backup[$suffix][$name] -PropertyType String -Force | Out-Null }
        }
    }
    Pop-Location
}
