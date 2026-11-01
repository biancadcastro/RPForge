param([string]$ExecutablePath, [string]$Destination)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (!$ExecutablePath) { $ExecutablePath = Join-Path $root '.tools\desktop\RPFForge.exe' }
if (!$Destination) { $Destination = Join-Path $root '.tools\desktop\visual-checks' }
$Destination = [IO.Path]::GetFullPath($Destination)
$allowed = [IO.Path]::GetFullPath((Join-Path $root '.tools')) + [IO.Path]::DirectorySeparatorChar
if (!$Destination.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'As imagens de teste devem ficar em .tools.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$process = Start-Process -FilePath $ExecutablePath -ArgumentList @('--render-suite', "`"$Destination`"") -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Falha ao renderizar os estados da interface.' }
$screens = @('01-inicio','02-veiculos','03-destinos','04-previa','06-compacto','07-ajuda','08-erro','09-resultado','10-ajuda-final')
foreach ($name in $screens) {
    $image = Join-Path $Destination ($name + '.png')
    if (!(Test-Path -LiteralPath $image) -or (Get-Item -LiteralPath $image).Length -lt 1000) { throw "Imagem ausente ou invalida: $name" }
}
Write-Host "PASS: $($screens.Count) estados renderizados para revisao visual em $Destination."
