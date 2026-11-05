$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'windows\ModernMenu-Lifecycle.ps1')
function Assert($condition, $message) { if (!$condition) { throw $message } }
function Get-ItemProperty {
    param($LiteralPath, $ErrorAction)
    if ($LiteralPath -eq 'mock:missing') { return $null }
    return [pscustomobject]@{ MenuOwner = 'C:\Legacy' }
}
try {
    Assert ($null -eq (Get-ForgeOptionalMenuProperty 'mock:missing' 'MenuOwner')) 'Missing registry key must be optional'
    Assert ($null -eq (Get-ForgeOptionalMenuProperty 'mock:legacy' 'MenuPackage')) 'Legacy missing property must be optional'
    Assert ((Get-ForgeOptionalMenuProperty 'mock:legacy' 'MenuOwner') -eq 'C:\Legacy') 'Existing owner must be preserved'
    Write-Host 'PASS: optional registry properties, including legacy missing MenuPackage.'
} finally { Remove-Item -LiteralPath Function:\Get-ItemProperty }
Assert (Test-ForgeMenuOwnership 'C:\RPForge' 'c:\rpforge') 'Case insensitive owner check failed'
Assert (!(Test-ForgeMenuOwnership '' 'C:\RPForge')) 'Missing ownership must preserve package'
Assert (!(Test-ForgeMenuOwnership 'C:\RPForgeOther' 'C:\RPForge')) 'Another copy must preserve package'
foreach ($failNew in @($false,$true)) {
    $locationEvents = New-Object 'Collections.Generic.List[string]'
    $failed = $false
    try {
        Invoke-ForgeMenuLocationChange -RemovePrevious { $locationEvents.Add('remove') } -RegisterNew {
            $locationEvents.Add('register'); if ($failNew) { throw 'Simulated registration failure' }
        } -RestorePrevious { $locationEvents.Add('restore') }
    } catch { $failed = $true }
    Assert ($failed -eq $failNew) 'Location migration must propagate failure'
    $expected = if ($failNew) { 'remove,register,restore' } else { 'remove,register' }
    Assert (($locationEvents -join ',') -eq $expected) 'Location migration rollback order incorrect'
}
Write-Host 'PASS: location migration succeeds or restores the previous registration on failure.'
foreach ($scenario in @('success','register-fails','pending','other-owner','remove-fails','local-update')) {
    $state = @{ events = New-Object 'Collections.Generic.List[string]'; scenario=$scenario; owners=@{ 'RedHorn.RPFForge.Local'='C:\RPForge' } }
    if ($scenario -eq 'other-owner') { $state.owners['RedHorn.RPFForge.Local']='C:\OtherCopy' }
    $failed = $false
    $target = if ($scenario -eq 'local-update') { 'RedHorn.RPFForge.Local' } else { 'RedHorn.RPFForge' }
    try {
        Invoke-ForgeMenuTransition -Identity $target -Root 'C:\RPForge' -Register {
            $state.events.Add('register'); if ($state.scenario -eq 'register-fails') { throw 'registration failed' }
        }.GetNewClosure() -FindPackage {
            param($name)
            $state.events.Add('find:'+$name)
            return [pscustomobject]@{ Name=$name; Status=$(if ($state.scenario -eq 'pending' -and $name -eq 'RedHorn.RPFForge') { 'Pending' } else { 'Ok' }) }
        }.GetNewClosure() -ReadOwner { param($name) return $state.owners[$name] }.GetNewClosure() -SaveOwner {
            param($name,$location) $state.events.Add('save:'+$name); $state.owners[$name]=$location
        }.GetNewClosure() -RemovePackage {
            param($package) $state.events.Add('remove:'+$package.Name); if ($state.scenario -eq 'remove-fails') { throw 'remove failed' }
        }.GetNewClosure()
    } catch { $failed = $true }
    Assert ($failed -eq ($scenario -in @('register-fails','pending','remove-fails'))) "Unexpected outcome: $scenario"
    $removed = $state.events.Contains('remove:RedHorn.RPFForge.Local')
    Assert ($removed -eq ($scenario -in @('success','remove-fails'))) "Unsafe legacy removal: $scenario"
    if ($removed) { Assert ($state.events.IndexOf('save:RedHorn.RPFForge') -lt $state.events.IndexOf('remove:RedHorn.RPFForge.Local')) 'Legacy removed before new ownership confirmed' }
    if ($scenario -in @('register-fails','pending')) { Assert (!$state.owners.ContainsKey('RedHorn.RPFForge')) 'Failed registration changed owner' }
    Assert ($state.owners['RedHorn.RPFForge.Local'] -eq $(if ($scenario -eq 'other-owner') {'C:\OtherCopy'} else {'C:\RPForge'})) 'Legacy owner changed'
    Write-Host "PASS: $scenario"
}
Write-Host 'PASS: migration tests used simulated callbacks only; Appx, registry and user files were not modified.'

# Parse package identities using synthetic ZIPs, not installed Windows packages.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('rpforge-identity-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
    foreach ($name in @('RedHorn.RPFForge.Local','RedHorn.RPFForge','Unrelated.App')) {
        $archive = Join-Path $fixture ($name + '.msix')
        $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
        try { $writer = New-Object IO.StreamWriter($zip.CreateEntry('AppxManifest.xml').Open()); try { $writer.Write('<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"><Identity Name="' + $name + '" /></Package>') } finally { $writer.Dispose() } } finally { $zip.Dispose() }
        $rejected = $false
        try { $parsed = Get-ForgeMenuIdentity $archive } catch { $rejected = $true }
        if ($name -eq 'Unrelated.App') { Assert $rejected 'Unrelated package accepted' }
        else { Assert (!$rejected -and $parsed -eq $name) 'RPForge package identity not parsed' }
    }
    Write-Host 'PASS: production/local identities parsed; unrelated packages rejected.'
} finally {
    # Only this exact newly-created temporary directory is eligible for cleanup.
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolved = [IO.Path]::GetFullPath($fixture)
    if (!$resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'rpforge-identity-test-*') { throw 'Unsafe test cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
