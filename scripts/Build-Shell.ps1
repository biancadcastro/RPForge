param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules\PKI\pki.psd1') -ErrorAction Stop
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'
$llvm = Join-Path $tools 'llvm-mingw-20261020-ucrt-x86_64'
$compiler = Join-Path $llvm 'bin\x86_64-w64-mingw32-clang++.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'LLVM-MinGW 20261020 x64 necessario no cache .tools (ver README).' }
$sdk = Join-Path $tools 'windows-sdk-buildtools\bin\10.0.28000.0\x64'
$makeappx = Join-Path $sdk 'makeappx.exe'
$signtool = Join-Path $sdk 'signtool.exe'
if (!(Test-Path -LiteralPath $makeappx)) { throw 'Windows SDK BuildTools necessario no cache .tools.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object Drawing.Bitmap 150,150
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$font = New-Object Drawing.Font 'Segoe UI',48,([Drawing.FontStyle]::Bold)
$brush = New-Object Drawing.SolidBrush ([Drawing.Color]::White)
try {
    $graphics.Clear([Drawing.Color]::FromArgb(155,27,37))
    $graphics.DrawString('RF', $font, $brush, 19, 30)
    $bitmap.Save((Join-Path $Destination 'logo.png'), [Drawing.Imaging.ImageFormat]::Png)
} finally { $graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $brush.Dispose() }
& $compiler -std=c++17 -O2 -shared -static -Wno-dll-attribute-on-redeclaration -o (Join-Path $Destination 'ForgeShell.dll') (Join-Path $root 'shell\ForgeShell.cpp') -lole32 -lshell32 -lshlwapi -luuid
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar extensao.' }
$testExe = Join-Path $tools 'TestForgeShell.exe'
& $compiler -std=c++17 -O2 -static -municode -o $testExe (Join-Path $root 'shell\TestShell.cpp') -lole32 -lshell32 -luuid
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste COM.' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('forge-shell-' + [guid]::NewGuid().ToString('N'))
$withRpf = Join-Path $fixture 'with RPF'
$empty = Join-Path $fixture 'empty'
New-Item -ItemType Directory -Path $withRpf,$empty -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $withRpf 'test.rpf'), 'synthetic')
& $testExe (Join-Path $Destination 'ForgeShell.dll') $withRpf $empty
if ($LASTEXITCODE -ne 0) { throw "Teste COM falhou: $LASTEXITCODE" }
$identity = Join-Path $tools 'forge-identity'
New-Item -ItemType Directory -Path $identity -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'shell\AppxManifest.xml') -Destination (Join-Path $identity 'AppxManifest.xml')
$package = Join-Path $Destination 'RPFForge.identity.msix'
& $makeappx pack /o /nv /d $identity /p $package
if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar identidade.' }
# Local test key stays in .tools and the user's Personal certificate store; it is never distributed.
$certificate = Get-ChildItem 'Cert:\CurrentUser\My' | Where-Object { $_.Subject -eq 'CN=RPF Forge Local Test' -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } | Select-Object -First 1
if (!$certificate) {
    $certificate = New-SelfSignedCertificate -Type Custom -Subject 'CN=RPF Forge Local Test' -FriendlyName 'RPF Forge local development only' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage DigitalSignature -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}') -NotAfter (Get-Date).AddYears(1)
}
& $signtool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $package
if ($LASTEXITCODE -ne 0) { throw 'Falha ao assinar identidade local.' }
Export-Certificate -Cert $certificate -FilePath (Join-Path $Destination 'RPFForge.LocalTest.cer') | Out-Null
