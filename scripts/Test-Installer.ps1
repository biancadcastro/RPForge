param([string]$InstallerPath, [switch]$InteractiveTrust, [switch]$ExistingTrust, [switch]$ElectronDesktop, [string]$ClothingSpec, [string]$SkinSpec)
$ErrorActionPreference = 'Stop'
$testModernMenu = $InteractiveTrust -or $ExistingTrust
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
$menuKeys = @('HKCU:\Software\Classes\Directory\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\shell\RPForgeYtyp', 'HKCU:\Software\Classes\Directory\Background\shell\RPForgeYtyp', 'HKCU:\Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj')
$originalUninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{5B15119A-256C-4285-A0F0-AF8435859EA1}_is1'
$menuKeys += @('HKCU:\Software\Classes\Directory\shell\RPForgeObj','HKCU:\Software\Classes\Directory\Background\shell\RPForgeObj')
$menuKeys += @('HKCU:\Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeNeon','HKCU:\Software\Classes\Directory\shell\RPForgeNeon','HKCU:\Software\Classes\Directory\Background\shell\RPForgeNeon')
$menuKeys += @('HKCU:\Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeSkin','HKCU:\Software\Classes\Directory\shell\RPForgeSkin','HKCU:\Software\Classes\Directory\Background\shell\RPForgeSkin')
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
        if ($InteractiveTrust -and $cycle -eq 1) {
            $interactiveArguments = @('/NORESTART','/SP-','/NOICONS','/AuditMode=1',"/DIR=`"$installDir`"", "/LOG=`"$log`"")
            Write-Host 'INTERACTIVE: conclua o instalador de auditoria, autorize a confianca local e confirme o UAC.'
            $process = Start-Process -FilePath $InstallerPath -ArgumentList $interactiveArguments -Wait -PassThru
        } else {
            $process = Start-Process -FilePath $InstallerPath -ArgumentList ($arguments + "/LOG=`"$log`"") -WindowStyle Hidden -Wait -PassThru
        }
        if ($process.ExitCode -ne 0) { throw "Instalacao/atualizacao falhou: $($process.ExitCode). Logs: $testRoot" }
        if ($ExistingTrust -and $cycle -eq 1) {
            # This does not import a certificate or replace interactive consent.
            # Used only to finish regression tests after trust was already authorized.
            $trustedCer = New-Object Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $installDir 'shell\RPFForge.LocalTest.cer'))
            try { if (!(Test-Path -LiteralPath ('Cert:\LocalMachine\TrustedPeople\' + $trustedCer.Thumbprint))) { throw 'O teste exige confianca previamente autorizada.' } }
            finally { $trustedCer.Dispose() }
            & (Join-Path $installDir 'windows\Register-ModernMenu.ps1')
        }
        if ($cycle -eq 1) { New-Item -ItemType Directory -Path (Join-Path $installDir 'user-project') -Force | Out-Null; [IO.File]::WriteAllText((Join-Path $installDir 'user-project\keep.txt'), 'preserve user project') }
    }
    $runtime = Join-Path $installDir 'runtime\node.exe'
    $cli = Join-Path $installDir 'src\cli.js'
    if (!(Test-Path -LiteralPath $runtime)) { throw 'Runtime nao instalado.' }
    $command = (Get-Item -LiteralPath ($menuKeys[0] + '\command')).GetValue('')
    if (!$command.Contains($runtime) -or !$command.Contains($cli)) { throw 'Menu aponta para outro programa.' }
    & (Join-Path $PSScriptRoot 'Test-ContextMenu.ps1') -RequireYtyp
    if ($testModernMenu) {
        & (Join-Path $PSScriptRoot 'Test-ModernMenu.ps1') -InstallDir $installDir
        $installedCer = New-Object Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $installDir 'shell\RPFForge.LocalTest.cer'))
        try {
            if (!(Test-Path -LiteralPath ('Cert:\LocalMachine\TrustedPeople\' + $installedCer.Thumbprint))) { throw 'Confianca autorizada nao encontrada em TrustedPeople.' }
            foreach ($signedFile in @($InstallerPath,(Join-Path $installDir 'RPFForge.exe'),(Join-Path $installDir 'shell\ForgeShell.dll'),(Join-Path $installDir 'shell\RPFForge.identity.msix'))) {
                $signature = Get-AuthenticodeSignature -LiteralPath $signedFile
                if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $installedCer.Thumbprint) { throw 'Assinatura local ausente, invalida ou inesperada.' }
            }
        } finally { $installedCer.Dispose() }
    }
    # Uninstall commands from another copy must not remove this copy's integration.
    if ($testModernMenu) { & (Join-Path $projectRoot 'windows\Register-ModernMenu.ps1') -InstallRoot (Join-Path $projectRoot 'packaging-stage') -Unregister }
    & (Join-Path $projectRoot 'windows\Uninstall-ContextMenu.ps1')
    if ($testModernMenu -and !(Get-AppxPackage -Name 'RedHorn.RPFForge.Local')) { throw 'Outra copia removeu o pacote ativo.' }
    & (Join-Path $PSScriptRoot 'Test-ContextMenu.ps1') -RequireYtyp
    foreach ($file in @('LICENSE','NOTICE','licenses\Pixelify-Sans-OFL.txt','THIRD_PARTY_NOTICES.md','sbom.cdx.json','build-manifest.json')) { if (!(Test-Path -LiteralPath (Join-Path $installDir $file))) { throw "Inventario ou aviso ausente: $file" } }
    $installedVersion = (Get-Content -LiteralPath (Join-Path $installDir 'package.json') -Raw | ConvertFrom-Json).version
    if (Test-Path -LiteralPath (Join-Path $installDir 'source')) { throw 'Codigo-fonte do projeto incluido no instalador.' }
    if (Get-ChildItem -LiteralPath $installDir -Recurse -File | Where-Object { $_.Extension -in @('.cs','.cpp','.pfx','.p12','.key') -or $_.Name -like 'RPForge-source-*.zip' }) { throw 'Fonte de desenvolvimento ou chave privada incluida no instalador.' }
    $installedLicense = [IO.File]::ReadAllText((Join-Path $installDir 'LICENSE'))
    if (!$installedLicense.Contains('RPForge - Licenca de uso proprietaria')) { throw 'Licenca proprietaria ausente.' }
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
    if ($ElectronDesktop) {
        $previousProject = $env:RPF_DESKTOP_PROJECT; $previousElectron = $env:RPF_ELECTRON_EXECUTABLE
        try {
            $env:RPF_DESKTOP_PROJECT = Join-Path $installDir 'desktop-web'
            $env:RPF_ELECTRON_EXECUTABLE = Join-Path $env:RPF_DESKTOP_PROJECT 'node_modules\electron\dist\electron.exe'
            & node.exe (Join-Path $projectRoot 'desktop-web\scripts\check-desktop.mjs')
            if ($LASTEXITCODE -ne 0) { throw 'Fluxo Electron do instalador falhou.' }
            foreach ($check in @('check-login-gate','check-visual')) {
                & node.exe (Join-Path $projectRoot "desktop-web\scripts\$check.mjs")
                if ($LASTEXITCODE -ne 0) { throw "Validacao instalada falhou: $check" }
            }
            foreach ($check in @(@('check-clothing',$ClothingSpec),@('check-neon',$ClothingSpec),@('check-skin',$SkinSpec))) {
                if (!$check[1]) { continue }
                & node.exe (Join-Path $projectRoot ("desktop-web\scripts\"+$check[0]+'.mjs')) $check[1] (Join-Path $testRoot $check[0])
                if ($LASTEXITCODE -ne 0) { throw "Motor instalado falhou: $($check[0])" }
            }
        } finally { $env:RPF_DESKTOP_PROJECT = $previousProject; $env:RPF_ELECTRON_EXECUTABLE = $previousElectron }
    }
    if (!(Test-Path -LiteralPath $output)) { throw 'Addon nao foi criado.' }
    $process = Start-Process -FilePath (Join-Path $installDir 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'Desinstalacao falhou.' }
    $installed = $false
    foreach ($key in $menuKeys) { if (Test-Path -LiteralPath $key) { throw "Menu permaneceu apos desinstalar: $key" } }
    if ($testModernMenu -and (Get-AppxPackage -Name 'RedHorn.RPFForge.Local')) { throw 'Pacote moderno permaneceu apos desinstalar.' }
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
        if ($originalPackage) { & (Join-Path $projectRoot 'windows\Register-ModernMenu.ps1') -InstallRoot $originalRoot }
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
