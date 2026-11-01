param([Parameter(Mandatory=$true)][string]$CertificatePath)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
Import-Module (Join-Path $PSHOME 'Modules\PKI\pki.psd1')
$certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2((Resolve-Path -LiteralPath $CertificatePath).Path)
if ($certificate.Subject -ne 'CN=RPF Forge Local Test' -or $certificate.HasPrivateKey) { throw 'Certificado publico de teste inesperado.' }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Este passo requer UAC e autorizacao explicita do usuario.' }
# Invoke manually only after the user explicitly authorizes machine-scope test trust.
# Never run from the installer automatically. Never use the Root store.
Import-Certificate -FilePath $CertificatePath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
Write-Host "Certificado local de teste autorizado em TrustedPeople: $($certificate.Thumbprint)"
