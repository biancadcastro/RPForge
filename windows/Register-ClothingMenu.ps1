param([string]$InstallRoot)
$ErrorActionPreference='Stop'
$root=if($InstallRoot){[IO.Path]::GetFullPath($InstallRoot)}else{[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))}
$executable=Join-Path $root 'RPFForge.exe'
if(!(Test-Path -LiteralPath $executable -PathType Leaf) -or $executable.Contains('"')){throw 'Executável do RPForge não encontrado.'}
$key='HKCU:\Software\Classes\SystemFileAssociations\.ydd\shell\RPForgeObj'
New-Item -Path $key -Force | Out-Null
Set-Item -LiteralPath $key -Value 'Roupas para OBJ com RPForge'
New-ItemProperty -LiteralPath $key -Name Icon -Value ('"'+$executable+'",0') -PropertyType String -Force | Out-Null
New-ItemProperty -LiteralPath $key -Name MultiSelectModel -Value 'Single' -PropertyType String -Force | Out-Null
New-Item -Path ($key+'\command') -Force | Out-Null
Set-Item -LiteralPath ($key+'\command') -Value ('"{0}" --obj "%1"' -f $executable)
Write-Output 'Ação Roupas para OBJ registrada para arquivos YDD. Associação de abertura preservada.'
foreach($entry in @(@('Directory','%1'),@('Directory\Background','%V'))){
 $folderKey='HKCU:\Software\Classes\'+$entry[0]+'\shell\RPForgeObj'
 New-Item -Path $folderKey -Force | Out-Null
 Set-Item -LiteralPath $folderKey -Value 'Roupas para OBJ com RPForge'
 New-ItemProperty -LiteralPath $folderKey -Name Icon -Value ('"'+$executable+'",0') -PropertyType String -Force | Out-Null
 New-Item -Path ($folderKey+'\command') -Force | Out-Null
 Set-Item -LiteralPath ($folderKey+'\command') -Value ('"{0}" --obj-folder "{1}"' -f $executable,$entry[1])
}
foreach($entry in @(@('SystemFileAssociations\.ydd','--neon','%1'),@('Directory','--neon-folder','%1'),@('Directory\Background','--neon-folder','%V'))){
 $neonKey='HKCU:\Software\Classes\'+$entry[0]+'\shell\RPForgeNeon'
 New-Item -Path $neonKey -Force | Out-Null
 Set-Item -LiteralPath $neonKey -Value 'Roupas para Neon com RPForge'
 New-ItemProperty -LiteralPath $neonKey -Name Icon -Value ('"'+$executable+'",0') -PropertyType String -Force | Out-Null
 New-ItemProperty -LiteralPath $neonKey -Name MultiSelectModel -Value 'Single' -PropertyType String -Force | Out-Null
 New-Item -Path ($neonKey+'\command') -Force | Out-Null
 Set-Item -LiteralPath ($neonKey+'\command') -Value ('"{0}" {1} "{2}"' -f $executable,$entry[1],$entry[2])
}
foreach($entry in @(@('SystemFileAssociations\.ydd','--skin','%1'),@('Directory','--skin-folder','%1'),@('Directory\Background','--skin-folder','%V'))){
 $key='HKCU:\Software\Classes\'+$entry[0]+'\shell\RPForgeSkin'
 New-Item -Path $key -Force | Out-Null;Set-Item -LiteralPath $key -Value 'Separar pele com RPForge'
 New-ItemProperty -LiteralPath $key -Name Icon -Value ('"'+$executable+'",0') -PropertyType String -Force | Out-Null
 New-ItemProperty -LiteralPath $key -Name MultiSelectModel -Value 'Single' -PropertyType String -Force | Out-Null
 New-Item -Path ($key+'\command') -Force | Out-Null;Set-Item -LiteralPath ($key+'\command') -Value ('"{0}" {1} "{2}"' -f $executable,$entry[1],$entry[2])
}
foreach($entry in @(@('RPForgeObj','{3C9EE5A7-895C-46E2-931B-13A51EA7A842}',1),@('RPForgeNeon','{86A7BF51-2C9E-4B80-94F2-8920FB8F4299}',2),@('RPForgeSkin','{B91E247D-60A8-4CE3-99B7-F3D44D1EAD50}',4))){
 foreach($suffix in @('SystemFileAssociations\.ydd','Directory','Directory\Background')){
  $key='HKCU:\Software\Classes\'+$suffix+'\shell\'+$entry[0]
  if(!(Test-Path -LiteralPath $key)){continue}
  New-ItemProperty -LiteralPath $key -Name CommandStateHandler -Value $entry[1] -PropertyType String -Force | Out-Null
  $access=Get-ItemProperty -LiteralPath 'HKCU:\Software\RPForge\ToolAccess' -ErrorAction SilentlyContinue
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  if($access.InstallRoot -eq $root -and $access.ExpiresAt -gt $now -and $access.ExpiresAt -le ($now+72*3600) -and ($access.Mask -band $entry[2])){Remove-ItemProperty -LiteralPath $key -Name LegacyDisable -ErrorAction SilentlyContinue}else{New-ItemProperty -LiteralPath $key -Name LegacyDisable -Value '' -PropertyType String -Force | Out-Null}
 }
}
