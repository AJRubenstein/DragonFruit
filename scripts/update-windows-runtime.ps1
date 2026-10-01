#Requires -Version 5.1
<#
.SYNOPSIS
Validates the pinned Microsoft installer or proposes a verified newer runtime pin.
.DESCRIPTION
-Check downloads and verifies the existing pin without changing it. Without
-Check, discovery follows Microsoft's official latest-x64 URL and updates only
windows-runtime.json when the validated installer has a newer VC14 version.
No installer is executed and all downloaded files are deleted before returning.
#>
[CmdletBinding()]
param(
    [string]$ManifestPath = (Join-Path $PSScriptRoot 'windows-runtime.json'),
    [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-runtime-common.ps1')

function Receive-DfVcInstaller([uri]$Uri, [string]$Destination) {
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $client = [System.Net.Http.HttpClient]::new($handler)
    try {
        # Check every redirect, including on Windows PowerShell's .NET Framework.
        for ($redirects = 0; $redirects -le 10; $redirects++) {
            if ($Uri.Scheme -ne 'https') { throw "Refusing a non-HTTPS download: $Uri" }
            $response = $null
            $stream = $null
            $file = $null
            try {
                $response = $client.GetAsync($Uri, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
                if ([int]$response.StatusCode -in @(301, 302, 303, 307, 308)) {
                    if ($null -eq $response.Headers.Location) { throw "Download redirect has no Location: $Uri" }
                    $Uri = [uri]::new($Uri, $response.Headers.Location)
                    continue
                }
                [void]$response.EnsureSuccessStatusCode()
                Assert-DfVcUrl $Uri
                $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
                $file = [System.IO.File]::Create($Destination)
                $stream.CopyTo($file)
                return $Uri
            } finally {
                if ($null -ne $file) { $file.Dispose() }
                if ($null -ne $stream) { $stream.Dispose() }
                if ($null -ne $response) { $response.Dispose() }
            }
        }
        throw 'Too many redirects from the Microsoft redistributable download.'
    } finally {
        $client.Dispose()
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Runtime pin validation and updates require Windows (PowerShell 5.1 or 7).'
}
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ManifestPath = (Resolve-Path -LiteralPath $ManifestPath).ProviderPath
$pin = Read-DfVcManifest $ManifestPath
$work = Join-Path ([System.IO.Path]::GetTempPath()) ('dragonfruit-vc-prerequisite-' + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $work)
$temporaryManifest = "$ManifestPath.$([guid]::NewGuid().ToString('N')).tmp"
try {
    $installer = Join-Path $work 'VC_redist.x64.exe'
    $downloadUrl = if ($Check) { $pin.url } else { 'https://aka.ms/vc14/vc_redist.x64.exe' }
    $finalUrl = Receive-DfVcInstaller ([uri]$downloadUrl) $installer
    if ($Check) {
        Assert-DfVcInstaller $installer $pin
        Write-Host "Pinned Microsoft x64 runtime $($pin.version) verified; manifest unchanged."
        return
    }

    $version = Get-DfVcBinaryVersion $installer
    $candidate = [ordered]@{
        version = $version.ToString()
        url = $finalUrl.AbsoluteUri
        sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
    }
    Assert-DfVcInstaller $installer $candidate
    $pinnedVersion = ConvertTo-DfVcVersion $pin.version
    if ($version -le $pinnedVersion) {
        Write-Host "Verified Microsoft runtime $version is not newer than pin $pinnedVersion; manifest unchanged."
        return
    }

    # Replace only the pin, and only after complete download/signature/version validation.
    [System.IO.File]::WriteAllText($temporaryManifest, (($candidate | ConvertTo-Json) + "`n"), [System.Text.UTF8Encoding]::new($false))
    [void](Read-DfVcManifest $temporaryManifest)
    [System.IO.File]::Replace($temporaryManifest, $ManifestPath, $null)
    Write-Host "Updated runtime pin from $pinnedVersion to verified $version ($($candidate.sha256))."
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force
    if (Test-Path -LiteralPath $temporaryManifest) { Remove-Item -LiteralPath $temporaryManifest -Force }
}
