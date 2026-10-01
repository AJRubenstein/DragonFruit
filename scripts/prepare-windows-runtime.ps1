#Requires -Version 5.1
<#
.SYNOPSIS
Stages the pinned Microsoft x64 CRT for app-local deployment, without installing it.
.DESCRIPTION
Normal builds only use windows-runtime.json. -CheckForUpdate validates a candidate
from Microsoft's stable URL, then atomically updates only the pin if it is newer.
WiX dark extracts both the Burn bundle and MSI cabinets; no installer is executed.
#>
[CmdletBinding()]
param(
    [string]$ManifestPath = (Join-Path $PSScriptRoot 'windows-runtime.json'),
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../src-tauri/windows-resources/vc-runtime'),
    [switch]$CheckForUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Remove-TemporaryPath([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        try { Remove-Item -LiteralPath $Path -Recurse -Force }
        catch { Write-Warning "Could not remove temporary path ${Path}: $_" }
    }
}

function Assert-MicrosoftUrl([uri]$Uri) {
    if ($Uri.Scheme -ne 'https' -or $Uri.Host -ne 'download.visualstudio.microsoft.com' -or
        -not $Uri.IsDefaultPort -or $Uri.UserInfo -or $Uri.Query -or $Uri.Fragment -or
        $Uri.AbsolutePath -notmatch '^/download/pr/[0-9a-f-]+/[0-9a-f]+/VC_redist\.x64\.exe$') {
        throw "Expected an immutable Microsoft x64 redistributable URL, got: $Uri"
    }
}

function Receive-Download([uri]$Uri, [string]$Destination) {
    $client = [System.Net.Http.HttpClient]::new()
    $response = $null
    $stream = $null
    $file = $null
    try {
        $response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        [void]$response.EnsureSuccessStatusCode()
        $finalUri = $response.RequestMessage.RequestUri
        if ($finalUri.Scheme -ne 'https') {
            throw "Download redirected away from HTTPS: $finalUri"
        }
        $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $file = [System.IO.File]::Create($Destination)
        $stream.CopyTo($file)
        return $finalUri
    } finally {
        if ($null -ne $file) { $file.Dispose() }
        if ($null -ne $stream) { $stream.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
        $client.Dispose()
    }
}

function Assert-Sha256([string]$Path, [string]$Expected) {
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actual -ne $Expected) {
        throw "SHA-256 mismatch for ${Path}: expected $Expected, got $actual"
    }
}

function Assert-MicrosoftSignature([string]$Path) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or
        $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Microsoft Corporation') {
        throw "Expected a valid Microsoft Corporation Authenticode signature: $Path ($($signature.Status))"
    }
}

function Get-BinaryVersion([string]$Path) {
    $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
    return [version]('{0}.{1}.{2}.{3}' -f $info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
}

function Assert-X64Dll([string]$Path) {
    $reader = [System.IO.BinaryReader]::new([System.IO.File]::OpenRead($Path))
    try {
        if ($reader.BaseStream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5A4D) {
            throw "Not a PE binary: $Path"
        }
        $reader.BaseStream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        if ($peOffset -lt 64 -or $peOffset -gt ($reader.BaseStream.Length - 24)) {
            throw "Invalid PE header: $Path"
        }
        $reader.BaseStream.Position = $peOffset
        if ($reader.ReadUInt32() -ne 0x00004550 -or $reader.ReadUInt16() -ne 0x8664) {
            throw "Expected an x64 (AMD64) PE binary, not x86 or ARM64: $Path"
        }
        $reader.BaseStream.Position = $peOffset + 22
        if (($reader.ReadUInt16() -band 0x2000) -eq 0) {
            throw "Expected a DLL: $Path"
        }
    } finally {
        $reader.Dispose()
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Windows runtime preparation requires Windows (PowerShell 5.1 or 7).'
}
if ($env:TAURI_ENV_ARCH -and $env:TAURI_ENV_ARCH -notin @('x86_64', 'x64')) {
    throw "App-local CRT bundling supports x64 only, not TAURI_ENV_ARCH=$env:TAURI_ENV_ARCH"
}
foreach ($variable in @('CARGO_BUILD_TARGET', 'DF_BUILD_TARGET_TRIPLE')) {
    $target = [Environment]::GetEnvironmentVariable($variable)
    if ($target -and $target -ne 'x86_64-pc-windows-msvc') {
        throw "App-local CRT bundling requires x86_64-pc-windows-msvc, not ${variable}=$target"
    }
}
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ManifestPath = [System.IO.Path]::GetFullPath($ManifestPath)
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$pin = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($pin.version -notmatch '^14\.\d+\.\d+\.\d+$' -or $pin.sha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'The runtime manifest must contain a four-part VC14 version and a SHA-256 hash.'
}
$pinnedVersion = [version]$pin.version
Assert-MicrosoftUrl ([uri]$pin.url)

$wixUrl = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip'
$wixSha256 = '6AC824E1642D6F7277D0ED7EA09411A508F6116BA6FAE0AA5F2C7DAA2FF43D31'
# The complete VC14 CRT family, not MFC, UCRT, or the ARM64 payload also in the bundle.
$requiredDlls = @(
    'concrt140.dll',
    'msvcp140.dll',
    'msvcp140_1.dll',
    'msvcp140_2.dll',
    'msvcp140_atomic_wait.dll',
    'msvcp140_codecvt_ids.dll',
    'vcamp140.dll',
    'vccorlib140.dll',
    'vcomp140.dll',
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'vcruntime140_threads.dll'
)
$work = Join-Path ([System.IO.Path]::GetTempPath()) ('dragonfruit-vc-runtime-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $work)
try {
    $installer = Join-Path $work 'VC_redist.x64.exe'
    $downloadUrl = if ($CheckForUpdate) { 'https://aka.ms/vc14/vc_redist.x64.exe' } else { $pin.url }
    $finalUrl = Receive-Download ([uri]$downloadUrl) $installer
    Assert-MicrosoftUrl $finalUrl
    $sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
    if (-not $CheckForUpdate) { Assert-Sha256 $installer $pin.sha256 }
    Assert-MicrosoftSignature $installer
    $version = Get-BinaryVersion $installer
    if ($version.Major -ne 14) { throw "Expected a VC14 runtime, got $version" }
    if ($CheckForUpdate) {
        if ($version -le $pinnedVersion) {
            Write-Host "Microsoft runtime $version is not newer than pin $pinnedVersion; leaving pin and output unchanged."
            return
        }
    } elseif ($version -ne $pinnedVersion) {
        throw "Redistributable version $version does not match pin $pinnedVersion"
    }

    $wixArchive = Join-Path $work 'wix.zip'
    [void](Receive-Download ([uri]$wixUrl) $wixArchive)
    Assert-Sha256 $wixArchive $wixSha256
    $wixDirectory = Join-Path $work 'wix'
    Expand-Archive -LiteralPath $wixArchive -DestinationPath $wixDirectory
    $dark = Join-Path $wixDirectory 'dark.exe'
    $bundleDirectory = Join-Path $work 'bundle'
    & $dark -nologo $installer -x $bundleDirectory -o (Join-Path $work 'bundle.wxs')
    if ($LASTEXITCODE -ne 0) { throw "WiX bundle extraction failed with exit code $LASTEXITCODE" }

    $candidate = Join-Path $work 'candidate'
    [void](New-Item -ItemType Directory -Path $candidate)
    $copied = @{}
    # The minimum x64 MSI holds the entire CRT; the additional MSI contains MFC.
    $packageName = 'vc_runtimeMinimum_x64.msi'
    $packages = @(Get-ChildItem -LiteralPath $bundleDirectory -Recurse -File -Filter $packageName)
    if ($packages.Count -ne 1) { throw "Expected exactly one $packageName in the redistributable" }
    $packageDirectory = Join-Path $work 'minimum-x64'
    $wxsPath = "$packageDirectory.wxs"
    # dark reads the MSI cabinets directly: no /layout, /a, elevation, or machine installation.
    & $dark -nologo $packages[0].FullName $wxsPath -x $packageDirectory
    if ($LASTEXITCODE -ne 0) { throw "WiX extraction of $packageName failed with exit code $LASTEXITCODE" }
    $document = [System.Xml.XmlDocument]::new()
    $document.XmlResolver = $null
    $document.Load($wxsPath)
    $namespaces = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
    $namespaces.AddNamespace('w', 'http://schemas.microsoft.com/wix/2006/wi')
    foreach ($entry in $document.SelectNodes('//w:File', $namespaces)) {
        $name = $entry.GetAttribute('Name')
        if ($name -notmatch '^(concrt140|msvcp140(?:_[a-z0-9_]+)?|vcamp140|vccorlib140|vcomp140|vcruntime140(?:_[a-z0-9_]+)?)\.dll$') { continue }
        if ($copied.ContainsKey($name)) { throw "Duplicate CRT payload: $name" }
        $source = [System.IO.Path]::GetFullPath($entry.GetAttribute('Source'))
        if (-not $source.StartsWith($packageDirectory + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw "CRT source escaped its extraction directory: $source"
        }
        $destination = Join-Path $candidate $name
        Copy-Item -LiteralPath $source -Destination $destination
        Assert-X64Dll $destination
        Assert-MicrosoftSignature $destination
        $copied[$name] = $true
    }
    foreach ($name in $requiredDlls) {
        if (-not $copied.ContainsKey($name)) { throw "Required x64 CRT payload is missing: $name" }
    }
    $crtVersion = Get-BinaryVersion (Join-Path $candidate 'msvcp140.dll')
    if ($crtVersion -ne $version) { throw "MSVCP140 version $crtVersion does not match redistributable $version" }

    if ($CheckForUpdate) {
        $newPin = [ordered]@{ version = $version.ToString(); url = $finalUrl.AbsoluteUri; sha256 = $sha256 }
        $temporaryManifest = "$ManifestPath.$([guid]::NewGuid().ToString('N')).tmp"
        try {
            [System.IO.File]::WriteAllText($temporaryManifest, (($newPin | ConvertTo-Json) + "`n"), [System.Text.UTF8Encoding]::new($false))
            [System.IO.File]::Replace($temporaryManifest, $ManifestPath, $null)
        } finally {
            Remove-TemporaryPath $temporaryManifest
        }
        Write-Host "Updated runtime pin from $pinnedVersion to verified $version ($sha256). Output directory is unchanged."
    } else {
        # Prepare a sibling first, then replace the old stage with rollback on a failed rename.
        $parent = Split-Path -Parent $OutputDirectory
        [void](New-Item -ItemType Directory -Path $parent -Force)
        $next = "$OutputDirectory.$([guid]::NewGuid().ToString('N')).new"
        $backup = "$OutputDirectory.$([guid]::NewGuid().ToString('N')).old"
        try {
            Copy-Item -LiteralPath $candidate -Destination $next -Recurse
            if (Test-Path -LiteralPath $OutputDirectory) { [System.IO.Directory]::Move($OutputDirectory, $backup) }
            try {
                [System.IO.Directory]::Move($next, $OutputDirectory)
            } catch {
                if (Test-Path -LiteralPath $backup) { [System.IO.Directory]::Move($backup, $OutputDirectory) }
                throw
            }
        } finally {
            Remove-TemporaryPath $next
        }
        Remove-TemporaryPath $backup
        Write-Host "Staged $($copied.Count) verified x64 CRT DLLs ($version) in $OutputDirectory"
    }
} finally {
    Remove-TemporaryPath $work
}
