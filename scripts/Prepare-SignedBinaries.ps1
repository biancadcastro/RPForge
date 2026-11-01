param(
    [Parameter(Mandatory=$true)][string]$SignedDirectory,
    [Parameter(Mandatory=$true)][string]$UnsignedDirectory,
    [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
$config = Get-Content -LiteralPath (Join-Path $root 'signpath\project.json') -Raw | ConvertFrom-Json
if (!$config.enabled -or !$config.approvedByFoundation -or !$config.publisherSubject -or $config.publisherSubject -match 'Local Test|__') {
    throw 'Assinatura publica ainda nao aprovada/configurada; nenhum certificado local sera aceito.'
}
$context = Get-ForgeBuildContext $root
$SignedDirectory = (Resolve-Path -LiteralPath $SignedDirectory).Path
$UnsignedDirectory = (Resolve-Path -LiteralPath $UnsignedDirectory).Path
$Destination = [IO.Path]::GetFullPath($Destination)
$allowed = (Join-Path $root '.tools') + [IO.Path]::DirectorySeparatorChar
if (!$Destination.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $Destination)) { throw 'Destino deve ser novo, dentro de .tools.' }
$manifest = Get-Content -LiteralPath (Join-Path $UnsignedDirectory 'build-manifest.json') -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.product -ne 'RPForge' -or $manifest.repository -ne 'https://github.com/biancadcastro/RPForge' -or $manifest.dirty -ne $false -or $manifest.hostedBuild -ne $true -or !$manifest.workflowRunId -or $manifest.revision -ne $context.Revision -or $manifest.packageVersion -ne $context.PackageVersion -or $manifest.version -ne $context.Version) { throw 'Origem deve ser o build limpo de Actions da revisao e versao atuais.' }
if ($manifest.toolchainLockSha256 -ne (Get-ForgeSha256 (Join-Path $root 'build\toolchains.json'))) { throw 'Toolchain diverge da origem.' }
# The manifest must enumerate the current source tree exactly, not just claim its commit.
$tracked = @(& git -C $root ls-files)
if ($LASTEXITCODE -ne 0 -or $tracked.Count -ne @($manifest.sources).Count) { throw 'Inventario de fontes incompleto.' }
foreach ($name in $tracked) {
    $entry = @($manifest.sources | Where-Object path -CEQ $name)
    if ($entry.Count -ne 1 -or $entry[0].sha256 -ne (Get-ForgeSha256 (Join-Path $root $name))) { throw "Fonte diverge da origem: $name" }
}
$records = @()
foreach ($name in @('RPFForge.exe','ForgeShell.dll')) {
    $original = Join-Path $UnsignedDirectory $name
    $signed = Join-Path $SignedDirectory $name
    $entry = @($manifest.binaries | Where-Object path -CEQ $name)
    if ($entry.Count -ne 1 -or $entry[0].sha256 -ne (Get-ForgeSha256 $original)) { throw "Hash original invalido: $name" }
    $signature = Get-AuthenticodeSignature -LiteralPath $signed
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -cne $config.publisherSubject -or !$signature.TimeStamperCertificate) { throw "Assinatura, Publisher ou timestamp invalido: $name" }
    & node.exe (Join-Path $PSScriptRoot 'compare-signed-image.mjs') $original $signed
    if ($LASTEXITCODE -ne 0) { throw "Imagem assinada nao corresponde ao build aprovado: $name" }
    $records += [pscustomobject]@{path=$name;sha256=(Get-ForgeSha256 $signed);unsignedSha256=$entry[0].sha256;signer=$signature.SignerCertificate.Subject;thumbprint=$signature.SignerCertificate.Thumbprint}
}
& (Join-Path $PSScriptRoot 'Test-BinaryMetadata.ps1') -Directory $SignedDirectory -Version $context.Version
# No compiler, signing tool, certificate import or shell registration is called here.
New-Item -ItemType Directory -Path $Destination | Out-Null
foreach ($name in @('RPFForge.exe','ForgeShell.dll')) {
    Copy-Item -LiteralPath (Join-Path $SignedDirectory $name) -Destination $Destination
    if ((Get-ForgeSha256 (Join-Path $Destination $name)) -ne ($records | Where-Object path -EQ $name).sha256) { throw 'Arquivo mudou durante a copia.' }
}
Copy-Item -LiteralPath (Join-Path $UnsignedDirectory 'licenses') -Destination $Destination -Recurse
foreach ($name in @('build-manifest.json','sbom.cdx.json')) { Copy-Item -LiteralPath (Join-Path $UnsignedDirectory $name) -Destination $Destination }
[pscustomobject]@{schemaVersion=1;revision=$context.Revision;version=$context.PackageVersion;binaries=$records;installerGenerated=$false} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Destination 'signed-manifest.json') -Encoding UTF8
Write-Host "PASS: binarios assinados preservados em $Destination; montagem do MSIX e instalador publico continua separada."
