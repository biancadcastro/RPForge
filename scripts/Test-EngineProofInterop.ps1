param([Parameter(Mandatory=$true)][string]$FixtureDirectory,[Parameter(Mandatory=$true)][string]$LibraryDirectory)
# Offline development oracle only. The new runtime codec never loads these DLLs.
# Run with Windows PowerShell 5.1 (powershell.exe): CodeWalker.Core targets .NET Framework.
$ErrorActionPreference='Stop'
$libRoot=[IO.Path]::GetFullPath($LibraryDirectory)
foreach($n in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')){[Reflection.Assembly]::LoadFrom((Join-Path $libRoot $n)) | Out-Null}
$fixtureRoot=[IO.Path]::GetFullPath($FixtureDirectory)
$manifest=Get-Content -LiteralPath (Join-Path $fixtureRoot 'manifest.json') -Raw | ConvertFrom-Json
function Get-Sha256([byte[]]$bytes){$h=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($h.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Assert-That([bool]$condition,[string]$message){if(-not $condition){throw $message}}
$tolerance=0.00001
$results=@()
foreach($case in $manifest){
 $row=[ordered]@{file=$case.file;type=$case.type;inputSha256=$null;inputBytes=$null;independentRead='failed';oracleSave='not attempted';oracleFile=$null;oracleSha256=$null;oracleBytes=$null;gameValidation='not performed';error=$null}
 try{
  Assert-That ([IO.Path]::GetFileName($case.file) -eq $case.file) 'Unsafe fixture name'
  $data=[IO.File]::ReadAllBytes((Join-Path $fixtureRoot $case.file))
  $row.inputSha256=Get-Sha256 $data; $row.inputBytes=$data.Length
  if($case.type -eq 'ydd'){
   $file=New-Object CodeWalker.GameFiles.YddFile; $file.Load($data)
   Assert-That (-not $file.LoadException) ("LoadException: "+$file.LoadException)
   Assert-That ($file.DrawableDict.Drawables.data_items.Length -eq 1) 'Wrong drawable count'
   $draw=$file.DrawableDict.Drawables.data_items[0]
   Assert-That (-not $draw.ErrorMessage) ("Drawable error: "+$draw.ErrorMessage)
   Assert-That ($draw.Name -eq $case.model.name) 'Name differs'
   Assert-That ($draw.DrawableModels.High.Length -eq 1) 'High LOD model count differs'
   Assert-That ($draw.DrawableModels.High[0].Geometries.Length -eq 1) 'Geometry count differs'
   $geom=$draw.DrawableModels.High[0].Geometries[0]
   $vc=$case.model.positions.Count / 3
   Assert-That ($geom.VertexData.VertexCount -eq $vc) 'Vertex count differs'
   Assert-That ($geom.IndexBuffer.Indices.Count -eq $case.model.indices.Count) 'Index count differs'
   for($i=0;$i -lt $vc;$i++){
     $p=$geom.VertexData.GetVector3($i,0)
     Assert-That ([Math]::Abs($p.X-$case.model.positions[$i*3]) -le $tolerance -and [Math]::Abs($p.Y-$case.model.positions[$i*3+1]) -le $tolerance -and [Math]::Abs($p.Z-$case.model.positions[$i*3+2]) -le $tolerance) "Position differs at vertex $i"
   }
   for($i=0;$i -lt $case.model.indices.Count;$i++){Assert-That ($geom.IndexBuffer.Indices[$i] -eq $case.model.indices[$i]) "Index differs at $i"}
   $row.vertices=$geom.VertexData.VertexCount; $row.triangles=$geom.IndexBuffer.Indices.Count/3
  }elseif($case.type -eq 'ycd'){
   # Avoid PowerShell generic-method marshaling (PSObject -> YcdFile): build the entry, decompress, call Load directly.
   $raw=[byte[]]$data.Clone()
   $entry=[CodeWalker.GameFiles.RpfFile]::CreateResourceFileEntry([ref]$raw,[uint32]46)
   $plain=[CodeWalker.GameFiles.ResourceBuilder]::Decompress($raw)
   $file=New-Object CodeWalker.GameFiles.YcdFile
   $file.Load($plain,$entry)
   Assert-That (-not $file.LoadException) ("LoadException: "+$file.LoadException)
   Assert-That ($file.ClipMap.Count -eq 1 -and $file.AnimMap.Count -eq 1) 'Wrong clip/animation count'
   $clip=@($file.ClipMap.Values)[0].Clip; $anim=$clip.Animation
   Assert-That ($null -ne $anim) 'Clip has no animation'
   Assert-That ([object]::ReferenceEquals(@($file.AnimMap.Values)[0].Animation,$anim)) 'Clip/animation map reference differs'
   Assert-That ($clip.ShortName -eq $case.model.name) 'Clip name differs'
   $frames=$case.model.translations.Count/3
   Assert-That ($anim.Frames -eq $frames) 'Frame count differs'
   Assert-That ([Math]::Abs($anim.Duration-($frames-1)/$case.model.fps) -le $tolerance) 'Duration differs'
   Assert-That ($anim.BoneIds.data_items.Length -eq 1) 'Bone id count differs'
   Assert-That ($anim.BoneIds.data_items[0].BoneId -eq 0 -and $anim.BoneIds.data_items[0].Track -eq 0) 'Bone/track differs'
   Assert-That ($anim.Sequences.data_items.Length -eq 1) 'Sequence block count differs'
   $track=$anim.Sequences.data_items[0].Sequences[0]
   Assert-That ($track.Channels.Length -eq 3) 'Channel count differs'
   for($i=0;$i -lt $frames;$i++){for($axis=0;$axis -lt 3;$axis++){
      $value=$track.Channels[$axis].EvaluateFloat($i)
      Assert-That ([Math]::Abs($value-$case.model.translations[$i*3+$axis]) -le $tolerance) "Motion sample differs at frame $i axis $axis"
   }}
   $row.frames=$anim.Frames; $row.duration=$anim.Duration; $row.channelType=$track.Channels[0].GetType().Name
  }else{throw 'Unsupported fixture type'}
  $row.independentRead='passed'
  $row.oracleSave='failed'
  $saved=$file.Save()
  Assert-That ($null -ne $saved -and $saved.Length -gt 16) 'Oracle Save returned no data'
  $oracleName='oracle-'+$case.file
  [IO.File]::WriteAllBytes((Join-Path $fixtureRoot $oracleName),$saved)
  $row.oracleSave='passed'; $row.oracleFile=$oracleName; $row.oracleSha256=Get-Sha256 $saved; $row.oracleBytes=$saved.Length
 }catch{
  $row.error=$_.Exception.Message
 }
 $results += [pscustomobject]$row
}
$asm=[AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq 'CodeWalker.Core' }
$report=[ordered]@{
 generatedAt=(Get-Date).ToString('o')
 oracle=[ordered]@{assembly='CodeWalker.Core';version=$asm.GetName().Version.ToString();sha256=(Get-Sha256 ([IO.File]::ReadAllBytes($asm.Location)));runtime=$PSVersionTable.CLRVersion.ToString();powershell=$PSVersionTable.PSVersion.ToString();role='offline development oracle; not a runtime dependency'}
 tolerance=$tolerance
 results=$results
}
$json=$report | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'interop.json'),$json)
Write-Output $json
if(@($results | Where-Object { $_.independentRead -ne 'passed' -or $_.oracleSave -ne 'passed' }).Count -gt 0){exit 1}
exit 0
