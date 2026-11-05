param([Parameter(Mandatory=$true)][string]$GamePath, [Parameter(Mandatory=$true)][string]$CodeWalkerPath, [Parameter(Mandatory=$true)][string]$Destination, [ValidatePattern('^[a-z0-9_]+$')][string]$Model = 'feltzer2', [ValidatePattern('^[a-z][a-z0-9_]{0,31}$')][string]$Spawn = 'rpamggtsc')
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Destination) { throw 'O destino dos metas já existe.' }
[Reflection.Assembly]::LoadFrom((Join-Path $CodeWalkerPath 'CodeWalker.Core.dll')) | Out-Null
[CodeWalker.GameFiles.GTA5Keys]::LoadFromPath($GamePath)
$archive = [CodeWalker.GameFiles.RpfFile]::new((Join-Path $GamePath 'common.rpf'), 'common.rpf')
$archive.ScanStructure([Action[string]]{param($message)}, [Action[string]]{param($message)})
if ($archive.LastError) { throw $archive.LastError }
function Read-Meta($name) {
    $entry = $archive.AllEntries | Where-Object Name -eq $name | Select-Object -First 1
    if (-not $entry) { throw "Meta não encontrado no GTA instalado: $name" }
    $text = [Text.Encoding]::UTF8.GetString($entry.File.ExtractFile($entry)).Trim([char]0)
    $settings = [Xml.XmlReaderSettings]::new(); $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit; $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create([IO.StringReader]::new($text), $settings)
    try { $doc = [Xml.XmlDocument]::new(); $doc.XmlResolver = $null; $doc.Load($reader); return ,$doc } finally { $reader.Dispose() }
}
$vehicles = Read-Meta 'vehicles.meta'
$vehicle = $vehicles.SelectSingleNode("//InitDatas/Item[modelName='$Model']")
if (-not $vehicle) { throw 'Configuração do veículo de referência não encontrada.' }
$handlingName = $vehicle.handlingId
$handling = Read-Meta 'handling.meta'
$item = $handling.SelectSingleNode("//HandlingData/Item[handlingName='$handlingName']")
if (-not $item) { throw 'Handling de referência não encontrado.' }
$vehicle.modelName = $Spawn; $vehicle.txdName = $Spawn; $vehicle.handlingId = $Spawn.ToUpperInvariant()
$vehicle.gameName = 'RPAMGSC'; $vehicle.vehicleMakeName = 'MERCEDES'
$item.handlingName = $Spawn.ToUpperInvariant(); $item.fMass.SetAttribute('value', '1630.000000'); $item.nInitialDriveGears.SetAttribute('value', '7')
[IO.Directory]::CreateDirectory($Destination) | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $Destination 'vehicles.meta'), ('<?xml version="1.0" encoding="UTF-8"?><CVehicleModelInfo__InitDataList><residentTxd>vehshare</residentTxd><residentAnims /><InitDatas>' + $vehicle.OuterXml + '</InitDatas><txdRelationships><Item><parent>vehshare</parent><child>' + $Spawn + '</child></Item></txdRelationships></CVehicleModelInfo__InitDataList>'), $utf8)
[IO.File]::WriteAllText((Join-Path $Destination 'handling.meta'), ('<?xml version="1.0" encoding="UTF-8"?><CHandlingDataMgr><HandlingData>' + $item.OuterXml + '</HandlingData></CHandlingDataMgr>'), $utf8)
Write-Output 'Metas locais preparados; handling provisório de referência com massa e câmbio ajustados.'
