param([string]$InstallerPath)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Appx\Appx.psd1') -ErrorAction Stop
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
if (Get-Process -Name RPFForge -ErrorAction SilentlyContinue) { throw 'Feche o RPForge antes do teste; nenhuma janela sera encerrada pelo teste.' }
if (!$InstallerPath) {
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    $InstallerPath = Join-Path $projectRoot "release\RPForge-Setup-$version-x64.exe"
}
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('rpf-installer-test-' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $testRoot 'installed app'
$inputDir = Join-Path $testRoot 'input & spaces'
New-Item -ItemType Directory -Path $inputDir -Force | Out-Null
$menuKeys = @('HKCU:\Software\Classes\Directory\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\shell\RPForgeYtyp', 'HKCU:\Software\Classes\Directory\Background\shell\RPForgeYtyp')
$originalUninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{5B15119A-256C-4285-A0F0-AF8435859EA1}_is1'
$originalPackage = Get-AppxPackage -Name 'RedHorn.RPFForge.Local'
$originalRoot = Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\RPForge' -Name MenuOwner -ErrorAction SilentlyContinue
if (!$originalRoot -and (Test-Path -LiteralPath ($menuKeys[0] + '\command'))) {
    $command = (Get-Item -LiteralPath ($menuKeys[0] + '\command')).GetValue('')
    if ($command -match '^"[^"]+" "([^"]+\\src\\cli.js)"') { $originalRoot = Split-Path -Parent (Split-Path -Parent $Matches[1]) }
}
if ($originalPackage -and (!$originalRoot -or !(Test-Path -LiteralPath (Join-Path $originalRoot 'shell\RPFForge.identity.msix')))) { throw 'Pacote original nao localizado para restauracao segura; teste interrompido antes de instalar.' }
$snapshots = @()
foreach ($key in ($menuKeys + @('HKCU:\Software\RPForge', $originalUninstall))) {
    $file = Join-Path $testRoot ('registry-' + $snapshots.Count + '.reg')
    $present = Test-Path -LiteralPath $key
    if ($present) { & reg.exe export $key.Replace('HKCU:\','HKCU\') $file /y | Out-Null; if ($LASTEXITCODE -ne 0) { throw "Falha ao preservar $key" } }
    $snapshots += [pscustomobject]@{ Key=$key; File=$file; Present=$present }
}
$originalFiles = @()
if ($originalRoot) { $originalFiles = @(Get-ChildItem -LiteralPath $originalRoot -Recurse -File | ForEach-Object { [pscustomobject]@{ Path=$_.FullName; Hash=(Get-ForgeSha256 $_.FullName) } }) }
$installed = $false
$testFailure = $null
Push-Location $projectRoot
try {
    & node.exe --input-type=module -e "import{writeFile}from'node:fs/promises';import{vehicleArchive}from'./tests/fixture.js';await writeFile(process.argv[1],vehicleArchive());" (Join-Path $inputDir 'vehicle.rpf')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar fixture.' }
    $arguments = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/NOICONS','/AuditMode=1',"/DIR=`"$installDir`"")
    # A separate audit AppId preserves the original uninstall entry.
    $installed = $true
    foreach ($cycle in @(1,2)) {
        $log = Join-Path $testRoot "install-$cycle.log"
        $process = Start-Process -FilePath $InstallerPath -ArgumentList ($arguments + "/LOG=`"$log`"") -WindowStyle Hidden -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Instalacao/atualizacao falhou: $($process.ExitCode). Logs: $testRoot" }
        if ($cycle -eq 1) { New-Item -ItemType Directory -Path (Join-Path $installDir 'user-project') -Force | Out-Null; [IO.File]::WriteAllText((Join-Path $installDir 'user-project\keep.txt'), 'preserve user project') }
    }
    $runtime = Join-Path $installDir 'runtime\node.exe'
    $cli = Join-Path $installDir 'src\cli.js'
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Runtime nao instalado.' }
    $command = (Get-Item -LiteralPath ($menuKeys[0] + '\command')).GetValue('')
    if (!$command.Contains($runtime) -or !$command.Contains($cli)) { throw 'Menu aponta para outro programa.' }
    & (Join-Path $PSScriptRoot 'Test-ContextMenu.ps1') -RequireYtyp
    & (Join-Path $PSScriptRoot 'Test-ModernMenu.ps1') -InstallDir $installDir
    # Uninstall commands from another copy must not remove this copy's integration.
    & (Join-Path $projectRoot 'windows\Register-ModernMenu.ps1') -Unregister
    & (Join-Path $projectRoot 'windows\Uninstall-ContextMenu.ps1')
    if (!(Get-AppxPackage -Name 'RedHorn.RPFForge.Local')) { throw 'Outra copia removeu o pacote ativo.' }
    & (Join-Path $PSScriptRoot 'Test-ContextMenu.ps1') -RequireYtyp
    foreach ($file in @('LICENSE','NOTICE','licenses\Pixelify-Sans-OFL.txt','THIRD_PARTY_NOTICES.md','sbom.cdx.json','build-manifest.json')) { if (!(Test-Path -LiteralPath (Join-Path $installDir $file))) { throw "Inventario ou aviso ausente: $file" } }
    $installedVersion = (Get-Content -LiteralPath (Join-Path $installDir 'package.json') -Raw | ConvertFrom-Json).version
    $sourceArchive = Join-Path $installDir "source\RPForge-source-$installedVersion.zip"
    $sourceCheck = Join-Path $testRoot 'source-check'
    Expand-Archive -LiteralPath $sourceArchive -DestinationPath $sourceCheck
    $sourceLicense = Join-Path $sourceCheck 'RPForge\LICENSE'
    if ([IO.File]::ReadAllText($sourceLicense).Replace("`r`n", "`n") -ne [IO.File]::ReadAllText((Join-Path $installDir 'LICENSE')).Replace("`r`n", "`n")) { throw 'Licenca do codigo-fonte diverge da licenca instalada.' }
    $sourcePackage = Get-Content -LiteralPath (Join-Path $sourceCheck 'RPForge\package.json') -Raw | ConvertFrom-Json
    if ($sourcePackage.license -ne 'GPL-3.0-only' -or $sourcePackage.version -ne $installedVersion) { throw 'Licenca ou versao do codigo-fonte incorreta.' }
    foreach ($file in @('src\convert.js','desktop\RPFForge.cs','scripts\Build-Installer.ps1','installer\setup.iss')) {
        if (!(Test-Path -LiteralPath (Join-Path $sourceCheck "RPForge\$file"))) { throw "Codigo-fonte incompleto: $file" }
    }
    $setupSource = [IO.File]::ReadAllText((Join-Path $sourceCheck 'RPForge\installer\setup.iss'))
    if (!$setupSource.Contains('DefaultDirName={localappdata}\Programs\RPForge') -or !$setupSource.Contains('UsePreviousAppDir=no')) { throw 'O instalador deve usar a pasta RPForge sem reutilizar automaticamente o caminho antigo.' }
    & node.exe scripts/Create-DesktopFixtures.mjs (Join-Path $testRoot 'gui fixtures')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar fixtures GUI.' }
    $previousPath = $env:PATH; $previousConsole = $env:RPF_FORGE_CONSOLE
    try {
        $env:PATH = ''; $env:RPF_FORGE_CONSOLE = '1'
        & $runtime $cli $inputDir
        if ($LASTEXITCODE -ne 0) { throw 'Conversao pelo runtime incluido falhou.' }
        $gui = Start-Process -FilePath (Join-Path $installDir 'RPFForge.exe') -ArgumentList @('--workflow-test',"`"$(Join-Path $testRoot 'gui fixtures')`"") -WindowStyle Hidden -Wait -PassThru
        if ($gui.ExitCode -ne 0) { throw 'Fluxo GUI instalado falhou; consulte installed app/.tools/desktop-test-error.txt.' }
    } finally { $env:PATH = $previousPath; $env:RPF_FORGE_CONSOLE = $previousConsole }
    $output = Join-Path $inputDir 'car\fxmanifest.lua'
    if (!(Test-Path -LiteralPath $output)) { throw 'Addon nao foi criado.' }
    $process = Start-Process -FilePath (Join-Path $installDir 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Desinstalacao falhou.' }
    $installed = $false
    foreach ($key in $menuKeys) { if (Test-Path -LiteralPath $key) { throw "Menu permaneceu apos desinstalar: $key" } }
    if (Get-AppxPackage -Name 'RedHorn.RPFForge.Local') { throw 'Pacote moderno permaneceu apos desinstalar.' }
    if (Test-Path -LiteralPath $runtime) { throw 'Runtime permaneceu apos desinstalar.' }
    if (!(Test-Path -LiteralPath $output) -or !(Test-Path -LiteralPath (Join-Path $inputDir 'vehicle.rpf'))) { throw 'Dados de usuario foram removidos.' }
    if ([IO.File]::ReadAllText((Join-Path $installDir 'user-project\keep.txt')) -ne 'preserve user project') { throw 'Projeto pessoal nao foi preservado.' }
} catch { $testFailure = $_ }
finally {
    try {
        if ($installed -and (Test-Path -LiteralPath (Join-Path $installDir 'unins000.exe'))) {
            $cleanup = Start-Process -FilePath (Join-Path $installDir 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -Wait -PassThru
            if ($cleanup.ExitCode -ne 0) { throw "Falha ao desinstalar copia de auditoria: $($cleanup.ExitCode)" }
        }
        if ($originalPackage) { Add-AppxPackage -Path (Join-Path $originalRoot 'shell\RPFForge.identity.msix') -ExternalLocation $originalRoot -ForceTargetApplicationShutdown -ErrorAction Stop }
    } finally {
        # Restore exact types and previous absence of all four menu keys.
        foreach ($snapshot in $snapshots | Where-Object { $_.Key -ne $originalUninstall }) {
            if (Test-Path -LiteralPath $snapshot.Key) { Remove-Item -LiteralPath $snapshot.Key -Recurse -Force }
            if ($snapshot.Present) { & reg.exe import $snapshot.File | Out-Null; if ($LASTEXITCODE -ne 0) { throw "Falha ao restaurar $($snapshot.Key)" } }
        }
        Pop-Location
    }
}
foreach ($file in $originalFiles) { if (!(Test-Path -LiteralPath $file.Path) -or (Get-ForgeSha256 $file.Path) -ne $file.Hash) { throw "Arquivo original alterado: $($file.Path)" } }
$previousEntry = $snapshots | Where-Object Key -eq $originalUninstall
if ($previousEntry.Present) {
    $afterFile = Join-Path $testRoot 'original-uninstall-after.reg'
    & reg.exe export $originalUninstall.Replace('HKCU:\','HKCU\') $afterFile /y | Out-Null
    if ($LASTEXITCODE -ne 0 -or (Get-ForgeSha256 $afterFile) -ne (Get-ForgeSha256 $previousEntry.File)) { throw 'Entrada de desinstalacao original foi alterada.' }
} elseif (Test-Path -LiteralPath $originalUninstall) { throw 'Entrada original criada pelo teste.' }
if ($originalPackage) { & (Join-Path $PSScriptRoot 'Test-ModernMenu.ps1') -InstallDir $originalRoot }
if ($testFailure) { throw $testFailure }
Write-Host "PASS: instalacao, reinstalacao, menus RPF/YTYP, GUI e CLI sem PATH, desinstalacao, dados preservados e integracao original restaurada. Logs: $testRoot"
