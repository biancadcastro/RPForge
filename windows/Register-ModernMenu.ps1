param([switch]$Unregister)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $PSHOME 'Modules\Appx\Appx.psd1') -ErrorAction Stop
if ($Unregister) {
    Get-AppxPackage -Name 'RedHorn.RPFForge.Local' | Remove-AppxPackage -ErrorAction Stop
} else {
    $package = Join-Path $root 'shell\RPFForge.identity.msix'
    Add-AppxPackage -Path $package -ExternalLocation $root -ErrorAction Stop
    $registered = Get-AppxPackage -Name 'RedHorn.RPFForge.Local'
    if (!$registered -or $registered.Status -ne 'Ok') { throw 'Identidade do menu moderno nao ficou ativa.' }
}
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ForgeRefresh { [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2); }'
[ForgeRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
