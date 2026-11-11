$ErrorActionPreference = 'Stop'
$ownerRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
foreach ($menuKey in @('HKCU:\Software\Classes\Directory\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM', 'HKCU:\Software\Classes\Directory\shell\RPForgeYtyp', 'HKCU:\Software\Classes\Directory\Background\shell\RPForgeYtyp', 'HKCU:\Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj', 'HKCU:\Software\Classes\Directory\shell\RPForgeObj', 'HKCU:\Software\Classes\Directory\Background\shell\RPForgeObj')) {
if (Test-Path -LiteralPath $menuKey) {
    $commandKey = Get-Item -LiteralPath "$menuKey\command" -ErrorAction SilentlyContinue
    if ($commandKey -and $commandKey.GetValue('').IndexOf(('"' + $ownerRoot + '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0) { Remove-Item -LiteralPath $menuKey -Recurse -Force }
}
}
foreach($entry in @('RPForgeNeon','RPForgeSkin')) { foreach($suffix in @('SystemFileAssociations\.ydd','Directory','Directory\Background')) {
 $key='HKCU:\Software\Classes\'+$suffix+'\shell\'+$entry
 $commandKey=Get-Item -LiteralPath ($key+'\command') -ErrorAction SilentlyContinue
 if($commandKey -and $commandKey.GetValue('').IndexOf(('"'+$ownerRoot+'\'),[StringComparison]::OrdinalIgnoreCase) -ge 0){Remove-Item -LiteralPath $key -Recurse -Force}
}
}
Write-Host 'Entradas desta cópia do RPForge removidas; outras instalações preservadas.'
