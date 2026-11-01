$ErrorActionPreference = 'Stop'
$menuKey = 'HKCU:\Software\Classes\Directory\shell\RpfToFiveM'
if (Test-Path -LiteralPath $menuKey) { Remove-Item -LiteralPath $menuKey -Recurse -Force }
Write-Host 'Menu RPF to FiveM removido.'
