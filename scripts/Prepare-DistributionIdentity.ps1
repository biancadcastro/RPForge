param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
$config = Get-Content -LiteralPath (Join-Path $root 'signpath\project.json') -Raw | ConvertFrom-Json
if (!$config.approvedByFoundation -or !$config.enabled -or !$config.publisherSubject -or $config.publisherSubject -match 'Local Test|__' -or $config.publisherSubject -notmatch '^CN=') {
    throw 'Publisher publico ainda nao aprovado. Aguarde o Subject exato do certificado; nenhum certificado de teste sera criado.'
}
$context = Get-ForgeBuildContext $root
$Destination = [IO.Path]::GetFullPath($Destination)
$allowed = (Join-Path $root '.tools') + [IO.Path]::DirectorySeparatorChar
if (!$Destination.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $Destination)) { throw 'Use um destino novo dentro de .tools.' }
[xml]$manifest = Get-Content -LiteralPath (Join-Path $root 'signpath\identity.template.xml') -Raw
$identity = $manifest.Package.Identity
$identity.SetAttribute('Publisher', [string]$config.publisherSubject)
$identity.SetAttribute('Version', $context.Version)
if ($identity.Name -ne 'RedHorn.RPFForge' -or $identity.ProcessorArchitecture -ne 'x64') { throw 'Identidade inesperada no template.' }
New-Item -ItemType Directory -Path $Destination | Out-Null
$path = Join-Path $Destination 'AppxManifest.xml'
$manifest.Save($path)
Write-Host "PASS: manifesto de identidade publica preparado em $path. Nao empacotado, assinado ou instalado."
