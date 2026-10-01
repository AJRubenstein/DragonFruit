#Requires -Version 5.1
# Shared by build-time pin tooling and the verifier embedded in the NSIS installer.

function Assert-DfVcUrl([uri]$Uri) {
    $pathPattern = '^/download/pr/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(?:[0-9a-f]{32}|[0-9a-f]{64})/VC_redist\.x64\.exe$'
    if ($null -eq $Uri -or -not $Uri.IsAbsoluteUri -or
        $Uri.Scheme -ne 'https' -or $Uri.Host -ne 'download.visualstudio.microsoft.com' -or
        -not $Uri.IsDefaultPort -or $Uri.UserInfo -or $Uri.Query -or $Uri.Fragment -or
        $Uri.AbsolutePath -notmatch $pathPattern) {
        throw "Expected an immutable Microsoft x64 redistributable URL, got: $Uri"
    }
}

function ConvertTo-DfVcVersion([string]$Value) {
    if ($Value -cnotmatch '^14\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\.(0|[1-9][0-9]{0,4})\z') {
        throw "Expected a canonical four-part VC14 version, got: $Value"
    }
    $version = [version]$Value
    if ($version.Minor -gt 65535 -or $version.Build -gt 65535 -or $version.Revision -gt 65535) {
        throw "Runtime version components must fit Windows file-version fields: $Value"
    }
    return $version
}

function Read-DfVcManifest([string]$Path) {
    $pin = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($null -eq $pin -or $pin -isnot [System.Management.Automation.PSCustomObject]) {
        throw 'The runtime manifest must be a JSON object.'
    }
    foreach ($name in @('version', 'url', 'sha256')) {
        $property = $pin.PSObject.Properties[$name]
        if ($null -eq $property -or $property.Value -isnot [string]) {
            throw "The runtime manifest must contain a string '$name'."
        }
    }
    [void](ConvertTo-DfVcVersion $pin.version)
    Assert-DfVcUrl ([uri]$pin.url)
    if ($pin.sha256 -cnotmatch '^[0-9a-fA-F]{64}\z') {
        throw 'The runtime manifest must contain a SHA-256 hash with exactly 64 hexadecimal digits.'
    }
    return $pin
}

function Get-DfVcBinaryVersion([string]$Path) {
    $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    return ConvertTo-DfVcVersion ('{0}.{1}.{2}.{3}' -f $info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
}

function Assert-DfVcInstaller([string]$Path, [object]$Pin) {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Microsoft installer verification requires Windows (PowerShell 5.1 or 7).'
    }
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actualHash -ne $Pin.sha256) {
        throw "SHA-256 mismatch for ${Path}: expected $($Pin.sha256), got $actualHash"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    $signer = if ($null -ne $signature.SignerCertificate) {
        $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
    } else { '<none>' }
    # Only the corporate signer is accepted: this is the official EXE, not a CRT DLL.
    if ($signature.Status -ne 'Valid' -or $signer -cne 'Microsoft Corporation') {
        throw "Expected a valid Microsoft Corporation Authenticode signature: $Path (status=$($signature.Status), signer=$signer)"
    }
    $actualVersion = Get-DfVcBinaryVersion $Path
    $expectedVersion = ConvertTo-DfVcVersion $Pin.version
    if ($actualVersion -ne $expectedVersion) {
        throw "Redistributable version $actualVersion does not match pin $expectedVersion"
    }
}
