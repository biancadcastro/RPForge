param([string]$CompilerPath)
$ErrorActionPreference = 'Stop'
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
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = (& $nodePath -p 'process.version').Trim()
$nodeArch = (& $nodePath -p 'process.arch').Trim()
if ($nodeArch -ne 'x64') { throw 'Este instalador requer Node.js x64 para empacotar.' }
if ([int]$nodeVersion.TrimStart('v').Split('.')[0] -lt 22) { throw 'Node.js 22+ necessario.' }
Push-Location $projectRoot
try {
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Testes falharam; instalador nao sera gerado.' }
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
    Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination $stage -Recurse
    foreach ($name in @('package.json', 'package-lock.json', 'LICENSE')) {
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
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE" -OutFile (Join-Path $runtimeDir 'LICENSE.txt') -UseBasicParsing
    $instructions = @'
RPF to FiveM

1. Clique com o botao direito na pasta que contem o arquivo .rpf.
2. Selecione Converter RPF para FiveM.
   No Windows 11, procure em Mostrar mais opcoes.
3. O addon sera criado em uma nova pasta terminada em _fivem.
4. Copie o addon para resources e adicione o ensure indicado ao server.cfg.

Nao requer Node.js separado, GTA, OpenIV ou CodeWalker instalados.
Os RPFs originais sao preservados. Saidas existentes nao sao sobrescritas.
Suporta addons de veiculos GTA V Legacy, RPF7 OPEN/NONE.
Arquivos criptografados, mapas e audio customizado nao sao suportados.
O menu aparece nas pastas e verifica os RPFs quando acionado.
Valide o resultado no FiveM antes de usar em producao.

Para remover, use Configuracoes > Aplicativos > RPF to FiveM.
Seus addons e arquivos originais nao sao apagados na desinstalacao.
'@
    Set-Content -LiteralPath (Join-Path $stage 'LEIA-ME.txt') -Value $instructions -Encoding UTF8
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
    & $CompilerPath "/DAppVersion=$version" "/DPayloadDir=$stage" "/DReleaseDir=$release" (Join-Path $projectRoot 'installer\setup.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar instalador.' }
    $installer = Join-Path $release "RPF-to-FiveM-Setup-$version-x64.exe"
    $hash = Get-Sha256 $installer
    Set-Content -LiteralPath "$installer.sha256" -Value "$hash  $([IO.Path]::GetFileName($installer))" -Encoding ASCII
    Write-Host "Instalador local: $installer"
} finally { Pop-Location }
