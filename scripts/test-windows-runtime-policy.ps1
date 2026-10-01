#Requires -Version 5.1
# Pure metadata/security boundaries, runnable on PowerShell 5.1 and 7 without installs.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-runtime-common.ps1')

function Assert-Rejected([scriptblock]$Operation, [string]$Case) {
    $rejected = $false
    try { & $Operation | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Unsafe runtime metadata was accepted: $Case" }
}

$pin = Read-DfVcManifest (Join-Path $PSScriptRoot 'windows-runtime.json')
foreach ($value in @('14.51.36247.0', '14.100.65535.65535')) {
    $parsed = ConvertTo-DfVcVersion $value
    if ($parsed -isnot [version]) { throw 'Runtime comparisons must use numeric versions, not strings.' }
}
if ((ConvertTo-DfVcVersion '14.100.0.0') -le (ConvertTo-DfVcVersion '14.51.65535.0')) {
    throw 'Runtime versions were compared lexicographically.'
}
foreach ($value in @('14.51.36247', '14.51.36247.00', '14.51.65536.0', '15.0.0.0', "14.51.36247.0`n", '14.51.36247.0" ?>')) {
    Assert-Rejected { ConvertTo-DfVcVersion $value } "version $value"
}
foreach ($url in @(
    $pin.url.Replace('https:', 'http:'),
    $pin.url.Replace('download.visualstudio.microsoft.com', 'download.visualstudio.microsoft.com.evil.example'),
    $pin.url.Replace('https://', 'https://user@'),
    $pin.url.Replace('.com/', '.com:8443/'),
    ($pin.url + '?mutable=1'),
    ($pin.url + '#fragment'),
    $pin.url.Replace('VC_redist.x64.exe', 'VC_redist.x86.exe')
)) {
    Assert-Rejected { Assert-DfVcUrl ([uri]$url) } "URL $url"
}
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('dragonfruit-pin-policy-' + [guid]::NewGuid().ToString('N') + '.json')
try {
    foreach ($bad in @('[]', 'null', '{"version":14}', ($pin | Select-Object version, url | ConvertTo-Json))) {
        [IO.File]::WriteAllText($temporary, $bad)
        Assert-Rejected { Read-DfVcManifest $temporary } 'missing or incorrectly typed pin fields'
    }
    $pin.sha256 = 'not-a-sha256'
    [IO.File]::WriteAllText($temporary, ($pin | ConvertTo-Json))
    Assert-Rejected { Read-DfVcManifest $temporary } 'invalid installer checksum'
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
Write-Host 'Runtime policy checks passed: numeric version boundaries, immutable Microsoft x64 URLs, and manifest validation.'
