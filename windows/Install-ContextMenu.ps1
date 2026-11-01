$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if ([int]((& $nodePath --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Instale Node.js 22 ou superior.' }
$cliPath = Join-Path $projectRoot 'src\cli.js'
if (!(Test-Path -LiteralPath $cliPath -PathType Leaf)) { throw 'CLI nao encontrada.' }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\@xmldom\xmldom'))) { throw 'Execute npm ci antes de instalar o menu.' }
if ($projectRoot.Contains('"') -or $nodePath.Contains('"')) { throw 'Caminho invalido.' }
$menus = @{
    'HKCU:\Software\Classes\Directory\shell\RpfToFiveM' = '%1'
    'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM' = '%V'
}
foreach ($baseKey in $menus.Keys) {
New-Item -Path $baseKey -Force | Out-Null
Set-Item -LiteralPath $baseKey -Value 'Converter RPF para FiveM'
New-ItemProperty -LiteralPath $baseKey -Name 'Icon' -Value "$nodePath,0" -PropertyType String -Force | Out-Null
New-Item -Path "$baseKey\command" -Force | Out-Null
# Launch Node directly: no cmd/PowerShell interpretation of the selected folder.
$command = '"{0}" "{1}" --interactive "{2}"' -f $nodePath, $cliPath, $menus[$baseKey]
Set-Item -LiteralPath "$baseKey\command" -Value $command
}
Write-Host 'Menu instalado para o usuario atual. No Windows 11, procure em Mostrar mais opcoes.'
