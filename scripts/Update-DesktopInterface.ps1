# Update desktop code/assets without duplicating the unchanged Electron runtime.
param([switch]$WithClothingEngine)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$installed=Join-Path $env:LOCALAPPDATA 'Programs\RPForge\desktop-web'
$source=Join-Path $root 'desktop-web'
foreach($required in @((Join-Path $installed 'node_modules\electron\dist\electron.exe'),(Join-Path $source 'out\index.html'),(Join-Path $source 'electron\main.mjs'))){if(!(Test-Path -LiteralPath $required -PathType Leaf)){throw 'Interface compilada ou instalacao existente nao encontrada.'}}
if((Get-Item -LiteralPath $installed).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Desktop instalado redirecionado.'}
$active=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($installed+'\',[StringComparison]::OrdinalIgnoreCase)})
if($active.Count){throw 'Feche o RPForge antes de atualizar a interface.'}
& node (Join-Path $source 'electron\prepare-profile.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o perfil compartilhado.' }
$id=[guid]::NewGuid().ToString('N')
$backup=Join-Path $env:LOCALAPPDATA ('RPForge-DevelopmentBackups\interface-'+$id)
$stage=Join-Path $env:LOCALAPPDATA ('Temp\rpforge-interface-'+$id)
New-Item -ItemType Directory -Path $backup,$stage -Force | Out-Null
$saved=@();$applied=@()
$targets=@(@{name='electron';source=(Join-Path $source 'electron');target=(Join-Path $installed 'electron')},@{name='out';source=(Join-Path $source 'out');target=(Join-Path $installed 'out')})
if($WithClothingEngine){
 $engine=Join-Path $root '.tools\clothing-engine'
 $manifest=Get-Content -LiteralPath (Join-Path $engine 'manifest.json') -Raw | ConvertFrom-Json
 foreach($name in @('ClothingDecoder.exe','ClothingNeon.exe','ClothingSkin.exe','CodeWalker.Core.dll','SharpDX.Mathematics.dll','SharpDX.dll','skin-triangles.json')){
  $record=$manifest.files | Where-Object name -EQ $name
  if(!$record -or (Get-FileHash -LiteralPath (Join-Path $engine $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $record.sha256){throw "Motor divergente: $name"}
 }
 $installRoot=Split-Path -Parent $installed
 $targets+=@{name='src';source=(Join-Path $root 'src');target=(Join-Path $installRoot 'src')}
 $targets+=@{name='clothing-engine';source=$engine;target=(Join-Path $installRoot 'engines\clothing')}
}
try{
 foreach($entry in $targets){Copy-Item -LiteralPath $entry.source -Destination (Join-Path $stage $entry.name) -Recurse}
 foreach($entry in $targets){
  $name=$entry.name;$current=$entry.target
  if((Get-Item -LiteralPath $current).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Diretorio instalado redirecionado.'}
  Move-Item -LiteralPath $current -Destination (Join-Path $backup $name);$saved+=$entry
  Move-Item -LiteralPath (Join-Path $stage $name) -Destination $current;$applied+=$entry
 }
 Write-Output ('Interface atualizada. Runtime e conta preservados. Backup: '+$backup)
}catch{
 foreach($entry in $applied){Move-Item -LiteralPath $entry.target -Destination (Join-Path $stage ($entry.name+'-failed'))}
 foreach($entry in $saved){Move-Item -LiteralPath (Join-Path $backup $entry.name) -Destination $entry.target}
 throw
}
