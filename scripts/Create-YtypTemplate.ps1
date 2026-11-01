param([Parameter(Mandatory=$true)][string]$LibraryDirectory)
$ErrorActionPreference = 'Stop'
# Development-only schema fixture. No third-party DLL or executable is copied.
$root = Split-Path -Parent $PSScriptRoot
foreach ($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) { [Reflection.Assembly]::LoadFrom((Join-Path $LibraryDirectory $name)) | Out-Null }
$template = New-Object CodeWalker.GameFiles.YtypFile
for ($i=0; $i -lt 256; $i++) { $null = $template.AddArchetype() }
$bytes = $template.Save()
$parsed = New-Object CodeWalker.GameFiles.YtypFile
$parsed.Load($bytes)
$arch = @($parsed.Meta.DataBlocks | Where-Object { $_.StructureNameHash.ToString() -eq 'CBaseArchetypeDef' })
$map = @($parsed.Meta.DataBlocks | Where-Object { $_.StructureNameHash.ToString() -eq 'CMapTypes' })[0]
function Offset($type,$name) { return [int][Runtime.InteropServices.Marshal]::OffsetOf($type,('<'+$name+'>k__BackingField')) }
$archType = [CodeWalker.GameFiles.CBaseArchetypeDef]
$mapType = [CodeWalker.GameFiles.CMapTypes]
$layout = @{}
foreach ($name in @('lodDist','flags','bbMin','bbMax','bsCentre','bsRadius','hdTextureDist','name','textureDictionary','physicsDictionary','assetType','assetName')) { $layout[$name] = Offset $archType $name }
$stride = [Runtime.InteropServices.Marshal].GetMethod('SizeOf', [type[]]@([type])).Invoke($null, @($archType))
$slots = @()
foreach ($block in $arch) { for($at=0; $at -lt $block.DataLength; $at += $stride) { $slots += [int](($block.DataPointer -band 0x0fffffff) + $at) } }
$mapOffset = [int]($map.DataPointer -band 0x0fffffff)
$result = @{ version=1; capacity=256; template=[Convert]::ToBase64String($bytes); stride=$stride; slots=$slots; fields=$layout; map=$mapOffset; mapName=($mapOffset+(Offset $mapType 'name')); array=($mapOffset+(Offset $mapType 'archetypes')) }
if($slots.Count -ne 256) { throw 'Unexpected archetype layout.' }
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'src/ytyp-template.json') -Encoding UTF8
Write-Output 'PASS: generated empty schema template, 256 archetype slots, no game content.'
