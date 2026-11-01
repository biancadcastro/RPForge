param([Parameter(Mandatory=$true)][string]$Publisher, [Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
if ($Publisher -notmatch '^CN=' -or $Publisher -match 'Local Test|__|OID\.2\.25\.311729368913984317654407730594956997722') { throw 'Informe o Subject exato aprovado para distribuicao; certificado de teste ou placeholder recusado.' }
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:-[a-zA-Z0-9.-]+)?$') { throw 'Versao invalida.' }
$numericVersion = "$($Matches[1]).$($Matches[2]).$($Matches[3]).0"
$Destination = [IO.Path]::GetFullPath($Destination)
if (!$Destination.StartsWith((Join-Path $root '.tools') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest de preparacao deve ficar em .tools.' }
if (Test-Path -LiteralPath $Destination) { throw 'Destino ja existe; nao sobrescrever identidade.' }
[xml]$manifest = Get-Content -LiteralPath (Join-Path $root 'signpath\identity.template.xml') -Raw
$manifest.Package.Identity.Publisher = $Publisher
$manifest.Package.Identity.Version = $numericVersion
New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
$manifest.Save($Destination)
Write-Host 'Manifest preparado. Nenhum MSIX, instalador, registro ou certificado foi criado.'
