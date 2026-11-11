$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if ([int]((& $nodePath --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Instale Node.js 22 ou superior.' }
$cliPath = Join-Path $projectRoot 'src\cli.js'
if (!(Test-Path -LiteralPath $cliPath -PathType Leaf)) { throw 'CLI não encontrada.' }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\@xmldom\xmldom'))) { throw 'Execute npm ci antes de instalar o menu.' }
if ($projectRoot.Contains('"') -or $nodePath.Contains('"')) { throw 'Caminho inválido.' }
$menus = @{
    'HKCU:\Software\Classes\Directory\shell\RpfToFiveM' = '%1'
    'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM' = '%V'
}
foreach ($baseKey in $menus.Keys) {
New-Item -Path $baseKey -Force | Out-Null
Set-Item -LiteralPath $baseKey -Value 'Converter RPFs com RPForge'
New-ItemProperty -LiteralPath $baseKey -Name 'Icon' -Value "$(Join-Path $projectRoot 'desktop\assets\rpforge.ico'),0" -PropertyType String -Force | Out-Null
New-Item -Path "$baseKey\command" -Force | Out-Null
# Launch Node directly: no cmd/PowerShell interpretation of the selected folder.
$command = '"{0}" "{1}" --interactive "{2}"' -f $nodePath, $cliPath, $menus[$baseKey]
Set-Item -LiteralPath "$baseKey\command" -Value $command
}
$desktop = Join-Path $projectRoot 'RPFForge.exe'
if (!(Test-Path -LiteralPath $desktop)) { $desktop = Join-Path $projectRoot '.tools\desktop\RPFForge.exe' }
if (Test-Path -LiteralPath $desktop) {
    foreach ($baseKey in $menus.Keys) {
        $generatorKey = $baseKey.Replace('RpfToFiveM', 'RPForgeYtyp')
        New-Item -Path $generatorKey -Force | Out-Null
        Set-Item -LiteralPath $generatorKey -Value 'Gerar YTYP com RPForge'
        New-ItemProperty -LiteralPath $generatorKey -Name Icon -Value "$desktop,0" -PropertyType String -Force | Out-Null
        New-Item -Path "$generatorKey\command" -Force | Out-Null
        Set-Item -LiteralPath "$generatorKey\command" -Value ('"{0}" --ytyp "{1}"' -f $desktop, $menus[$baseKey])
    }
}
Write-Host 'Menu instalado para o usuário atual. No Windows 11, procure em Mostrar mais opções.'
if (Test-Path -LiteralPath $desktop) { & (Join-Path $PSScriptRoot 'Register-ClothingMenu.ps1') -InstallRoot $projectRoot }
