param([switch]$Unregister)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSHOME 'Modules\Appx\Appx.psd1') -ErrorAction Stop
if ($Unregister) {
    $owner = Get-ItemPropertyValue -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner' -ErrorAction SilentlyContinue
    if ($owner -and $owner -ne $root) { Write-Host 'Menu de outra instalacao preservado.'; return }
    Get-AppxPackage -Name 'RedHorn.RPFForge.Local' | Remove-AppxPackage -ErrorAction Stop
    if ($owner -eq $root) { Remove-ItemProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner' }
} else {
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
    $package = Join-Path $root 'shell\RPFForge.identity.msix'
    if (Get-Process -Name RPFForge -ErrorAction SilentlyContinue) {
        Add-AppxPackage -Path $package -ExternalLocation $root -DeferRegistrationWhenPackagesAreInUse -ErrorAction Stop
        Write-Host 'Atualizacao do menu agendada; a janela RPForge aberta foi preservada.'
    } else {
        # Release only this package's headless COM host, never Explorer or another app.
        Add-AppxPackage -Path $package -ExternalLocation $root -ForceTargetApplicationShutdown -ErrorAction Stop
    }
    $registered = Get-AppxPackage -Name 'RedHorn.RPFForge.Local'
    if (!$registered -or $registered.Status -ne 'Ok') { throw 'Identidade do menu moderno nao ficou ativa.' }
    New-Item -Path 'HKCU:\Software\RPForge' -Force | Out-Null
    New-ItemProperty -LiteralPath 'HKCU:\Software\RPForge' -Name 'MenuOwner' -Value $root -PropertyType String -Force | Out-Null
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ForgeRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2); }'
[ForgeRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
