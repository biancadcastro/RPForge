$ErrorActionPreference = 'Stop'
$ownerRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
foreach ($menuKey in @('HKCU:\Software\Classes\Directory\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\shell\RPForgeYtyp', 'HKCU:\Software\Classes\Directory\Background\shell\RPForgeYtyp')) {
if (Test-Path -LiteralPath $menuKey) {
    $commandKey = Get-Item -LiteralPath "$menuKey\command" -ErrorAction SilentlyContinue
    if ($commandKey -and $commandKey.GetValue('').IndexOf(('"' + $ownerRoot + '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0) { Remove-Item -LiteralPath $menuKey -Recurse -Force }
}
}
Write-Host 'Entradas desta copia do RPForge removidas; outras instalacoes preservadas.'
