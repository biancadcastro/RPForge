param(
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,   # outside the repository
  [Parameter(Mandatory=$true)][string]$OracleLibrary,       # folder with CodeWalker.Core.dll (offline oracle)
  [string]$ExternalList = '',                               # optional: one .ycd path per line (read-only)
  [string]$EmoteList = '',                                  # optional: subset for the controlled re-encode
  [string]$SkeletonFiles = ''                               # optional: ';'-separated .skel paths
)
# Reproduces every animation-engine evidence step. Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$E = [IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Force -Path $E | Out-Null
function Step($name, [scriptblock]$body) { Write-Output "== $name"; & $body; if ($LASTEXITCODE -ne 0) { throw "$name failed ($LASTEXITCODE)" } }
Push-Location $repo
try {
  Step 'unit tests' { node --test tests/animation-engine.test.js tests/engine-proof.test.js tests/engine-proof-reread.test.js *> (Join-Path $E 'tests.log'); Get-Content (Join-Path $E 'tests.log') -Tail 8 }
  Step 'synthetic corpus' { node scripts/animation-engine/fixtures.mjs (Join-Path $E 'synthetic') }
  $list = Join-Path $E 'synthetic-list.txt'
  [IO.File]::WriteAllLines($list, [string[]](Get-ChildItem (Join-Path $E 'synthetic') -Filter *.ycd | ForEach-Object FullName))
  Step 'oracle: synthetic (read + re-save)' { powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/animation-engine/Invoke-YcdOracle.ps1 -ListFile $list -OutDirectory (Join-Path $E 'oracle-synthetic') -LibraryDirectory $OracleLibrary -Save 1 }
  Step 'compare: synthetic' { node scripts/animation-engine/compare-oracle.mjs (Join-Path $E 'oracle-synthetic') (Join-Path $E 'compare-synthetic.json') --expect-all }
  if ($ExternalList) {
    Step 'survey: external' { node scripts/animation-engine/survey.mjs $ExternalList (Join-Path $E 'survey-external.json') | Out-Null }
    Step 'oracle: external' { powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/animation-engine/Invoke-YcdOracle.ps1 -ListFile $ExternalList -OutDirectory (Join-Path $E 'oracle-external') -LibraryDirectory $OracleLibrary }
    Step 'compare: external' { node scripts/animation-engine/compare-oracle.mjs (Join-Path $E 'oracle-external') (Join-Path $E 'compare-external.json') }
  }
  if ($EmoteList) {
    Step 'reencode: emotes' { node scripts/animation-engine/reencode-corpus.mjs $EmoteList (Join-Path $E 'reencode') quantized }
    foreach ($k in 'sources','outputs') { Step "oracle: reencode $k" { powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/animation-engine/Invoke-YcdOracle.ps1 -ListFile (Join-Path $E "reencode\$k.txt") -OutDirectory (Join-Path $E "oracle-reencode-$k") -LibraryDirectory $OracleLibrary } }
    Step 'compare: reencode pairs (oracle on both sides)' { node scripts/animation-engine/compare-oracle-pair.mjs (Join-Path $E 'oracle-reencode-sources') (Join-Path $E 'oracle-reencode-outputs') (Join-Path $E 'compare-reencode.json') }
    if ($SkeletonFiles) {
      $skels = $SkeletonFiles.Split(';')
      Step 'skeleton relations' { node scripts/animation-engine/skeleton-check.mjs @skels -- $EmoteList (Join-Path $E 'skeleton-check.json') | Out-Null }
    }
  }
} finally { Pop-Location }
Write-Output "evidence -> $E"
