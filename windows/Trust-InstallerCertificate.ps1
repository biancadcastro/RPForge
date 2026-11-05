param(
    [Parameter(Mandatory=$true)][string]$CertificatePath,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
$resolved = (Resolve-Path -LiteralPath $CertificatePath).Path
if ([IO.Path]::GetExtension($resolved) -ne '.cer') { throw 'Somente certificado publico CER e permitido.' }
if ((Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw 'Certificado diferente do autorizado neste instalador.' }
$certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($resolved)
try {
    if ($certificate.HasPrivateKey -or $certificate.Subject -ne 'CN=RPF Forge Local Test') { throw 'Certificado publico local inesperado.' }
    if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date)) { throw 'Certificado fora da validade.' }
    $eku = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' }
    if (!$eku -or !($eku.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' })) { throw 'Certificado sem finalidade de assinatura de codigo.' }
    $constraints = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.19' }
    if (!$constraints -or $constraints.CertificateAuthority) { throw 'Certificado de autoridade nao permitido.' }
    if ($ValidateOnly) { Write-Host 'PASS: certificado publico, hash, validade e finalidade verificados; nenhuma confianca alterada.'; return }
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Importacao exige confirmacao de administrador.' }
    # Only an exact, explicitly consented end-entity certificate; never Root.
    $store = New-Object Security.Cryptography.X509Certificates.X509Store('TrustedPeople','LocalMachine')
    try { $store.Open('ReadWrite'); $store.Add($certificate) } finally { $store.Close() }
    Write-Host 'Confianca local instalada em TrustedPeople.'
} finally { $certificate.Dispose() }
