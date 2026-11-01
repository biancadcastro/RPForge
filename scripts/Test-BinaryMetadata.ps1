param([Parameter(Mandatory=$true)][string]$Directory, [Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
foreach ($name in @('RPFForge.exe', 'ForgeShell.dll')) {
    $file = Join-Path $Directory $name
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Binario ausente: $name" }
    $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($file)
    if ($info.ProductName -ne 'RPF Forge' -or $info.CompanyName -ne 'RedHorn' -or $info.ProductVersion -ne $Version -or $info.FileVersion -ne $Version -or $info.OriginalFilename -ne $name) { throw "Metadados inconsistentes em $name" }
    $bytes = [IO.File]::ReadAllBytes($file)
    $peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
    if ([BitConverter]::ToUInt16($bytes, $peOffset + 4) -ne 0x8664) { throw "Arquitetura inesperada em $name" }
}
Write-Host "PASS: produto, versao, empresa, nome original e arquitetura x64 dos binarios proprios."
