function Get-ForgeSha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Get-ForgeBuildContext([string]$Root, [switch]$AllowDirty) {
    $package = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
    if ($package.version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:-[a-zA-Z0-9.-]+)?$') { throw 'Versao deve usar SemVer numerico.' }
    $parts = @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3], 0)
    if (@($parts | Where-Object { $_ -gt 65535 }).Count) { throw 'Versao excede limites dos metadados Windows.' }
    $revision = (& git -C $Root rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[a-f0-9]{40}$') { throw 'Revisao Git valida necessaria.' }
    $dirty = !!(& git -C $Root status --porcelain)
    if ($dirty -and !$AllowDirty) { throw 'Ha alteracoes locais. Commit antes do build de origem verificavel, ou use -AllowDirty apenas para diagnostico local.' }
    return [pscustomobject]@{ Product='RPForge'; Company='RedHorn'; Version=($parts -join '.'); VersionComma=($parts -join ','); PackageVersion=$package.version; Revision=$revision; Dirty=$dirty; Root=$Root }
}

function Initialize-ForgeTool([string]$Root, [string]$Name) {
    $lock = Get-Content -LiteralPath (Join-Path $Root 'build\toolchains.json') -Raw | ConvertFrom-Json
    $spec = $lock.tools.$Name
    if (!$spec -or $spec.sha256 -notmatch '^[a-f0-9]{64}$' -or $spec.url -notmatch '^https://') { throw "Toolchain invalida: $Name" }
    $downloads = Join-Path $Root '.tools\locked-downloads'
    $cache = Join-Path $Root ".tools\locked\$Name\$($spec.version)"
    $archive = Join-Path $downloads "$Name-$($spec.version).zip"
    New-Item -ItemType Directory -Path $downloads -Force | Out-Null
    if (!(Test-Path -LiteralPath $archive)) {
        Write-Host "Baixando toolchain fixada: $Name $($spec.version)"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $spec.url -OutFile $archive -UseBasicParsing
    }
    if ((Get-ForgeSha256 $archive) -ne $spec.sha256) { throw "SHA-256 invalido para $Name. Nenhuma ferramenta deste arquivo sera executada." }
    $toolRoot = if ($spec.root) { Join-Path $cache $spec.root } else { $cache }
    $probe = Join-Path $toolRoot $spec.probe
    $receipt = Join-Path $cache '.forge-toolchain.json'
    if (!(Test-Path -LiteralPath $receipt) -or !(Test-Path -LiteralPath $probe)) {
        # Extract into a fresh owned directory; never erase a pre-existing tool cache recursively.
        if (Test-Path -LiteralPath $cache) { throw "Cache incompleto em $cache. Preserve ou mova-o antes de tentar novamente." }
        New-Item -ItemType Directory -Path $cache -Force | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $cache -Force
        if (!(Test-Path -LiteralPath $probe -PathType Leaf)) { throw "Arquivo esperado ausente em $Name" }
        $records = @(Get-ChildItem -LiteralPath $cache -Recurse -File | Where-Object { $_.Extension -in @('.exe','.dll','.a','.lib') } | ForEach-Object {
            [pscustomobject]@{ path=$_.FullName.Substring($cache.Length + 1); sha256=(Get-ForgeSha256 $_.FullName) }
        })
        [pscustomobject]@{ archiveSha256=$spec.sha256; files=$records } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $receipt -Encoding UTF8
    }
    $saved = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($saved.archiveSha256 -ne $spec.sha256) { throw "Cache de versao diferente: $Name" }
    foreach ($record in $saved.files) {
        $target = [IO.Path]::GetFullPath((Join-Path $cache $record.path))
        if (!$target.StartsWith($cache + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or (Get-ForgeSha256 $target) -ne $record.sha256) { throw "Arquivo alterado no cache de $Name; recusei executar a ferramenta." }
    }
    return $toolRoot
}

function Write-ForgeMetadata([object]$Context, [string]$Destination) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $assembly = @"
using System.Reflection;
[assembly: AssemblyTitle("RPForge")]
[assembly: AssemblyProduct("RPForge")]
[assembly: AssemblyCompany("RedHorn")]
[assembly: AssemblyCopyright("Copyright (c) 2026 Bianca de Castro")]
[assembly: AssemblyVersion("$($Context.Version)")]
[assembly: AssemblyFileVersion("$($Context.Version)")]
[assembly: AssemblyInformationalVersion("$($Context.Version)")]
[assembly: AssemblyMetadata("SourceRevisionId", "$($Context.Revision)")]
"@
    [IO.File]::WriteAllText((Join-Path $Destination 'AssemblyInfo.cs'), $assembly, (New-Object Text.UTF8Encoding $false))
    $resource = @"
#include <windows.h>
1 VERSIONINFO
 FILEVERSION $($Context.VersionComma)
 PRODUCTVERSION $($Context.VersionComma)
 FILEFLAGSMASK 0x3fL
 FILEFLAGS 0x0L
 FILEOS VOS_NT_WINDOWS32
 FILETYPE VFT_DLL
 FILESUBTYPE 0x0L
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904b0"
  BEGIN
   VALUE "CompanyName", "RedHorn\0"
   VALUE "FileDescription", "RPForge Explorer extension\0"
   VALUE "FileVersion", "$($Context.Version)\0"
   VALUE "InternalName", "ForgeShell\0"
   VALUE "LegalCopyright", "Copyright (c) 2026 Bianca de Castro\0"
   VALUE "OriginalFilename", "ForgeShell.dll\0"
   VALUE "ProductName", "RPForge\0"
   VALUE "ProductVersion", "$($Context.Version)\0"
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x0409, 1200
 END
END
"@
    [IO.File]::WriteAllText((Join-Path $Destination 'ForgeShell.rc'), $resource, (New-Object Text.UTF8Encoding $false))
}
