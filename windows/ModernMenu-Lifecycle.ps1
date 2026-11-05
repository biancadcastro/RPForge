# The callbacks keep migration tests independent from Appx and the real registry.
function Get-ForgeOptionalMenuProperty {
    param([string]$LiteralPath, [string]$Name)
    $properties = Get-ItemProperty -LiteralPath $LiteralPath -ErrorAction SilentlyContinue
    if ($properties) {
        $property = $properties.PSObject.Properties[$Name]
        if ($property) { return $property.Value }
    }
    return $null
}

function Test-ForgeMenuOwnership {
    param([string]$Owner, [string]$Root)
    return !!($Owner -and $Root -and [string]::Equals($Owner, $Root, [StringComparison]::OrdinalIgnoreCase))
}

function Invoke-ForgeMenuLocationChange {
    param([scriptblock]$RemovePrevious, [scriptblock]$RegisterNew, [scriptblock]$RestorePrevious)
    & $RemovePrevious
    try { & $RegisterNew }
    catch {
        $registrationError = $_
        try { & $RestorePrevious }
        catch { throw 'Registro novo e restauracao do menu anterior falharam. Preserve as duas instalacoes para recuperacao.' }
        throw $registrationError
    }
}

function Invoke-ForgeMenuTransition {
    param([string]$Identity, [string]$Root, [scriptblock]$Register,
        [scriptblock]$FindPackage, [scriptblock]$ReadOwner,
        [scriptblock]$SaveOwner, [scriptblock]$RemovePackage)
    if ($Identity -notin @('RedHorn.RPFForge.Local','RedHorn.RPFForge')) { throw 'Identidade de menu desconhecida.' }
    & $Register
    $active = & $FindPackage $Identity
    if (!$active -or $active.Status -ne 'Ok') { throw 'Registro novo nao confirmado; identidade anterior preservada.' }
    & $SaveOwner $Identity $Root
    # Never remove the old identity until the new one is usable. Other copies win.
    if ($Identity -eq 'RedHorn.RPFForge') {
        $legacyOwner = & $ReadOwner 'RedHorn.RPFForge.Local'
        if (Test-ForgeMenuOwnership $legacyOwner $Root) {
            $legacy = & $FindPackage 'RedHorn.RPFForge.Local'
            if ($legacy) { & $RemovePackage $legacy }
        }
    }
}

function Get-ForgeMenuIdentity {
    param([string]$PackagePath)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $zip.GetEntry('AppxManifest.xml')
        if (!$entry -or $entry.Length -gt 1MB) { throw 'Manifesto da identidade ausente ou invalido.' }
        $reader = New-Object IO.StreamReader($entry.Open())
        try { $settings = New-Object Xml.XmlReaderSettings; $settings.DtdProcessing = 'Prohibit'; $settings.XmlResolver = $null
            $xmlReader = [Xml.XmlReader]::Create($reader, $settings)
            try { $xml = New-Object Xml.XmlDocument; $xml.XmlResolver = $null; $xml.Load($xmlReader) } finally { $xmlReader.Dispose() }
        } finally { $reader.Dispose() }
        $name = [string]$xml.DocumentElement.Identity.Name
        if ($name -notin @('RedHorn.RPFForge.Local','RedHorn.RPFForge')) { throw 'Pacote nao pertence ao RPForge.' }
        return $name
    } finally { $zip.Dispose() }
}
