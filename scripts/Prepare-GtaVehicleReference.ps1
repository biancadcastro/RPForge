param([Parameter(Mandatory=$true)][string]$GamePath, [Parameter(Mandatory=$true)][string]$CodeWalkerPath, [Parameter(Mandatory=$true)][string]$Destination, [ValidatePattern('^[a-z0-9_]+$')][string]$Model = 'feltzer2')
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Destination) { throw 'O destino da referência já existe.' }
[Reflection.Assembly]::LoadFrom((Join-Path $CodeWalkerPath 'CodeWalker.Core.dll')) | Out-Null
[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($GamePath)
$archive = [CodeWalker.GameFiles.RpfFile]::new((Join-Path $GamePath 'x64e.rpf'), 'x64e.rpf')
$errors = [Collections.Generic.List[string]]::new()
$archive.ScanStructure([Action[string]]{param($message)}, [Action[string]]{param($message) $errors.Add($message)})
if ($archive.LastError) { throw $archive.LastError }
function Find-Entry($rpf, $name) {
    foreach ($entry in $rpf.AllEntries) { if ($entry.Name -eq $name) { return $entry } }
    foreach ($child in $rpf.Children) { $found = Find-Entry $child $name; if ($found) { return $found } }
}
$entry = Find-Entry $archive "$Model.yft"
if (-not $entry) { throw 'Veículo de referência não encontrado no GTA instalado.' }
[IO.Directory]::CreateDirectory($Destination) | Out-Null
$data = $entry.File.ExtractFile($entry)
if (-not $data) { throw 'Não foi possível ler a referência do GTA.' }
$yft = [CodeWalker.GameFiles.YftFile]::new()
$yft.Load($data, $entry)
[IO.File]::WriteAllBytes((Join-Path $Destination "$Model.yft"), $yft.Save())
Write-Output "Referência local preparada: $Model.yft. Nenhum arquivo do GTA foi alterado."
