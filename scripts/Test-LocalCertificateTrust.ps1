param([Parameter(Mandatory=$true)][string]$CertificatePath)
$ErrorActionPreference = 'Stop'
$helper = Join-Path (Split-Path -Parent $PSScriptRoot) 'windows\Trust-InstallerCertificate.ps1'
$before = @(Get-ChildItem Cert:\LocalMachine\TrustedPeople | ForEach-Object Thumbprint | Sort-Object)
$hash = (Get-FileHash -LiteralPath $CertificatePath -Algorithm SHA256).Hash
& $helper -CertificatePath $CertificatePath -ExpectedSha256 $hash -ValidateOnly
$rejected = $false
try { & $helper -CertificatePath $CertificatePath -ExpectedSha256 ('0' * 64) -ValidateOnly } catch { $rejected = $true }
if (!$rejected) { throw 'Certificado com hash divergente foi aceito.' }
$after = @(Get-ChildItem Cert:\LocalMachine\TrustedPeople | ForEach-Object Thumbprint | Sort-Object)
if (@(Compare-Object $before $after).Count) { throw 'O teste de validacao alterou a confianca do computador.' }
Write-Host 'PASS: certificado valido aceito, hash divergente recusado, TrustedPeople preservado.'
