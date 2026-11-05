param([Parameter(Mandatory=$true)][string]$Destination, [string]$NativeBinaryPath, [ValidatePattern('^ForgeShell(?:-[a-z0-9-]+)?\.dll$')][string]$LibraryFileName='ForgeShell.dll', [ValidateRange(0,65535)][int]$IdentityRevision=0)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Import-Module (Join-Path $PSHOME 'Modules\PKI\pki.psd1') -ErrorAction Stop
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
$tools = Join-Path $root '.tools'
$llvm = Initialize-ForgeTool $root 'llvm'
$compiler = Join-Path $llvm 'bin\x86_64-w64-mingw32-clang++.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'LLVM-MinGW 20261020 x64 necessario no cache .tools (ver README).' }
$sdkRoot = Initialize-ForgeTool $root 'sdk'
$sdk = Join-Path $sdkRoot 'bin\10.0.28000.0\x64'
$makeappx = Join-Path $sdk 'makeappx.exe'
$signtool = Join-Path $sdk 'signtool.exe'
if (!(Test-Path -LiteralPath $makeappx)) { throw 'Windows SDK BuildTools necessario no cache .tools.' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$libraryPath = Join-Path $Destination $LibraryFileName
Copy-Item -LiteralPath (Join-Path $root 'desktop\assets\rpforge.png') -Destination (Join-Path $Destination 'logo.png') -Force
Copy-Item -LiteralPath (Join-Path $root 'desktop\assets\rpforge.png') -Destination (Join-Path $Destination 'rpforge-mark-v3.png') -Force
Copy-Item -LiteralPath (Join-Path $root 'desktop\assets\rpforge.ico') -Destination (Join-Path $Destination 'rpforge-mark-v3.ico') -Force
if ($NativeBinaryPath) {
    Copy-Item -LiteralPath $NativeBinaryPath -Destination $libraryPath
} else {
    & $compiler -std=c++17 -O2 -shared -static -Wno-dll-attribute-on-redeclaration -o $libraryPath (Join-Path $root 'shell\ForgeShell.cpp') -lole32 -lshell32 -lshlwapi -luuid
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar extensao.' }
}
$testExe = Join-Path $tools 'TestForgeShell.exe'
& $compiler -std=c++17 -O2 -static -municode -o $testExe (Join-Path $root 'shell\TestShell.cpp') -lole32 -lshell32 -luuid
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste COM.' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('forge-shell-' + [guid]::NewGuid().ToString('N'))
$withRpf = Join-Path $fixture 'with RPF'
$empty = Join-Path $fixture 'empty'
New-Item -ItemType Directory -Path $withRpf,$empty -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $withRpf 'test.rpf'), 'synthetic')
& $testExe $libraryPath $withRpf $empty
if ($LASTEXITCODE -ne 0) { throw "Teste COM falhou: $LASTEXITCODE" }
$identity = Join-Path $tools 'forge-identity'
New-Item -ItemType Directory -Path $identity -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'shell\AppxManifest.xml') -Destination (Join-Path $identity 'AppxManifest.xml')
$manifestPath = Join-Path $identity 'AppxManifest.xml'
$manifest = [xml][IO.File]::ReadAllText($manifestPath)
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$manifest.Package.Identity.Version = "$version.$IdentityRevision"
foreach ($class in $manifest.SelectNodes("//*[local-name()='Class']")) { $class.Path = 'shell\' + $LibraryFileName }
$manifest.Save($manifestPath)
& (Join-Path $PSScriptRoot 'Prepare-ShellVisualResources.ps1') -Destination $identity -SdkDirectory $sdk
Copy-Item -LiteralPath (Join-Path $identity 'Assets') -Destination $Destination -Recurse -Force
Copy-Item -LiteralPath (Join-Path $identity 'resources.pri') -Destination (Join-Path $Destination 'resources.pri') -Force
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
