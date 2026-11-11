param([string]$CompilerPath, [string]$SignedBinaryDirectory, [string]$UnsignedBinaryDirectory, [switch]$ValidateSignedInputsOnly, [switch]$LocalTest, [string]$ClothingEngineDirectory)
$ErrorActionPreference = 'Stop'
if ($SignedBinaryDirectory -or $UnsignedBinaryDirectory -or $ValidateSignedInputsOnly) {
    if (!$SignedBinaryDirectory -or !$UnsignedBinaryDirectory) { throw 'Informe os diretorios assinado e original sem assinatura.' }
    if (!$ValidateSignedInputsOnly) { throw 'Montagem publica bloqueada ate configurar a identidade MSIX de distribuicao. Use -ValidateSignedInputsOnly para preparar os binarios sem recompilar.' }
    $prepared = Join-Path (Split-Path -Parent $PSScriptRoot) ('.tools\signed-payload\' + [guid]::NewGuid().ToString('N'))
    & (Join-Path $PSScriptRoot 'Prepare-SignedBinaries.ps1') -SignedDirectory $SignedBinaryDirectory -UnsignedDirectory $UnsignedBinaryDirectory -Destination $prepared
    return
}
function Get-Sha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$stage = Join-Path $projectRoot 'packaging-stage'
$release = Join-Path $projectRoot 'release'
$tools = Join-Path $projectRoot '.tools'
. (Join-Path $PSScriptRoot 'Forge-BuildTools.ps1')
$lockedNode = Initialize-ForgeTool $projectRoot 'node'
$nodePath = Join-Path $lockedNode 'node.exe'
$nodeVersion = (& $nodePath -p 'process.version').Trim()
$nodeArch = (& $nodePath -p 'process.arch').Trim()
if ($nodeArch -ne 'x64') { throw 'Este instalador requer Node.js x64 para empacotar.' }
if ([int]$nodeVersion.TrimStart('v').Split('.')[0] -lt 22) { throw 'Node.js 22+ necessario.' }
Push-Location $projectRoot
try {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Testes falharam; instalador nao sera gerado.' }
    & npm.cmd run desktop:build
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a interface Electron.' }
    & npm.cmd run desktop:test
    if ($LASTEXITCODE -ne 0) { throw 'Falha nos testes da interface Electron.' }
    $binaryDirectory = Join-Path $tools ('installer-binaries\' + [guid]::NewGuid().ToString('N'))
    & (Join-Path $PSScriptRoot 'Build-UnsignedBinaries.ps1') -Destination $binaryDirectory -AllowDirty:$LocalTest
    if (!$CompilerPath) {
        $CompilerPath = Join-Path $tools 'inno-6.7.3\ISCC.exe'
        if (!(Test-Path -LiteralPath $CompilerPath)) {
            New-Item -ItemType Directory -Path $tools -Force | Out-Null
            $download = Join-Path $tools 'innosetup-6.7.3.exe'
            if (!(Test-Path -LiteralPath $download)) { Invoke-WebRequest -Uri 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe' -OutFile $download -UseBasicParsing }
            $expectedHash = '9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732'
            if ((Get-Sha256 $download) -ne $expectedHash) { throw 'Hash do compilador invalido.' }
            $compilerDir = Split-Path -Parent $CompilerPath
            $process = Start-Process -FilePath $download -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/CURRENTUSER', '/NOICONS', '/TASKS=""', "/DIR=`"$compilerDir`"") -WindowStyle Hidden -Wait -PassThru
            if ($process.ExitCode -ne 0) { throw "Instalacao do compilador falhou: $($process.ExitCode)" }
        }
    }
    if (!(Test-Path -LiteralPath $CompilerPath -PathType Leaf)) { throw 'ISCC.exe nao encontrado.' }
    # Never clear a computed directory before validating its exact location.
    if ([IO.Path]::GetFullPath($stage) -ne (Join-Path $projectRoot 'packaging-stage')) { throw 'Stage invalido.' }
    if (Test-Path -LiteralPath $stage) {
        if ((Get-Item -LiteralPath $stage).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Stage nao pode ser um link.' }
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    & (Join-Path $PSScriptRoot 'Prepare-DesktopPayload.ps1') -Destination (Join-Path $stage 'desktop-web')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination $stage -Recurse
    if (!$ClothingEngineDirectory) { $ClothingEngineDirectory = Join-Path $tools 'clothing-engine' }
    New-Item -ItemType Directory -Path (Join-Path $stage 'engines') -Force | Out-Null
    & $nodePath (Join-Path $PSScriptRoot 'distribution-engine.mjs') $ClothingEngineDirectory (Join-Path $stage 'engines\clothing')
    if ($LASTEXITCODE -ne 0) { throw 'Motor de roupas incompleto ou alterado; instalador bloqueado.' }
    Copy-Item -LiteralPath (Join-Path $binaryDirectory 'RPFForge.exe') -Destination (Join-Path $stage 'RPFForge.exe')
    & (Join-Path $PSScriptRoot 'Build-Shell.ps1') -Destination (Join-Path $stage 'shell') -NativeBinaryPath (Join-Path $binaryDirectory 'ForgeShell.dll')
    Copy-Item -LiteralPath (Join-Path $stage 'shell\Assets') -Destination (Join-Path $stage 'Assets') -Recurse
    Copy-Item -LiteralPath (Join-Path $stage 'shell\resources.pri') -Destination (Join-Path $stage 'resources.pri')
    if ($LocalTest) {
        $publicCertificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2((Join-Path $stage 'shell\RPFForge.LocalTest.cer'))
        try {
            $signTool = Join-Path (Initialize-ForgeTool $projectRoot 'sdk') 'bin\10.0.28000.0\x64\signtool.exe'
            foreach ($localBinary in @((Join-Path $stage 'RPFForge.exe'), (Join-Path $stage 'shell\ForgeShell.dll'))) {
                & $signTool sign /fd SHA256 /sha1 $publicCertificate.Thumbprint /s My $localBinary
                if ($LASTEXITCODE -ne 0) { throw 'Falha ao assinar binario com certificado local.' }
            }
        } finally { $publicCertificate.Dispose() }
    }
    Copy-Item -LiteralPath (Join-Path $binaryDirectory 'licenses') -Destination $stage -Recurse
    foreach ($name in @('sbom.cdx.json','build-manifest.json')) { Copy-Item -LiteralPath (Join-Path $binaryDirectory $name) -Destination $stage }
    Copy-Item -LiteralPath (Join-Path $projectRoot 'THIRD_PARTY_NOTICES.md') -Destination $stage
    Copy-Item -LiteralPath (Join-Path $projectRoot 'windows') -Destination $stage -Recurse
    foreach ($name in @('package.json', 'package-lock.json', 'LICENSE', 'NOTICE')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stage
    }
    Push-Location $stage
    try {
        & npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar dependencias.' }
    } finally { Pop-Location }
    $runtimeDir = Join-Path $stage 'runtime'
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    Copy-Item -LiteralPath $nodePath -Destination (Join-Path $runtimeDir 'node.exe')
    Copy-Item -LiteralPath (Join-Path $lockedNode 'LICENSE') -Destination (Join-Path $runtimeDir 'LICENSE.txt')
    $instructions = @'
RPForge
Você cria. O RPForge organiza.

Converter RPFs
1. Clique com o botão direito na pasta que contém o arquivo .rpf.
2. Selecione Converter RPFs com RPForge.
   No Windows 11, o comando fica no menu principal quando a confiança local
   foi autorizada; caso contrário, procure em Mostrar mais opções.
3. Revise a prévia na janela e preencha o novo spawn, se desejar.
4. Em Configurar, escolha o tratamento para pastas de destino existentes.
5. Clique em Revisar conversão, confira os avisos e use Converter agora.
6. Copie o recurso para resources e adicione o ensure indicado ao server.cfg.

Não requer Node.js separado, GTA, OpenIV ou CodeWalker instalados.
Os RPFs originais são preservados. Se a pasta de destino já existir, você
escolhe usar outro nome, cancelar ou substituí-la: a pasta anterior é
preservada como backup antes da substituição.
Suporta conteúdos GTA V Legacy, RPF7 OPEN/NONE: veículos, roupas identificadas,
mapas, props, animações, texturas e tipos reconhecidos de peds, armas e áudio.
RPFs criptografados, Enhanced e tipos especiais desconhecidos são recusados.
Valide o resultado no FiveM antes de usar em produção.

Gerar YTYP
Em pastas com YDRs, use Gerar YTYP com RPForge para gerar YTYPs básicos.
YTYPs básicos não reconstroem salas ou portais de MLO.

Ferramentas de roupas (plano Pro)
Roupas para OBJ, Roupas para Neon e Separar pele trabalham com roupas .ydd e
exigem o plano Pro. Use Entrar no RPForge para ativar o plano neste computador;
no plano Free, esses comandos ficam ocultos no botão direito.
Dúvidas: abra Ajuda no RPForge ou consulte o site.

Para remover, use Configurações > Aplicativos > RPForge.
Seus recursos e arquivos originais não são apagados na desinstalação.

Código próprio sob licença proprietária. Veja legal\TERMOS-E-LICENCA.txt,
legal\PRIVACIDADE.txt e legal\AVISOS-DE-TERCEIROS.txt na pasta de instalação.
Suporte: suporte@rpforge.dev. Privacidade: privacidade@rpforge.dev.
As dependências mantêm suas licenças próprias.
Versão de testes com certificado local. A confiança requer autorização explícita.
A primeira instalação em máquina limpa ainda não foi validada.
'@
    Set-Content -LiteralPath (Join-Path $stage 'LEIA-ME.txt') -Value $instructions -Encoding UTF8
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    $localCertificate = Join-Path $stage 'shell\RPFForge.LocalTest.cer'
    $localCertificateHash = Get-Sha256 $localCertificate
    & (Join-Path $projectRoot 'windows\Trust-InstallerCertificate.ps1') -CertificatePath $localCertificate -ExpectedSha256 $localCertificateHash -ValidateOnly
    & $nodePath (Join-Path $PSScriptRoot 'Prepare-InstallerPresentation.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar os documentos e a identidade do instalador.' }
    $presentation = Join-Path $projectRoot '.tools\installer-presentation'
    $presentationFlags = @()
    if ($LocalTest) { $presentationFlags += '/DLocalInstallerTest=1' }
    & $CompilerPath "/DAppVersion=$version" "/DPayloadDir=$stage" "/DReleaseDir=$release" "/DLocalCertificateHash=$localCertificateHash" "/DPresentationDir=$presentation" @presentationFlags (Join-Path $projectRoot 'installer\setup.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar instalador.' }
    $installer = Join-Path $release "RPForge-Setup-$version-x64.exe"
    if ($LocalTest) {
        $publicCertificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($localCertificate)
        try { & $signTool sign /fd SHA256 /sha1 $publicCertificate.Thumbprint /s My $installer; if ($LASTEXITCODE -ne 0) { throw 'Falha na assinatura local do instalador.' } }
        finally { $publicCertificate.Dispose() }
    }
    $hash = Get-Sha256 $installer
    Set-Content -LiteralPath "$installer.sha256" -Value "$hash  $([IO.Path]::GetFileName($installer))" -Encoding ASCII
    Write-Host "Instalador local: $installer"
} finally { Pop-Location }
