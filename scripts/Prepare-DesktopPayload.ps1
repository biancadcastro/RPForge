param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Destination = [IO.Path]::GetFullPath($Destination)
$allowed = @((Join-Path $root '.tools'), (Join-Path $root 'packaging-stage'))
if (!($allowed | Where-Object { $Destination.StartsWith($_ + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) })) { throw 'Destino de payload fora das areas de preparacao.' }
if (Test-Path -LiteralPath $Destination) { throw 'Use um destino novo para preservar o payload anterior.' }
$project = Join-Path $root 'desktop-web'
$runtime = Join-Path $project 'node_modules\electron\dist'
foreach ($required in @((Join-Path $project 'out\index.html'), (Join-Path $project 'electron\main.mjs'), (Join-Path $runtime 'electron.exe'), (Join-Path $runtime 'LICENSE'), (Join-Path $runtime 'LICENSES.chromium.html'))) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Arquivo necessario ao desktop ausente: $required" }
}
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'electron') -Destination $Destination -Recurse
Copy-Item -LiteralPath (Join-Path $project 'out') -Destination $Destination -Recurse
New-Item -ItemType Directory -Path (Join-Path $Destination 'public') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'public\rpforge.ico') -Destination (Join-Path $Destination 'public\rpforge.ico')
$runtimeParent = Join-Path $Destination 'node_modules\electron'
New-Item -ItemType Directory -Path $runtimeParent -Force | Out-Null
Copy-Item -LiteralPath $runtime -Destination $runtimeParent -Recurse
$package = Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json
$metadata = @{ name=$package.name; version=$package.version; private=$true; type='module'; main='electron/main.mjs' }
[IO.File]::WriteAllText((Join-Path $Destination 'package.json'), ($metadata | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
$licenses = Join-Path $Destination 'licenses'
New-Item -ItemType Directory -Path $licenses -Force | Out-Null
foreach ($item in @(
    @('node_modules\next\license.md','Next.js-LICENSE.txt'),
    @('node_modules\react\LICENSE','React-LICENSE.txt'),
    @('node_modules\react-dom\LICENSE','React-DOM-LICENSE.txt'),
    @('node_modules\three\LICENSE','Three.js-LICENSE.txt'),
    @('public\fonts\OFL.txt','Pixelify-Sans-OFL.txt'),
    @('public\fonts\Atkinson-OFL.txt','Atkinson-Hyperlegible-OFL.txt')
)) { Copy-Item -LiteralPath (Join-Path $project $item[0]) -Destination (Join-Path $licenses $item[1]) }
Copy-Item -LiteralPath (Join-Path $root 'THIRD_PARTY_NOTICES.md') -Destination $licenses
Write-Host "Desktop autocontido preparado: $Destination"
