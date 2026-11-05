param([switch]$Unregister, [string]$InstallRoot)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'ModernMenu-Lifecycle.ps1')
if ($InstallRoot) { $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\') }
$package = Join-Path $root 'shell\RPFForge.identity.msix'
$identity = Get-ForgeMenuIdentity $package
$ownersKey = 'HKCU:\Software\RPForge\MenuOwners'
Import-Module (Join-Path $PSHOME 'Modules\Appx\Appx.psd1') -ErrorAction Stop
if ($Unregister) {
    $owner = Get-ForgeOptionalMenuProperty -LiteralPath $ownersKey -Name $identity
    if (!$owner -and $identity -eq 'RedHorn.RPFForge.Local') { $owner = Get-ForgeOptionalMenuProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner' }
    if (!(Test-ForgeMenuOwnership $owner $root)) { Write-Host 'Identidade sem propriedade desta copia preservada.'; return }
    Get-AppxPackage -Name $identity | Remove-AppxPackage -ErrorAction Stop
    Remove-ItemProperty -LiteralPath $ownersKey -Name $identity -ErrorAction SilentlyContinue
    $currentOwner = Get-ForgeOptionalMenuProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner'
    $currentIdentity = Get-ForgeOptionalMenuProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuPackage'
    if ($currentOwner -eq $root -and (!$currentIdentity -or $currentIdentity -eq $identity)) { Remove-ItemProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner' }
} else {
    $profileMigration = Join-Path $root 'desktop-web\electron\prepare-profile.mjs'
    $profileNode = Join-Path $root 'runtime\node.exe'
    if ((Test-Path -LiteralPath $profileMigration) -and (Test-Path -LiteralPath $profileNode)) {
        & $profileNode $profileMigration
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o perfil compartilhado. Registro interrompido.' }
    }
    # Sparse-package logos and PRI resources are resolved from ExternalLocation.
    $sourceAssets = Join-Path $root 'shell\Assets'
    if (Test-Path -LiteralPath $sourceAssets) {
        $targetAssets = Join-Path $root 'Assets'
        New-Item -ItemType Directory -Path $targetAssets -Force | Out-Null
        Copy-Item -Path (Join-Path $sourceAssets '*.png') -Destination $targetAssets -Force
    }
    $sourcePri = Join-Path $root 'shell\resources.pri'
    if (Test-Path -LiteralPath $sourcePri) { Copy-Item -LiteralPath $sourcePri -Destination (Join-Path $root 'resources.pri') -Force }
    if (!(Test-Path -LiteralPath (Join-Path $root 'Assets\MenuLogo.png')) -or !(Test-Path -LiteralPath (Join-Path $root 'resources.pri'))) { throw 'Recursos visuais externos do menu ausentes; registro interrompido para preservar a instalacao.' }
    $oldOwner = Get-ForgeOptionalMenuProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner'
    $oldIdentity = Get-ForgeOptionalMenuProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuPackage'
    if ($identity -eq 'RedHorn.RPFForge' -and (Get-Process -Name RPFForge -ErrorAction SilentlyContinue)) { throw 'Feche o RPForge antes de migrar a identidade do menu. Nenhuma janela foi encerrada.' }
    Invoke-ForgeMenuTransition -Identity $identity -Root $root -Register {
      $existing = Get-AppxPackage -Name $identity
      $previousOwner = Get-ForgeOptionalMenuProperty -LiteralPath $ownersKey -Name $identity
      if (!$previousOwner -and (!$oldIdentity -or $oldIdentity -eq $identity)) { $previousOwner = $oldOwner }
      if ($existing -and $previousOwner -and !(Test-ForgeMenuOwnership $previousOwner $root)) {
        if (Get-Process -Name RPFForge -ErrorAction SilentlyContinue) { throw 'Feche o RPForge antes de trocar a localizacao do menu; nenhuma janela foi encerrada.' }
        $previousPackage = Join-Path $previousOwner 'shell\RPFForge.identity.msix'
        if (!(Test-Path -LiteralPath $previousPackage -PathType Leaf) -or (Get-ForgeMenuIdentity $previousPackage) -ne $identity) { throw 'Pacote anterior nao disponivel para restauracao; menu preservado.' }
        # Windows rejects the same package identity/version at a new ExternalLocation.
        # Only its registration is removed; files remain, and failure restores it.
        Invoke-ForgeMenuLocationChange -RemovePrevious { $existing | Remove-AppxPackage -ErrorAction Stop } -RegisterNew {
            Add-AppxPackage -Path $package -ExternalLocation $root -ErrorAction Stop
            $active = Get-AppxPackage -Name $identity
            if (!$active -or $active.Status -ne 'Ok') { throw 'Menu novo nao confirmado.' }
        } -RestorePrevious {
            Get-AppxPackage -Name $identity | Remove-AppxPackage -ErrorAction Stop
            Add-AppxPackage -Path $previousPackage -ExternalLocation $previousOwner -ErrorAction Stop
        }
      } elseif (Get-Process -Name RPFForge -ErrorAction SilentlyContinue) {
        Add-AppxPackage -Path $package -ExternalLocation $root -DeferRegistrationWhenPackagesAreInUse -ErrorAction Stop
        Write-Host 'Atualizacao do menu agendada; a janela RPForge aberta foi preservada.'
      } else {
        # Release only this package's headless COM host, never Explorer or another app.
        Add-AppxPackage -Path $package -ExternalLocation $root -ForceTargetApplicationShutdown -ErrorAction Stop
      }
    } -FindPackage { param($name) Get-AppxPackage -Name $name } -ReadOwner {
        param($name)
        $saved = Get-ForgeOptionalMenuProperty -LiteralPath $ownersKey -Name $name
        if ($saved) { return $saved }
        if ($name -eq 'RedHorn.RPFForge.Local' -and (!$oldIdentity -or $oldIdentity -eq $name)) { return $oldOwner }
    } -SaveOwner {
        param($name,$location)
        New-Item -Path $ownersKey -Force | Out-Null
        # Preserve legacy ownership for a safe retry if its removal later fails.
        if ($name -eq 'RedHorn.RPFForge' -and $oldOwner -and (!$oldIdentity -or $oldIdentity -eq 'RedHorn.RPFForge.Local')) {
            New-ItemProperty -LiteralPath $ownersKey -Name 'RedHorn.RPFForge.Local' -Value $oldOwner -PropertyType String -Force | Out-Null
        }
        New-ItemProperty -LiteralPath $ownersKey -Name $name -Value $location -PropertyType String -Force | Out-Null
        New-ItemProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner' -Value $location -PropertyType String -Force | Out-Null
        New-ItemProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuPackage' -Value $name -PropertyType String -Force | Out-Null
    } -RemovePackage { param($oldPackage) $oldPackage | Remove-AppxPackage -ErrorAction Stop }
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ForgeRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2); }'
[ForgeRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
