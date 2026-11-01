param([Parameter(Mandatory=$true)][string]$LibraryDirectory)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root '.tools/ytyp-interop'
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
foreach ($name in @('SharpDX.dll','SharpDX.Mathematics.dll','CodeWalker.Core.dll')) { [Reflection.Assembly]::LoadFrom((Join-Path $LibraryDirectory $name)) | Out-Null }
Push-Location $root
try {
    & node.exe --input-type=module -e "import{buildYtyp}from'./src/ytyp.js';import{writeFileSync}from'node:fs';import path from'node:path';for(const count of[1,2,256]){const models=Array.from({length:count},(_,i)=>({name:'own_fixture_'+i,min:[-1,-2,-3],max:[1,2,3],center:[0,0,0],radius:4}));writeFileSync(path.join(process.argv[1],count+'.ytyp'),buildYtyp(models,'test_'+count));}" $fixture
    if($LASTEXITCODE -ne 0) { throw 'Generator failed.' }
    foreach($count in @(1,2,256)) {
        $parsed = New-Object CodeWalker.GameFiles.YtypFile
        $parsed.Load([IO.File]::ReadAllBytes((Join-Path $fixture ($count.ToString()+'.ytyp'))))
        if($parsed.AllArchetypes.Count -ne $count) { throw 'Wrong archetype count.' }
        foreach($arch in $parsed.AllArchetypes) {
            if($arch.BBMin.X -ne -1 -or $arch.BBMax.Z -ne 3 -or $arch.BSRadius -ne 4 -or $arch._BaseArchetypeDef.assetType.ToString() -ne 'ASSET_TYPE_DRAWABLE') { throw 'Geometry metadata did not round trip.' }
        }
    }
    Write-Output 'PASS: independent binary reader accepted 1, 2 and 256 archetypes with correct bounds and asset types.'
} finally { Pop-Location }
