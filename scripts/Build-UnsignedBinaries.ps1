param([string]$Destination, [switch]$AllowDirty)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
if (!$Destination) { $Destination = Join-Path $root '.tools\signpath\unsigned' }
$Destination = [IO.Path]::GetFullPath($Destination)
$allowed = Join-Path $root '.tools'
if (!$Destination.StartsWith($allowed + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build de preparacao deve ficar dentro de .tools, sem instalacao ou distribuicao.' }
if (Test-Path -LiteralPath $Destination) { throw 'Use um destino novo para preservar os artefatos anteriores.' }
$context = Get-ForgeBuildContext $root -AllowDirty:$AllowDirty
$llvm = Initialize-ForgeTool $root 'llvm'
$roslyn = Initialize-ForgeTool $root 'roslyn'
$references = Initialize-ForgeTool $root 'references'
$node = Initialize-ForgeTool $root 'node'
$nodeExe = Join-Path $node 'node.exe'
if ((& $nodeExe -p 'process.version') -ne 'v24.22.0') { throw 'Runtime Node diferente do fixado.' }
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$runtimeSignature = Get-AuthenticodeSignature -LiteralPath $nodeExe
if ($runtimeSignature.Status -ne 'Valid' -or $runtimeSignature.SignerCertificate.Subject -notlike '*OpenJS Foundation*') { throw 'A assinatura upstream do Node.js nao foi confirmada. Nao re-assinar o runtime.' }
Push-Location $root
$previousNodePath = $env:PATH
$previousConsoleMode = $env:RPF_FORGE_CONSOLE
$env:PATH = "$node;$env:PATH"
$env:RPF_FORGE_CONSOLE = '1'
try {
    & $nodeExe --test
    if ($LASTEXITCODE -ne 0) { throw 'Testes falharam.' }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $generated = Join-Path $root '.tools\signpath-generated'
    Write-ForgeMetadata $context $generated
    $refDir = Join-Path $references 'build\.NETFramework\v4.8'
    $csharpReferences = @('mscorlib.dll','System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll') | ForEach-Object { '/reference:' + (Join-Path $refDir $_) }
    $desktopSources = @(Get-ChildItem -LiteralPath (Join-Path $root 'desktop') -Filter '*.cs' -File | ForEach-Object FullName)
    if (!$desktopSources.Count) { throw 'Fontes da interface nao encontrados. Atualize o contrato do build ao alterar a tecnologia da interface.' }
    & (Join-Path $roslyn 'tasks\net472\csc.exe') /nologo /noconfig /nostdlib+ /target:winexe /platform:x64 /optimize+ /deterministic+ "/pathmap:$root=/_/RPFForge" "/out:$Destination\RPFForge.exe" $csharpReferences $desktopSources (Join-Path $generated 'AssemblyInfo.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Falha no build fixado da interface.' }
    $resource = Join-Path $generated 'ForgeShell.o'
    & (Join-Path $llvm 'bin\x86_64-w64-mingw32-windres.exe') -i (Join-Path $generated 'ForgeShell.rc') -O coff -o $resource
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar metadados da extensao.' }
    $compiler = Join-Path $llvm 'bin\x86_64-w64-mingw32-clang++.exe'
    & $compiler -std=c++17 -O2 -shared -static -Wno-dll-attribute-on-redeclaration '-Wl,--no-insert-timestamp' "-ffile-prefix-map=$root=/_/RPFForge" -o (Join-Path $Destination 'ForgeShell.dll') (Join-Path $root 'shell\ForgeShell.cpp') $resource -lole32 -lshell32 -lshlwapi -luuid
    if ($LASTEXITCODE -ne 0) { throw 'Falha no build fixado da extensao.' }
    & (Join-Path $PSScriptRoot 'Test-BinaryMetadata.ps1') -Directory $Destination -Version $context.Version
    $selfTest = Start-Process -FilePath (Join-Path $Destination 'RPFForge.exe') -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
    if ($selfTest.ExitCode -ne 0) { throw 'Estados da interface falharam.' }
    & (Join-Path $PSScriptRoot 'Test-DesktopWorkflow.ps1') -ExecutablePath (Join-Path $Destination 'RPFForge.exe')
    $nativeTest = Join-Path $generated 'TestForgeShell.exe'
    & $compiler -std=c++17 -O2 -static -municode -o $nativeTest (Join-Path $root 'shell\TestShell.cpp') -lole32 -lshell32 -luuid
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste COM.' }
    $fixture = Join-Path $generated 'fixture'
    New-Item -ItemType Directory -Path (Join-Path $fixture 'with'),(Join-Path $fixture 'empty') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $fixture 'with\test.rpf'),'synthetic')
    & $nativeTest (Join-Path $Destination 'ForgeShell.dll') (Join-Path $fixture 'with') (Join-Path $fixture 'empty')
    if ($LASTEXITCODE -ne 0) { throw "Teste da extensao falhou: $LASTEXITCODE" }
    $licenses = Join-Path $Destination 'licenses'
    New-Item -ItemType Directory -Path $licenses -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination (Join-Path $licenses 'RPF-Forge-LICENSE.txt')
    Copy-Item -LiteralPath (Join-Path $root 'node_modules\@xmldom\xmldom\LICENSE') -Destination (Join-Path $licenses 'xmldom-LICENSE.txt')
    Copy-Item -LiteralPath (Join-Path $llvm 'LICENSE.TXT') -Destination (Join-Path $licenses 'llvm-mingw-LICENSE.txt')
    Copy-Item -LiteralPath (Join-Path $node 'LICENSE') -Destination (Join-Path $licenses 'Node.js-LICENSE.txt')
    & $nodeExe (Join-Path $PSScriptRoot 'signing-inventory.mjs') $Destination $context.Version $context.Revision $context.Dirty.ToString().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0) { throw 'Falha na proveniencia.' }
    foreach ($name in @('RPFForge.exe','ForgeShell.dll')) {
        if ((Get-AuthenticodeSignature -LiteralPath (Join-Path $Destination $name)).Status -ne 'NotSigned') { throw 'O build de preparacao deve permanecer sem assinatura.' }
    }
    Write-Host "PASS: binarios proprios sem assinatura preparados em $Destination. Nenhum instalador, certificado ou registro do Windows foi gerado ou alterado."
} finally { $env:PATH = $previousNodePath; $env:RPF_FORGE_CONSOLE = $previousConsoleMode; Pop-Location }
