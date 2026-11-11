param([switch]$CompileOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$compiler = Join-Path $projectRoot '.tools\inno-6.7.3\ISCC.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Use o compilador Inno Setup 6.7.3 já configurado no projeto.' }
& node (Join-Path $PSScriptRoot 'Prepare-InstallerPresentation.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar a apresentação.' }
$presentation = Join-Path $projectRoot '.tools\installer-presentation'
$preview = Join-Path $projectRoot ('.tools\installer-preview\' + [guid]::NewGuid().ToString('N'))
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if (!$version) { throw 'Versão ausente em package.json.' }
& $compiler "/DAppVersion=$version" "/DPresentationDir=$presentation" "/DPreviewOutput=$preview" (Join-Path $projectRoot 'installer\preview.iss')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a prévia visual.' }
if (!$CompileOnly) {
  Start-Process -FilePath (Join-Path $preview 'RPForge-Installer-VisualPreview.exe') -WindowStyle Normal
}
