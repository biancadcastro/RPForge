$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $root '.tools\desktop'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Compilador .NET Framework do Windows nao encontrado.' }
$sources = @(Get-ChildItem -LiteralPath (Join-Path $root 'desktop') -Filter '*.cs' -File | ForEach-Object FullName)
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/win32icon:$root\desktop\assets\rpforge.ico" "/out:$destination\RPFForge.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll $sources
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a janela de desenvolvimento.' }
$process = Start-Process -FilePath (Join-Path $destination 'RPFForge.exe') -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Teste de estados da interface falhou; consulte .tools\desktop-test-error.txt.' }
Write-Host "PASS: interface de desenvolvimento compilada e estados verificados em $destination"
