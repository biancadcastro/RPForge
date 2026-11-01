param([switch]$RequireYtyp)
$ErrorActionPreference = 'Stop'
$menus = @{
    'HKCU:\Software\Classes\Directory\shell\RpfToFiveM' = '%1'
    'HKCU:\Software\Classes\Directory\Background\shell\RpfToFiveM' = '%V'
}
foreach ($keyPath in $menus.Keys) {
    $label = (Get-Item -LiteralPath $keyPath).GetValue('')
    if ($label -ne 'Converter com RPForge') { throw "Rotulo incorreto: $keyPath" }
    $command = (Get-Item -LiteralPath "$keyPath\command").GetValue('')
    if ($command -notmatch '^"([^"]+)" "([^"]+)" --interactive "(%1|%V)"$') { throw "Comando invalido: $keyPath" }
    if ($Matches[3] -ne $menus[$keyPath]) { throw "Argumento de pasta incorreto: $keyPath" }
    if (!(Test-Path -LiteralPath $Matches[1] -PathType Leaf) -or !(Test-Path -LiteralPath $Matches[2] -PathType Leaf)) { throw 'Executavel ou CLI ausente.' }
    $generatorKey = $keyPath.Replace('RpfToFiveM', 'RPForgeYtyp')
    if ($RequireYtyp -or (Test-Path -LiteralPath $generatorKey)) {
        $generator = Get-Item -LiteralPath $generatorKey
        if ($generator.GetValue('') -ne 'Gerar YTYP com RPForge') { throw "Rotulo YTYP incorreto: $generatorKey" }
        $generatorCommand = (Get-Item -LiteralPath "$generatorKey\command").GetValue('')
        if ($generatorCommand -notmatch '^"([^"]+)" --ytyp "(%1|%V)"$') { throw "Comando YTYP invalido: $generatorKey" }
        if ($Matches[2] -ne $menus[$keyPath] -or !(Test-Path -LiteralPath $Matches[1] -PathType Leaf)) { throw "Destino YTYP invalido: $generatorKey" }
    }
}
Write-Host 'PASS: menu sobre a pasta (%1) e dentro da pasta (%V), com caminhos validos.'
