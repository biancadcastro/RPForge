$ErrorActionPreference = 'Stop'
foreach ($menuKey in @('HKCU:\Software\Classes\Directory\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\shell\RPForgeYtyp', 'HKCU:\Software\Classes\Directory\Background\shell\RPForgeYtyp')) {
if (Test-Path -LiteralPath $menuKey) { Remove-Item -LiteralPath $menuKey -Recurse -Force }
}
Write-Host 'Menu RPF to FiveM removido.'
